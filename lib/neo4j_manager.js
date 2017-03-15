(function () {
    'use strict';

    const
        neo4j   = require('neo4j-driver').v1,
        uuid    = require('uuid'),
        _       = require('lodash'),
        Promise = require('bluebird');

    function nodeify(source, fn) {
        return function () {
            let callback = _.last(arguments);

            if (typeof callback == 'function') {
                fn.apply(source, arguments).then(function () {
                    callback(null, ...arguments);
                }, function (err) {
                    callback(err);
                });
            } else {
                return fn.apply(source, arguments);
            }
        };
    }

    function Transaction(session, trx) {
        return {
            run: nodeify(trx, trx.run),
            commit: () =>
                new Promise((resolve, reject) =>
                    trx.commit().then(resolve, reject))
                    .finally(() => {
                        session.close();
                    }),
            rollback: () =>
                new Promise((resolve, reject) =>
                    trx.rollback().then(resolve, reject))
                    .finally(() => {
                        session.close();
                    })
        };
    }

    function Session(session) {
        session.run = nodeify(session, session.run);

        return session;
    }

    module.exports = function (config) {

        let
            auth = config.auth? neo4j.auth.basic(config.auth.user, config.auth.password) : null,    
            driver  = neo4j.driver(`bolt://${config.host}`, auth),
            session = Session(driver.session());

        function _getSession() {
            if (session._hasTx) {
                session = Session(driver.session());
            }

            return session;
        }

        function beginTransaction() {
            let session = _getSession();

            return Transaction(session, session.beginTransaction());
        }

        function query(cypher, parameters, transaction = _getSession(), callback) {
            if (typeof transaction == 'function' && !callback) {
                callback    = transaction;
                transaction = _getSession();
            }

            transaction.run(cypher, parameters, callback);
        }

        this.beginTransaction = beginTransaction;
        this.query            = query;
    };


})();