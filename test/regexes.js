const
    expect = require('chai').expect,
    regexes = require('../lib/regexes');

describe('Regexes', () => {
    it('should identify simple property comparison', () => {
        let groups = regexes.propertyFilter.enumerateGroups('property="value"', 'property');

        expect(groups).to.include('property="value"');
    });

    it('should identify array of property comparisons', () => {
        let groups = regexes.propertyFilter.enumerateGroups('property="value" AND otherProperty IS NULL ' +
            'OR anotherProperty = 25', 'property');

        expect(groups).to.include('property="value"');
        expect(groups).to.include('otherProperty IS NULL');
        expect(groups).to.include('anotherProperty = 25');
    });

    it('should correctly parse all comparison operators', () => {
        let groups = regexes.propertyFilter.enumerateGroups('name = "Doge" AND age > 100 AND age < 200 OR name<>"WoW "' +
            'OR quantity >=50 AND otherProperty<= 155 OR property IS NOT NULL AND ' +
            'anotherProperty IS NULL ', 'property');

        expect(groups).to.include('name = "Doge"');
        expect(groups).to.include('age > 100');
        expect(groups).to.include('age < 200');
        expect(groups).to.include('name<>"WoW "');
        expect(groups).to.include('quantity >=50');
        expect(groups).to.include('otherProperty<= 155');
        expect(groups).to.include('property IS NOT NULL');
        expect(groups).to.include('anotherProperty IS NULL');
    });

    it('should extract where in simple filter', () => {
        let group = regexes.where.getGroup('relation[property="value"]', 'where');

        expect(group).to.be.equal('property="value"');
    });

    it('should extract where in complex filter', () => {
        let group = regexes.where.getGroup('relation[property="value" AND otherProperty IS NULL ' +
            'OR anotherProperty = 25]', 'where');

        expect(group).to.be.equal('property="value" AND otherProperty IS NULL OR anotherProperty = 25');
    });

    it('should extract skip', () => {

        let groups = regexes.paginate.groups('skip=10');

        expect(groups).to.have.property('skip', '10');
    });

    it('should extract limit', () => {

        let groups = regexes.paginate.groups('limit=15');

        expect(groups).to.have.property('limit', '15');
    });

    it('should parse pagination', () => {

        let groups = regexes.paginate.groups('skip=10 limit=15');

        expect(groups).to.have.property('skip', '10');
        expect(groups).to.have.property('limit', '15');
    });

    it('should extract pagination', () => {

        let group = regexes.pagination.getGroup('{skip=10 limit=15}', 'pagination');

        expect(group).to.be.equal('skip=10 limit=15');
    });

    it('should return undefined when does not find a match on getGroup', () => {
        let string = 'dummy string',
            where = regexes.where.getGroup(string, 'where'),
            pagination = regexes.pagination.getGroup(string, 'pagination');

        expect(where).to.be.undefined;
        expect(pagination).to.be.undefined;
    });

    it('should return empty array when does not find a match on enumerateGroups', () => {
        let string = 'superdummy string',
            properties = regexes.propertyFilter.enumerateGroups(string, 'property');

        expect(properties).to.be.empty;
    });

    it('should return empty object when does not find a match on groups', () => {
        let string = 'superdummy string',
            properties = regexes.paginate.groups(string);

        expect(properties).to.be.empty;
    });
    
    it('should get label', () => {
        let group = regexes.label.getGroup('validLabel', 'label');

        expect(group).to.be.equal('validLabel');
    });

    it('should validate label', () => {
        let 
            group1 = regexes.label.getGroup('12invalidLabel', 'label'),
            group2 = regexes.label.getGroup('invalid label', 'label'),
            group3 = regexes.label.getGroup(undefined, 'label'),
            group4 = regexes.label.getGroup('', 'label');

        expect(group1).to.be.undefined;
        expect(group2).to.be.undefined;
        expect(group3).to.be.undefined;
        expect(group4).to.be.undefined;
    });

    it('should get relationship', () => {
        let relationship = regexes.relationships.enumerateGroups('rel1', 'relationship');

        expect(relationship).to.include('rel1');
        expect(relationship).to.have.lengthOf(1);
    });

    it('should get multiple relationships', () => {
        let relationship1 = regexes.relationships.enumerateGroups('rel1.rel2.rel3', 'relationship');
        let relationship2 = regexes.relationships.enumerateGroups('rel1-rel2-rel3', 'relationship');
        let relationship3 = regexes.relationships.enumerateGroups('rel1-rel2.rel3.rel4-rel5', 'relationship');

        expect(relationship1).to.include('rel1');
        expect(relationship1).to.include('rel2');
        expect(relationship1).to.include('rel3');
        expect(relationship1).to.have.lengthOf(3);

        expect(relationship2).to.include('rel1-rel2-rel3');
        expect(relationship2).to.have.lengthOf(1);

        expect(relationship3).to.include('rel1-rel2');
        expect(relationship3).to.include('rel3');
        expect(relationship3).to.include('rel4-rel5');
        expect(relationship3).to.have.lengthOf(3);
    });

    it('should get relationship with pagination', () => {
        let relationship = regexes.relationships.enumerateGroups('rel{skip=10 limit=15}', 'relationship');

        expect(relationship).to.include('rel{skip=10 limit=15}');
        expect(relationship).to.have.lengthOf(1);
    });

    it('should get multiple relationships with pagination', () => {
        let 
            relationship1 = regexes.relationships.enumerateGroups('rel{skip=10 limit=15}.rel2{skip=5 limit=10}', 'relationship'),
            relationship2 = regexes.relationships.enumerateGroups('rel{skip=10 limit=15}.rel2-rel3{skip=5 limit=10}', 'relationship'),
            relationship3 = regexes.relationships.enumerateGroups('rel{skip=10 limit=15}.rel2-rel3{skip=5 limit=10}.rel4', 'relationship');

        expect(relationship1).to.include('rel{skip=10 limit=15}');
        expect(relationship1).to.include('rel2{skip=5 limit=10}');
        expect(relationship1).to.have.lengthOf(2);

        expect(relationship2).to.include('rel{skip=10 limit=15}');
        expect(relationship2).to.include('rel2-rel3{skip=5 limit=10}');
        expect(relationship2).to.have.lengthOf(2);
        expect(relationship1).to.have.lengthOf(2);

        expect(relationship3).to.include('rel{skip=10 limit=15}');
        expect(relationship3).to.include('rel2-rel3{skip=5 limit=10}');
        expect(relationship3).to.include('rel4');
        expect(relationship3).to.have.lengthOf(3);
    });

    it('should get relationship with filter', () => {
        let relationship = regexes.relationships.enumerateGroups('rel[property="value"]', 'relationship');

        expect(relationship).to.include('rel[property="value"]');
        expect(relationship).to.have.lengthOf(1);
    });

    it('should get multiple relationships with filter', () => {
        let 
            relationship1 = regexes.relationships.enumerateGroups('rel[property="value"].rel2[quantity=10]', 'relationship'),
            relationship2 = regexes.relationships.enumerateGroups('rel[property="value"].rel2-rel3[quantity=10]', 'relationship'),
            relationship3 = regexes.relationships.enumerateGroups('rel[property="value"].rel2-rel3[quantity=10].rel4', 'relationship');

        expect(relationship1).to.include('rel[property="value"]');
        expect(relationship1).to.include('rel2[quantity=10]');
        expect(relationship1).to.have.lengthOf(2);

        expect(relationship2).to.include('rel[property="value"]');
        expect(relationship2).to.include('rel2-rel3[quantity=10]');
        expect(relationship2).to.have.lengthOf(2);
        expect(relationship1).to.have.lengthOf(2);

        expect(relationship3).to.include('rel[property="value"]');
        expect(relationship3).to.include('rel2-rel3[quantity=10]');
        expect(relationship3).to.include('rel4');
        expect(relationship3).to.have.lengthOf(3);
    });

    it('should get relationship with filter and pagination', () => {
        let relationship = regexes.relationships.enumerateGroups('rel[property="value"] {skip=10 limit=15}', 'relationship');

        expect(relationship).to.include('rel[property="value"] {skip=10 limit=15}');
        expect(relationship).to.have.lengthOf(1);
    });

    it('should get multiple relationships with filter and pagination', () => {
        let 
            relationship1 = regexes.relationships.enumerateGroups('rel[property="value"] {skip=10 limit=15}.rel2[quantity=10]{skip=5 limit=10}', 'relationship'),
            relationship2 = regexes.relationships.enumerateGroups('rel[property="value"] {skip=10 limit=15}.rel2-rel3[quantity=10]{skip=5 limit=10}', 'relationship'),
            relationship3 = regexes.relationships.enumerateGroups('rel[property="value"] {skip=10 limit=15}.rel2-rel3[quantity=10].rel4', 'relationship');

        expect(relationship1).to.include('rel[property="value"] {skip=10 limit=15}');
        expect(relationship1).to.include('rel2[quantity=10]{skip=5 limit=10}');
        expect(relationship1).to.have.lengthOf(2);

        expect(relationship2).to.include('rel[property="value"] {skip=10 limit=15}');
        expect(relationship2).to.include('rel2-rel3[quantity=10]{skip=5 limit=10}');
        expect(relationship2).to.have.lengthOf(2);
        expect(relationship1).to.have.lengthOf(2);

        expect(relationship3).to.include('rel[property="value"] {skip=10 limit=15}');
        expect(relationship3).to.include('rel2-rel3[quantity=10]');
        expect(relationship3).to.include('rel4');
        expect(relationship3).to.have.lengthOf(3);
    });

    it('should parse a complex filter string', () => {
        let string = 'relation[name = "Doge" AND age > 100 AND age < 200 OR name<>"WoW "' +
        'OR quantity >=50 AND otherProperty<= 155 OR property IS NOT NULL AND ' +
        'anotherProperty IS NULL]{skip = 10 limit= 15}';

        let where = regexes.where.getGroup(string, 'where'),
            paginationString = regexes.pagination.getGroup(string, 'pagination'),
            properties = regexes.propertyFilter.enumerateGroups(string, 'property'),
            pagination = regexes.paginate.groups(paginationString);

        expect(properties).to.include('name = "Doge"');
        expect(properties).to.include('age > 100');
        expect(properties).to.include('age < 200');
        expect(properties).to.include('name<>"WoW "');
        expect(properties).to.include('quantity >=50');
        expect(properties).to.include('otherProperty<= 155');
        expect(properties).to.include('property IS NOT NULL');
        expect(properties).to.include('anotherProperty IS NULL');

        expect(pagination).to.have.property('skip', '10');
        expect(pagination).to.have.property('limit', '15');
    });
});