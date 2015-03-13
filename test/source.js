'use strict';

var chai = require('chai');
var chaiAsPromised = require('chai-as-promised');
var sinon = require('sinon');
var sinonChai = require('sinon-chai');
chai.use(chaiAsPromised);
chai.use(sinonChai);
var expect = chai.expect;

var source = require('./../lib/source');

describe('recipe loader source module', function () {
    describe('parsing', function () {
        it('should parse single string', function () {

            var parseIn = 'app/*.js';
            var parseOut = [{
                files: 'app/*.js'
            }];

            expect(source.parse(parseIn)).to.eql(parseOut);
        });

        it('should parse array of strings', function () {

            var parseIn = ['app/*.js', 'app/*.css'];
            var parseOut = [{
                files: 'app/*.js'
            }, {
                files: 'app/*.css'
            }];

            expect(source.parse(parseIn)).to.eql(parseOut);
        });

        it('should parse object with files as string', function () {
            var parseIn = {
                files: 'app/*.js'
            };

            var parseOut = [{
                files: 'app/*.js'
            }];

            expect(source.parse(parseIn)).to.eql(parseOut);
        });

        it('should parse array of objects with files as string', function () {
            var parseIn = [{
                files: 'app/*.js'
            }, {
                files: 'app/*.css'
            }];

            var parseOut = [{
                files: 'app/*.js'
            }, {
                files: 'app/*.css'
            }];

            expect(source.parse(parseIn)).to.eql(parseOut);
        });

        it('should parse array of object with files as array of strings', function () {
            var parseIn = [{
                files: ['app/*.js', 'app/*.css']
            }, {
                files: ['tmp/*.js', 'tmp/*.css']
            }];

            var parseOut = [{
                files: 'app/*.js'
            }, {
                files: 'app/*.css'
            }, {
                files: 'tmp/*.js'
            }, {
                files: 'tmp/*.css'
            }];

            expect(source.parse(parseIn)).to.eql(parseOut);
        });

        it('should parse array of mixed strings and objects', function () {
            var parseIn = [
                'app/*.js',
                'app/*.css',
                {files: ['tmp/*.js', 'tmp/*.css'], base: 'tmp/'},
                {files: 'img/*.{png,jpg}', base: 'img/'}
            ];

            var parseOut = [{
                files: 'app/*.js'
            }, {
                files: 'app/*.css'
            }, {
                files: 'tmp/*.js',
                base: 'tmp/'
            }, {
                files: 'tmp/*.css',
                base: 'tmp/'
            }, {
                files: 'img/*.{png,jpg}',
                base: 'img/'
            }];

            expect(source.parse(parseIn)).to.eql(parseOut);
        });
    });

    describe('creating', function () {
        var defaultBase = 'app/';
        var noop = function () {
        };

        it('should make pipe from simple files definition', function () {
            var makeIn = [{
                files: 'app/*.js'
            }];

            var globs = ['app/*.js'];
            var bases = ['app/'];
            var distinct = [{
                globs: ['app/*.js'],
                base: 'app/',
                watch: true,
                read: true
            }];

            var made = source.make(makeIn, noop, defaultBase);
            expect(made.globs).to.eql(globs);
            expect(made.bases).to.eql(bases);
            expect(made.distinct).to.eql(distinct);
        });

        it('should make pipe from complex files definition', function () {
            var makeIn = [{
                files: 'app/*.js'
            }, {
                files: 'app/*.css'
            }, {
                files: 'tmp/*.js',
                base: 'tmp/'
            }, {
                files: 'tmp/*.css',
                base: 'tmp/'
            }, {
                files: 'img/*.{png,jpg}',
                base: 'img/'
            }];

            var globs = ['app/*.js', 'app/*.css', 'tmp/*.js', 'tmp/*.css', 'img/*.{png,jpg}'];
            var bases = ['app/', 'tmp/', 'img/'];
            var distinct = [{
                base: 'app/',
                globs: ['app/*.js', 'app/*.css'],
                read: true,
                watch: true
            }, {
                base: 'tmp/',
                globs: ['tmp/*.js', 'tmp/*.css'],
                read: true,
                watch: true
            }, {
                base: 'img/',
                globs: ['img/*.{png,jpg}'],
                read: true,
                watch: true
            }];

            var made = source.make(makeIn, noop, defaultBase);
            expect(made.globs).to.be.eql(globs);
            expect(made.bases).to.be.eql(bases);
            expect(made.distinct).to.be.eql(distinct);
        });
    });

    describe('using pipes', function () {
        var defaultBase = 'app/';

        it('should call pipe constructor on initialization', function () {
            var ctor = sinon.stub().returns({pipe: function () {}, on: function () {}});

            var makeIn = [{
                files: 'app/*.js'
            }, {
                files: 'app/*.css'
            }, {
                files: 'tmp/*.js',
                base: 'tmp/'
            }, {
                files: 'tmp/*.css',
                base: 'tmp/'
            }, {
                files: 'img/*.{png,jpg}',
                base: 'img/',
                read: false
            }];

            var made = source.make(makeIn, ctor, defaultBase);

            // initialize stubbed pipe
            made();

            expect(ctor).to.have.been.calledThrice;
            expect(ctor).to.have.been.calledWith(['app/*.js', 'app/*.css'], {base: 'app/', read: true});
            expect(ctor).to.have.been.calledWith(['tmp/*.js', 'tmp/*.css'], {base: 'tmp/', read: true});
            expect(ctor).to.have.been.calledWith(['img/*.{png,jpg}'], {base: 'img/', read: false});
        });
    });
});