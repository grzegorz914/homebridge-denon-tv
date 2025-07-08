import { promises as fsPromises } from 'fs';
import EventEmitter from 'events';
import Mqtt from './mqtt.js';
import RestFul from './restful.js';
import Denon from './denon.js';
import { PictureModesConversionToHomeKit, PictureModesDenonNumber } from './constants.js';
let Accessory, Characteristic, Service, Categories, Encode, AccessoryUUID;

class Zone2 extends EventEmitter {
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
        this.getInputsFromDevice = device.getInputsFromDevice || false;
        this.getFavoritesFromDevice = device.getFavoritesFromDevice || false;
        this.getQuickSmartSelectFromDevice = device.getQuickSmartSelectFromDevice || false;
        this.inputsDisplayOrder = device.inputsDisplayOrder || 0;
        this.inputs = device.inputs || [];
        this.buttons = device.buttonsZ2 || [];
        this.sensorPower = device.sensorPower || false;
        this.sensorVolume = device.sensorVolume || false
        this.sensorMute = device.sensorMute || false;
        this.sensorInput = device.sensorInput || false;
        this.sensorInputs = device.sensorInputs || [];
        this.powerControlZone = device.powerControlZone || 0;
        this.volumeControl = device.volumeControlType || 0;
        this.volumeControlZone = device.volumeControlZone || 0;
        this.volumeControlName = device.volumeControlName || 'Volume';
        this.volumeControlNamePrefix = device.volumeControlNamePrefix || false;
        this.volumeMax = device.volumeMax || 100;
        this.infoButtonCommand = device.infoButtonCommand || 'MNINF';
        this.refreshInterval = device.refreshInterval * 1000 || 5000;
        this.enableDebugMode = device.enableDebugMode || false;
        this.disableLogInfo = device.disableLogInfo || false;
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
        this.sensorsInputsConfigured = [];
        for (const sensor of this.sensorInputs) {
            const displayType = sensor.displayType ?? 0;
            if (displayType === 0) {
                continue;
            }

            sensor.name = sensor.name || 'Sensor Input';
            sensor.reference = sensor.reference ?? false;
            if (sensor.reference) {
                sensor.serviceType = ['', Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][displayType];
                sensor.characteristicType = ['', Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][displayType];
                sensor.state = false;
                this.sensorsInputsConfigured.push(sensor);
            } else {
                this.emit('info', `Sensor Name: ${sensor.name}, Reference: Missing`);
            }
        }
        this.sensorsInputsConfiguredCount = this.sensorsInputsConfigured.length || 0;

        //buttons
        this.buttonsConfigured = [];
        for (const button of this.buttons) {
            const displayType = button.displayType ?? 0;
            if (displayType === 0) {
                continue;
            }

            button.name = button.name || 'Button';
            button.reference = button.reference ?? false;
            if (button.reference) {
                button.serviceType = ['', Service.Outlet, Service.Switch][displayType];
                button.state = false;
                this.buttonsConfigured.push(button);
            } else {
                this.emit('info', `Button Name: ${button.name}, Reference: Missing`);
            }
        }
        this.buttonsConfiguredCount = this.buttonsConfigured.length || 0;

