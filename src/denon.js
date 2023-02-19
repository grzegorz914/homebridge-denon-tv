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
        const zoneControl = config.zoneControl;
        const debugLog = config.debugLog;
        const disableLogConnectError = config.disableLogConnectError;
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

                //device info
                const deviceInfoArray = Object.keys(devInfo);
                const apiVersion = deviceInfoArray.includes('CommApiVers') ? devInfo.CommApiVers[0] : '000';
                const brandCode = deviceInfoArray.includes('BrandCode') ? devInfo.BrandCode[0] : '2';
                const manufacturer = ['Denon', 'Marantz', 'Denon/Marantz'][brandCode];
                const modelName = deviceInfoArray.includes('ModelName') ? devInfo.ModelName[0] : 'AV Receiver';
                const serialNumber = deviceInfoArray.includes('MacAddress') ? devInfo.MacAddress[0] : false;
                const firmwareRevision = deviceInfoArray.includes('UpgradeVersion') ? devInfo.UpgradeVersion[0] : '00';
                const zones = deviceInfoArray.includes('DeviceZones') ? devInfo.DeviceZones[0] : '0';

                if (!serialNumber) {
                    const debug1 = debugLog ? this.emit('debug', `Missing Serial Number, reconnect in 15s.`) : false;
                    this.checkDeviceInfo();
                    return;
                }

                //device capabilities setup
                const capabilitiesSetupArray = Object.keys(devInfo.DeviceCapabilities[0].Setup[0]);
                this.supportToneControl = capabilitiesSetupArray.includes('ToneControl') ? devInfo.DeviceCapabilities[0].Setup[0].ToneControl[0].Control[0] === 1 : false;
                this.supportSubwooferLevel = capabilitiesSetupArray.includes('SubwooferLevel') ? devInfo.DeviceCapabilities[0].Setup[0].SubwooferLevel[0].Control[0] === 1 : false;
                this.supportChannelLevel = capabilitiesSetupArray.includes('ChannelLevel') ? devInfo.DeviceCapabilities[0].Setup[0].ChannelLevel[0].Control[0] === 1 : false;
                this.supportAllZoneStereo = capabilitiesSetupArray.includes('AllZoneStereo') ? devInfo.DeviceCapabilities[0].Setup[0].AllZoneStereo[0].Control[0] === 1 : false;
                this.supportPictureMode = capabilitiesSetupArray.includes('PictureMode') ? devInfo.DeviceCapabilities[0].Setup[0].PictureMode[0].Control[0] === 1 : false;
                this.supportSoundMode = capabilitiesSetupArray.includes('SoundMode') ? devInfo.DeviceCapabilities[0].Setup[0].SoundMode[0].Control[0] === 1 : false;

                //operation
                const capabilitiesOperatonArray = Object.keys(devInfo.DeviceCapabilities[0].Operation[0]);
                this.supportClock = capabilitiesOperatonArray.includes('Clock') ? devInfo.DeviceCapabilities[0].Operation[0].Clock[0].Control[0] === 1 : false;
                this.supportAllZonePower = capabilitiesOperatonArray.includes('AllZonePower') ? devInfo.DeviceCapabilities[0].Operation[0].AllZonePower[0].Control[0] === 1 : false;
                this.supportAllZoneMute = capabilitiesOperatonArray.includes('AllZoneMute') ? devInfo.DeviceCapabilities[0].Operation[0].AllZoneMute[0].Control[0] === 1 : false;
                this.supportFavorites = capabilitiesOperatonArray.includes('Favorites') ? devInfo.DeviceCapabilities[0].Operation[0].Favorites[0].Control[0] === 1 : false;
                this.supportFavorites = capabilitiesOperatonArray.includes('FavoriteStation') ? devInfo.DeviceCapabilities[0].Operation[0].FavoriteStation[0].Control[0] === 1 : false;

                //zone capabilities
                const zonesCapabilitiesArray = Object.keys(devInfo.DeviceZoneCapabilities[this.zoneControl]);
                this.supportShortcutControl = zonesCapabilitiesArray.includes('ShortcutControl') ? devInfo.DeviceZoneCapabilities[this.zoneControl].ShortcutControl[0].Control[0] === 1 : false;
                this.supportPower = zonesCapabilitiesArray.includes('Power') ? devInfo.DeviceZoneCapabilities[this.zoneControl].Power[0].Control[0] === 1 : false;
                this.supportVolume = zonesCapabilitiesArray.includes('Volume') ? devInfo.DeviceZoneCapabilities[this.zoneControl].Volume[0].Control[0] === 1 : false;
                this.supportMute = zonesCapabilitiesArray.includes('Mute') ? devInfo.DeviceZoneCapabilities[this.zoneControl].Mute[0].Control[0] === 1 : false;
                this.supportInputSource = capabilitiesSetupArray.includes('InputSource') ? devInfo.DeviceCapabilities[0].Setup[0].InputSource[0].Control[0] === 1 : false;

                //setup
                const zonesCapabilitiesSetupArray = Object.keys(devInfo.DeviceZoneCapabilities[this.zoneControl].Setup[0]);

                //operation
                const zonesCapabilitiesOperationArray = Object.keys(devInfo.DeviceZoneCapabilities[this.zoneControl].Operation[0]);

                this.emit('deviceInfo', devInfo, manufacturer, modelName, serialNumber, firmwareRevision, zones, apiVersion, this.supportPictureMode);
                await new Promise(resolve => setTimeout(resolve, 2000));
                this.checkStateOnFirstRun = true;
                this.devInfo = devInfo;
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
                    const statusArray = Object.keys(devState);
                    const power = devState.Power[0].value[0] === 'ON';
                    const input = conversionArrayInputs.includes(devState.InputFuncSelect[0].value[0]) ? CONSTANS.InputConversion[devState.InputFuncSelect[0].value[0]] : (devState.InputFuncSelect[0].value[0]).toUpperCase();
                    const volumeControlType = statusArray.includes('VolumeDisplay') ? devState.VolumeDisplay[0].value[0] : this.volumeControlType;
                    const volumeRelative = devState.MasterVolume[0].value[0];
                    const volume = parseFloat(volumeRelative) >= -79.5 ? parseInt(volumeRelative) + 80 : this.volume;
                    const mute = devState.Mute[0].value[0] === 'on';

                    //get picture mode
                    const devicePictureMode = this.supportPictureMode && power && zoneControl === 0 ? await this.axiosInstancePost(CONSTANS.ApiUrls.AppCommand, CONSTANS.BodyXml.GetPictureMode) : false;
                    const parseDevicePictureMode = this.supportPictureMode && power && zoneControl === 0 ? await parseString(devicePictureMode.data) : false;
                    const debug1 = this.supportPictureMode && power && debugLog && zoneControl === 0 ? this.emit('debug', `Picture mode: ${JSON.stringify(parseDevicePictureMode, null, 2)}`) : false;
                    const pictureMode = this.supportPictureMode && power && zoneControl === 0 ? parseDevicePictureMode.rx.cmd[0].value[0] : this.pictureMode;

                    //get sound mode
                    const deviceSoundMode = this.supportSoundMode && power && (zoneControl === 0 || zoneControl === 3) ? await this.axiosInstancePost(CONSTANS.ApiUrls.AppCommand, CONSTANS.BodyXml.GetSurroundModeStatus) : false;
                    const parseDeviceSoundMode = this.supportSoundMode && power && (zoneControl === 0 || zoneControl === 3) ? await parseString(deviceSoundMode.data) : false;
                    const debug2 = this.supportSoundMode && power && debugLog && (zoneControl === 0 || zoneControl === 3) ? this.emit('debug', `Sound mode: ${JSON.stringify(parseDeviceSoundMode, null, 2)}`) : false;
                    const soundMode = this.supportSoundMode && power && (zoneControl === 0 || zoneControl === 3) ? conversionArraySoundMode.includes((parseDeviceSoundMode.rx.cmd[0].surround[0]).replace(/[^a-zA-Z0-9]/g, '').toUpperCase()) ? CONSTANS.SoundModeConversion[(parseDeviceSoundMode.rx.cmd[0].surround[0]).replace(/[^a-zA-Z0-9]/g, '').toUpperCase()] : (parseDeviceSoundMode.rx.cmd[0].surround[0]).replace(/[^a-zA-Z0-9]/g, '').toUpperCase() : this.soundMode;

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
                    const mqtt2 = this.supportPictureMode && mqttEnabled && power && zoneControl === 0 ? this.emit('mqtt', 'Picture', JSON.stringify({ 'Picture Mode': CONSTANS.PictureModesDenonNumber[pictureMode] }, null, 2)) : false;
                    const mqtt3 = this.supportSoundMode && mqttEnabled && power && (zoneControl === 0 || zoneControl === 3) ? this.emit('mqtt', 'Surround', JSON.stringify({ 'Sound Mode': CONSTANS.SoundModeConversion[soundMode] }, null, 2)) : false;
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
