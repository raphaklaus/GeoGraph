"use strict";

const
    _       = require('lodash'),
    XRegExp = require('xregexp');

let comparisonOperators = '(=|<>|>|<|<=|>=)',
    nullOperators       = '(IS NULL|IS NOT NULL)',
    value               = '(("[\\w\\s]*")|(\\w+))',
    propertyFilter      = `(?<property>\\w+\\s*((${comparisonOperators}\\s*${value})|${nullOperators}))`,
    where               = `\\[(?<where>.+)\\]`,
    limit               = '(limit\\s*=\\s*(?<limit>\\d+))',
    skip                = '(skip\\s*=\\s*(?<skip>\\d+))',
    paginate            = `(${skip}|${limit})`,
    pagination = '\\((?<pagination>.+)\\)'

function _groups(match) {
    var o = {};
    for (var p in match) {
        if (isNaN(+p) && ['input', 'index'].indexOf(p) < 0) {
            o[p] = match[p];
        }
    }
    return o;
}

function Regex (regex, flags) {
    let _regex = XRegExp(regex, flags);

    _regex.groups = function (string) {
        let matches = [];
        XRegExp.forEach(string, _regex, function (match) {
            matches.push(_groups(match));
        });

        return _.transform(matches, (acc, match) => {
            _.chain(match)
             .keys()
             .each((key) => {
                 if (match[key]) {
                     acc[key] = match[key]
                 }
             })
             .value()
        }, {});
    }

    _regex.enumerateGroups = function (string, groupName) {
        let matches = [];

        XRegExp.forEach(string, _regex, function (match) {
            matches.push(_groups(match));
        });

        return _.chain(matches)
            .map(groupName)
            .filter()
            .value();
    }

    _regex.getGroup = function (string, groupName) {
        return (XRegExp.exec(string, _regex) || {})[groupName];
    }

    return _regex;
}

module.exports.paginate       = new Regex(paginate, 'g');
module.exports.where          = new Regex(where, 'g');
module.exports.propertyFilter = new Regex(propertyFilter, 'g');
module.exports.pagination = new Regex(pagination, 'g');