'use strict';

module.exports = function () {
    return {
        files: [
            'lib/*.js'
        ],

        tests: [
            'test/*.js'
        ],

        env: {
            type: 'node',
            params: {
                runner: '--harmony --harmony_arrow_functions'
            }
        }
    };
};