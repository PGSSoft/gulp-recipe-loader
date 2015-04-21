'use strict';

var gutil = require('gulp-util');
var _ = require('lodash');

/**
 * format error message
 * @param e
 * @param sig
 * @returns {string}
 * @private
 */
function _formatError(e, sig) {
    var detailsWithStack = function (stack) {
        var _message = e.message;
        e.message = gutil.colors.yellow(e.message);
        var details = e._messageWithDetails();
        e.message = _message;
        return details + '\nStack:\n' + stack;
    };

    var msg;
    if (e.showStack) {
        if (e.__safety) { // There is no wrapped error, use the stack captured in the PluginError ctor
            msg = e.__safety.stack;
        } else if (e._stack) {
            msg = detailsWithStack(e._stack);
        } else { // Stack from wrapped error
            msg = detailsWithStack(e.stack.replace(e.name + ': ' + e.message + '\n', ''));
        }
    } else {
        var _message = e.message;
        e.message = gutil.colors.yellow(e.message);
        msg = e._messageWithDetails();
        e.message = _message;
    }

    return sig + '\n' + msg;
}

/**
 * Basic error class factory to throw from within recipe.
 */
function RecipeError(message, options) {
    return gutil.PluginError.call(this, '_', message, options);
}

RecipeError.prototype = Object.create(gutil.PluginError.prototype);
RecipeError.prototype.toString = function () {
    var sig = gutil.colors.red(this.name) + ' in ' + gutil.colors.yellow('recipe loader');
    return _formatError(this, sig);
};

/**
 * Recipe error with known name
 *
 * @param name recipe name
 * @param message
 * @param options
 * @constructor
 */
function NamedRecipeError(name, message, options) {
    return gutil.PluginError.call(this, name, message, options);
}

NamedRecipeError.prototype = Object.create(gutil.PluginError.prototype);
NamedRecipeError.prototype.toString = function () {
    var sig = gutil.colors.red(this.name) + ' in recipe \'' + gutil.colors.cyan(this.plugin) + '\'';
    return _formatError(this, sig);
};



/**
 *
 * @param config config object
 * @param proplist list of properties to check
 */
function checkMandatory(config, proplist) {
    function byString(obj, prop) {
        var chain = prop
            .replace(/\[(\w+)\]/g, '.$1') // convert indexes to properties
            .replace(/^\./, '')          // strip a leading dot
            .split('.');

        for (var i = 0, n = chain.length; i < n; ++i) {
            var chainPart = chain[i];
            if (_.isObject(obj)) {
                obj = obj[chainPart];
            } else {
                return;
            }
        }
        return obj;
    }

    if (!_.isArray(proplist)) {
        proplist = [proplist];
    }

    _.each(proplist, function (prop) {
        if (_.isUndefined(byString(config, prop))) {
            throw new RecipeError('Mandatory config field `' + gutil.colors.cyan(prop) + '` is missing.');
        }
    });
}

module.exports = {
    RecipeError: RecipeError,
    NamedRecipeError: NamedRecipeError,
    checkMandatory: checkMandatory
};
