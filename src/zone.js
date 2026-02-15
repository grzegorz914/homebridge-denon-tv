import EventEmitter from 'events';
import Functions from './functions.js';
import { XMLParser, XMLBuilder, XMLValidator } from 'fast-xml-parser';
import { ApiUrls, InputConversion, SoundModeConversion, BodyXml, PictureModesDenonNumber, InputMode, ZoneName, ZonePrefixMap } from './constants.js';
const INPUTS_CONVERSION_KEYS = Object.keys(InputConversion);
const SOUND_MODES_CONVERSION_KEYS = Object.keys(SoundModeConversion);

class Zone extends EventEmitter {
    constructor(denon, device, inputsFile, restFulEnabled, mqttEnabled) {
        super();
        this.host = device.host;
        this.generation = device.generation || 0;
        this.zoneControl = device.zoneControl;
        this.getInputsFromDevice = this.zoneControl !== 3 && device.inputs?.getFromDevice || false;
        this.getFavoritesFromDevice = this.zoneControl < 3 && this.generation > 0 && device.inputs?.getFavoritesFromDevice || false;
        this.getQuickSmartSelectFromDevice = this.zoneControl < 3 && this.generation > 0 && device.inputs?.getQuickSmartSelectFromDevice || false;
        this.inputs = this.zoneControl === 3 ? (device.surrounds?.data || []) : (device.inputs?.data || []);
        this.logDebug = device.log?.debug || false;
        this.inputsFile = inputsFile;
        this.client = denon.client;

        this.restFulEnabled = restFulEnabled;
        this.mqttEnabled = mqttEnabled;

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

        denon.on('denonInfo', async (denonInfo) => {
            try {
                await this.checkInfo(denonInfo);
            } catch (error) {
                this.emit('error', error);
            }
        }).on('checkState', async () => {
            try {
                await this.checkState();
            } catch (error) {
                this.emit('error', error);
            }
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

    async prepareInputs(denonInfo, generation, zoneControl, inputs, zoneCaps, getInputsFromDevice, getFavoritesFromDevice, getQuickSmartSelectFromDevice, supportFavorites, supportShortcuts, supportQuickSmartSelect) {
        try {
            const tempInputs = [];

            // Add inputs from avr or config
            if (Array.isArray(inputs)) {
                inputs.forEach((input, i) => {
                    const inputNameOld = (getInputsFromDevice && generation === 0) ? (denonInfo.RenameSource.value[i]?.trim() || inputs[i]) : `Input ${i}`;
                    const inputName = getInputsFromDevice ? { 0: inputNameOld, 1: input.DefaultName, 2: input.DefaultName }[generation] : input.name;
                    const inputReference = getInputsFromDevice ? { 0: input, 1: input.FuncName, 2: input.FuncName }[generation] : input.reference;

                    if (inputName && inputReference) {
                        tempInputs.push({ name: inputName, reference: inputReference });
                    }
                });
            }

            // Add shortcuts (only category 4: Inputs)
            if (getInputsFromDevice && supportShortcuts) {
                const shortcuts = zoneCaps?.ShortcutControl?.EntryList?.Shortcut || [];
                shortcuts.forEach(({ Category, DispName, FuncName }) => {
                    if (Category === '4' && DispName && FuncName) {
                        tempInputs.push({ name: DispName, reference: FuncName });
                    }
                });
            }

            // Add favorites
            if (getFavoritesFromDevice && supportFavorites) {
                const favorites = denonInfo?.DeviceCapabilities?.Operation?.Favorites || [];
                favorites.forEach(({ DispName, FuncName }) => {
                    if (DispName && FuncName) {
                        tempInputs.push({ name: DispName, reference: FuncName });
                    }
                });
            }

            // Add quick & smart selects
            if (getQuickSmartSelectFromDevice && supportQuickSmartSelect) {
                const quick = zoneCaps?.Operation?.QuickSelect || {};
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
                let zonePrefix = ZonePrefixMap[zoneControl] ?? 'SI';

                if (zoneControl === 0 || zoneControl === 4) {
                    const sub5 = inputReference.substring(0, 5);
                    const sub2 = inputReference.substring(0, 2);

                    if (sub2 in InputMode) {
                        inputReference = inputReference.substring(3);
                        zonePrefix = InputMode[sub2];
                    } else if (sub5 in InputMode) {
                        zonePrefix = InputMode[sub5];
                    }
                }

                if (allInputs.some(inp => inp.reference === inputReference)) continue;
                allInputs.push({ name, reference: inputReference, mode: inputMode, zonePrefix });
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
            const { data: picData } = await this.client.post(ApiUrls.AppCommand, BodyXml.GetPictureMode);
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
            const { data: audData } = await this.client.post(ApiUrls.AppCommand, BodyXml.GetAudyssey);
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
            const { data: sndData } = await this.client.post(ApiUrls.AppCommand, BodyXml.GetSurroundModeStatus);
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
            const zoneStateUrl = [ApiUrls.MainZoneStatusLite, ApiUrls.Zone2StatusLite, ApiUrls.Zone3StatusLite, ApiUrls.SoundModeStatus, ApiUrls.MainZoneStatusLite][this.zoneControl];
            const { data } = await this.client.get(zoneStateUrl);
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
            const reference = [input, input, input, soundMode, input][this.zoneControl];

            // REST & MQTT events
            if (this.zoneControl < 3) {
                if (this.restFulEnabled) this.emit('restFul', 'state', devState);
                if (this.mqttEnabled) this.emit('mqtt', 'State', devState);

                if (this.info.supportPictureMode && power) {
                    const payload = { 'Picture Mode': PictureModesDenonNumber[pictureMode] };
                    if (this.restFulEnabled) this.emit('restFul', 'picture', payload);
                    if (this.mqttEnabled) this.emit('mqtt', 'Picture', payload);
                }

                if (this.info.supportSoundMode && power) {
                    const payload = { 'Sound Mode': soundMode };
                    if (this.restFulEnabled) this.emit('restFul', 'surround', payload);
                    if (this.mqttEnabled) this.emit('mqtt', 'Surround', payload);
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

    async checkInfo(denonInfo) {
        try {
            // Capabilities
            denonInfo.info.supportPictureMode = this.zoneControl === 0 && denonInfo.info.supportPictureMode;
            denonInfo.info.supportSoundMode = (this.zoneControl === 0 || this.zoneControl === 3) && denonInfo.info.supportSoundMode;
            denonInfo.info.supportFavorites = this.zoneControl < 3 && denonInfo.info.supportFavorites;

            // Zone capabilities
            const keys = Object.keys(denonInfo);
            let zoneCaps = {};
            if (this.zoneControl !== 3 && keys.includes('DeviceZoneCapabilities')) {
                const zones = Array.isArray(denonInfo.DeviceZoneCapabilities) ? denonInfo.DeviceZoneCapabilities : [denonInfo.DeviceZoneCapabilities];
                const zone = this.zoneControl === 4 ? 0 : this.zoneControl;
                zoneCaps = zones[zone] || {};
            }
            denonInfo.info.supportShortcuts = zoneCaps.ShortcutControl?.Control === 1;
            denonInfo.info.supportQuickSelect = zoneCaps.Operation?.QuickSelect?.Control === 1;
            denonInfo.info.controlZone = ZoneName[this.zoneControl];
            this.info = denonInfo.info;

            //  Success event
            if (this.firstRun) {
                this.emit('deviceInfo', denonInfo.info);
                this.firstRun = false;
            }

            // Inputs
            const inputsOldDevice = this.generation === 0 && denonInfo.InputFuncList?.value ? denonInfo.InputFuncList.value : [];
            const inputsNewDevice = zoneCaps.InputSource?.List?.Source || [];

            const inputsMap = {
                0: inputsOldDevice,
                1: inputsNewDevice,
                2: inputsNewDevice
            };
            const inputs = this.getInputsFromDevice ? inputsMap[this.generation] : this.inputs;
            const allInputs = await this.prepareInputs(denonInfo, this.generation, this.zoneControl, inputs, zoneCaps, this.getInputsFromDevice, this.getFavoritesFromDevice, this.getQuickSmartSelectFromDevice, denonInfo.info.supportFavorites, denonInfo.info.supportShortcuts, denonInfo.info.supportQuickSelect);

            // Emit inputs
            this.emit('addRemoveOrUpdateInput', allInputs, false);

            // REST & MQTT events
            if (this.zoneControl < 3) {
                if (this.restFulEnabled) this.emit('restFul', 'info', denonInfo);
                if (this.mqttEnabled) this.emit('mqtt', 'Info', denonInfo);
            }

            return true;
        } catch (error) {
            throw new Error(`Zone connect error: ${error}`);
        }
    }
}
export default Zone;
