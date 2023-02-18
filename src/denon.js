'use strict';
const axios = require('axios');
const EventEmitter = require('events');
const parseString = require('xml2js').parseStringPromise;
const CONSTANS = require('./constans.json');

class DENON extends EventEmitter {
    constructor(config) {
        super();
        const host = config.host;
        const port = config.port;
        const debugLog = config.debugLog;
        const disableLogConnectError = config.disableLogConnectError;
        const zoneControl = config.zoneControl;
        const mqttEnabled = config.mqttEnabled;
        this.refreshInterval = config.refreshInterval;

        const baseUrl = (`http://${host}:${port}`);
        this.axiosInstance = axios.create({
            method: 'GET',
            baseURL: baseUrl,
            timeout: 10000
        });

        this.axiosInstancePost = axios.create({
            method: 'POST',
            baseURL: baseUrl,
            timeout: 10000,
            headers: {
                "Content-Type": "text/xml"
            }
        });

        this.checkStateOnFirstRun = false;
        this.power = false;
        this.reference = '';
        this.volume = 0;
        this.volumeControlType = '';
        this.mute = false;
        this.pictureMode = 0;
        this.soundMode = '';
        this.devInfo = '';

        this.on('checkDeviceInfo', async () => {
            try {
                const deviceInfo = await this.axiosInstance(CONSTANS.ApiUrls.DeviceInfo);
                const parseDeviceInfo = await parseString(deviceInfo.data);
                const devInfo = parseDeviceInfo.Device_Info;
                const debug = debugLog ? this.emit('debug', `Info: ${JSON.stringify(devInfo, null, 2)}`) : false;

                const brandCode = devInfo.BrandCode[0] || 3;
                const manufacturer = ['Denon', 'Marantz', 'Denon/Marantz'][brandCode];
                const modelName = devInfo.ModelName[0] || 'AV Receiver';
                const serialNumber = devInfo.MacAddress[0] || false;
                const firmwareRevision = devInfo.UpgradeVersion[0] || 0;
                const zones = devInfo.DeviceZones[0] || 0;
                const apiVersion = devInfo.CommApiVers[0] || 0;
                this.devInfo = devInfo;

                if (!serialNumber) {
                    const debug1 = debugLog ? this.emit('debug', `Missing Serial Number: ${serialNumber}, reconnect in 15s.`) : false;
                    this.checkDeviceInfo();
                    return;
                }

                this.checkStateOnFirstRun = true;
                this.emit('deviceInfo', devInfo, manufacturer, modelName, serialNumber, firmwareRevision, zones, apiVersion);
                await new Promise(resolve => setTimeout(resolve, 2000));
                this.emit('checkState');
            } catch (error) {
                const debug = disableLogConnectError ? false : this.emit('error', `Info error: ${error}, reconnect in 15s.`);
                this.checkDeviceInfo();
            };
        })
            .on('checkState', async () => {
                try {
                    //get zones status
                    const zoneUrl = [CONSTANS.ApiUrls.MainZoneStatusLite, CONSTANS.ApiUrls.Zone2StatusLite, CONSTANS.ApiUrls.Zone3StatusLite, CONSTANS.ApiUrls.SoundModeStatus][zoneControl];
                    const deviceState = await this.axiosInstance(zoneUrl);
                    const parseDeviceState = await parseString(deviceState.data);
                    const devState = parseDeviceState.item;
                    const debug = debugLog ? this.emit('debug', `State: ${JSON.stringify(devState, null, 2)}`) : false;

                    //conversion array
                    const conversionArrayInputs = Object.keys(CONSTANS.InputConversion);
                    const conversionArraySoundMode = Object.keys(CONSTANS.SoundModeConversion);

                    //get receiver status
                    const power = devState.Power[0].value[0] === 'ON';
                    const input = conversionArrayInputs.includes(devState.InputFuncSelect[0].value[0]) ? CONSTANS.InputConversion[devState.InputFuncSelect[0].value[0]] : (devState.InputFuncSelect[0].value[0]).toUpperCase();
                    const volumeControlType = devState.VolumeDisplay[0].value[0];
                    const volumeRelative = devState.MasterVolume[0].value[0];
                    const volume = parseFloat(volumeRelative) >= -79.5 ? parseInt(volumeRelative) + 80 : this.volume;
                    const mute = devState.Mute[0].value[0] === 'on';

                    //get picture mode
                    const devicePictureMode = power && zoneControl === 0 ? await this.axiosInstancePost(CONSTANS.ApiUrls.AppCommand, CONSTANS.BodyXml.GetPictureMode) : false;
                    const parseDevicePictureMode = power && zoneControl === 0 ? await parseString(devicePictureMode.data) : false;
                    const debug1 = power && debugLog && zoneControl === 0 ? this.emit('debug', `Picture mode: ${JSON.stringify(parseDevicePictureMode, null, 2)}`) : false;
                    const pictureStatus = power && zoneControl === 0 ? parseDevicePictureMode.rx.cmd[0].status[0] === 1 : false;
                    const pictureMode = power && pictureStatus && zoneControl === 0 ? parseDevicePictureMode.rx.cmd[0].value[0] : this.pictureMode;

                    //get sound mode
                    const deviceSoundMode = power && (zoneControl === 0 || zoneControl === 3) ? await this.axiosInstancePost(CONSTANS.ApiUrls.AppCommand, CONSTANS.BodyXml.GetSurroundModeStatus) : false;
                    const parseDeviceSoundMode = power && (zoneControl === 0 || zoneControl === 3) ? await parseString(deviceSoundMode.data) : false;
                    const debug2 = power && debugLog && (zoneControl === 0 || zoneControl === 3) ? this.emit('debug', `Sound mode: ${JSON.stringify(parseDeviceSoundMode, null, 2)}`) : false;
                    const soundMode = power && (zoneControl === 0 || zoneControl === 3) ? conversionArraySoundMode.includes((parseDeviceSoundMode.rx.cmd[0].surround[0]).replace(/[^a-zA-Z0-9]/g, '').toUpperCase()) ? CONSTANS.SoundModeConversion[(parseDeviceSoundMode.rx.cmd[0].surround[0]).replace(/[^a-zA-Z0-9]/g, '').toUpperCase()] : (parseDeviceSoundMode.rx.cmd[0].surround[0]).replace(/[^a-zA-Z0-9]/g, '').toUpperCase() : this.soundMode;

                    //select reference
                    const reference = zoneControl <= 2 ? input : soundMode;

                    this.checkStateOnFirstRun = false;
                    this.power = power;
                    this.reference = reference;
                    this.volume = volume;
                    this.volumeControlType = volumeControlType;
                    this.mute = mute;
                    this.pictureMode = pictureMode;
                    this.soundMode = soundMode;

                    this.emit('stateChanged', power, reference, volume, volumeControlType, mute, pictureMode);
                    const mqtt = mqttEnabled ? this.emit('mqtt', 'Info', JSON.stringify(this.devInfo, null, 2)) : false;
                    const mqtt1 = mqttEnabled ? this.emit('mqtt', 'State', JSON.stringify(devState, null, 2)) : false;
                    const mqtt2 = mqttEnabled && power && zoneControl === 0 ? this.emit('mqtt', 'Picture', JSON.stringify({ 'Picture Mode': CONSTANS.PictureModesDenonNumber[pictureMode] }, null, 2)) : false;
                    const mqtt3 = mqttEnabled && power && (zoneControl === 0 || zoneControl === 3) ? this.emit('mqtt', 'Surround', JSON.stringify({ 'Sound Mode': CONSTANS.SoundModeConversion[soundMode] }, null, 2)) : false;
                    this.checkState();
                } catch (error) {
                    const debug = disableLogConnectError ? false : this.emit('error', `State error: ${error}, reconnect in 15s.`);
                    const firstRun = this.checkStateOnFirstRun ? this.checkDeviceInfo() : this.emit('disconnect');
                };
            })
            .on('disconnect', () => {
                this.emit('stateChanged', false, this.reference, this.volume, this.volumeControlType, this.mute, this.pictureMode);
                this.emit('disconnected', 'Disconnected.');
                this.checkDeviceInfo();
            });

        this.emit('checkDeviceInfo');
    };

    async checkDeviceInfo() {
        await new Promise(resolve => setTimeout(resolve, 15000));
        this.emit('checkDeviceInfo');
    };

    async checkState() {
        await new Promise(resolve => setTimeout(resolve, this.refreshInterval * 1000));
        this.emit('checkState');
    };

    send(apiUrl, power) {
        return new Promise(async (resolve, reject) => {
            try {
                if (!this.power && !power) {
                    reject(`power OFF, send command skipped.`);
                    return;
                };

                await this.axiosInstance(apiUrl);
                resolve(true);
            } catch (error) {
                reject(error);
            };
        });
    };
};
module.exports = DENON;
