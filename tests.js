const
    _ = require('lodash'),
    neo4jManager = require('./neo4j_manager'),
    manager = new neo4jManager({
        host: 'localhost'
    }),
    Geograph = require('./index'),
    geograph = new Geograph({
        host: 'localhost'
    });

    //manager.createNode({
    //    'name': 'test'
    //}, (err, result) => {
    //    console.log(err);
    //    console.log(result);
    //})

//manager.query('MATCH (a) where a.uuid = $uuid\n WITH a MATCH (a)-[r*0..]->(b) RETURN collect(b), collect(r)', {
//    uuid: 'b4801832-a953-4800-b793-928402d5123d'
//}, (err, result) => {
//
//    var items = _.chain(result.records)
//                 .map('_fields')
//                 .flattenDeep()
//                 .value();
//    console.log(items)
//})

//geograph.createGraph({
//    name: 'Diego',
//    friends: [{
//        name: 'rafael'
//    },{
//        name: 'gabriel',
//        friends: {
//            name: 'anderson',
//            _array:true,
//            address: {
//                state: 'rj',
//                city: 'rio de janeiro'
//            }
//        }
//    }, {
//        name: 'amanda'
//    }]
//}, (err, uuid) => {
//    console.log(err, uuid);
//})

geograph.getById('3cfd16b4-2a04-4359-86e4-3b073901fddd', (err, result) => {
    'use strict';
    console.log(err, result.friends[1].friends[0])
})