import { promises as fsPromises } from 'fs';
import axios from 'axios';
import { Agent } from 'https';
import EventEmitter from 'events';
import ImpulseGenerator from './impulsegenerator.js';
import { XMLParser, XMLBuilder, XMLValidator } from 'fast-xml-parser';
import { ApiUrls, InputConversion, SoundModeConversion, BodyXml, PictureModesDenonNumber, InputMode, ZoneName } from './constants.js';
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
        this.enableDebugLog = config.enableDebugLog;
        this.deviceInfoUrl = [ApiUrls.DeviceInfoGen0, ApiUrls.DeviceInfoGen1, ApiUrls.DeviceInfoGen2][this.generation];
        this.zoneStateUrl = [ApiUrls.MainZoneStatusLite, ApiUrls.Zone2StatusLite, ApiUrls.Zone3StatusLite, ApiUrls.SoundModeStatus, ApiUrls.MainZoneStatusLite][this.zone];

        const baseUrl = `http://${host}:${port}`;
        const commonConfig = {
            baseURL: baseUrl,
            timeout: 10000,
            maxContentLength: 100000000,
            maxBodyLength: 1000000000,
        };

        const httpsConfig = this.generation === 2 ? { httpsAgent: new Agent({ rejectUnauthorized: false }) } : {};
        this.axiosInstance = axios.create({
            ...commonConfig,
            method: 'GET',
            ...httpsConfig,
        });

        this.axiosInstancePost = axios.create({
            ...commonConfig,
            method: 'POST',
            ...httpsConfig,
        });

        const options = {
            ignoreAttributes: false,
            ignorePiTags: true,
            allowBooleanAttributes: true
        };
        this.parseString = new XMLParser(options);

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

        this.call = false;
        this.impulseGenerator = new ImpulseGenerator()
            .on('connect', async () => {
                try {
                    if (this.call) return;

                    this.call = true;
                    await this.connect();
                    this.call = false;
                } catch (error) {
                    this.call = false;
                    this.emit('error', `Inpulse generator error: ${error}`);
                };
            })
            .on('checkState', async () => {
                try {
                    if (this.call) return;

                    this.call = true;
                    await this.checkState();
                    this.call = false;
                } catch (error) {
                    this.call = false;
                    this.emit('error', `Inpulse generator error: ${error}`);
                };
            })
            .on('state', (state) => {
                this.emit('success', `Impulse generator ${state ? 'started' : 'stopped'}`);
            });
    }

    async connect() {
        try {
            // Fetch & parse device info
            const deviceInfo = await this.axiosInstance(this.deviceInfoUrl);
            const parseData = this.parseString.parse(deviceInfo.data);

            const generationMap = {
                0: parseData.item,
                1: parseData.Device_Info,
                2: parseData.Device_Info
            };
            const devInfo = generationMap[this.generation];

            if (this.enableDebugLog) this.emit('debug', `Connect data: ${JSON.stringify(devInfo, null, 2)}`);

            // Device info keys ---
            const keys = Object.keys(devInfo);

            // Base device info
            const manufacturerMap = {
                0: 'Denon',
                1: 'Marantz',
                2: 'Denon/Marantz'
            };
            const info = {
                manufacturer: manufacturerMap[devInfo.BrandCode ?? 2],
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
            info.supportPictureMode = setup.PictureMode?.Control === 1;
            info.supportSoundMode = setup.SoundMode?.Control === 1;
            this.info = info;

            // Zone capabilities
            let zoneCaps = {};
            if (this.zone < 3 && keys.includes('DeviceZoneCapabilities')) {
                const zones = Array.isArray(devInfo.DeviceZoneCapabilities) ? devInfo.DeviceZoneCapabilities : [devInfo.DeviceZoneCapabilities];
                zoneCaps = zones[this.zone] || {};
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
            const allInputs = await this.prepareInputs(devInfo, this.generation, this.zone, inputs, zoneCaps, this.getInputsFromDevice, this.getFavoritesFromDevice, this.getQuickSmartSelectFromDevice, caps.Operation?.Favorites?.Control === 1, zoneCaps.ShortcutControl?.Control === 1, zoneCaps.Operation?.QuickSelect?.Control === 1
            );

            //  Success event
            if (this.firstRun) {
                await this.saveData(this.devInfoFile, info);
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

    async checkState() {
        try {
            // Get zones status
            const { data } = await this.axiosInstance(this.zoneStateUrl);
            const devState = this.parseString.parse(data).item;
            if (this.enableDebugLog) this.emit('debug', `State: ${JSON.stringify(devState, null, 2)}`);

            // Receiver status
            const power = devState.Power.value === 'ON';
            const inputRaw = devState.InputFuncSelect.value;
            const input = INPUTS_CONVERSION_KEYS.includes(inputRaw) ? InputConversion[inputRaw] : inputRaw;

            const volume = devState.MasterVolume.value >= -79.5 ? devState.MasterVolume.value : -80;
            const volumeDisplay = devState.VolumeDisplay?.value ?? false;
            const mute = devState.Mute.value === 'on';

            // Picture mode
            let pictureMode = this.pictureMode;
            if (this.info.supportPictureMode && power && this.zone === 0) {
                const { data: picData } = await this.axiosInstancePost(ApiUrls.AppCommand, BodyXml.GetPictureMode);
                const parsed = this.parseString.parse(picData);
                if (this.enableDebugLog) this.emit('debug', `Picture mode: ${JSON.stringify(parsed, null, 2)}`);
                pictureMode = parsed.rx.cmd.value;
            }

            // Sound mode
            let soundMode = this.soundMode;
            if (this.info.supportSoundMode && power && (this.zone === 0 || this.zone === 3)) {
                const { data: sndData } = await this.axiosInstancePost(ApiUrls.AppCommand, BodyXml.GetSurroundModeStatus);
                const parsed = this.parseString.parse(sndData);
                if (this.enableDebugLog) this.emit('debug', `Sound mode: ${JSON.stringify(parsed, null, 2)}`);

                const raw = parsed.rx.cmd.surround.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                soundMode = SOUND_MODES_CONVERSION_KEYS.includes(raw) ? SoundModeConversion[raw] : raw;
            }

            // Audyssey mode (disabled for now)
            const audysseyMode = this.audysseyMode;

            // Reference ---
            const reference = [input, input, input, soundMode, input][this.zone];

            // REST & MQTT events
            if (this.zone < 3) {
                this.emit('restFul', 'state', devState);
                this.emit('mqtt', 'State', devState);

                if (this.info.supportPictureMode && power && this.zone === 0) {
                    const payload = { 'Picture Mode': PictureModesDenonNumber[pictureMode] };
                    this.emit('restFul', 'picture', payload);
                    this.emit('mqtt', 'Picture', payload);
                }

                if (this.info.supportSoundMode && power && (this.zone === 0 || this.zone === 3)) {
                    const payload = { 'Sound Mode': soundMode };
                    this.emit('restFul', 'surround', payload);
                    this.emit('mqtt', 'Surround', payload);
                }
            }

            // Update only if value changed
            if (power === this.power && reference === this.reference && volume === this.volume && volumeDisplay === this.volumeDisplay && mute === this.mute && pictureMode === this.pictureMode && soundMode === this.soundMode) return;

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

                const zonePrefixMap = {
                    0: 'SI',
                    1: 'Z2',
                    2: 'Z3',
                    3: 'MS',
                    4: 'SI'
                };
                let zonePrefix = zonePrefixMap[zone] ?? 'SI';

                if (zone === 0) {
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

            const finalInputs = allInputs.length > 0 ? allInputs : [{
                name: this.zone === 3 ? 'STEREO' : 'CBL/SAT',
                reference: this.zone === 3 ? 'STEREO' : 'SAT/CBL',
                mode: ['SI', 'Z2', 'Z3', 'MS', 'SI'][this.zone] ?? 'SI'
            }];

            // Save inputs
            await this.saveData(this.inputsFile, finalInputs);

            return finalInputs;
        } catch (error) {
            throw new Error(`Get inputs error: ${error}`);
        }
    }

    async saveData(path, data) {
        try {
            data = JSON.stringify(data, null, 2);
            await fsPromises.writeFile(path, data);
            if (this.enableDebugLog) this.emit('debug', `Saved data: ${data}`);
            return true;
        } catch (error) {
            throw new Error(`Save data error: ${error}`);
        }
    }

    async send(command) {
        try {
            const path = `${ApiUrls.iPhoneDirect}${command}`;
            await this.axiosInstance(path);
            if (this.enableDebugLog) this.emit('debug', `Send path: ${path}`);
            return true;
        } catch (error) {
            throw new Error(`Send data error: ${error}`);
        }
    }
}
export default Denon;
