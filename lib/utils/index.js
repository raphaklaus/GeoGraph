"use strict";

import _ from 'lodash';

let functions = [
    function isGeoJSON(object) {
        return object && object.type == 'Feature' &&
            _.isObject(object.geometry) &&
            _.isString(object.geometry.type) &&
            _.isArray(object.geometry.coordinates);
    },
    function isArrayOfPrimitives(array) {
        return array && !_.isEmpty(array) && _.isArray(array) && 
            _.every(array, (value) => _.isObject(value) && !_.isUuid(value));
    },
    function invalidNeo4jValue(node, key) {
        return isGeoJSON(node[key]) || (_.isArray(node[key]) &&
            !_isArrayOfPrimitives(node[key])) || _.isObject(node[key]) || key == '_label'
    },
    function extractNeo4jNode(json) {
        return _.chain(node)
                    .keys()
                    .reject((key) => invalidNeo4jValue(node, key))
                    .transform((result, key) => result[key] = node[key], {})
                    .value();
    },


]