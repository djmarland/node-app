"use strict";

module.exports = {
    up: function(migration, DataTypes, done) {
        // add altering commands here, calling 'done' when finished
        migration.createTable(
            'types',
            {
                id: {
                    type: DataTypes.INTEGER,
                    primaryKey: true,
                    autoIncrement: true
                },
                createdAt: {
                    type: DataTypes.DATE
                },
                updatedAt: {
                    type: DataTypes.DATE
                },
                title: DataTypes.STRING
            }
        );
        done();
    },

    down: function(migration, DataTypes, done) {
        // add reverting commands here, calling 'done' when finished
        migration.dropTable('types');
        done();
    }
};
