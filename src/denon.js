'use strict';
const fs = require('fs');
const fsPromises = fs.promises;
const https = require('https');
const axios = require('axios');
const EventEmitter = require('events');
const { XMLParser, XMLBuilder, XMLValidator } = require('fast-xml-parser');
const ImpulseGenerator = require('./impulsegenerator.js');
const CONSTANTS = require('./constants.json');
const INPUTS_CONVERSION_KEYS = Object.keys(CONSTANTS.InputConversion);
const SOUND_MODES_CONVERSION_KEYS = Object.keys(CONSTANTS.SoundModeConversion);

class DENON extends EventEmitter {
    constructor(config) {
        super();
        const host = config.host;
        const port = config.port;
        const generation = config.generation;
        const zone = config.zone;
        const inputs = config.inputs;
        const devInfoFile = config.devInfoFile;
        const inputsFile = config.inputsFile;
        const getInputsFromDevice = zone < 3 ? config.getInputsFromDevice : false;
        const getFavoritesFromDevice = getInputsFromDevice ? config.getFavoritesFromDevice : false;
        const getQuickSmartSelectFromDevice = getInputsFromDevice ? config.getQuickSmartSelectFromDevice : false;
        const debugLog = config.debugLog;
        const disableLogConnectError = config.disableLogConnectError;
        const refreshInterval = config.refreshInterval;
        const zoneInputSurroundName = CONSTANTS.ZoneInputSurroundName[zone];
        const deviceInfoUrl = [CONSTANTS.ApiUrls.DeviceInfoGen0, CONSTANTS.ApiUrls.DeviceInfoGen1, CONSTANTS.ApiUrls.DeviceInfoGen2][generation];
        this.debugLog = debugLog;

        const baseUrl = `http://${host}:${port}`;
        this.axiosInstance = generation === 2 ? axios.create({
            method: 'GET',
            baseURL: baseUrl,
            timeout: 15000,
            maxContentLength: 100000000,
            maxBodyLength: 1000000000,
            httpsAgent: new https.Agent({
                rejectUnauthorized: false
            })
        }) : axios.create({
            method: 'GET',
            baseURL: baseUrl,
            timeout: 15000,
            maxContentLength: 100000000,
            maxBodyLength: 1000000000,
        });

        this.axiosInstancePost = generation === 2 ? axios.create({
            method: 'POST',
            baseURL: baseUrl,
            timeout: 15000,
            httpsAgent: new https.Agent({
                rejectUnauthorized: false
            })
        }) : axios.create({
            method: 'POST',
            baseURL: baseUrl,
            timeout: 15000
        });

        const options = {
            ignoreAttributes: false,
            ignorePiTags: true,
            allowBooleanAttributes: true
        };
        const parseString = new XMLParser(options);

        this.startPrepareAccessory = true;
        this.emitDeviceInfo = true;
        this.power = false;
        this.reference = '';
        this.volume = 0;
        this.volumeDisplay = 'Absolute';
        this.mute = false;
        this.pictureMode = 0;
        this.soundMode = '';
        this.audysseyMode = '';
        this.devInfo = {};
        const object = {};

        const timers = [
            { name: 'checkDeviceInfo', interval: 30000 },
            { name: 'checkState', interval: refreshInterval },
        ];

        const impulseGenerator = new ImpulseGenerator(timers);
        impulseGenerator.on('checkDeviceInfo', async () => {
            if (!this.startPrepareAccessory) {
                return;
            }

            try {
                //get device info
                const deviceInfo = await this.axiosInstance(deviceInfoUrl);
                const parseData = parseString.parse(deviceInfo.data);
                const devInfo = [parseData.item, parseData.Device_Info, parseData.Device_Info][generation];
                const debug = debugLog ? this.emit('debug', `Info: ${JSON.stringify(devInfo, null, 2)}`) : false;
                this.devInfo = devInfo;

                //device info
                const deviceInfoKeys = Object.keys(devInfo);
                const deviceInfoVers = deviceInfoKeys.includes('DeviceInfoVers') ? devInfo.DeviceInfoVers : 0;
                const apiVersion = deviceInfoKeys.includes('CommApiVers') ? devInfo.CommApiVers : '000';
                const gen = deviceInfoKeys.includes('Gen') ? devInfo.Gen : 0;
                const brandCode = deviceInfoKeys.includes('BrandCode') ? devInfo.BrandCode : 2;
                const manufacturer = ['Denon', 'Marantz', 'Denon/Marantz'][brandCode] ?? 'Denon/Marantz';
                const productCategory = deviceInfoKeys.includes('ProductCategory') ? devInfo.ProductCategory : '00';
                const categoryName = deviceInfoKeys.includes('CategoryName') ? devInfo.ProductCategory : 'Unknown';
                const manualModelName = deviceInfoKeys.includes('ManualModelName') ? devInfo.ManualModelName : 'Unknown';
                const deliveryCode = deviceInfoKeys.includes('DeliveryCode') ? devInfo.DeliveryCode : 0;
                const modelName = deviceInfoKeys.includes('ModelName') ? devInfo.ModelName : 'AV Receiver';
                const macAddressSupported = deviceInfoKeys.includes('MacAddress');
                const serialNumber = [macAddressSupported ? devInfo.MacAddress.toString() : `1234567654321`, macAddressSupported ? devInfo.MacAddress.toString() : false, macAddressSupported ? devInfo.MacAddress.toString() : false][generation];
                const firmwareRevision = deviceInfoKeys.includes('UpgradeVersion') ? devInfo.UpgradeVersion.toString() : '00';
                const reloadDeviceInfo = deviceInfoKeys.includes('ReloadDeviceInfo') ? devInfo.ReloadDeviceInfo : 0;
                const deviceZones = deviceInfoKeys.includes('DeviceZones') ? devInfo.DeviceZones : 1;

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

                //net link
                const capabilitiesNetLinkSupport = capabilitiesSupport && capabilitiesKeys.includes('NetLink');
                const capabilitiesNetLink = capabilitiesNetLinkSupport ? devInfo.DeviceCapabilities.NetLink : object;
                const capabilitiesNetLinkKeys = capabilitiesNetLinkSupport ? Object.keys(capabilitiesNetLink) : [];

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
                const zoneCapabilitiesSupport = zone <= 2 ? deviceInfoKeys.includes('DeviceZoneCapabilities') : false;
                const zoneCapabilities = zoneCapabilitiesSupport ? Array.isArray(devInfo.DeviceZoneCapabilities) ? devInfo.DeviceZoneCapabilities[zone] : [devInfo.DeviceZoneCapabilities][0] : [];
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
                    return;
                }

                //save device info to the file
                const saveDevInfo = zone === 0 ? await this.saveDevInfo(devInfoFile, devInfo) : false;

                //save inputs to the file
                const deviceInputsOldAvr = getInputsFromDevice ? generation === 0 ? devInfo.InputFuncList.value : [] : inputs;
                const deviceInputsNewAvr = getInputsFromDevice ? supportInputSource ? zoneCapabilities.InputSource.List.Source : [] : inputs;
                const deviceInputs = [deviceInputsOldAvr, deviceInputsNewAvr, deviceInputsNewAvr][generation];
                const allInputs = await this.saveInputs(inputsFile, devInfo, generation, zone, zoneInputSurroundName, deviceInputs, zoneCapabilities, getInputsFromDevice, getFavoritesFromDevice, getQuickSmartSelectFromDevice, supportFavorites, supportShortcut, supportQuickSmartSelect);

                //emit device info
                const emitDeviceInfo = this.emitDeviceInfo ? this.emit('deviceInfo', manufacturer, modelName, serialNumber, firmwareRevision, deviceZones, apiVersion, supportPictureMode) : false;
                this.emitDeviceInfo = false;

                this.supportPictureMode = supportPictureMode;
                this.supportSoundMode = supportSoundMode;

                //prepare accessory
                const prepareAccessory = this.startPrepareAccessory ? this.emit('prepareAccessory', allInputs) : false;
                this.startPrepareAccessory = false;

                //check state
                await new Promise(resolve => setTimeout(resolve, 1500));
                impulseGenerator.emit('checkState')
            } catch (error) {
                const debug = disableLogConnectError ? false : this.emit('error', `Info error: ${error}, reconnect in 15s.`);
            };
        })
            .on('checkState', async () => {
                if (this.startPrepareAccessory) {
                    return;
                }

                try {
                    //get zones status
                    const zoneStateUrl = [CONSTANTS.ApiUrls.MainZoneStatusLite, CONSTANTS.ApiUrls.Zone2StatusLite, CONSTANTS.ApiUrls.Zone3StatusLite, CONSTANTS.ApiUrls.SoundModeStatus][zone];
                    const deviceState = await this.axiosInstance(zoneStateUrl);
                    const parseDeviceState = parseString.parse(deviceState.data);
                    const devState = parseDeviceState.item;
                    const debug = debugLog ? this.emit('debug', `State: ${JSON.stringify(devState, null, 2)}`) : false;

                    //get receiver status
                    const statusKeys = Object.keys(devState);
                    const power = devState.Power.value === 'ON';
                    const input = INPUTS_CONVERSION_KEYS.includes(devState.InputFuncSelect.value) ? CONSTANTS.InputConversion[devState.InputFuncSelect.value] : devState.InputFuncSelect.value;
                    const volumeDisplay = statusKeys.includes('VolumeDisplay') ? devState.VolumeDisplay.value : this.volumeDisplay;
                    const volume = parseFloat(devState.MasterVolume.value) >= -79.5 ? parseInt(devState.MasterVolume.value) + 80 : 0;
                    const mute = devState.Mute.value === 'on';

                    //get picture mode
                    const checkPictureMode = this.supportPictureMode && power && zone === 0;
                    const devicePictureMode = checkPictureMode ? await this.axiosInstancePost(CONSTANTS.ApiUrls.AppCommand, CONSTANTS.BodyXml.GetPictureMode) : false;
                    const parseDevicePictureMode = checkPictureMode ? parseString.parse(devicePictureMode.data) : false;
                    const debug1 = debugLog && checkPictureMode ? this.emit('debug', `Picture mode: ${JSON.stringify(parseDevicePictureMode, null, 2)}`) : false;
                    const pictureMode = checkPictureMode ? parseDevicePictureMode.rx.cmd.value : this.pictureMode;

                    //get sound mode
                    const checkZone = zone === 0 || zone === 3;
                    const checkSoundeMode = this.supportSoundMode && power && checkZone;
                    const deviceSoundMode = checkSoundeMode ? await this.axiosInstancePost(CONSTANTS.ApiUrls.AppCommand, CONSTANTS.BodyXml.GetSurroundModeStatus) : false;
                    const parseDeviceSoundMode = checkSoundeMode ? parseString.parse(deviceSoundMode.data) : false;
                    const debug2 = debugLog && checkSoundeMode ? this.emit('debug', `Sound mode: ${JSON.stringify(parseDeviceSoundMode, null, 2)}`) : false;
                    const soundMode = checkSoundeMode ? SOUND_MODES_CONVERSION_KEYS.includes((parseDeviceSoundMode.rx.cmd.surround).replace(/[^a-zA-Z0-9]/g, '').toUpperCase()) ? CONSTANTS.SoundModeConversion[(parseDeviceSoundMode.rx.cmd.surround).replace(/[^a-zA-Z0-9]/g, '').toUpperCase()] : (parseDeviceSoundMode.rx.cmd.surround).replace(/[^a-zA-Z0-9]/g, '').toUpperCase() : this.soundMode;

                    //get audyssey mode
                    const checkAudysseyMode = false //power && zone === 0;
                    const deviceAudysseyMode = checkAudysseyMode ? await this.axiosInstancePost(CONSTANTS.ApiUrls.AppCommand, CONSTANTS.BodyXml.GetAudyssey) : false;
                    const parseDeviceAudysseyMode = checkAudysseyMode ? parseString.parse(deviceAudysseyMode.data) : false;
                    const debug3 = debugLog && checkAudysseyMode ? this.emit('debug', `Audyssey mode: ${JSON.stringify(parseDeviceAudysseyMode, null, 2)}`) : false;
                    const audysseyMode = checkAudysseyMode ? parseDeviceAudysseyMode.rx.cmd.value : this.audysseyMode;

                    //select reference
                    const reference = [input, input, input, soundMode][zone];

                    //restFul
                    this.emit('restFul', 'info', this.devInfo);
                    this.emit('restFul', 'state', devState);
                    const restFul1 = checkPictureMode ? this.emit('restFul', 'picture', { 'Picture Mode': CONSTANTS.PictureModesDenonNumber[pictureMode] }) : false;
                    const restFul2 = checkSoundeMode ? this.emit('restFul', 'surround', { 'Sound Mode': soundMode }) : false;

                    //mqtt
                    this.emit('mqtt', 'Info', this.devInfo);
                    this.emit('mqtt', 'State', devState);
                    const mqtt2 = checkPictureMode ? this.emit('mqtt', 'Picture', { 'Picture Mode': CONSTANTS.PictureModesDenonNumber[pictureMode] }) : false;
                    const mqtt3 = checkSoundeMode ? this.emit('mqtt', 'Surround', { 'Sound Mode': soundMode }) : false;

                    //update only if value change
                    if (power === this.power && reference === this.reference && volume === this.volume && volumeDisplay === this.volumeDisplay && mute === this.mute && pictureMode === this.pictureMode && soundMode === this.soundMode) {
                        return;
                    };

                    this.power = power;
                    this.reference = reference;
                    this.volume = volume;
                    this.volumeDisplay = volumeDisplay;
                    this.mute = mute;
                    this.pictureMode = pictureMode;
                    this.soundMode = soundMode;
                    this.audysseyMode = audysseyMode;

                    //emit state changed
                    this.emit('stateChanged', power, reference, volume, volumeDisplay, mute, pictureMode);
                } catch (error) {
                    const debug = disableLogConnectError ? false : this.emit('error', `State error: ${error}, reconnect in ${refreshInterval / 1000}s.`);
                    impulseGenerator.emit('disconnect');
                };
            })
            .on('disconnect', () => {
                this.emit('stateChanged', false, this.reference, this.volume, this.volumeDisplay, this.mute, this.pictureMode);
                const debug = disableLogConnectError ? false : this.emit('disconnected', 'Disconnected.');
            });

