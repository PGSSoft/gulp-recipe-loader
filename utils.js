module.exports = function ($) {
    var _ = $.lodash;

    // get pipes with given prefix from specific list
    function getPipesFrom(pipes, prefix) {
        return pipes ? _.reject(pipes, function (val, key) {
            return prefix ? key.indexOf(prefix) : true; // no prefix means no filtering
        }) : [];
    }

    // get pipes with given prefix from all recipes
    function getPipes(prefix) {
        return _.reduce(Object.getOwnPropertyNames($.recipes), function (mem, moduleName) {
            var m = $.recipes[moduleName];
            var pipes = getPipesFrom(m.pipes, prefix);
            return pipes ? mem.concat(pipes) : mem;
        }, []);
    }

    // merge multiple lazypipes into one
    function mergedLazypipe(lazypipes) {
        if (lazypipes && lazypipes.length > 0) {
            return $.lazypipe()
                .pipe(function () {
                    return $.eventStream.merge.apply($.eventStream, _.map(lazypipes, function (pipe) {
                        return pipe();
                    }));
                });
        }

        return $.through2.obj;
    }

    // merge multiple lazypipes one after another
    function sequentialLazypipe(lazypipeDefs) {
        return _.chain(lazypipeDefs)
            .sortBy(0)
            .pluck(1)
            .reduce(function (merged, lazypipe) {
                return merged.pipe(lazypipe);
            }, $.lazypipe())
            .value();
    }

    // prepare lazypipes with source files, as defined in "sources" configuration
    function makeSources(sources) {
        return _.reduce(sources, function (obj, source, key) {
            var direct = _.isArray(source) || _.isString(source);

            var base = (!direct && source.base) || sources.defaultBase;
            var sourceStrs = direct ? source : source.files;
            var read = (direct || _.isUndefined(source.read)) ? true : source.read;

            obj[key] = $.lazypipe()
                .pipe($.gulp.src, sourceStrs, {base: base, read: read});
            return obj;
        }, {});
    }

    // sort files in pipe
    function sort(comp) {
        var buff = [];
        return $.through2.obj(function (file, enc, done) {
            buff.push(file);
            done(null);
        }, function (done) {
            buff.sort(comp).forEach(this.push.bind(this));
            buff.length = 0;
            done(null);
        });
    }

    return {
        getPipes: getPipes,
        mergedLazypipe: mergedLazypipe,
        sequentialLazypipe: sequentialLazypipe,
        makeSources: makeSources,
        sortFiles: $.lazypipe()
            .pipe(sort, function (a, b) { return b.path ===  a.path ? 0 : b.path > a.path ? 1 : -1; })
    }
};
