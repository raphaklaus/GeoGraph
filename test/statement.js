const
    _ = require('lodash'),
    uuid = require('uuid'),
    expect = require('chai').expect,
    statements = require('../lib/utils/statement'),
    GeoGraphValidationError = require('../lib/errors/geograph_validation_error');

function _getParamsNthKey(params, index = 0) {
    return params[_.keys(params)[index]];
}

describe('Statements', () => {

    let
        createRegex = 'CREATE \\(\\w+:\\w+ \\$\\w+\\)\\s',
        createRelationshipRegex = 'CREATE UNIQUE \\(\\w+\\)-\\[:\\w+\\]->\\(\\w+:\\w+ \\$\\w+\\)\\s',
        matchRegex = 'MATCH \\(\\w+ \\{\\w+: \\$\\w+\\}\\)',
        matchRelationshipRegex = 'MATCH \\(\\w+\\)-\\[\\w+\\*0\\.\\.\\]->\\(\\w+\\)';
        //MATCH (a {uuid: $uuid}) MATCH (a)-[r*0..]->(b)

    it('should create statement query for simple node', () => {
        let statement = statements.create({
            _label: 'test',
            name: 'name test'
        });

        let params = _getParamsNthKey(statement.params);

        expect(statement.cypher).to.match(new RegExp(createRegex));
        expect(params).to.have.property('uuid');
        expect(params).to.have.property('name', 'name test');
    });

    it('should create statement query for node with multiple properties', () => {
        let
            date = new Date(),
            statement = statements.create({
                _label: 'test',
                name: 'name test',
                numericProperty: 123,
                booleanProperty: true,
                dateProperty: date,
                arrayProperty: [1, 2, 3]
            });

        let params = _getParamsNthKey(statement.params);

        expect(params).to.have.property('uuid');
        expect(params).to.have.property('name', 'name test');
        expect(params).to.have.property('numericProperty', 123);
        expect(params).to.have.property('booleanProperty', true);
        expect(params).to.have.property('dateProperty', date.valueOf());
    });

    it('shoud create statement query with multiple relationships', () => {
        let statement = statements.create({
            _label: 'test',
            name: 'name test',
            relation: {
                _label: 'test',
                rel_property: 123
            },
            anotherRelations: [{
                _label: 'test2',
                rel_property: 'more test'
            }, {
                _label: 'test3',
                rel_property: true
            }]
        });

        let
            firstParam = _getParamsNthKey(statement.params, 0),
            secondParam = _getParamsNthKey(statement.params, 1),
            thirdParam = _getParamsNthKey(statement.params, 2),
            fourthParam = _getParamsNthKey(statement.params, 3);

        expect(firstParam).to.have.property('name', 'name test');
        expect(secondParam).to.have.property('rel_property', 123);
        expect(thirdParam).to.have.property('rel_property', 'more test');
        expect(fourthParam).to.have.property('rel_property', true);
        expect(statement.cypher).to.match(new RegExp(`${createRegex}(${createRelationshipRegex}){3}`));
    });

    it('should create statement query with multiple relationships and multiple dephts', () => {
        let statement = statements.create({
            _label: 'test',
            name: 'name test',
            relation: {
                _label: 'test',
                rel_property: 123,
                anotherRelations: [{
                    _label: 'test2',
                    rel_property: 'more test',
                    subRelation: {
                        _label: 'test3',
                        rel_property: true
                    }
                }]
            }
        });

        let
            firstParam = _getParamsNthKey(statement.params, 0),
            secondParam = _getParamsNthKey(statement.params, 1),
            thirdParam = _getParamsNthKey(statement.params, 2),
            fourthParam = _getParamsNthKey(statement.params, 3);

        expect(firstParam).to.have.property('uuid');
        expect(firstParam).to.have.property('name', 'name test');
        expect(secondParam).to.have.property('rel_property', 123);
        expect(thirdParam).to.have.property('rel_property', 'more test');
        expect(fourthParam).to.have.property('rel_property', true);
        expect(statement.cypher).to.match(new RegExp(`${createRegex}(${createRelationshipRegex}){3}`));
    });

    it('should throw error when trying to insert node without label', () => {

        let json = {
            property: 'value'
        };

        expect(() => statements.create(json)).to.throw(GeoGraphValidationError, `you must provide a valid label - ${json}`);
    });

    it('should throw error when trying to insert node with invalid label', () => {

        let
            relation1 = {
                property: 'value'
            },
            json1 = {
                _label: 'test',
                property: true,
                relation: {
                    _label: 'test',
                    property: 123,
                    subRelation: relation1
                }
            };

        let
            relation2 = {
                property: 'value'
            },
            json2 = {
                _label: 'test',
                property: true,
                relation: relation2
            };

        let json3 = {
            _label: '12label',
            property: 'value'
        };

        expect(() => statements.create(json1)).to.throw(GeoGraphValidationError, `you must provide a valid label - ${relation1}`);
        expect(() => statements.create(json2)).to.throw(GeoGraphValidationError, `you must provide a valid label - ${relation2}`);
        expect(() => statements.create(json3)).to.throw(GeoGraphValidationError, `you must provide a valid label - ${json3}`);
    });

    it('should throw error when trying to insert empty node', () => {
        let
            json1 = {},
            json2 = {
                _label: 'test'
            },
            json3 = {
                _label: 'test',
                name: 'name',
                relation: {}
            },
            json4 = {
                _label: 'test',
                name: 'name',
                relation: {
                    _label: 'test2',
                    property: 'value',
                    relation: {}
                }
            };

        expect(() => statements.create(json1)).to.throw(GeoGraphValidationError, 'you cannot insert an empty node');
        expect(() => statements.create(json2)).to.throw(GeoGraphValidationError, 'you cannot insert an empty node');
        expect(() => statements.create(json3)).to.throw(GeoGraphValidationError, 'you cannot insert an empty node');
        expect(() => statements.create(json4)).to.throw(GeoGraphValidationError, 'you cannot insert an empty node');
    });

    it('should return findById statement', () => {
        let statement = statements.findById(uuid.v4());

        expect(statement.cypher).to.match(new RegExp(`${matchRegex}\\sWITH \\w+ ${matchRelationshipRegex}\\sRETURN collect\\(\\w+\\), collect\\(\\w+\\)`));
    });

    it('should throw error when trying to find by invalid uuid', () => {
        expect(() => statements.findById()).to.throw(GeoGraphValidationError, 'you must provide a valid uuid');
        expect(() => statements.findById('asdfsadf')).to.throw(GeoGraphValidationError, 'you must provide a valid uuid');
    });
});