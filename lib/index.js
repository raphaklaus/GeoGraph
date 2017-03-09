'use strict';

const
    knex = require('knex'),
    _ = require('lodash'),
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
                transactions = {
                    tx: this.db.beginTransaction()
                },
                neo4jStatement;

            try {
                neo4jStatement = cypherUtils.create(json);
            } catch (err) {
                return callback(err);
            }

            let tasks = [(callback) => this.db.query(neo4jStatement.cypher, neo4jStatement.params, transactions.tx, callback)];

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

            async.parallel(tasks, (err) => {
                if (err) {
                    _handleTransactions(transactions, undefined, 'rollback', () => callback(err));
                } else {
                    _handleTransactions(transactions, neo4jStatement.start, 'commit', callback);
                }
            });
        }, (err, results) => {
            if (jsons.length > 1) {
                return callback(err, results);
            }

            callback(err, _.first(results));
        });
    }
};