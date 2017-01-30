(function (exports) {
    "use strict";

    function intializePostgres(pg) {
        pg.schema.raw('CREATE EXTENSION postgis');
        pg.schema.raw('CREATE EXTENSION "uuid-ossp"');
        pg.schema.dropTableIfExists('geometries');
        pg.schema.createTable('geometries', (table) => {
            table.specificType('node_geometry', 'geometry');
            table.string('node_key');
            table.uuid('node_uuid');
            table.json('properties');

            table.unique(['node_key', 'node_uuid']);
        });
    }

    exports.intializePostgres = intializePostgres;


})(module.exports);