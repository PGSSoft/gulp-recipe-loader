# gulp-recipe-loader
Automatic gulp recipe loading and task registration

### example gulpfile
    // deps
    var _ = require('lodash'), 
        gulp = require('gulp'),
        requireDir = require('require-dir');

    // read config files and extend top level config
    var config = _.extend(requireDir('gulp-config'), {
        useHistoryApi: false
    });
    
    // load all recipes
    var $ = require('gulp-recipe-loader')(gulp, config);
    
    // mark build task as default
    $.gulp.task('default', ['build']);
