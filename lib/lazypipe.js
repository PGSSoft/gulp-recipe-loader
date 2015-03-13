'use strict';

// patch lazypipe module to pass sources props down the stream
var lazypipe = require('lazypipe');
var _ = require('lodash');

// merge arrays and keep unique
function _fillUnique(dest, source, key) {
    var destVal = dest[key];
    var srcVal = source[key];

    if (_.isUndefined(srcVal)) {
        return;
    }

    if (_.isArray(destVal) && _.isArray(srcVal)) {
        dest[key] = _.uniq(_.union(destVal, srcVal), function (val) {
            return _.isObject(val) ? JSON.stringify(val) : val;
        });

        return;
    }

    dest[key] = srcVal;
}

/**
 * add source parameters to another lazypipe
 * @param destPipe
 * @param sourcePipe
 */
function addSourceParams(destPipe, sourcePipe) {
    _.each(['distinct', 'globs', 'bases'], _fillUnique.bind(null, destPipe, sourcePipe));
}

function pipeFn(_pipe, ctor) {
    var args = Array.prototype.slice.call(arguments, 1);
    var newPipe = _pipe.apply(this, args);

    // recursively patch new object, as _pipe uses original createPipeline internally;
    newPipe.pipe = pipeFn.bind(newPipe, newPipe.pipe);

    // copy params from previous pipe
    addSourceParams(newPipe, this);

    // when another stream passed as constructor, copy its params too
    if(ctor.appendStepsTo) {
        addSourceParams(newPipe, ctor);
    }

    return newPipe;
}

var patchedLazypipe = function patchedLazypipe() {
    var build = lazypipe();
    build.pipe = pipeFn.bind(build, build.pipe);
    return build;
};

module.exports = {
    lazypipe: patchedLazypipe,
    addSourceParams: addSourceParams
};