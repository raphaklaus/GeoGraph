'use strict';
const
    GeoGraphValidationError = require('../errors/geograph_validation_error'),
    utils = require('./node'),
    regexes = require('../regexes'),
    node_uuid = require('uuid'),
    _ = require('lodash');

_.mixin(require('lodash-uuid'));

function _match(uuid, json, label) {
    let id = utils.getUniqueIdentifier(),
        statement = {
            cypher: `MATCH (${id}:${label} {uuid: $${id}.uuid})`,
            params: {},
            id: id
        };

    let updates = _.chain(json)
        .keys()
        .filter(key => key != '_label' && key != 'uuid')
        .map((key) => `${id}.${key} = $${id}.${key}`)
        .value();

    if (updates.length) {
        statement.cypher += ` SET ${updates.join(', ')}`;
    }

    json = json || {};
    json.uuid = uuid;

    statement.params[id] = json;

    return statement;
}

function _createRelationship(id, key, value, relationshipProperties = { isArray: true}) {
    let
        statement = {
            cypher: '',
            params: {}
        },
        label = regexes.label.getGroup(value._label, 'label'),
        node = utils.extractNeo4jNode(value);

    if (_.isUuid(value.uuid)) {
        let matchStatment = _match(value.uuid, node, label);

        node.uuid = value.uuid;

        statement.cypher += `WITH ${id}`;
        statement.cypher += '\n' + matchStatment.cypher;
        statement.cypher += `\nCREATE UNIQUE (${id})-[:${key} {${JSON.stringify(relationshipProperties)}}]->(${matchStatment.id})`;
        statement.id = matchStatment.id;
        statement.params[matchStatment.id] = node;
    } else {

        let relatedId = utils.getUniqueIdentifier();
        
        if (!label) {
            throw new GeoGraphValidationError(`you must provide a valid label - ${value}`);
        }

        node.uuid = node_uuid.v4();
        value.uuid = node.uuid;

        statement.id = relatedId;
        statement.cypher += `CREATE UNIQUE (${id})-[:${key}]->(${relatedId}:${label}:Geograph $${relatedId})`;
        statement.params[relatedId] = node;
    }

    return statement;
}

function _relateNodes(id, key, value, relatedNodes, statements, relationshipProperties) {
    if (utils.isNeo4jNode(value)) {
        let statement = _createRelationship(id, key, value, relationshipProperties);

        relatedNodes[statement.id] = value;
        statements.push(statement);
    }
}

function _createRecursive(id, statements, json) {
    let relatedNodes = {};

    _.chain(json)
        .keys()
        .each((key) => {
            let value = json[key];
            if (_.isArray(value)) {
                _.each(value, (item) => {
                    _relateNodes(id, key, item, relatedNodes, statements, {
                        isArray: true
                    });
                });
            } else {
                _relateNodes(id, key, value, relatedNodes, statements);
            }
        })
        .value();

    _.chain(relatedNodes)
        .keys()
        .each((key) => _createRecursive(key, statements, relatedNodes[key]))
        .value();

    return statements;
}

function _mergeStatements(statements, start) {
    return _.transform(statements, (acc, next) => {
        acc.cypher += next.cypher + '\n';
        _.chain(next.params)
            .keys()
            .each((key) => acc.params[key] = next.params[key])
            .value();
    }, {
        cypher: '',
        params: {},
        start: start
    });
}


function _filterCypher(filterString, relatedId) {
    let where = regexes.where.getGroup(filterString, 'where'),
        cypher = '';

    if (where) {
        let filters = where.replace(regexes.propertyFilter, `${relatedId}.$1`);

        if (filters.length) {
            cypher += ` WHERE ${filters}`;
        }
    }

    return cypher;
}

function _paginationCypher(filterString) {
    let
        paginationString = regexes.pagination.getGroup(filterString, 'pagination'),
        pagination = regexes.paginate.groups(paginationString),
        cypher = '';

    if (!_.isEmpty(pagination)) {
        if (pagination.skip) {
            cypher += ` SKIP ${pagination.skip}`;
        }
        if (pagination.limit) {
            cypher += ` LIMIT ${pagination.limit}`;
        }
    }

    return cypher;
}

