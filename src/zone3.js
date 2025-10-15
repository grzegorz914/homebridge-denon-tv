import EventEmitter from 'events';
import Mqtt from './mqtt.js';
import RestFul from './restful.js';
import Denon from './denon.js';
import Functions from './functions.js';
import { PictureModesConversionToHomeKit, PictureModesDenonNumber } from './constants.js';
let Accessory, Characteristic, Service, Categories, Encode, AccessoryUUID;

class Zone3 extends EventEmitter {
    constructor(api, device, name, host, port, generation, zone, devInfoFile, inputsFile, inputsNamesFile, inputsTargetVisibilityFile) {
        super();

        Accessory = api.platformAccessory;
        Characteristic = api.hap.Characteristic;
        Service = api.hap.Service;
        Categories = api.hap.Categories;
        Encode = api.hap.encode;
        AccessoryUUID = api.hap.uuid;

        //device configuration
        this.name = name;
        this.host = host;
        this.port = port;
        this.generation = generation;
        this.zone = zone;
        this.getInputsFromDevice = device.inputs?.getFromDevice || false;
        this.getFavoritesFromDevice = device.inputs?.getFavoritesFromDevice || false;
        this.getQuickSmartSelectFromDevice = device.inputs?.getQuickSmartSelectFromDevice || false;
        this.inputsDisplayOrder = device.inputs?.displayOrder || 0;
        this.inputs = device.inputs?.data || [];
        this.buttons = (device.buttonsZ3 || []).filter(button => (button.displayType ?? 0) > 0);
        this.sensorPower = device.sensors?.power || false;
        this.sensorVolume = device.sensors?.volume || false
        this.sensorMute = device.sensors?.mute || false;
        this.sensorInput = device.sensors?.input || false;
        this.sensorInputs = (device.sensors?.inputs || []).filter(sensor => (sensor.displayType ?? 0) > 0);
        this.powerControlZone = device.power?.zone || 0;
        this.volumeControl = device.volume?.displayType || 0;
        this.volumeControlZone = device.volume?.zone || 0;
        this.volumeControlName = device.volume?.name || 'Volume';
        this.volumeControlNamePrefix = device.volume?.namePrefix || false;
        this.volumeControlMax = device.volume?.max || 100;
        this.logInfo = device.log?.info || false;
        this.logWarn = device.log?.warn || true;
        this.logDebug = device.log?.debug || false;
        this.infoButtonCommand = device.infoButtonCommand || 'MNINF';
        this.refreshInterval = (device.refreshInterval ?? 5) * 1000;
        this.devInfoFile = devInfoFile;
        this.inputsFile = inputsFile;
        this.inputsNamesFile = inputsNamesFile;
        this.inputsTargetVisibilityFile = inputsTargetVisibilityFile;

        //external integration
        this.restFul = device.restFul || {};
        this.restFulConnected = false;
        this.mqtt = device.mqtt || {};
        this.mqttConnected = false;

        //sensors
        for (const sensor of this.sensorInputs) {
            sensor.name = button.name || 'Sensor Input';
            sensor.serviceType = ['', Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][sensor.displayType];
            sensor.characteristicType = ['', Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][sensor.displayType];
            sensor.state = false;
        }

        //buttons
        for (const button of this.buttons) {
            button.name = button.name || 'Button';
            button.serviceType = ['', Service.Outlet, Service.Switch][button.displayType];
            button.state = false;
        }

        //variable
        this.functions = new Functions();
        this.inputIdentifier = 1;
        this.power = false;
        this.reference = '';
        this.volume = 0;
        this.volumeDisplay = false;
        this.mute = false;
        this.mediaState = false;
        this.sensorVolumeState = false;
        this.sensorInputState = false;
    }

    async startImpulseGenerator() {
        try {
            //start impulse generator 
            await this.denon.impulseGenerator.start([{ name: 'connect', sampling: 73000 }, { name: 'checkState', sampling: this.refreshInterval }]);
            return true;
        } catch (error) {
            throw new Error(`Impulse generator start error: ${error}`);
        }
    }

    async stateControl(type, value) {
        try {
            // Normalize value for Power type
            value = this.powerControlZone === 7 && type === 'Power' && value === 'OFF' ? 'STANDBY' : value;

            // Define main zone
            const mainZone = type === 'Power' ? 'ZM' : (type === 'Volume' || type === 'VolumeSelector') ? 'MV' : 'MU';
            const zoneMap = {
                0: [mainZone],
                1: ['Z2'],
                2: ['Z3'],
                3: ['Z2', 'Z3'],
                4: [mainZone, 'Z2'],
                5: [mainZone, 'Z3'],
                6: [mainZone, 'Z2', 'Z3'],
                7: ['PW']
            };

            // Reuse volume control zones for better readability
            const typeMap = {
                'Power': zoneMap[this.powerControlZone],
                'VolumeSelector': zoneMap[this.volumeControlZone],
                'Volume': zoneMap[this.volumeControlZone],
                'Mute': zoneMap[this.volumeControlZone]
            };

            // Get the commands for the specified type
            const commands = typeMap[type];
            if (commands) {
                const commandsCount = commands.length;
                for (let i = 0; i < commandsCount; i++) {
                    const cmd = type === 'Mute' && commands[i] !== 'MU' ? `${commands[i]}MU` : commands[i];
                    await this.denon.send(`${cmd}${value}`);
                    const pauseTime = type === 'Power' && value === 'ON' && commandsCount > 1 && i === 0 ? 4000 : 75;
                    const pause = i < commandsCount - 1 ? await new Promise(resolve => setTimeout(resolve, pauseTime)) : false;
                }
            } else {
                if (this.logWarn) this.emit('warn', `Unknown control type: ${type}`);
            }

            return true;
        } catch (error) {
            if (this.logWarn) this.emit('warn', `State control error for type ${type} with value ${value}: ${error}`);
        }
    }

