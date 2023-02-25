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
            timeout: 10000
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
                const deviceInfoKeys = Object.keys(devInfo);
                const apiVersion = deviceInfoKeys.includes('CommApiVers') ? devInfo.CommApiVers[0] : '000';
                const brandCode = deviceInfoKeys.includes('BrandCode') ? devInfo.BrandCode[0] : '2';
                const manufacturer = ['Denon', 'Marantz', 'Denon/Marantz'][brandCode];
                const modelName = deviceInfoKeys.includes('ModelName') ? devInfo.ModelName[0] : 'AV Receiver';
                const serialNumber = deviceInfoKeys.includes('MacAddress') ? devInfo.MacAddress[0] : false;
                const firmwareRevision = deviceInfoKeys.includes('UpgradeVersion') ? devInfo.UpgradeVersion[0] : '00';
                const zones = deviceInfoKeys.includes('DeviceZones') ? parseInt(devInfo.DeviceZones[0]) : 1;

                //check correc zone control
                const checkZone = zoneControl < zones ? true : false;
                const checkZoneNr = zoneControl < zones ? zoneControl : zones - 1;

                //device capabilities
                const capabilitiesSupport = deviceInfoKeys.includes('DeviceCapabilities');
                const capabilitiesSetupKeys = capabilitiesSupport ? Object.keys(devInfo.DeviceCapabilities[0]) : [];

                //setup
                const capabilitiesSetupSupport = capabilitiesSetupKeys.includes('Setup');
                this.supportTone = capabilitiesSetupSupport && capabilitiesSetupKeys.includes('ToneControl') ? devInfo.DeviceCapabilities[0].Setup[0].ToneControl[0].Control[0] === '1' : false;
                this.supportSubwooferLevel = capabilitiesSetupSupport && capabilitiesSetupKeys.includes('SubwooferLevel') ? devInfo.DeviceCapabilities[0].Setup[0].SubwooferLevel[0].Control[0] === '1' : false;
                this.supportChannelLevel = capabilitiesSetupSupport && capabilitiesSetupKeys.includes('ChannelLevel') ? devInfo.DeviceCapabilities[0].Setup[0].ChannelLevel[0].Control[0] === '1' : false;
                this.supportAllZoneStereo = capabilitiesSetupSupport && capabilitiesSetupKeys.includes('AllZoneStereo') ? devInfo.DeviceCapabilities[0].Setup[0].AllZoneStereo[0].Control[0] === '1' : false;
                this.supportPictureMode = capabilitiesSetupSupport && capabilitiesSetupKeys.includes('PictureMode') ? devInfo.DeviceCapabilities[0].Setup[0].PictureMode[0].Control[0] === '1' : false;
                this.supportSoundMode = capabilitiesSetupSupport && capabilitiesSetupKeys.includes('SoundMode') ? devInfo.DeviceCapabilities[0].Setup[0].SoundMode[0].Control[0] === '1' : false

                //operation
                const capabilitiesOperationKeys = capabilitiesSupport ? Object.keys(devInfo.DeviceCapabilities[0]) : [];
                const capabilitiesOperationSupport = capabilitiesOperationKeys.includes('Operation');
                this.supportClock = capabilitiesOperationSupport & capabilitiesOperationKeys.includes('Clock') ? devInfo.DeviceCapabilities[0].Operation[0].Clock[0].Control[0] === '1' : false;
                this.supportAllZonePower = capabilitiesOperationSupport & capabilitiesOperationKeys.includes('AllZonePower') ? devInfo.DeviceCapabilities[0].Operation[0].AllZonePower[0].Control[0] === '1' : false;
                this.supportAllZoneMute = capabilitiesOperationSupport & capabilitiesOperationKeys.includes('AllZoneMute') ? devInfo.DeviceCapabilities[0].Operation[0].AllZoneMute[0].Control[0] === '1' : false;
                this.supportFavorites = capabilitiesOperationSupport & capabilitiesOperationKeys.includes('Favorites') ? devInfo.DeviceCapabilities[0].Operation[0].Favorites[0].Control[0] === '1' : false;
                this.supportFavoriteStation = capabilitiesOperationSupport & capabilitiesOperationKeys.includes('FavoriteStation') ? devInfo.DeviceCapabilities[0].Operation[0].Operation[0].FavoriteStation[0].Control[0] === '1' : false;

                //zone capabilities
                const zoneCapabilitiesSupport = checkZone ? deviceInfoKeys.includes('DeviceZoneCapabilities') : false;
                const zoneCapabilitiesKeys = zoneCapabilitiesSupport ? Object.keys(devInfo.DeviceZoneCapabilities[checkZoneNr]) : [];

                //zone
                this.supportShortcut = zoneCapabilitiesKeys.includes('ShortcutControl') ? devInfo.DeviceZoneCapabilities[checkZoneNr].ShortcutControl[0].Control[0] === '1' : false;
                this.supportPower = zoneCapabilitiesKeys.includes('Power') ? devInfo.DeviceZoneCapabilities[checkZoneNr].Power[0].Control[0] === '1' : false;
                this.supportVolume = zoneCapabilitiesKeys.includes('Volume') ? devInfo.DeviceZoneCapabilities[checkZoneNr].Volume[0].Control[0] === '1' : false;
                this.supportMute = zoneCapabilitiesKeys.includes('Mute') ? devInfo.DeviceZoneCapabilities[checkZoneNr].Mute[0].Control[0] === '1' : false;
                this.supportInputSource = zoneCapabilitiesKeys.includes('InputSource') ? devInfo.DeviceZoneCapabilities[checkZoneNr].InputSource[0].Control[0] === '1' : false;

                //surround mode Marantz M-CR611
                this.supportSurroundMode = zoneCapabilitiesKeys.includes('SurroundMode') ? devInfo.DeviceZoneCapabilities[checkZoneNr].SurroundMode[0].Control[0] === '1' : false;

                //setup
                const zoneCapabilitiesSetupSupport = zoneCapabilitiesKeys.includes('Setup');
                const zonescapabilitiesSetupKeys = zoneCapabilitiesSetupSupport ? Object.keys(devInfo.DeviceZoneCapabilities[checkZoneNr].Setup[0]) : [];
                this.supportRestorer = zonescapabilitiesSetupKeys.includes('Restorer') ? devInfo.DeviceZoneCapabilities[checkZoneNr].Setup[0].Restorer[0].Control[0] === '1' : false;
                this.supportToneControl = zonescapabilitiesSetupKeys.includes('ToneControl') ? devInfo.DeviceZoneCapabilities[checkZoneNr].Setup[0].ToneControl[0].Control[0] === '1' : false;

                //operation
                const zoneCapabilitiesOperationSupport = zoneCapabilitiesKeys.includes('Operation');
                const zoneCapabilitiesOperationKeys = zoneCapabilitiesOperationSupport ? Object.keys(devInfo.DeviceZoneCapabilities[checkZoneNr].Operation[0]) : [];
                this.supportCursor = zoneCapabilitiesOperationKeys.includes('Cursor') ? devInfo.DeviceZoneCapabilities[checkZoneNr].Operation[0].Cursor[0].Control[0] === '1' : false;
                this.supportQuickSelect = zoneCapabilitiesOperationKeys.includes('QuickSelect') ? devInfo.DeviceZoneCapabilities[checkZoneNr].Operation[0].QuickSelect[0].Control[0] === '1' : false;
                this.supportSmartSelect = zoneCapabilitiesOperationKeys.includes('SmartSelect') ? devInfo.DeviceZoneCapabilities[checkZoneNr].Operation[0].SmartSelect[0].Control[0] === '1' : false;
                this.supportTunerOperation = zoneCapabilitiesOperationKeys.includes('TunerOperation') ? devInfo.DeviceZoneCapabilities[checkZoneNr].Operation[0].TunerOperation[0].Control[0] === '1' : false;
                this.supportBdOperation = zoneCapabilitiesOperationKeys.includes('BdOperation') ? devInfo.DeviceZoneCapabilities[checkZoneNr].Operation[0].BdOperation[0].Control[0] === '1' : false;
                this.supportCdOperation = zoneCapabilitiesOperationKeys.includes('CdOperation') ? devInfo.DeviceZoneCapabilities[checkZoneNr].Operation[0].CdOperation[0].Control[0] === '1' : false;
                this.supportBuildInCdOperation = zoneCapabilitiesOperationKeys.includes('BuildInCdOperation') ? devInfo.DeviceZoneCapabilities[checkZoneNr].Operation[0].BuildInCdOperation[0].Control[0] === '1' : false;
                this.supportPartyZone = zoneCapabilitiesOperationKeys.includes('PartyZone') ? devInfo.DeviceZoneCapabilities[checkZoneNr].Operation[0].PartyZone[0].Capability[0] === '1' : false;

                //net usb Marantz M-CR611
                const netUsbSupport = zoneCapabilitiesKeys.includes('NetUsb');
                const netUsbKeys = netUsbSupport ? Object.keys(devInfo.DeviceZoneCapabilities[checkZoneNr].NetUsb[0]) : [];
                this.supportInternetRadio = netUsbKeys.includes('InternetRadio') ? devInfo.DeviceZoneCapabilities[checkZoneNr].NetUsb[0].InternetRadio[0].Control[0] === '1' : false;
                this.supportMediaServer = netUsbKeys.includes('MediaServer') ? devInfo.DeviceZoneCapabilities[checkZoneNr].NetUsb[0].MediaServer[0].Control[0] === '1' : false;
                this.supportiPod = netUsbKeys.includes('iPod') ? devInfo.DeviceZoneCapabilities[checkZoneNr].NetUsb[0].iPod[0].Control[0] === '1' : false;
                this.supportUsb = netUsbKeys.includes('USB') ? devInfo.DeviceZoneCapabilities[checkZoneNr].NetUsb[0].USB[0].Control[0] === '1' : false;
                this.supportUsb2 = netUsbKeys.includes('USB2') ? devInfo.DeviceZoneCapabilities[checkZoneNr].NetUsb[0].USB2[0].Control[0] === '1' : false;
                this.supportSpotifyConnect = netUsbKeys.includes('SpotifyConnect') ? devInfo.DeviceZoneCapabilities[checkZoneNr].NetUsb[0].SpotifyConnect[0].Control[0] === '1' : false;

                //ipod player Marantz M-CR611
                const iPodPlayerSupport = zoneCapabilitiesKeys.includes('iPodPlayer') ? devInfo.DeviceZoneCapabilities[checkZoneNr].iPodPlayer[0].Control[0] === '1' : false;

                if (!serialNumber) {
                    const debug1 = debugLog ? this.emit('debug', `Missing Serial Number, reconnect in 15s.`) : false;
                    this.checkDeviceInfo();
                    return;
                }

                this.emit('deviceInfo', devInfo, manufacturer, modelName, serialNumber, firmwareRevision, zones, apiVersion, this.supportPictureMode, this.supportFavorites, this.supportShortcut, this.supportInputSource, this.supportQuickSelect, this.supportSmartSelect);
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
                    const input = conversionArrayInputs.includes(devState.InputFuncSelect[0].value[0]) ? CONSTANS.InputConversion[devState.InputFuncSelect[0].value[0]] : (devState.InputFuncSelect[0].value[0]);
                    const volumeControlType = statusArray.includes('VolumeDisplay') ? devState.VolumeDisplay[0].value[0] : this.volumeControlType;
                    const volumeRelative = devState.MasterVolume[0].value[0];
                    const volume = parseFloat(volumeRelative) >= -79.5 ? parseInt(volumeRelative) + 80 : this.volume;
                    const mute = devState.Mute[0].value[0] === 'on';

                    //get picture mode
                    const checkPictureMode = this.supportPictureMode && power && zoneControl === 0;
                    const devicePictureMode = checkPictureMode ? await this.axiosInstancePost(CONSTANS.ApiUrls.AppCommand, CONSTANS.BodyXml.GetPictureMode) : false;
                    const parseDevicePictureMode = checkPictureMode ? await parseString(devicePictureMode.data) : false;
                    const debug1 = debugLog && checkPictureMode ? this.emit('debug', `Picture mode: ${JSON.stringify(parseDevicePictureMode, null, 2)}`) : false;
                    const pictureMode = checkPictureMode ? parseDevicePictureMode.rx.cmd[0].value[0] : this.pictureMode;

                    //get sound mode
                    const checkZone = zoneControl === 0 || zoneControl === 3;
                    const checkSoundeMode = this.supportSoundMode && power && checkZone;
                    const deviceSoundMode = checkSoundeMode ? await this.axiosInstancePost(CONSTANS.ApiUrls.AppCommand, CONSTANS.BodyXml.GetSurroundModeStatus) : false;
                    const parseDeviceSoundMode = checkSoundeMode ? await parseString(deviceSoundMode.data) : false;
                    const debug2 = debugLog && checkSoundeMode ? this.emit('debug', `Sound mode: ${JSON.stringify(parseDeviceSoundMode, null, 2)}`) : false;
                    const soundMode = checkSoundeMode ? conversionArraySoundMode.includes((parseDeviceSoundMode.rx.cmd[0].surround[0]).replace(/[^a-zA-Z0-9]/g, '').toUpperCase()) ? CONSTANS.SoundModeConversion[(parseDeviceSoundMode.rx.cmd[0].surround[0]).replace(/[^a-zA-Z0-9]/g, '').toUpperCase()] : (parseDeviceSoundMode.rx.cmd[0].surround[0]).replace(/[^a-zA-Z0-9]/g, '').toUpperCase() : this.soundMode;

                    //select reference
                    const reference = zoneControl <= 2 ? input : soundMode;

                    if (!this.checkStateOnFirstRun && power === this.power && reference === this.reference && volume === this.volume && volumeControlType === this.volumeControlType && mute === this.mute && soundMode === this.soundMode) {
                        this.checkState();
                        return;
                    };

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
                    const mqtt2 = mqttEnabled && checkPictureMode ? this.emit('mqtt', 'Picture', JSON.stringify({ 'Picture Mode': CONSTANS.PictureModesDenonNumber[pictureMode] }, null, 2)) : false;
                    const mqtt3 = mqttEnabled && checkSoundeMode ? this.emit('mqtt', 'Surround', JSON.stringify({ 'Sound Mode': CONSTANS.SoundModeConversion[soundMode] }, null, 2)) : false;
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
