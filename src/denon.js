import axios from 'axios';
import { Agent as HttpsAgent } from 'https';
import EventEmitter from 'events';
import ImpulseGenerator from './impulsegenerator.js';
import Functions from './functions.js';
import { XMLParser, XMLBuilder, XMLValidator } from 'fast-xml-parser';
import { ApiUrls, InputConversion, SoundModeConversion, BodyXml, PictureModesDenonNumber, InputMode, ZoneName, ManufacturerMap, ZonePrefixMap } from './constants.js';
const INPUTS_CONVERSION_KEYS = Object.keys(InputConversion);
const SOUND_MODES_CONVERSION_KEYS = Object.keys(SoundModeConversion);

class Denon extends EventEmitter {
    constructor(config, devInfoFile, inputsFile) {
        super();
        this.host = config.host;
        this.generation = config.generation || 0;
        this.zone = config.zoneControl;
        this.getInputsFromDevice = this.zone !== 3 ? (config.inputs?.getFromDevice || false) : false;
        this.getFavoritesFromDevice = this.zone < 3 && this.generation > 0 ? (config.inputs?.getFavoritesFromDevice || false) : false;
        this.getQuickSmartSelectFromDevice = this.zone < 3 && this.generation > 0 ? (config.inputs?.getQuickSmartSelectFromDevice || false) : false;
        this.inputs = config.inputs?.data || [];
        this.logDebug = config.log?.debug || false;
        this.devInfoFile = devInfoFile;
        this.inputsFile = inputsFile;

        const baseUrl = `http://${config.host}:${config.port}`;
        const commonConfig = {
            baseURL: baseUrl,
            timeout: 20000
        };

        const httpsConfig = this.generation === 2 ? { httpsAgent: new HttpsAgent({ rejectUnauthorized: false, keepAlive: false }) } : {};
        this.axiosInstance = axios.create({
            ...commonConfig,
            ...httpsConfig,
        });

        const options = {
            ignoreAttributes: false,
            ignorePiTags: true,
            allowBooleanAttributes: true
        };
        this.parseString = new XMLParser(options);

        this.functions = new Functions();
        this.info = {};
        this.power = false;
        this.reference = '';
        this.volume = -80;
        this.volumeDisplay = false;
        this.mute = false;
        this.pictureMode = 0;
        this.soundMode = '';
        this.audysseyMode = '';
        this.firstRun = true;

        //lock flags
        this.locks = false;
        this.impulseGenerator = new ImpulseGenerator()
            .on('connect', () => this.handleWithLock(async () => {
                await this.connect();
            }))
            .on('checkState', () => this.handleWithLock(async () => {
                await this.checkState();
            }))
            .on('state', (state) => {
                this.emit('success', `Impulse generator ${state ? 'started' : 'stopped'}`);
            });
    }

    async handleWithLock(fn) {
        if (this.locks) return;

        this.locks = true;
        try {
            await fn();
        } catch (error) {
            this.emit('error', `Inpulse generator error: ${error}`);
        } finally {
            this.locks = false;
        }
    }

    async prepareInputs(devInfo, generation, zone, inputs, zoneCapabilities, getInputsFromDevice, getFavoritesFromDevice, getQuickSmartSelectFromDevice, supportFavorites, supportShortcut, supportQuickSmartSelect) {
        try {
            const tempInputs = [];

            // Add inputs from avr or config
            if (Array.isArray(inputs)) {
                inputs.forEach((input, i) => {
                    const inputNameOld = (getInputsFromDevice && generation === 0) ? (devInfo.RenameSource.value[i]?.trim() || inputs[i]) : `Input ${i}`;
                    const inputName = getInputsFromDevice ? { 0: inputNameOld, 1: input.DefaultName, 2: input.DefaultName }[generation] : input.name;
                    const inputReference = getInputsFromDevice ? { 0: input, 1: input.FuncName, 2: input.FuncName }[generation] : input.reference;

                    if (inputName && inputReference) {
                        tempInputs.push({ name: inputName, reference: inputReference });
                    }
                });
            }

            // Add shortcuts (only category 4: Inputs)
            if (getInputsFromDevice && supportShortcut) {
                const shortcuts = zoneCapabilities?.ShortcutControl?.EntryList?.Shortcut || [];
                shortcuts.forEach(({ Category, DispName, FuncName }) => {
                    if (Category === '4' && DispName && FuncName) {
                        tempInputs.push({ name: DispName, reference: FuncName });
                    }
                });
            }

            // Add favorites
            if (getFavoritesFromDevice && supportFavorites) {
                const favorites = devInfo?.DeviceCapabilities?.Operation?.Favorites || [];
                favorites.forEach(({ DispName, FuncName }) => {
                    if (DispName && FuncName) {
                        tempInputs.push({ name: DispName, reference: FuncName });
                    }
                });
            }

            // Add quick & smart selects
            if (getQuickSmartSelectFromDevice && supportQuickSmartSelect) {
                const quick = zoneCapabilities?.Operation?.QuickSelect || {};
                const count = quick.MaxQuickSelect || 0;
                for (let j = 0; j < count; j++) {
                    const qs = quick[`QuickSelect${j + 1}`];
                    if (qs?.Name && qs?.FuncName) {
                        tempInputs.push({ name: qs.Name, reference: qs.FuncName });
                    }
                }
            }

            // Process all inputs (remove duplicates + set mode)
            const allInputs = [];
            for (const { name, reference } of tempInputs) {
                if (!name || !reference) continue;

                let inputReference = INPUTS_CONVERSION_KEYS.includes(reference) ? InputConversion[reference] : reference;
                const inputMode = 0;
                let zonePrefix = ZonePrefixMap[zone] ?? 'SI';

                if (zone === 0 || zone === 4) {
                    const sub5 = inputReference.substring(0, 5);
                    const sub2 = inputReference.substring(0, 2);

                    if (sub2 in InputMode) {
                        inputReference = inputReference.substring(3);
                        zonePrefix = InputMode[sub2];
                    } else if (sub5 in InputMode) {
                        zonePrefix = InputMode[sub5];
                    }
                }

                if (!allInputs.some(inp => inp.reference === inputReference)) {
                    allInputs.push({ name, reference: inputReference, mode: inputMode, zonePrefix });
                }
            }

            // Save inputs
            await this.functions.saveData(this.inputsFile, allInputs);

            return allInputs;
        } catch (error) {
            throw new Error(`Get inputs error: ${error}`);
        }
    }

