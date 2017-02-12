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

    console.time('tick tack bitches')

    var count = 0;

    async.during(
        function (callback) {
            return callback(null, count < 1);
        },
        function (callback) {
            count++;
            geograph.createGraph({
                name: 'Diego',
                friends: [{
                    name: 'rafael'
                },{
                    name: 'gabriel',
                    friends: {
                        name: 'anderson',
                        _array:true,
                        address: {
                            state: 'rj',
                            city: 'rio de janeiro'
                        },
                        interests: [{
                            'name': 'guns'
                        }, {
                            'name': 'military',
                            test: {
                                name: 'Diego',
                                friends: [{
                                    name: 'rafael'
                                },{
                                    name: 'gabriel',
                                    friends: {
                                        name: 'anderson',
                                        _array:true,
                                        address: {
                                            state: 'rj',
                                            city: 'rio de janeiro'
                                        },
                                        interests: [{
                                            'name': 'guns'
                                        }, {
                                            'name': 'military',
                                            more_depth: {
                                                name: 'Diego',
                                                friends: [{
                                                    name: 'rafael'
                                                },{
                                                    name: 'gabriel',
                                                    friends: {
                                                        name: 'anderson',
                                                        _array:true,
                                                        address: {
                                                            state: 'rj',
                                                            city: 'rio de janeiro'
                                                        },
                                                        interests: [{
                                                            'name': 'guns'
                                                        }, {
                                                            'name': 'military',
                                                            test: {
                                                                name: 'Diego',
                                                                friends: [{
                                                                    name: 'rafael'
                                                                },{
                                                                    name: 'gabriel',
                                                                    friends: {
                                                                        name: 'anderson',
                                                                        _array:true,
                                                                        address: {
                                                                            state: 'rj',
                                                                            city: 'rio de janeiro'
                                                                        },
                                                                        interests: [{
                                                                            'name': 'guns'
                                                                        }, {
                                                                            'name': 'military',
                                                                            address: {
                                                                                state: 'rj',
                                                                                city: 'rio de janeiro',
                                                                                address: {
                                                                                    state: 'rj',
                                                                                    city: 'rio de janeiro',
                                                                                    address: {
                                                                                        state: 'rj',
                                                                                        city: 'rio de janeiro'
                                                                                    }
                                                                                }
                                                                            }
                                                                        }]
                                                                    }
                                                                }, {
                                                                    name: 'amanda'
                                                                }]
                                                            }
                                                        }]
                                                    }
                                                }, {
                                                    name: 'amanda'
                                                }]
                                            }
                                        }]
                                    }
                                }, {
                                    name: 'amanda'
                                }]
                            }
                        }]
                    }
                }, {
                    name: 'amanda'
                }]
            }, (err, res) => {
                console.log(res);
                callback(err)
            });
        },
        function (err) {
            console.timeEnd('tick tack bitches');

        }
    );

    //console.time("tchoo tchoo bitchies")
    //geograph.getById('0becd438-6f10-4a76-a890-539d12a1f46a', function (err, result) {
    //    console.timeEnd("tchoo tchoo bitchies")
    //    console.log(err, JSON.stringify(result));
    //})

})();