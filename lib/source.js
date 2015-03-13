'use strict';

var _ = require('lodash');
var lazypipe = require('./lazypipe').lazypipe;
var through2 = require('through2');
var opts = require('./lazypipe-ops');

var parseSource = function (source) {
    if (_.isString(source)) {
        return [{files: source}];
    }

    if (_.isArray(source)) {
        return _.flatten(_.map(_.filter(_.flatten(source)), parseSource));
    }

    if (_.isObject(source)) {
        if (_.isString(source.files)) {
            return [source];
        }

        var files = parseSource(source.files);

        _.each(Object.getOwnPropertyNames(source), function (prop) {
            if(prop !== 'files' && !_.isUndefined(source[prop])) {
                _.each(files, function (file) {
                    file[prop] = source[prop];
                });
            }
        });

        return files;
    }

    return null;
};

//var ind = 1;
//function makeIndent(ind) {
//    return (new Array(ind)).join('\t');
//};
//
//parseSource = _.wrap(parseSource, function (fn, data) {
//    console.log('in ', makeIndent(ind), data)
//    ind++;
//    var out = fn(data);
//    ind--;
//    console.log('out', makeIndent(ind), out);
//    return out;
//})

function makeSource(source, sourceCtor, defaultBase) {
    var parsed = parseSource(source);
    if (_.isNull(parsed)) {
        throw new Error();
    }

    return _.chain(parsed)
        .map(function (obj) {
            return _.defaults(obj, {read: true, watch: true, base: defaultBase});
        })
        .thru(function (defs) {
            // groupBy with order preservation
            var table = {};
            var max = 0;

            function hash(obj) {
                return '' + obj.read + '_' + obj.base + '_' + (obj.watch === false ? 'f' : 't');
            }

            var groups = [];
            _.each(defs, function (def) {
                var defHash = hash(def);
                var key = table[defHash];
                if(_.isUndefined(key)) {
                    key = max++;
                    table[defHash] = key;
                    groups[key] = [];
                }
                groups[key].push(def);
            });

            return groups;
        })
        .map(function (group) {
            return {
                read: group[0].read,
                base: group[0].base,
                watch: group[0].watch,
                globs: _.pluck(group, 'files')
            };
        })
        .map(function (def) {
            var pipe = lazypipe().pipe(sourceCtor, def.globs, {base: def.base, read: def.read});
            pipe.globs = def.globs;
            pipe.bases = [def.base];
            pipe.watch = def.watch;
            pipe.read = def.read;
            pipe.distinct = [def];
            return pipe;
        })
        .thru(function (pipes) {
            if (pipes.length > 1) {
                var singlePipe = opts.mergedLazypipe(pipes);
                Object.freeze(singlePipe);
                return singlePipe;
            }

            if (pipes.length === 1) {
                var pipe = pipes[0];
                Object.freeze(pipe);
                return pipe;
            }
            else {
                var empty = lazypipe().pipe(function () {
                    // instant end
                    var stream = through2.obj();
                    stream.push(null);
                    return stream;
                });

                empty.distinct = [{globs: [], base: '.', watch: false}];
                empty.globs = [];
                empty.watch = false;
                empty.bases = [];
                Object.freeze(empty);
                return empty;
            }
        })
        .value();
}

module.exports = {
    make: makeSource,
    parse: parseSource
};