'use strict';
const
    GeoGraphValidationError = require('../errors/geograph_validation_error'),
    utils = require('./node'),
    regexes = require('../regexes'),
    node_uuid = require('uuid'),
    _ = require('lodash');

_.mixin(require('lodash-uuid'));

function _match(uuid, json) {
    let id = utils.getUniqueIdentifier(),
        statement = {
            cypher: `MATCH (${id} {uuid: $${id}.uuid})`,
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

function _createRelationship(id, key, value) {
    let
        statement = {
            cypher: '',
            params: {}
        },
        node = utils.extractNeo4jNode(value);

    if (_.isUuid(value.uuid)) {
        let matchStatment = _match(value.uuid, value);

        node.uuid = value.uuid;

        statement.cypher += `WITH ${id}`;
        statement.cypher += '\n' + matchStatment.cypher;
        statement.cypher += `\nCREATE UNIQUE (${id})-[:${key}]->(${matchStatment.id})`;
        statement.id = matchStatment.id;
        statement.params[matchStatment.id] = node;
    } else {

        let relatedId = utils.getUniqueIdentifier(),
            label = regexes.label.getGroup(value._label, 'label');

        if (_.isEmpty(node)) {
            throw new GeoGraphValidationError('you cannot insert an empty node');
        }

        if (!label) {
            throw new GeoGraphValidationError(`you must provide a valid label - ${value}`);
        }

        node.uuid = node_uuid.v4();

        statement.id = relatedId;
        statement.cypher += `CREATE UNIQUE (${id})-[:${key}]->(${relatedId}:${label} $${relatedId})`;
        statement.params[relatedId] = node;
    }

    return statement;
}

function _relateNodes(id, key, value, relatedNodes, statements) {
    if (utils.isNeo4jNode(value)) {
        let statement = _createRelationship(id, key, value);

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
                    _relateNodes(id, key, item, relatedNodes, statements);
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

function _mergeStatements(statements) {
    return _.transform(statements, (acc, next) => {
        acc.cypher += next.cypher + '\n';
        _.chain(next.params)
            .keys()
            .each((key) => acc.params[key] = next.params[key])
            .value();
    }, {
            cypher: '',
            params: {}
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
        relations = relationString.split('.'),
        statements = [];

    _.each(relations, (relation) => {

        let relationString = regexes.relation.getGroup(relation, 'relation');

        if (!relationString) {
            throw new GeoGraphValidationError('You must provide the name of the relationship');
        }

        let
            relatedId = utils.getUniqueIdentifier(),
            relationId = utils.getUniqueIdentifier(),
            relationType = relationString.split('-').join('|'),
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

        let where = regexes.where.getGroup(relation, 'where'),
            paginationString = regexes.pagination.getGroup(relation, 'pagination'),
            pagination = regexes.paginate.groups(paginationString);

        statement.cypher += _filterCypher(relation, relatedId);

        variables.nodes.push(relatedId);
        variables.relations.push(relationId);

        statement.cypher += ` WITH ${variables.nodes.join(',')}`;
        statement.cypher += _paginationCypher(relation);

        statements.push(statement);
    });

    return statements;
}

function create(json) {
    let
        node = utils.extractNeo4jNode(json),
        label = regexes.label.getGroup(json._label, 'label'),
        statements = [],
        statement;

    if (_.isEmpty(node)) {
        throw new GeoGraphValidationError('you cannot insert an empty node');
    }

    if (!label) {
        throw new GeoGraphValidationError(`you must provide a valid label - ${json}`);
    }

    if (_.isUuid(json.uuid)) {
        statement = _match(json.uuid, json);
    } else {
        let id = utils.getUniqueIdentifier(),
            uuid = node_uuid.v4();

        statement = {
            cypher: `CREATE (${id}:${label} $${id})`,
            params: {},
            id: id
        };

        node.uuid = uuid;
        statement.params[id] = node;
    }

    statements.push(statement);

    statements = _createRecursive(statement.id, statements, json);

    return _mergeStatements(statements);

}

function findById(uuid) {

    if (!_.isUuid(uuid)) {
        throw new GeoGraphValidationError('you must provide a valid uuid');
    }

    return {
        cypher: 'MATCH (a {uuid: $uuid})\n' +
        'WITH a MATCH (a)-[r*0..]->(b)\n' +
        'RETURN collect(b), collect(r)',
        params: {
            uuid: uuid
        }
    };
}

function find(queryObject) {

    if (!queryObject) {
        throw new GeoGraphValidationError('You must provid a query object with the rules of the search');
    }

    queryObject.relations = queryObject.relations || [];

    if (!_.isArray(queryObject.relations)) {
        throw new GeoGraphValidationError('relations must be an array');
    }

    let
        statements = [],
        statement = {
            cypher: '',
            params: {}
        },
        id = utils.getUniqueIdentifier(),
        label = regexes.label.getGroup(queryObject.label, 'label'),
        variables = {
            nodes: [],
            relations: []
        };

    variables.nodes.push(id);

    if (!label) {
        throw new GeoGraphValidationError('You must provide a label to start the search');
    }

    statement.cypher += `MATCH (${id}:${label})`;
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

    let
        collectedRelations = variables.relations.map((r) => `collect(${r})`),
        collectedNodes = variables.nodes.map((n) => `collect(${n})`),
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

module.exports.create = create;
module.exports.findById = findById;
module.exports.find = find;