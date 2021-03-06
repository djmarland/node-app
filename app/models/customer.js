"use strict";

var utils = require('utils'),

    KEY_PREFIX = 'C';

module.exports = function(sequelize, DataTypes) {
    var Customer = sequelize.define(
        "customer",
        {
            id: {
                type: DataTypes.INTEGER,
                autoIncrement: true,
                primaryKey: true
            },
            name: {
                type: DataTypes.STRING,
                field: 'name',
                allowNull : false,
                validate: {
                    notEmpty: {
                        msg: 'Customer must have a name'
                    }
                }
            },
            versionOfId: {
                type: DataTypes.INTEGER,
                references : "customers",
                referencesKey : "id",
                field: "versionOfId"
            },
            editedById: {
                type: DataTypes.INTEGER,
                references : "users",
                referencesKey : "id",
                field: "editedById"
            },
            lastName: {
                type: DataTypes.STRING,
                field: 'lastName'
            },
            address: {
                type: DataTypes.STRING,
                field: 'address'
            },
            phoneNumber: {
                type: DataTypes.STRING,
                field: 'phoneNumber',
                validate: {
                    fn: function(val) {
                        if (val && !utils.phone.isValid(val)) {
                            throw new utils.errors.invalidPhone();
                        }
                    }
                }
            },
            phoneNumber2: {
                type: DataTypes.STRING,
                field: 'phoneNumber2',
                validate: {
                    fn: function(val) {
                        if (val && !utils.phone.isValid(val)) {
                            throw new utils.errors.invalidPhone();
                        }
                    }
                }
            },
            postcode: {
                type: DataTypes.STRING,
                field: 'postcode',
                validate: {
                    fn: function(val) {
                        if (val && !utils.postcode.isValid(val)) {
                            throw new utils.errors.invalidPostcode();
                        }
                    }
                }
            }
        },
        {
            classMethods: {
                associate: function (models) {
                    Customer.hasMany(models.job, { foreignKey: "customerId" });
                    Customer.hasMany(models.customer, { foreignKey: "versionOfId" });
                    Customer.belongsTo(models.customer, { foreignKey: "versionOfId" });
                    Customer.belongsTo(models.user, {
                        as : "Editor",
                        foreignKey: "editedById"
                    });
                }
            },
            instanceMethods : {
                onSave : function() {
                    this.lastName = (this.name.split(" ").slice(-1).pop()).toLowerCase();

                    // @todo sanitise the address. Remove commas, separate onto new lines. trim spaces
                    if (!this.changed()) {
                        // nothing changed
                        throw new utils.errors.noChange();
                    }

                    if (!this.isNewRecord) {
                        this.copyToVersion();
                    }
                },
                copyToVersion : function() {
                    var self = this,
                        originalId = this.id,
                        attributes = this._previousDataValues,
                        query = 'insert',
                        args;

                    // ensure the attributes is a clone
                    attributes = JSON.parse(JSON.stringify(attributes));

                    // remove the 'id' field so it can be reset
                    delete attributes.id;

                    // delete attributes added via JOIN
                    delete attributes.Editor;

                    attributes.versionOfId = originalId;

                    args = [self, self.Model.getTableName(), attributes, {}];

                    return self.QueryInterface[query].apply(self.QueryInterface, args)
                        .then(function(result) {
                            return result;
                        });
                }

            },
            getterMethods: {
                key : function() {
                    return utils.key.fromId(this.id, KEY_PREFIX);
                },
                url : function() {
                    var parentKey;
                    if (this.versionOfId) {
                        parentKey = utils.key.fromId(this.versionOfId, KEY_PREFIX);
                        return '/customers/' + parentKey + '/versions/' + this.key;
                    }
                    return '/customers/' + this.key;
                },
                inlineAddress : function() {
                    return utils.address.inline(this);
                }
            },
            hooks: {
                beforeCreate: function(customer, options, fn) {
                    customer.onSave();
                    fn(null, customer);
                },
                beforeUpdate: function(customer, options, fn) {
                    customer.onSave();
                    fn(null, customer);
                },
                afterValidate: function(customer, options, fn) {
                    var postcode, phone;
                    if (customer.postcode) {
                        postcode = utils.postcode.format(customer.postcode);
                        if (postcode) {
                            customer.setDataValue('postcode',postcode);
                        }
                    }

                    if (customer.phoneNumber) {
                        phone = utils.phone.format(customer.phoneNumber);
                        if (phone) {
                            customer.setDataValue('phoneNumber',phone);
                        }
                    }

                    if (customer.phoneNumber2) {
                        phone = utils.phone.format(customer.phoneNumber2);
                        if (phone) {
                            customer.setDataValue('phoneNumber2',phone);
                        }
                    }
                    fn(null, customer);
                }
            }
        }
    );

    Customer.findByKey = function(key, allowVersion) {
        var id = utils.key.toId(key);
        // keys haven't been converted yet
        return Customer.findById(id, allowVersion);
    };

    Customer.findById = function(id, allowVersion) {
        return new sequelize.Promise(function(resolve, reject) {
            var models = require('models'),
                where = {
                    id: id,
                    versionOfId : null // default state
                };

            if (allowVersion) {
                delete where.versionOfId;
            }
            Customer.findOne({
                where: where,
                limit: 1,
                include: [{
                    model : models.user,
                    as : "Editor"
                }]
            })
            .then(function(result) {
                resolve(result);
            }).catch(function(e) {
                reject(e);
            });
        });
    };

    Customer.findLatest = function(perPage, page) {
        var perPage = perPage || 10;
            page    = page || 1;
        return new sequelize.Promise(function(resolve, reject) {
            Customer.findAndCountAll({
                where : {
                    versionOfId : null // ideally this should handled with a DB view
                },
                offset  : utils.pagination.offset(perPage, page),
                limit   : perPage,
                order: '"updatedAt" DESC'
            })
            .then(function(result) {
                resolve(result);
            }).catch(function(e) {
                reject(e);
            });
        });
    };

    Customer.searchAndCount = function(query, perPage, page) {
        var idFromKey = utils.key.toIdSanitised(query);
        perPage = perPage || 10;
        page    = page || 1;
        return new sequelize.Promise(function(resolve, reject) {
            var queries = [
                ['"name" ILIKE ?', '%' + query + '%'],
                ['"address" ILIKE ?', '%' + query + '%'],
                ['"postcode" ILIKE ?', '%' + query + '%']
            ];
            if (idFromKey) {
                queries.push(
                    { id : idFromKey }
                );
            }
            Customer.findAndCountAll({
                where : sequelize.and(
                    { versionOfId : null },
                    sequelize.or.apply(this, queries)
                ),
                offset  : utils.pagination.offset(perPage, page),
                limit   : perPage,
                order   : '"lastName" ASC'
            })
            .then(function(result) {
                resolve(result);
            }).catch(function(e) {
                reject(e);
            });
        });
    };

    Customer.new = function(data) {
        return new sequelize.Promise(function(resolve, reject) {
            Customer.create(data)
                .then(function(customer) {
                    resolve(customer);
                }).catch(function(e) {
                    reject(e)
                });
        });
    };

    Customer.findVersionsByCustomer = function(customer, perPage, page) {
        return new sequelize.Promise(function(resolve, reject) {
            var models = require('models');
            Customer.findAndCountAll({
                where   : { versionOfId : customer.id },
                offset  : utils.pagination.offset(perPage, page),
                limit   : perPage,
                order   : '"updatedAt" DESC',
                include: [{
                    model : models.user,
                    as : "Editor"
                }]
            })
                .then(function(result) {
                    resolve(result);
                }).catch(function(e) {
                    reject(e);
                });
        });
    };

    Customer.countVersionsByCustomer = function(customer) {
        return new sequelize.Promise(function(resolve, reject) {
            Customer.count({
                where   : { versionOfId : customer.id }
            })
            .then(function(result) {
                resolve(result);
            }).catch(function(e) {
                reject(e);
            });
        });
    };

    Customer.findPreviousVersion = function(version) {
        return new sequelize.Promise(function(resolve, reject) {
            Customer.findOne({
                where   : [
                    { versionOfId : version.versionOfId },
                    [ '"updatedAt" < ?' , version.updatedAt ]
                ],
                order   : '"updatedAt" DESC'
            })
                .then(function(result) {
                    resolve(result);
                }).catch(function(e) {
                    reject(e);
                });
        });
    };

    Customer.findNextVersion = function(version) {
        return new sequelize.Promise(function(resolve, reject) {
            Customer.findOne({
                where   : [
                    { versionOfId : version.versionOfId },
                    [ '"updatedAt" > ?' , version.updatedAt ]
                ],
                order   : '"updatedAt" ASC'
            })
                .then(function(result) {
                    resolve(result);
                }).catch(function(e) {
                    reject(e);
                });
        });
    };

    return Customer;
};