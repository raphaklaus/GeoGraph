const
    _ = require('lodash'),
    uuid = require('uuid'),
    expect = require('chai').expect,
    statements = require('../lib/utils/statement'),
    regexes = require('../lib/regexes'),
    GeoGraphValidationError = require('../lib/errors/geograph_validation_error');

function _getParamsNthKey(params, index = 0) {
    return params[_.keys(params)[index]];
}

describe('Statements', () => {

    let
        createCypherRegex = 'CREATE \\(\\w+:\\w+ \\$\\w+\\)\\s',
        createRelationshipCypherRegex = 'CREATE UNIQUE \\(\\w+\\)-\\[:\\w+\\]->\\(\\w+:\\w+ \\$\\w+\\)\\s',
        matchCypherRegex = 'MATCH \\(\\w+ \\{\\w+: \\$\\w+\\}\\)',
        matchLabelCypherRegex = 'MATCH \\(\\w+:\\w+\\)',
        getMatchRelationshipCypherRegex = (num) => `MATCH \\(\\w+\\)-\\[\\w+(:\\w+(\\|\\w+){${num}})?(\\*\\d\\.\\.)?\\]->\\(\\w+\\)`,
        collectCypherRegex = 'collect\\(\\w+\\)',
        getWhereCypherRegex = function (num) {
            return `WHERE (\\w+\\.${regexes.propertyFilter.source}( ${regexes.booleanOperators.source} \\w+\\.${regexes.propertyFilter.source}){${num}})`;
        },
        getWithCypherRegex = function (num) {
            return `WITH \\w+(,\\s*\\w+){${num}}`;
        },
        getEndCypherRegex = (num) => `RETURN \\w+(,\\s*(${collectCypherRegex})){${num}}\\n`,
        paginationCypherRegex = '((LIMIT \\d+)|(SKIP \\d+)|(SKIP \\d+ LIMIT \\d+))';

    it('should create statement query for simple node', () => {
        let statement = statements.create({
            _label: 'test',
            name: 'name test'
        });

        let params = _getParamsNthKey(statement.params);

        expect(statement.cypher).to.match(new RegExp(`^${createCypherRegex}$`));
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
        expect(statement.cypher).to.match(new RegExp(`^${createCypherRegex}(${createRelationshipCypherRegex}){3}$`));
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
        expect(statement.cypher).to.match(new RegExp(`^${createCypherRegex}(${createRelationshipCypherRegex}){3}$`));
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

        expect(statement.cypher).to.match(new RegExp(`^${matchCypherRegex}\\sWITH \\w+ ${getMatchRelationshipCypherRegex(0)}\\sRETURN collect\\(\\w+\\), collect\\(\\w+\\)$`));
    });

    it('should throw error when trying to find by invalid uuid', () => {
        expect(() => statements.findById()).to.throw(GeoGraphValidationError, 'you must provide a valid uuid');
        expect(() => statements.findById('asdfsadf')).to.throw(GeoGraphValidationError, 'you must provide a valid uuid');
    });

    it('should return statement with where filter', () => {
        let statement = statements.find({
            label: 'test',
            filter: '[property > 10]'
        });

        expect(statement.cypher).to.match(new RegExp(`^${matchLabelCypherRegex}\\s${getWhereCypherRegex(0)}\\s${getWithCypherRegex(0)}\\s${getEndCypherRegex(0)}$`));
    });

    it('should return statement with pagination', () => {
        let
            statement1 = statements.find({
                label: 'test',
                filter: '{skip=10}'
            }),
            statement2 = statements.find({
                label: 'test',
                filter: '{limit=5}'
            }),
            statement3 = statements.find({
                label: 'test',
                filter: '{skip=10 limit=5}'
            });

        expect(statement1.cypher).to.match(new RegExp(`^${matchLabelCypherRegex}\\s${getWithCypherRegex(0)}\\s${paginationCypherRegex}\\s${getEndCypherRegex(0)}$`));
        expect(statement2.cypher).to.match(new RegExp(`^${matchLabelCypherRegex}\\s${getWithCypherRegex(0)}\\s${paginationCypherRegex}\\s${getEndCypherRegex(0)}$`));
        expect(statement3.cypher).to.match(new RegExp(`^${matchLabelCypherRegex}\\s${getWithCypherRegex(0)}\\s${paginationCypherRegex}\\s${getEndCypherRegex(0)}$`));
    });

    it('should return statement with where and pagination', () => {
        let
            statement1 = statements.find({
                label: 'test',
                filter: '{skip=10} [property > 10]'
            }),
            statement2 = statements.find({
                label: 'test',
                filter: '{limit=5} [property = "value"]'
            }),
            statement3 = statements.find({
                label: 'test',
                filter: '{skip=10 limit=5} [property = "value" and anotherProperty <=5]'
            });

        expect(statement1.cypher).to.match(new RegExp(`^${matchLabelCypherRegex}\\s${getWhereCypherRegex(0)}\\s${getWithCypherRegex(0)}\\s${paginationCypherRegex}\\s${getEndCypherRegex(0)}$`));
        expect(statement1.cypher).to.match(new RegExp(`^${matchLabelCypherRegex}\\s${getWhereCypherRegex(0)}\\s${getWithCypherRegex(0)}\\s${paginationCypherRegex}\\s${getEndCypherRegex(0)}$`));
        expect(statement1.cypher).to.match(new RegExp(`^${matchLabelCypherRegex}\\s${getWhereCypherRegex(0)}\\s${getWithCypherRegex(0)}\\s${paginationCypherRegex}\\s${getEndCypherRegex(0)}$`));
    });

    it('should return statement with relationship match', () => {
        let statement = statements.find({
            label: 'test',
            relations: [
                'rel'
            ]
        });

        expect(statement.cypher).to.match(new RegExp(`^${matchLabelCypherRegex}\\s${getWithCypherRegex(0)}\\s${getMatchRelationshipCypherRegex(0)}\\s${getWithCypherRegex(1)}\\s${getEndCypherRegex(2)}$`));
    });

    it('should return statement with relationship where', () => {
        let statement = statements.find({
            label: 'test',
            relations: [
                'rel[property="value" AND anotherProperty > 10]'
            ]
        });
        expect(statement.cypher).to.match(new RegExp(`^${matchLabelCypherRegex}\\s${getWithCypherRegex(0)}\\s${getMatchRelationshipCypherRegex(0)}\\s${getWhereCypherRegex(1)}\\s${getWithCypherRegex(1)}\\s${getEndCypherRegex(2)}$`));
    });

    it('should return statement with relationship pagination', () => {
        let statement = statements.find({
            label: 'test',
            relations: [
                'rel{skip=10}'
            ]
        });
        expect(statement.cypher).to.match(new RegExp(`^${matchLabelCypherRegex}\\s${getWithCypherRegex(0)}\\s${getMatchRelationshipCypherRegex(0)}\\s${getWithCypherRegex(1)}\\s${paginationCypherRegex}\\s${getEndCypherRegex(2)}$`));
    });

    it('should return statement with relationship pagination and where', () => {
        let statement = statements.find({
            label: 'test',
            relations: [
                'rel{skip=10} [property = true OR anotherProperty IS NULL]'
            ]
        });
        expect(statement.cypher).to.match(new RegExp(`^${matchLabelCypherRegex}\\s${getWithCypherRegex(0)}\\s${getMatchRelationshipCypherRegex(0)}\\s${getWhereCypherRegex(1)}\\s${getWithCypherRegex(1)}\\s${paginationCypherRegex}\\s${getEndCypherRegex(2)}$`));
    });

    it('should return statement with where and relationship pagination and where', () => {
        let statement = statements.find({
            label: 'test',
            filter: '[property IS NOT NULL] {skip = 5 limit = 15}',
            relations: [
                'rel{skip=10} [property = true OR anotherProperty IS NULL]'
            ]
        });
        expect(statement.cypher).to.match(new RegExp(`^${matchLabelCypherRegex}\\s${getWhereCypherRegex(0)}\\s${getWithCypherRegex(0)}\\s${paginationCypherRegex}\\s${getMatchRelationshipCypherRegex(0)}\\s${getWhereCypherRegex(1)}\\s${getWithCypherRegex(1)}\\s${paginationCypherRegex}\\s${getEndCypherRegex(2)}$`));
    });

    it('should return statement with multiple relationships', () => {
        let
            queryObject = {
                label: 'test',
                relations: [
                    'rel1',
                    'rel2.rel3',
                    'rel4-rel5',
                    'rel6.rel7-rel8.rel9'
                ]
            },
            statement = statements.find(queryObject);

        let cypherRegexString = `^${matchLabelCypherRegex}\\s${getWithCypherRegex(0)}\\s`,
            num = 1;

        _.each(queryObject.relations, (relationString) =>
            _.each(relationString.split('.'), (relation) => {
                cypherRegexString += `${getMatchRelationshipCypherRegex(relation.split('-').length - 1)}\\s${getWithCypherRegex(num)}\\s`;
                num++;
            }));
        cypherRegexString += `${getEndCypherRegex(num + num - 2)}$`;

        expect(statement.cypher).to.match(new RegExp(cypherRegexString));
    });

    it('should return statement with multiple optional relationships', () => {
        let
            queryObject = {
                label: 'test',
                relations: [
                    'rel1',
                    '?rel2.rel3',
                    '?rel4-rel5',
                    '?rel6.?rel7-rel8.?rel9'
                ]
            },
            statement = statements.find(queryObject);

        let cypherRegexString = `^${matchLabelCypherRegex}\\s${getWithCypherRegex(0)}\\s`,
            num = 1;

        _.each(queryObject.relations, (relationString) =>
            _.each(relationString.split('.'), (relation) => {
                if (relation[0] == '?') {
                    cypherRegexString += 'OPTIONAL ';
                }
                cypherRegexString += `${getMatchRelationshipCypherRegex(relation.split('-').length - 1)}\\s${getWithCypherRegex(num)}\\s`;
                num++;
            }));
        cypherRegexString += `${getEndCypherRegex(num + num - 2)}$`;

        expect(statement.cypher).to.match(new RegExp(cypherRegexString));
    });

    it('should parse a complete queryObject with multiple relationships of multiple depths and filters and pagination', () => {
        let
            queryObject = {
                label: 'test',
                filter: '{skip=10 limit=5} [property = "value" AND anotherProperty <=5]',
                relations: [
                    'rel1 {limit=10}',
                    '?rel2.rel3[property IS NOT NULL]',
                    '?rel4-rel5 {skip=1 limit=2} [property = "value" AND anotherProperty <=5]',
                    '?rel6.?rel7-rel8.?rel9'
                ]
            },
            statement = statements.find(queryObject);

        let cypherRegexString = `^${matchLabelCypherRegex}\\s${getWhereCypherRegex(1)}\\s${getWithCypherRegex(0)}\\s${paginationCypherRegex}\\s`,
            num = 1;

        _.each(queryObject.relations, (relationString) =>
            _.each(relationString.split('.'), (relation) => {
                if (relation[0] == '?') {
                    cypherRegexString += 'OPTIONAL ';
                }
                cypherRegexString += `${getMatchRelationshipCypherRegex(relation.split('-').length - 1)}`;

                if (_.includes(relation, '[')) {
                    cypherRegexString += `\\s${getWhereCypherRegex((relation.match(regexes.booleanOperators) || [null]).length - 1)}`;
                }

                cypherRegexString += `\\s${getWithCypherRegex(num)}\\s`;

                if (_.includes(relation, '{')) {
                    cypherRegexString += `${paginationCypherRegex}\\s`;
                }

                num++;
            }));
        cypherRegexString += `${getEndCypherRegex(num + num - 2)}$`;

        expect(statement.cypher).to.match(new RegExp(cypherRegexString));
    });

    it('should validate queryObject', () => {
        let
            queryObject1 = {},
            queryObject2 = {
                label: 'test',
                relations: [
                    '..'
                ]
            },
            queryObject3 = {
                label: 'test',
                relations: 'lasdf'
            };

        expect(() => statements.find(queryObject1)).to.throw(GeoGraphValidationError, 'You must provide a label to start the search');
        expect(() => statements.find(queryObject2)).to.throw(GeoGraphValidationError, 'You must provide the name of the relationship');
        expect(() => statements.find(queryObject3)).to.throw(GeoGraphValidationError, 'relations must be an array');
    });
});