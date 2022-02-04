const fs = require('fs');
const fsPromises = fs.promises;
const EventEmitter = require('events');
const axios = require('axios');
const parseStringPromise = require('xml2js').parseStringPromise;
const API_URL = require('./apiurl.json');
const BODY_XML = require('./bodyxml.json');
const SOUND_MODE = require('./soundmode.json');

const GetSurroundModeStatus = `<?xml version="1.0" encoding="utf-8"?>
            <tx>
              <cmd id="1">${BODY_XML.GetSurroundModeStatus}</cmd>
            </tx>`;
const configXml = {
    headers: {
        'Content-Type': 'text/xml'
    }
};

class DENON extends EventEmitter {
    constructor(config) {
        super();
        this.host = config.host;
        this.port = config.port;
        this.zoneControl = config.zoneControl;
        this.devInfoFile = config.devInfoFile;

        this.baseUrl = (`http://${this.host}:${this.port}`);
        this.axiosInstance = axios.create({
            method: 'GET',
            baseURL: this.baseUrl,
            timeout: 2000
        });

        this.firstStart = true;
        this.checkStateOnFirstRun = false;
        this.isConnected = false;
        this.power = false;
        this.reference = '';
        this.volume = 0;
        this.mute = false;
        this.soundMode = '';

        this.on('connect', () => {
                this.isConnected = true;
                this.checkStateOnFirstRun = true;
                this.emit('connected', 'Connected.');

                this.chackState = setInterval(() => {
                    this.emit('checkState');
                }, 2500)
            })
            .on('checkState', async () => {
                const zoneUrl = [API_URL.MainZoneStatusLite, API_URL.Zone2StatusLite, API_URL.Zone3StatusLite, API_URL.SoundModeStatus][this.zoneControl];
                try {
                    const stateData = await this.axiosInstance(zoneUrl);
                    const parseStateData = await parseStringPromise(stateData.data);

                    const soundModeData = await axios.post(this.baseUrl + API_URL.AppCommand, GetSurroundModeStatus, configXml);
                    const parseSoundModeData = await parseStringPromise(soundModeData.data);
                    const mode = (parseSoundModeData.rx.cmd[0].surround[0]).replace(/[^a-zA-Z0-9]/g, '');
                    const soundMode = SOUND_MODE[mode.toUpperCase()];

                    const power = (parseStateData.item.Power[0].value[0] == 'ON');
                    const reference = (this.zoneControl == 3) ? soundMode : (parseStateData.item.InputFuncSelect[0].value[0] == 'Internet Radio') ? 'IRADIO' : (parseStateData.item.InputFuncSelect[0].value[0] == 'AirPlay') ? 'NET' : parseStateData.item.InputFuncSelect[0].value[0];
                    const volume = (parseFloat(parseStateData.item.MasterVolume[0].value[0]) >= -79.5) ? parseInt(parseStateData.item.MasterVolume[0].value[0]) + 80 : this.volume;
                    const mute = power ? (parseStateData.item.Mute[0].value[0] == 'on') : true;
                    if (this.checkStateOnFirstRun == true || power != this.power || reference != this.reference || volume != this.volume || mute != this.mute || this.soundMode != soundMode) {
                        this.power = power;
                        this.reference = reference;
                        this.volume = volume;
                        this.mute = mute;
                        this.soundMode = soundMode;
                        this.checkStateOnFirstRun = false;
                        this.emit('debug', `Parse state data: ${JSON.stringify(parseStateData, null, 2)}`);
                        this.emit('debug', `Parse sound mode data: ${JSON.stringify(parseSoundModeData, null, 2)}`);
                        this.emit('stateChanged', this.isConnected, power, reference, volume, mute, soundMode);
                    };
                } catch (error) {
                    this.emit('debug', `Device state error: ${error}, trying to reconnect.`);
                    this.emit('disconnect');
                };
            })
            .on('disconnect', () => {
                if (this.isConnected || this.firstStart) {
                    clearInterval(this.chackState);
                    this.isConnected = false;
                    this.firstStart = false;
                    this.emit('stateChanged', this.isConnected, this.power, this.reference, this.volume, true, this.soundMode);
                    this.emit('Disconnected', 'Disconnected.');

                    setTimeout(async () => {
                        try {
                            await this.reconnect();
                        } catch (error) {
                            this.emit('debug', `Reconnect error: ${error}`);
                        };
                    }, 7500);
                };
            });

        this.connect();
    };

    async connect() {
        try {
            await this.getDeviceInfo();
        } catch (error) {
            this.emit('debug', `Connect error: ${error}, trying to reconnect.`);
            this.emit('disconnect');
        };
    };

    getDeviceInfo() {
        return new Promise(async (resolve, reject) => {
            try {
                const deviceInfo = await this.axiosInstance(API_URL.DeviceInfo);
                const parseDeviceInfo = await parseStringPromise(deviceInfo.data);
                const manufacturer = (parseDeviceInfo.Device_Info.BrandCode[0] != undefined) ? ['Denon', 'Marantz'][parseDeviceInfo.Device_Info.BrandCode[0]] : 'undefined';
                const modelName = parseDeviceInfo.Device_Info.ModelName[0];
                const serialNumber = parseDeviceInfo.Device_Info.MacAddress[0];
                const firmwareRevision = parseDeviceInfo.Device_Info.UpgradeVersion[0];
                const zones = parseDeviceInfo.Device_Info.DeviceZones[0];
                const apiVersion = parseDeviceInfo.Device_Info.CommApiVers[0];

                const devInfo = JSON.stringify(parseDeviceInfo.Device_Info, null, 2);
                const writeDevInfo = (this.zoneControl == 0) ? await fsPromises.writeFile(this.devInfoFile, devInfo) : false;
                this.emit('debug', `Get device info: ${devInfo}`);
                this.emit('connect');
                this.emit('deviceInfo', manufacturer, modelName, serialNumber, firmwareRevision, zones, apiVersion);
                resolve(true);
            } catch (error) {
                this.emit('debug', `Get device info error: ${error}`);
                this.emit('disconnect');
                reject(error);
            };
        });
    };

    send(apiUrl) {
        return new Promise(async (resolve, reject) => {
            try {
                const sendCommand = await this.axiosInstance(apiUrl);
                this.emit('message', `Send command: ${apiUrl}`);
                resolve(true);
            } catch (error) {
                this.emit('error', `send command error: ${error}`);
                reject(error);
            };
        });
    };

    reconnect() {
        return new Promise(async (resolve, reject) => {
            try {
                await this.getDeviceInfo();
                resolve(true);
            } catch (error) {
                this.emit('debug', `Reconnect error: ${error}`);
                reject(error);
            };
        });
    };
};
module.exports = DENON;