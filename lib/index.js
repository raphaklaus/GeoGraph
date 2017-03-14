'use strict';

const
    knex = require('knex'),
    _ = require('lodash'),
    turf = require('turf'),
    neo4j = require('./neo4j_manager'),
    async = require('async'),
    node_uuid = require('uuid'),
    GeoGraphValidationError = require('./errors/geograph_validation_error'),
    cypherUtils = require('./utils/cypher'),
    sqlUtils = require('./utils/sql');

function _handleTransactions(transactions, results, method, callback) {
    async.each(transactions, (trx, callback) => {
        let promise = trx[method]();

        if (promise) {
            promise.asCallback(callback);
        } else {
            callback();
        }
    }, (err) => callback(err, results));
}

function _handleResult(err, result, transactions, callback) {
    if (err) {
        _handleTransactions(transactions, null, 'rollback', () => callback(err));
    } else {
        _handleTransactions(transactions, result, 'commit', callback);
    }
}

function _getResult(result = {}) {

    return _.chain(result.records)
        .map('_fields')
        .filter()
        .value();
}

function _parseRow(row, geometries) {
    let
        indexedNodes = {},
        indexedGeometries = _.groupBy(geometries, 'node_uuid');

    row = _.chain(row)
        .filter()
        .flattenDeep()
        .value();

    let result = _.transform(row, function (accumulator, item) {

        if (item.constructor.name == 'Node') {
            let json = item.properties;

            indexedNodes[item.identity.low] = item;

            let relationships = _.chain(row)
                .filter((n) => n.constructor.name == 'Relationship' &&
                    n.start.equals(item.identity))
                .groupBy('type')
                .value();

            let relationshipKeys = _.keys(relationships);

            _.each(relationshipKeys, (relationshipName) => {
                json[relationshipName] = _.chain(relationships[relationshipName])
                    .map((r) => {

                        if (indexedNodes[r.end.low]) {
                            indexedNodes[r.end.low]._related = true;
                            return indexedNodes[r.end.low].properties;
                        }

                        let node = _.find(row, (n) =>
                            r.end.equals(n.identity) && n.constructor.name == 'Node');

                        indexedNodes[node.identity.low] = node;

                        node._related = true;

                        return node.properties;
                    })
                    .uniqBy('uuid')
                    .filter()
                    .value();

                if (json[relationshipName].length == 1 && !json[relationshipName][0]._array) {
                    json[relationshipName] = json[relationshipName][0];
                }
            });

            accumulator.push(json);

            _.each(indexedGeometries[json.uuid], (geometry) =>
                json[geometry.node_key] =
                turf.feature(geometry.geojson,
                    geometry.properties));
        }
    }, []);

    return _.first(result);

}

function _getNodes(rows) {
    return _.chain(rows)
        .flattenDeep()
        .filter((item) => item.constructor.name == 'Node')
        .map('properties.uuid')
        .value();
}

function _findGeometries(pg) {
    return (rows, callback) => {
        let
            uuids = _getNodes(rows),
            sqlStatement;

        try {
            sqlStatement = sqlUtils.findByIds(uuids);
        } catch (err) {
            return callback(err);
        }

        pg.raw(sqlStatement.sql, sqlStatement.params).asCallback((err, result) => callback(err, rows, (result || {}).rows));

    };
}

function _findNodes(db, cypherUtilsMethod, params, callback) {
    let
        neo4jStatement;

    try {
        neo4jStatement = cypherUtils[cypherUtilsMethod](...params);
    } catch (err) {
        return callback(err);
    }

    return (callback) =>
        db.query(neo4jStatement.cypher, neo4jStatement.params, (err, result) => callback(err, _getResult(result)));
}

function _modifyDatabase(db, cypherUtilsMethod, params, callback) {
    let
        transactions = {
            tx: db.beginTransaction()
        },
        neo4jStatement;

    try {
        neo4jStatement = cypherUtils[cypherUtilsMethod](...params);
    } catch (err) {
        return callback(err);
    }

    return {
        transactions: transactions,
        start: neo4jStatement.start,
        task: (callback) => db.query(neo4jStatement.cypher, neo4jStatement.params, transactions.tx, callback)
    };
}

function _removeGeometries(pg, transactions, uuids, callback) {
    let sqlStatement;

    try {
        sqlStatement = sqlUtils.remove(uuids);
    } catch (err) {
        return callback(err);
    }

    pg.transaction((pgTrx) => {
        transactions.pgTrx = pgTrx;

        pg.raw(sqlStatement.sql, sqlStatement.params)
            .transacting(pgTrx)
            .asCallback(callback);
    });
}

