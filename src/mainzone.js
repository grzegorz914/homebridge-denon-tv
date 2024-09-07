'use strict';
const fs = require('fs');
const fsPromises = fs.promises;
const EventEmitter = require('events');
const RestFul = require('./restful.js');
const Mqtt = require('./mqtt.js');
const Denon = require('./denon.js');
const CONSTANTS = require('./constants.json');
let Accessory, Characteristic, Service, Categories, Encode, AccessoryUUID;

class MainZone extends EventEmitter {
    constructor(api, device, zone, name, host, port, generation, devInfoFile, inputsFile, inputsNamesFile, inputsTargetVisibilityFile, refreshInterval) {
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
        this.inputs = device.surrounds || [];
        this.inputsDisplayOrder = device.inputsDisplayOrder || 0;
        this.buttons = device.buttons || [];
        this.sensorPower = device.sensorPower || false;
        this.sensorVolume = device.sensorVolume || false
        this.sensorMute = device.sensorMute || false;
        this.sensorInput = device.sensorInput || false;
        this.sensorInputs = device.sensorInputs || [];
        this.enableDebugMode = device.enableDebugMode || false;
        this.disableLogInfo = device.disableLogInfo || false;
        this.disableLogDeviceInfo = device.disableLogDeviceInfo || false;
        this.disableLogConnectError = device.disableLogConnectError || false;
        this.infoButtonCommand = device.infoButtonCommand || 'MNINF';
        this.volumeControlNamePrefix = device.volumeControlNamePrefix || false;
        this.volumeControlName = device.volumeControlName || 'Volume';
        this.volumeControl = device.volumeControl || false;
        this.volumeMax = device.volumeMax || 100;
        this.masterPower = device.masterPower || false;
        this.refreshInterval = refreshInterval;
        this.devInfoFile = devInfoFile;
        this.inputsFile = inputsFile;
        this.inputsNamesFile = inputsNamesFile;
        this.inputsTargetVisibilityFile = inputsTargetVisibilityFile;
        this.startPrepareAccessory = true;

        //external integration
        this.restFul = device.restFul || {};
        this.restFulConnected = false;
        this.mqtt = device.mqtt || {};
        this.mqttConnected = false;

        //services
        this.allServices = [];
        this.sensorsInputsServices = [];
        this.buttonsServices = [];

        //inputs variable
        this.inputsConfigured = [];
        this.inputIdentifier = 1;

        //sensors variable
        this.sensorsInputsConfigured = [];
        for (const sensor of this.sensorInputs) {
            const sensorInputName = sensor.name ?? false;
            const sensorInputReference = sensor.reference ?? false;
            const sensorInputDisplayType = sensor.displayType ?? 0;
            if (sensorInputName && sensorInputReference && sensorInputDisplayType > 0) {
                sensor.serviceType = ['', Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][sensorInputDisplayType];
                sensor.characteristicType = ['', Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][sensorInputDisplayType];
                sensor.state = false;
                this.sensorsInputsConfigured.push(sensor);
            } else {
                const log = sensorInputDisplayType === 0 ? false : this.emit('message', `Sensor Name: ${sensorInputName ? sensorInputName : 'Missing'}, Reference: ${sensorInputReference ? sensorInputReference : 'Missing'}.`);
            };
        }
        this.sensorsInputsConfiguredCount = this.sensorsInputsConfigured.length || 0;
        this.sensorVolumeState = false;
        this.sensorInputState = false;

        //buttons variable
        this.buttonsConfigured = [];
        for (const button of this.buttons) {
            const buttonName = button.name ?? false;
            const buttonReference = button.reference ?? false;
            const buttonDisplayType = button.displayType ?? 0;
            if (buttonName && buttonReference && buttonDisplayType > 0) {
                button.serviceType = ['', Service.Outlet, Service.Switch][buttonDisplayType];
                button.state = false;
                this.buttonsConfigured.push(button);
            } else {
                const log = buttonDisplayType === 0 ? false : this.emit('message', `Button Name: ${buttonName ? buttonName : 'Missing'}, Reference: ${buttonReference ? buttonReference : 'Missing'}.`);
            };
        }
        this.buttonsConfiguredCount = this.buttonsConfigured.length || 0;

        //state variable
        this.startPrepareAccessory = true;
        this.power = false;
        this.reference = '';
        this.volume = 0;
        this.volumeControlType = 'Absolute';
        this.mute = true;
        this.mediaState = false;
        this.supportPictureMode = false;
        this.pictureMode = 0;
        this.brightness = 0;
        this.inputsNamesFile = inputsNamesFile;
        this.inputsTargetVisibilityFile = inputsTargetVisibilityFile;
    };

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
                debugLog: this.enableDebugMode,
                disableLogConnectError: this.disableLogConnectError
            });

            this.denon.on('deviceInfo', (manufacturer, modelName, serialNumber, firmwareRevision, deviceZones, apiVersion, supportPictureMode) => {
                if (!this.disableLogDeviceInfo) {
                    this.emit('devInfo', `-------- ${this.name} --------`);
                    this.emit('devInfo', `Manufacturer: ${manufacturer}`);
                    this.emit('devInfo', `Model: ${modelName}`);
                    this.emit('devInfo', `Zones: ${deviceZones}`);
                    this.emit('devInfo', `Control: Main Zone`);
                    this.emit('devInfo', `Firmware: ${firmwareRevision}`);
                    this.emit('devInfo', `Api version: ${apiVersion}`);
                    this.emit('devInfo', `Serialnr: ${serialNumber}`);
                    this.emit('devInfo', `----------------------------------`);
                }

                this.manufacturer = manufacturer;
                this.modelName = modelName;
                this.serialNumber = serialNumber;
                this.firmwareRevision = firmwareRevision;
                this.supportPictureMode = supportPictureMode;
            })
                .on('stateChanged', (power, reference, volume, volumeControlType, mute, pictureMode) => {
                    const input = this.inputsConfigured.find(input => input.reference === reference) ?? false;
                    const inputIdentifier = input ? input.identifier : this.inputIdentifier;
                    mute = power ? mute : true;
                    const pictureModeHomeKit = CONSTANTS.PictureModesConversionToHomeKit[pictureMode];

                    if (this.televisionService) {
                        this.televisionService
                            .updateCharacteristic(Characteristic.Active, power ? 1 : 0)
                            .updateCharacteristic(Characteristic.PictureMode, pictureModeHomeKit);
                    }

                    if (this.televisionService) {
                        this.televisionService
                            .updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier)
                    }

                    if (this.speakerService) {
                        this.speakerService
                            .updateCharacteristic(Characteristic.Active, power ? 1 : 0)
                            .updateCharacteristic(Characteristic.Volume, volume)
                            .updateCharacteristic(Characteristic.Mute, mute);

                        if (this.volumeService) {
                            this.volumeService
                                .updateCharacteristic(Characteristic.Brightness, volume)
                                .updateCharacteristic(Characteristic.On, !mute);
                        }

                        if (this.volumeServiceFan) {
                            this.volumeServiceFan
                                .updateCharacteristic(Characteristic.RotationSpeed, volume)
                                .updateCharacteristic(Characteristic.On, !mute);
                        }
                    }

                    //sensors
                    if (this.sensorPowerService) {
                        this.sensorPowerService
                            .updateCharacteristic(Characteristic.ContactSensorState, power)
                    }

                    if (this.sensorVolumeService && volume !== this.volume) {
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

                    if (this.sensorsInputsServices) {
                        for (let i = 0; i < this.sensorsInputsConfiguredCount; i++) {
                            const sensorInput = this.sensorsInputsConfigured[i];
                            const state = power ? sensorInput.reference === reference : false;
                            sensorInput.state = state;
                            const characteristicType = sensorInput.characteristicType;
                            this.sensorsInputsServices[i]
                                .updateCharacteristic(characteristicType, state);
                        }
                    }

                    //buttons
                    if (this.buttonsServices) {
                        for (let i = 0; i < this.buttonsConfiguredCount; i++) {
                            const button = this.buttonsConfigured[i];
                            const state = this.power ? button.reference === reference : false;
                            button.state = state;
                            this.buttonsServices[i]
                                .updateCharacteristic(Characteristic.On, state);
                        }
                    }

                    this.inputIdentifier = inputIdentifier;
                    this.power = power;
                    this.reference = reference;
                    this.volume = volume;
                    this.mute = mute;
                    this.volumeControlType = volumeControlType;
                    this.pictureMode = pictureModeHomeKit;

                    if (!this.disableLogInfo) {
                        const name = index !== -1 ? this.inputsConfigured[index].name : reference;
                        this.emit('message', `Power: ${power ? 'ON' : 'OFF'}`);
                        this.emit('message', `Input Name: ${name}`);
                        this.emit('message', `Reference: ${reference}`);
                        this.emit('message', `Volume: ${volume - 80}dB`);
                        this.emit('message', `Mute: ${mute ? 'ON' : 'OFF'}`);
                        this.emit('message', `Volume Control Type: ${volumeControlType}`);
                        this.emit('message', `Picture Mode: ${CONSTANTS.PictureModesDenonNumber[pictureMode]}`);
                    };
                })
                .on('startExternalIntegration', () => {
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
                                    };
                                })
                                .on('debug', (debug) => {
                                    this.emit('debug', debug);
                                })
                                .on('error', (error) => {
                                    this.emit('warn', error);
                                });
                        }

                        //mqtt client
                        const mqttEnabled = this.mqtt.enable || false;
                        if (mqttEnabled) {
                            this.mqtt1 = new Mqtt({
                                host: this.mqtt.host,
                                port: this.mqtt.port || 1883,
                                clientId: this.mqtt.clientId || `denon_${Math.random().toString(16).slice(3)}`,
                                prefix: `${this.mqtt.prefix}/${this.name}`,
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
                                        this.emit('warn', `MQTT set error: ${error}.`);
                                    };
                                })
                                .on('debug', (debug) => {
                                    this.emit('debug', debug);
                                })
                                .on('error', (error) => {
                                    this.emit('warn', error);
                                });
                        };
                    } catch (error) {
                        this.emit('warn', `External integration start error: ${error.message || error}.`);
                    };
                })
                .on('prepareAccessory', async (allInputs) => {
                    if (!this.startPrepareAccessory) {
                        return;
                    }

                    try {
                        //read inputs names from file
                        const savedInputsNames = await this.readData(this.inputsNamesFile);
                        this.savedInputsNames = savedInputsNames.toString().trim() !== '' ? JSON.parse(savedInputsNames) : {};
                        const debug = !this.enableDebugMode ? false : this.emit('debug', `Read saved Inputs Names: ${JSON.stringify(this.savedInputsNames, null, 2)}`);

                        //read inputs visibility from file
                        const savedInputsTargetVisibility = await this.readData(this.inputsTargetVisibilityFile);
                        this.savedInputsTargetVisibility = savedInputsTargetVisibility.toString().trim() !== '' ? JSON.parse(savedInputsTargetVisibility) : {};
                        const debug1 = !this.enableDebugMode ? false : this.emit('debug', `Read saved Inputs Target Visibility: ${JSON.stringify(this.savedInputsTargetVisibility, null, 2)}`);

                        //prepare accessory
                        const accessory = await this.prepareAccessory(allInputs);
                        this.emit('publishAccessory', accessory);

                        //sort inputs list
                        const sortInputsDisplayOrder = this.televisionService ? await this.displayOrder() : false;

                        this.startPrepareAccessory = false;
                    } catch (error) {
                        this.emit('error', `Prepare accessory error: ${error.message || error}, check again in 15s.`);
                    };
                })
                .on('success', (message) => {
                    this.emit('success', message);
                })
                .on('message', (message) => {
                    this.emit('message', message);
                })
                .on('debug', (debug) => {
                    this.emit('debug', debug);
                })
                .on('error', async (error) => {
                    this.emit('error', error);
                })
                .on('disconnected', (message) => {
                    this.emit('message', message);
                })
                .on('restFul', (path, data) => {
                    const restFul = this.restFulConnected ? this.restFul1.update(path, data) : false;
                })
                .on('mqtt', (topic, message) => {
                    const mqtt = this.mqttConnected ? this.mqtt1.emit('publish', topic, message) : false;
                });

            //connect to avr and check state
            await this.denon.connect();
            await this.denon.checkState();

            //start impulse generator 
            await this.denon.impulseGenerator.start([{ name: 'checkState', sampling: this.refreshInterval }]);

            return true;
        } catch (error) {
            await this.denon.impulseGenerato.stop();
            throw new Error(`Start error: ${error.message || error}, check again in 15s.`);
        };
    };

    async displayOrder() {
        try {
            switch (this.inputsDisplayOrder) {
                case 0:
                    this.inputsConfigured.sort((a, b) => a.identifier - b.identifier);
                    break;
                case 1:
                    this.inputsConfigured.sort((a, b) => a.name.localeCompare(b.name));
                    break;
                case 2:
                    this.inputsConfigured.sort((a, b) => b.name.localeCompare(a.name));
                    break;
                case 3:
                    this.inputsConfigured.sort((a, b) => a.reference.localeCompare(b.reference));
                    break;
                case 4:
                    this.inputsConfigured.sort((a, b) => b.reference.localeCompare(a.reference));
                    break;
            }
            const debug = !this.enableDebugMode ? false : this.emit('debug', `Inputs display order: ${JSON.stringify(this.inputsConfigured, null, 2)}`);

            const displayOrder = this.inputsConfigured.map(input => input.identifier);
            this.televisionService.setCharacteristic(Characteristic.DisplayOrder, Encode(1, displayOrder).toString('base64'));
            return true;
        } catch (error) {
            throw new Error(`Display order error: ${error.message || error}`);
        };
    }

    async saveData(path, data) {
        try {
            data = JSON.stringify(data, null, 2);
            await fsPromises.writeFile(path, data);
            const debug = this.debugLog ? this.emit('debug', `Saved data: ${data}`) : false;
            return true;
        } catch (error) {
            throw new Error(`Save data error: ${error.message || error}`);
        };
    }

    async readData(path) {
        try {
            const data = await fsPromises.readFile(path);
            return data;
        } catch (error) {
            throw new Error(`Read data error: ${error.message || error}`);
        };
    }

    async setOverExternalIntegration(integration, key, value) {
        try {
            let set = false
            switch (key) {
                case 'Power':
                    const powerState = this.masterPower ? (value ? 'PWON' : 'PWSTANDBY') : (value ? 'ZMON' : 'ZMOFF');
                    set = await this.denon.send(powerState)
                    break;
                case 'Input':
                    const input = `SI${value}`;
                    set = await this.denon.send(input);
                    break;
                case 'Volume':
                    const value1 = (value < 0 || value > 100) ? this.volume : (value < 10 ? `0${value}` : value);
                    const volume = `MV${value1}`;
                    set = await this.denon.send(volume);
                    break;
                case 'Mute':
                    const mute = value ? 'MUON' : 'MUOFF';
                    set = await this.denon.send(mute);
                    break;
                case 'Surround':
                    const surround = `MS${value}`;
                    set = await this.denon.send(surround);
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
            throw new Error(`${integration} set key: ${key}, value: ${value}, error: ${error.message || error}`);
        };
    }

    //prepare accessory
    async prepareAccessory(allInputs) {
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
                        const powerState = this.masterPower ? (state ? 'PWON' : 'PWSTANDBY') : (state ? 'ZMON' : 'ZMOFF');
                        await this.denon.send(powerState);
                        const info = this.disableLogInfo ? false : this.emit('message', `set Power: ${powerState}`);
                    } catch (error) {
                        this.emit('warn', `set Power error: ${error}`);
                    };
                });

            this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
                .onGet(async () => {
                    const inputIdentifier = this.inputIdentifier;
                    return inputIdentifier;
                })
                .onSet(async (activeIdentifier) => {
                    try {
                        const input = this.inputsConfigured.find(input => input.identifier === activeIdentifier);
                        const inputName = input.name;
                        const inputMode = input.mode;
                        const inputReference = input.reference;
                        const reference = `${inputMode}${inputReference}`;

                        switch (this.power) {
                            case false:
                                await new Promise(resolve => setTimeout(resolve, 4000));
                                const tryAgain = this.power ? this.televisionService.setCharacteristic(Characteristic.ActiveIdentifier, activeIdentifier) : false;
                                break;
                            case true:
                                await this.denon.send(reference);
                                const info = this.disableLogInfo ? false : this.emit('message', `set Input Name: ${inputName}, Reference: ${reference}`);
                                break;
                        }
                    } catch (error) {
                        this.emit('warn', `set Input error: ${error}`);
                    };
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
                        const info = this.disableLogInfo ? false : this.emit('message', `set Remote Key: ${command}`);
                    } catch (error) {
                        this.emit('warn', `set Remote Key error: ${error}`);
                    };
                });


            //optional television characteristics
            this.televisionService.getCharacteristic(Characteristic.Brightness)
                .onGet(async () => {
                    const brightness = this.brightness;
                    return brightness;
                })
                .onSet(async (value) => {
                    try {
                        const newValue = (value / 100) * 12;
                        const brightness = `PVBR ${(newValue)}`;
                        await this.denon.send(brightness);
                        const info = this.disableLogInfo ? false : this.emit('message', `set Brightness: ${value}`);
                    } catch (error) {
                        this.emit('warn', `set Brightness error: ${error}`);
                    };
                });

            if (this.supportPictureMode) {
                this.televisionService.getCharacteristic(Characteristic.PictureMode)
                    .onGet(async () => {
                        const pictureMode = this.pictureMode;
                        return pictureMode;
                    })
                    .onSet(async (command) => {
                        try {
                            switch (command) {
                                case Characteristic.PictureMode.OTHER: //0 off
                                    command = 'PVOFF';
                                    break;
                                case Characteristic.PictureMode.STANDARD: //1 standard
                                    command = 'PVSTD';
                                    break;
                                case Characteristic.PictureMode.CALIBRATED: //5 isf day
                                    command = 'PVDAY';
                                    break;
                                case Characteristic.PictureMode.CALIBRATED_DARK: //6 isf night
                                    command = 'PVNGT';
                                    break;
                                case Characteristic.PictureMode.VIVID: //3 vivid
                                    command = 'PVVVD';
                                    break;
                                case Characteristic.PictureMode.GAME: //4 streaming
                                    command = 'PVSTM';
                                    break;
                                case Characteristic.PictureMode.COMPUTER: //2 movie
                                    command = 'PVMOV';
                                    break;
                                case Characteristic.PictureMode.CUSTOM: //7 custom
                                    command = 'PVCTM';
                                    break;
                            }

                            await this.denon.send(command);
                            const info = this.disableLogInfo ? false : this.emit('message', `set Picture Mode: ${CONSTANTS.PictureModesDenonString[command]}`);
                        } catch (error) {
                            this.emit('warn', `set Picture Mode error: ${error}`);
                        };
                    });
            };

            this.televisionService.getCharacteristic(Characteristic.PowerModeSelection)
                .onSet(async (command) => {
                    try {
                        switch (command) {
                            case Characteristic.PowerModeSelection.SHOW:
                                command = 'MNOPT';
                                break;
                            case Characteristic.PowerModeSelection.HIDE:
                                command = 'MNRTN';
                                break;
                        }

                        await this.denon.send(command);
                        const info = this.disableLogInfo ? false : this.emit('message', `set Power Mode Selection: ${command === 'MNOPT' ? 'SHOW' : 'HIDE'}`);
                    } catch (error) {
                        this.emit('warn', `set Power Mode Selection error: ${error}`);
                    };
                });
            this.allServices.push(this.televisionService);

            //prepare speaker service
            const debug3 = !this.enableDebugMode ? false : this.emit('debug', `Prepare speaker service`);
            this.speakerService = accessory.addService(Service.TelevisionSpeaker, `${accessoryName} Speaker`, 'Speaker');
            this.speakerService.getCharacteristic(Characteristic.Active)
                .onGet(async () => {
                    const state = this.power;
                    return state;
                })
                .onSet(async (state) => {
                });
            this.speakerService.getCharacteristic(Characteristic.VolumeControlType)
                .onGet(async () => {
                    const controlType = this.volumeControlType === 'Relative' ? 1 : 3; //none, relative, relative with current, absolute
                    const state = 3;
                    return state;
                })
            this.speakerService.getCharacteristic(Characteristic.VolumeSelector)
                .onSet(async (command) => {
                    try {
                        switch (command) {
                            case Characteristic.VolumeSelector.INCREMENT:
                                command = 'MVUP';
                                break;
                            case Characteristic.VolumeSelector.DECREMENT:
                                command = 'MVDOWN';
                                break;
                        }

                        await this.denon.send(command);
                        const info = this.disableLogInfo ? false : this.emit('message', `set Volume Selector: ${command}`);
                    } catch (error) {
                        this.emit('warn', `set Volume Selector error: ${error}`);
                    };
                });

            this.speakerService.getCharacteristic(Characteristic.Volume)
                .setProps({
                    minValue: 0,
                    maxValue: this.volumeMax
                })
                .onGet(async () => {
                    const volume = this.volume;
                    return volume;
                })
                .onSet(async (value) => {
                    try {
                        value = value < 10 ? `0${value}` : value;
                        const volume = `MV${value}`;
                        await this.denon.send(volume);
                        const info = this.disableLogInfo ? false : this.emit('message', `set Volume: ${value - 80}`);
                    } catch (error) {
                        this.emit('warn', `set Volume error: ${error}`);
                    };
                });

            this.speakerService.getCharacteristic(Characteristic.Mute)
                .onGet(async () => {
                    const state = this.mute;
                    return state;
                })
                .onSet(async (state) => {
                    try {
                        const muteState = state ? 'MUON' : 'MUOFF';
                        await this.denon.send(muteState);
                        const info = this.disableLogInfo ? false : this.emit('message', `set Mute: ${state ? 'ON' : 'OFF'}`);
                    } catch (error) {
                        this.emit('warn', `set Mute error: ${error}`);
                    };
                });

            this.allServices.push(this.speakerService);

            //prepare inputs service
            const debug8 = !this.enableDebugMode ? false : this.emit('debug', `Prepare inputs services`);

            //check possible inputs count (max 85)
            const inputs = allInputs;
            const inputsCount = inputs.length;
            const possibleInputsCount = 85 - this.allServices.length;
            const maxInputsCount = inputsCount >= possibleInputsCount ? possibleInputsCount : inputsCount;
            for (let i = 0; i < maxInputsCount; i++) {
                //input
                const input = inputs[i];
                const inputIdentifier = i + 1;

                //get input reference
                const inputReference = input.reference;

                //get input name
                const savedInputsName = this.savedInputsNames[inputReference] ?? false;
                input.name = savedInputsName ? savedInputsName : input.name;

                //get type
                const inputSourceType = 0;

                //get configured
                const isConfigured = 1;

                //get visibility
                input.visibility = this.savedInputsTargetVisibility[inputReference] ?? 0;

                //add identifier to the input
                input.identifier = inputIdentifier;

                //input service
                const inputService = accessory.addService(Service.InputSource, input.name, `Input ${inputIdentifier}`);
                inputService
                    .setCharacteristic(Characteristic.Identifier, inputIdentifier)
                    .setCharacteristic(Characteristic.Name, input.name)
                    .setCharacteristic(Characteristic.IsConfigured, isConfigured)
                    .setCharacteristic(Characteristic.InputSourceType, inputSourceType)
                    .setCharacteristic(Characteristic.CurrentVisibilityState, input.visibility)

                inputService.getCharacteristic(Characteristic.ConfiguredName)
                    .onGet(async () => {
                        return input.name;
                    })
                    .onSet(async (value) => {
                        if (value === this.savedInputsNames[inputReference]) {
                            return;
                        }

                        try {
                            input.name = value;
                            this.savedInputsNames[inputReference] = value;
                            await this.saveData(this.inputsNamesFile, this.savedInputsNames);
                            const debug = !this.enableDebugMode ? false : this.emit('debug', `Saved Input Name: ${value}, Reference: ${inputReference}`);

                            //sort inputs
                            const index = this.inputsConfigured.findIndex(input => input.reference === inputReference);
                            this.inputsConfigured[index].name = value;
                            await this.displayOrder();
                        } catch (error) {
                            this.emit('warn', `save Input Name error: ${error}`);
                        }
                    });

                inputService.getCharacteristic(Characteristic.TargetVisibilityState)
                    .onGet(async () => {
                        return input.visibility;
                    })
                    .onSet(async (state) => {
                        if (state === this.savedInputsTargetVisibility[inputReference]) {
                            return;
                        }

                        try {
                            input.visibility = state;
                            this.savedInputsTargetVisibility[inputReference] = state;
                            await this.saveData(this.inputsTargetVisibilityFile, this.savedInputsTargetVisibility);
                            const debug = !this.enableDebugMode ? false : this.emit('debug', `Saved  Input: ${input.name} Target Visibility: ${state ? 'HIDEN' : 'SHOWN'}`);
                        } catch (error) {
                            this.emit('warn', `save Input Target Visibility error: ${error}`);
                        }
                    });

                this.inputsConfigured.push(input);
                this.televisionService.addLinkedService(inputService);
                this.allServices.push(inputService);
            };

            //prepare volume service
            if (this.volumeControl) {
                const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare volume service`);
                const volumeServiceName = this.volumeControlNamePrefix ? `${accessoryName} ${this.volumeControlName}` : this.volumeControlName;
                if (this.volumeControl === 1) {
                    this.volumeService = accessory.addService(Service.Lightbulb, `${volumeServiceName}`, 'Volume');
                    this.volumeService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    this.volumeService.setCharacteristic(Characteristic.ConfiguredName, `${volumeServiceName}`);
                    this.volumeService.getCharacteristic(Characteristic.Brightness)
                        .setProps({
                            minValue: 0,
                            maxValue: this.volumeMax
                        })
                        .onGet(async () => {
                            const volume = this.volume;
                            return volume;
                        })
                        .onSet(async (volume) => {
                            this.speakerService.setCharacteristic(Characteristic.Volume, volume);
                        });
                    this.volumeService.getCharacteristic(Characteristic.On)
                        .onGet(async () => {
                            const state = !this.mute;
                            return state;
                        })
                        .onSet(async (state) => {
                            this.speakerService.setCharacteristic(Characteristic.Mute, !state);
                        });

                    this.allServices.push(this.volumeService);
                }

                if (this.volumeControl === 2) {
                    this.volumeServiceFan = accessory.addService(Service.Fan, `${volumeServiceName}`, 'Volume');
                    this.volumeServiceFan.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    this.volumeServiceFan.setCharacteristic(Characteristic.ConfiguredName, `${volumeServiceName}`);
                    this.volumeServiceFan.getCharacteristic(Characteristic.RotationSpeed)
                        .setProps({
                            minValue: 0,
                            maxValue: this.volumeMax
                        })
                        .onGet(async () => {
                            const volume = this.volume;
                            return volume;
                        })
                        .onSet(async (volume) => {
                            this.speakerService.setCharacteristic(Characteristic.Volume, volume);
                        });
                    this.volumeServiceFan.getCharacteristic(Characteristic.On)
                        .onGet(async () => {
                            const state = !this.mute;
                            return state;
                        })
                        .onSet(async (state) => {
                            this.speakerService.setCharacteristic(Characteristic.Mute, !state);
                        });

                    this.allServices.push(this.volumeServiceFan);
                }
            };

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
            };

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
            };

            if (this.sensorMute) {
                const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare mute sensor service`);
                this.sensorMuteService = accessory.addService(Service.ContactSensor, `${this.sZoneName} Mute Sensor`, `Mute Sensor`);
                this.sensorMuteService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorMuteService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Mute Sensor`);
                this.sensorMuteService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.power ? this.mute : false;
                        return state;
                    });

                this.allServices.push(this.sensorMuteService);
            };

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
            };

            //prepare sonsor service
            const possibleSensorInputsCount = 99 - this.allServices.length;
            const maxSensorInputsCount = this.sensorsInputsConfiguredCount >= possibleSensorInputsCount ? possibleSensorInputsCount : this.sensorsInputsConfiguredCount;
            if (maxSensorInputsCount > 0) {
                const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare inputs sensors services`);
                for (let i = 0; i < maxSensorInputsCount; i++) {
                    //get sensor
                    const sensorInput = this.sensorsInputsConfigured[i];

                    //get sensor name		
                    const sensorInputName = sensorInput.name;

                    //get sensor name prefix
                    const namePrefix = sensorInput.namePrefix || false;

                    //get service type
                    const serviceType = sensorInput.serviceType;

                    //get service type
                    const characteristicType = sensorInput.characteristicType;

                    const serviceName = namePrefix ? `${accessoryName} ${sensorInputName}` : sensorInputName;
                    const sensorInputService = new serviceType(serviceName, `Sensor ${i}`);
                    sensorInputService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    sensorInputService.setCharacteristic(Characteristic.ConfiguredName, serviceName);
                    sensorInputService.getCharacteristic(characteristicType)
                        .onGet(async () => {
                            const state = sensorInput.state
                            return state;
                        });
                    this.sensorsInputsServices.push(sensorInputService);
                    this.allServices.push(sensorInputService);
                    accessory.addService(sensorInputService);
                }
            }

            //prepare buttons services
            const possibleButtonsCount = 99 - this.allServices.length;
            const maxButtonsCount = this.buttonsConfiguredCount >= possibleButtonsCount ? possibleButtonsCount : this.buttonsConfiguredCount;
            if (maxButtonsCount > 0) {
                const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare buttons services`);
                for (let i = 0; i < maxButtonsCount; i++) {
                    //get button
                    const button = this.buttonsConfigured[i];

                    //get button name
                    const buttonName = button.name;

                    //get button reference
                    const buttonReference = button.reference;

                    //get button name prefix
                    const namePrefix = button.namePrefix || false;

                    //get service type
                    const serviceType = button.serviceType;

                    const serviceName = namePrefix ? `${accessoryName} ${buttonName}` : buttonName;
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
                                const directSound = CONSTANTS.DirectSoundMode[buttonReference] ?? false;
                                const directSoundModeMode = directSound ? directSound.mode : false;
                                const directSoundModeSurround = directSound ? directSound.surround : false;
                                const command = directSound ? directSoundModeMode : buttonReference.substring(1);
                                const reference = command;

                                const set = state ? await this.denon.send(reference) : false;
                                const set2 = state && directSound ? await this.denon.send(directSoundModeSurround) : false;
                                const info = this.disableLogInfo || !state ? false : this.emit('message', `set Button Name: ${buttonName}, Reference: ${reference}`);
                            } catch (error) {
                                this.emit('warn', `set Button error: ${error}`);
                            };
                        });

                    this.buttonsServices.push(buttonService);
                    this.allServices.push(buttonService);
                    accessory.addService(buttonService);
                };
            };

            return accessory;
        } catch (error) {
            throw new Error(error)
        };
    }
};

module.exports = MainZone;