        //variable
        this.startPrepareAccessory = true;
        this.allServices = [];
        this.inputsConfigured = [];
        this.inputIdentifier = 1;
        this.startPrepareAccessory = true;
        this.power = false;
        this.reference = '';
        this.volume = 0;
        this.volumeDisplay = false;
        this.mute = false;
        this.mediaState = false;
        this.sensorVolumeState = false;
        this.sensorInputState = false;
    }

    async saveData(path, data) {
        try {
            data = JSON.stringify(data, null, 2);
            await fsPromises.writeFile(path, data);
            return true;
        } catch (error) {
            throw new Error(`Save data error: ${error}`);
        }
    }

    async readData(path) {
        try {
            const data = await fsPromises.readFile(path);
            return data;
        } catch (error) {
            throw new Error(`Read saved data error: ${error}`);
        }
    }

    async sanitizeString(str) {
        // Replace dots, colons, and semicolons inside words with a space
        str = str.replace(/(\w)[.:;]+(\w)/g, '$1 $2');

        // Remove remaining dots, colons, semicolons, plus, and minus anywhere in the string
        str = str.replace(/[.:;+\-]/g, '');

        // Replace all other invalid characters (anything not A-Z, a-z, 0-9, space, or apostrophe) with a space
        str = str.replace(/[^A-Za-z0-9 ']/g, ' ');

        // Trim leading and trailing spaces
        str = str.trim();

        return str;
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

    async externalIntegrations() {
        try {
            //RESTFul server
            const restFulEnabled = this.restFul.enable || false;
            if (restFulEnabled) {
                this.restFul1 = new RestFul({
                    port: this.restFul.port || 3000,
                    debug: this.restFul.debug || false
                });

                this.restFul1.on('connected', (message) => {
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
                    .on('debug', (debug) => {
                        this.emit('debug', debug);
                    })
                    .on('warn', (warn) => {
                        this.emit('warn', warn);
                    })
                    .on('error', (error) => {
                        this.emit('error', error);
                    });
            }

            //mqtt client
            const mqttEnabled = this.mqtt.enable || false;
            if (mqttEnabled) {
                this.mqtt1 = new Mqtt({
                    host: this.mqtt.host,
                    port: this.mqtt.port || 1883,
                    clientId: this.mqtt.clientId ? `${this.manufacturer}_${this.mqtt.clientId}_${Math.random().toString(16).slice(3)}` : `${this.manufacturer}_${Math.random().toString(16).slice(3)}`,
                    prefix: this.mqtt.prefix ? `${this.manufacturer}/${this.mqtt.prefix}/${this.name}` : `${this.manufacturer}/${this.name}`,
                    user: this.mqtt.user,
                    passwd: this.mqtt.passwd,
                    debug: this.mqtt.debug || false
                });

                this.mqtt1.on('connected', (message) => {
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
                    .on('debug', (debug) => {
                        this.emit('debug', debug);
                    })
                    .on('warn', (warn) => {
                        this.emit('warn', warn);
                    })
                    .on('error', (error) => {
                        this.emit('error', error);
                    });
            };

            return true;
        } catch (error) {
            this.emit('warn', `External integration start error: ${error}`);
        };
    }

    async prepareDataForAccessory() {
        try {
            //read inputs file
            const savedInputs = await this.readData(this.inputsFile);
            this.savedInputs = savedInputs.toString().trim() !== '' ? JSON.parse(savedInputs) : this.inputs;
            const debug = this.enableDebugMode ? this.emit('debug', `Read saved Inputs: ${JSON.stringify(this.savedInputs, null, 2)}`) : false;

            //read inputs names from file
            const savedInputsNames = await this.readData(this.inputsNamesFile);
            this.savedInputsNames = savedInputsNames.toString().trim() !== '' ? JSON.parse(savedInputsNames) : {};
            const debug1 = !this.enableDebugMode ? false : this.emit('debug', `Read saved Inputs Names: ${JSON.stringify(this.savedInputsNames, null, 2)}`);

            //read inputs visibility from file
            const savedInputsTargetVisibility = await this.readData(this.inputsTargetVisibilityFile);
            this.savedInputsTargetVisibility = savedInputsTargetVisibility.toString().trim() !== '' ? JSON.parse(savedInputsTargetVisibility) : {};
            const debug2 = !this.enableDebugMode ? false : this.emit('debug', `Read saved Inputs Target Visibility: ${JSON.stringify(this.savedInputsTargetVisibility, null, 2)}`);

            return true;
        } catch (error) {
            throw new Error(`Prepare data for accessory error: ${error}`);
        }
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

            this.inputsConfigured.sort(sortFn);

            if (this.enableDebugMode) {
                this.emit('debug', `Inputs display order:\n${JSON.stringify(this.inputsConfigured, null, 2)}`);
            }

            const displayOrder = this.inputsConfigured.map(input => input.identifier);
            const encodedOrder = Encode(1, displayOrder).toString('base64');

            this.televisionService.setCharacteristic(Characteristic.DisplayOrder, encodedOrder);
        } catch (error) {
            throw new Error(`Display order error: ${error}`);
        }
    }


    async startImpulseGenerator() {
        try {
            //start impulse generator 
            await this.denon.impulseGenerator.start([{ name: 'checkState', sampling: this.refreshInterval }]);
            return true;
        } catch (error) {
            throw new Error(`Impulse generator start error: ${error}`);
        }
    }

    async scaleValue(value, inMin, inMax, outMin, outMax) {
        const scaledValue = parseFloat((((Math.max(inMin, Math.min(inMax, value)) - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin).toFixed(0));
        return scaledValue;
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
                this.emit('warn', `Unknown control type: ${type}`);
            }

            return true;
        } catch (error) {
            this.emit('warn', `State control error for type ${type} with value ${value}: ${error}`);
        }
    }

    //prepare accessory
    async prepareAccessory() {
        try {
            //accessory
            const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare accessory`);
            const accessoryName = this.name;
            const accessoryUUID = AccessoryUUID.generate(this.serialNumber + this.zone);
            const accessoryCategory = Categories.AUDIO_RECEIVER;
            const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

            //information service
            const debug1 = !this.enableDebugMode ? false : this.emit('debug', `Prepare information service`);
            this.informationService = accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
                .setCharacteristic(Characteristic.Model, this.modelName)
                .setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
                .setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);
            this.allServices.push(this.informationService);

            //prepare television service
            const debug2 = !this.enableDebugMode ? false : this.emit('debug', `Prepare television service`);
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
                        const info = this.disableLogInfo ? false : this.emit('info', `set Power: ${powerState}`);
                    } catch (error) {
                        this.emit('warn', `set Power error: ${error}`);
                    }
                });

            this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
                .onGet(async () => {
                    const inputIdentifier = this.inputIdentifier;
                    return inputIdentifier;
                })
                .onSet(async (activeIdentifier) => {
                    try {
                        const input = this.inputsConfigured.find(i => i.identifier === activeIdentifier);
                        if (!input) {
                            this.emit('warn', `Input with identifier ${activeIdentifier} not found`);
                            return;
                        }

                        const { mode: mode, name: name, reference: reference } = input;

                        if (!this.power) {
                            // Schedule retry attempts without blocking Homebridge
                            this.emit('debug', `TV is off, deferring input switch to '${activeIdentifier}'`);

                            (async () => {
                                for (let attempt = 0; attempt < 3; attempt++) {
                                    await new Promise(resolve => setTimeout(resolve, 4000));
                                    if (this.power && this.inputIdentifier !== activeIdentifier) {
                                        this.emit('debug', `TV powered on, retrying input switch`);
                                        this.televisionService.setCharacteristic(Characteristic.ActiveIdentifier, activeIdentifier);
                                        break;
                                    }
                                }
                            })();

                            return;
                        }

                        await this.denon.send(`${mode}${reference}`);
                        const info = this.disableLogInfo ? false : this.emit('info', `set Input Name: ${name}, Reference: ${reference}`);
                    } catch (error) {
                        this.emit('warn', `set Input error: ${error}`);
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
                        const info = this.disableLogInfo ? false : this.emit('info', `set Remote Key: ${command}`);
                    } catch (error) {
                        this.emit('warn', `set Remote Key error: ${error}`);
                    }
                });
            this.allServices.push(this.televisionService);

            //Prepare volume service
            if (this.volumeControl > 0) {
                const debug3 = this.enableDebugMode ? this.emit('debug', `Prepare television speaker service`) : false;
                const volumeServiceName = this.volumeControlNamePrefix ? `${accessoryName} ${this.volumeControlName}` : this.volumeControlName;
                this.volumeServiceTvSpeaker = accessory.addService(Service.TelevisionSpeaker, volumeServiceName, 'TV Speaker');
                this.volumeServiceTvSpeaker.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.ConfiguredName, volumeServiceName);
                this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Active)
                    .onGet(async () => {
                        const state = this.power;
                        return state;
                    })
                    .onSet(async (state) => {
                    });
                this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.VolumeControlType)
                    .onGet(async () => {
                        const state = 3; //none, relative, relative with current, absolute
                        return state;
                    })
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
                            const info = this.disableLogInfo ? false : this.emit('info', `set Volume Selector: ${command}`);
                        } catch (error) {
                            this.emit('warn', `set Volume Selector error: ${error}`);
                        }
                    });

                this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Volume)
                    .onGet(async () => {
                        const volume = this.volume;
                        return volume;
                    })
                    .onSet(async (value) => {
                        try {
                            value = value > this.volumeMax ? this.volumeMax : value;
                            let scaledValue = await this.scaleValue(value, 0, 100, 0, 98);
                            scaledValue = scaledValue < 10 ? `0${scaledValue}` : scaledValue;
                            await this.stateControl('Volume', scaledValue);
                            const info = this.disableLogInfo ? false : this.emit('info', `set Volume: ${value}%`);
                        } catch (error) {
                            this.emit('warn', `set Volume error: ${error}`);
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
                            const info = this.disableLogInfo ? false : this.emit('info', `set Mute: ${state}`);
                        } catch (error) {
                            this.emit('warn', `set Mute error: ${error}`);
                        }
                    });

                this.allServices.push(this.volumeServiceTvSpeaker);

                //legacy control
                switch (this.volumeControl) {
                    case 1: //lightbulb
                        const debug = this.enableDebugMode ? this.emit('debug', `Prepare volume service lightbulb`) : false;
                        this.volumeServiceLightbulb = accessory.addService(Service.Lightbulb, volumeServiceName, 'Lightbulb Speaker');
                        this.volumeServiceLightbulb.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.volumeServiceLightbulb.setCharacteristic(Characteristic.ConfiguredName, `${volumeServiceName}`);
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

                        this.allServices.push(this.volumeServiceLightbulb);
                        break;
                    case 2: //fan
                        const debug1 = this.enableDebugMode ? this.emit('debug', `Prepare volume service fan`) : false;
                        this.volumeServiceFan = accessory.addService(Service.Fan, volumeServiceName, 'Fan Speaker');
                        this.volumeServiceFan.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.volumeServiceFan.setCharacteristic(Characteristic.ConfiguredName, `${volumeServiceName}`);
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

                        this.allServices.push(this.volumeServiceFan);
                        break;
                    case 3: // speaker
                        const debug2 = this.enableDebugMode ? this.emit('debug', `Prepare volume service speaker`) : false;
                        this.volumeServiceSpeaker = accessory.addService(Service.Speaker, volumeServiceName, 'Speaker');
                        this.volumeServiceSpeaker.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.volumeServiceSpeaker.setCharacteristic(Characteristic.ConfiguredName, volumeServiceName);
                        this.volumeServiceSpeaker.getCharacteristic(Characteristic.Mute)
                            .onGet(async () => {
                                const state = this.mute;
                                return state;
                            })
                            .onSet(async (state) => {
                                this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.Mute, state);
                            });
                        this.volumeServiceSpeaker.getCharacteristic(Characteristic.Active)
                            .onGet(async () => {
                                const state = this.power;
                                return state;
                            })
                            .onSet(async (state) => {
                            });
                        this.volumeServiceSpeaker.getCharacteristic(Characteristic.Volume)
                            .onGet(async () => {
                                const volume = this.volume;
                                return volume;
                            })
                            .onSet(async (value) => {
                                this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.Volume, value);
                            });

                        this.allServices.push(this.volumeServiceSpeaker);
                        break;
                }
            }

            //prepare inputs service
            const debug8 = !this.enableDebugMode ? false : this.emit('debug', `Prepare inputs services`);

            // Prepare inputs (max 85 total services)
            const maxInputs = Math.min(this.savedInputs.length, 85 - this.allServices.length);

            for (let i = 0; i < maxInputs; i++) {
                const input = this.savedInputs[i];
                const inputIdentifier = i + 1;
                const reference = input.reference;

                // Determine display name
                const defaultName = input.name || `Input ${inputIdentifier}`;
                const savedName = this.savedInputsNames[reference];
                input.name = (savedName || defaultName).substring(0, 64);

                // Set defaults and identifiers
                input.identifier = inputIdentifier;
                input.visibility = this.savedInputsTargetVisibility[reference] ?? 0;

                // Create InputSource service
                const sanitizedName = await this.sanitizeString(input.name);
                const inputService = accessory.addService(Service.InputSource, sanitizedName, `Input ${inputIdentifier}`);

                inputService
                    .setCharacteristic(Characteristic.Identifier, inputIdentifier)
                    .setCharacteristic(Characteristic.Name, sanitizedName)
                    .setCharacteristic(Characteristic.IsConfigured, 1)
                    .setCharacteristic(Characteristic.InputSourceType, 0)
                    .setCharacteristic(Characteristic.CurrentVisibilityState, input.visibility);

                // Handle name configuration
                inputService.getCharacteristic(Characteristic.ConfiguredName)
                    .onGet(async () => sanitizedName)
                    .onSet(async (value) => {
                        try {
                            input.name = value;
                            this.savedInputsNames[reference] = value;
                            await this.saveData(this.inputsNamesFile, this.savedInputsNames);

                            const index = this.inputsConfigured.findIndex(i => i.reference === reference);
                            if (index !== -1) this.inputsConfigured[index].name = value;

                            await this.displayOrder();
                            if (this.enableDebugMode) this.emit('debug', `Saved Input Name: ${value}, Reference: ${reference}`);
                        } catch (error) {
                            this.emit('warn', `Save Input Name error: ${error}`);
                        }
                    });

                // Handle visibility configuration
                inputService.getCharacteristic(Characteristic.TargetVisibilityState)
                    .onGet(async () => input.visibility)
                    .onSet(async (state) => {
                        try {
                            input.visibility = state;
                            this.savedInputsTargetVisibility[reference] = state;
                            await this.saveData(this.inputsTargetVisibilityFile, this.savedInputsTargetVisibility);

                            if (this.enableDebugMode)
                                this.emit('debug', `Saved Input: ${input.name}, Target Visibility: ${state ? 'HIDDEN' : 'SHOWN'}`);
                        } catch (error) {
                            this.emit('warn', `Save Input Target Visibility error: ${error}`);
                        }
                    });

                // Final registration
                this.inputsConfigured.push(input);
                this.televisionService.addLinkedService(inputService);
                this.allServices.push(inputService);
            }


            //prepare sensor service
            if (this.sensorPower) {
                const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare power sensor service`);
                this.sensorPowerService = accessory.addService(Service.ContactSensor, `${this.sZoneName} Power Sensor`, `Power Sensor`);
                this.sensorPowerService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorPowerService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Power Sensor`);
                this.sensorPowerService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.power;
                        return state;
                    });

                this.allServices.push(this.sensorPowerService);
            }

            if (this.sensorVolume) {
                const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare volume sensor service`);
                this.sensorVolumeService = accessory.addService(Service.ContactSensor, `${this.sZoneName} Volume Sensor`, `Volume Sensor`);
                this.sensorVolumeService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorVolumeService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Volume Sensor`);
                this.sensorVolumeService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.sensorVolumeState;
                        return state;
                    });

                this.allServices.push(this.sensorVolumeService);
            }

            if (this.sensorMute) {
                const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare mute sensor service`);
                this.sensorMuteService = accessory.addService(Service.ContactSensor, `${this.sZoneName} Mute Sensor`, `Mute Sensor`);
                this.sensorMuteService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorMuteService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Mute Sensor`);
                this.sensorMuteService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.mute;
                        return state;
                    });

                this.allServices.push(this.sensorMuteService);
            }

            if (this.sensorInput) {
                const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare input sensor service`);
                this.sensorInputService = accessory.addService(Service.ContactSensor, `${this.sZoneName} Input Sensor`, `Input Sensor`);
                this.sensorInputService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorInputService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Input Sensor`);
                this.sensorInputService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.sensorInputState;
                        return state;
                    });

                this.allServices.push(this.sensorInputService);
            }

            //prepare sonsor service
            const possibleSensorInputsCount = 99 - this.allServices.length;
            const maxSensorInputsCount = this.sensorsInputsConfiguredCount >= possibleSensorInputsCount ? possibleSensorInputsCount : this.sensorsInputsConfiguredCount;
            if (maxSensorInputsCount > 0) {
                const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare inputs sensors services`);
                this.sensorInputServices = [];
                for (let i = 0; i < maxSensorInputsCount; i++) {
                    //get sensor
                    const sensor = this.sensorsInputsConfigured[i];

                    //get sensor name		
                    const name = sensor.name;

                    //get sensor name prefix
                    const namePrefix = sensor.namePrefix || false;

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
                    this.allServices.push(sensorInputService);
                    accessory.addService(sensorInputService);
                }
            }

            //prepare buttons services
            const possibleButtonsCount = 99 - this.allServices.length;
            const maxButtonsCount = this.buttonsConfiguredCount >= possibleButtonsCount ? possibleButtonsCount : this.buttonsConfiguredCount;
            if (maxButtonsCount > 0) {
                const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare buttons services`);
                this.buttonServices = [];
                for (let i = 0; i < maxButtonsCount; i++) {
                    //get button
                    const button = this.buttonsConfigured[i];

                    //get button name
                    const name = button.name;

                    //get button reference
                    const reference = button.reference;

                    //get button name prefix
                    const namePrefix = button.namePrefix || false;

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
                                const command = `Z2${reference.substring(1)}`;
                                const set = state ? await this.denon.send(command) : false;
                                const info = this.disableLogInfo || !state ? false : this.emit('info', `set Button Name: ${name}, Reference: ${command}`);
                            } catch (error) {
                                this.emit('warn', `set Button error: ${error}`);
                            }
                        });

                    this.buttonServices.push(buttonService);
                    this.allServices.push(buttonService);
                    accessory.addService(buttonService);
                }
            }

            //sort inputs list
            await this.displayOrder();

            return accessory;
        } catch (error) {
            throw new Error(error)
        }
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
                enableDebugLog: this.enableDebugMode
            });

            this.denon.on('deviceInfo', (manufacturer, modelName, serialNumber, firmwareRevision, deviceZones, apiVersion, supportPictureMode) => {
                this.emit('devInfo', `-------- ${this.name} --------`);
                this.emit('devInfo', `Manufacturer: ${manufacturer}`);
                this.emit('devInfo', `Model: ${modelName}`);
                this.emit('devInfo', `Control: Zone 2`);
                this.emit('devInfo', `----------------------------------`);

                this.manufacturer = manufacturer;
                this.modelName = modelName;
                this.serialNumber = serialNumber;
                this.firmwareRevision = firmwareRevision;;
            })
                .on('stateChanged', async (power, reference, volume, volumeDisplay, mute, pictureMode) => {
                    const input = this.inputsConfigured.find(input => input.reference === reference) ?? false;
                    const inputIdentifier = input ? input.identifier : this.inputIdentifier;
                    const scaledVolume = await this.scaleValue(volume, -80, 18, 0, 100);
                    mute = power ? mute : true;
                    const pictureModeHomeKit = PictureModesConversionToHomeKit[pictureMode] ?? this.pictureMode;

                    this.inputIdentifier = inputIdentifier;
                    this.power = power;
                    this.reference = reference;
                    this.volume = scaledVolume;
                    this.mute = mute;
                    this.volumeDisplay = volumeDisplay;
                    this.pictureMode = pictureModeHomeKit;

                    if (this.televisionService) {
                        this.televisionService
                            .updateCharacteristic(Characteristic.Active, power)
                            .updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier)
                            .updateCharacteristic(Characteristic.PictureMode, pictureModeHomeKit);
                    }

                    if (this.volumeServiceTvSpeaker) {
                        this.volumeServiceTvSpeaker
                            .updateCharacteristic(Characteristic.Active, power)
                            .updateCharacteristic(Characteristic.Volume, scaledVolume)
                            .updateCharacteristic(Characteristic.Mute, mute);
                    }

                    if (this.volumeServiceLightbulb) {
                        const muteV = this.power ? !mute : false;
                        this.volumeServiceLightbulb
                            .updateCharacteristic(Characteristic.Brightness, scaledVolume)
                            .updateCharacteristic(Characteristic.On, muteV);
                    }

                    if (this.volumeServiceFan) {
                        const muteV = this.power ? !mute : false;
                        this.volumeServiceFan
                            .updateCharacteristic(Characteristic.RotationSpeed, scaledVolume)
                            .updateCharacteristic(Characteristic.On, muteV);
                    }

                    if (this.volumeServiceSpeaker) {
                        this.volumeServiceSpeaker
                            .updateCharacteristic(Characteristic.Active, power)
                            .updateCharacteristic(Characteristic.Volume, scaledVolume)
                            .updateCharacteristic(Characteristic.Mute, mute);
                    }

                    //sensors
                    if (this.sensorPowerService) {
                        this.sensorPowerService
                            .updateCharacteristic(Characteristic.ContactSensorState, power)
                    }

                    if (this.sensorVolumeService && scaledVolume !== this.volume) {
                        for (let i = 0; i < 2; i++) {
                            const state = power ? [true, false][i] : false;
                            this.sensorVolumeService
                                .updateCharacteristic(Characteristic.ContactSensorState, state)
                            this.sensorVolumeState = state;
                        }
                    }

                    if (this.sensorMuteService) {
                        const state = power ? mute : false;
                        this.sensorMuteService
                            .updateCharacteristic(Characteristic.ContactSensorState, state)
                    }

                    if (this.sensorInputService && reference !== this.reference) {
                        for (let i = 0; i < 2; i++) {
                            const state = power ? [true, false][i] : false;
                            this.sensorInputService
                                .updateCharacteristic(Characteristic.ContactSensorState, state)
                            this.sensorInputState = state;
                        }
                    }

                    if (this.sensorInputServices) {
                        for (let i = 0; i < this.sensorsInputsConfiguredCount; i++) {
                            const sensor = this.sensorsInputsConfigured[i];
                            const state = power ? sensor.reference === reference : false;
                            sensor.state = state;
                            const characteristicType = sensor.characteristicType;
                            this.sensorInputServices[i]
                                .updateCharacteristic(characteristicType, state);
                        }
                    }

                    //buttons
                    if (this.buttonServices) {
                        for (let i = 0; i < this.buttonsConfiguredCount; i++) {
                            const button = this.buttonsConfigured[i];
                            const state = this.power ? button.reference === reference : false;
                            button.state = state;
                            this.buttonServices[i]
                                .updateCharacteristic(Characteristic.On, state);
                        }
                    }

                    if (!this.disableLogInfo) {
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
                .on('success', (success) => {
                    this.emit('success', success);
                })
                .on('info', (info) => {
                    this.emit('info', info);
                })
                .on('debug', (debug) => {
                    this.emit('debug', debug);
                })
                .on('warn', (warn) => {
                    this.emit('warn', warn);
                })
                .on('error', (error) => {
                    this.emit('error', error);
                })
                .on('restFul', (path, data) => {
                    const restFul = this.restFulConnected ? this.restFul1.update(path, data) : false;
                })
                .on('mqtt', (topic, message) => {
                    const mqtt = this.mqttConnected ? this.mqtt1.emit('publish', topic, message) : false;
                });

            //connect to avr and check state
            const connect = await this.denon.connect();

            if (!connect) {
                return false;
            }

            //start external integrations
            const startExternalIntegrations = this.restFul.enable || this.mqtt.enable ? await this.externalIntegrations() : false;

            //prepare data for accessory
            await this.prepareDataForAccessory();

            //prepare accessory
            if (this.startPrepareAccessory) {
                const accessory = await this.prepareAccessory();
                this.emit('publishAccessory', accessory);
                this.startPrepareAccessory = false;
            }

            return true;
        } catch (error) {
            throw new Error(`Start error: ${error}`);
        }
    }
}

export default Zone2;
