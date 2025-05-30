import express, { json } from 'express';
import EventEmitter from 'events';

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
            restFul.use(json());

            // GET Routes
            restFul.get('/info', (req, res) => { res.json(this.restFulData.info) });
            restFul.get('/state', (req, res) => { res.json(this.restFulData.state) });
            restFul.get('/picture', (req, res) => { res.json(this.restFulData.picture) });
            restFul.get('/surround', (req, res) => { res.json(this.restFulData.surround) });

            // POST Route
            restFul.post('/', (req, res) => {
                try {
                    const obj = req.body;
                    if (!obj || typeof obj !== 'object' || Object.keys(obj).length === 0) {
                        this.emit('warn', `RESTFul Invalid JSON payload`);
                        return res.status(400).json({ error: 'RESTFul Invalid JSON payload' });
                    }
                    const key = Object.keys(obj)[0];
                    const value = obj[key];
                    this.emit('set', key, value);

                    const emitDebug = this.restFulDebug ? this.emit('debug', `RESTFul post data: ${JSON.stringify(obj, null, 2)}`) : false;
                    res.json({ success: true, received: obj });
                } catch (error) {
                    this.emit('warn', `RESTFul Parse error: ${error}`);
                    res.status(500).json({ error: 'RESTFul Internal Server Error' });
                }
            });

            // Start server
            restFul.listen(this.restFulPort, () => {
                this.emit('connected', `RESTful started on port: ${this.restFulPort}`);
            });
        } catch (error) {
            this.emit('warn', `RESTful Connect error: ${error}`)
        }
    }

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
                this.emit('warn', `RESTFul update unknown path: ${path}, data: ${JSON.stringify(data, null, 2)}`)
                break;
        }
        const emitDebug = this.restFulDebug ? this.emit('debug', `RESTFul update path: ${path}, data: ${JSON.stringify(data, null, 2)}`) : false;
    }
}
export default RestFul;