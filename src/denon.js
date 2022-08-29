'use strict';
const fs = require('fs');
const fsPromises = fs.promises;
const EventEmitter = require('events');
const axios = require('axios');
const parseStringPromise = require('xml2js').parseStringPromise;

const CONSTANS = require('./constans.json');
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
        this.mqttEnabled = config.mqttEnabled;

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

        this.checkStateOnFirstRun = false;
        this.power = false;
        this.reference = '';
        this.volume = 0;
        this.mute = true;
        this.soundMode = '';
        this.devInfo = '';

        this.on('connect', () => {
            this.checkStateOnFirstRun = true;
            this.emit('connected', 'Connected.');

            setTimeout(() => {
                this.emit('checkState');
            }, 500)
        })
            .on('checkDeviceInfo', async () => {
                try {
                    const deviceInfo = await this.axiosInstance(CONSTANS.ApiUrls.DeviceInfo);
                    const parseDeviceInfo = await parseStringPromise(deviceInfo.data);
                    const devInfo = parseDeviceInfo.Device_Info;
                    const debug = this.debugLog ? this.emit('debug', `Parse info data: ${JSON.stringify(devInfo, null, 2)}`) : false;
                    const writeDevInfo = (this.zoneControl == 0) ? await fsPromises.writeFile(this.devInfoFile, JSON.stringify(devInfo, null, 2)) : false;

                    let manufacturer = 'Denon/Marantz';
                    if (typeof devInfo.BrandCode[0] !== 'undefined') {
                        manufacturer = ['Denon', 'Marantz'][devInfo.BrandCode[0]];
                    };
                    const modelName = devInfo.ModelName[0];
                    const serialNumber = devInfo.MacAddress[0];
                    const firmwareRevision = devInfo.UpgradeVersion[0];
                    const zones = devInfo.DeviceZones[0];
                    const apiVersion = devInfo.CommApiVers[0];
                    this.devInfo = devInfo;

                    if (serialNumber != null && serialNumber != undefined) {
                        this.emit('deviceInfo', manufacturer, modelName, serialNumber, firmwareRevision, zones, apiVersion);
                        this.emit('connect');
                    } else {
                        const debug1 = this.debugLog ? this.emit('debug', `Serial number unknown: ${serialNumber}, reconnect in 15s.`) : false;
                        this.checkDeviceInfo();
                    }
                } catch (error) {
                    this.emit('error', `Info error: ${error}, reconnect in 15s.`)
                    this.checkDeviceInfo();
                };
            })
            .on('checkState', async () => {
                try {
                    const zoneUrl = [CONSTANS.ApiUrls.MainZoneStatusLite, CONSTANS.ApiUrls.Zone2StatusLite, CONSTANS.ApiUrls.Zone3StatusLite, CONSTANS.ApiUrls.SoundModeStatus][this.zoneControl];
                    const deviceState = await this.axiosInstance(zoneUrl);
                    const parseDeviceState = await parseStringPromise(deviceState.data);
                    const devState = parseDeviceState.item;
                    const debug = this.debugLog ? this.emit('debug', `State data: ${JSON.stringify(devState, null, 2)}`) : false;

                    const checkSoundMode = (this.zoneControl == 0 || this.zoneControl == 3)
                    const deviceSoundMode = checkSoundMode ? await this.axiosInstancePost(CONSTANS.ApiUrls.AppCommand, configXml) : false;
                    const parseDeviceSoundMode = checkSoundMode ? await parseStringPromise(deviceSoundMode.data) : false;
                    const debug1 = this.debugLog ? this.emit('debug', `Sound mode data: ${JSON.stringify(parseDeviceSoundMode, null, 2)}`) : false;
                    const soundMode = checkSoundMode ? CONSTANS.SoundMode[(parseDeviceSoundMode.rx.cmd[0].surround[0]).replace(/[^a-zA-Z0-9]/g, '').toUpperCase()] : this.soundMode;

                    const power = (devState.Power[0].value[0] == 'ON');
                    const reference = (this.zoneControl == 3) ? soundMode : (devState.InputFuncSelect[0].value[0] == 'Internet Radio') ? 'IRADIO' : (devState.InputFuncSelect[0].value[0] == 'AirPlay') ? 'NET' : devState.InputFuncSelect[0].value[0];
                    const volume = (parseFloat(devState.MasterVolume[0].value[0]) >= -79.5) ? parseInt(devState.MasterVolume[0].value[0]) + 80 : this.volume;
                    const mute = power ? (devState.Mute[0].value[0] == 'on') : true;
                    if (this.checkStateOnFirstRun == true || power != this.power || reference != this.reference || volume != this.volume || mute != this.mute || soundMode != this.soundMod) {
                        this.power = power;
                        this.reference = reference;
                        this.volume = volume;
                        this.mute = mute;
                        this.soundMode = soundMode;
                        this.checkStateOnFirstRun = false;
                        this.emit('stateChanged', power, reference, volume, mute, soundMode);
                    };
                    const mqtt = this.mqttEnabled ? this.emit('mqtt', 'Info', JSON.stringify(this.devInfo, null, 2)) : false;
                    const mqtt1 = this.mqttEnabled ? this.emit('mqtt', 'State', JSON.stringify(devState, null, 2)) : false;
                    const surroundMode = {
                        'surround': soundMode
                    }
                    const emitMgtt = checkSoundMode ? this.emit('mqtt', 'Sound Mode', JSON.stringify(surroundMode, null, 2)) : false;

                    setTimeout(() => {
                        this.emit('checkState');
                    }, 1500)
                } catch (error) {
                    this.emit('error', `State error: ${error}, reconnect in 15s.`);
                    const firstRun = this.checkStateOnFirstRun ? this.checkDeviceInfo() : this.emit('disconnect');
                };
            })
            .on('disconnect', () => {
                this.emit('disconnected', 'Disconnected.');
                this.emit('stateChanged', false, this.reference, this.volume, true, this.soundMode);
                this.checkDeviceInfo();
            });

        this.emit('checkDeviceInfo');
    };

    checkDeviceInfo() {
        setTimeout(() => {
            this.emit('checkDeviceInfo');
        }, 15000);
    };

    send(apiUrl) {
        return new Promise(async (resolve, reject) => {
            try {
                const sendCommand = await this.axiosInstance(apiUrl);
                const info = this.infoLog ? false : this.emit('message', `Send command: ${apiUrl}`);
                this.emit('checkState');
                resolve(true);
            } catch (error) {
                this.emit('error', `Send command error: ${error}`);
                reject(error);
            };
        });
    };
};
module.exports = DENON;