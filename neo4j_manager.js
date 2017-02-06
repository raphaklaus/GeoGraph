(function () {
    "use strict";

    const
        neo4j = require('neo4j-driver').v1,
        uuid = require('uuid'),
        _     = require('lodash');

    function nodeify(source, fn) {
        return function () {
            let callback = _.last(arguments);

            if (typeof callback == 'function') {
                fn.apply(source, arguments).then(function () {
                    callback(null, ...arguments);
                }, function (err) {
                    callback(err);
                })
            } else {
                return fn.apply(source, arguments)
            }
        }
    }

    function Transaction(trx) {
        return {
            run: nodeify(trx, trx.run),
            commit: nodeify(trx, trx.commit),
            rollback: nodeify(trx, trx.rollback)
        };
    }

    function Session(session) {
        session.run = nodeify(session, session.run);

        return session;
    }

    function _flattenResult(result) {

        return _.chain(result.records)
                .map('_fields')
                .flattenDeep()
                .value();
    }

    module.exports = function (config) {

        let driver = neo4j.driver(`bolt://${config.host}`);

        function _getSession() {
            return Session(driver.session());
        }

        function beginTransaction() {
            return Transaction(_getSession().beginTransaction());
        }

        function createNode(json, label, trx, callback) {

            if (typeof trx == 'function' && !callback) {
                callback = trx;
                trx      = _getSession();
            }

            label = _.words()[0] || '';

            let cypher = '';

            if (label) {
                cypher = `CREATE (n:${label} $node) return id(n)`
            } else {
                cypher = 'CREATE (n $node) return id(n)'
            }

            json.uuid = uuid.v4();

            trx.run(cypher, {
                node: json
            }, (err) => {
                callback(err, json.uuid);
            });
        }

        function getById(uuid, callback) {
            _getSession().run('MATCH (a) where a.uuid = $uuid\n WITH a MATCH (a)-[r*0..]->(b) ' +
                'RETURN collect(b), collect(r)', {
                uuid: uuid
            }, (err, result) => {
                if (err) {
                    callback(err);
                } else {
                    callback(err, _flattenResult(result));
                }
            });
        }

        function query(cypher, parameters, transaction, callback) {
            if (typeof transaction == 'function' && !callback) {
                callback = transaction;
                transaction = _getSession();
            }

            transaction.run(cypher, parameters, callback);
        }

        this.createNode       = createNode;
        this.beginTransaction = beginTransaction;
        this.getById       = getById;
        this.query       = query;
    }


})();