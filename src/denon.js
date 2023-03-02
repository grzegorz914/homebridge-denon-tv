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
        const supportOldAvr = config.supportOldAvr;
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
        this.volumeDisplay = 'Absolute';
        this.mute = false;
        this.pictureMode = 0;
        this.soundMode = '';
        this.devInfo = {};

        this.on('checkDeviceInfo', async () => {
            try {
                const deviceUrl = supportOldAvr ? CONSTANS.ApiUrls.MainZone : CONSTANS.ApiUrls.DeviceInfo;
                const deviceInfo = await this.axiosInstance(deviceUrl);
                const parseDeviceInfo = await parseString(deviceInfo.data);
                const devInfo = supportOldAvr ? parseDeviceInfo.item : parseDeviceInfo.Device_Info;
                const debug = debugLog ? this.emit('debug', `Info: ${JSON.stringify(devInfo, null, 2)}`) : false;

                //device info
                const deviceInfoKeys = Object.keys(devInfo);
                const apiVersion = deviceInfoKeys.includes('CommApiVers') ? devInfo.CommApiVers[0] : '000';
                const brandCode = deviceInfoKeys.includes('BrandCode') ? devInfo.BrandCode[0] : '2';
                const manufacturer = ['Denon', 'Marantz', 'Denon/Marantz'][brandCode];
                const productCategory = deviceInfoKeys.includes('ProductCategory') ? devInfo.ProductCategory[0] : '00';
                const categoryName = deviceInfoKeys.includes('CategoryName') ? devInfo.ProductCategory[0] : 'Unknown';
                const manualModelName = deviceInfoKeys.includes('ManualModelName') ? devInfo.ManualModelName[0] : 'Unknown';
                const modelName = deviceInfoKeys.includes('ModelName') ? devInfo.ModelName[0] : 'AV Receiver';
                const serialNumber = deviceInfoKeys.includes('MacAddress') ? devInfo.MacAddress[0] : supportOldAvr ? `1234567654321` : false;
                const firmwareRevision = deviceInfoKeys.includes('UpgradeVersion') ? devInfo.UpgradeVersion[0] : '00';
                const zones = deviceInfoKeys.includes('DeviceZones') ? parseInt(devInfo.DeviceZones[0]) : 1;

                //device capabilities
                const capabilitiesSupport = deviceInfoKeys.includes('DeviceCapabilities');
                const capabilities = capabilitiesSupport ? devInfo.DeviceCapabilities[0] : [];
                const capabilitiesKeys = capabilitiesSupport ? Object.keys(capabilities) : [];

                //menu
                const capabilitiesMenuSupport = capabilitiesSupport && capabilitiesKeys.includes('Menu');
                const capabilitiesMenu = capabilitiesMenuSupport ? devInfo.DeviceCapabilities[0].Menu[0] : [];
                const capabilitiesMenuKeys = capabilitiesMenuSupport ? Object.keys(capabilitiesMenu) : [];

                //setup
                const capabilitiesSetupSupport = capabilitiesSupport && capabilitiesKeys.includes('Setup');
                const capabilitiesSetup = capabilitiesSetupSupport ? devInfo.DeviceCapabilities[0].Setup[0] : [];
                const capabilitiesSetupKeys = capabilitiesSetupSupport ? Object.keys(capabilitiesSetup) : [];
                const supportPartyMode = capabilitiesSetupSupport && capabilitiesSetupKeys.includes('PartyMode') ? capabilitiesSetup.PartyMode[0].Control[0] === '1' : false;
                const supportTone = capabilitiesSetupSupport && capabilitiesSetupKeys.includes('ToneControl') ? capabilitiesSetup.ToneControl[0].Control[0] === '1' : false;
                const supportSubwooferLevel = capabilitiesSetupSupport && capabilitiesSetupKeys.includes('SubwooferLevel') ? capabilitiesSetup.SubwooferLevel[0].Control[0] === '1' : false;
                const supportChannelLevel = capabilitiesSetupSupport && capabilitiesSetupKeys.includes('ChannelLevel') ? capabilitiesSetup.ChannelLevel[0].Control[0] === '1' : false;
                const supportAllZoneStereo = capabilitiesSetupSupport && capabilitiesSetupKeys.includes('AllZoneStereo') ? capabilitiesSetup.AllZoneStereo[0].Control[0] === '1' : false;
                const supportPictureMode = capabilitiesSetupSupport && capabilitiesSetupKeys.includes('PictureMode') ? capabilitiesSetup.PictureMode[0].Control[0] === '1' : false;
                const supportSoundMode = capabilitiesSetupSupport && capabilitiesSetupKeys.includes('SoundMode') ? capabilitiesSetup.SoundMode[0].Control[0] === '1' : false

                //operation
                const capabilitiesOperationSupport = capabilitiesSupport && capabilitiesKeys.includes('Operation');
                const capabilitiesOperation = capabilitiesOperationSupport ? devInfo.DeviceCapabilities[0].Operation[0] : [];
                const capabilitiesOperationKeys = capabilitiesOperationSupport ? Object.keys(capabilitiesOperation) : [];
                const supportClock = capabilitiesOperationSupport & capabilitiesOperationKeys.includes('Clock') ? capabilitiesOperation.Clock[0].Control[0] === '1' : false;
                const supportAllZonePower = capabilitiesOperationSupport & capabilitiesOperationKeys.includes('AllZonePower') ? capabilitiesOperation.AllZonePower[0].Control[0] === '1' : false;
                const supportAllZoneMute = capabilitiesOperationSupport & capabilitiesOperationKeys.includes('AllZoneMute') ? capabilitiesOperation.AllZoneMute[0].Control[0] === '1' : false;
                const supportFavorites = capabilitiesOperationSupport & capabilitiesOperationKeys.includes('Favorites') ? capabilitiesOperation.Favorites[0].Control[0] === '1' : false;
                const supportFavoriteStation = capabilitiesOperationSupport & capabilitiesOperationKeys.includes('FavoriteStation') ? capabilitiesOperation.FavoriteStation[0].Control[0] === '1' : false;

                //zone capabilities
                const checkZone = zoneControl < zones ? true : false;
                const checkZoneNr = zoneControl < zones ? zoneControl : zones - 1;
                const zoneCapabilitiesSupport = checkZone ? deviceInfoKeys.includes('DeviceZoneCapabilities') : false;
                const zoneCapabilities = zoneCapabilitiesSupport ? devInfo.DeviceZoneCapabilities[checkZoneNr] : [];
                const zoneCapabilitiesKeys = zoneCapabilitiesSupport ? Object.keys(zoneCapabilities) : [];

                //zone
                const supportShortcut = zoneCapabilitiesKeys.includes('ShortcutControl') ? zoneCapabilities.ShortcutControl[0].Control[0] === '1' : false;
                const supportPower = zoneCapabilitiesKeys.includes('Power') ? zoneCapabilities.Power[0].Control[0] === '1' : false;
                const supportVolume = zoneCapabilitiesKeys.includes('Volume') ? zoneCapabilities.Volume[0].Control[0] === '1' : false;
                const supportMute = zoneCapabilitiesKeys.includes('Mute') ? zoneCapabilities.Mute[0].Control[0] === '1' : false;
                const supportInputSource = zoneCapabilitiesKeys.includes('InputSource') ? zoneCapabilities.InputSource[0].Control[0] === '1' : false;

                //surround mode Marantz M-CR611
                const supportSurroundMode = zoneCapabilitiesKeys.includes('SurroundMode') ? zoneCapabilities.SurroundMode[0].Control[0] === '1' : false;

                //setup
                const zoneCapabilitiesSetupSupport = zoneCapabilitiesSupport && zoneCapabilitiesKeys.includes('Setup');
                const zoneCapabilitiesSetup = zoneCapabilitiesSetupSupport ? devInfo.DeviceZoneCapabilities[checkZoneNr].Setup[0] : [];
                const zonescapabilitiesSetupKeys = zoneCapabilitiesSetupSupport ? Object.keys(zoneCapabilitiesSetup) : [];
                const supportRestorer = zonescapabilitiesSetupKeys.includes('Restorer') ? zoneCapabilitiesSetup.Restorer[0].Control[0] === '1' : false;
                const supportToneControl = zonescapabilitiesSetupKeys.includes('ToneControl') ? zoneCapabilitiesSetup.ToneControl[0].Control[0] === '1' : false;

                //operation
                const zoneCapabilitiesOperationSupport = zoneCapabilitiesSupport && zoneCapabilitiesKeys.includes('Operation');
                const zoneCapabilitiesOperation = zoneCapabilitiesOperationSupport ? devInfo.DeviceZoneCapabilities[checkZoneNr].Operation[0] : [];
                const zoneCapabilitiesOperationKeys = zoneCapabilitiesOperationSupport ? Object.keys(zoneCapabilitiesOperation) : [];
                const supportCursor = zoneCapabilitiesOperationKeys.includes('Cursor') ? zoneCapabilitiesOperation.Cursor[0].Control[0] === '1' : false;
                const supportQuickSmartSelect = zoneCapabilitiesOperationKeys.includes('QuickSelect') ? zoneCapabilitiesOperation.QuickSelect[0].Control[0] === '1' : false;
                const supportTunerOperation = zoneCapabilitiesOperationKeys.includes('TunerOperation') ? zoneCapabilitiesOperation.TunerOperation[0].Control[0] === '1' : false;
                const supportBdOperation = zoneCapabilitiesOperationKeys.includes('BdOperation') ? zoneCapabilitiesOperation.BdOperation[0].Control[0] === '1' : false;
                const supportCdOperation = zoneCapabilitiesOperationKeys.includes('CdOperation') ? zoneCapabilitiesOperation.CdOperation[0].Control[0] === '1' : false;
                const supportExtCdOperation = zoneCapabilitiesOperationKeys.includes('ExtCdOperation') ? zoneCapabilitiesOperation.ExtCdOperation[0].Control[0] === '1' : false;
                const supportBuildInCdOperation = zoneCapabilitiesOperationKeys.includes('BuildInCdOperation') ? zoneCapabilitiesOperation.BuildInCdOperation[0].Control[0] === '1' : false;
                const supportPartyZone = zoneCapabilitiesOperationKeys.includes('PartyZone') ? zoneCapabilitiesOperation.PartyZone[0].Capability[0] === '1' : false;

                //net usb Marantz M-CR611
                const zoneCapabilitiesNetUsbSupport = zoneCapabilitiesSupport && zoneCapabilitiesKeys.includes('NetUsb');
                const zoneCapabilitiesNetUsb = zoneCapabilitiesNetUsbSupport ? devInfo.DeviceZoneCapabilities[checkZoneNr].NetUsb[0] : [];
                const zoneCapabilitiesNetUsbKeys = zoneCapabilitiesNetUsbSupport ? Object.keys(zoneCapabilitiesNetUsb) : [];
                const supportInternetRadio = zoneCapabilitiesNetUsbKeys.includes('InternetRadio') ? zoneCapabilitiesNetUsb.InternetRadio[0].Control[0] === '1' : false;
                const supportMediaServer = zoneCapabilitiesNetUsbKeys.includes('MediaServer') ? zoneCapabilitiesNetUsb.MediaServer[0].Control[0] === '1' : false;
                const supportiPod = zoneCapabilitiesNetUsbKeys.includes('iPod') ? zoneCapabilitiesNetUsb.iPod[0].Control[0] === '1' : false;
                const supportUsb = zoneCapabilitiesNetUsbKeys.includes('USB') ? zoneCapabilitiesNetUsb.USB[0].Control[0] === '1' : false;
                const supportUsb2 = zoneCapabilitiesNetUsbKeys.includes('USB2') ? zoneCapabilitiesNetUsb.USB2[0].Control[0] === '1' : false;
                const supportSpotifyConnect = zoneCapabilitiesNetUsbKeys.includes('SpotifyConnect') ? zoneCapabilitiesNetUsb.SpotifyConnect[0].Control[0] === '1' : false;

                //ipod player Marantz M-CR611
                const supportiPodPlayer = zoneCapabilitiesKeys.includes('iPodPlayer') ? zoneCapabilities.iPodPlayer[0].Control[0] === '1' : false;

                if (!serialNumber) {
                    const debug1 = debugLog ? this.emit('debug', `Missing Serial Number, reconnect in 15s.`) : false;
                    this.checkDeviceInfo();
                    return;
                }

                this.emit('deviceInfo', devInfo, manufacturer, modelName, serialNumber, firmwareRevision, zones, apiVersion, supportPictureMode, supportFavorites, supportShortcut, supportInputSource, supportQuickSmartSelect);
                const mqtt = mqttEnabled ? this.emit('mqtt', 'Info', JSON.stringify(devInfo, null, 2)) : false;
                await new Promise(resolve => setTimeout(resolve, 2000));
                this.supportPictureMode = supportPictureMode;
                this.supportSoundMode = supportSoundMode;
                this.checkStateOnFirstRun = true;
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
                    const inputsConversionKeys = Object.keys(CONSTANS.InputConversion);
                    const soundModesConcersionKeys = Object.keys(CONSTANS.SoundModeConversion);

                    //get receiver status
                    const statusKeys = Object.keys(devState);
                    const power = devState.Power[0].value[0] === 'ON';
                    const input = inputsConversionKeys.includes(devState.InputFuncSelect[0].value[0]) ? CONSTANS.InputConversion[devState.InputFuncSelect[0].value[0]] : (devState.InputFuncSelect[0].value[0]);
                    const volumeDisplay = statusKeys.includes('VolumeDisplay') ? devState.VolumeDisplay[0].value[0] : this.volumeDisplay;
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
                    const soundMode = checkSoundeMode ? soundModesConcersionKeys.includes((parseDeviceSoundMode.rx.cmd[0].surround[0]).replace(/[^a-zA-Z0-9]/g, '').toUpperCase()) ? CONSTANS.SoundModeConversion[(parseDeviceSoundMode.rx.cmd[0].surround[0]).replace(/[^a-zA-Z0-9]/g, '').toUpperCase()] : (parseDeviceSoundMode.rx.cmd[0].surround[0]).replace(/[^a-zA-Z0-9]/g, '').toUpperCase() : this.soundMode;

                    //select reference
                    const reference = zoneControl <= 2 ? input : soundMode;

                    if (!this.checkStateOnFirstRun && power === this.power && reference === this.reference && volume === this.volume && volumeDisplay === this.volumeDisplay && mute === this.mute && soundMode === this.soundMode) {
                        this.checkState();
                        return;
                    };

                    this.checkStateOnFirstRun = false;
                    this.power = power;
                    this.reference = reference;
                    this.volume = volume;
                    this.volumeDisplay = volumeDisplay;
                    this.mute = mute;
                    this.pictureMode = pictureMode;
                    this.soundMode = soundMode;

                    this.emit('stateChanged', power, reference, volume, volumeDisplay, mute, pictureMode);
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
                this.emit('stateChanged', false, this.reference, this.volume, this.volumeDisplay, this.mute, this.pictureMode);
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

    send(command) {
        return new Promise(async (resolve, reject) => {
            try {
                await this.axiosInstance(CONSTANS.ApiUrls.iPhoneDirect + command);
                await new Promise(resolve => setTimeout(resolve, 750));
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    };
};
module.exports = DENON;