        impulseGenerator.start();
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

    saveInputs(path, devInfo, generation, zone, zoneInputSurroundName, inputs, zoneCapabilities, getInputsFromDevice, getFavoritesFromDevice, getQuickSmartSelectFromDevice, supportFavorites, supportShortcut, supportQuickSmartSelect) {
        return new Promise(async (resolve, reject) => {
            try {
                //inputs
                const tempInputs = [];
                const inputsArr = [];
                let i = 0;
                for (const input of inputs) {
                    const inputNameOldAvr = getInputsFromDevice && generation === 0 ? devInfo.RenameSource.value[i].trim() !== '' ? devInfo.RenameSource.value[i] : inputs[i] : `Input ${i}`;
                    const inputName = getInputsFromDevice ? [inputNameOldAvr, input.DefaultName, input.DefaultName][generation] : input.name;
                    const inputReference = getInputsFromDevice ? [input, input.FuncName, input.FuncName][generation] : input.reference;
                    const obj = {
                        'name': inputName,
                        'reference': inputReference
                    }
                    tempInputs.push(obj);
                    i++;
                };

                //schortcuts
                const deviceSchortcuts = getInputsFromDevice && supportShortcut && Array.isArray(zoneCapabilities.ShortcutControl.EntryList.Shortcut) ? zoneCapabilities.ShortcutControl.EntryList.Shortcut : [];
                for (const shortcut of deviceSchortcuts) {
                    const category = shortcut.Category; //1, 2, 3 Quick/Smart Select, 4 Inputs, 5 Sound Mode
                    const shortcutName = shortcut.DispName;
                    const shortcutReference = shortcut.FuncName;
                    const obj = {
                        'name': shortcutName,
                        'reference': shortcutReference
                    }
                    const push = category === '4' ? tempInputs.push(obj) : false;
                };

                //favorites
                const deviceFavorites = getFavoritesFromDevice && supportFavorites && Array.isArray(devInfo.DeviceCapabilities.Operation.Favorites) ? devInfo.DeviceCapabilities.Operation.Favorites : [];
                for (const favorite of deviceFavorites) {
                    const favoriteName = favorite.DispName;
                    const favoriteReference = favorite.FuncName;
                    const obj = {
                        'name': favoriteName,
                        'reference': favoriteReference
                    }
                    tempInputs.push(obj);
                };

                //quick and smart select
                const deviceQuickSmartSelect = getQuickSmartSelectFromDevice && supportQuickSmartSelect ? zoneCapabilities.Operation.QuickSelect : {};
                const quickSelectCount = getQuickSmartSelectFromDevice && supportQuickSmartSelect ? deviceQuickSmartSelect.MaxQuickSelect : 0;
                for (let j = 1; j < quickSelectCount; j++) {
                    const quickSelect = deviceQuickSmartSelect[`QuickSelect${j}`];
                    const quickSelectName = quickSelect.Name;
                    const quickSelectReference = quickSelect.FuncName;
                    const obj = {
                        'name': quickSelectName,
                        'reference': quickSelectReference
                    }
                    tempInputs.push(obj);
                };

                //chack duplicated inputs and convert reference
                const debug = !this.debugLog ? false : this.emit('message', `temp Inputs: ${JSON.stringify(tempInputs, null, 2)}`);
                for (const input of tempInputs) {
                    const inputName = input.name;
                    let inputReference = INPUTS_CONVERSION_KEYS.includes(input.reference) ? CONSTANTS.InputConversion[input.reference] : input.reference;
                    let inputMode = 'SI';

                    //zones
                    switch (zone) {
                        case 0:
                            //Denon
                            const inputReferenceSubstring = inputReference.substring(0, 5) ?? 'Unknown';
                            const inputModeExist = inputReferenceSubstring in CONSTANTS.InputMode;

                            //Marantz M-CR611
                            const inputReferenceSubstring1 = inputReference.substring(0, 2) ?? 'Unknown';
                            const inputModeExist1 = inputReferenceSubstring1 in CONSTANTS.InputMode;

                            inputReference = inputModeExist1 ? inputReference.substring(3) : inputReference;
                            inputMode = inputModeExist ? CONSTANTS.InputMode[inputReferenceSubstring] : inputModeExist1 ? CONSTANTS.InputMode[inputReferenceSubstring1] : inputMode;
                            break;
                        case 1:
                            inputMode = 'Z2';
                            break;
                        case 2:
                            inputMode = 'Z3';
                            break;
                        case 3:
                            inputMode = 'MS';
                            break;
                    }

                    const obj = {
                        'name': inputName,
                        'reference': inputReference,
                        'mode': inputMode
                    }

                    const duplicatedInput = inputsArr.some(input => input.reference === inputReference);
                    const push = inputName && inputReference && inputMode && !duplicatedInput ? inputsArr.push(obj) : false;
                }

                //save inputs
                const allInputs = JSON.stringify(inputsArr, null, 2);
                await fsPromises.writeFile(path, allInputs);
                const debug1 = !this.debugLog ? false : this.emit('message', `saved ${zoneInputSurroundName}: ${allInputs}`);

                resolve(inputsArr)
            } catch (error) {
                reject(error);
            }
        });
    };

    send(command) {
        return new Promise(async (resolve, reject) => {
            try {
                const path = `${CONSTANTS.ApiUrls.iPhoneDirect}${command}`;
                await this.axiosInstance(path);
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    };
};
module.exports = DENON;