function _matchRelationship(id, relationString, variables) {
    let
        relations = relationString.split('->'),
        statements = [];

    _.each(relations, (relation) => {

        let relationType = regexes.relation.getGroup(relation, 'relation');

        if (!relationType) {
            throw new GeoGraphValidationError('You must provide the name of the relationship');
        }

        let
            relatedId = utils.getUniqueIdentifier(),
            relationId = regexes.variable.getGroup(relation, 'variable') || utils.getUniqueIdentifier(),
            isOptional = _.startsWith(relation, '?'),
            statement = {
                cypher: '',
                variables: []
            };

        if (isOptional) {
            relation = relation.substring(1);
            statement.cypher += 'OPTIONAL ';
        }
        statement.cypher += `MATCH (${id})-[${relationId}:${relationType}]->(${relatedId})`;
        statement.cypher += _filterCypher(relation, relatedId);

        variables.nodes.push(relatedId);
        variables.relations.push(relationId);

        statement.cypher += ` WITH ${[...variables.nodes, ...variables.relations].join(',')}`;
        statement.cypher += _paginationCypher(relation);

        statements.push(statement);
    });

    return statements;
}

function _find(queryObject) {
    if (!queryObject) {
        throw new GeoGraphValidationError('You must provide a query object');
    }

    queryObject.relations = queryObject.relations || [];

    if (!_.isArray(queryObject.relations)) {
        throw new GeoGraphValidationError('relations must be an array');
    }
    if (!_.isArray(queryObject.labels)) {
        throw new GeoGraphValidationError('You must provide a labels array to start the search');
    }

    let
        statements = [],
        statement = {
            cypher: '',
            params: {}
        },
        id = regexes.variable.getGroup(queryObject.filter, 'variable') || utils.getUniqueIdentifier(),
        variables = {
            nodes: [],
            relations: []
        };

    variables.nodes.push(id);

    statement.cypher += `MATCH (${id}:Geograph:${queryObject.labels.join(':')})`;
    statement.cypher += _filterCypher(queryObject.filter, id);
    statement.cypher += ` WITH ${id}`;
    statement.cypher += _paginationCypher(queryObject.filter);

    statements.push(statement);

    _.chain(queryObject.relations)
        .map((relation) => _matchRelationship(id, relation, variables))
        .flatten()
        .each((statement) => statements.push(statement))
        .value();

    _.pull(variables.nodes, id);

    return {
        start: id,
        statements: statements,
        variables: variables
    };
}

function _matchDirectRelationship(id, value, key, statements, variables) {
    if (value && _.has(value, 'uuid')) {
        if (!_.isUuid(value.uuid)) {
            throw new GeoGraphValidationError(`You must provide a valid uuid - ${value.uuid}`);
        }

        let
            relatedId = utils.getUniqueIdentifier(),
            relationId = utils.getUniqueIdentifier();

        variables.nodes.push(relatedId);
        variables.relationships.push(relationId);

        statements.push({
            cypher: `MATCH (${id})-[${relationId}:${key}]->(${relatedId} {uuid: "${value.uuid}"}) ` +
            `WITH ${[...variables.nodes, ...variables.relationships].join(',')}`,
            params: {}
        });

        _jsonToMatchStatementsRecursive(relatedId, value, statements, variables);
    }
}

function _jsonToMatchStatementsRecursive(id, json, statements, variables) {
    _.each(json, (value, key) => {
        if (value) {
            if (_.isArray(value)) {
                _.each(value, item => _matchDirectRelationship(id, item, key, statements, variables));
            } else {
                _matchDirectRelationship(id, value, key, statements, variables);
            }
        }
    });
}