    async setOverExternalIntegration(integration, key, value) {
        try {
            let set = false
            switch (key) {
                case 'Power':
                    const powerState = value ? 'ON' : 'OFF';
                    set = await this.stateControl('Power', powerState);
                    break;
                case 'Input':
                    const input = `Z2${value}`;
                    set = await this.denon.send(input);
                    break;
                case 'Surround':
                    const surround = `MS${value}`;
                    set = await this.denon.send(surround);
                    break;
                case 'Volume':
                    const volume = (value < 0 || value > 100) ? this.volume : (value < 10 ? `0${value}` : value);
                    set = await this.stateControl('Volume', volume);
                    break;
                case 'Mute':
                    const mute = value ? 'ON' : 'OFF';
                    set = await this.stateControl('Mute', mute);
                    break;
                case 'RcControl':
                    set = await this.denon.send(value);
                    break;
                default:
                    this.emit('warn', `${integration}, received key: ${key}, value: ${value}`);
                    break;
            };
            return set;
        } catch (error) {
            throw new Error(`${integration} set key: ${key}, value: ${value}, error: ${error}`);
        }
    }

    async prepareDataForAccessory() {
        try {
            //read dev info from file
            const savedInfo = await this.functions.readData(this.devInfoFile);
            this.savedInfo = savedInfo.toString().trim() !== '' ? JSON.parse(savedInfo) : {};
            if (this.logDebug) this.emit('debug', `Read saved Info: ${JSON.stringify(this.savedInfo, null, 2)}`);

            //read inputs file
            const savedInputs = await this.functions.readData(this.inputsFile);
            this.savedInputs = savedInputs.toString().trim() !== '' ? JSON.parse(savedInputs) : [];
            if (!this.logDebug) this.emit('debug', `Read saved Inputs: ${JSON.stringify(this.savedInputs, null, 2)}`);

            //read inputs names from file
            const savedInputsNames = await this.functions.readData(this.inputsNamesFile);
            this.savedInputsNames = savedInputsNames.toString().trim() !== '' ? JSON.parse(savedInputsNames) : {};
            if (this.logDebug) this.emit('debug', `Read saved Inputs Names: ${JSON.stringify(this.savedInputsNames, null, 2)}`);

            //read inputs visibility from file
            const savedInputsTargetVisibility = await this.functions.readData(this.inputsTargetVisibilityFile);
            this.savedInputsTargetVisibility = savedInputsTargetVisibility.toString().trim() !== '' ? JSON.parse(savedInputsTargetVisibility) : {};
            if (this.logDebug) this.emit('debug', `Read saved Inputs Target Visibility: ${JSON.stringify(this.savedInputsTargetVisibility, null, 2)}`);

            return true;
        } catch (error) {
            throw new Error(`Prepare data for accessory error: ${error}`);
        }
    }

    async externalIntegrations() {
        try {
            //RESTFul server
            const restFulEnabled = this.restFul.enable || false;
            if (restFulEnabled) {
                this.restFul1 = new RestFul({
                    port: this.restFul.port || 3000,
                    logWarn: this.logWarn,
                    logDebug: this.logDebug
                })
                    .on('connected', (message) => {
                        this.emit('success', message);
                        this.restFulConnected = true;
                    })
                    .on('set', async (key, value) => {
                        try {
                            await this.setOverExternalIntegration('RESTFul', key, value);
                        } catch (error) {
                            this.emit('warn', `RESTFul set error: ${error}`);
                        }
                    })
                    .on('debug', (debug) => this.emit('debug', debug))
                    .on('warn', (warn) => this.emit('warn', warn))
                    .on('error', (error) => this.emit('error', error));
            }

            //mqtt client
            const mqttEnabled = this.mqtt.enable || false;
            if (mqttEnabled) {
                this.mqtt1 = new Mqtt({
                    host: this.mqtt.host,
                    port: this.mqtt.port || 1883,
                    clientId: this.mqtt.clientId ? `${this.savedInfo.manufacturer}_${this.mqtt.clientId}_${Math.random().toString(16).slice(3)}` : `${this.savedInfo.manufacturer}_${Math.random().toString(16).slice(3)}`,
                    prefix: this.mqtt.prefix ? `${this.savedInfo.manufacturer}/${this.mqtt.prefix}/${this.name}` : `${this.savedInfo.manufacturer}/${this.name}`,
                    user: this.mqtt.auth?.user,
                    passwd: this.mqtt.auth?.passwd,
                    logWarn: this.logWarn,
                    logDebug: this.logDebug
                })
                    .on('connected', (message) => {
                        this.emit('success', message);
                        this.mqttConnected = true;
                    })
                    .on('subscribed', (message) => {
                        this.emit('success', message);
                    })
                    .on('set', async (key, value) => {
                        try {
                            await this.setOverExternalIntegration('MQTT', key, value);
                        } catch (error) {
                            this.emit('warn', `MQTT set error: ${error}`);
                        };
                    })
                    .on('debug', (debug) => this.emit('debug', debug))
                    .on('warn', (warn) => this.emit('warn', warn))
                    .on('error', (error) => this.emit('error', error));
            };

            return true;
        } catch (error) {
            this.emit('warn', `External integration start error: ${error}`);
        };
    }

