(function () {
    'use strict';

    const
        _            = require('lodash'),
        turf         = require('turf'),
        knex         = require('knex'),
        neo4jManager = require('./neo4j_manager'),
        wkt          = require('terraformer-wkt-parser'),
        async        = require('async'),
        node_uuid    = require('uuid'),
        utils        = require('./utils');

    _.mixin(require('lodash-uuid'));


    module.exports = function (config) {

        let
            db,
            pg,
            es;

        db = new neo4jManager({
            host: 'localhost'
        });

        if (config.pg) {
            pg = knex({
                client: 'pg',
                connection: config.pg
            });
        }

        if (config.elasticsearch) {
            es = new elasticsearch.Client(config.elasticsearch)
        }

        this.pg = pg;
        this.db = db;
        this.es = es;

        function _isGeoJSON(object) {
            return object && object.type == 'Feature' &&
                _.isObject(object.geometry) &&
                _.isString(object.geometry.type) &&
                _.isArray(object.geometry.coordinates);
        }

        function _isArrayOfPrimitives(array) {
            return array && !_.isEmpty(array) && _.isArray(array) && _.every(array, (value) => {
                    return !_.isObject(value) && !_.isUuid(value);
                });
        }

        function _executeStatement(query, transaction, callback) {
            db.query(query.statement, query.parameters, transaction, callback);
        }

        function _getNeo4jNode(node) {
            return _.chain(node)
                    .keys()
                    .reject((key) => _isGeoJSON(node[key]) || (_.isArray(node[key]) && !_isArrayOfPrimitives(node[key]))
                    || _.isObject(node[key]) || key == '_label')
                    .transform((result, next) => result[next] = node[next], {})
                    .value()
        }

        function _isNeo4jNode(node) {
            return _.isObject(node) && !_.isArray(node) && !_isGeoJSON(node);
        }

        function _getMatchQuery(node, id, params, options = {}) {

            let cypher = `\nMATCH (${id} {uuid: $${id}.uuid})`
            if (options.update) {
                let update = _.chain(node)
                              .keys()
                              .map((key) => `${id}.${key} = $${id}.${key}`)
                              .value();

                if (update.length) {
                    cypher += ' SET ' + update.join(', ')
                }

                params[id] = node;
            }

            return cypher;
        }

        function _createRelationshipCypher(value, key, id, statement, relatedNodes, options) {
            if (_isNeo4jNode(value)) {
                let
                    uuid        = node_uuid.v4(),
                    relatedId   = utils.getUniqueIdentifier(),
                    relatedNode = _getNeo4jNode(value);

                if (_.isUuid(relatedNode.uuid)) {
                    statement.cypher += `\nWITH ${id}`;
                    statement.cypher += _getMatchQuery(relatedNode, relatedId, statement.params, options);
                    statement.cypher += `\nCREATE UNIQUE (${id})-[:${key}]->(${relatedId})`;
                } else {
                    value.uuid = uuid

                    relatedNode.uuid = uuid;

                    if (value._label) {
                        let label = value._label.split(/\s/)[0]
                        statement.cypher += `\nCREATE UNIQUE (${id})-[:${key}]->(${relatedId}:${label} $${relatedId})`
                    } else {
                        statement.cypher += `\nCREATE UNIQUE (${id})-[:${key}]->(${relatedId} $${relatedId})`;
                    }

                    statement.params[relatedId] = relatedNode;
                }

                relatedNodes[relatedId] = value;
            }
        }

        function _getCypherRecursive(id, node, statement, options) {

            let relatedNodes = {};

            _.chain(node)
             .keys()
             .each((key) => {
                 let value = node[key];

                 if (_.isArray(value)) {
                     _.each(value, (item) => _createRelationshipCypher(item, key, id, statement, relatedNodes, options));
                 } else {
                     _createRelationshipCypher(value, key, id, statement, relatedNodes, options)
                 }
             })
             .value();

            _.chain(relatedNodes)
             .keys()
             .each((key) => _getCypherRecursive(key, relatedNodes[key], statement, options))
             .value();

            return statement;
        }

        function _getCypher(graph, options) {
            let
                id        = utils.getUniqueIdentifier(),
                uuid      = node_uuid.v4(),
                node      = _getNeo4jNode(graph),
                statement = {
                    start: uuid,
                    params: {}
                };

            if (_.isUuid(graph.uuid)) {
                statement.cypher = _getMatchQuery(node, id, statement.params, options)
            } else {
                graph.uuid = uuid;

                if (graph._label) {
                    let label        = graph._label.split(/\s/)[0];
                    statement.cypher = `CREATE (${id}:${label} $${id})`;
                } else {
                    statement.cypher = `CREATE (${id} $${id})`;

                }

                statement.params[id]      = node;
                statement.params[id].uuid = uuid;
            }

            _getCypherRecursive(id, graph, statement, options);

            return statement;
        }

        function _paginate(queryObject = {}) {
            let cypher = '\n';

            if (queryObject._skip) {
                cypher += `SKIP ${queryObject._skip}\n`
            }

            if (queryObject._take) {
                cypher += `LIMIT ${queryObject._take}\n`
            }

            return cypher;
        }

        function _getRelationshipIdentifer(relationship, variables) {
            let identifies = utils.getUniqueIdentifier();

            variables.push(identifies);

            return `${identifies}:${relationship.split('-').join('|')}`;
        }

        function _addMatchRelationship(start, relationshipString, statements) {
            let isOptional    = _.includes(relationshipString, '?'),
                relationships = relationshipString.split('.');

            _.each(relationships, (relationship) => {
                let end = utils.getUniqueIdentifier(),
                    isOptional    = _.startsWith(relationship, '?');

                statements.variables.push(end)

                if (isOptional) {
                    relationship = relationship.substring(1);
                    statements.cypher += `\n OPTIONAL MATCH (${start})`;
                } else {
                    statements.cypher += `\n MATCH (${start})`;
                }

                statements.cypher += `-[${_getRelationshipIdentifer(relationship, statements.variables)}]->(${end})`

                if (isOptional) {
                    statements.cypher += ` WITH ${statements.variables.join(',')}`
                }

                start = end;
            });
        }

        function _matchRelationships(startVariable, queryObject = {}, statements = {cypher: '', variables: []}) {
            _.each(queryObject._relations, (path) => _addMatchRelationship(startVariable, path, statements));

            return statements;
        }

        function _listCypher(queryObject = {}) {
            let
                statement = {
                    cypher: '',
                    variables: []
                },
                start     = utils.getUniqueIdentifier();

            statement.variables.push(start);

            let matchRelationshipsStatement = _matchRelationships(start, queryObject, statement);

            statement.cypher = `MATCH (${start}:${queryObject._label}) WITH ${start}\n` +
                `${matchRelationshipsStatement.cypher}\n` +
                `RETURN ${statement.variables.join(',')}`;

            return statement.cypher;
        }

        function _order(queryObject = {}) {
            let cypher = '';

            if (queryObject._order) {

            }
        }

        function _getSql(graph, statements) {
            statements = statements || [];

            if (_isNeo4jNode(graph)) {
                _.chain(graph)
                 .keys()
                 .each((key) => {
                     let value     = graph[key],
                         statement = {};

                     if (_isGeoJSON(value)) {
                         statement.sql    = 'INSERT INTO geometries (node_uuid, node_key, node_geometry)\n';
                         statement.sql += 'values ( :uuid, :key, :geometry) ON CONFLICT ON CONSTRAINT uuid_key_unique\n'
                         statement.sql += 'DO UPDATE SET node_geometry = :geometry'
                         statement.params = {
                             uuid: graph.uuid,
                             key: key,
                             geometry: wkt.convert(value.geometry)
                         }

                         statements.push(statement);
                     } else if (_.isArray(value)) {
                         _.each(value, (item) => _getSql(item, statements));
                     } else if (!value) {
                         statement.sql    = 'DELETE FROM geometries where node_uuid = :uuid and node_key = :key'
                         statement.params = {
                             uuid: graph.uuid,
                             key: key
                         }

                         statements.push(statement);
                     } else {
                         _getSql(value, statements)
                     }
                 })
                 .value();
            }

            return statements;
        }

        function _get(neo4jStatement, queryObject, callback) {
            if (typeof queryObject == 'function' && !callback) {
                callback = queryObject
            }

            let tasks = [
                (callback) =>
                    db.query(neo4jStatement.cypher, neo4jStatement.params, (err, result) => callback(err, _flattenResult(result)))
            ];

            if (pg) {
                tasks.push(
                    (nodes, callback) => {
                        pg('geometries')
                            .whereIn('node_uuid', _.chain(nodes)
                                                   .filter((item) => item.constructor.name == 'Node')
                                                   .map('properties.uuid')
                                                   .value())
                            .select('node_uuid', 'node_key', 'properties',
                                pg.raw('ST_AsGeoJSON(node_geometry)::json as node_geometry'))
                            .asCallback((err, geometries) => callback(err, nodes, geometries))

                    }
                )
            }

            async.waterfall(tasks, function (err, nodes, geometries) {
                if (err) {
                    callback(err);
                } else {
                    callback(null, _parseResult(nodes, geometries, queryObject));
                }
            });
        }

        function _parseResult(nodes, geometries, queryObject) {

            let
                indexedNodes      = {},
                indexedGeometries = _.groupBy(geometries, 'node_uuid'),
                hasRelationships  = _.some(nodes, (node) => node.constructor.name == 'Relationship');

            let result = _.transform(nodes, function (accumulator, item) {

                if (item.constructor.name == 'Node') {
                    let json = item.properties;

                    indexedNodes[item.identity.low] = json;

                    let relationships = _.chain(nodes)
                                         .filter((n) => n.constructor.name == 'Relationship' &&
                                         n.start.equals(item.identity))
                                         .groupBy('type')
                                         .value();

                    let relationshipKeys = _.keys(relationships);

                    _.each(relationshipKeys, (relationshipName) => {
                        json[relationshipName] = _.chain(relationships[relationshipName])
                                                  .map((r) => {

                                                      if (indexedNodes[r.end.low]) {
                                                          return indexedNodes[r.end.low];
                                                      }

                                                      let node = _.find(nodes, (n) => {
                                                          return r.end.equals(n.identity) &&
                                                              n.constructor.name == 'Node';
                                                      });

                                                      indexedNodes[node.identity] = node.properties;

                                                      return node.properties;
                                                  })
                                                  .uniqBy('uuid')
                                                  .filter()
                                                  .value();

                        if (json[relationshipName].length == 1 && !json[relationshipName][0]._array) {
                            json[relationshipName] = json[relationshipName][0]
                        }
                    })

                    if (_.includes(item.labels, queryObject._label)) {
                        accumulator[json.uuid] = json
                    }


                    _.each(indexedGeometries[json.uuid], (geometry) =>
                        json[geometry.node_key] =
                            turf.feature(geometry.node_geometry,
                                geometry.properties));
                }
            }, {});

            return _.values(result);
        }

        function _flattenResult(result = {}) {

            return _.chain(result.records)
                    .map('_fields')
                    .flattenDeep()
                    .filter()
                    .value();
        }

        function _commitTransactions(transactions, results, callback) {
            async.each(transactions, (trx, callback) => {
                let promise = trx.commit();

                if (promise) {
                    promise.asCallback(callback);
                } else {
                    callback();
                }
            }, (err) => callback(err, results));
        }

        function _rollbackTransactions(transactions, err, callback) {
            async.each(transactions, (trx, callback) => {
                trx.rollback();
                callback();
            }, () => callback(err));
        }

        this.save = function (graphs, options = {}, callback) {

            if (!_.isArray(graphs)) {
                graphs = [graphs];
            }

            if (typeof options == 'function' && !callback) {
                callback = options;
                options  = {}
            }

            let handler;

            if (options.ignoreErrors) {
                handler = (err, result, callback) => {
                    if (err) {
                        callback(null, null);
                    } else {
                        callback(null, result);
                    }
                }
            } else {
                handler = (err, result, callback) => {
                    callback(err, result);
                }
            }

            async.map(graphs, (graph, callback) => {
                let transactions = {
                    tx: db.beginTransaction()
                }

                let neo4jStatement = _getCypher(graph, {update: true}),
                    sqlStatements  = _getSql(graph),
                    tasks          = [
                        (callback) =>
                            db.query(neo4jStatement.cypher, neo4jStatement.params, transactions.tx, (err) =>
                                handler(err, neo4jStatement.start, callback))
                    ];


                if (pg) {
                    tasks.push(
                        (callback) =>
                            pg.transaction((pgTrx) => {
                                transactions.pgtrx = pgTrx;
                                async.each(sqlStatements, (statement, callback) =>
                                    pg.raw(statement.sql, statement.params)
                                      .transacting(pgTrx)
                                      .asCallback(callback), callback);
                            })
                    )
                }
                async.series(tasks, (err) => {
                    if (err) {
                        _rollbackTransactions(transactions, err, callback);
                    } else {
                        _commitTransactions(transactions, neo4jStatement.start, callback);
                    }
                });
            }, (err, results) => {
                if (graphs.length > 1) {
                    callback(err, results)
                } else {
                    callback(err, _.first(results))
                }
            });

        }

        this.getById = function (uuid, queryObject, callback) {

            if (typeof queryObject == 'function' && !callback) {
                callback = queryObject
            }

            _get({
                cypher: `MATCH (a {uuid: $uuid})` +
                'WITH a MATCH (a)-[r*0..]->(b)\n' +
                'RETURN collect(b), collect(r)',
                params: {
                    uuid: uuid
                }
            }, queryObject, (err, result) => {
                callback(err, _.first(result))
            });
        }

        this.list = function (queryObject, callback) {

            if (typeof queryObject == 'function' && !callback) {
                callback = queryObject
            }

            let cypher = _listCypher(queryObject)
            console.log(cypher)

            _get({
                cypher
            }, queryObject, callback);
        }

        this.deleteNodes = function (uuids, callback) {

            let
                transactions = {
                    tx: db.beginTransaction()
                },
                tasks        = [
                    (callback) =>
                        _executeStatement({
                            statement: 'MATCH (n) where n.uuid in $uuids DETACH DELETE n',
                            parameters: {uuids: uuids}
                        }, callback)
                ];

            if (config.pg) {
                tasks.push(
                    (callback) =>
                        pg.transaction((pgTrx) => {
                            transactions.pgTrx = pgTrx;

                            pg('geometries')
                                .whereIn('node_uuid', uuids)
                                .transacting(transactions.pgTrx)
                                .delete()
                                .asCallback(callback)
                        })
                )
            }

            async.parallel(tasks, (err) => {
                if (err) {
                    _rollbackTransactions(transactions, err, callback)
                } else {
                    _commitTransactions(transactions, null, callback)
                }
            });
        }

        this.deleteRelationships = function (relationships, callback) {
            _executeStatement({
                statement: `MATCH (a)-[r]->(b) 
                WHERE a.uuid in {startUuids} AND b.uuid in {endUuids} AND type(r) in {relationshipName}
                DELETE r`,
                parameters: {
                    startUuids: _.map(relationships, 'from'),
                    endUuids: _.map(relationships, 'to'),
                    relationshipName: _.map(relationships, 'relationship')
                }
            }, callback);
        }
    }
})();