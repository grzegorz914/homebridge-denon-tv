"use strict";
const express = require('express');
const EventEmitter = require('events');

class RestFul extends EventEmitter {
    constructor(config) {
        super();
        this.restFulPort = config.port;
        this.restFulDebug = config.debug;

        this.restFulData = {
            info: 'This data is not available at this time for this zone.',
            state: 'This data is not available at this time for this zone.',
            picture: 'This data is not available at this time for this zone.',
            surround: 'This data is not available at this time for this zone.'
        };

        this.connect();
    };

    connect() {
        try {
            const restFul = express();
            restFul.set('json spaces', 2);
            restFul.get('/info', (req, res) => { res.json(this.restFulData.info) });
            restFul.get('/state', (req, res) => { res.json(this.restFulData.state) });
            restFul.get('/picture', (req, res) => { res.json(this.restFulData.picture) });
            restFul.get('/surround', (req, res) => { res.json(this.restFulData.surround) });

            restFul.listen(this.restFulPort, () => {
                this.emit('connected', `RESTful started on port: ${this.restFulPort}`)
            });

        } catch (error) {
            this.emit('error', `RESTful error: ${error}`)
        }
    };

    update(path, data) {
        switch (path) {
            case 'info':
                this.restFulData.info = data;
                break;
            case 'state':
                this.restFulData.state = data;
                break;
            case 'picture':
                this.restFulData.picture = data;
                break;
            case 'surround':
                this.restFulData.surround = data;
                break;
            default:
                this.emit('debug', `RESTFul update unknown path: ${path}, data: ${data}`)
                break;
        };
        const emitDebug = this.restFulDebug ? this.emit('debug', `RESTFul update path: ${path}, data: ${data}`) : false;
    };
};
module.exports = RestFul;