    async displayOrder() {
        try {
            const sortStrategies = {
                1: (a, b) => a.name.localeCompare(b.name),
                2: (a, b) => b.name.localeCompare(a.name),
                3: (a, b) => a.reference.localeCompare(b.reference),
                4: (a, b) => b.reference.localeCompare(a.reference),
            };

            const sortFn = sortStrategies[this.inputsDisplayOrder];
            if (!sortFn) return;

            // Sort inputs in memory
            this.inputsServices.sort(sortFn);

            // Debug dump
            if (this.logDebug) {
                const orderDump = this.inputsServices.map(svc => ({ name: svc.name, reference: svc.reference, identifier: svc.identifier, }));
                this.emit('debug', `Inputs display order:\n${JSON.stringify(orderDump, null, 2)}`);
            }

            // Update DisplayOrder characteristic (base64 encoded)
            const displayOrder = this.inputsServices.map(svc => svc.identifier);
            const encodedOrder = Encode(1, displayOrder).toString('base64');
            this.televisionService.updateCharacteristic(Characteristic.DisplayOrder, encodedOrder);
        } catch (error) {
            throw new Error(`Display order error: ${error}`);
        }
    }

    async addRemoveOrUpdateInput(inputs, remove = false) {
        try {
            if (!this.inputsServices) return;

            for (const input of inputs) {
                if (this.inputsServices.length >= 85 && !remove) continue;

                const inputReference = input.reference;
                const savedName = this.savedInputsNames[inputReference] ?? input.name;
                const sanitizedName = await this.functions.sanitizeString(savedName);
                const inputMode = input.mode ?? 0;
                const inputZonePrefix = input.zonePrefix;
                const inputVisibility = this.savedInputsTargetVisibility[inputReference] ?? 0;

                if (remove) {
                    const svc = this.inputsServices.find(s => s.reference === inputReference);
                    if (svc) {
                        if (this.logDebug) this.emit('debug', `Removing input: ${input.name}, reference: ${inputReference}`);
                        this.accessory.removeService(svc);
                        this.inputsServices = this.inputsServices.filter(s => s.reference !== inputReference);
                        await this.displayOrder();
                    }
                    continue;
                }

                let inputService = this.inputsServices.find(s => s.reference === inputReference);
                if (inputService) {
                    const nameChanged = inputService.name !== sanitizedName;
                    if (nameChanged) {
                        inputService.name = sanitizedName;
                        inputService
                            .updateCharacteristic(Characteristic.Name, sanitizedName)
                            .updateCharacteristic(Characteristic.ConfiguredName, sanitizedName);
                        if (this.logDebug) this.emit('debug', `Updated Input: ${input.name}, reference: ${inputReference}`);
                    }
                } else {
                    const identifier = this.inputsServices.length + 1;
                    inputService = this.accessory.addService(Service.InputSource, sanitizedName, `Input ${identifier}`);
                    inputService.identifier = identifier;
                    inputService.reference = inputReference;
                    inputService.name = sanitizedName;
                    inputService.mode = inputMode;
                    inputService.zonePrefix = inputZonePrefix;
                    inputService.visibility = inputVisibility;

                    inputService
                        .setCharacteristic(Characteristic.Identifier, identifier)
                        .setCharacteristic(Characteristic.Name, sanitizedName)
                        .setCharacteristic(Characteristic.ConfiguredName, sanitizedName)
                        .setCharacteristic(Characteristic.IsConfigured, 1)
                        .setCharacteristic(Characteristic.InputSourceType, inputMode)
                        .setCharacteristic(Characteristic.CurrentVisibilityState, inputVisibility)
                        .setCharacteristic(Characteristic.TargetVisibilityState, inputVisibility);

                    // ConfiguredName persistence
                    inputService.getCharacteristic(Characteristic.ConfiguredName)
                        .onSet(async (value) => {
                            try {
                                value = await this.functions.sanitizeString(value);
                                inputService.name = value;
                                this.savedInputsNames[inputReference] = value;
                                await this.functions.saveData(this.inputsNamesFile, this.savedInputsNames);
                                if (this.logDebug) this.emit('debug', `Saved Input: ${input.name}, reference: ${inputReference}`);
                                await this.displayOrder();
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `Save Input Name error: ${error}`);
                            }
                        });

                    // TargetVisibility persistence
                    inputService.getCharacteristic(Characteristic.TargetVisibilityState)
                        .onSet(async (state) => {
                            try {
                                inputService.visibility = state;
                                this.savedInputsTargetVisibility[inputReference] = state;
                                await this.functions.saveData(this.inputsTargetVisibilityFile, this.savedInputsTargetVisibility);
                                if (this.logDebug) this.emit('debug', `Saved Input: ${input.name}, reference: ${inputReference}, target visibility: ${state ? 'HIDDEN' : 'SHOWN'}`);
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `Save Target Visibility error: ${error}`);
                            }
                        });

                    this.inputsServices.push(inputService);
                    this.televisionService.addLinkedService(inputService);

                    if (this.logDebug) this.emit('debug', `Added Input: ${input.name}, reference: ${inputReference}`);
                }
            }

