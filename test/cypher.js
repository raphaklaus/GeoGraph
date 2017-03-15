const
    _ = require('lodash'),
    node_uuid = require('uuid'),
    expect = require('chai').expect,
    statements = require('../lib/utils/cypher'),
    regexes = require('../lib/regexes'),
    GeoGraphValidationError = require('../lib/errors/geograph_validation_error');

function _getParamsNthKey(params, index = 0) {
    return params[_.keys(params)[index]];
}

describe('Cypher', () => {

    let
        createCypherRegex = 'CREATE \\(\\w+:\\w+:Geograph \\$\\w+\\)\\s',
        createRelationshipCypherRegex = 'CREATE UNIQUE \\(\\w+\\)-\\[:\\w+\\]->\\(\\w+:\\w+:Geograph \\$\\w+\\)\\s',
        matchCypherRegex = 'MATCH \\(\\w+:\\w+ \\{\\w+: \\$\\w+\\}\\)',
        matchLabelCypherRegex = 'MATCH \\(\\w+:Geograph:\\w+(:\\w+)*\\)',
        getMatchRelationshipCypherRegex = (num) => `MATCH \\(\\w+\\)-\\[\\w+(:\\w+(\\|\\w+){${num}})?(\\*\\d\\.\\.)?\\]->\\(\\w+\\)`,
        collectCypherRegex = 'collect\\(distinct \\w+\\)',
        getWhereCypherRegex = (num) => `WHERE (\\w+\\.${regexes.propertyFilter.source}( ${regexes.booleanOperators.source} \\w+\\.${regexes.propertyFilter.source}){${num}})`,
        getWithCypherRegex = (num) => `WITH \\w+(,\\s*\\w+){${num}}`,
        getEndCypherRegex = (num) => `RETURN \\w+(,\\s*(${collectCypherRegex})){${num}}\\n`,
        getDeleteRelationshipsRegex = (numRel) => {
            let
                string = 'MATCH \\(\\w+:\\w+ \\{\\w+: ".+"\\}\\) WITH \\w+\\s',
                acc = 2;

            for (var current = 0; current < numRel; current++) {
                string += `MATCH \\(\\w+\\)-\\[\\w+:\\w+\\]->\\(\\w+ \\{uuid: ".+"\\}\\) WITH \\w+(,\\w+){${acc}}\\s`;
                acc += 2;
            }

            string += `DELETE \\w+(,\\w+){${numRel -1}}`;

            return string;
        },
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

    it('should return start uuid when creating nodes', () => {
        let statement = statements.create({
           _label: 'test',
            name: 'name test'
        });

        expect(statement.start).to.not.be.undefined;
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

    it('should return findById statement', () => {
        let statement = statements.findById('Test', node_uuid.v4());

        expect(statement.cypher).to.match(new RegExp(`^${matchCypherRegex}\\sWITH \\w+ ${getMatchRelationshipCypherRegex(0)}\\sRETURN collect\\(distinct \\w+\\), collect\\(distinct \\w+\\)$`));
    });

    it('should throw error when trying to find by invalid uuid', () => {
        expect(() => statements.findById()).to.throw(GeoGraphValidationError, 'you must provide a valid uuid');
        expect(() => statements.findById('asdfsadf')).to.throw(GeoGraphValidationError, 'you must provide a valid uuid');
    });

    it('should throw error when trying to find by uuid with invlalid label', () => {
        expect(() => statements.findById(null, node_uuid.v4())).to.throw(GeoGraphValidationError);
        expect(() => statements.findById('1label', node_uuid.v4())).to.throw(GeoGraphValidationError);
    });

    it('should return statement with where filter', () => {
        let statement = statements.find({
            labels: ['test'],
            filter: '[property > 10]'
        });

        expect(statement.cypher).to.match(new RegExp(`^${matchLabelCypherRegex}\\s${getWhereCypherRegex(0)}\\s${getWithCypherRegex(0)}\\s${getEndCypherRegex(0)}$`));
    });

    it('should return statement with pagination', () => {
        let
            statement1 = statements.find({
                labels: ['test'],
                filter: '{skip=10}'
            }),
            statement2 = statements.find({
                labels: ['test'],
                filter: '{limit=5}'
            }),
            statement3 = statements.find({
                labels: ['test'],
                filter: '{skip=10 limit=5}'
            });

        expect(statement1.cypher).to.match(new RegExp(`^${matchLabelCypherRegex}\\s${getWithCypherRegex(0)}\\s${paginationCypherRegex}\\s${getEndCypherRegex(0)}$`));
        expect(statement2.cypher).to.match(new RegExp(`^${matchLabelCypherRegex}\\s${getWithCypherRegex(0)}\\s${paginationCypherRegex}\\s${getEndCypherRegex(0)}$`));
        expect(statement3.cypher).to.match(new RegExp(`^${matchLabelCypherRegex}\\s${getWithCypherRegex(0)}\\s${paginationCypherRegex}\\s${getEndCypherRegex(0)}$`));
    });

    it('should return statement with where and pagination', () => {
        let
            statement1 = statements.find({
                labels: ['test'],
                filter: '{skip=10} [property > 10]'
            }),
            statement2 = statements.find({
                labels: ['test'],
                filter: '{limit=5} [property = "value"]'
            }),
            statement3 = statements.find({
                labels: ['test'],
                filter: '{skip=10 limit=5} [property = "value" and anotherProperty <=5]'
            });

        expect(statement1.cypher).to.match(new RegExp(`^${matchLabelCypherRegex}\\s${getWhereCypherRegex(0)}\\s${getWithCypherRegex(0)}\\s${paginationCypherRegex}\\s${getEndCypherRegex(0)}$`));
        expect(statement1.cypher).to.match(new RegExp(`^${matchLabelCypherRegex}\\s${getWhereCypherRegex(0)}\\s${getWithCypherRegex(0)}\\s${paginationCypherRegex}\\s${getEndCypherRegex(0)}$`));
        expect(statement1.cypher).to.match(new RegExp(`^${matchLabelCypherRegex}\\s${getWhereCypherRegex(0)}\\s${getWithCypherRegex(0)}\\s${paginationCypherRegex}\\s${getEndCypherRegex(0)}$`));
    });

    it('should return statement with relationship match', () => {
        let statement = statements.find({
            labels: ['test'],
            relations: [
                'rel'
            ]
        });

        expect(statement.cypher).to.match(new RegExp(`^${matchLabelCypherRegex}\\s${getWithCypherRegex(0)}\\s${getMatchRelationshipCypherRegex(0)}\\s${getWithCypherRegex(2)}\\s${getEndCypherRegex(2)}$`));
    });

    it('should return statement with relationship where', () => {
        let statement = statements.find({
            labels: ['test'],
            relations: [
                'rel[property="value" AND anotherProperty > 10]'
            ]
        });
        expect(statement.cypher).to.match(new RegExp(`^${matchLabelCypherRegex}\\s${getWithCypherRegex(0)}\\s${getMatchRelationshipCypherRegex(0)}\\s${getWhereCypherRegex(1)}\\s${getWithCypherRegex(2)}\\s${getEndCypherRegex(2)}$`));
    });

    it('should return statement with relationship pagination', () => {
        let statement = statements.find({
            labels: ['test'],
            relations: [
                'rel{skip=10}'
            ]
        });
        expect(statement.cypher).to.match(new RegExp(`^${matchLabelCypherRegex}\\s${getWithCypherRegex(0)}\\s${getMatchRelationshipCypherRegex(0)}\\s${getWithCypherRegex(2)}\\s${paginationCypherRegex}\\s${getEndCypherRegex(2)}$`));
    });

    it('should return statement with relationship pagination and where', () => {
        let statement = statements.find({
            labels: ['test'],
            relations: [
                'rel{skip=10} [property = true OR anotherProperty IS NULL]'
            ]
        });
        expect(statement.cypher).to.match(new RegExp(`^${matchLabelCypherRegex}\\s${getWithCypherRegex(0)}\\s${getMatchRelationshipCypherRegex(0)}\\s${getWhereCypherRegex(1)}\\s${getWithCypherRegex(2)}\\s${paginationCypherRegex}\\s${getEndCypherRegex(2)}$`));
    });

    it('should return statement with where and relationship pagination and where', () => {
        let statement = statements.find({
            labels: ['test'],
            filter: '[property IS NOT NULL] {skip = 5 limit = 15}',
            relations: [
                'rel{skip=10} [property = true OR anotherProperty IS NULL]'
            ]
        });
        expect(statement.cypher).to.match(new RegExp(`^${matchLabelCypherRegex}\\s${getWhereCypherRegex(0)}\\s${getWithCypherRegex(0)}\\s${paginationCypherRegex}\\s${getMatchRelationshipCypherRegex(0)}\\s${getWhereCypherRegex(1)}\\s${getWithCypherRegex(2)}\\s${paginationCypherRegex}\\s${getEndCypherRegex(2)}$`));
    });

    it('should return statement with multiple relationships', () => {
        let
            queryObject = {
                labels: ['test'],
                relations: [
                    'rel1',
                    'rel2->rel3',
                    'rel4|rel5',
                    'rel6->rel7|rel8->rel9'
                ]
            },
            statement = statements.find(queryObject);

        let cypherRegexString = `^${matchLabelCypherRegex}\\s${getWithCypherRegex(0)}\\s`,
            num = 1,
            numRel = 1;
        
        _.each(queryObject.relations, (relationString) => {
            _.each(relationString.split('->'), (relation) => {
                cypherRegexString += `${getMatchRelationshipCypherRegex(relation.split('|').length - 1)}\\s${getWithCypherRegex(num + numRel)}\\s`;
                numRel++;
                num++;
            });
        });
        cypherRegexString += `${getEndCypherRegex(num + num - 2)}$`;

        expect(statement.cypher).to.match(new RegExp(cypherRegexString));
    });

    it('should return statement with multiple optional relationships', () => {
        let
            queryObject = {
                labels: ['test'],
                relations: [
                    'rel1',
                    '?rel2->rel3',
                    '?rel4|rel5',
                    '?rel6->?rel7|rel8->?rel9'
                ]
            },
            statement = statements.find(queryObject);

        let cypherRegexString = `^${matchLabelCypherRegex}\\s${getWithCypherRegex(0)}\\s`,
            num = 1,
            numRel = 1;

        _.each(queryObject.relations, (relationString) =>
            _.each(relationString.split('->'), (relation) => {
                if (relation[0] == '?') {
                    cypherRegexString += 'OPTIONAL ';
                }
                cypherRegexString += `${getMatchRelationshipCypherRegex(relation.split('|').length - 1)}\\s${getWithCypherRegex(num + numRel)}\\s`;
                num++;
                numRel++;
            }));
        cypherRegexString += `${getEndCypherRegex(num + num - 2)}$`;

        expect(statement.cypher).to.match(new RegExp(cypherRegexString));
    });

    it('should parse a complete queryObject with multiple relationships of multiple depths and filters and pagination', () => {
        let
            queryObject = {
                labels: ['test'],
                filter: '{skip=10 limit=5} [property = "value" AND anotherProperty <=5]',
                relations: [
                    'rel1 {limit=10}',
                    '?rel2|rel3[property IS NOT NULL]',
                    '?rel4->rel5 {skip=1 limit=2} [property = "value" AND anotherProperty <=5]',
                    '?rel6->?rel7|rel8->?rel9'
                ]
            },
            statement = statements.find(queryObject);

        let cypherRegexString = `^${matchLabelCypherRegex}\\s${getWhereCypherRegex(1)}\\s${getWithCypherRegex(0)}\\s${paginationCypherRegex}\\s`,
            num = 1,
            numRel = 1;

        _.each(queryObject.relations, (relationString) =>
            _.each(relationString.split('->'), (relation) => {
                if (relation[0] == '?') {
                    cypherRegexString += 'OPTIONAL ';
                }
                cypherRegexString += `${getMatchRelationshipCypherRegex(relation.split('|').length - 1)}`;

                if (_.includes(relation, '[')) {
                    cypherRegexString += `\\s${getWhereCypherRegex((relation.match(regexes.booleanOperators) || [null]).length - 1)}`;
                }

                cypherRegexString += `\\s${getWithCypherRegex(num + numRel)}\\s`;

                if (_.includes(relation, '{')) {
                    cypherRegexString += `${paginationCypherRegex}\\s`;
                }

                num++;
                numRel++;
            }));
        cypherRegexString += `${getEndCypherRegex(num + num - 2)}$`;

        expect(statement.cypher).to.match(new RegExp(cypherRegexString));
    });

    it('should validate queryObject', () => {
        let
            queryObject1 = {},
            queryObject2 = {
                labels: ['test'],
                relations: [
                    '..'
                ]
            },
            queryObject3 = {
                labels: ['test'],
                relations: 'lasdf'
            };

        expect(() => statements.find(queryObject1)).to.throw(GeoGraphValidationError, 'You must provide a labels array to start the search');
        expect(() => statements.find(queryObject2)).to.throw(GeoGraphValidationError, 'You must provide the name of the relationship');
        expect(() => statements.find(queryObject3)).to.throw(GeoGraphValidationError, 'relations must be an array');
        expect(() => statements.find()).to.throw(GeoGraphValidationError, 'You must provide a query object');
    });

    it('should return statement to delete nodes by id', () => {
        let
            uuid = node_uuid.v4(),
            statement1 = statements.deleteNodesById('Test', [uuid]),
            statement2 = statements.deleteNodesById('Test', uuid);

        expect(statement1.cypher).to.be.equal('MATCH (n:Test) where n.uuid in $uuids DETACH DELETE n RETURN n');
        expect(statement1.params).to.be.deep.equal({
            uuids: [uuid]
        });
        expect(statement2.cypher).to.be.equal('MATCH (n:Test) where n.uuid in $uuids DETACH DELETE n RETURN n');
        expect(statement2.params).to.be.deep.equal({
            uuids: [uuid]
        });
    });

    it('should throw error when trying to delete nodes with invalid uuids', () => {
        expect(() => statements.deleteNodesById('potato')).to.throw(GeoGraphValidationError, 'You must provide valid uuids');
    });

    it('should return statement to delete nodes by query object', () => {
        let statement = statements.deleteNodesByQueryObject({
            labels: ['test'],
            filter: '[property = "value"]',
            relations: [
                'rel'
            ]
        });

        expect(statement.cypher).to.match(new RegExp(`^${matchLabelCypherRegex}\\s${getWhereCypherRegex(0)}\\s${getWithCypherRegex(0)}` +
            `\\s${getMatchRelationshipCypherRegex(0)}\\s${getWithCypherRegex(2)}\\sDETACH DELETE \\w+(,\\w+)*\\sRETURN \\w+(,\\w+)*\n$`));
    });

    it('should return statement to delete one relationship', () => {
        let
            statement = statements.deleteRelationships({
               _label: 'test',
                uuid: node_uuid.v4(),
                rel: {
                    uuid: node_uuid.v4()
                }
            });

        expect(statement.cypher).to.match(new RegExp(getDeleteRelationshipsRegex(1)));
    });

    it('should return statement to delete multiples relationships', () => {
        let
            statement = statements.deleteRelationships({
               _label: 'test',
                uuid: node_uuid.v4(),
                rel: {
                    uuid: node_uuid.v4()
                },
                rel2: {
                    uuid: node_uuid.v4()
                }
            });

        expect(statement.cypher).to.match(new RegExp(getDeleteRelationshipsRegex(2)));
    });

    it('should return statement to delete multiples deep relationships', () => {
        let
            statement = statements.deleteRelationships({
               _label: 'test',
                uuid: node_uuid.v4(),
                rel: {
                    uuid: node_uuid.v4()
                },
                rel2: {
                    uuid: node_uuid.v4(),
                    rel3: {
                        uuid: node_uuid.v4(),
                        rel4: {
                            uuid: node_uuid.v4()
                        },
                        rel5: {
                            uuid: node_uuid.v4()
                        }
                    }
                }
            });

        expect(statement.cypher).to.match(new RegExp(getDeleteRelationshipsRegex(5)));
    });

    it('should throw error when trying to delete relationships without passing any relationship', () => {
        expect(() => statements.deleteRelationships({
            uuid: node_uuid.v4(),
           _label: 'test'
        })).to.throw(GeoGraphValidationError, 'You must provide at least one relationship to remove');
    });

    it('should throw error when trying to delete relationships with an empty node', () => {
        expect(() => statements.deleteRelationships({})).to.throw(GeoGraphValidationError, 'You must provide non-empty nodes');
    });

    it('should throw error when trying to delete relationships with invalid root label', () => {
        expect(() => statements.deleteRelationships({
            uuid: node_uuid.v4(),
        })).to.throw(GeoGraphValidationError, /You must provide a valid label/);
        expect(() => statements.deleteRelationships({
            uuid: node_uuid.v4(),
            _label: '12invalid'
        })).to.throw(GeoGraphValidationError, /You must provide a valid label/);
        expect(() => statements.deleteRelationships({
            uuid: node_uuid.v4(),
            _label: ''
        })).to.throw(GeoGraphValidationError, /You must provide a valid label/);
    });

    it('should throw error when trying to delete relationships with invalid uuid', () => {
        expect(() => statements.deleteRelationships({
           _label: 'test'
        })).to.throw(GeoGraphValidationError, /You must provide a valid uuid/);
        expect(() => statements.deleteRelationships({
           _label: 'test',
            uuid: node_uuid.v4(),
            rel: {
                uuid: 'invalid'
            }
        })).to.throw(GeoGraphValidationError, /You must provide a valid uuid/);
        expect(() => statements.deleteRelationships({
           _label: 'test',
            uuid: node_uuid.v4(),
            rel: {
                uuid: node_uuid.v4(),
                subRel: {
                    uuid: node_uuid.v4(),
                    deeperRel: {
                        uuid: ''
                    }
                }
            }
        })).to.throw(GeoGraphValidationError, /You must provide a valid uuid/);
    });
});