    async getPictureMode() {
        try {
            const { data: picData } = await this.axiosInstance.post(ApiUrls.AppCommand, BodyXml.GetPictureMode);
            const parsed = this.parseString.parse(picData);
            if (this.logDebug) this.emit('debug', `Picture mode: ${JSON.stringify(parsed, null, 2)}`);

            const pictureMode = parsed.rx.cmd.value;
            return pictureMode;
        } catch (error) {
            this.emit('error', `Get picture mode error: ${error}`);
        }
    }

    async getAudysseyMode() {
        try {
            const { data: audData } = await this.axiosInstance.post(ApiUrls.AppCommand, BodyXml.GetAudyssey);
            const parsed = this.parseString.parse(audData);
            if (this.logDebug) this.emit('debug', `Audyssey mode: ${JSON.stringify(parsed, null, 2)}`);

            const audysseyMode = parsed.rx.cmd.value;
            return audysseyMode;
        } catch (error) {
            this.emit('error', `Get audyssey mode error: ${error}`);
        }
    }

    async getSoundMode() {
        try {
            const { data: sndData } = await this.axiosInstance.post(ApiUrls.AppCommand, BodyXml.GetSurroundModeStatus);
            const parsed = this.parseString.parse(sndData);
            if (this.logDebug) this.emit('debug', `Sound mode: ${JSON.stringify(parsed, null, 2)}`);

            const raw = parsed.rx.cmd.surround.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            const soundMode = SOUND_MODES_CONVERSION_KEYS.includes(raw) ? SoundModeConversion[raw] : raw;
            return soundMode;
        } catch (error) {
            this.emit('error', `Get sound mode error: ${error}`);
        }
    }

    async checkState() {
        try {
            // Get zones status
            const zoneStateUrl = [ApiUrls.MainZoneStatusLite, ApiUrls.Zone2StatusLite, ApiUrls.Zone3StatusLite, ApiUrls.SoundModeStatus, ApiUrls.MainZoneStatusLite][this.zone];
            const { data } = await this.axiosInstance.get(zoneStateUrl);
            const devState = this.parseString.parse(data).item;
            if (this.logDebug) this.emit('debug', `State: ${JSON.stringify(devState, null, 2)}`);

            // Receiver status
            const power = devState.Power.value === 'ON';
            const inputRaw = devState.InputFuncSelect.value;
            const input = INPUTS_CONVERSION_KEYS.includes(inputRaw) ? InputConversion[inputRaw] : inputRaw;

            const volume = devState.MasterVolume.value >= -79.5 ? devState.MasterVolume.value : -80;
            const volumeDisplay = devState.VolumeDisplay?.value ?? false;
            const mute = devState.Mute.value === 'on';

            // Picture mode
            const pictureMode = this.info.supportPictureMode && power ? await this.getPictureMode() : this.pictureMode;

            // Sound mode
            const soundMode = this.info.supportSoundMode && power ? await this.getSoundMode() : this.soundMode;

            // Audyssey mode (disabled for now)
            const audysseyMode = this.audysseyMode;

            // Reference ---
            const reference = [input, input, input, soundMode, input][this.zone];

            // REST & MQTT events
            if (this.zone < 3) {
                this.emit('restFul', 'state', devState);
                this.emit('mqtt', 'State', devState);

                if (this.info.supportPictureMode && power) {
                    const payload = { 'Picture Mode': PictureModesDenonNumber[pictureMode] };
                    this.emit('restFul', 'picture', payload);
                    this.emit('mqtt', 'Picture', payload);
                }

                if (this.info.supportSoundMode && power) {
                    const payload = { 'Sound Mode': soundMode };
                    this.emit('restFul', 'surround', payload);
                    this.emit('mqtt', 'Surround', payload);
                }
            }

            // Update only if value changed
            if (power === this.power && reference === this.reference && volume === this.volume && volumeDisplay === this.volumeDisplay && mute === this.mute && pictureMode === this.pictureMode && soundMode === this.soundMode && audysseyMode === this.audysseyMode) return;

            this.power = power;
            this.reference = reference;
            this.volume = volume;
            this.volumeDisplay = volumeDisplay;
            this.mute = mute;
            this.pictureMode = pictureMode;
            this.soundMode = soundMode;
            this.audysseyMode = audysseyMode;

            this.emit('stateChanged', power, reference, volume, volumeDisplay, mute, pictureMode);

            return true;
        } catch (error) {
            throw new Error(`Check state error: ${error}`);
        }
    }