module.exports = class GeoGraph {
    constructor(config = { neo4j: {} }) {
        this.db = new neo4j({
            host: config.neo4j.host || 'localhost'
        });

        if (config.pg) {
            this.pg = knex({
                client: 'pg',
                connection: config.pg
            });
        }
    }

    save() {
        if (arguments.length < 2) {
            throw new GeoGraphValidationError('You must provide at least one json and a callback function(err, uuid)');
        }

        let jsons,
            options = {},
            callback = _.last(arguments),
            sliceEnd = -1;

        if (arguments.length >= 3) {
            options = arguments[arguments.length - 2];
            sliceEnd = -2;
        }

        jsons = Array.prototype.slice.call(arguments, 0, sliceEnd);

        async.map(jsons, (item, callback) => {

            let
                json = _.cloneDeep(item),
                { transactions, task, start } = _modifyDatabase(this.db, 'create', [json], callback),
                tasks = [task];

            if (this.pg) {
                tasks.push((callback) => {
                    let sqlStatements;

                    try {
                        sqlStatements = sqlUtils.create(json);
                    } catch (err) {
                        return callback(err);
                    }

                    this.pg.transaction((pgTrx) => {
                        transactions.pgTrx = pgTrx;

                        async.parallel([
                            (callback) => this.pg.raw(sqlStatements.insert.sql, sqlStatements.insert.params)
                                .transacting(pgTrx)
                                .asCallback(callback),
                            (callback) =>
                                async.each(sqlStatements.deletes, (statement, callback) =>
                                    this.pg.raw(statement.sql, statement.params)
                                        .transacting(pgTrx)
                                        .asCallback(callback), callback)
                        ], callback);
                    });
                });
            }

            async.parallel(tasks, (err) => _handleResult(err, start, transactions, callback));
        }, (err, results) => {
            if (jsons.length > 1) {
                return callback(err, results);
            }

            callback(err, _.first(results));
        });
    }

    findById(label, uuid, callback) {
        let tasks = [_findNodes(this.db, 'findById', [label, uuid], callback)];

        if (this.pg) {
            tasks.push(_findGeometries(this.pg));
        }

        async.waterfall(tasks, function (err, rows, geometries) {
            let result = _.chain(rows)
                .map((row) => _parseRow(row, geometries))
                .first()
                .value();
            callback(err, result);
        });
    }

    find(queryObject, callback) {
        let tasks = [_findNodes(this.db, 'find', [queryObject], callback)];

        if (this.pg) {
            tasks.push(_findGeometries(this.pg));
        }

        async.waterfall(tasks, (err, rows, geometries) =>
            callback(err, _.map(rows, (row) => _parseRow(row, geometries)))
        );
    }

    findBySpatialQuery(queryObject, callback) {
        if (!this.pg) {
            throw new GeoGraphValidationError('You must provide a postgres connection');
        }

        let
            labels = _.map(queryObject.nodes, node => node.split('.')[0]),
            sqlStatement;

        try {
            sqlStatement = sqlUtils.findByQueryObject(queryObject);
        } catch (e) {
            return callback(e);
        }

        async.waterfall([
            callback => this.pg.raw(sqlStatement.sql, sqlStatement.params).asCallback(callback),
            (geometries, callback) => {
                if (geometries.rows.length) {
                    _findNodes(this.db, 'find', [{
                        relations: queryObject.relations,
                        labels: labels,
                        filter: '[' + _.map(geometries.rows, (geometry) => `uuid = "${geometry.node_uuid}"`).join(' OR ') + ']'
                    }], callback)((err, rows) => callback(err, rows, geometries.rows));
                } else {
                    callback(null, []);
                }
            }
        ], (err, rows, geometries) =>
                callback(err, _.map(rows, (row) => _parseRow(row, geometries)))
        );
    }

    deleteNodesById(label, uuids, callback) {
        let
            { transactions, task, start } = _modifyDatabase(this.db, 'deleteNodesById', [label, uuids], callback),
            tasks = [task];

        if (this.pg) {
            tasks.push(async.apply(_removeGeometries, this.pg, transactions, uuids));
        }

        async.parallel(tasks, (err) => _handleResult(err, null, transactions, callback));
    }

    deleteNodesByQueryObject(queryObject, callback) {
        let
            { transactions, task, start } = _modifyDatabase(this.db, 'deleteNodesByQueryObject', [queryObject], callback),
            tasks = [task];

        if (this.pg) {
            tasks.push((rows, callback) => _removeGeometries(this.pg, transactions, _getNodes(rows), callback));
        }

        async.waterfall(tasks, (err) => _handleResult(err, null, transactions, callback));
    }

    deleteRelationships(json, callback) {
        let { task, transactions } = _modifyDatabase(this.db, 'deleteRelationships', [json], callback);

        task((err) => _handleResult(err, null, transactions, callback));
    }
};