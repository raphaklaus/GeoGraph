(function (exports) {
    "use strict";
    let _ = require('lodash');

    let indexes = [-1, 0];
    let chars = _.range(65,90).concat(_.range(97, 122));

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

              table.primary(['node_key', 'node_uuid']);
          }).asCallback(callback);
    }

    function getUniqueIdentifier() {
        //65-90 97-122

        // aumentar o primeiro indice
        // se o indice for maior que o length de chars, zerar o primeiro indice e aumentar o segundo indice
        // se o segundo indice for maior que o length de chars, zerar ambos os indices



        indexes[0]++;

        if (indexes[0] >= chars.length) {
            indexes[0] = 0;
            indexes[1]++;
        }

        if (indexes[1] >= chars.length) {
            indexes[0] = -1;
            indexes[1] = 0;
        }
        
        return String.fromCharCode(chars[indexes[0]]) + String.fromCharCode(chars[indexes[1]]);
    }

    exports.intializePostgres = intializePostgres;
    exports.getUniqueIdentifier = getUniqueIdentifier;


})(module.exports);