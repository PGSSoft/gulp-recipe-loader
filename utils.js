'use strict';

module.exports = function ($) {
    var _ = $.lodash;

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
            var pipes = _getPipesFrom(m.pipes, prefix);
            return pipes ? mem.concat(pipes) : mem;
        }, []);
    }

    /**
     * Merge multiple lazypipes into one
     * @param lazypipes array of plain lazypipes
     * @returns {lazypipe} merged lazypipe
     */
    function mergedLazypipe(lazypipes) {
        if (lazypipes && lazypipes.length > 0) {
            return $.lazypipe()
                .pipe(function () {
                    return $.eventStream.merge.apply($.eventStream, _.map(lazypipes, function (pipe) {
                        return pipe();
                    }));
                });
        }

        return $.lazypipe().pipe($.through2.obj);
    }

    /**
     * Merge multiple lazypipes one after another
     * @param lazypipeDefs array of lazypipe definitions with specified order [[order, lazypipe], ...]
     * @returns {lazypipe} lazypipe representing a sequence of tasks
     */
    function sequentialLazypipe(lazypipeDefs) {
        return _.chain(lazypipeDefs)
            .sortBy(0)
            .pluck(1)
            .reduce(function (merged, lazypipe) {
                return merged.pipe(lazypipe);
            }, $.lazypipe())
            .value();
    }

    function _parseSource(source) {
        if(_.isString(source)) {
            return [{files: source, read: true}];
        }

        if(_.isArray(source)) {
            return _.flatten(_.map(_.filter(_.flatten(source)), _parseSource));
        }

        if(_.isObject(source)) {
            if(_.isString(source.files)) {
                return [source];
            }

            var files = _parseSource(source.files);
            if(!_.isUndefined(source.read)) {
                _.each(files, function (file) { file.read = source.read; })
            }

            if(!_.isUndefined(source.base)) {
                _.each(files, function (file) { file.base = source.base; })
            }

            return files;
        }
        return [];
    }

    // prepare lazypipes with source files, as defined in "sources" configuration
    /**
     * Transform source config into actual source pipes
     * @param sourceDefs sources configuration
     * @returns {*} hash of source pipes
     */
    function makeSources(sourceDefs) {
        return _.transform(sourceDefs, function (obj, source, key) {
            obj[key] = _.chain(_parseSource(source))
                .map(function (obj) {
                    return _.defaults(obj, {read: true, base: sourceDefs.defaultBase});
                })
                .groupBy(function (obj) {
                    return '' + obj.read + '' + obj.base;
                })
                .values()
                .map(function (defs) {
                    var files = _.pluck(defs, 'files'),
                        read = defs[0].read,
                        base = defs[0].base,
                        pipe = $.lazypipe().pipe($.gulp.src, files, {base: base, read: read});

                    pipe.globs = files;
                    pipe.bases = [base];
                    return pipe;
                })
                .thru(function (pipes) {
                    if(pipes.length > 1) {
                        var singlePipe = mergedLazypipe(pipes);
                        singlePipe.globs = _.flatten(_.pluck(pipes, 'globs'));
                        singlePipe.bases = _.flatten(_.pluck(pipes, 'bases'));
                        singlePipe.distinct = _.map(pipes, function (pipe) {
                            return {globs: pipe.globs, base: pipe.bases[0]};
                        });
                        Object.freeze(singlePipe);
                        return singlePipe;
                    }

                    if(pipes.length === 1) {
                        var pipe = pipes[0];
                        pipe.distinct = [{globs: pipe.globs, base: pipe.bases[0]}];
                        Object.freeze(pipe);
                        return pipe;
                    }
                    else {
                        var empty = $.lazypipe().pipe(function () {
                            // instant end
                            var stream = $.through2.obj();
                            stream.push(null);
                            return stream;
                        });

                        empty.distinct = [{globs: [], base: '.'}];
                        empty.globs = [];
                        Object.freeze(empty);
                        return empty;
                    }
                })
                .value();
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

    /**
     * Watch source files and do action when any file is added, modified, renamed or deleted
     * Note: needs gulp-watch installed as main project dependency
     * @param sources Source or array of sources to watch
     * @param options options for gulp-watch
     * @param callback Callback to gulp-sass, called when fs event occurs
     * @returns {*} Endless pipe emitting changed files
     */
    function watchSource(sources, options, callback) {
        if(_.isFunction(options) || _.isArray(options) && !callback) {
            callback = options;
            options = {};
        }

        if(!_.isObject(options)) {
            options = {};
        }

        if(!_.isArray(sources)) {
            sources = [sources];
        }

        // load watch as external dep
        var distincts = _.flatten(_.pluck(sources, 'distinct'));
        return mergedLazypipe(_.map(distincts, function (opts) {
            return $.lazypipe()
                .pipe($.watch, opts.globs, _.defaults({base: opts.base}, options), callback);
        }));
    }

    // orchestrator events cannot be unbound,
    // so bind it only once and resolve handlers in loop

    // register event only once
    var _getEventProcessor = _.memoize(function (event) {
        var handlers = [];
        $.gulp.on(event, function () {
            var self = this;
            var args = arguments;

            _.each(handlers, function (handler) {
                handler.apply(self, args);
            });
        });
        return {
            add: function (cb) {
                handlers.push(cb);
            },
            remove: function (cb) {
                var index = handlers.indexOf(cb);
                if(index >= 0) {
                    handlers.splice(index, 1);
                }
            }
        };
    });

    function on(event, cb) {
        // initialize and get event processor
        var handlers = _getEventProcessor(event);
        // add handler
        handlers.add(cb);
        // return function to unbind event
        return handlers.remove.bind(handlers, cb);
    }

    /**
     * Run gulp tasks and provide end callback
     * @param tasks Array of single task name to be started
     * @param cb Function to be called when tasks end
     */
    function runSubtasks(tasks, cb) {
        if(!_.isArray(tasks)) {
            tasks = [tasks];
        }

        // exit when
        if(tasks.length === 0) {
            if(_.isFunction(cb)) {
                cb();
            }
            return;
        }

        var running = tasks.length;
        var off = on('task_stop', function (e) {
            if(tasks.indexOf(e.task) >= 0 && --running === 0) {
                off();
                if(_.isFunction(cb)) {
                    cb();
                }
            }
        });

        $.gulp.start(tasks);
    }

    /**
     * Conditionaly register gulp task only when name is present
     * @param name
     * @returns {*}
     */
    function maybeTask(name) {
        if(name) {
            return $.gulp.task.apply($.gulp, arguments);
        }
    }

    /**
     * Base error class factory to throw from within recipe.
     */
    function RecipeError(message, options) {
        this.message = message;
        this.options = options;
    }

    /**
     *
     * @param name recipe name
     * @param message
     * @param options
     * @constructor
     */
    function NamedRecipeError(name, message, options) {
        return $.gutil.PluginError.call(this, name, message, options);
    }

    NamedRecipeError.prototype = Object.create($.gutil.PluginError.prototype);
    NamedRecipeError.prototype.toString = function () {
        var sig = $.gutil.colors.red(this.name) + ' in recipe \'' + $.gutil.colors.cyan(this.plugin) + '\'';
        var detailsWithStack = function (stack) {
            return this._messageWithDetails() + '\nStack:\n' + stack;
        }.bind(this);

        var msg;
        if (this.showStack) {
            if (this.__safety) { // There is no wrapped error, use the stack captured in the PluginError ctor
                msg = this.__safety.stack;
            } else if (this._stack) {
                msg = detailsWithStack(this._stack);
            } else { // Stack from wrapped error
                msg = detailsWithStack(this.stack);
            }
        } else {
            msg = this._messageWithDetails();
        }

        return sig + '\n' + msg;
    };

    return {
        getPipes: getPipes,
        mergedLazypipe: mergedLazypipe,
        sequentialLazypipe: sequentialLazypipe,
        makeSources: _.memoize(makeSources),
        watchSource: watchSource,
        runSubtasks: runSubtasks,
        maybeTask: maybeTask,
        RecipeError: RecipeError,
        NamedRecipeError: NamedRecipeError,
        sortFiles: $.lazypipe()
            .pipe(sort, function (a, b) { return b.path ===  a.path ? 0 : b.path > a.path ? 1 : -1; })
    }
};
