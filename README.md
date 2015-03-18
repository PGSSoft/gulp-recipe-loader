# gulp-recipe-loader [![Dependency Status][depstat-image]][depstat-url]
[![NPM][npm-image]][npm-url]

Automatic gulp recipe loading and task registration

## example gulpfile

``` javascript
// deps
var gulp = require('gulp'),
    requireDir = require('require-dir');

// read config files from ./gulp-config directory
var config = requireDir('gulp-config');

// load all recipes
var $ = require('gulp-recipe-loader')(gulp, config);

// mark build task as default
$.gulp.task('default', ['build']);
```

## Sources configuration syntax

First of all, define your defualt base path. It has to be a real path. Default value is `'.'`, but most probably wou will need to change it.
All paths are relative to gulpfile location.
``` javascript
sources.defaultBase = 'app/';
```

There are few ways to define source. The most basic one is just a string with glob path.
``` javascript
sources.css = 'app/styles/*.css';
```

You can also provide an array of globs or other sources.
``` javascript
sources.bowerScripts = [
    'app/bower_components/*/*.js',
    'app/bower_components/*/{dist,min,release}/*.js',
];
```

If you need to change the base for specific set of paths, you can use object notation.
``` javascript
sources.specialFiles = {
    files: 'special/**/*', // the 'files' can be any valid source. A glob or array of globs will work.
    base: 'special/'
};
```

Sources can be easily composited. You can use any valid source inside the other.

``` javascript
sources.devAssets = [
    sources.js,
    sources.css,
    'app/icons/**/icon-*.svg',
    sources.tempFiles
]
```

Important note: If you nest other sources inside source object, the properties of the outer object will be applied.
``` javascript
sources.myFiles = {
    files: 'defs/scene-*.xml',
    base: 'defs/'
};

// this is BAD
sources.moreFiles = {
    files: [sources.assets, 'more/*.files'],
    base: 'more/'
}
```

The actual content of `sources.moreFiles` will be identical to this:
``` javascript
// actual output of that BAD thing
sources.moreFiles = {
    files: ['defs/scene-*.xml', 'more/*.files'],
    base: 'hello/' // note mismatched base for first file definition
}
```

What you probably wanted to do instead is
``` javascript
// this is GOOD
sources.moreFiles = [
    sources.myFiles, // the base is preserved
    {
        files: 'more/*.files',
        base: 'more/'
    }
]
```

[npm-url]: https://npmjs.org/package/gulp-recipe-loader
[npm-image]: https://nodei.co/npm/gulp-recipe-loader.png?downloads=true
[depstat-url]: https://david-dm.org/PGS-dev/gulp-recipe-loader
[depstat-image]: https://img.shields.io/david/PGS-dev/gulp-recipe-loader.svg?style=flat