'use strict';

var findup = require('findup-sync');
var loadPlugins = require('gulp-load-plugins');
var multimatch = require('gulp-load-plugins/node_modules/multimatch');
var _ = require('lodash');
var path = require('path');
var globby = require('globby');
var gutil = require('gulp-util');

// workaround for linked development modules
var prequire = require('parent-require');
var requireFn = function (module) {
    try {
        return require(module);
    }
    catch(e) {
        return prequire(module);
    }
};

// error handling
function formatError(e) {
    if (!e.err) {
        return e.message;
    }

    // PluginError
    if (typeof e.err.showStack === 'boolean') {
        return e.err.toString();
    }

    // normal error
    if (e.err.stack) {
        return e.err.stack;
    }

    // unknown (string, number, etc.)
    return new Error(String(e.err)).stack;
}

// Necessary to get the current `module.parent` and resolve paths correctly when required from multiple places.
delete require.cache[__filename];
var parentDir = path.dirname(module.parent.filename);

function camelize(str) {
    return str.replace(/-(\w)/g, function(m, p1) {
        return p1.toUpperCase();
    });
}

// require gulp from outside world to prevent multiple instances. This could also be a peer dependency,
// but it gets tricky with multiple layers of modules
module.exports = function (gulp, options) {
    if(!options) {
        options = {};
    }

    // set default options
    options = _.merge({
        tasks: {},
        paths: {},
        order: {},
        sources: {
            defaultBase: '.'
        },
        recipesPattern: 'gulp-recipes/{*/main.js,*.js}',
        rename: {}
    }, options);

    // read package.json or get it from options
    var packageFile = options.package || findup('package.json', {cwd: parentDir});
    if (typeof packageFile === 'string') {
        packageFile = require(packageFile);
    }

    // lazy load all non-recipe plugins from package.json
    var $ = loadPlugins({
        pattern: ['*', '!gulp-recipe-*', '!gulp'],
        scope: ['dependencies', 'devDependencies'],
        replaceString: 'gulp-',
        camelize: true,
        lazy: true,
        config: packageFile,
        rename: options.rename,
        requireFn: requireFn
    });

    // force single gulp instance
    Object.defineProperty($, 'gulp', {value: gulp});

    // publish some internal packages to modules, if not published already
    _.each(['event-stream', 'lodash', 'through2', 'gulp-watch'], function (internal) {
        var camelized = camelize(internal.replace('gulp-',''));
        if(!$.hasOwnProperty(camelized)) {
            Object.defineProperty($, camelized, {
                get: function() {
                    return require(internal);
                }
            });
        }
    });

    // load utility functions
    $.gutil = gutil;
    $.utils = require('./utils')($);

    $.lazypipe = require('./lib/lazypipe').lazypipe;

    // resolve external recipe directories
    var externPattern = ['gulp-recipe-*', '!gulp-recipe-loader'];
    var externScope = ['dependencies', 'devDependencies'];
    var replaceString = 'gulp-recipe-';
    var pluginNames = _.reduce(externScope, function(result, prop) {
        return result.concat(Object.keys(packageFile[prop] || {}));
    }, []);

    var recipeDirectory = _.transform(multimatch(pluginNames, externPattern), function (obj, name) {
        var renamed = options.rename[name] || camelize(name.replace(replaceString, ''));
        obj[renamed] = path.join(parentDir, 'node_modules', name);
    }, {});

    // lazy load all recipes from package.json
    var extPluginsConfig = {
        pattern: externPattern,
        scope: externScope,
        replaceString: replaceString,
        camelize: true,
        lazy: false,
        config: packageFile,
        rename: options.rename,
        requireFn: requireFn
    };

    var recipes = loadPlugins(extPluginsConfig);

    // load all recipes from local project directory
    var localRecipes = _.object(_.map(globby.sync(options.recipesPattern), function (module) {
        return [path.basename(module, '.js'), require(path.join(parentDir, module))];
    }));

    // create a way to extend lib getter object with modules local libs, prefer local versions
    var LibsProto = function () {};
    LibsProto.prototype = $;

    var localLibBuilder = function (recipeName) {
        var localLibs = new LibsProto();
        var dir = recipeDirectory[recipeName];
        if(dir) {
            // find internal package.json
            var localPackageFile = require(findup('package.json', {cwd: dir}));

            // load recipe dependencies
            var localConfig = _.defaults({
                pattern: '*',
                replaceString: 'gulp-',
                config: localPackageFile,
                lazy: true,
                requireFn: function (name) {
                    // resolve inner dependency path
                    var depPath = path.join(dir, 'node_modules', name);
                    try {
                        // direct module require may fail, if dedupe was done
                        return requireFn(depPath);
                    }
                    catch(e) {
                        // for that occasions a regular require is sufficient
                        return requireFn(name);
                    }
                }
            }, extPluginsConfig);

            var localPlugins = loadPlugins(localConfig);

            // pass lazy properties of loaded dependencies into local $ object
            _.each(Object.getOwnPropertyNames(localPlugins), function (prop) {
                Object.defineProperty(localLibs, prop, {
                    get: function () {
                        return localPlugins[prop];
                    }
                })
            });
        }

        return localLibs;
    };

    // prepare lazy initializers for recipes, so it may be cross referenced
    $.recipes = {};
    _.each(_.merge(recipes, localRecipes), function (recipeDef, key) {
        Object.defineProperty($.recipes, key, {
            enumerable: true,
            get: _.once(function () {
                if(_.isFunction(recipeDef)) {
                    recipeDef = { recipe: recipeDef };
                }

                var localLibs, localConfig, sources;
                try {
                    // load module's local dependencies
                    localLibs = localLibBuilder(key);
                    // run config reader on given config
                    localConfig = recipeDef.configReader ? recipeDef.configReader(localLibs, _.clone(options)) : _.clone(options);
                    // prepare source pipes
                    if(localConfig.sources) {
                        sources = localLibs.utils.makeSources(localConfig.sources);
                    }

                    return recipeDef.recipe(localLibs, localConfig, sources);
                }
                catch(e) {
                    // catch recipe errors
                    if(e instanceof $.utils.RecipeError) {
                        throw new $.utils.NamedRecipeError(key, e);
                    }
                    else {
                        throw new $.utils.NamedRecipeError(key, e, {showStack: true});
                    }
                }
            })
        });
    });

    // force load all recipes
    _.each(Object.getOwnPropertyNames($.recipes), function (key) {
        try {
            return $.recipes[key];
        }
        catch(e) {
            var msg = formatError({err: e});
            $.gutil.log(msg);
            process.exit(1);
        }
    });

    return $;
};