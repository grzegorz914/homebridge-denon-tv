'use strict';
const fs = require('fs');
const fsPromises = fs.promises;
const axios = require('axios');
const EventEmitter = require('events');
const { XMLParser, XMLBuilder, XMLValidator } = require('fast-xml-parser');
const CONSTANS = require('./constans.json');

class DENON extends EventEmitter {
    constructor(config) {
        super();
        const host = config.host;
        const port = config.port;
        const zone = config.zone;
        const inputs = config.inputs;
        const surrounds = config.surrounds;
        const devInfoFile = config.devInfoFile;
        const inputsFile = config.inputsFile;
        const supportOldAvr = config.supportOldAvr;
        const getInputsFromDevice = config.getInputsFromDevice;
        const getFavoritesFromDevice = config.getFavoritesFromDevice;
        const getQuickSmartSelectFromDevice = config.getQuickSmartSelectFromDevice;
        const debugLog = config.debugLog;
        const disableLogConnectError = config.disableLogConnectError;
        const refreshInterval = config.refreshInterval;
        const restFulEnabled = config.restFulEnabled;
        const mqttEnabled = config.mqttEnabled;

        this.inputs = inputs;
        this.surrounds = surrounds;
        this.getInputsFromDevice = getInputsFromDevice;
        this.getFavoritesFromDevice = getFavoritesFromDevice;
        this.getQuickSmartSelectFromDevice = getQuickSmartSelectFromDevice;
        this.debugLog = debugLog;
        this.zoneInputSurroundName = CONSTANS.ZoneInputSurroundName[zone];
        this.refreshInterval = refreshInterval;

        const baseUrl = `http://${host}:${port}`;
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

        const options = {
            ignoreAttributes: false,
            ignorePiTags: true,
            allowBooleanAttributes: true
        };
        const parseString = new XMLParser(options);

        this.connected = false;
        this.startPrepareAccessory = true;
        this.emitDeviceInfo = true;
        this.power = false;
        this.reference = '';
        this.volume = 0;
        this.volumeDisplay = 'Absolute';
        this.mute = false;
        this.pictureMode = 0;
        this.soundMode = '';
        const object = {};

        this.on('checkDeviceInfo', async () => {
            try {
                const deviceUrl = supportOldAvr ? CONSTANS.ApiUrls.MainZone : CONSTANS.ApiUrls.DeviceInfo;
                const deviceInfo = await this.axiosInstance(deviceUrl);
                const parseDeviceInfo = parseString.parse(deviceInfo.data);
                const devInfo = supportOldAvr ? parseDeviceInfo.item : parseDeviceInfo.Device_Info;
                const debug = debugLog ? this.emit('debug', `Info: ${JSON.stringify(devInfo, null, 2)}`) : false;

                //device info
                const deviceInfoKeys = Object.keys(devInfo);
                const apiVersion = deviceInfoKeys.includes('CommApiVers') ? devInfo.CommApiVers : '000';
                const brandCode = deviceInfoKeys.includes('BrandCode') ? devInfo.BrandCode : 2;
                const manufacturer = ['Denon', 'Marantz', 'Denon/Marantz'][brandCode];
                const productCategory = deviceInfoKeys.includes('ProductCategory') ? devInfo.ProductCategory : '00';
                const categoryName = deviceInfoKeys.includes('CategoryName') ? devInfo.ProductCategory : 'Unknown';
                const manualModelName = deviceInfoKeys.includes('ManualModelName') ? devInfo.ManualModelName : 'Unknown';
                const modelName = deviceInfoKeys.includes('ModelName') ? devInfo.ModelName : 'AV Receiver';
                const serialNumber = deviceInfoKeys.includes('MacAddress') ? devInfo.MacAddress.toString() : supportOldAvr ? `1234567654321` : false;
                const firmwareRevision = deviceInfoKeys.includes('UpgradeVersion') ? devInfo.UpgradeVersion.toString() : '00';
                const zones = deviceInfoKeys.includes('DeviceZones') ? parseInt(devInfo.DeviceZones) : 1;

                //device capabilities
                const capabilitiesSupport = deviceInfoKeys.includes('DeviceCapabilities');
                const capabilities = capabilitiesSupport ? devInfo.DeviceCapabilities : object;
                const capabilitiesKeys = capabilitiesSupport ? Object.keys(capabilities) : [];

                //menu
                const capabilitiesMenuSupport = capabilitiesSupport && capabilitiesKeys.includes('Menu');
                const capabilitiesMenu = capabilitiesMenuSupport ? devInfo.DeviceCapabilities.Menu : object;
                const capabilitiesMenuKeys = capabilitiesMenuSupport ? Object.keys(capabilitiesMenu) : [];

                //setup
                const capabilitiesSetupSupport = capabilitiesSupport && capabilitiesKeys.includes('Setup');
                const capabilitiesSetup = capabilitiesSetupSupport ? devInfo.DeviceCapabilities.Setup : object;
                const capabilitiesSetupKeys = capabilitiesSetupSupport ? Object.keys(capabilitiesSetup) : [];
                const supportPartyMode = capabilitiesSetupSupport && capabilitiesSetupKeys.includes('PartyMode') ? capabilitiesSetup.PartyMode.Control === 1 : false;
                const supportTone = capabilitiesSetupSupport && capabilitiesSetupKeys.includes('ToneControl') ? capabilitiesSetup.ToneControl.Control === 1 : false;
                const supportSubwooferLevel = capabilitiesSetupSupport && capabilitiesSetupKeys.includes('SubwooferLevel') ? capabilitiesSetup.SubwooferLevel.Control === 1 : false;
                const supportChannelLevel = capabilitiesSetupSupport && capabilitiesSetupKeys.includes('ChannelLevel') ? capabilitiesSetup.ChannelLevel.Control === 1 : false;
                const supportAllZoneStereo = capabilitiesSetupSupport && capabilitiesSetupKeys.includes('AllZoneStereo') ? capabilitiesSetup.AllZoneStereo.Control === 1 : false;
                const supportPictureMode = capabilitiesSetupSupport && capabilitiesSetupKeys.includes('PictureMode') ? capabilitiesSetup.PictureMode.Control === 1 : false;
                const supportSoundMode = capabilitiesSetupSupport && capabilitiesSetupKeys.includes('SoundMode') ? capabilitiesSetup.SoundMode.Control === 1 : false

                //operation
                const capabilitiesOperationSupport = capabilitiesSupport && capabilitiesKeys.includes('Operation');
                const capabilitiesOperation = capabilitiesOperationSupport ? devInfo.DeviceCapabilities.Operation : object;
                const capabilitiesOperationKeys = capabilitiesOperationSupport ? Object.keys(capabilitiesOperation) : [];
                const supportClock = capabilitiesOperationSupport & capabilitiesOperationKeys.includes('Clock') ? capabilitiesOperation.Clock.Control === 1 : false;
                const supportAllZonePower = capabilitiesOperationSupport & capabilitiesOperationKeys.includes('AllZonePower') ? capabilitiesOperation.AllZonePower.Control === 1 : false;
                const supportAllZoneMute = capabilitiesOperationSupport & capabilitiesOperationKeys.includes('AllZoneMute') ? capabilitiesOperation.AllZoneMute.Control === 1 : false;
                const supportFavorites = capabilitiesOperationSupport & capabilitiesOperationKeys.includes('Favorites') ? capabilitiesOperation.Favorites.Control === 1 : false;
                const supportFavoriteStation = capabilitiesOperationSupport & capabilitiesOperationKeys.includes('FavoriteStation') ? capabilitiesOperation.FavoriteStation.Control === 1 : false;

                //zone capabilities
                const checkZone = zone < zones ? true : false;
                const checkZoneNr = zone < zones ? zone : zones - 1;
                const zoneCapabilitiesSupport = checkZone ? deviceInfoKeys.includes('DeviceZoneCapabilities') : false;

                const checkZoneIsArray = zoneCapabilitiesSupport && Array.isArray(devInfo.DeviceZoneCapabilities) ? true : false;
                const zoneCapabilities = zoneCapabilitiesSupport ? checkZoneIsArray ? devInfo.DeviceZoneCapabilities[checkZoneNr] : [devInfo.DeviceZoneCapabilities][checkZoneNr] : object;
                const zoneCapabilitiesKeys = zoneCapabilitiesSupport ? Object.keys(zoneCapabilities) : [];

                //zone
                const supportShortcut = zoneCapabilitiesKeys.includes('ShortcutControl') ? zoneCapabilities.ShortcutControl.Control === 1 : false;
                const supportPower = zoneCapabilitiesKeys.includes('Power') ? zoneCapabilities.Power.Control === 1 : false;
                const supportVolume = zoneCapabilitiesKeys.includes('Volume') ? zoneCapabilities.Volume.Control === 1 : false;
                const supportMute = zoneCapabilitiesKeys.includes('Mute') ? zoneCapabilities.Mute.Control === 1 : false;
                const supportInputSource = zoneCapabilitiesKeys.includes('InputSource') ? zoneCapabilities.InputSource.Control === 1 : false;

                //surround mode Marantz M-CR611
                const supportSurroundMode = zoneCapabilitiesKeys.includes('SurroundMode') ? zoneCapabilities.SurroundMode.Control === 1 : false;
                const supportiPodPlayer = zoneCapabilitiesKeys.includes('iPodPlayer') ? zoneCapabilities.iPodPlayer.Control === 1 : false;

                //setup
                const zoneCapabilitiesSetupSupport = zoneCapabilitiesSupport && zoneCapabilitiesKeys.includes('Setup');
                const zoneCapabilitiesSetup = zoneCapabilitiesSetupSupport ? zoneCapabilities.Setup : object;
                const zonesCapabilitiesSetupKeys = zoneCapabilitiesSetupSupport ? Object.keys(zoneCapabilitiesSetup) : [];
                const supportRestorer = zonesCapabilitiesSetupKeys.includes('Restorer') ? zoneCapabilitiesSetup.Restorer.Control === 1 : false;
                const supportToneControl = zonesCapabilitiesSetupKeys.includes('ToneControl') ? zoneCapabilitiesSetup.ToneControl.Control === 1 : false;

                //operation
                const zoneCapabilitiesOperationSupport = zoneCapabilitiesSupport && zoneCapabilitiesKeys.includes('Operation');
                const zoneCapabilitiesOperation = zoneCapabilitiesOperationSupport ? zoneCapabilities.Operation : object;
                const zoneCapabilitiesOperationKeys = zoneCapabilitiesOperationSupport ? Object.keys(zoneCapabilitiesOperation) : [];
                const supportCursor = zoneCapabilitiesOperationKeys.includes('Cursor') ? zoneCapabilitiesOperation.Cursor.Control === 1 : false;
                const supportQuickSmartSelect = zoneCapabilitiesOperationKeys.includes('QuickSelect') ? zoneCapabilitiesOperation.QuickSelect.Control === 1 : false;
                const supportTunerOperation = zoneCapabilitiesOperationKeys.includes('TunerOperation') ? zoneCapabilitiesOperation.TunerOperation.Control === 1 : false;
                const supportBdOperation = zoneCapabilitiesOperationKeys.includes('BdOperation') ? zoneCapabilitiesOperation.BdOperation.Control === 1 : false;
                const supportCdOperation = zoneCapabilitiesOperationKeys.includes('CdOperation') ? zoneCapabilitiesOperation.CdOperation.Control === 1 : false;
                const supportExtCdOperation = zoneCapabilitiesOperationKeys.includes('ExtCdOperation') ? zoneCapabilitiesOperation.ExtCdOperation.Control === 1 : false;
                const supportBuildInCdOperation = zoneCapabilitiesOperationKeys.includes('BuildInCdOperation') ? zoneCapabilitiesOperation.BuildInCdOperation.Control === 1 : false;
                const supportPartyZone = zoneCapabilitiesOperationKeys.includes('PartyZone') ? zoneCapabilitiesOperation.PartyZone.Capability === 1 : false;

                //net usb Marantz M-CR611
                const zoneCapabilitiesNetUsbSupport = zoneCapabilitiesSupport && zoneCapabilitiesKeys.includes('NetUsb');
                const zoneCapabilitiesNetUsb = zoneCapabilitiesNetUsbSupport ? zoneCapabilities.NetUsb : object;
                const zoneCapabilitiesNetUsbKeys = zoneCapabilitiesNetUsbSupport ? Object.keys(zoneCapabilitiesNetUsb) : [];
                const supportInternetRadio = zoneCapabilitiesNetUsbKeys.includes('InternetRadio') ? zoneCapabilitiesNetUsb.InternetRadio.Control === 1 : false;
                const supportMediaServer = zoneCapabilitiesNetUsbKeys.includes('MediaServer') ? zoneCapabilitiesNetUsb.MediaServer.Control === 1 : false;
                const supportiPod = zoneCapabilitiesNetUsbKeys.includes('iPod') ? zoneCapabilitiesNetUsb.iPod.Control === 1 : false;
                const supportUsb = zoneCapabilitiesNetUsbKeys.includes('USB') ? zoneCapabilitiesNetUsb.USB.Control === 1 : false;
                const supportUsb2 = zoneCapabilitiesNetUsbKeys.includes('USB2') ? zoneCapabilitiesNetUsb.USB2.Control === 1 : false;
                const supportSpotifyConnect = zoneCapabilitiesNetUsbKeys.includes('SpotifyConnect') ? zoneCapabilitiesNetUsb.SpotifyConnect.Control === 1 : false;

                //check seriaql number
                if (!serialNumber) {
                    const debug1 = debugLog ? this.emit('debug', `Missing Serial Number, reconnect in 15s.`) : false;
                    this.checkDeviceInfo(devInfoFile);
                    return;
                }

                //save device info to the file
                const saveDevInfo = zone === 0 ? await this.saveDevInfo(devInfoFile, devInfo) : false;

                //save inputs to the file
                await this.saveInputs(inputsFile, devInfo, zone, zoneCapabilities, supportFavorites, supportShortcut, supportInputSource, supportQuickSmartSelect);

                //emit device info
                const emitDeviceInfo = this.emitDeviceInfo ? this.emit('deviceInfo', manufacturer, modelName, serialNumber, firmwareRevision, zones, apiVersion, supportPictureMode) : false;
                this.emitDeviceInfo = false;

                //restFul
                const restFul = restFulEnabled ? this.emit('restFul', 'info', devInfo) : false;

                //mqtt
                const mqtt = mqttEnabled ? this.emit('mqtt', 'Info', devInfo) : false;

                this.supportPictureMode = supportPictureMode;
                this.supportSoundMode = supportSoundMode;

                //prepare accessory
                const prepareAccessory = this.startPrepareAccessory ? this.emit('prepareAccessory') : false;
                const awaitPrepareAccessory = this.startPrepareAccessory ? await new Promise(resolve => setTimeout(resolve, 2500)) : false;
                this.startPrepareAccessory = false;

                this.emit('checkState');
            } catch (error) {
                const debug = disableLogConnectError ? false : this.emit('error', `Info error: ${error}, reconnect in 15s.`);
                this.checkDeviceInfo();
            };
        })
            .on('checkState', async () => {
                try {
                    //get zones status
                    const zoneUrl = [CONSTANS.ApiUrls.MainZoneStatusLite, CONSTANS.ApiUrls.Zone2StatusLite, CONSTANS.ApiUrls.Zone3StatusLite, CONSTANS.ApiUrls.SoundModeStatus][zone];
                    const deviceState = await this.axiosInstance(zoneUrl);
                    const parseDeviceState = parseString.parse(deviceState.data);
                    const devState = parseDeviceState.item;
                    const debug = debugLog ? this.emit('debug', `State: ${JSON.stringify(devState, null, 2)}`) : false;

                    //conversion array
                    const inputsConversionKeys = Object.keys(CONSTANS.InputConversion);
                    const soundModesConcersionKeys = Object.keys(CONSTANS.SoundModeConversion);

                    //get receiver status
                    const statusKeys = Object.keys(devState);
                    const power = devState.Power.value === 'ON';
                    const input = inputsConversionKeys.includes(devState.InputFuncSelect.value) ? CONSTANS.InputConversion[devState.InputFuncSelect.value] : (devState.InputFuncSelect.value);
                    const volumeDisplay = statusKeys.includes('VolumeDisplay') ? devState.VolumeDisplay.value : this.volumeDisplay;
                    const volumeRelative = devState.MasterVolume.value;
                    const volume = parseFloat(volumeRelative) >= -79.5 ? parseInt(volumeRelative) + 80 : this.volume;
                    const mute = devState.Mute.value === 'on';

                    //get picture mode
                    const checkPictureMode = this.supportPictureMode && power && zone === 0;
                    const devicePictureMode = checkPictureMode ? await this.axiosInstancePost(CONSTANS.ApiUrls.AppCommand, CONSTANS.BodyXml.GetPictureMode) : false;
                    const parseDevicePictureMode = checkPictureMode ? parseString.parse(devicePictureMode.data) : false;
                    const debug1 = debugLog && checkPictureMode ? this.emit('debug', `Picture mode: ${JSON.stringify(parseDevicePictureMode, null, 2)}`) : false;
                    const pictureMode = checkPictureMode ? parseDevicePictureMode.rx.cmd.value : this.pictureMode;

                    //get sound mode
                    const checkZone = zone === 0 || zone === 3;
                    const checkSoundeMode = this.supportSoundMode && power && checkZone;
                    const deviceSoundMode = checkSoundeMode ? await this.axiosInstancePost(CONSTANS.ApiUrls.AppCommand, CONSTANS.BodyXml.GetSurroundModeStatus) : false;
                    const parseDeviceSoundMode = checkSoundeMode ? parseString.parse(deviceSoundMode.data) : false;
                    const debug2 = debugLog && checkSoundeMode ? this.emit('debug', `Sound mode: ${JSON.stringify(parseDeviceSoundMode, null, 2)}`) : false;
                    const soundMode = checkSoundeMode ? soundModesConcersionKeys.includes((parseDeviceSoundMode.rx.cmd.surround).replace(/[^a-zA-Z0-9]/g, '').toUpperCase()) ? CONSTANS.SoundModeConversion[(parseDeviceSoundMode.rx.cmd.surround).replace(/[^a-zA-Z0-9]/g, '').toUpperCase()] : (parseDeviceSoundMode.rx.cmd.surround).replace(/[^a-zA-Z0-9]/g, '').toUpperCase() : this.soundMode;

                    //select reference
                    const reference = zone <= 2 ? input : soundMode;

                    //update only if value change
                    if (power === this.power && reference === this.reference && volume === this.volume && volumeDisplay === this.volumeDisplay && mute === this.mute && pictureMode === this.pictureMode && soundMode === this.soundMode) {
                        this.checkState();
                        return;
                    };

                    this.power = power;
                    this.reference = reference;
                    this.volume = volume;
                    this.volumeDisplay = volumeDisplay;
                    this.mute = mute;
                    this.pictureMode = pictureMode;
                    this.soundMode = soundMode;

                    //emit state changes
                    const emitConnected = !this.connected ? this.emit('message', `Connected.`) : false;
                    this.connected = true;
                    this.emit('stateChanged', power, reference, volume, volumeDisplay, mute, pictureMode);

                    //restFul
                    const restFul = restFulEnabled ? this.emit('restFul', 'state', devState) : false;
                    const restFul1 = restFulEnabled && checkPictureMode ? this.emit('restFul', 'picture', { 'Picture Mode': CONSTANS.PictureModesDenonNumber[pictureMode] }) : false;
                    const restFul2 = restFulEnabled && checkSoundeMode ? this.emit('restFul', 'surround', { 'Sound Mode': CONSTANS.SoundModeConversion[soundMode] }) : false;

                    //mqtt
                    const mqtt1 = mqttEnabled ? this.emit('mqtt', 'State', devState) : false;
                    const mqtt2 = mqttEnabled && checkPictureMode ? this.emit('mqtt', 'Picture', { 'Picture Mode': CONSTANS.PictureModesDenonNumber[pictureMode] }) : false;
                    const mqtt3 = mqttEnabled && checkSoundeMode ? this.emit('mqtt', 'Surround', { 'Sound Mode': CONSTANS.SoundModeConversion[soundMode] }) : false;

                    this.checkState();
                } catch (error) {
                    const debug = disableLogConnectError ? false : this.emit('error', `State error: ${error}, reconnect in ${this.refreshInterval}s.`);
                    this.emit('disconnect');
                };
            })
            .on('disconnect', () => {
                this.emit('stateChanged', false, this.reference, this.volume, this.volumeDisplay, this.mute, this.pictureMode);
                this.emit('disconnected', 'Disconnected.');
                this.connected = false;
                this.checkState();
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

    saveDevInfo(path, devInfo) {
        return new Promise(async (resolve, reject) => {
            try {
                const info = JSON.stringify(devInfo, null, 2);
                await fsPromises.writeFile(path, info);
                const debug = !this.debugLog ? false : this.emit('message', `saved device info: ${info}`);

                resolve();
            } catch (error) {
                reject(error);
            };
        });
    };

    saveInputs(path, devInfo, zone, zoneCapabilities, supportFavorites, supportShortcut, supportInputSource, supportQuickSmartSelect) {
        return new Promise(async (resolve, reject) => {
            try {
                const referenceConversionKeys = Object.keys(CONSTANS.InputConversion);
                const inputsArr = [];
                const referencesArray = [];

                //old AVR
                const inputsReferenceOldAvr = this.supportOldAvr ? devInfo.InputFuncList.value : [];
                const inputsNameOldAvr = this.supportOldAvr ? devInfo.RenameSource.value : [];
                const inputsReferenceOldAvrCount = inputsReferenceOldAvr.length;
                for (let i = 0; i < inputsReferenceOldAvrCount; i++) {
                    const renamedInput = inputsNameOldAvr[i].trim();
                    const name = renamedInput !== '' ? inputsNameOldAvr[i] : inputsReferenceOldAvr[i];
                    const inputReference = inputsReferenceOldAvr[i];
                    const reference = referenceConversionKeys.includes(inputReference) ? CONSTANS.InputConversion[inputReference] : inputReference;
                    const obj = {
                        'name': name,
                        'reference': reference,
                        'mode': 'SI'
                    }
                    inputsArr.push(obj);
                    referencesArray.push(reference);
                }

                //new AVR-X
                const deviceInputs = this.getInputsFromDevice && supportInputSource ? zoneCapabilities.InputSource.List.Source : [];
                for (const input of deviceInputs) {
                    const inputName = input.DefaultName;
                    const inputReference = input.FuncName;
                    const reference = referenceConversionKeys.includes(inputReference) ? CONSTANS.InputConversion[inputReference] : inputReference;
                    const obj = {
                        'name': inputName,
                        'reference': reference,
                        'mode': 'SI'
                    }
                    inputsArr.push(obj);
                    referencesArray.push(reference);
                };

                const deviceSchortcuts = this.getInputsFromDevice && supportShortcut ? zoneCapabilities.ShortcutControl.EntryList.Shortcut : [];
                for (const shortcut of deviceSchortcuts) {
                    const category = shortcut.Category; //3 Quick/Smart Select, 4 Inputs
                    const shortcutName = shortcut.DispName;
                    const shortcutReference = shortcut.FuncName;
                    const reference = referenceConversionKeys.includes(shortcutReference) ? CONSTANS.InputConversion[shortcutReference] : shortcutReference;
                    const obj = {
                        'name': shortcutName,
                        'reference': reference,
                        'mode': ['', '', '', 'MS', 'SI'][category]
                    }
                    const existedInArray = referencesArray.includes(reference);
                    const push = !existedInArray && category === '4' ? inputsArr.push(obj) : false;
                };

                const deviceFavorites = this.getFavoritesFromDevice && supportFavorites ? devInfo.DeviceCapabilities.Operation.Favorites : [];
                for (const favorite of deviceFavorites) {
                    const favoriteName = favorite.DispName;
                    const favoriteReference = favorite.FuncName;
                    const reference = referenceConversionKeys.includes(favoriteReference) ? CONSTANS.InputConversion[favoriteReference] : favoriteReference;
                    const obj = {
                        'name': favoriteName,
                        'reference': reference,
                        'mode': 'ZM'
                    }
                    const existedInArray = referencesArray.includes(reference);
                    const push = !existedInArray ? inputsArr.push(obj) : false;
                };

                const deviceQuickSmartSelect = this.getQuickSmartSelectFromDevice && supportQuickSmartSelect ? zoneCapabilities.Operation.QuickSelect : [];
                const quickSelectCount = this.getQuickSmartSelectFromDevice && supportQuickSmartSelect ? deviceQuickSmartSelect.MaxQuickSelect : 0;
                for (let i = 0; i < quickSelectCount; i++) {
                    const quickSelect = deviceQuickSmartSelect[`QuickSelect${i + 1}`];
                    const quickSelectName = quickSelect.Name;
                    const quickSelectReference = quickSelect.FuncName;
                    const reference = referenceConversionKeys.includes(quickSelectReference) ? CONSTANS.InputConversion[quickSelectReference] : quickSelectReference;
                    const obj = {
                        'name': quickSelectName,
                        'reference': reference,
                        'mode': 'MS'
                    }
                    const existedInArray = referencesArray.includes(reference);
                    const push = !existedInArray ? inputsArr.push(obj) : false;
                };

                const allInputsArr = zone <= 2 ? this.getInputsFromDevice ? inputsArr : this.inputs : this.surrounds;
                const inputs = JSON.stringify(allInputsArr, null, 2);
                await fsPromises.writeFile(path, inputs);
                const debug = !this.debugLog ? false : this.emit('message', `saved ${this.zoneInputSurroundName}: ${inputs}`);

                resolve()
            } catch (error) {
                reject(error);
            }
        });
    };

    send(command) {
        return new Promise(async (resolve, reject) => {
            try {
                const path = CONSTANS.ApiUrls.iPhoneDirect + command;
                await this.axiosInstance(path);
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    };
};
module.exports = DENON;
