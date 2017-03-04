'use strict';

import _ from 'lodash';

let indexes = [-1, 0],
    chars = _.range(65, 90).concat(_.range(97, 122));

function isGeoJSON(object) {
    return object && object.type == 'Feature' &&
        _.isObject(object.geometry) &&
        _.isString(object.geometry.type) &&
        _.isArray(object.geometry.coordinates);
}

function _isArrayOfPrimitives(array) {
    return array && !_.isEmpty(array) && _.isArray(array) &&
        _.every(array, (value) => _.isObject(value) && !_.isUuid(value));
}

function _invalidNeo4jValue(node, key) {
    return isGeoJSON(node[key]) || (_.isArray(node[key]) &&
        !_isArrayOfPrimitives(node[key])) || _.isObject(node[key]) || key == '_label' || key == 'uuid';
}

function extractNeo4jNode(json) {
    return _.chain(json)
        .keys()
        .reject((key) => _invalidNeo4jValue(json, key))
        .transform((result, key) => result[key] = json[key], {})
        .value();
}

function isNeo4jNode(json) {
    return _.isObject(json) && !_.isArray(json) && !isGeoJSON(json);
}

function getUniqueIdentifier() {
    //65-90 97-122

    indexes[0]++;

    if (indexes[0] >= chars.length) {
        indexes[0] = 0;
        indexes[1]++;
    }

    if (indexes[1] >= chars.length) {
        indexes[0] = -1;
        indexes[1] = 0;
    }

    return String.fromCharCode(chars[indexes[0]]) + String.fromCharCode(chars[indexes[1]]);
}

module.exports.getUniqueIdentifier = getUniqueIdentifier;
module.exports.isNeo4jNode = isNeo4jNode;
module.exports.extractNeo4jNode = extractNeo4jNode;