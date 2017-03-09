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

        jsons = arguments.slice(0, sliceEnd);

        async.map(jsons, (item, callback) => {
            let
                json = _.cloneDeep(item),
                transactions = {
                    tx: this.db.begintransaction()
                },
                neo4jStatement = cypherUtils.create(json),
                tasks = [(callback) => this.db.query(neo4jStatement.cypher, neo4jStatement.params, transactions.tx, callback)];

            if (this.pg) {
                tasks.push((callback) => {
                    let sqlStatements = sqlUtils.create(json);

                    this.pg.transaction((pgTrx) => {
                        transactions.pgTrx = pgTrx;
                        async.each(sqlStatements, (statement, callback) =>
                            this.pg.raw(statement.sql, statement.params)
                                .transacting(pgTrx)
                                .asCallback(callback), callback);
                    });
                }); 
            }
        });
    }
};