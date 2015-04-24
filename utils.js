'use strict';

var ops = require('./lib/lazypipe-ops');
var lazypipe = require('./lib/lazypipe').lazypipe;
var libSource = require('./lib/source');
var errors = require('./lib/errors');

module.exports = function ($) {
    var _ = $.lodash;

    var runSequence = require('run-sequence').use($.gulp);

    // get pipes with given prefix from specific list
    function _getPipesFrom(pipes, prefix) {
        return pipes ? _.reject(pipes, function (val, key) {
            return prefix ? key.indexOf(prefix) : true; // no prefix means no filtering
        }) : [];
    }

    /**
     * Retrive a list of published pipes with specified prefix from all loaded recipes
     * Note: Suitable for both sequential definitions and plain lazypipes, but type is not checked!
     * @param prefix pipe prefix
     * @returns {*} array of pipe definitions
     */
    function getPipes(prefix) {
        return _.reduce(Object.getOwnPropertyNames($.recipes), function (mem, moduleName) {
            var m = $.recipes[moduleName];
            if(!_.isPlainObject(m)) {
                throw new errors.NamedRecipeError(moduleName, 'Recipe function should return an object.');
            }
            var pipes = _getPipesFrom(m.pipes, prefix);
            return pipes ? mem.concat(pipes) : mem;
        }, []);
    }

    // prepare lazypipes with source files, as defined in "sources" configuration
    /**
     * Transform source config into actual source pipes
     * @param sourceDefs sources configuration
     * @returns {*} hash of source pipes (lazy loaded)
     */
    function makeSources(sourceDefs) {
        var defaultBase = _.isUndefined(sourceDefs.defaultBase) ? '.' : sourceDefs.defaultBase;

        return _.transform(sourceDefs, function (obj, source, key) {
            Object.defineProperty(obj, key, {
                enumerable: true,
                get: _.once(function () {
                    try {
                        return libSource.make(source, $.gulp.src, defaultBase);
                    }
                    catch (e) {
                        console.log(e.stack);
                        throw new errors.RecipeError('Configured source `' + $.gutil.colors.cyan(key) + '` is invalid.');
                    }
                })
            });
        }, {});
    }

    /**
     * Watch source files and do action when any file is added, modified, renamed or deleted
     * Note: needs gulp-watch installed as main project dependency
     * @param sources Source or array of sources to watch
     * @param options options for gulp-watch
     * @param callback Callback to gulp-sass, called when fs event occurs
     * @returns {*} Endless pipe emitting changed files
     */
    function watchSource(sources, options, callback) {
        if (_.isFunction(options) || _.isArray(options) && !callback) {
            callback = options;
            options = {};
        }

        if (!_.isObject(options)) {
            options = {};
        }

        if (!_.isArray(sources)) {
            sources = [sources];
        }

        // handle array of tasks as callback
        if(_.isArray(callback)) {
            var tasks = callback;
            callback = function () {
                runSubtasks(tasks);
            };
        }

        // load watch as external dep
        var distincts = _.filter(_.flatten(_.pluck(sources, 'distinct')), {watch: true});
        return ops.mergedLazypipe(_.map(distincts, function (opts) {
            return lazypipe()
                .pipe($.watch, opts.globs, _.defaults({base: opts.base}, options), callback);
        }));
    }

    /**
     * Run gulp tasks and provide end callback
     * @param tasks Array of single task name to be started
     * @param cb Function to be called when tasks end
     */
    function runSubtasks(tasks, cb) {
        if (!_.isArray(tasks)) {
            tasks = [tasks];
        }

        if (!_.isFunction(cb)) {
            cb = _.noop;
        }

        // exit when
        if (tasks.length === 0) {
            cb();
            return;
        }
        runSequence(tasks, cb);
    }

    /**
     * Conditionaly register gulp task only when name is present
     * @param name
     * @returns {*}
     */
    function maybeTask(name) {
        if (name) {
            return $.gulp.task.apply($.gulp, arguments);
        }
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

    /**
     * pipe transformer for file sorting
     * @returns {lazypipe}
     */
    function sortFiles() {
        return sort(function (a, b) {
            return b.path === a.path ? 0 : b.path > a.path ? 1 : -1;
        });
    }

    /**
     * Collect all hooks with given name from tasks
     * @returns [string]
     */
    function getHooks(name, recipes) {
        return _.chain(recipes)
            .pluck(name)
            .filter()
            .flatten()
            .value();
    }

    return {
        getPipes: getPipes,
        mergedLazypipe: ops.mergedLazypipe,
        parseSources: libSource.parse,
        sequentialLazypipe: ops.sequentialLazypipe,
        queuedLazypipe: ops.queuedLazypipe,
        watchSource: watchSource,
        runSubtasks: runSubtasks,
        maybeTask: maybeTask,
        RecipeError: errors.RecipeError,
        NamedRecipeError: errors.NamedRecipeError,
        checkMandatory: errors.checkMandatory,
        sortFiles: sortFiles,
        makeSources: makeSources,
        getHooks: getHooks
    };
};
