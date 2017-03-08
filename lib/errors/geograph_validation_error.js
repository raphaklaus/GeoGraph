'use strict';

module.exports = class GeoGraphValidationError {
    
    constructor(message) {
        this.message = message;
        this.type = 'GeoGraphValidationError';
    }

    toString() {
        return `${this.type}: ${this.message}`;
    }
};