            await this.displayOrder();
            return true;
        } catch (error) {
            throw new Error(`Add/Remove/Update input error: ${error}`);
        }
    }

    //prepare accessory
    async prepareAccessory() {
        try {
            //accessory
            if (this.logDebug) this.emit('debug', `Prepare accessory`);
            const accessoryName = this.name;
            const accessoryUUID = AccessoryUUID.generate(this.savedInfo.serialNumber + this.zone);
            const accessoryCategory = Categories.AUDIO_RECEIVER;
            const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);
            this.accessory = accessory;

            //information service
            if (this.logDebug) this.emit('debug', `Prepare information service`);
            this.informationService = accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Manufacturer, this.savedInfo.manufacturer)
                .setCharacteristic(Characteristic.Model, this.savedInfo.modelName)
                .setCharacteristic(Characteristic.SerialNumber, this.savedInfo.serialNumber)
                .setCharacteristic(Characteristic.FirmwareRevision, this.savedInfo.firmwareRevision);

            //prepare television service
            if (this.logDebug) this.emit('debug', `Prepare television service`);
            this.televisionService = accessory.addService(Service.Television, `${accessoryName} Television`, 'Television');
            this.televisionService.setCharacteristic(Characteristic.ConfiguredName, accessoryName);
            this.televisionService.setCharacteristic(Characteristic.SleepDiscoveryMode, 1);

            this.televisionService.getCharacteristic(Characteristic.Active)
                .onGet(async () => {
                    const state = this.power;
                    return state;
                })
                .onSet(async (state) => {
                    if (this.power == state) {
                        return;
                    }

                    try {
                        const powerState = state ? 'ON' : 'OFF';
                        await this.stateControl('Power', powerState);
                        if (this.logInfo) this.emit('info', `set Power: ${powerState}`);
                    } catch (error) {
                        if (this.logWarn) this.emit('warn', `set Power error: ${error}`);
                    }
                });

            this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
                .onGet(async () => {
                    const inputIdentifier = this.inputIdentifier;
                    return inputIdentifier;
                })
                .onSet(async (activeIdentifier) => {
                    try {
                        const input = this.inputsServices.find(i => i.identifier === activeIdentifier);
                        if (!input) {
                            if (this.logWarn) this.emit('warn', `Input with identifier ${activeIdentifier} not found`);
                            return;
                        }

                        const { zonePrefix: zonePrefix, name: name, reference: reference } = input;

                        if (!this.power) {
                            // Schedule retry attempts without blocking Homebridge
                            this.emit('debug', `AVR is off, deferring input switch to '${activeIdentifier}'`);

                            (async () => {
                                for (let attempt = 0; attempt < 3; attempt++) {
                                    await new Promise(resolve => setTimeout(resolve, 4000));
                                    if (this.power && this.inputIdentifier !== activeIdentifier) {
                                        this.emit('debug', `AVR powered on, retrying input switch`);
                                        this.televisionService.setCharacteristic(Characteristic.ActiveIdentifier, activeIdentifier);
                                        break;
                                    }
                                }
                            })();

                            return;
                        }

                        await this.denon.send(`${zonePrefix}${reference}`);
                        if (this.logInfo) this.emit('info', `set Input Name: ${name}, Reference: ${reference}`);
                    } catch (error) {
                        if (this.logWarn) this.emit('warn', `set Input error: ${error}`);
                    }
                });

            this.televisionService.getCharacteristic(Characteristic.RemoteKey)
                .onSet(async (command) => {
                    try {
                        const rcMedia = this.inputReference === 'SPOTIFY' || this.inputReference === 'BT' || this.inputReference === 'USB/IPOD' || this.inputReference === 'NET' || this.inputReference === 'MPLAY';
                        switch (command) {
                            case Characteristic.RemoteKey.REWIND:
                                command = rcMedia ? 'NS9E' : 'MN9E';
                                break;
                            case Characteristic.RemoteKey.FAST_FORWARD:
                                command = rcMedia ? 'NS9D' : 'MN9D';
                                break;
                            case Characteristic.RemoteKey.NEXT_TRACK:
                                command = rcMedia ? 'MN9D' : 'MN9F';
                                break;
                            case Characteristic.RemoteKey.PREVIOUS_TRACK:
                                command = rcMedia ? 'MN9E' : 'MN9G';
                                break;
                            case Characteristic.RemoteKey.ARROW_UP:
                                command = rcMedia ? 'NS90' : 'MNCUP';
                                break;
                            case Characteristic.RemoteKey.ARROW_DOWN:
                                command = rcMedia ? 'NS91' : 'MNCDN';
                                break;
                            case Characteristic.RemoteKey.ARROW_LEFT:
                                command = rcMedia ? 'NS92' : 'MNCLT';
                                break;
                            case Characteristic.RemoteKey.ARROW_RIGHT:
                                command = rcMedia ? 'NS93' : 'MNENT';
                                break;
                            case Characteristic.RemoteKey.SELECT:
                                command = rcMedia ? 'NS94' : 'MNENT';
                                break;
                            case Characteristic.RemoteKey.BACK:
                                command = rcMedia ? 'MNRTN' : 'MNRTN';
                                break;
                            case Characteristic.RemoteKey.EXIT:
                                command = rcMedia ? 'MNRTN' : 'MNRTN';
                                break;
                            case Characteristic.RemoteKey.PLAY_PAUSE:
                                command = rcMedia ? (this.mediaState ? 'NS9B' : 'NS9A') : 'NS94';
                                this.mediaState = !this.mediaState;
                                break;
                            case Characteristic.RemoteKey.INFORMATION:
                                command = this.infoButtonCommand;
                                break;
                        }

                        await this.denon.send(command);
                        if (this.logInfo) this.emit('info', `set Remote Key: ${command}`);
                    } catch (error) {
                        if (this.logWarn) this.emit('warn', `set Remote Key error: ${error}`);
                    }
                });

            //prepare inputs service
            if (this.logDebug) this.emit('debug', `Prepare inputs services`);
            this.inputsServices = [];
            await this.addRemoveOrUpdateInput(this.savedInputs, false);

            //Prepare volume service
            if (this.volumeControl > 0) {
                const volumeServiceName = this.volumeControlNamePrefix ? `${accessoryName} ${this.volumeControlName}` : this.volumeControlName;
                const volumeServiceNameTv = this.volumeControlNamePrefix ? `${accessoryName} ${this.volumeControlName}` : this.volumeControlName;

                switch (this.volumeControl) {
                    case 1: //lightbulb
                        if (this.logDebug) this.emit('debug', `Prepare volume service lightbulb`);
                        this.volumeServiceLightbulb = accessory.addService(Service.Lightbulb, volumeServiceName, 'Lightbulb Speaker');
                        this.volumeServiceLightbulb.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.volumeServiceLightbulb.setCharacteristic(Characteristic.ConfiguredName, volumeServiceName);
                        this.volumeServiceLightbulb.getCharacteristic(Characteristic.Brightness)
                            .onGet(async () => {
                                const volume = this.volume;
                                return volume;
                            })
                            .onSet(async (value) => {
                                try {
                                    value = value > this.volumeControlMax ? this.volumeControlMax : value;
                                    let scaledValue = await this.functions.scaleValue(value, 0, 100, 0, 98);
                                    scaledValue = scaledValue < 10 ? `0${scaledValue}` : scaledValue;
                                    await this.stateControl('Volume', scaledValue);
                                    if (this.logInfo) this.emit('info', `set Volume: ${value}`);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `set Volume error: ${error}`);
                                }
                            });
                        this.volumeServiceLightbulb.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = this.power ? !this.mute : false;
                                return state;
                            })
                            .onSet(async (state) => {
                                try {
                                    const payload = { mute: !state };
                                    const cid = await this.lgWebOsSocket.getCid('Audio');
                                    await this.lgWebOsSocket.send('request', ApiUrls.SetMute, payload, cid);
                                    if (this.logInfo) this.emit('info', `set Mute: ${!state ? 'ON' : 'OFF'}`);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `set Mute error: ${error}`);
                                }
                            });
                        break;
                    case 2: //fan
                        if (this.logDebug) this.emit('debug', `Prepare volume service fan`);
                        this.volumeServiceFan = accessory.addService(Service.Fan, volumeServiceName, 'Fan Speaker');
                        this.volumeServiceFan.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.volumeServiceFan.setCharacteristic(Characteristic.ConfiguredName, volumeServiceName);
                        this.volumeServiceFan.getCharacteristic(Characteristic.RotationSpeed)
                            .onGet(async () => {
                                const volume = this.volume;
                                return volume;
                            })
                            .onSet(async (value) => {
                                try {
                                    value = value > this.volumeControlMax ? this.volumeControlMax : value;
                                    let scaledValue = await this.functions.scaleValue(value, 0, 100, 0, 98);
                                    scaledValue = scaledValue < 10 ? `0${scaledValue}` : scaledValue;
                                    await this.stateControl('Volume', scaledValue);
                                    if (this.logInfo) this.emit('info', `set Volume: ${value}`);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `set Volume error: ${error}`);
                                }
                            });
                        this.volumeServiceFan.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = this.power ? !this.mute : false;
                                return state;
                            })
                            .onSet(async (state) => {
                                try {
                                    const payload = { mute: !state };
                                    const cid = await this.lgWebOsSocket.getCid('Audio');
                                    await this.lgWebOsSocket.send('request', ApiUrls.SetMute, payload, cid);
                                    if (this.logInfo) this.emit('info', `set Mute: ${!state ? 'ON' : 'OFF'}`);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `set Mute error: ${error}`);
                                }
                            });
                        break;
                    case 3: // tv speaker
                        if (this.logDebug) this.emit('debug', `Prepare television speaker service`);
                        const volumeServiceName3 = this.volumeControlNamePrefix ? `${accessoryName} ${this.volumeControlName}` : this.volumeControlName;
                        this.volumeServiceTvSpeaker = accessory.addService(Service.TelevisionSpeaker, volumeServiceName3, 'TV Speaker');
                        this.volumeServiceTvSpeaker.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.ConfiguredName, volumeServiceName3);
                        this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Active)
                            .onGet(async () => {
                                const state = this.power;
                                return state;
                            })
                            .onSet(async (state) => { });
                        this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.VolumeControlType)
                            .onGet(async () => {
                                const state = 3;
                                return state;
                            });
                        this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.VolumeSelector)
                            .onSet(async (command) => {
                                try {
                                    switch (command) {
                                        case Characteristic.VolumeSelector.INCREMENT:
                                            command = 'UP';
                                            await this.stateControl('VolumeSelector', command);
                                            break;
                                        case Characteristic.VolumeSelector.DECREMENT:
                                            command = 'DOWN';
                                            await this.stateControl('VolumeSelector', command);
                                            break;
                                    }
                                    if (this.logInfo) this.emit('info', `set Volume Selector: ${command}`);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `set Volume Selector error: ${error}`);
                                };
                            });
                        this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Volume)
                            .onGet(async () => {
                                const volume = this.volume;
                                return volume;
                            })
                            .onSet(async (value) => {
                                try {
                                    value = value > this.volumeControlMax ? this.volumeControlMax : value;
                                    let scaledValue = await this.functions.scaleValue(value, 0, 100, 0, 98);
                                    scaledValue = scaledValue < 10 ? `0${scaledValue}` : scaledValue;
                                    await this.stateControl('Volume', scaledValue);
                                    if (this.logInfo) this.emit('info', `set Volume: ${value}`);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `set Volume error: ${error}`);
                                }
                            });
                        this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Mute)
                            .onGet(async () => {
                                const state = this.mute;
                                return state;
                            })
                            .onSet(async (state) => {
                                try {
                                    state = state ? 'ON' : 'OFF';
                                    await this.stateControl('Mute', state);
                                    if (this.logInfo) this.emit('info', `set Mute: ${state ? 'ON' : 'OFF'}`);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `set Mute error: ${error}`);
                                }
                            });
                        break;
                    case 4: // tv speaker + lightbulb
                        if (this.logDebug) this.emit('debug', `Prepare television speaker service`);
                        this.volumeServiceTvSpeaker = accessory.addService(Service.TelevisionSpeaker, volumeServiceNameTv, 'TV Speaker');
                        this.volumeServiceTvSpeaker.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.ConfiguredName, volumeServiceNameTv);
                        this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Active)
                            .onGet(async () => {
                                const state = this.power;
                                return state;
                            })
                            .onSet(async (state) => { });
                        this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.VolumeControlType)
                            .onGet(async () => {
                                const state = 3;
                                return state;
                            });
                        this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.VolumeSelector)
                            .onSet(async (command) => {
                                try {
                                    switch (command) {
                                        case Characteristic.VolumeSelector.INCREMENT:
                                            command = 'UP';
                                            await this.stateControl('VolumeSelector', command);
                                            break;
                                        case Characteristic.VolumeSelector.DECREMENT:
                                            command = 'DOWN';
                                            await this.stateControl('VolumeSelector', command);
                                            break;
                                    }
                                    if (this.logInfo) this.emit('info', `set Volume Selector: ${command}`);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `set Volume Selector error: ${error}`);
                                };
                            });
                        this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Volume)
                            .onGet(async () => {
                                const volume = this.volume;
                                return volume;
                            })
                            .onSet(async (value) => {
                                try {
                                    value = value > this.volumeControlMax ? this.volumeControlMax : value;
                                    let scaledValue = await this.functions.scaleValue(value, 0, 100, 0, 98);
                                    scaledValue = scaledValue < 10 ? `0${scaledValue}` : scaledValue;
                                    await this.stateControl('Volume', scaledValue);
                                    if (this.logInfo) this.emit('info', `set Volume: ${value}`);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `set Volume error: ${error}`);
                                }
                            });
                        this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Mute)
                            .onGet(async () => {
                                const state = this.mute;
                                return state;
                            })
                            .onSet(async (state) => {
                                try {
                                    state = state ? 'ON' : 'OFF';
                                    await this.stateControl('Mute', state);
                                    if (this.logInfo) this.emit('info', `set Mute: ${state ? 'ON' : 'OFF'}`);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `set Mute error: ${error}`);
                                }
                            });

                        // lightbulb
                        if (this.logDebug) this.emit('debug', `Prepare volume service lightbulb`);
                        this.volumeServiceLightbulb = accessory.addService(Service.Lightbulb, volumeServiceName, 'Lightbulb Speaker');
                        this.volumeServiceLightbulb.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.volumeServiceLightbulb.setCharacteristic(Characteristic.ConfiguredName, volumeServiceName);
                        this.volumeServiceLightbulb.getCharacteristic(Characteristic.Brightness)
                            .onGet(async () => {
                                const volume = this.volume;
                                return volume;
                            })
                            .onSet(async (value) => {
                                this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.Volume, value);
                            });
                        this.volumeServiceLightbulb.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = this.power ? !this.mute : false;
                                return state;
                            })
                            .onSet(async (state) => {
                                this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.Mute, !state);
                            });
                        break;
                    case 5: // tv speaker + fan
                        if (this.logDebug) this.emit('debug', `Prepare television speaker service`);
                        this.volumeServiceTvSpeaker = accessory.addService(Service.TelevisionSpeaker, volumeServiceNameTv, 'TV Speaker');
                        this.volumeServiceTvSpeaker.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.ConfiguredName, volumeServiceNameTv);
                        this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Active)
                            .onGet(async () => {
                                const state = this.power;
                                return state;
                            })
                            .onSet(async (state) => { });
                        this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.VolumeControlType)
                            .onGet(async () => {
                                const state = 3;
                                return state;
                            });
                        this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.VolumeSelector)
                            .onSet(async (command) => {
                                try {
                                    switch (command) {
                                        case Characteristic.VolumeSelector.INCREMENT:
                                            command = 'UP';
                                            await this.stateControl('VolumeSelector', command);
                                            break;
                                        case Characteristic.VolumeSelector.DECREMENT:
                                            command = 'DOWN';
                                            await this.stateControl('VolumeSelector', command);
                                            break;
                                    }
                                    if (this.logInfo) this.emit('info', `set Volume Selector: ${command}`);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `set Volume Selector error: ${error}`);
                                };
                            });
                        this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Volume)
                            .onGet(async () => {
                                const volume = this.volume;
                                return volume;
                            })
                            .onSet(async (value) => {
                                try {
                                    value = value > this.volumeControlMax ? this.volumeControlMax : value;
                                    let scaledValue = await this.functions.scaleValue(value, 0, 100, 0, 98);
                                    scaledValue = scaledValue < 10 ? `0${scaledValue}` : scaledValue;
                                    await this.stateControl('Volume', scaledValue);
                                    if (this.logInfo) this.emit('info', `set Volume: ${value}`);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `set Volume error: ${error}`);
                                }
                            });
                        this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Mute)
                            .onGet(async () => {
                                const state = this.mute;
                                return state;
                            })
                            .onSet(async (state) => {
                                try {
                                    state = state ? 'ON' : 'OFF';
                                    await this.stateControl('Mute', state);
                                    if (this.logInfo) this.emit('info', `set Mute: ${!state ? 'ON' : 'OFF'}`);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `set Mute error: ${error}`);
                                }
                            });

                        // fan
                        if (this.logDebug) this.emit('debug', `Prepare volume service fan`);
                        this.volumeServiceFan = accessory.addService(Service.Fan, volumeServiceName, 'Fan Speaker');
                        this.volumeServiceFan.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.volumeServiceFan.setCharacteristic(Characteristic.ConfiguredName, volumeServiceName);
                        this.volumeServiceFan.getCharacteristic(Characteristic.RotationSpeed)
                            .onGet(async () => {
                                const volume = this.volume;
                                return volume;
                            })
                            .onSet(async (value) => {
                                this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.Volume, value);
                            });
                        this.volumeServiceFan.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = this.power ? !this.mute : false;
                                return state;
                            })
                            .onSet(async (state) => {
                                this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.Mute, !state);
                            });
                        break;
                }
            }

            //prepare sensor service
            if (this.sensorPower) {
                if (this.logDebug) this.emit('debug', `Prepare power sensor service`);
                this.sensorPowerService = accessory.addService(Service.ContactSensor, `${this.sZoneName} Power Sensor`, `Power Sensor`);
                this.sensorPowerService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorPowerService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Power Sensor`);
                this.sensorPowerService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.power;
                        return state;
                    });
            }

            if (this.sensorVolume) {
                if (this.logDebug) this.emit('debug', `Prepare volume sensor service`);
                this.sensorVolumeService = accessory.addService(Service.ContactSensor, `${this.sZoneName} Volume Sensor`, `Volume Sensor`);
                this.sensorVolumeService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorVolumeService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Volume Sensor`);
                this.sensorVolumeService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.sensorVolumeState;
                        return state;
                    });
            }

            if (this.sensorMute) {
                if (this.logDebug) this.emit('debug', `Prepare mute sensor service`);
                this.sensorMuteService = accessory.addService(Service.ContactSensor, `${this.sZoneName} Mute Sensor`, `Mute Sensor`);
                this.sensorMuteService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorMuteService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Mute Sensor`);
                this.sensorMuteService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.mute;
                        return state;
                    });
            }

            if (this.sensorInput) {
                if (this.logDebug) this.emit('debug', `Prepare input sensor service`);
                this.sensorInputService = accessory.addService(Service.ContactSensor, `${this.sZoneName} Input Sensor`, `Input Sensor`);
                this.sensorInputService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorInputService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Input Sensor`);
                this.sensorInputService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.sensorInputState;
                        return state;
                    });
            }

            //prepare sonsor service
            const possibleSensorInputsCount = 99 - this.accessory.services.length;
            const maxSensorInputsCount = this.sensorInputs.length >= possibleSensorInputsCount ? possibleSensorInputsCount : this.sensorInputs.length;
            if (maxSensorInputsCount > 0) {
                if (this.logDebug) this.emit('debug', `Prepare inputs sensors services`);
                this.sensorInputServices = [];
                for (let i = 0; i < maxSensorInputsCount; i++) {
                    //get sensor
                    const sensor = this.sensorInputs[i];

                    //get sensor name		
                    const name = sensor.name;

                    //get sensor name prefix
                    const namePrefix = sensor.namePrefix;

                    //get service type
                    const serviceType = sensor.serviceType;

                    //get service type
                    const characteristicType = sensor.characteristicType;

                    const serviceName = namePrefix ? `${accessoryName} ${name}` : name;
                    const sensorInputService = new serviceType(serviceName, `Sensor ${i}`);
                    sensorInputService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    sensorInputService.setCharacteristic(Characteristic.ConfiguredName, serviceName);
                    sensorInputService.getCharacteristic(characteristicType)
                        .onGet(async () => {
                            const state = sensor.state
                            return state;
                        });
                    this.sensorInputServices.push(sensorInputService);
                    accessory.addService(sensorInputService);
                }
            }

            //prepare buttons services
            const possibleButtonsCount = 99 - this.accessory.services.length;
            const maxButtonsCount = this.buttons.length >= possibleButtonsCount ? possibleButtonsCount : this.buttons.length;
            if (maxButtonsCount > 0) {
                if (this.logDebug) this.emit('debug', `Prepare buttons services`);
                this.buttonServices = [];
                for (let i = 0; i < maxButtonsCount; i++) {
                    //get button
                    const button = this.buttons[i];

                    //get button name
                    const name = button.name;

                    //get button reference
                    const reference = button.reference;

                    //get button name prefix
                    const namePrefix = button.namePrefix;

                    //get service type
                    const serviceType = button.serviceType;

                    const serviceName = namePrefix ? `${accessoryName} ${name}` : name;
                    const buttonService = new serviceType(serviceName, `Button ${i}`);
                    buttonService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    buttonService.setCharacteristic(Characteristic.ConfiguredName, serviceName);
                    buttonService.getCharacteristic(Characteristic.On)
                        .onGet(async () => {
                            const state = button.state;
                            return state;
                        })
                        .onSet(async (state) => {
                            try {
                                const command = `Z3${reference.substring(1)}`;
                                const set = state ? await this.denon.send(command) : false;
                                if (this.logInfo && state) this.emit('info', `set Button Name: ${name}, Reference: ${command}`);
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `set Button error: ${error}`);
                            }
                        });

                    this.buttonServices.push(buttonService);
                    accessory.addService(buttonService);
                }
            }

            return accessory;
        } catch (error) {
            throw new Error(error)
        };
    }

    //start
    async start() {
        try {
            //denon client
            this.denon = new Denon({
                host: this.host,
                port: this.port,
                generation: this.generation,
                zone: this.zone,
                inputs: this.inputs,
                devInfoFile: this.devInfoFile,
                inputsFile: this.inputsFile,
                getInputsFromDevice: this.getInputsFromDevice,
                getFavoritesFromDevice: this.getFavoritesFromDevice,
                getQuickSmartSelectFromDevice: this.getQuickSmartSelectFromDevice,
                logDebug: this.logDebug
            })
                .on('deviceInfo', (info) => {
                    this.emit('devInfo', `-------- ${this.name} --------`);
                    this.emit('devInfo', `Manufacturer: ${info.manufacturer}`);
                    this.emit('devInfo', `Model: ${info.modelName}`);
                    this.emit('devInfo', `Control: ${info.controlZone}`);
                    this.emit('devInfo', `----------------------------------`);

                    this.informationService?.updateCharacteristic(Characteristic.FirmwareRevision, info.firmwareRevision);
                })
                .on('addRemoveOrUpdateInput', async (inputs, remove) => {
                    await this.addRemoveOrUpdateInput(inputs, remove);
                })
                .on('stateChanged', async (power, reference, volume, volumeDisplay, mute, pictureMode) => {
                    const input = this.inputsServices?.find(input => input.reference === reference);
                    const inputIdentifier = input ? input.identifier : this.inputIdentifier;
                    const scaledVolume = await this.functions.scaleValue(volume, -80, 18, 0, 100);
                    mute = power ? mute : true;
                    const pictureModeHomeKit = PictureModesConversionToHomeKit[pictureMode] ?? this.pictureMode;

                    this.inputIdentifier = inputIdentifier;
                    this.power = power;
                    this.reference = reference;
                    this.volume = scaledVolume;
                    this.mute = mute;
                    this.volumeDisplay = volumeDisplay;
                    this.pictureMode = pictureModeHomeKit;

                    this.televisionService
                        ?.updateCharacteristic(Characteristic.Active, power)
                        .updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier)
                        .updateCharacteristic(Characteristic.PictureMode, pictureModeHomeKit);

                    this.volumeServiceTvSpeaker
                        ?.updateCharacteristic(Characteristic.Active, power)
                        .updateCharacteristic(Characteristic.Volume, scaledVolume)
                        .updateCharacteristic(Characteristic.Mute, mute);

                    const muteV = this.power ? !mute : false;
                    this.volumeServiceLightbulb
                        ?.updateCharacteristic(Characteristic.Brightness, scaledVolume)
                        .updateCharacteristic(Characteristic.On, muteV);

                    this.volumeServiceFan
                        ?.updateCharacteristic(Characteristic.RotationSpeed, scaledVolume)
                        .updateCharacteristic(Characteristic.On, muteV);

                    this.volumeServiceSpeaker
                        ?.updateCharacteristic(Characteristic.Active, power)
                        .updateCharacteristic(Characteristic.Volume, scaledVolume)
                        .updateCharacteristic(Characteristic.Mute, mute);

                    //sensors
                    this.sensorPowerService?.updateCharacteristic(Characteristic.ContactSensorState, power);

                    if (scaledVolume !== this.volume) {
                        for (let i = 0; i < 2; i++) {
                            const state = power ? [true, false][i] : false;
                            this.sensorVolumeService?.updateCharacteristic(Characteristic.ContactSensorState, state);
                            this.sensorVolumeState = state;
                        }
                    }

                    this.sensorMuteService?.updateCharacteristic(Characteristic.ContactSensorState, power ? mute : false);

                    if (reference !== this.reference) {
                        for (let i = 0; i < 2; i++) {
                            const state = power ? [true, false][i] : false;
                            this.sensorInputService?.updateCharacteristic(Characteristic.ContactSensorState, state);
                            this.sensorInputState = state;
                        }
                    }

                    for (let i = 0; i < this.sensorInputs.length; i++) {
                        const sensor = this.sensorInputs[i];
                        const state = power ? sensor.reference === reference : false;
                        sensor.state = state;
                        const characteristicType = sensor.characteristicType;
                        this.sensorInputServices?.[i]?.updateCharacteristic(characteristicType, state);
                    }

                    //buttons
                    for (let i = 0; i < this.buttons.length; i++) {
                        const button = this.buttons[i];
                        const state = this.power ? button.reference === reference : false;
                        button.state = state;
                        this.buttonServices?.[i]?.updateCharacteristic(Characteristic.On, state);
                    }

                    if (this.logInfo) {
                        const name = input ? input.name : reference;
                        this.emit('info', `Power: ${power ? 'ON' : 'OFF'}`);
                        this.emit('info', `Input Name: ${name}`);
                        this.emit('info', `Reference: ${reference}`);
                        this.emit('info', `Mute: ${mute ? 'ON' : 'OFF'}`);
                        this.emit('info', `Volume: ${volumeDisplay !== 'Absolute' ? volume : scaledVolume}${volumeDisplay !== 'Absolute' ? 'dB' : '%'}`);
                        const emitInfo1 = volumeDisplay === false ? false : this.emit('info', `Volume Display: ${volumeDisplay}`);
                        this.emit('info', `Picture Mode: ${PictureModesDenonNumber[pictureMode]}`);
                    }
                })
                .on('success', (success) => this.emit('success', success))
                .on('info', (info) => this.emit('info', info))
                .on('debug', (debug) => this.emit('debug', debug))
                .on('warn', (warn) => this.emit('warn', warn))
                .on('error', (error) => this.emit('error', error))
                .on('restFul', (path, data) => {
                    if (this.restFulConnected) this.restFul1.update(path, data);
                })
                .on('mqtt', (topic, message) => {
                    if (this.mqttConnected) this.mqtt1.emit('publish', topic, message);
                });

            //connect to avr and check state
            const connect = await this.denon.connect();
            if (!connect) {
                return false;
            }

            //prepare data for accessory
            await this.prepareDataForAccessory();

            //start external integrations
            if (this.restFul.enable || this.mqtt.enable) await this.externalIntegrations();

            //prepare accessory
            const accessory = await this.prepareAccessory();
            return accessory;
        } catch (error) {
            throw new Error(`Start error: ${error}`);
        }
    }
}

export default Zone3;
