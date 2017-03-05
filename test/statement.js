const
    _ = require('lodash'),
    expect = require('chai').expect,
    statements = require('../lib/utils/statement'),
    GeoGraphValidationError = require('../lib/errors/geograph_validation_error');

function _getParamsNthKey(params, index = 0) {
    return params[_.keys(params)[index]];
}

describe('Statements', () => {

    let
        createRegex = 'CREATE \\(\\w+:\\w+ \\$\\w+\\)\\s',
        createRelationshipRegex = 'CREATE UNIQUE \\(\\w+\\)-\\[:\\w+\\]->\\(\\w+:\\w+ \\$\\w+\\)\\s';
    it('should create simple create cypher query', () => {
        let statement = statements.getCreateCypher({
            _label: 'test',
            name: 'name test'
        });

        let params = _getParamsNthKey(statement.params);

        expect(statement.cypher).to.match(new RegExp(createRegex));
        expect(params).to.have.property('uuid');
        expect(params).to.have.property('name', 'name test');
    });

    it('should create simple create cypher query with multiple properties', () => {
        let
            date = new Date(),
            statement = statements.getCreateCypher({
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

    it('shoud create cypher query with multiple relationships', () => {
        let statement = statements.getCreateCypher({
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

    it('should create multiple relationships with multiple dephts', () => {
        let statement = statements.getCreateCypher({
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

        expect(() => statements.getCreateCypher(json)).to.throw(GeoGraphValidationError, `you must provide a valid label - ${json}`);
    });

    it('should throw error when trying to insert node with invalid label', () => {

        let json = {
            _label: '12label',
            property: 'value'
        };

        expect(() => statements.getCreateCypher(json)).to.throw(GeoGraphValidationError, `you must provide a valid label - ${json}`);
    });

    it('shoud throw error when trying to insert relationship without label', () => {
        let
            relation = {
                property: 'value'
            },
            json = {
                _label: 'test',
                property: true,
                relation: relation
            };

        expect(() => statements.getCreateCypher(json)).to.throw(GeoGraphValidationError, `you must provide a valid label - ${relation}`);
    });

    it('shoud throw error when trying to insert deep relationship without label', () => {
        let
            relation = {
                property: 'value'
            },
            json = {
                _label: 'test',
                property: true,
                relation: {
                    _label: 'test',
                    subRelation: relation
                }
            };

        expect(() => statements.getCreateCypher(json)).to.throw(GeoGraphValidationError, `you must provide a valid label - ${relation}`);
    });
});