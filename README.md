# GeoGraph
Schema free, easy to use, polyglot database solution for general persistence with spatial capabilities

#Pre-requisites 
- You must have [Neo4j](https://neo4j.com/download/) installed 
- If you want to work with spatial data you must install [PostgreSQL](https://www.postgresql.org/download/) too
- Neo4j must be running and the PostgreSQL database must have Postgis extension

#Installation
`npm install geo-graph --save`

#Getting started

```javascript
const
    Geograph = require('geo-graph'),
    geograph = new Geograph({
        neo4j: {
            host: 'localhost'
        },
        pg: {
            host: 'localhost',
            user: 'postgres',
            password: 'postgres',
            database: 'like_u'
        }
    });
    
//create new nodes    
geograph.save({
    '_label': 'Person', //_label is a mandatory property, it's a string that will tell where to store this object, kinda like the table name of relational databases.
    'name': 'Diego',
    'location': { //if you want to insert spatial data, it must be a geojson feature
        'type': 'Feature',
        'properties': {}, //properties are optional
        'geometry': {
            'type': 'Point',
            'coordinates': [0, 0]
        }
    },
    'interests': [{
        '_label': 'Interest',
        'name': 'javascript'
    }]
}, (err, uuid) => {
    console.log(uuid); // print the root uuid
});

// find nodes by id
geograph.findById('Person', '4e640d09-d058-4e60-bcfd-01ad5e943451', (err, json) => {
    console.log(json); // print the person json or undefined if not found.
});

//find nodes by query object
geograph.find({
    label: 'Person', // find everyone that is a Person
    relations: [
        '?interests' //also bring the interests of the Person, if available
    ]
}, (err, jsons) => {
    if (err) {
        console.log(err);
    }
    console.log(jsons) //print array of objects or empty array
});

//delete nodes by id
geograph.deleteNodesById('Test', '586a6f1a-0d34-4a93-9262-5abde454272a', (err) => {
    if (err) {
        console.log(err);
    }
});

//delete relationships between nodes
geograph.deleteRelationships([{
    from: '4e640d09-d058-4e60-bcfd-01ad5e943451',
    relation: 'friends',
    to: 'e8979b09-0312-4642-a9d2-bf75dfad0dc6'
}], (err) => {
    if (err) {
        console.log(err);
    }
});

//delete nodes by query object
geograph.deleteNodesByQueryObject({
    label: 'Person' // delete everyone that is a Person
}, (err) => {
    if (err) {
        console.log(err);
    }
});
```

#Tests
`npm test`
