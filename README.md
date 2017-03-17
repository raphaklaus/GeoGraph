# GeoGraph
Schema free, easy to use, polyglot database solution for general persistence with spatial capabilities<br>

`This project is still on beta and any api methods are susceptible to changes`

# Pre-requisites 
- You must have [Neo4j](https://neo4j.com/download/) installed 
- If you want to work with spatial data you must install [PostgreSQL](https://www.postgresql.org/download/) too
- Neo4j must be running and the PostgreSQL database must have Postgis extension

# Installation
`npm install geo-graph --save`

# Tests
`npm test`


# Installing pre-requisites

## Via Docker

Use [this Docker Compose](docker-compose.yml) and run:

`docker-compose up -d`

And everything will be running.

**Important: do not share the ports with your host in production environments**

## Manual

### Neo4j
[Download and install neo4j for your platform](https://neo4j.com/download/) - Community version is fine
### Postgres
If you want to use spatial queries, you need to download and install [postgres](https://www.postgresql.org/download/) and [postgis](http://postgis.net/install/) 
- It's important that you use version 9.5+ of postgres, any previous version won't work
- There are several versions of postgis for each postgres version, be sure to install the compatible one
  - For instance, if you are using ubuntu and installed postgres-9.5, you must install postgis using `apt-get install postgres-9.5-postgis.2.3`


## Configuring the environment
 
- The only configuration in neo4j that you might run into is to disable auth, go to your [neo4j.conf](https://neo4j.com/docs/operations-manual/current/configuration/file-locations/) file and uncomment the following line:<br>
`dbms.security.auth_enabled=false`

### Postgres 
- First, you need to enable postgis on your database with the following statement: `CREATE EXTENSION postgis;`
- After that, You need a specific table with some indexes, the sql to create it is the following:
```sql
DROP TABLE IF EXISTS geometries;
CREATE TABLE geometries
(
  geometry geometry,
  node_key character varying(255) NOT NULL,
  node_uuid uuid NOT NULL,
  properties json,
  node_label text,
  CONSTRAINT geometries_pkey PRIMARY KEY (node_key, node_uuid),
  CONSTRAINT uuid_key_unique UNIQUE (node_uuid, node_key)
);
CREATE INDEX ON geometries(node_label);
CREATE INDEX ON geometries USING GIST (geometry);
```
That's it, you're now ready to go

## Usage

### First, you need a geograph instance

```javascript
const
    Geograph = require('geo-graph'),
    geograph = new Geograph({
        neo4j: {
            host: 'localhost',
            auth: {
                user: 'neo4j',
                password: 'neo4j'
            }
        },
        pg: {
            host: 'localhost',
            user: 'postgres',
            password: 'postgres',
            database: 'like_u'
        }
    });
```

#### Important notes:
- the pg key is optional, but, if present, it must be a [knex object/string connection](http://knexjs.org/#Installation-client) with the parameters to access your postgres database.
- If you disabled neo4j auth, you don't have to provide the neo4j.auth object, otherwise it's mandatory

After instantiating geograph, you can you use to play around with your data

#### Inserting nodes:

```javascript
geograph.save({
    _label: 'Person',
    name: 'Diego',
    interests: [{
        _label: 'ProgrammingLanguage',
        name: 'javascript'
    }, {
        _label: 'TvShow',
        title: 'Suits'
    }],
    nextEvent: {
        _label: 'Event',
        city: 'Seattle',
        name: 'The International',
        location: {
            "type": "Feature",
            "properties": {},
            "geometry": {
                "type": "Point",
                "coordinates": [
                    -122.32246398925781,
                    47.60431120244565
            ]
          }
        }
    }
}, (err, uuid) => console.log(err, uuid));
```
#### Important notes
- All objects must have a `_label` property that is a string not starting with a number nor having special characters or spaces, this is like telling to geograph in wich "table" you want it to store this particular object. In the example above, it will create 4 nodes in the neo4j database: 1 Person, 1 Event, 1 ProgrammingLanguage and 1 TvShow, along with 4 relationships between these nodes: Person have two interests, one is a TvShow and the other is a ProgrammingLanguage and the Person also have the nextEvent which he will attend, that is located at Seattle.
- If you have to store spatial data, it must be a [geojson feature](http://geojson.org/geojson-spec.html#feature-objects) and this information will be stored in the postgres database.
- After inserting your data, the function will respond with a callback having two parameters:
  - One is the error, if any
  - The other is the uuid of the first object that is related to all others


#### Retrieving objects by id
Lets retrieve the json that we just inserted

```javascript
geograph.findById('Person', '23ceb866-c564-462a-8784-8c0cfc8dbc0a', (err, json) => {
    console.log(json);
})
```
the json above will be something like this:

```javascript
{
    uuid: '23ceb866-c564-462a-8784-8c0cfc8dbc0a'
    _label: 'Person',
    name: 'Diego',
    interests: [{
        uuid: '23ceb866-c564-462a-8784-8c0cfc8dbc0b',
        _label: 'ProgrammingLanguage',
        name: 'javascript'
    }, {
        uuid: '23ceb866-c564-462a-8784-8c0cfc8dbc0c',
        _label: 'TvShow',
        title: 'Suits'
    }],
    nextEvent: {
        uuid: '23ceb866-c564-462a-8784-8c0cfc8dbc0d'
        _label: 'Event',
        city: 'Seattle',
        name: 'The International',
        location: {
            "type": "Feature",
            "properties": {},
            "geometry": {
                "type": "Point",
                "coordinates": [
                -122.32246398925781,
                47.60431120244565
            ]
          }
        }
    }
}
```
#### updating objects

As you can see, each object had an uuid assigned that you can use to update them, adding, modifying or removing properties and adding new relationships, consider this example:

```javascript
geograph.save({
    uuid: '23ceb866-c564-462a-8784-8c0cfc8dbc0a'
    _label: 'Person',
    name: 'Diego de Oliveira',
    age: 24,  
    interests: [{
        _label: 'Movie',
        name: 'Interestellar'
    }],
    nextEvent: {
        uuid: '23ceb866-c564-462a-8784-8c0cfc8dbc0d'
        _label: 'Event'
        city: null,
        name: 'The International',
        location: {
            "type": "Feature",
            "properties": {},
            "geometry": {
                "type": "Point",
                "coordinates": [
                    -122.32246398925981,
                    47.60431120244568
            ]
          }
        }
    }
})
```
The code above do the following:
- Modify the property `name` of the object with `uuid '23ceb866-c564-462a-8784-8c0cfc8dbc0a'` from `Diego` to `Diego de Oliveira`
- Add the property `age` to the object `uuid '23ceb866-c564-462a-8784-8c0cfc8dbc0a'`
- Add the object `{name: 'Interestellar}` with label `Movie`
- Add the `Movie` as another interest to the `Person`
- Remove the property `city` from the obejct with `uuid '23ceb866-c564-462a-8784-8c0cfc8dbc0d'`
- Change the coordinates of the location of the `Event`

As you can see, you can perform multiple operations at once with save, if the object have uuid, it will perform an update, if not, it will create a new entry in the database and create any relationships that it might have. <br><br>

You may also batch insert/update, just use an array of jsons instead of single json as the first parameter of `save`

#### querying

If you want to retrieve multiple nodes based on various filters, you can use `find`, as such:

```javascript
geograph.find({
    labels: ['Person'],
    filter: '[age > 20]',
    relations: [
        'interests',
        '?nextEvent'
    ]
}, (err, jsons) => console.log(err, jsons))
```
The example above brings all objects that have the label `Person` and age bigger than 20, including their interests and nextEvent relationship, if present
this method accepts two parameters, a query object and a callback function with an error or the results.<br>
the query object can have the following propeties:
- **labels**: the labels that you want to retrieve from the database, must be an array of strings and you have to specify at least one label to start the search
  - `Note: if you want to query every object of the database, you can use the special 'Geograph' label, that is a label of every object in the database`
- **filter**: a filter string and it can have the following parts
  - `[property filters]` - everything inside the `[]` will be used in a (neo4j where clause)[https://neo4j.com/docs/developer-manual/current/cypher/clauses/where/], you don't have to specify the variable name, just the properties along with the comparison operators and values, if you want to compare multiple properties you can separate them with `AND`/`OR` clauses
  - `{pagination}` - you can paginate the results by specifying `skip` and `limit` values inside a `{}`, some examples are:
    - `{skip=10}` - skip the first 10 items
    - `{limit=5}` - limit the query result to 5 items
    - `{skip=10 limit=20}` - skip the first 10 items and take the next 20
  - `@variable` - you can specify a custom variable name to nodes that will be retrieved by this particular filter, so you can use it in subsequent filters.
    - `Note: custom variable names must be declared at the end of filter string, or they will be ignored`
- **relations**: an array of strings that will tell geograph wich relationships to include
  - each relationship string must have the relationship name that must appear at the beggining of the relationship string
  - along with the relationship name, you can filter the number of related objects using the same rules of filter string, for instance, `interests[name = "Javascript"]` will include the `interests` relationship and retrieve only interests that have `name = "Javascript"`, you can also paginate this and declare custom variable names
  - you can also specify relationships of relationships by using the `->` operator, for instance `friends->interests` will include the `friends` and for each frient, include the `interests` of them.
  - You must be aware that when you specify relationships, geograph will only bring objects that have the relationships that you told him to include, if your relationships are optional, you can prefix them with a `?`, so geograph will bring also the nodes that don't have that relationship. Some examples:
    - 'friends->?interests' - will retrieve all friends and their interests, if any
    - '?friends->?interests' - will retrieve friends, if any and their interests, if any
    - 'friends->interests' - will retrieve all friends and that also have interests

#### You can also use geoespatial queries with  `findBySpatialQuery`

```javascript
let rioDeJaneiro = {
        'type': 'Point',
        'coordinates': [
            -43.32115173339844,
             -22.811630707692412
        ]
    };

geograph.findBySpatialQuery({
        nodes: ['Event.location'],
        filter: `ST_Distance(geometry::geography, ST_GeomFromGeoJSON(\'${JSON.stringify(rioDeJaneiro)}\')::geography) >= 100`
    }, (err, results) => console.log(err, results));
```
The example above returns all Events that have its location in a distance of 100 meters or less to the location specified at `rioDeJaneiro`<br>
this method also accepts two parameters, a spatial query object and a callback function with error/result<br>
the spatial query object have the following parameters:

- **nodes**: array of strings, where each string have two parts:
    - the first part is the label that you want to query
    - the second part is the key that you want to access
    - both parts are separated by a `.(dot)`, and you can retrieve as many `<label>.<key>` as you want, for instance, if you want to retrieve all Event locations, Person addresses and City areas you can use the following: `['Event.location', 'Person.address', 'City.area']`
- **filter**: the `postgis where` that you want to apply and filter the retrieved geometries specified in the `nodes` array
    - you have access to a special variable named `geometry`, it holds the value that you want to filter
    - this string will be executed in postgres and must return a boolean value, otherwise it will throw a error
- **relations**: relationship array that follows the same rules of the `query object`

You can interpret the spatial query object as follows: *take the geometries of these labels and keys and give me all nodes that this `filter` returns true* 

#### deleting nodes

##### by id

```javascript
geograph.deleteNodesById('23ceb866-c564-462a-8784-8c0cfc8dbc0a', (err) => console.log(err));
```

The `deleteNodesById` takes 3 parameters:
- **uuid**: the uuid of the node that you want to delete, can be either simple value or array
- **callback**: function to be called after the deletion, have a error parameter if anything goes wrong

##### by query object
```javascript
geograph.deleteNodesByQueryObject({
    label: 'Person'
}, (err) => console.log(err));
```

The `deleteNodesByQueryObject` takes two parameters:
- **query object**: same query object used in the `find` method, all nodes (including relationships, if any) retrieved by this query will be removed
- **callback**: function to be called after the deletion, have a error parameter if anything goes wrong

#### deleting relationships

Sometimes you just want to delete relationships between objects, but want to keep the objects in the database, to achieve that you can use `deleteRelationships`

```javascript
geograph.deleteRelationships({
    uuid: '23ceb866-c564-462a-8784-8c0cfc8dbc0a', // uuid of the source
    friends: { //name of the relationship to remove
        uuid: '23ceb866-c564-462a-8784-8c0cfc8dbc0b', // uuid of the target
        interests: { // you may also specify more source-relationship-targets
            uuid: '23ceb866-c564-462a-8784-8c0cfc8dbc0b'
        }
    }
}, (err) => console.log(err));
```

The code above deletes two relationships:<br>
`'23ceb866-c564-462a-8784-8c0cfc8dbc0a' friends '23ceb866-c564-462a-8784-8c0cfc8dbc0b'` and <br>
`'23ceb866-c564-462a-8784-8c0cfc8dbc0b' interests '23ceb866-c564-462a-8784-8c0cfc8dbc0b'`. <br>

That means that the objects with uuid `'23ceb866-c564-462a-8784-8c0cfc8dbc0a'` and `'23ceb866-c564-462a-8784-8c0cfc8dbc0b'` are no longer friends and that object with uuid `'23ceb866-c564-462a-8784-8c0cfc8dbc0b'` no longer have interest on object with uuid `'23ceb866-c564-462a-8784-8c0cfc8dbc0b'`

<hr>

These are all geograph methods, you can play around, try to insert and retrieve complex objects with multiple depths of nested objects and see how it behaves.
