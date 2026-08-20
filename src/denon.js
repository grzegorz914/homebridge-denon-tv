import axios from 'axios';
import { Agent as HttpsAgent } from 'https';
import EventEmitter from 'events';
import ImpulseGenerator from './impulsegenerator.js';
import Functions from './functions.js';
import { XMLParser } from 'fast-xml-parser';
import { ApiUrls, ManufacturerMap } from './constants.js';

class Denon extends EventEmitter {
    constructor(config, devInfoFile) {
        super();
        this.host = config.host;
        this.generation = config.generation || 0;
        this.logDebug = config.log?.debug || false;
        this.devInfoFile = devInfoFile;
        this.firstRun = true;
        this.functions = new Functions();

        // Some gen 2 (2023+) models front their API with HTTPS on port 443 (e.g. self-signed nginx),
        // others still serve plain HTTP on 80/8080 (e.g. Cinema series) - use the port as the signal.
        const useHttps = this.generation === 2 && Number(config.port) === 443;
        const protocol = useHttps ? 'https' : 'http';
        const baseUrl = `${protocol}://${config.host}:${config.port}`;
        const commonConfig = {
            baseURL: baseUrl,
            timeout: 20000
        };

        const httpsConfig = useHttps ? { httpsAgent: new HttpsAgent({ rejectUnauthorized: false, keepAlive: false }) } : {};
        this.client = axios.create({
            ...commonConfig,
            ...httpsConfig,
        });

        const options = {
            ignoreAttributes: false,
            ignorePiTags: true,
            allowBooleanAttributes: true
        };
        this.parseString = new XMLParser(options);

        // execution queue (prevents race conditions and lost ticks)
        this.executionQueue = Promise.resolve();
        const runQueued = (task) => {
            this.executionQueue = this.executionQueue
                .then(() => task())
                .catch((error) => {
                    this.emit('error', error?.message ?? error);
                });

            return this.executionQueue;
        };

        this.impulseGenerator = new ImpulseGenerator()
            .on('connect', () =>
                runQueued(async () => {
                    await this.connect();
                })
            )
            .on('checkState', () =>
                runQueued(async () => {
                    this.emit('checkState');
                })
            )
            .on('state', (state) => {
                this.emit(state ? 'success' : 'warn', `Impulse generator ${state ? 'started' : 'stopped'}`);
            });

    }

    async connect() {
        try {
            // Fetch & parse denon info
            const deviceInfoUrl = [ApiUrls.DeviceInfoGen0, ApiUrls.DeviceInfoGen1, ApiUrls.DeviceInfoGen2][this.generation];
            const deviceInfo = await this.client.get(deviceInfoUrl);
            const parseData = this.parseString.parse(deviceInfo.data);

            const generationMap = {
                0: parseData.item,
                1: parseData.Device_Info,
                2: parseData.Device_Info
            };
            const denonInfo = generationMap[this.generation];
            if (this.logDebug) this.emit('debug', `Connect data: ${JSON.stringify(denonInfo, null, 2)}`);

            // Device info
            denonInfo.info = {
                manufacturer: ManufacturerMap[denonInfo.BrandCode ?? 2],
                modelName: denonInfo.ModelName || denonInfo.FriendlyName?.value || 'AV Receiver',
                serialNumber: denonInfo.MacAddress?.toString() || `1234567654321${this.host}`,
                firmwareRevision: denonInfo.UpgradeVersion?.toString() || '00',
                deviceZones: denonInfo.DeviceZones ?? 1,
                apiVersion: denonInfo.CommApiVers || '000'
            };

            // Capabilities
            const caps = denonInfo.DeviceCapabilities || {};
            const setup = caps.Setup || {};
            denonInfo.info.supportPictureMode = setup.PictureMode?.Control === 1;
            denonInfo.info.supportSoundMode = setup.SoundMode?.Control === 1;
            denonInfo.info.supportFavorites = caps.Operation?.Favorites?.Control === 1;

            //  Success event
            if (this.firstRun) {
                this.emit('success', `Connect Success`);
                await this.functions.saveData(this.devInfoFile, denonInfo.info);
                this.firstRun = false;
            }

            // Emit denon info
            this.emit('denonInfo', denonInfo);

            return denonInfo;
        } catch (error) {
            if (this.logDebug) this.emit('debug', `Connect request: ${error.config?.method?.toUpperCase()} ${error.config?.baseURL}${error.config?.url}, response: ${error.response?.status} ${JSON.stringify(error.response?.data)}`);
            throw new Error(`Connect error: ${error}`);
        }
    }

    async send(command) {
        const path = `${ApiUrls.iPhoneDirect}${command}`;
        try {
            await this.client.get(path);
            if (this.logDebug) this.emit('debug', `Send path: ${path}`);
            return true;
        } catch (error) {
            if (this.logDebug) this.emit('debug', `Send request: ${error.config?.method?.toUpperCase()} ${error.config?.baseURL}${error.config?.url}, response: ${error.response?.status} ${JSON.stringify(error.response?.data)}`);
            throw new Error(`Send data error: ${error}`);
        }
    }
}
export default Denon;
