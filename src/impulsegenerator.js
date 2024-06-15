"use strict";
const EventEmitter = require('events');

class ImpulseGenerator extends EventEmitter {
    constructor(outputs) {
        super();
        this.outputs = outputs;
        this.timers = [];
    }

    start() {
        this.outputs.forEach(({ name, interval }) => {
            this.emit(name);

            const timer = setInterval(() => {
                this.emit(name);
            }, interval);

            this.timers.push(timer);
        });
    }

    stop() {
        this.timers.forEach(timer => clearInterval(timer));
        this.timers = [];
    }
}
module.exports = ImpulseGenerator;
