(function () {
    "use strict";

    const
        async = require('async'),
        GeoGraph = require('./index'),
        geographUtils = require('./utils'),
        geograph = new GeoGraph({
            neo4j: 'http://localhost:7474'
        });

    //geographUtils.intializePostgres(geograph.pg, function (err) {
    //    console.log(err)
    //})

    //var fs = require('fs');
    //var StreamArray = require("stream-json/utils/StreamArray");
    //var stream = StreamArray.make();

    //stream.output.on("data", function(object){
    //    object.value.geo = turf.point([object.value.lon, object.value.lat])
    //
    //    geograph.createGraph(object.value, function (err, uuid) {
    //        i++
    //        if (err) {
    //            console.timeEnd('tick tack bitches');
    //            console.log(err)
    //            console.log(i)
    //            process.exit()
    //        }
    //    });
    //});
    //stream.output.on("end", function(){
    //    console.timeEnd('tick tack bitches');
    //    console.log("done");
    //});
    //
    //console.time('tick tack bitches')
    //fs.createReadStream('./data.json').pipe(stream.input);
    //
    //console.log('show');

    //console.time('tick tack bitches')
    //
    //var count = 0;
    //
    //async.during(
    //    function (callback) {
    //        return callback(null, count < 1);
    //    },
    //    function (callback) {
    //        count++;
    //        geograph.createGraph({
    //            name: 'Diego',
    //            age: 24,
    //            friends: [{
    //                'name': 'Rafael'
    //            }, {
    //                name: 'Amanda'
    //            }]
    //        }, (err, res) => {
    //            console.log(res);
    //            console.log(err);
    //            callback(err)
    //        });
    //    },
    //    function (err) {
    //        console.timeEnd('tick tack bitches');
    //    }
    //);

    //console.time("tchoo tchoo bitchies")
    //geograph.getById('48c55a16-c4e5-403c-a773-dcc8882e17a2', function (err, result) {
    //    console.timeEnd("tchoo tchoo bitchies")
    //    console.log(err, JSON.stringify(result));
    //})

    geograph.save([{
        "name": "Diego",
        "uuid": "48c55a16-c4e5-403c-a773-dcc8882e17a2",
        "age": 24,
        "friends": [
            {
                "name": "Amanda",
                "age": 18,
                "uuid": "d261c352-f112-4bd2-9217-886d6e25e6ff"
            },
            {
                "name": "Rafael",
                "age": 34,
                "uuid": "683e3699-0e8c-4edc-81a4-f9b87e3ce24b"
            }
        ]
    }, {
        "query": "outra query"
    }], (err, result) => {
        console.log(err)
        console.log(result)
    })

})();