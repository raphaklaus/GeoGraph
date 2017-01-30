(function (exports) {
    "use strict";

    function intializePostgres(pg, callback) {
        pg.schema
          .raw('CREATE EXTENSION IF NOT EXISTS postgis;')
          .raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";')
          .dropTableIfExists('geometries')
          .createTable('geometries', (table) => {
              table.specificType('node_geometry', 'geometry');
              table.string('node_key');
              table.uuid('node_uuid');
              table.json('properties');

              table.unique(['node_key', 'node_uuid']);
          }).asCallback(callback);
    }

    exports.intializePostgres = intializePostgres;


})(module.exports);