    async connect() {
        try {
            // Fetch & parse device info

            const deviceInfoUrl = [ApiUrls.DeviceInfoGen0, ApiUrls.DeviceInfoGen1, ApiUrls.DeviceInfoGen2][this.generation];
            const deviceInfo = await this.axiosInstance.get(deviceInfoUrl);
            const parseData = this.parseString.parse(deviceInfo.data);

            const generationMap = {
                0: parseData.item,
                1: parseData.Device_Info,
                2: parseData.Device_Info
            };
            const devInfo = generationMap[this.generation];
            if (this.logDebug) this.emit('debug', `Connect data: ${JSON.stringify(devInfo, null, 2)}`);

            // Device info keys
            const keys = Object.keys(devInfo);

            const info = {
                manufacturer: ManufacturerMap[devInfo.BrandCode ?? 2],
                modelName: devInfo.ModelName || devInfo.FriendlyName?.value || 'AV Receiver',
                serialNumber: devInfo.MacAddress?.toString() || `1234567654321${this.host}`,
                firmwareRevision: devInfo.UpgradeVersion?.toString() || '00',
                deviceZones: devInfo.DeviceZones ?? 1,
                apiVersion: devInfo.CommApiVers || '000',
                controlZone: ZoneName[this.zone]
            };

            // Capabilities
            const caps = devInfo.DeviceCapabilities || {};
            const setup = caps.Setup || {};
            info.supportPictureMode = this.zone === 0 && setup.PictureMode?.Control === 1;
            info.supportSoundMode = (this.zone === 0 || this.zone === 3) && setup.SoundMode?.Control === 1;
            this.info = info;

            // Zone capabilities
            let zoneCaps = {};
            if (this.zone !== 3 && keys.includes('DeviceZoneCapabilities')) {
                const zones = Array.isArray(devInfo.DeviceZoneCapabilities) ? devInfo.DeviceZoneCapabilities : [devInfo.DeviceZoneCapabilities];
                const zone = this.zone === 4 ? 0 : this.zone;
                zoneCaps = zones[zone] || {};
            }

            // Inputs
            const inputsOldDevice = this.generation === 0 && devInfo.InputFuncList?.value ? devInfo.InputFuncList.value : [];
            const inputsNewDevice = zoneCaps.InputSource?.List?.Source || [];

            const inputsMap = {
                0: inputsOldDevice,
                1: inputsNewDevice,
                2: inputsNewDevice
            };
            const inputs = this.getInputsFromDevice ? inputsMap[this.generation] : this.inputs;
            const allInputs = await this.prepareInputs(devInfo, this.generation, this.zone, inputs, zoneCaps, this.getInputsFromDevice, this.getFavoritesFromDevice, this.getQuickSmartSelectFromDevice, caps.Operation?.Favorites?.Control === 1, zoneCaps.ShortcutControl?.Control === 1, zoneCaps.Operation?.QuickSelect?.Control === 1);

            //  Success event
            if (this.firstRun) {
                await this.functions.saveData(this.devInfoFile, info);
                this.emit('success', `Connected success`);
                this.emit('deviceInfo', info);
                this.firstRun = false;
            }

            // Emit inputs
            this.emit('addRemoveOrUpdateInput', allInputs, false);

            // REST & MQTT events
            if (this.zone < 3) {
                this.emit('restFul', 'info', devInfo);
                this.emit('mqtt', 'Info', devInfo);
            }

            return true;
        } catch (error) {
            throw new Error(`Connect error: ${error}`);
        }
    }

    async send(command) {
        try {
            const path = `${ApiUrls.iPhoneDirect}${command}`;
            await this.axiosInstance.get(path);
            if (this.logDebug) this.emit('debug', `Send path: ${path}`);
            return true;
        } catch (error) {
            throw new Error(`Send data error: ${error}`);
        }
    }
}
export default Denon;
