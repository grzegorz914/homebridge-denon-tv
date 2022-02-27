const fs = require('fs');
const fsPromises = fs.promises;
const EventEmitter = require('events');
const axios = require('axios');
const parseStringPromise = require('xml2js').parseStringPromise;
const API_URL = require('./apiurl.json');
const BODY_XML = require('./bodyxml.json');
const SOUND_MODE = require('./soundmode.json');

const soundModeStatus = `<?xml version="1.0" encoding="utf-8"?>
            <tx>
              <cmd id="1">${BODY_XML.GetSurroundModeStatus}</cmd>
            </tx>`;
const configXml = {
    data: soundModeStatus,
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

        const baseUrl = (`http://${this.host}:${this.port}`);
        this.axiosInstance = axios.create({
            method: 'GET',
            baseURL: baseUrl,
            timeout: 5000
        });

        this.axiosInstancePost = axios.create({
            method: 'POST',
            baseURL: baseUrl,
            timeout: 5000
        });

        this.firstStart = false;
        this.checkStateOnFirstRun = false;
        this.power = false;
        this.reference = '';
        this.volume = 0;
        this.mute = false;
        this.soundMode = '';

        this.on('connect', () => {
                this.firstStart = true;
                this.checkStateOnFirstRun = true;
                this.emit('connected', 'Connected.');
                this.checkState();
            })
            .on('checkDeviceInfo', async () => {
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
                    this.emit('debug', `Get device info: ${devInfo}`);
                    const writeDevInfo = (this.zoneControl == 0) ? await fsPromises.writeFile(this.devInfoFile, devInfo) : false;

                    this.emit('connect');
                    this.emit('deviceInfo', manufacturer, modelName, serialNumber, firmwareRevision, zones, apiVersion);
                    this.emit('mqtt', 'Info', devInfo);
                } catch (error) {
                    this.emit('debug', `Device info error: ${error}`);
                    this.emit('disconnect');
                };
            })
            .on('checkState', async () => {
                try {
                    const zoneUrl = [API_URL.MainZoneStatusLite, API_URL.Zone2StatusLite, API_URL.Zone3StatusLite, API_URL.SoundModeStatus][this.zoneControl];
                    const stateData = await this.axiosInstance(zoneUrl);
                    this.emit('debug', `State data: ${stateData}`);
                    const parseStateData = await parseStringPromise(stateData.data);

                    const checkSoundMode = (this.zoneControl == 0 || this.zoneControl == 3)
                    const soundModeData = checkSoundMode ? await this.axiosInstancePost(API_URL.AppCommand, configXml) : false;
                    this.emit('debug', `Sound mode data: ${soundModeData}`);
                    const parseSoundModeData = checkSoundMode ? await parseStringPromise(soundModeData.data) : false;
                    const mode = checkSoundMode ? (parseSoundModeData.rx.cmd[0].surround[0]).replace(/[^a-zA-Z0-9]/g, '') : false;
                    const soundMode = checkSoundMode ? SOUND_MODE[mode.toUpperCase()] : this.soundMode;

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
                        this.emit('stateChanged', power, reference, volume, mute, soundMode);
                    };
                    this.emit('mqtt', 'State', JSON.stringify(parseStateData.item, null, 2));
                    const surroundMode = {
                        'surround': mode
                    }
                    const emitMgtt = checkSoundMode ? this.emit('mqtt', 'Sound Mode', JSON.stringify(surroundMode, null, 2)) : false;
                    this.checkState();
                } catch (error) {
                    this.emit('error', `Device state error: ${error}`);
                    this.emit('disconnect');
                };
            })
            .on('disconnect', () => {
                this.isConnected = false;
                this.emit('stateChanged', false, this.reference, this.volume, true, this.soundMode);

                if (this.firstStart) {
                    this.firstStart = false;
                    this.emit('Disconnected', 'Disconnected, trying to reconnect.');
                };

                setTimeout(() => {
                    this.emit('checkDeviceInfo');
                }, 7500);
            });

        this.emit('checkDeviceInfo');
    };

    checkState() {
        setTimeout(() => {
            this.emit('checkState');
        }, 1500)
    };

    send(apiUrl) {
        return new Promise(async (resolve, reject) => {
            try {
                const sendCommand = await this.axiosInstance(apiUrl);
                this.emit('message', `Send command: ${apiUrl}`);
                resolve(true);
            } catch (error) {
                this.emit('error', `Send command error: ${error}`);
                reject(error);
            };
        });
    };
};
module.exports = DENON;