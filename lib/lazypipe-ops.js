'use strict';

var lazypipe = require('./lazypipe').lazypipe;
var addSourceParams = require('./lazypipe').addSourceParams;
var eventStream = require('event-stream');
var through = require('through2');
var StreamQueue = require('streamqueue');
var _ = require('lodash');

function assertUnordered(lazypipes) {
    var unordered = _.all(lazypipes, function (def) {
        return _.isFunction(def);
    });

    if(!unordered) {
        throw new Error('Expected unordered pipes.');
    }
}

function assertOrdered(lazypipeDefs) {
    var ordered = _.all(lazypipeDefs, function (def) {
        return _.isArray(def) && _.isFunction(def[1]);
    });

    if(!ordered) {
        throw new Error('Expected ordered pipes.');
    }
}

/**
 * Merge multiple lazypipes into one
 * @param lazypipes array of plain lazypipes
 * @returns {lazypipe} merged lazypipe
 */
function mergedLazypipe(lazypipes) {
    assertUnordered(lazypipes);
    if (lazypipes && lazypipes.length > 0) {
        var newPipe = lazypipe()
            .pipe(function () {
                return eventStream.merge.apply(eventStream, _.map(lazypipes, function (pipe) {
                    return pipe();
                }));
            });

        // accumulate collected sources into new pipe
        _.each(lazypipes, addSourceParams.bind(null, newPipe));
        return newPipe;
    }

    // no pipes to merge
    return lazypipe().pipe(function () {
        var stream = through.obj();
        stream.push(null); // end
        return stream;
    });
}

/**
 * Merge multiple lazypipes one after another
 * @param lazypipeDefs array of lazypipe definitions with specified order [[order, lazypipe], ...]
 * @returns {lazypipe} lazypipe representing a sequence of tasks
 */
function sequentialLazypipe(lazypipeDefs) {
    assertOrdered(lazypipeDefs);

    if (lazypipeDefs.length === 0) {
        return lazypipe().pipe(through.obj);
    }

    return _.chain(lazypipeDefs)
        .sortBy(0)
        .pluck(1)
        .reduce(function (merged, lazypipe) {
            return merged.pipe(lazypipe);
        }, lazypipe())
        .value();
}

/**
 * Merge multiple lazypipes into one in specific order
 * @param lazypipeDefs array of lazypipe definitions with specified order [[order, lazypipe], ...]
 * @returns {lazypipe} queued lazypipe
 */
function queuedLazypipe(lazypipeDefs) {
    assertOrdered(lazypipeDefs);

    if (lazypipeDefs.length === 0) {
        return lazypipe().pipe(function () {
            var stream = through.obj();
            stream.push(null); // end
            return stream;
        });
    }

    var orderedPipes = _.chain(lazypipeDefs)
        .sortBy(0)
        .pluck(1)
        .value();

    var queueBuilder = function () {
        return _.reduce(orderedPipes, function (streamQueue, lazypipe) {
            return streamQueue.queue(lazypipe);
        }, new StreamQueue({objectMode: true}))
            .done();
    };

    var newPipe = lazypipe()
        .pipe(queueBuilder);

    _.each(orderedPipes, addSourceParams.bind(null, newPipe));
    // no pipes to merge
    return newPipe;
}

module.exports = {
    mergedLazypipe: mergedLazypipe,
    queuedLazypipe: queuedLazypipe,
    sequentialLazypipe: sequentialLazypipe
};