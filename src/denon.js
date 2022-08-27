'use strict';
const fs = require('fs');
const fsPromises = fs.promises;
const EventEmitter = require('events');
const axios = require('axios');
const parseStringPromise = require('xml2js').parseStringPromise;

const CONSTANS = require('./src/constans.json');
const soundModeStatus = `<?xml version="1.0" encoding="utf-8"?>
            <tx>
              <cmd id="1">${CONSTANS.BodyXml.GetSurroundModeStatus}</cmd>
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
        this.infoLog = config.infoLog;
        this.debugLog = config.debugLog;
        this.zoneControl = config.zoneControl;
        this.devInfoFile = config.devInfoFile;
        this.mqttEnabled = config.enableMqtt;

        const baseUrl = (`http://${this.host}:${this.port}`);
        this.axiosInstance = axios.create({
            method: 'GET',
            baseURL: baseUrl,
            timeout: 10000
        });

        this.axiosInstancePost = axios.create({
            method: 'POST',
            baseURL: baseUrl,
            timeout: 10000
        });

        this.firstRun = false;
        this.checkStateOnFirstRun = false;
        this.power = false;
        this.reference = '';
        this.volume = 0;
        this.mute = true;
        this.soundMode = '';
        this.devInfo = '';

        this.on('connect', () => {
            this.firstRun = true;
            this.checkStateOnFirstRun = true;
            this.emit('connected', 'Connected.');

            setTimeout(() => {
                this.emit('checkState');
            }, 1500)
        })
            .on('checkDeviceInfo', async () => {
                try {
                    const deviceInfo = await this.axiosInstance(CONSTANS.ApiUrls.DeviceInfo);
                    const parseDeviceInfo = await parseStringPromise(deviceInfo.data);
                    const devInfo = JSON.stringify(parseDeviceInfo.Device_Info, null, 2);
                    const debug = this.debugLog ? this.emit('debug', `Parse info data: ${devInfo}`) : false;
                    const writeDevInfo = (this.zoneControl == 0) ? await fsPromises.writeFile(this.devInfoFile, devInfo) : false;
                    this.devInfo = devInfo;

                    let manufacturer = 'Denon/Marantz';
                    if (typeof parseDeviceInfo.Device_Info.BrandCode[0] !== 'undefined') {
                        manufacturer = ['Denon', 'Marantz'][parseDeviceInfo.Device_Info.BrandCode[0]];
                    };
                    const modelName = parseDeviceInfo.Device_Info.ModelName[0];
                    const serialNumber = parseDeviceInfo.Device_Info.MacAddress[0];
                    const firmwareRevision = parseDeviceInfo.Device_Info.UpgradeVersion[0];
                    const zones = parseDeviceInfo.Device_Info.DeviceZones[0];
                    const apiVersion = parseDeviceInfo.Device_Info.CommApiVers[0];

                    if (serialNumber != null && serialNumber != undefined) {
                        this.emit('connect');
                        this.emit('deviceInfo', manufacturer, modelName, serialNumber, firmwareRevision, zones, apiVersion);
                    } else {
                        const debug1 = this.debugLog ? this.emit('debug', `Serial number unknown: ${serialNumber}`) : false;
                        this.checkDeviceInfo();
                    }
                } catch (error) {
                    this.emit('error', `Info error: ${error}`)
                    this.checkDeviceInfo();
                };
            })
            .on('checkState', async () => {
                try {
                    const zoneUrl = [CONSTANS.ApiUrls.MainZoneStatusLite, CONSTANS.ApiUrls.Zone2StatusLite, CONSTANS.ApiUrls.Zone3StatusLite, CONSTANS.ApiUrls.SoundModeStatus][this.zoneControl];
                    const deviceState = await this.axiosInstance(zoneUrl);
                    const parseDeviceState = await parseStringPromise(deviceState.data);
                    const debug = this.debugLog ? this.emit('debug', `State data: ${JSON.stringify(parseDeviceState, null, 2)}`) : false;

                    const checkSoundMode = (this.zoneControl == 0 || this.zoneControl == 3)
                    const deviceSoundMode = checkSoundMode ? await this.axiosInstancePost(CONSTANS.ApiUrls.AppCommand, configXml) : false;
                    const parseDeviceSoundMode = checkSoundMode ? await parseStringPromise(deviceSoundMode.data) : false;
                    const debug1 = this.debugLog ? this.emit('debug', `Sound mode data: ${JSON.stringify(parseDeviceSoundMode, null, 2)}`) : false;
                    const soundMode = checkSoundMode ? CONSTANS.SoundMode[(parseDeviceSoundMode.rx.cmd[0].surround[0]).replace(/[^a-zA-Z0-9]/g, '').toUpperCase()] : this.soundMode;

                    const power = (parseDeviceState.item.Power[0].value[0] == 'ON');
                    const reference = (this.zoneControl == 3) ? soundMode : (parseDeviceState.item.InputFuncSelect[0].value[0] == 'Internet Radio') ? 'IRADIO' : (parseDeviceState.item.InputFuncSelect[0].value[0] == 'AirPlay') ? 'NET' : parseDeviceState.item.InputFuncSelect[0].value[0];
                    const volume = (parseFloat(parseDeviceState.item.MasterVolume[0].value[0]) >= -79.5) ? parseInt(parseDeviceState.item.MasterVolume[0].value[0]) + 80 : this.volume;
                    const mute = power ? (parseDeviceState.item.Mute[0].value[0] == 'on') : true;
                    if (this.checkStateOnFirstRun == true || power != this.power || reference != this.reference || volume != this.volume || mute != this.mute || soundMode != this.soundMod) {
                        this.power = power;
                        this.reference = reference;
                        this.volume = volume;
                        this.mute = mute;
                        this.soundMode = soundMode;
                        this.checkStateOnFirstRun = false;
                        this.emit('stateChanged', power, reference, volume, mute, soundMode);
                    };
                    const mqtt = this.mqttEnabled ? this.emit('mqtt', 'Info', this.devInfo) : false;
                    const mqtt1 = this.mqttEnabled ? this.emit('mqtt', 'State', JSON.stringify(parseDeviceState.item, null, 2)) : false;
                    const surroundMode = {
                        'surround': soundMode
                    }
                    const emitMgtt = checkSoundMode ? this.emit('mqtt', 'Sound Mode', JSON.stringify(surroundMode, null, 2)) : false;

                    setTimeout(() => {
                        this.emit('checkState');
                    }, 1500)
                } catch (error) {
                    this.emit('error', `State error: ${error}`);
                    const firstRun = this.checkStateOnFirstRun ? this.checkDeviceInfo() : this.emit('disconnect');
                };
            })
            .on('disconnect', () => {
                if (this.firstRun) {
                    this.firstRun = false;
                    this.emit('disconnected', 'Disconnected.');
                };

                this.emit('stateChanged', false, this.reference, this.volume, true, this.soundMode);
                this.checkDeviceInfo();
            });

        this.emit('checkDeviceInfo');
    };

    checkDeviceInfo() {
        this.emit('debug', 'Reconnect in 10s.');
        setTimeout(() => {
            this.emit('checkDeviceInfo');
        }, 10000);
    };

    send(apiUrl) {
        return new Promise(async (resolve, reject) => {
            try {
                const sendCommand = await this.axiosInstance(apiUrl);
                const info = this.infoLog ? false : this.emit('message', `Send command: ${apiUrl}`);
                resolve(true);
            } catch (error) {
                this.emit('error', `Send command error: ${error}`);
                reject(error);
            };
        });
    };
};
module.exports = DENON;