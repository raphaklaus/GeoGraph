(function () {
    "use strict";

    const
        _             = require('lodash'),
        async         = require('async'),
        turf          = require('turf'),
        GeoGraph      = require('./index'),
        geographUtils = require('./utils'),
        geograph      = new GeoGraph({
            neo4j: 'http://localhost:7474',
            pg: {
                host: 'localhost',
                user: 'postgres',
                password: 'postgres',
                database: 'like_u'
            }
        });

    //geographUtils.intializePostgres(geograph.pg, function (err) {
    //    console.log(err)
    //})

    //var fs = require('fs');
    //var i = 0;
    //var StreamArray = require("stream-json/utils/StreamArray");
    //var stream = StreamArray.make();
    //stream.output.on("data", function(object){
    //    object.value.geo = turf.point([object.value.lon, object.value.lat])
    //
    //    stream.output.pause();
    //    geograph.save(object.value, function (err, uuid) {
    //        i++
    //        if (err) {
    //            console.timeEnd('tick tack bitches');
    //            console.log(err)
    //            console.log(i)
    //            process.exit()
    //        }
    //
    //        stream.output.resume();
    //
    //        if (i == 1) {
    //            console.timeEnd('tick tack bitches');
    //            stream.output.pause()
    //        }
    //    });
    //});
    //stream.output.on("end", function(){
    //    console.timeEnd('tick tack bitches');
    //    console.log("done");
    //});
    //console.time('tick tack bitches')
    //fs.createReadStream('./data.json').pipe(stream.input);
    //console.log('show');

    //console.time('tick tack bitches')
    //var count = 0;
    //async.during(
    //    function (callback) {
    //        return callback(null, count < 1);
    //    },
    //    function (callback) {
    //        count++;
    //        geograph.save({
    //            name: 'Diego',
    //            age: 24,
    //            "geometry": turf.point([-43.505859375, -19.559790136497398]),
    //            friends: [{
    //                'name': 'Rafael',
    //                "test": turf.point([-43.505859375, -19.559790136497398])
    //            }, {
    //                name: 'Amanda'
    //            }]
    //        }, (err, result) => {
    //            console.log(err, result)
    //            callback(err, result);
    //        });
    //    },
    //    function (err) {
    //        console.timeEnd('tick tack bitches');
    //    }
    //);

    //console.time("tchoo tchoo bitchies")
    //geograph.getById( '4f921980-e303-49f9-affd-a6b46c1f1e08', function (err, result) {
    //    console.timeEnd("tchoo tchoo bitchies")
    //    console.log(err, JSON.stringify(result));
    //})

    //geograph.save([{
    //    "name": "Diego",
    //    "uuid": "48c55a16-c4e5-403c-a773-dcc8882e17a2",
    //    "age": 24,
    //    "friends": [
    //        {
    //            "name": "Amanda",
    //            "age": 18,
    //            "uuid": "d261c352-f112-4bd2-9217-886d6e25e6ff"
    //        },
    //        {
    //            "name": "Rafael",
    //            "age": 34,
    //            "uuid": "683e3699-0e8c-4edc-81a4-f9b87e3ce24b"
    //        }
    //    ]
    //}, {
    //    "query": "outra query"
    //}], (err, result) => {
    //    console.log(err)
    //    console.log(result)
    //})

    //geograph.save({
    //    "_label": "test3",
    //         "name": "Diego",
    //         "age": 24,
    //     "geo": {
    //         "type": "Feature",
    //         "properties": {},
    //         "geometry": {
    //             "type": "Point",
    //             "coordinates": [
    //                 -43.505859375,
    //                 -19.559790136497398
    //             ]
    //         }
    //     },
    //         "friends": [
    //             {
    //                 "_label": "test3",
    //                 "name": "Amanda",
    //                 "age": 18,
    //                 "address": {
    //                     "city": "birigui"
    //                 },
    //                 "interests": [{
    //                     "name": "breaking bad"
    //                 }, {
    //                     "name": "medicine"
    //                 }],
    //                 "dasdfsadf": {
    //                     "type": "Feature",
    //                     "properties": {},
    //                     "geometry": {
    //                         "type": "Point",
    //                         "coordinates": [
    //                             -43.505859375,
    //                             -19.559790136497398
    //                         ]
    //                     }
    //                 }
    //             },
    //             {
    //                 "_label": "test3",
    //                 "name": "Rafael",
    //                 "age": 34,
    //                 friends: {
    //                     "_label": "test3",
    //                     "name": "Achiles"
    //                 },
    //                 "dddd": {
    //                     "type": "Feature",
    //                     "properties": {},
    //                     "geometry": {
    //                         "type": "Point",
    //                         "coordinates": [
    //                             -43.505859375,
    //                             -19.559790136497398
    //                         ]
    //                     }
    //                 },
    //                 "test": {
    //                     "type": "Feature",
    //                     "properties": {},
    //                     "geometry": {
    //                         "type": "Point",
    //                         "coordinates": [
    //                             -43.505859375,
    //                             -19.559790136497398
    //                         ]
    //                     }
    //                 }
    //             }
    //         ],
    //    "interests": [{
    //        "name": "javascript"
    //    }, {
    //        "name": "game of thrones"
    //    }]
    //     }, (err, results) => {
    //    console.log(err, results);
    //
    //})

    geograph.list({
        _label: 'test3',
        _relations: [
            '?friends.interests-address',
            '?interests',
        ]
    }, (err, result) => console.log(err, result))
})();