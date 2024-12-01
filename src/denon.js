import { promises as fsPromises } from 'fs';
import axios from 'axios';
import { Agent } from 'https';
import EventEmitter from 'events';
import ImpulseGenerator from './impulsegenerator.js';
import { XMLParser, XMLBuilder, XMLValidator } from 'fast-xml-parser';
import { ApiUrls, InputConversion, SoundModeConversion, BodyXml, PictureModesDenonNumber, InputMode } from './constants.js';
const INPUTS_CONVERSION_KEYS = Object.keys(InputConversion);
const SOUND_MODES_CONVERSION_KEYS = Object.keys(SoundModeConversion);

class Denon extends EventEmitter {
    constructor(config) {
        super();
        const host = config.host;
        const port = config.port;
        this.host = host;
        this.generation = config.generation;
        this.zone = config.zone;
        this.inputs = config.inputs;
        this.devInfoFile = config.devInfoFile;
        this.inputsFile = config.inputsFile;
        this.getInputsFromDevice = this.zone < 3 ? config.getInputsFromDevice : false;
        this.getFavoritesFromDevice = this.getInputsFromDevice ? config.getFavoritesFromDevice : false;
        this.getQuickSmartSelectFromDevice = this.getInputsFromDevice ? config.getQuickSmartSelectFromDevice : false;
        this.debugLog = config.debugLog;
        this.deviceInfoUrl = [ApiUrls.DeviceInfoGen0, ApiUrls.DeviceInfoGen1, ApiUrls.DeviceInfoGen2][this.generation];

        const baseUrl = `http://${host}:${port}`;
        this.axiosInstance = this.generation === 2 ? axios.create({
            method: 'GET',
            baseURL: baseUrl,
            timeout: 15000,
            maxContentLength: 100000000,
            maxBodyLength: 1000000000,
            httpsAgent: new Agent({
                rejectUnauthorized: false
            })
        }) : axios.create({
            method: 'GET',
            baseURL: baseUrl,
            timeout: 15000,
            maxContentLength: 100000000,
            maxBodyLength: 1000000000,
        });

        this.axiosInstancePost = this.generation === 2 ? axios.create({
            method: 'POST',
            baseURL: baseUrl,
            timeout: 15000,
            httpsAgent: new Agent({
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
        this.parseString = new XMLParser(options);

        this.power = false;
        this.reference = '';
        this.volume = 0;
        this.volumeDisplay = 'Absolute';
        this.mute = false;
        this.pictureMode = 0;
        this.soundMode = '';
        this.audysseyMode = '';
        this.devInfo = {};
        this.object = {};

        this.impulseGenerator = new ImpulseGenerator();
        this.impulseGenerator.on('checkState', async () => {
            try {
                await this.checkState();
            } catch (error) {
                const logError = config.disableLogConnectError ? false : this.emit('error', `Impulse generator check state error: ${error.message || error}.`);
            };
        }).on('state', (state) => {
            const emitState = state ? this.emit('success', `Impulse generator started.`) : this.emit('warn', `Impulse generator stopped.`);
        });
    };

    async connect() {
        try {
            //get device info
            const deviceInfo = await this.axiosInstance(this.deviceInfoUrl);
            const parseData = this.parseString.parse(deviceInfo.data);
            const devInfo = [parseData.item, parseData.Device_Info, parseData.Device_Info][this.generation];
            const debug = this.debugLog ? this.emit('debug', `Connect data: ${JSON.stringify(devInfo, null, 2)}`) : false;
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
            const modelName = deviceInfoKeys.includes('ModelName') ? devInfo.ModelName : deviceInfoKeys.includes('FriendlyName') ? devInfo.FriendlyName.value : 'AV Receiver';
            const macAddressSupported = deviceInfoKeys.includes('MacAddress');
            const serialNumber = [macAddressSupported ? devInfo.MacAddress.toString() : `1234567654321${this.host}`, macAddressSupported ? devInfo.MacAddress.toString() : false, macAddressSupported ? devInfo.MacAddress.toString() : false][this.generation];
            const firmwareRevision = deviceInfoKeys.includes('UpgradeVersion') ? devInfo.UpgradeVersion.toString() : '00';
            const reloadDeviceInfo = deviceInfoKeys.includes('ReloadDeviceInfo') ? devInfo.ReloadDeviceInfo : 0;
            const deviceZones = deviceInfoKeys.includes('DeviceZones') ? devInfo.DeviceZones : 1;

            //device capabilities
            const capabilitiesSupport = deviceInfoKeys.includes('DeviceCapabilities');
            const capabilities = capabilitiesSupport ? devInfo.DeviceCapabilities : this.object;
            const capabilitiesKeys = capabilitiesSupport ? Object.keys(capabilities) : [];

            //menu
            const capabilitiesMenuSupport = capabilitiesSupport && capabilitiesKeys.includes('Menu');
            const capabilitiesMenu = capabilitiesMenuSupport ? devInfo.DeviceCapabilities.Menu : this.object;
            const capabilitiesMenuKeys = capabilitiesMenuSupport ? Object.keys(capabilitiesMenu) : [];

            //setup
            const capabilitiesSetupSupport = capabilitiesSupport && capabilitiesKeys.includes('Setup');
            const capabilitiesSetup = capabilitiesSetupSupport ? devInfo.DeviceCapabilities.Setup : this.object;
            const capabilitiesSetupKeys = capabilitiesSetupSupport ? Object.keys(capabilitiesSetup) : [];
            const supportPartyMode = capabilitiesSetupSupport && capabilitiesSetupKeys.includes('PartyMode') ? capabilitiesSetup.PartyMode.Control === 1 : false;
            const supportTone = capabilitiesSetupSupport && capabilitiesSetupKeys.includes('ToneControl') ? capabilitiesSetup.ToneControl.Control === 1 : false;
            const supportSubwooferLevel = capabilitiesSetupSupport && capabilitiesSetupKeys.includes('SubwooferLevel') ? capabilitiesSetup.SubwooferLevel.Control === 1 : false;
            const supportChannelLevel = capabilitiesSetupSupport && capabilitiesSetupKeys.includes('ChannelLevel') ? capabilitiesSetup.ChannelLevel.Control === 1 : false;
            const supportAllZoneStereo = capabilitiesSetupSupport && capabilitiesSetupKeys.includes('AllZoneStereo') ? capabilitiesSetup.AllZoneStereo.Control === 1 : false;
            const supportPictureMode = capabilitiesSetupSupport && capabilitiesSetupKeys.includes('PictureMode') ? capabilitiesSetup.PictureMode.Control === 1 : false;
            const supportSoundMode = capabilitiesSetupSupport && capabilitiesSetupKeys.includes('SoundMode') ? capabilitiesSetup.SoundMode.Control === 1 : false
            this.supportPictureMode = supportPictureMode;
            this.supportSoundMode = supportSoundMode;

            //net link
            const capabilitiesNetLinkSupport = capabilitiesSupport && capabilitiesKeys.includes('NetLink');
            const capabilitiesNetLink = capabilitiesNetLinkSupport ? devInfo.DeviceCapabilities.NetLink : this.object;
            const capabilitiesNetLinkKeys = capabilitiesNetLinkSupport ? Object.keys(capabilitiesNetLink) : [];

            //operation
            const capabilitiesOperationSupport = capabilitiesSupport && capabilitiesKeys.includes('Operation');
            const capabilitiesOperation = capabilitiesOperationSupport ? devInfo.DeviceCapabilities.Operation : this.object;
            const capabilitiesOperationKeys = capabilitiesOperationSupport ? Object.keys(capabilitiesOperation) : [];
            const supportClock = capabilitiesOperationSupport & capabilitiesOperationKeys.includes('Clock') ? capabilitiesOperation.Clock.Control === 1 : false;
            const supportAllZonePower = capabilitiesOperationSupport & capabilitiesOperationKeys.includes('AllZonePower') ? capabilitiesOperation.AllZonePower.Control === 1 : false;
            const supportAllZoneMute = capabilitiesOperationSupport & capabilitiesOperationKeys.includes('AllZoneMute') ? capabilitiesOperation.AllZoneMute.Control === 1 : false;
            const supportFavorites = capabilitiesOperationSupport & capabilitiesOperationKeys.includes('Favorites') ? capabilitiesOperation.Favorites.Control === 1 : false;
            const supportFavoriteStation = capabilitiesOperationSupport & capabilitiesOperationKeys.includes('FavoriteStation') ? capabilitiesOperation.FavoriteStation.Control === 1 : false;

            //zone capabilities
            const zoneCapabilitiesSupport = this.zone <= 2 ? deviceInfoKeys.includes('DeviceZoneCapabilities') : false;
            const zoneCapabilities = zoneCapabilitiesSupport ? Array.isArray(devInfo.DeviceZoneCapabilities) ? devInfo.DeviceZoneCapabilities[this.zone] : [devInfo.DeviceZoneCapabilities][0] : [];
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
            const zoneCapabilitiesSetup = zoneCapabilitiesSetupSupport ? zoneCapabilities.Setup : this.object;
            const zonesCapabilitiesSetupKeys = zoneCapabilitiesSetupSupport ? Object.keys(zoneCapabilitiesSetup) : [];
            const supportRestorer = zonesCapabilitiesSetupKeys.includes('Restorer') ? zoneCapabilitiesSetup.Restorer.Control === 1 : false;
            const supportToneControl = zonesCapabilitiesSetupKeys.includes('ToneControl') ? zoneCapabilitiesSetup.ToneControl.Control === 1 : false;

            //operation
            const zoneCapabilitiesOperationSupport = zoneCapabilitiesSupport && zoneCapabilitiesKeys.includes('Operation');
            const zoneCapabilitiesOperation = zoneCapabilitiesOperationSupport ? zoneCapabilities.Operation : this.object;
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
            const zoneCapabilitiesNetUsb = zoneCapabilitiesNetUsbSupport ? zoneCapabilities.NetUsb : this.object;
            const zoneCapabilitiesNetUsbKeys = zoneCapabilitiesNetUsbSupport ? Object.keys(zoneCapabilitiesNetUsb) : [];
            const supportInternetRadio = zoneCapabilitiesNetUsbKeys.includes('InternetRadio') ? zoneCapabilitiesNetUsb.InternetRadio.Control === 1 : false;
            const supportMediaServer = zoneCapabilitiesNetUsbKeys.includes('MediaServer') ? zoneCapabilitiesNetUsb.MediaServer.Control === 1 : false;
            const supportiPod = zoneCapabilitiesNetUsbKeys.includes('iPod') ? zoneCapabilitiesNetUsb.iPod.Control === 1 : false;
            const supportUsb = zoneCapabilitiesNetUsbKeys.includes('USB') ? zoneCapabilitiesNetUsb.USB.Control === 1 : false;
            const supportUsb2 = zoneCapabilitiesNetUsbKeys.includes('USB2') ? zoneCapabilitiesNetUsb.USB2.Control === 1 : false;
            const supportSpotifyConnect = zoneCapabilitiesNetUsbKeys.includes('SpotifyConnect') ? zoneCapabilitiesNetUsb.SpotifyConnect.Control === 1 : false;

            //check seriaql number
            if (!serialNumber) {
                this.emit('error', `Missing Serial Number.`);
                return;
            }

            //save device info to the file
            const saveDevInfo = this.zone === 0 ? await this.saveData(this.devInfoFile, devInfo) : false;

            //prepare all inputs
            const inputFuncListExistOldAvr = deviceInfoKeys.includes('InputFuncList');
            const deviceInputsOldAvr = this.generation === 0 && inputFuncListExistOldAvr ? devInfo.InputFuncList.value : [];
            const deviceInputsNewAvr = supportInputSource ? zoneCapabilities.InputSource.List.Source : [];
            const deviceInputs = this.getInputsFromDevice ? [deviceInputsOldAvr, deviceInputsNewAvr, deviceInputsNewAvr][this.generation] : this.inputs;
            const allInputs = await this.getInputs(devInfo, this.generation, this.zone, deviceInputs, zoneCapabilities, this.getInputsFromDevice, this.getFavoritesFromDevice, this.getQuickSmartSelectFromDevice, supportFavorites, supportShortcut, supportQuickSmartSelect);
            const inputsExist = allInputs.length > 0;

            //check inputs
            if (!inputsExist) {
                this.emit('warn', `Found: ${allInputs} inputs.`);
            }

            //save inputs if exist
            const saveInputs = inputsExist ? await this.saveData(this.inputsFile, allInputs) : false;

            //connect to deice success
            this.emit('success', `Connect Success.`)

            //emit device info
            this.emit('deviceInfo', manufacturer, modelName, serialNumber, firmwareRevision, deviceZones, apiVersion, supportPictureMode);

            //start external integration
            this.emit('externalIntegration');

            //prepare accessory
            this.emit('prepareAccessory', allInputs);

            return true;
        } catch (error) {
            throw new Error(`Connect error: ${error.message || error}.`);

        };
    };

    async checkState() {
        try {
            //get zones status
            const zoneStateUrl = [ApiUrls.MainZoneStatusLite, ApiUrls.Zone2StatusLite, ApiUrls.Zone3StatusLite, ApiUrls.SoundModeStatus][this.zone];
            const deviceState = await this.axiosInstance(zoneStateUrl);
            const parseDeviceState = this.parseString.parse(deviceState.data);
            const devState = parseDeviceState.item;
            const debug = this.debugLog ? this.emit('debug', `State: ${JSON.stringify(devState, null, 2)}`) : false;

            //get receiver status
            const statusKeys = Object.keys(devState);
            const power = devState.Power.value === 'ON';
            const input = INPUTS_CONVERSION_KEYS.includes(devState.InputFuncSelect.value) ? InputConversion[devState.InputFuncSelect.value] : devState.InputFuncSelect.value;
            const volumeDisplay = statusKeys.includes('VolumeDisplay') ? devState.VolumeDisplay.value : this.volumeDisplay;
            const volume = parseFloat(devState.MasterVolume.value) >= -79.5 ? parseInt(devState.MasterVolume.value) + 80 : 0;
            const mute = devState.Mute.value === 'on';

            //get picture mode
            const checkPictureMode = this.supportPictureMode && power && this.zone === 0;
            const devicePictureMode = checkPictureMode ? await this.axiosInstancePost(ApiUrls.AppCommand, BodyXml.GetPictureMode) : false;
            const parseDevicePictureMode = checkPictureMode ? this.parseString.parse(devicePictureMode.data) : false;
            const debug1 = this.debugLog && checkPictureMode ? this.emit('debug', `Picture mode: ${JSON.stringify(parseDevicePictureMode, null, 2)}`) : false;
            const pictureMode = checkPictureMode ? parseDevicePictureMode.rx.cmd.value : this.pictureMode;

            //get sound mode
            const checkZone = this.zone === 0 || this.zone === 3;
            const checkSoundeMode = this.supportSoundMode && power && checkZone;
            const deviceSoundMode = checkSoundeMode ? await this.axiosInstancePost(ApiUrls.AppCommand, BodyXml.GetSurroundModeStatus) : false;
            const parseDeviceSoundMode = checkSoundeMode ? this.parseString.parse(deviceSoundMode.data) : false;
            const debug2 = this.debugLog && checkSoundeMode ? this.emit('debug', `Sound mode: ${JSON.stringify(parseDeviceSoundMode, null, 2)}`) : false;
            const soundMode = checkSoundeMode ? SOUND_MODES_CONVERSION_KEYS.includes((parseDeviceSoundMode.rx.cmd.surround).replace(/[^a-zA-Z0-9]/g, '').toUpperCase()) ? SoundModeConversion[(parseDeviceSoundMode.rx.cmd.surround).replace(/[^a-zA-Z0-9]/g, '').toUpperCase()] : (parseDeviceSoundMode.rx.cmd.surround).replace(/[^a-zA-Z0-9]/g, '').toUpperCase() : this.soundMode;

            //get audyssey mode
            const checkAudysseyMode = false //power && zone === 0;
            const deviceAudysseyMode = checkAudysseyMode ? await this.axiosInstancePost(ApiUrls.AppCommand, BodyXml.GetAudyssey) : false;
            const parseDeviceAudysseyMode = checkAudysseyMode ? this.parseString.parse(deviceAudysseyMode.data) : false;
            const debug3 = this.debugLog && checkAudysseyMode ? this.emit('debug', `Audyssey mode: ${JSON.stringify(parseDeviceAudysseyMode, null, 2)}`) : false;
            const audysseyMode = checkAudysseyMode ? parseDeviceAudysseyMode.rx.cmd.value : this.audysseyMode;

            //select reference
            const reference = [input, input, input, soundMode][this.zone];

            //restFul
            this.emit('restFul', 'info', this.devInfo);
            this.emit('restFul', 'state', devState);
            const restFul1 = checkPictureMode ? this.emit('restFul', 'picture', { 'Picture Mode': PictureModesDenonNumber[pictureMode] }) : false;
            const restFul2 = checkSoundeMode ? this.emit('restFul', 'surround', { 'Sound Mode': soundMode }) : false;

            //mqtt
            this.emit('mqtt', 'Info', this.devInfo);
            this.emit('mqtt', 'State', devState);
            const mqtt2 = checkPictureMode ? this.emit('mqtt', 'Picture', { 'Picture Mode': PictureModesDenonNumber[pictureMode] }) : false;
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

            return true;
        } catch (error) {
            throw new Error(`Check state error: ${error.message || error}.`);
        };
    };

    async getInputs(devInfo, generation, zone, inputs, zoneCapabilities, getInputsFromDevice, getFavoritesFromDevice, getQuickSmartSelectFromDevice, supportFavorites, supportShortcut, supportQuickSmartSelect) {
        try {
            //temp array of inputs
            const tempInputs = [];

            //add inputs from avr or config
            let i = 0;
            for (const input of inputs) {
                const inputNameOldAvr = getInputsFromDevice && generation === 0 ? devInfo.RenameSource.value[i].trim() !== '' ? devInfo.RenameSource.value[i] : inputs[i] : `Input ${i}`;
                const inputName = getInputsFromDevice ? [inputNameOldAvr, input.DefaultName, input.DefaultName][generation] : input.name ?? false;
                const inputReference = getInputsFromDevice ? [input, input.FuncName, input.FuncName][generation] : input.reference ?? false;
                i++;

                //check input name and reference
                if (!inputName || !inputReference) {
                    continue;
                }

                const obj = {
                    'name': inputName,
                    'reference': inputReference
                }
                tempInputs.push(obj);
            };

            //add schortcuts
            const deviceSchortcuts = getInputsFromDevice && supportShortcut && Array.isArray(zoneCapabilities.ShortcutControl.EntryList.Shortcut) ? zoneCapabilities.ShortcutControl.EntryList.Shortcut : [];
            for (const shortcut of deviceSchortcuts) {
                const category = shortcut.Category; //1, 2, 3 Quick/Smart Select, 4 Inputs, 5 Sound Mode
                const shortcutName = shortcut.DispName ?? false;
                const shortcutReference = shortcut.FuncName ?? false;

                //check schorcut category, name and reference
                if (category !== '4' || !shortcutName || !shortcutReference) {
                    continue;
                }

                const obj = {
                    'name': shortcutName,
                    'reference': shortcutReference
                }
                tempInputs.push(obj);
            };

            //add favorites
            const deviceFavorites = getFavoritesFromDevice && supportFavorites && Array.isArray(devInfo.DeviceCapabilities.Operation.Favorites) ? devInfo.DeviceCapabilities.Operation.Favorites : [];
            for (const favorite of deviceFavorites) {
                const favoriteName = favorite.DispName ?? false;
                const favoriteReference = favorite.FuncName ?? false;

                //check favorite name and reference
                if (!favoriteName || !favoriteReference) {
                    continue;
                }

                const obj = {
                    'name': favoriteName,
                    'reference': favoriteReference
                }
                tempInputs.push(obj);
            };

            //add quick and smart select
            const deviceQuickSmartSelect = getQuickSmartSelectFromDevice && supportQuickSmartSelect ? zoneCapabilities.Operation.QuickSelect : {};
            const quickSelectCount = getQuickSmartSelectFromDevice && supportQuickSmartSelect ? deviceQuickSmartSelect.MaxQuickSelect : 0;
            for (let j = 1; j < quickSelectCount; j++) {
                const quickSelect = deviceQuickSmartSelect[`QuickSelect${j}`];
                const quickSelectName = quickSelect.Name ?? false;
                const quickSelectReference = quickSelect.FuncName ?? false;

                //check quick select name and reference
                if (!quickSelectName || !quickSelectReference) {
                    continue;
                }

                const obj = {
                    'name': quickSelectName,
                    'reference': quickSelectReference
                }
                tempInputs.push(obj);
            };

            //chack duplicated inputs and convert reference
            const allInputs = [];
            for (const input of tempInputs) {
                const inputName = input.name;
                let inputReference = INPUTS_CONVERSION_KEYS.includes(input.reference) ? InputConversion[input.reference] : input.reference;
                let inputMode = 'SI';

                //zones
                switch (zone) {
                    case 0:
                        //Denon
                        const inputReferenceSubstring = inputReference.substring(0, 5) ?? 'Unknown';
                        const inputModeExist = inputReferenceSubstring in InputMode;

                        //Marantz M-CR611
                        const inputReferenceSubstring1 = inputReference.substring(0, 2) ?? 'Unknown';
                        const inputModeExist1 = inputReferenceSubstring1 in InputMode;

                        inputReference = inputModeExist1 ? inputReference.substring(3) : inputReference;
                        inputMode = inputModeExist ? InputMode[inputReferenceSubstring] : inputModeExist1 ? InputMode[inputReferenceSubstring1] : inputMode;
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

                const duplicatedInput = allInputs.some(input => input.reference === inputReference);
                if (!inputName || !inputReference || !inputMode || duplicatedInput) {
                    continue;
                }

                const obj = {
                    'name': inputName,
                    'reference': inputReference,
                    'mode': inputMode
                }
                allInputs.push(obj);
            }
            const debug = this.debugLog ? this.emit('message', `All Inputs: ${JSON.stringify(allInputs, null, 2)}`) : false;

            return allInputs;
        } catch (error) {
            throw new Error(`Get inputus error: ${error.message || error}`);
        }
    };

    async saveData(path, data) {
        try {
            data = JSON.stringify(data, null, 2);
            await fsPromises.writeFile(path, data);
            const debug = this.debugLog ? this.emit('debug', `Saved data: ${data}`) : false;
            return true;
        } catch (error) {
            throw new Error(`Save data error: ${error.message || error}`);
        };
    };

    async send(command) {
        try {
            const path = `${ApiUrls.iPhoneDirect}${command}`;
            await this.axiosInstance(path);
            return true;
        } catch (error) {
            throw new Error(error);
        };
    };
};
export default Denon;
