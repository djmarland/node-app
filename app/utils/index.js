"use strict";

/**
 * Singleton for utils
 */

var fs        = require("fs"),
    path      = require("path"),
    utils        = {};

fs
    .readdirSync(__dirname)
    .filter(function(file) {
        return (file.indexOf(".") !== 0) && (file !== "index.js");
    })
    .forEach(function(file) {
        var model = new (require(path.join(__dirname, file))),
            name = file.replace('.js','');
        utils[name] = model;
    });

module.exports = utils;