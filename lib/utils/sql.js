'use strict';

const
    wkt = require('terraformer-wkt-parser'),
    _ = require('lodash'),
    nodeUtils = require('./node'),
    GeoGraphValidationError = require('../errors/geograph_validation_error'),
    pg = require('knex')({ client: 'pg' });

_.mixin(require('lodash-uuid'));

function create(json, statements = []) {

    if (nodeUtils.isNeo4jNode(json)) {

        if (!_.isUuid(json.uuid)) {
            throw new GeoGraphValidationError(`You must provide the node uuid - ${JSON.stringify(json)}`);
        }

        _.each(json, (value, key) => {
            let statement = {
                insert: 0,
                sql: ''
            };

            if (nodeUtils.isGeoJSON(value)) {
                statement.insert = 1; // will be used to determinate how many values will be inserted
                statement.params = [json.uuid, key, wkt.convert(value.geometry), value.properties];

                statements.push(statement);
            } else if (value == null || value == undefined) {
                statement.delete = true;
                statement.sql += 'DELETE FROM geometries where node_uuid = :uuid and node_key = :key';
                statement.params = {
                    uuid: json.uuid,
                    key: key
                };

                statements.push(statement);
            } else if (_.isArray(value)) {
                _.each(value, item => create(item, statements));
            } else {
                create(value, statements);
            }
        });
    }

    let
        insertStatement = {
            sql: '',
        },
        insertStatements = _.filter(statements, 'insert');

    if (insertStatements.length) {
        insertStatement.sql = 'INSERT INTO geometries (node_uuid, node_key, geometry, properties)\nVALUES\n';

        insertStatement.sql += _.times(_.sumBy(insertStatements, 'insert'), _.constant('( ?, ?, ?, ?)')).join(',') + '\n';
        insertStatement.sql += 'ON CONFLICT ON CONSTRAINT uuid_key_unique\n';
        insertStatement.sql += 'DO UPDATE SET geometry = excluded.geometry, properties = excluded.properties';
        insertStatement.params = _.chain(insertStatements)
            .map('params')
            .flatten()
            .value();
    }

    return {
        insert: insertStatement,
        deletes: _.filter(statements, 'delete')
    };
}

function find(uuids) {

    if (!_.isArray(uuids)) {
        uuids = [uuids];
    }

    _.each(uuids, uuid => {
        if (!_.isUuid(uuid)) {
            throw new GeoGraphValidationError(`You must provide a valid uuid - ${uuid}`);
        }
    });

    return {
        sql: pg('geometries')
            .whereIn('node_uuid', uuids)
            .select('node_uuid', 'node_key', 'properties', pg.raw('ST_AsGeoJSON(node_geometry)::json as geometry'))
            .toString(),
        params: {}
    };
}

module.exports.create = create;
module.exports.find = find;