function _jsonToMatchStatements(json) {

    let
        statements = [],
        variables = {
            nodes: [],
            relationships: []
        },
        label = regexes.label.getGroup(json._label, 'label'),
        id = utils.getUniqueIdentifier();
    
    if (_.isEmpty(json)) {
        throw new GeoGraphValidationError('You must provide non-empty nodes');
    }

    if (!_.isUuid(json.uuid)) {
        throw new GeoGraphValidationError(`You must provide a valid uuid - ${json.uuid}`);
    }

    variables.nodes.push(id);

    statements.push({
        cypher: `MATCH (${id}:Geograph {uuid: "${json.uuid}"}) WITH ${id}`
    });

    _jsonToMatchStatementsRecursive(id, json, statements, variables);

    return {
        statements, 
        variables
    };
}

function save(json) {
    let
        node = utils.extractNeo4jNode(json),
        label = regexes.label.getGroup(json._label, 'label'),
        statements = [],
        statement,
        start;

    if (!label) {
        throw new GeoGraphValidationError(`you must provide a valid label - ${json}`);
    }

    if (_.isUuid(json.uuid)) {
        start = json.uuid;
        statement = _match(json.uuid, node, label);
    } else {
        let id = utils.getUniqueIdentifier(),
            uuid = node_uuid.v4();

        statement = {
            cypher: `CREATE (${id}:${label}:Geograph $${id})`,
            params: {},
            id: id
        };
        json.uuid = uuid;
        node.uuid = uuid;
        start = uuid;
        statement.params[id] = node;
    }

    statements.push(statement);

    statements = _createRecursive(statement.id, statements, json);

    return _mergeStatements(statements, start);

}

function findById(label, uuid) {

    let validLabel = regexes.label.getGroup(label, 'label');

    if (!_.isUuid(uuid)) {
        throw new GeoGraphValidationError('you must provide a valid uuid');
    }

    if (!validLabel) {
        throw new GeoGraphValidationError('you must provide a valid label');
    }

    return {
        cypher: `MATCH (a:${validLabel} {uuid: $uuid})\n` +
        'WITH a MATCH (a)-[r*0..]->(b)\n' +
        'RETURN collect(distinct b), collect(distinct r)',
        params: {
            uuid: uuid
        }
    };
}

function find(queryObject) {

    let
        result = _find(queryObject),
        statements = result.statements,
        variables = result.variables,
        id = result.start,
        collectedRelations = variables.relations.map((r) => `collect(distinct ${r})`),
        collectedNodes = variables.nodes.map((n) => `collect(distinct ${n})`),
        returnStatement = {
            cypher: ''
        };

    returnStatement.cypher += `RETURN ${id}`;

    if (collectedRelations.length) {
        returnStatement.cypher += `, ${collectedRelations}`;
    }
    if (collectedNodes.length) {
        returnStatement.cypher += `, ${collectedNodes}`;
    }

    statements.push(returnStatement);

    return _mergeStatements(statements);
}

function deleteNodesById(uuids) {

    if (!_.isArray(uuids)) {
        uuids = [uuids];
    }

    if (_.some(uuids, (uuid) => !_.isUuid(uuid))) {
        throw new GeoGraphValidationError('You must provide valid uuids');
    }

    return {
        cypher: 'MATCH (n:Geograph) where n.uuid in $uuids DETACH DELETE n RETURN n',
        params: {
            uuids: uuids
        }
    };
}

function deleteNodesByQueryObject(queryObject) {
    let
        result = _find(queryObject),
        variables = [result.start, ...result.variables.nodes],
        deleteStatement = {
            cypher: `DETACH DELETE ${variables.join(',')}\nRETURN ${variables.join(',')}`,
        };

    return _mergeStatements([...result.statements, deleteStatement]);
}

function deleteRelationships(json) {

    let
        { statements, variables } = _jsonToMatchStatements(json),
        cypher = _.map(statements, 'cypher').join('\n');
    
    if (statements.length == 1) {
        throw new GeoGraphValidationError('You must provide at least one relationship to remove');
    }

    return {
        cypher: cypher += `\nDELETE ${variables.relationships.join(',')}`,
        params: {}
    };
}

module.exports.save = save;
module.exports.findById = findById;
module.exports.find = find;
module.exports.deleteNodesById = deleteNodesById;
module.exports.deleteNodesByQueryObject = deleteNodesByQueryObject;
module.exports.deleteRelationships = deleteRelationships;