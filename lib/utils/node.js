'use strict';

const
    _ = require('lodash'),
    moment = require('moment'),
    GeoGraphValidationError = require('../errors/geograph_validation_error');

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
        !_isArrayOfPrimitives(node[key])) || (_.isObject(node[key]) && !moment.isDate(node[key])) || 
        key == '_label' || key == 'uuid';
}

function extractNeo4jNode(json) {
    return _.chain(json)
        .keys()
        .reject((key) => _invalidNeo4jValue(json, key))
        .transform((result, key) => {
            
            let value = json[key];

            if (moment.isDate(value)) {
                if (!moment(value).valueOf()) {
                    throw new GeoGraphValidationError(`You must provide a valid date - ${value}`);
                }
                result[key] = moment(value).valueOf();
            } else {
                result[key] = value;
            }
        }, {})
        .value();
}

function isNeo4jNode(json) {
    return _.isObject(json) && !_.isArray(json) && !isGeoJSON(json) && !moment.isDate(json);
}

function getUniqueIdentifier() {
    return _.uniqueId('v');
}

module.exports.getUniqueIdentifier = getUniqueIdentifier;
module.exports.isNeo4jNode = isNeo4jNode;
module.exports.extractNeo4jNode = extractNeo4jNode;
module.exports.isGeoJSON = isGeoJSON;