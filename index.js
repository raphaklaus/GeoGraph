(function () {
    'use strict';

    const
        _              = require('lodash'),
        knex           = require('knex'),
        seraph         = require('seraph'),
        elasticsearch  = require('elasticsearch'),
        wkt            = require('terraformer-wkt-parser'),
        moment         = require('moment'),
        async          = require('async');

    _.mixin(require('lodash-uuid'));

    module.exports = function (config) {

        let
            db,
            pg,
            es;


        db = seraph(config.neo4j);

        if (config.postgres) {
            pg = knex({
                client: 'pg',
                connection: config.postgres
            });
        }

        if (config.elasticsearch) {
            es = new elasticsearch.Client(config.elasticsearch)
        }

        function _isGeoJSON(object) {
            return object && object.type == 'Feature' &&
                _.isObject(object.geometry) &&
                _.isString(object.geometry.type) &&
                _.isArray(object.geometry.coordinates);
        }

        function _getObjectsOfDepth(object, depth) {
            var current = 1;
            var values  = {};

            function enumerateValues(array) {

                var currentValues = [];

                _.each(array, function (object) {
                    _.chain(object)
                     .keys()
                     .each(function (key) {
                         let value = object[key];
                         if (_.isArray(value)) {
                             _.each(value, function (valueObject) {
                                 if (current == depth && !_isGeoJSON(valueObject) && _.isObject(valueObject)) {
                                     if (!values[key]) {
                                         values[key] = [];
                                     }
                                     values[key].push(valueObject);
                                 } else {
                                     currentValues.push(valueObject);
                                 }
                             })
                         } else if (_.isObject(value)) {
                             if (current == depth && !_isGeoJSON(value)) {
                                 if (!values[key]) {
                                     values[key] = [];
                                 }
                                 values[key].push(value);
                             } else {
                                 currentValues.push(value);
                             }
                         }
                     })
                     .value();
                });

                current++;

                if (currentValues.length) {
                    enumerateValues(currentValues, current);
                }

            }

            enumerateValues([object], current);

            return values;
        }

        function _isArrayOfPrimitives(array) {
            return array && !_.isEmpty(array) && _.isArray(array) && _.every(array, (value) => {
                    return !_.isObject(value) && !_.isUuid(value);
                });
        }

        function _graphToArray(object) {
            let nodes = [];

            function graphToArrayRecursive(object) {

                nodes.push(object);

                _.each(object, (value) => {
                    if (_.isArray(value)) {
                        _.each(value, graphToArrayRecursive);
                    }
                    else if (_.isObject(value) && !_isGeoJSON(value)) {
                        graphToArrayRecursive(value);
                    }
                });
            }

            graphToArrayRecursive(object);

            return _.filter(nodes, (node) => {
                return !_.isEmpty(node);
            });
        }

        function _getNode(uuid, callback) {
            db.query('MATCH (node) WHERE node.uuid = {uuid} RETURN node', {
                uuid: uuid,
            }, function (err, result) {
                callback(err, _.first(result));
            });
        }

        function _createNode(node, trx, callback) {

            let
                tasks = [
                    function (callback) {

                        let graphNode = _.chain(node)
                                         .keys()
                                         .reject(function (key) {
                                             return _isGeoJSON(node[key])
                                                 || (_.isArray(node[key]) && !_isArrayOfPrimitives(node[key]))
                                                 || (_.isObject(node[key]) && !_.isArray(node[key]));
                                         })
                                         .transform(function (result, next) {
                                             result[next] = node[next];
                                         }, {})
                                         .value();

                        graphNode.createdAt = moment().format('YYYY-MM-DD HH:mm');
                        graphNode.updatedAt = moment().format('YYYY-MM-DD HH:mm');

                        db.save(graphNode, node._label || '', callback);
                    },
                    function (result, callback) {
                        _executeStatement({
                            statement: 'MATCH (n) WHERE id(n) = {id} RETURN n',
                            parameters: {
                                id: result.id
                            }
                        }, function (err, queryResult) {
                            callback(err, _.first(queryResult));
                        });
                    }
                ];

            // no transaction passed, callback is the second parameter
            if (typeof trx == 'function' && !callback) {
                callback = trx;
            } else {
                // transaction was passed, there are geojsons to be persisted
                tasks.push(
                    function (result, callback) {
                        var geometries = _.chain(node)
                                          .keys()
                                          .filter(function (key) {
                                              return _isGeoJSON(node[key]);
                                          })
                                          .transform(function (accumulator, key) {
                                              accumulator[key] = node[key];
                                          }, {})
                                          .value();

                        async.each(_.keys(geometries), function (key, callback) {
                            knex('geometries')
                                .insert({
                                    'node_geometry': wkt.convert(geometries[key].geometry),
                                    'node_key': key,
                                    'node_uuid': result.uuid,
                                    'properties': geometries[key].properties
                                })
                                .transacting(trx)
                                .asCallback(callback);
                        }, function (err) {
                            callback(err, result);
                        });
                    }
                )
            }

            async.waterfall(tasks, function (err, result) {
                callback(err, result);
            })
        }

        function _getOrCreateNode(node, trx, callback) {

            if (_.isObject(node)) {
                if (node.hasOwnProperty('uuid')) {
                    if (node.uuid) {
                        // se for um objeto com a propriedade "uuid" e essa propriedade tiver algum valor, obter esse objeto
                        _getNode(node.uuid, callback)
                    } else {
                        callback(null, {})
                    }
                } else {
                    // se for um objeto sem a propriedade "uuid", persistir no banco
                    _createNode(node, trx, callback);
                }
            } else if (_.isUuid(node)) {
                // se for passado direto um "uuid", procurar este objeto no banco
                _getNode(node, callback);
            } else {
                callback(null, {});
            }
        }

        function _relateNodes(primaryNodeUuid, relationships, options) {
            let statements = [];
            _.chain(relationships)
             .keys()
             .each(function (key) {
                 if (options && options.detach) {
                     statements.push({
                         statement: `MATCH (a)-[r:${key}]->(b)
                                 WHERE a.uuid = {nodeUuid}
                                 DELETE r`,
                         parameters: {
                             nodeUuid: primaryNodeUuid
                         }
                     });
                 }
                 _.each(relationships[key], function (uuid) {

                     if (uuid) {
                         statements.push({
                             statement: `MATCH (a),(b)
                                 WHERE a.uuid = {nodeUuid} AND b.uuid = {relationshipUuid}
                                 CREATE UNIQUE(a)-[r:${key}]->(b)
                                 RETURN id(r)`,
                             parameters: {
                                 nodeUuid: primaryNodeUuid,
                                 relationshipUuid: uuid
                             }
                         });
                     }
                 });
             })
             .value();

            return statements;
        }

        function _executeStatement(query, callback) {
            // Executa a query no neo4j
            db.query(query.statement, query.parameters, callback);
        }

        function _getRelationshipsToCreate(node) {
            return _.chain(node)
                    .keys()
                    .filter(function (key) {
                        return _.isObject(node[key]) && !_isGeoJSON(node[key]) && !_isArrayOfPrimitives(node[key]);
                    })
                    .transform(function (result, key) {

                        let value = node[key];

                        if (_.isArray(value)) {
                            result[key] = _.filter(value, function (node) {
                                return _.isObject(node) && !node.uuid && !_isGeoJSON(value);
                            });
                        } else {
                            result[key] = !value.uuid ? [value] : [];
                        }
                    }, {})
                    .value();
        }

        function _getNodesToRelate(node) {
            return _.chain(node)
                    .keys()
                    .filter(function (key) {
                        return node[key] && (!_isGeoJSON(node[key]) && !_isArrayOfPrimitives(node[key])) && key != 'uuid';
                    })
                    .transform(function (result, key) {
                        let value = node[key];

                        if (!_.isArray(value)) {
                            result[key] = _.filter([value && value.uuid]);
                        } else {
                            result[key] = _.chain(value)
                                           .map(function (value) {
                                               return value && value.uuid;
                                           })
                                           .filter()
                                           .value();
                        }
                    }, {})
                    .value()
        }

        function _createRelationships(node, options, callback) {
            var
                error,
                current = 0;

            function _createRelationshipsRecursive(node, callback) {
                let
                    relationshipsToCreate = _getRelationshipsToCreate(node),
                    nodesToRelate         = _getNodesToRelate(node);

                current++;

                if (!error) {
                    async.series([
                        function (callback) {
                            async.map(_.keys(relationshipsToCreate), function (key, callback) {
                                async.map(relationshipsToCreate[key], function (node, callback) {
                                    _getOrCreateNode(node, options.trx,
                                        function (err, result) {
                                            if (err) {
                                                callback(err);
                                            } else {
                                                node.uuid = result.uuid;

                                                nodesToRelate[key].push(result.uuid);
                                                callback(err, result);
                                            }
                                        });
                                }, callback);
                            }, callback);
                        },
                        function (callback) {
                            if (options && options.detach) {
                                async.eachSeries(_relateNodes(node.uuid, nodesToRelate, options), function (item, callback) {
                                    _executeStatement(item, callback);
                                }, callback);
                            } else {
                                async.each(_relateNodes(node.uuid, nodesToRelate, options), function (item, callback) {
                                    _executeStatement(item, callback);
                                }, callback);
                            }
                        }
                    ], function (err) {
                        if (err) {
                            error = err;
                            callback(error);
                        } else {
                            var relatedNodes = _getObjectsOfDepth(node, 1);

                            if (_.keys(relatedNodes).length) {

                                let keys = _.keys(relatedNodes);

                                async.each(keys, (key, callback) => {
                                    async.each(relatedNodes[key], function (relatedNode, callback) {
                                        _createRelationshipsRecursive(relatedNode, callback);
                                    }, callback);
                                }, callback)
                            } else {
                                current = 0;
                                callback();
                            }
                        }
                    });
                } else {
                    callback(error);
                }
            }

            _createRelationshipsRecursive(node, callback);
        }

        function _createGraph(node, trx, callback) {

            if (typeof trx == 'function' && !callback) {
                callback = trx;
            }

            async.waterfall([
                function (callback) {
                    _getOrCreateNode(node, trx, callback)
                },
                function (result, callback) {

                    node.uuid = result.uuid;
                    _createRelationships(node, {
                        trx: trx
                    }, function (err) {
                        callback(err, result.uuid, trx);
                    });
                },
            ], function (err, uuid) {
                callback(err, uuid);
            });
        }

        function _objectToWhere(node, queryObject) {
            return _.chain(queryObject)
                    .keys()
                    .reject((key) => {
                        return _.startsWith(key, '_')
                    })
                    .map((key) => {
                        if (_.isObject(queryObject[key]) && queryObject[key]['$in']) {
                            let elements = _.chain(queryObject[key]['$in'])
                                            .map((element) => {
                                                if (typeof element == 'string') {
                                                    return `'${element}'`;
                                                } else {
                                                    return element;
                                                }
                                            })
                                            .join(',')
                                            .value();

                            return `${node}.${key} in [${elements}]`
                        } else {
                            return `${node}.${key} = {${key}}`
                        }
                    })
                    .value()
                    .join(' AND ');
        }

        function _parseQuery(queryObject) {

            let where     = _objectToWhere('a', queryObject),
                limit     = queryObject._limit,
                skip      = queryObject._skip,
                statement = '';

            if (queryObject._label) {
                statement = `MATCH (a:${queryObject._label}) `
            } else {
                statement = 'MATCH (a) '
            }

            if (where) {
                statement += `where ${where} `;
            }

            statement += 'WITH a '

            if (limit) {
                statement += `LIMIT ${limit} `;
            }

            if (skip) {
                statement += `SKIP ${skip} `;
            }

            statement += 'MATCH (a)-[r*0..]->(b) RETURN a,r,b'

            return {
                statement: statement,
                parameters: queryObject
            };
        }

        function _deleteProperty(object, property) {
            let currentObject = object;

            _.chain(property)
             .split('.')
             .each((key) => {
                 if (_.isObject(currentObject[key]) && !_.isArray(currentObject[key])) {
                     currentObject = currentObject[key];
                 }
             })
             .value();

            delete currentObject[_.chain(property)
                                  .split('.')
                                  .last()
                                  .value()];
        }

        function _parseResult(nodes, geometries, queryObject) {

            _.each(nodes, function (item) {
                if (item._type == 'node') {
                    var relationships = _.chain(nodes)
                                         .filter({
                                             start: item.id,
                                             '_type': 'relationship'
                                         })
                                         .groupBy('type')
                                         .value();

                    _.chain(relationships)
                     .keys()
                     .each((relationshipName) => {
                         item[relationshipName] = _.chain(relationships[relationshipName])
                                                   .map((r) => {
                                                       return _.find(nodes, {id: r.end, '_type': 'node'});
                                                   })
                                                   .uniqBy('id')
                                                   .filter()
                                                   .value();

                         if (item[relationshipName].length == 1 && !item[relationshipName][0]._array) {
                             item[relationshipName] = item[relationshipName][0]
                         }
                     })
                     .value();

                    var nodeGeometries = _.chain(geometries)
                                          .filter({node_uuid: item.uuid})
                                          .transform(function (result, next) {
                                              result[next.node_key] = {
                                                  type: 'Feature',
                                                  geometry: next.node_geometry,
                                                  properties: next.properties
                                              }
                                          }, {})
                                          .value();

                    _.chain(nodeGeometries)
                     .keys()
                     .each(function (key) {
                         item[key] = nodeGeometries[key]
                     })
                     .value();
                }
            });

            _.each(nodes, (item) => {
                _.chain(item)
                 .keys()
                 .each((key) => {
                     if (_.startsWith(key, '_') && key != '_root' && key != '_label') {
                         delete item[key];
                     }
                 })
                 .value();

                delete item.id;
            });

            return _.chain(nodes)
                    .filter('_root')
                    .map((node) => {

                        if (queryObject) {
                            let propertiesToNegate = queryObject._negate;

                            _.chain(propertiesToNegate)
                             .split(',')
                             .each((property) => {
                                 _deleteProperty(node, property);
                             })
                             .value();
                        }

                        delete node._root;
                        return node;
                    })
                    .uniqBy('uuid')
                    .value();
        }

        function _flattenResult(result) {

            return _.chain(result)
                    .transform(function (accumulator, next) {
                        if (next.a) {
                            next.a._root = true;
                        }

                        if (_.isArray(next.r)) {
                            _.each(next.r, (item) => {
                                accumulator.push(item);
                            });
                        } else {
                            accumulator.push(next.r);
                        }

                        accumulator.push(next.a);
                        accumulator.push(next.b);
                    })
                    .filter()
                    .flatten()
                    .uniqBy((item) => {
                        return item._type + item.id;
                    })
                    .value()
        }

        this.createGraph = function (node, callback) {
            let
                transaction = db.batch();

            async.waterfall([
                function (callback) {
                    if (pg) {
                        pg.transaction(function (trx) {
                            _createGraph(node, trx, (err, uuid) => {
                                if (err) {
                                    trx.rollback();
                                } else {
                                    trx.commit();
                                }
                                callback(err, uuid);
                            });
                        });
                    } else {
                        _createGraph(node, callback);
                    }
                },
                function (uuid, callback) {
                    transaction.commit(function (err) {
                        callback(err, uuid);
                    });
                }
            ], callback);
        }

        this.updateGraphs = function (graphs, options = {}, callback) {
            let
                nodes = _.chain(graphs)
                         .map(_graphToArray)
                         .flatten()
                         .filter('uuid')
                         .keyBy('uuid')
                         .value();

            let transaction = db.batch(),
                neo4jTask = (callback) => {
                    async.each(nodes, (node, callback) => {
                        if (pg) {
                            pg.transaction((trx) => {
                                options.trx = trx;
                                _createRelationships(node, options, callback);
                            });
                        } else {
                            _createRelationships(node, options, callback);
                        }
                    }, callback);
                };

            async.waterfall([
                (callback) => {
                    async.map(nodes, (node, callback) => {
                        let statement = 'MATCH (n) WHERE n.uuid = {uuid} SET ',
                            keys      = _.chain(node)
                                         .keys()
                                         .reject((key) => {
                                             return key == 'uuid' ||
                                                 (_.isObject(node[key]) && !_isArrayOfPrimitives(node[key])) ||
                                                 _.startsWith(key, '_');
                                         })
                                         .value();

                        _.each(keys, (key) => {
                            statement += `n.${key} = {${key}}, `;
                        });

                        if (keys.length > 0) {
                            statement += `n.updatedAt = {updatedAt} `;
                            statement += 'RETURN n ';

                            node.updatedAt = moment().format('YYYY-MM-DD HH:mm');

                            callback(null, {
                                statement: statement,
                                parameters: node
                            });
                        } else {
                            callback(null, null)
                        }
                    }, callback)
                },
                (queries, callback) => {
                    async.map(_.filter(queries, 'statement'), (query, callback) => {
                        _executeStatement(query, callback);
                    }, callback)
                },

                (dbNodes, callback) => {
                    if (pg) {
                        pg.transaction((trx) => {
                            let geometries = _.chain(nodes)
                                              .keys()
                                              .transform((result, uuid) => {
                                                  result[uuid] = _.chain(nodes[uuid])
                                                                  .keys()
                                                                  .transform((geojsons, key) => {
                                                                      if (_isGeoJSON(nodes[uuid][key])) {
                                                                          geojsons[key] = nodes[uuid][key];
                                                                      }
                                                                  }, {})
                                                                  .value();
                                              }, {})
                                              .value();

                            async.parallel([
                                (callback) => {
                                    async.each(_.keys(geometries), (uuid, callback) => {
                                        async.each(_.keys(geometries[uuid]), (key, callback) => {
                                            pg.raw(`INSERT INTO geometries (node_uuid, node_key, node_geometry) 
                            values ( :uuid, :key, :geometry) ON CONFLICT  ON CONSTRAINT uuid_key_unique 
                            DO UPDATE SET node_geometry = :geometry`, {
                                                uuid: uuid,
                                                key: key,
                                                geometry: wkt.convert(geometries[uuid][key].geometry)
                                            })
                                                .transacting(trx)
                                                .asCallback(callback);
                                        }, callback)
                                    }, callback)
                                },
                                neo4jTask
                            ], function (err) {
                                if (err) {
                                    trx.rollback();
                                    callback(err);
                                } else {
                                    trx.commit().asCallback((errTrx) => {
                                        callback(errTrx, nodes);
                                    });
                                }
                            });
                        })
                    } else {
                        neo4jTask((err) => {
                            callback(err, nodes);
                        });
                    }
                }
            ], (err, nodes) => {

                if (err) {
                    callback(err);
                } else {
                    transaction.commit();
                    callback(null, _.chain(nodes)
                                    .values()
                                    .uniqBy('id')
                                    .value());
                }
            });
        }

        this.getById = function (uuid, queryObject, callback) {

            if (typeof queryObject == 'function' && !callback) {
                callback = queryObject
            }

            async.waterfall([
                function (callback) {
                    _executeStatement({
                        statement: 'MATCH (a) where a.uuid = {uuid}\n OPTIONAL MATCH (a)-[r*0..]->(b) RETURN a,r,b',
                        parameters: {
                            uuid: uuid
                        }
                    }, function (err, result) {
                        callback(err, _flattenResult(result));
                    });
                },
                function (nodes, callback) {
                    if (pg) {
                        pg('geometries')
                            .whereIn('node_uuid', _.chain(nodes)
                                                   .filter({'_type': 'node'})
                                                   .map('uuid')
                                                   .value())
                            .select('node_uuid', 'node_key', 'properties',
                                pg.raw('ST_AsGeoJSON(node_geometry)::json as node_geometry'))
                            .asCallback(function (err, geometries) {
                                callback(err, nodes, geometries)
                            })
                    } else {
                        callback(null, nodes);
                    }
                }
            ], function (err, nodes, geometries) {
                if (err) {
                    callback(err);
                } else {
                    let response = _.first(_parseResult(nodes, geometries, queryObject));

                    callback(null, response);
                }
            });
        }

        this.getByQuery = function (queryObject, callback) {
            _executeStatement(_parseQuery(queryObject), (err, result) => {
                callback(err, _parseResult(_flattenResult(result), null, queryObject));
            });
        }

        this.getOneByQuery = function (queryObject, callback) {
            this.getByQuery(queryObject, (err, result) => {
                callback(err, _.first(result));
            });
        }

        this.search = function (query, callback) {
            let self = this;

            if (es) {
                async.waterfall([
                    (callback) => {
                        es.search({
                            index: config.searchIndex,
                            size: 30,
                            body: {
                                "query": {
                                    "bool": {
                                        "should": [
                                            {
                                                "query_string": {
                                                    "query": `*${query._text}*`,
                                                    "fields": ["_all"]
                                                }
                                            },
                                            {
                                                "multi_match": {
                                                    "query": `${query._text}`,
                                                    "minimum_should_match": "35%",
                                                    "fields": ["_all"],
                                                    "operator": "or",
                                                    "fuzziness": 3
                                                }
                                            },
                                            {
                                                "multi_match": {
                                                    "query": `${query._text}`,
                                                    "fields": ["_all"],
                                                    "minimum_should_match": "35%",
                                                    "operator": "or",
                                                    "fuzziness": 3,
                                                    "type": "phrase"
                                                }
                                            }
                                        ]
                                    }
                                }
                            }
                        }, callback);
                    },
                    (result, status, callback) => {
                        self.getByQuery({
                            uuid: {
                                $in: _.map(result.hits.hits, '_id')
                            },
                            _limit: query._limit,
                            _skip: query._skip
                        }, callback);
                    }
                ], callback);
            } else {
                callback(null, []);
            }
        }

        this.deleteNodes = function (uuids, callback) {

            let
                neo4Task = function (callback) {
                    _executeStatement({
                        statement: 'MATCH (n) where n.uuid in {uuids} DETACH DELETE n',
                        parameters: {uuids: uuids}
                    }, callback);
                };

            if (config.postgres) {
                pg.transaction((trx) => {
                    async.parallel([
                        (callback) => {
                            knex('geometries')
                                .whereIn('node_uuid', uuids)
                                .transacting(trx)
                                .delete()
                                .asCallback(callback);

                        },
                        neo4Task
                    ], (err) => {
                        if (err) {
                            trx.rollback();
                            callback(err)
                        } else {
                            trx.commit();
                            callback(null);
                        }
                    });
                })
            } else {
                neo4Task(callback);
            }
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

        this.rawQuery = function (query, callback) {
            _executeStatement({
                statement: query
            }, (err, result) => {
                callback(err, (_parseResult(_flattenResult(result))));
            });
        }
    }
})();