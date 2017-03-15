'use strict';

const
    node_uuid = require('uuid'),
    _ = require('lodash'),
    wkt = require('terraformer-wkt-parser'),
    expect = require('chai').expect,
    turf = require('turf'),
    statements = require('../lib/utils/sql'),
    GeoGraphValidationError = require('../lib/errors/geograph_validation_error');

describe('Sql', () => {
    let
        insertStartSql = 'INSERT INTO geometries (node_uuid, node_key, node_label, geometry, properties)\nVALUES\n',
        insertValuesSql = '(?, ?, ?, ?, ?)',
        insertEndSql = '\nON CONFLICT ON CONSTRAINT uuid_key_unique\n' +
            'DO UPDATE SET geometry = excluded.geometry, properties = excluded.properties',
        point = turf.point([0, 0]),
        linestring = turf.lineString([[0, 0], [1, 1]]),
        polygon = turf.polygon([[
            [0, 0],
            [2, 0],
            [5.4, 2.7],
            [0, 0]
        ]], {
                someProperty: 'test'
            });

    it('should return insert sql statements for simple node', () => {
        let
            uuid = node_uuid.v4(),
            json1 = {
                _label: 'Test',
                uuid: uuid,
                geojson: point
            },
            statement1 = statements.create(json1),
            json2 = {
                _label: 'Test',
                uuid: uuid,
                point: point,
                path: linestring
            },
            statement2 = statements.create(json2);
        
        expect(statement1.insert.sql).to.be.equal(`${insertStartSql}${_.times(1, _.constant(insertValuesSql)).join(',')}${insertEndSql}`);
        expect(statement1.insert.params).to.be.deep.equal([uuid, 'geojson', 'Test', wkt.convert(point.geometry), {}]);

        expect(statement2.insert.sql).to.be.equal(`${insertStartSql}${_.times(2, _.constant(insertValuesSql)).join(',')}${insertEndSql}`);
        expect(statement2.insert.params.slice(0, 5)).to.be.deep.equal([uuid, 'point', 'Test', wkt.convert(point.geometry), {}]);
        expect(statement2.insert.params.slice(5)).to.be.deep.equal([uuid, 'path', 'Test', wkt.convert(linestring.geometry), {}]);
    });

    it('should return insert sql statements for relationships', () => {
        let
            uuid = node_uuid.v4(),
            uuid2 = node_uuid.v4(),
            json1 = {
                uuid: uuid,
                _label: 'Test',
                rel: {
                    _label: 'Test',
                    uuid: uuid2,
                    location: point
                }
            },
            statement1 = statements.create(json1),
            json2 = {
                _label: 'Test',
                uuid: uuid,
                rel: {
                    _label: 'Test',
                    uuid: uuid2,
                    address: point,
                    street: linestring
                }
            },
            statement2 = statements.create(json2);

        expect(statement1.insert.sql).to.be.equal(`${insertStartSql}${_.times(1, _.constant(insertValuesSql)).join(',')}${insertEndSql}`);
        expect(statement1.insert.params).to.be.deep.equal([uuid2, 'location', 'Test', wkt.convert(point.geometry), {}]);

        expect(statement2.insert.sql).to.be.equal(`${insertStartSql}${_.times(2, _.constant(insertValuesSql)).join(',')}${insertEndSql}`);
        expect(statement2.insert.params.slice(0, 5)).to.be.deep.equal([uuid2, 'address', 'Test', wkt.convert(point.geometry), {}]);
        expect(statement2.insert.params.slice(5)).to.be.deep.equal([uuid2, 'street', 'Test', wkt.convert(linestring.geometry), {}]);
    });

    it('should return insert sql statements for complex jsons', () => {
        let
            uuid1 = node_uuid.v4(),
            uuid2 = node_uuid.v4(),
            uuid3 = node_uuid.v4(),
            uuid4 = node_uuid.v4(),
            json = {
                uuid: uuid1,
                _label: 'potato',
                name: 'test',
                age: 125,
                lastAccess: new Date(),
                point: point,
                friends: [{
                    uuid: uuid2,
                    _label: 'potato',
                    name: 'another test',
                    linestring: linestring
                }, {
                    uuid: uuid3,
                    _label: 'potato',
                    name: 'other test',
                    deeper: {
                        uuid: uuid4,
                        _label: 'tomato',
                        property: true,
                        polygon: polygon
                    }
                }]
            },
            statement = statements.create(json);

        expect(statement.insert.sql).to.be.equal(`${insertStartSql}${_.times(3, _.constant(insertValuesSql)).join(',')}${insertEndSql}`);
        expect(statement.insert.params.slice(0, 5)).to.be.deep.equal([uuid1, 'point', 'potato', wkt.convert(point.geometry), {}]);
        expect(statement.insert.params.slice(5, 10)).to.be.deep.equal([uuid2, 'linestring', 'potato', wkt.convert(linestring.geometry), {}]);
        expect(statement.insert.params.slice(10)).to.be.deep.equal([uuid4, 'polygon', 'tomato', wkt.convert(polygon.geometry), { someProperty: 'test' }]);
    });

    it('should return delete sql statements', () => {
        let
            uuid1 = node_uuid.v4(),
            uuid2 = node_uuid.v4(),
            uuid3 = node_uuid.v4(),
            json = {
                _label: 'Test',
                uuid: uuid1,
                position: null,
                rel: {
                    _label: 'Test2',
                    uuid: uuid2,
                    path: undefined,
                    subRel: {
                        _label: 'Test3',
                        uuid: uuid3,
                        name: '',
                        area: null
                    }
                }
            },
            statement = statements.create(json);
        expect(_.map(statement.deletes, 'sql')).include('DELETE FROM geometries where node_uuid = :uuid and node_key = :key');
        expect(statement.deletes).to.have.lengthOf(3);
        expect(_.map(statement.deletes, 'params')).to.deep.include({
            key: 'position',
            uuid: uuid1
        });
        expect(_.map(statement.deletes, 'params')).to.deep.include({
            key: 'path',
            uuid: uuid2
        });
        expect(_.map(statement.deletes, 'params')).to.deep.include({
            key: 'area',
            uuid: uuid3
        });
    });

    it('should validate jsons with no uuid', () => {
        let
            json1 = {
                point: point
            },
            json2 = {
                uuid: node_uuid.v4(),
                property: true,
                rel: json1
            },
            json3 = {
                uuid: node_uuid.v4(),
                point: point,
                rel: {
                    uuid: node_uuid.v4(),
                    linestring,
                    deeper: json2
                }
            };

        expect(() => statements.create(json1)).to.throw(GeoGraphValidationError);
        expect(() => statements.create(json2)).to.throw(GeoGraphValidationError);
        expect(() => statements.create(json3)).to.throw(GeoGraphValidationError);
    });

    it('should return find sql statement', () => {
        let
            uuid1 = node_uuid.v4(),
            uuid2 = node_uuid.v4(),
            uuid3 = node_uuid.v4(),
            statement1 = statements.findByIds(uuid1),
            statement2 = statements.findByIds([uuid2, uuid3]),
            hash1 = {},
            hash2 = {};
        
        hash1[uuid1] = true;

        hash2[uuid2] = true;
        hash2[uuid3] = true;

        expect(statement1.sql).to.be.equal('select "node_uuid", "node_key", ' +
            '"properties", ST_AsGeoJSON(geometry)::json as geojson from "geometries" where ' +
            `'${JSON.stringify(hash1)}'::jsonb \\? node_uuid::text`);
        expect(statement2.sql).to.be.equal('select "node_uuid", "node_key", ' +
            '"properties", ST_AsGeoJSON(geometry)::json as geojson from "geometries" where ' +
            `'${JSON.stringify(hash2)}'::jsonb \\? node_uuid::text`);
    });

    it('should validate invalid uuids', () => {
        expect(() => statements.findByIds('potato')).to.throw(GeoGraphValidationError);
        expect(() => statements.findByIds([node_uuid.v4(), 'tomato'])).to.throw(GeoGraphValidationError);
    });


});