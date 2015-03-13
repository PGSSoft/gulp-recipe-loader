'use strict';

var chai = require('chai');
var chaiAsPromised = require('chai-as-promised');
var sinon = require('sinon');
var sinonChai = require('sinon-chai');
chai.use(chaiAsPromised);
chai.use(sinonChai);
var expect = chai.expect;

var source = require('./../lib/source');

describe('recipe loader source module', () => {
    describe('parsing', () => {
        it('should parse single string', () => {

            var parseIn = 'app/*.js';
            var parseOut = [{
                files: 'app/*.js'
            }];

            expect(source.parse(parseIn)).to.eql(parseOut);
        });

        it('should parse array of strings', () => {

            var parseIn = ['app/*.js', 'app/*.css'];
            var parseOut = [{
                files: 'app/*.js'
            }, {
                files: 'app/*.css'
            }];

            expect(source.parse(parseIn)).to.eql(parseOut);
        });

        it('should parse object with files as string', () => {
            var parseIn = {
                files: 'app/*.js'
            };

            var parseOut = [{
                files: 'app/*.js'
            }];

            expect(source.parse(parseIn)).to.eql(parseOut);
        });

        it('should parse array of objects with files as string', () => {
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

        it('should parse array of object with files as array of strings', () => {
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

        it('should parse array of mixed strings and objects', () => {
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

        it('should throw error for invalid input', () => {
            var fn1 = () => source.parse({});
            var fn2 = () => source.parse([{}]);
            var fn3 = () => source.parse({files: [{}]});
            var fn4 = () => source.parse({files: {}});

            expect(fn1).to.throw(Error, 'invalid source');
            expect(fn2).to.throw(Error, 'invalid source');
            expect(fn3).to.throw(Error, 'invalid source');
            expect(fn4).to.throw(Error, 'invalid source');
        });
    });

    describe('creating', () => {
        var defaultBase = 'app/';
        var noop = () => {
        };

        it('should make pipe from simple files definition', () => {
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

        it('should make pipe from complex files definition', () => {
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

        it('should throw on invalid input', () => {
            var fn1 = () => source.make({}, noop, defaultBase);
            expect(fn1).to.throw(Error, 'invalid source');
        });

        it('should recognize distinct sources with different watch', () => {
            var makeIn = [{
                files: 'app/*.js',
                watch: true
            }, {
                files: 'app/*.scss',
                watch: false
            }, 'app/*.css'];

            var distinct = [{
                base: 'app/',
                globs: ['app/*.js', 'app/*.css'],
                read: true,
                watch: true
            }, {
                base: 'app/',
                globs: ['app/*.scss'],
                read: true,
                watch: false
            }];

            var made = source.make(makeIn, noop, defaultBase);

            expect(made.distinct).to.be.eql(distinct);
        });

        it('should emit ended pipe for empty input', () => {
            var makeIn = [];

            var made = source.make(makeIn, noop, defaultBase);

            expect(made.distinct).to.be.eql([]);
            expect(made.globs).to.be.eql([]);
            expect(made.bases).to.be.eql([]);
            expect(made.watch).to.be.equal(false);

            var p = new Promise(function (resolve, reject) {
                var pipe = made();
                pipe.on('data', reject);
                pipe.on('end', resolve);
            });

            return expect(p).to.eventually.be.resovled;
        });

    });

    describe('using pipes', () => {
        var defaultBase = 'app/';

        it('should call pipe constructor on initialization', () => {
            var ctor = sinon.stub().returns({
                pipe: () => {
                }, on: () => {
                }
            });

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