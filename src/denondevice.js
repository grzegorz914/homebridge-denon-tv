'use strict';
const fs = require('fs');
const fsPromises = fs.promises;
const EventEmitter = require('events');
const RestFul = require('./restful.js');
const Mqtt = require('./mqtt.js');
const Denon = require('./denon.js');
const CONSTANS = require('./constans.json');
let Accessory, Characteristic, Service, Categories, Encode, UUID;

class DenonDevice extends EventEmitter {
    constructor(api, prefDir, zone, config) {
        super();

        Accessory = api.platformAccessory;
        Characteristic = api.hap.Characteristic;
        Service = api.hap.Service;
        Categories = api.hap.Categories;
        Encode = api.hap.encode;
        UUID = api.hap.uuid;

        //device configuration
        this.zone = zone;
        this.name = config.name;
        this.host = config.host;
        this.port = config.port;
        this.supportOldAvr = config.supportOldAvr || false;
        this.getInputsFromDevice = config.getInputsFromDevice || false;
        this.getFavoritesFromDevice = this.getInputsFromDevice ? config.getFavoritesFromDevice : false;
        this.getQuickSmartSelectFromDevice = this.getInputsFromDevice ? config.getQuickSmartSelectFromDevice : false;
        this.inputs = config.inputs || [];
        this.inputsDisplayOrder = config.inputsDisplayOrder || 0;
        this.surrounds = config.surrounds || [];
        this.buttons = config.buttons || [];
        this.sensorPower = config.sensorPower || false;
        this.sensorVolume = config.sensorVolume || false
        this.sensorMute = config.sensorMute || false;
        this.sensorInput = config.sensorInput || false;
        this.sensorInputs = config.sensorInputs || [];
        this.enableDebugMode = config.enableDebugMode || false;
        this.disableLogInfo = config.disableLogInfo || false;
        this.disableLogDeviceInfo = config.disableLogDeviceInfo || false;
        this.disableLogConnectError = config.disableLogConnectError || false;
        this.masterPower = config.masterPower || false;
        this.masterVolume = config.masterVolume || false;
        this.masterMute = config.masterMute || false;
        this.infoButtonCommand = config.infoButtonCommand || 'MNINF';
        this.volumeControl = config.volumeControl >= 0 ? config.volumeControl : -1;
        this.refreshInterval = config.refreshInterval || 5;
        this.restFulEnabled = config.enableRestFul || false;
        this.restFulPort = config.restFulPort || 3000;
        this.restFulDebug = config.restFulDebug || false;
        this.mqttEnabled = config.enableMqtt || false;
        this.mqttHost = config.mqttHost;
        this.mqttPort = config.mqttPort || 1883;
        this.mqttClientId = config.mqttClientId || `denon_${Math.random().toString(16).slice(3)}`;
        this.mqttPrefix = config.mqttPrefix;
        this.mqttAuth = config.mqttAuth || false;
        this.mqttUser = config.mqttUser;
        this.mqttPasswd = config.mqttPasswd;
        this.mqttDebug = config.mqttDebug || false;

        //zones
        this.zoneName = CONSTANS.ZoneName[zone];
        this.sZoneName = CONSTANS.ZoneNameShort[zone];
        this.zoneInputSurroundName = CONSTANS.ZoneInputSurroundName[zone];

        //setup variables
        this.firstRun = true;
        this.restFulConnected = false;
        this.mqttConnected = false;

        this.inputsConfigured = [];
        this.sensorInputs = [];

        this.allServices = [];
        this.sensorsInputsServices = [];
        this.buttonsServices = [];

        this.power = false;
        this.reference = '';
        this.volume = 0;
        this.volumeControlType = ';';
        this.mute = true;
        this.mediaState = false;
        this.inputIdentifier = 1;
        this.supportPictureMode = false;
        this.pictureMode = 0;
        this.brightness = 0;
        this.sensorVolumeState = false;
        this.sensorInputState = false;

        //check files exists, if not then create it
        const postFix = `${this.sZoneName}${this.host.split('.').join('')}`
        this.devInfoFile = `${prefDir}/devInfo_${postFix}`;
        this.inputsFile = `${prefDir}/inputs_${postFix}`;
        this.inputsNamesFile = `${prefDir}/inputsNames_${postFix}`;
        this.inputsTargetVisibilityFile = `${prefDir}/inputsTargetVisibility_${postFix}`;

        try {
            const files = [
                this.devInfoFile,
                this.inputsFile,
                this.inputsNamesFile,
                this.inputsTargetVisibilityFile,
            ];

            files.forEach((file) => {
                if (!fs.existsSync(file)) {
                    fs.writeFileSync(file, '');
                }
            });
        } catch (error) {
            this.emit('error', `prepare files error: ${error}`);
        }

        //RESTFul server
        if (this.restFulEnabled) {
            this.restFul = new RestFul({
                port: this.restFulPort,
                debug: this.restFulDebug
            });

            this.restFul.on('connected', (message) => {
                this.emit('message', `${message}`);
                this.restFulConnected = true;
            })
                .on('error', (error) => {
                    this.emit('error', error);
                })
                .on('debug', (debug) => {
                    this.emit('debug', debug);
                });
        }

        //MQTT client
        if (this.mqttEnabled) {
            this.mqtt = new Mqtt({
                host: this.mqttHost,
                port: this.mqttPort,
                clientId: this.mqttClientId,
                user: this.mqttUser,
                passwd: this.mqttPasswd,
                prefix: `${this.mqttPrefix}/${this.name}`,
                debug: this.mqttDebug
            });

            this.mqtt.on('connected', (message) => {
                this.emit('message', message);
                this.mqttConnected = true;
            })
                .on('debug', (debug) => {
                    this.emit('debug', debug);
                })
                .on('error', (error) => {
                    this.emit('error', error);
                });
        };

        //denon client
        this.denon = new Denon({
            host: this.host,
            port: this.port,
            supportOldAvr: this.supportOldAvr,
            debugLog: this.enableDebugMode,
            disableLogConnectError: this.disableLogConnectError,
            zoneControl: this.zone,
            refreshInterval: this.refreshInterval,
            restFulEnabled: this.restFulEnabled,
            mqttEnabled: this.mqttEnabled
        });

        this.denon.on('deviceInfo', async (devInfo, manufacturer, modelName, serialNumber, firmwareRevision, zones, apiVersion, supportPictureMode, supportFavorites, supportShortcut, supportInputSource, supportQuickSmartSelect) => {
            try {
                if (!this.disableLogDeviceInfo) {
                    this.emit('devInfo', `-------- ${this.name} --------`);
                    this.emit('devInfo', `Manufacturer: ${manufacturer}`);
                    this.emit('devInfo', `Model: ${modelName}`);
                    if (this.zone === 0) {
                        this.emit('devInfo', `Zones: ${zones}`);
                        this.emit('devInfo', `Control: Main Zone`);
                        this.emit('devInfo', `Firmware: ${firmwareRevision}`);
                        this.emit('devInfo', `Api version: ${apiVersion}`);
                        this.emit('devInfo', `Serialnr: ${serialNumber}`);
                    }
                    if (this.zone === 1) {
                        this.emit('devInfo', `Control: Zone 2`);
                    }
                    if (this.zone === 2) {
                        this.emit('devInfo', `Control: Zone 3`);
                    }
                    if (this.zone === 3) {
                        this.emit('devInfo', `Control: Sound Modes`);
                    }
                    this.emit('devInfo', `----------------------------------`);
                }

                this.manufacturer = manufacturer;
                this.modelName = modelName;
                this.serialNumber = serialNumber;
                this.firmwareRevision = firmwareRevision;
                this.supportPictureMode = supportPictureMode;

                //save device info to the file
                if (this.zone === 0) {
                    try {
                        const info = JSON.stringify(devInfo, null, 2);
                        await fsPromises.writeFile(this.devInfoFile, info);
                        const debug = this.enableDebugMode ? this.emit('message', `saved device info: ${info}`) : false;
                    } catch (error) {
                        this.emit('error', `save device info error: ${error}`);
                    };
                }

                //save inputs fav and shortcuts to the file
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
                    const deviceInputs = this.getInputsFromDevice && supportInputSource ? devInfo.DeviceZoneCapabilities[this.zone].InputSource.List.Source : [];
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

                    const deviceSchortcuts = this.getInputsFromDevice && supportShortcut ? devInfo.DeviceZoneCapabilities[this.zone].ShortcutControl.EntryList.Shortcut : [];
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

                    const deviceQuickSmartSelect = this.getQuickSmartSelectFromDevice && supportQuickSmartSelect ? devInfo.DeviceZoneCapabilities[this.zone].Operation.QuickSelect : [];
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

                    const allInputsArr = this.zone <= 2 ? this.getInputsFromDevice ? inputsArr : this.inputs : this.surrounds;
                    const inputs = JSON.stringify(allInputsArr, null, 2);
                    await fsPromises.writeFile(this.inputsFile, inputs);
                    const debug = this.enableDebugMode ? this.emit('message', `saved ${this.zoneInputSurroundName}: ${inputs}`) : false;
                } catch (error) {
                    this.emit('error', `save ${this.zoneInputSurroundName} error: ${error}`);
                }
            } catch (error) {
                this.emit('error', `create files error: ${error}`);
            };
        })
            .on('stateChanged', (power, reference, volume, volumeControlType, mute, pictureMode) => {
                const index = this.inputsConfigured.findIndex(input => input.reference === reference) ?? -1;
                const inputIdentifier = index !== -1 ? this.inputsConfigured[index].identifier : this.inputIdentifier;
                mute = power ? mute : true;
                pictureMode = CONSTANS.PictureModesConversionToHomeKit[pictureMode];

                if (this.televisionService) {
                    this.televisionService
                        .updateCharacteristic(Characteristic.Active, power)
                        .updateCharacteristic(Characteristic.PictureMode, pictureMode);
                }

                if (this.televisionService && inputIdentifier !== -1) {
                    this.televisionService
                        .updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier)
                }

                if (this.tvSpeakerService) {
                    this.tvSpeakerService
                        .updateCharacteristic(Characteristic.Active, power)
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

                if (this.sensorPowerService) {
                    this.sensorPowerService
                        .updateCharacteristic(Characteristic.ContactSensorState, power)
                }

                if (this.sensorVolumeService) {
                    const state = power ? (this.volume !== volume) : false;
                    this.sensorVolumeService
                        .updateCharacteristic(Characteristic.ContactSensorState, state)
                    this.sensorVolumeState = state;
                }

                if (this.sensorMuteService) {
                    const state = power ? mute : false;
                    this.sensorMuteService
                        .updateCharacteristic(Characteristic.ContactSensorState, state)
                }

                if (this.sensorInputService && inputIdentifier !== -1) {
                    const state = power ? this.inputIdentifier !== inputIdentifier : false;
                    this.sensorInputService
                        .updateCharacteristic(Characteristic.ContactSensorState, state)
                    this.sensorInputState = state;
                }

                if (reference !== undefined) {
                    this.reference = reference;
                    if (this.sensorsInputsServices) {
                        const servicesCount = this.sensorsInputsServices.length;
                        for (let i = 0; i < servicesCount; i++) {
                            const state = power ? (this.sensorInputs[i].reference === reference) : false;
                            const displayType = this.sensorInputs[i].displayType;
                            const characteristicType = [Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][displayType];
                            this.sensorsInputsServices[i]
                                .updateCharacteristic(characteristicType, state);
                        }
                    }
                }

                this.inputIdentifier = inputIdentifier;
                this.power = power;
                this.volume = volume;
                this.volumeControlType = volumeControlType;
                this.mute = mute;
                this.pictureMode = pictureMode;
            })
            .on('prepareAccessory', async () => {
                try {
                    //read inputs file
                    try {
                        const data = await fsPromises.readFile(this.inputsFile);
                        this.savedInputs = data.length > 0 ? JSON.parse(data) : (this.zone <= 2 ? this.inputs : this.surrounds);
                        const debug = this.enableDebugMode ? this.emit('debug', `Read saved ${this.zoneInputSurroundName}: ${JSON.stringify(this.savedInputs, null, 2)}`) : false;
                    } catch (error) {
                        this.emit('error', `Read saved ${this.zoneInputSurroundName} error: ${error}`);
                    };

                    //read inputs names from file
                    try {
                        const data = await fsPromises.readFile(this.inputsNamesFile);
                        this.savedInputsNames = data.length > 0 ? JSON.parse(data) : {};
                        const debug = this.enableDebugMode ? this.emit('debug', `Read saved ${this.zoneInputSurroundName} Names: ${JSON.stringify(this.savedInputsNames, null, 2)}`) : false;
                    } catch (error) {
                        this.emit('error', `Read saved ${this.zoneInputSurroundName} Names error: ${error}`);
                    };

                    //read inputs visibility from file
                    try {
                        const data = await fsPromises.readFile(this.inputsTargetVisibilityFile);
                        this.savedInputsTargetVisibility = data.length > 0 ? JSON.parse(data) : {};
                        const debug = this.enableDebugMode ? this.emit('debug', `Read saved ${this.zoneInputSurroundName} Target Visibility: ${JSON.stringify(this.savedInputsTargetVisibility, null, 2)}`) : false;
                    } catch (error) {
                        this.emit('error', `Read saved ${this.zoneInputSurroundName} Target Visibility error: ${error}`);
                    };

                    await new Promise(resolve => setTimeout(resolve, 2000));
                    const accessory = await this.prepareAccessory();
                    this.emit('publishAccessory', accessory);
                } catch (error) {
                    this.emit('error', `prepare accessory error: ${error}`);
                };
            })
            .on('message', (message) => {
                this.emit('message', message);
            })
            .on('debug', (debug) => {
                this.emit('debug', debug);
            })
            .on('error', (error) => {
                this.emit('error', error);
            })
            .on('restFul', (path, data) => {
                const restFul = this.restFulConnected ? this.restFul.update(path, data) : false;
            })
            .on('mqtt', (topic, message) => {
                const mqtt = this.mqttConnected ? this.mqtt.send(topic, message) : false;
            })
            .on('disconnected', (message) => {
                this.emit('message', message);
            });
    };

    //prepare accessory
    prepareAccessory() {
        return new Promise((resolve, reject) => {
            try {
                //accessory
                const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare accessory`);
                const zoneControl = this.zone;
                const accessoryName = this.name;
                const accessoryUUID = UUID.generate(this.serialNumber + zoneControl);
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
                this.televisionService = new Service.Television(`${accessoryName} Television`, 'Television');
                this.televisionService.setCharacteristic(Characteristic.ConfiguredName, accessoryName);
                this.televisionService.setCharacteristic(Characteristic.SleepDiscoveryMode, 1);

                this.televisionService.getCharacteristic(Characteristic.Active)
                    .onGet(async () => {
                        const state = this.power;
                        const info = this.disableLogInfo || this.firstRun ? false : this.emit('message', `Power: ${state ? 'ON' : 'OFF'}`);
                        return state;
                    })
                    .onSet(async (state) => {
                        if (this.power == state) {
                            return;
                        }

                        try {
                            const masterControl = this.masterPower ? 4 : zoneControl;
                            const powerState = [(state ? 'ZMON' : 'ZMOFF'), (state ? 'Z2ON' : 'Z2OFF'), (state ? 'Z3ON' : 'Z3OFF'), (state ? 'ZMON' : 'ZMOFF'), (state ? 'PWON' : 'PWSTANDBY')][masterControl];

                            await this.denon.send(powerState);
                            const info = this.disableLogInfo || this.firstRun ? false : this.emit('message', `set Power: ${powerState}`);
                        } catch (error) {
                            this.emit('error', `set Power error: ${error}`);
                        };
                    });

                this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
                    .onGet(async () => {
                        const inputIdentifier = this.inputIdentifier;
                        const inputName = this.inputsConfigured[inputIdentifier].name;
                        const inputReference = this.inputsConfigured[inputIdentifier].reference;
                        const info = this.disableLogInfo || this.firstRun ? false : this.emit('message', `${this.zoneInputSurroundName} Name: ${inputName}, Reference: ${inputReference}`);
                        return inputIdentifier;
                    })
                    .onSet(async (inputIdentifier) => {
                        try {
                            const index = this.inputsConfigured.findIndex(input => input.identifier === inputIdentifier) ?? this.inputIdentifier;
                            const inputName = this.inputsConfigured[index].name;
                            const inputMode = this.inputsConfigured[index].mode;
                            const inputReference = this.inputsConfigured[index].reference;
                            const zone = [inputMode, 'Z2', 'Z3', inputMode][zoneControl];
                            const reference = zone + inputReference;

                            switch (this.power) {
                                case false:
                                    await new Promise(resolve => setTimeout(resolve, 3000));
                                    const tryAgain = this.power ? false : this.televisionService.setCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
                                    break;
                                case true:
                                    await this.denon.send(reference);
                                    const info = this.disableLogInfo || this.firstRun ? false : this.emit('message', `set ${this.zoneInputSurroundName} Name: ${inputName}, Reference: ${inputReference}`);
                                    break;
                            }
                        } catch (error) {
                            this.emit('error', `set ${this.zoneInputSurroundName} error: ${error}`);
                        };
                    });

                this.televisionService.getCharacteristic(Characteristic.RemoteKey)
                    .onSet(async (command) => {
                        try {
                            if (this.inputReference === 'SPOTIFY' || this.inputReference === 'BT' || this.inputReference === 'USB/IPOD' || this.inputReference === 'NET' || this.inputReference === 'MPLAY') {
                                switch (command) {
                                    case Characteristic.RemoteKey.REWIND:
                                        command = 'NS9E';
                                        break;
                                    case Characteristic.RemoteKey.FAST_FORWARD:
                                        command = 'NS9D';
                                        break;
                                    case Characteristic.RemoteKey.NEXT_TRACK:
                                        command = 'MN9D';
                                        break;
                                    case Characteristic.RemoteKey.PREVIOUS_TRACK:
                                        command = 'MN9E';
                                        break;
                                    case Characteristic.RemoteKey.ARROW_UP:
                                        command = 'NS90';
                                        break;
                                    case Characteristic.RemoteKey.ARROW_DOWN:
                                        command = 'NS91';
                                        break;
                                    case Characteristic.RemoteKey.ARROW_LEFT:
                                        command = 'NS92';
                                        break;
                                    case Characteristic.RemoteKey.ARROW_RIGHT:
                                        command = 'NS93';
                                        break;
                                    case Characteristic.RemoteKey.SELECT:
                                        command = 'NS94';
                                        break;
                                    case Characteristic.RemoteKey.BACK:
                                        command = 'MNRTN';
                                        break;
                                    case Characteristic.RemoteKey.EXIT:
                                        command = 'MNRTN';
                                        break;
                                    case Characteristic.RemoteKey.PLAY_PAUSE:
                                        command = this.mediaState ? 'NS9B' : 'NS9A';
                                        this.mediaState = !this.mediaState;
                                        break;
                                    case Characteristic.RemoteKey.INFORMATION:
                                        command = this.infoButtonCommand;
                                        break;
                                }
                            } else {
                                switch (command) {
                                    case Characteristic.RemoteKey.REWIND:
                                        command = 'MN9E';
                                        break;
                                    case Characteristic.RemoteKey.FAST_FORWARD:
                                        command = 'MN9D';
                                        break;
                                    case Characteristic.RemoteKey.NEXT_TRACK:
                                        command = 'MN9F';
                                        break;
                                    case Characteristic.RemoteKey.PREVIOUS_TRACK:
                                        command = 'MN9G';
                                        break;
                                    case Characteristic.RemoteKey.ARROW_UP:
                                        command = 'MNCUP';
                                        break;
                                    case Characteristic.RemoteKey.ARROW_DOWN:
                                        command = 'MNCDN';
                                        break;
                                    case Characteristic.RemoteKey.ARROW_LEFT:
                                        command = 'MNCLT';
                                        break;
                                    case Characteristic.RemoteKey.ARROW_RIGHT:
                                        command = 'MNCRT';
                                        break;
                                    case Characteristic.RemoteKey.SELECT:
                                        command = 'MNENT';
                                        break;
                                    case Characteristic.RemoteKey.BACK:
                                        command = 'MNRTN';
                                        break;
                                    case Characteristic.RemoteKey.EXIT:
                                        command = 'MNRTN';
                                        break;
                                    case Characteristic.RemoteKey.PLAY_PAUSE:
                                        command = 'NS94';
                                        break;
                                    case Characteristic.RemoteKey.INFORMATION:
                                        command = this.infoButtonCommand;
                                        break;
                                }
                            }

                            await this.denon.send(command);
                            const info = this.disableLogInfo || this.firstRun ? false : this.emit('message', `set Remote Key: ${command}`);
                        } catch (error) {
                            this.emit('error', `set Remote Key error: ${error}`);
                        };
                    });


                //optional television characteristics
                if (zoneControl === 0) {
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
                                const info = this.disableLogInfo || this.firstRun ? false : this.emit('message', `set Brightness: ${value}`);
                            } catch (error) {
                                this.emit('error', `set Brightness error: ${error}`);
                            };
                        });

                    if (this.supportPictureMode) {
                        this.televisionService.getCharacteristic(Characteristic.PictureMode)
                            .onGet(async () => {
                                const pictureMode = this.pictureMode;
                                const info = this.disableLogInfo || this.firstRun ? false : this.emit('message', `Picture Mode: ${CONSTANS.PictureModesDenonNumber[pictureMode]}`);
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
                                    const info = this.disableLogInfo || this.firstRun ? false : this.emit('message', `set Picture Mode: ${CONSTANS.PictureModesDenonString[command]}`);
                                } catch (error) {
                                    this.emit('error', `set Picture Mode error: ${error}`);
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
                                const info = this.disableLogInfo || this.firstRun ? false : this.emit('message', `set Power Mode Selection: ${command === 'MNOPT' ? 'SHOW' : 'HIDE'}`);
                            } catch (error) {
                                this.emit('error', `set Power Mode Selection error: ${error}`);
                            };
                        });
                };

                this.allServices.push(this.televisionService);
                accessory.addService(this.televisionService);

                //prepare speaker service
                const debug3 = !this.enableDebugMode ? false : this.emit('debug', `Prepare speaker service`);
                this.tvSpeakerService = new Service.TelevisionSpeaker(`${accessoryName} Speaker`, 'Speaker');
                this.tvSpeakerService.getCharacteristic(Characteristic.Active)
                    .onGet(async () => {
                        const state = this.power;
                        return state;
                    })
                    .onSet(async (state) => {
                    });
                this.tvSpeakerService.getCharacteristic(Characteristic.VolumeControlType)
                    .onGet(async () => {
                        const controlType = this.volumeControlType;
                        const state = 3; //none, relative, relative with current, absolute
                        return state;
                    })
                this.tvSpeakerService.getCharacteristic(Characteristic.VolumeSelector)
                    .onSet(async (command) => {
                        try {
                            const masterControl = this.masterVolume ? 0 : zoneControl;
                            switch (command) {
                                case Characteristic.VolumeSelector.INCREMENT:
                                    command = ['MVUP', 'Z2UP', 'Z3UP', 'MVUP'][masterControl];
                                    break;
                                case Characteristic.VolumeSelector.DECREMENT:
                                    command = ['MVDOWN', 'Z2DOWN', 'Z3DOWN', 'MVDOWN'][masterControl];
                                    break;
                            }

                            await this.denon.send(command);
                            const info = this.disableLogInfo || this.firstRun ? false : this.emit('message', `set Volume Selector: ${command}`);
                        } catch (error) {
                            this.emit('error', `set Volume Selector error: ${error}`);
                        };
                    });

                this.tvSpeakerService.getCharacteristic(Characteristic.Volume)
                    .onGet(async () => {
                        const volume = this.volume;
                        const info = this.disableLogInfo || this.firstRun ? false : this.emit('message', `Volume: ${volume - 80}`);
                        return volume;
                    })
                    .onSet(async (value) => {
                        try {
                            value = (value === 0 || value === 100) ? this.volume : (value < 10 ? `0${value}` : value);
                            const masterControl = this.masterVolume ? 0 : zoneControl;
                            const volume = [`MV${value}`, `Z2${value}`, `Z3${value}`, `MV${value}`][masterControl];
                            await this.denon.send(volume);
                            const info = this.disableLogInfo || this.firstRun ? false : this.emit('message', `set Volume: ${value - 80}`);
                        } catch (error) {
                            this.emit('error', `set Volume error: ${error}`);
                        };
                    });

                this.tvSpeakerService.getCharacteristic(Characteristic.Mute)
                    .onGet(async () => {
                        const state = this.mute;
                        const info = this.disableLogInfo || this.firstRun ? false : this.emit('message', `Mute: ${state ? 'ON' : 'OFF'}`);
                        return state;
                    })
                    .onSet(async (state) => {
                        try {
                            const masterControl = this.masterMute ? 0 : zoneControl;
                            const muteState = [(state ? 'MUON' : 'MUOFF'), (state ? 'Z2MUON' : 'Z2MUOFF'), (state ? 'Z3MUON' : 'Z3MUOFF'), (state ? 'MUON' : 'MUOFF')][masterControl];

                            await this.denon.send(muteState);
                            const info = this.disableLogInfo || this.firstRun ? false : this.emit('message', `set Mute: ${state ? 'ON' : 'OFF'}`);
                        } catch (error) {
                            this.emit('error', `set Mute error: ${error}`);
                        };
                    });

                this.allServices.push(this.tvSpeakerService);
                accessory.addService(this.tvSpeakerService);

                //prepare inputs service
                const debug8 = !this.enableDebugMode ? false : this.emit('debug', `Prepare input services`);

                //check possible inputs count (max 85)
                const inputs = this.savedInputs;
                const inputsCount = inputs.length;
                const possibleInputsCount = 85 - this.allServices.length;
                const maxInputsCount = inputsCount >= possibleInputsCount ? possibleInputsCount : inputsCount;
                let inputIdentifier = 0;
                for (let i = 0; i < maxInputsCount; i++) {
                    //input
                    const input = inputs[i];

                    //get input reference
                    const inputReference = input.reference;

                    //get input name
                    const name = input.name ?? 'App/Input';
                    const savedInputsNames = this.savedInputsNames[inputReference] ?? false;
                    const inputName = !savedInputsNames ? name : savedInputsNames;

                    //get visibility
                    const currentVisibility = this.savedInputsTargetVisibility[inputReference] ?? 0;

                    input.identifier = inputIdentifier++;
                    input.name = inputName;
                    input.visibility = currentVisibility;
                    this.inputsConfigured.push(input);
                }

                //sort inputs list
                switch (this.inputsDisplayOrder) {
                    case 0:
                        this.inputsConfigured = this.inputsConfigured;
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

                for (const input of this.inputsConfigured) {
                    //get identifier
                    const inputIdentifier = input.identifier;

                    //get input reference
                    const inputReference = input.reference;

                    //get input name
                    const inputName = input.name;

                    //get mode
                    const inputMode = zoneControl <= 2 ? input.mode : 'MS';

                    //get type
                    const inputSourceType = 0;

                    //get configured
                    const isConfigured = 1;

                    //get visibility state
                    const currentVisibility = input.visibility;
                    const targetVisibility = currentVisibility;

                    if (inputReference && inputName && inputMode) {
                        const inputService = new Service.InputSource(`${inputName} ${inputIdentifier}`, `${this.zoneInputSurroundName} ${inputIdentifier}`);
                        inputService
                            .setCharacteristic(Characteristic.Identifier, inputIdentifier)
                            .setCharacteristic(Characteristic.Name, inputName)
                            .setCharacteristic(Characteristic.IsConfigured, isConfigured)
                            .setCharacteristic(Characteristic.InputSourceType, inputSourceType)
                            .setCharacteristic(Characteristic.CurrentVisibilityState, currentVisibility)

                        inputService.getCharacteristic(Characteristic.ConfiguredName)
                            .onGet(async () => {
                                return inputName;
                            })
                            .onSet(async (value) => {
                                if (value === this.savedInputsNames[inputReference]) {
                                    return;
                                }

                                try {
                                    this.savedInputsNames[inputReference] = value;
                                    await fsPromises.writeFile(this.inputsNamesFile, JSON.stringify(this.savedInputsNames, null, 2));
                                    const debug = this.enableDebugMode ? this.emit('debug', `Saved ${this.zoneInputSurroundName} Name: ${value}, Reference: ${inputReference}`) : false;
                                } catch (error) {
                                    this.emit('error', `save Input Name error: ${error}`);
                                }
                            });

                        inputService.getCharacteristic(Characteristic.TargetVisibilityState)
                            .onGet(async () => {
                                return targetVisibility;
                            })
                            .onSet(async (state) => {
                                if (state === this.savedInputsTargetVisibility[inputReference]) {
                                    return;
                                }

                                try {
                                    this.savedInputsTargetVisibility[inputReference] = state;
                                    await fsPromises.writeFile(this.inputsTargetVisibilityFile, JSON.stringify(this.savedInputsTargetVisibility, null, 2));
                                    const debug = this.enableDebugMode ? this.emit('debug', `Saved  ${this.zoneInputSurroundName}: ${inputName} Target Visibility: ${state ? 'HIDEN' : 'SHOWN'}`) : false;
                                } catch (error) {
                                    this.emit('error', `save Target Visibility error: ${error}`);
                                }
                            });

                        this.televisionService.addLinkedService(inputService);
                        this.allServices.push(inputService);
                        accessory.addService(inputService);
                    } else {
                        this.emit('message', `Name: ${inputName ? inputName : 'Missing'}, Reference: ${inputReference ? inputReference : 'Missing'}, Mode: ${inputMode ? inputMode : 'Missing'}.`);

                    };
                };

                //sort inputs list
                const displayOrder = this.inputsConfigured.map(input => input.identifier);
                this.televisionService.setCharacteristic(Characteristic.DisplayOrder, Encode(1, displayOrder).toString('base64'));

                //prepare volume service
                if (this.volumeControl >= 0) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare volume service`);
                    if (this.volumeControl === 0) {
                        this.volumeService = new Service.Lightbulb(`${accessoryName} Volume`, 'Volume');
                        this.volumeService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.volumeService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Volume`);
                        this.volumeService.getCharacteristic(Characteristic.Brightness)
                            .onGet(async () => {
                                const volume = this.volume;
                                return volume;
                            })
                            .onSet(async (volume) => {
                                this.tvSpeakerService.setCharacteristic(Characteristic.Volume, volume);
                            });
                        this.volumeService.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = !this.mute;
                                return state;
                            })
                            .onSet(async (state) => {
                                this.tvSpeakerService.setCharacteristic(Characteristic.Mute, !state);
                            });

                        this.allServices.push(this.volumeService);
                        accessory.addService(this.volumeService);
                    }

                    if (this.volumeControl === 1) {
                        this.volumeServiceFan = new Service.Fan(`${accessoryName} Volume`, 'Volume');
                        this.volumeServiceFan.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.volumeServiceFan.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Volume`);
                        this.volumeServiceFan.getCharacteristic(Characteristic.RotationSpeed)
                            .onGet(async () => {
                                const volume = this.volume;
                                return volume;
                            })
                            .onSet(async (volume) => {
                                this.tvSpeakerService.setCharacteristic(Characteristic.Volume, volume);
                            });
                        this.volumeServiceFan.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = !this.mute;
                                return state;
                            })
                            .onSet(async (state) => {
                                this.tvSpeakerService.setCharacteristic(Characteristic.Mute, !state);
                            });

                        this.allServices.push(this.volumeServiceFan);
                        accessory.addService(this.volumeServiceFan);
                    }
                };

                //prepare sensor service
                if (this.sensorPower) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare power sensor service`);
                    this.sensorPowerService = new Service.ContactSensor(`${this.sZoneName} Power Sensor`, `Power Sensor`);
                    this.sensorPowerService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    this.sensorPowerService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Power Sensor`);
                    this.sensorPowerService.getCharacteristic(Characteristic.ContactSensorState)
                        .onGet(async () => {
                            const state = this.power;
                            return state;
                        });

                    this.allServices.push(this.sensorPowerService);
                    accessory.addService(this.sensorPowerService);
                };

                if (this.sensorVolume) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare volume sensor service`);
                    this.sensorVolumeService = new Service.ContactSensor(`${this.sZoneName} Volume Sensor`, `Volume Sensor`);
                    this.sensorVolumeService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    this.sensorVolumeService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Volume Sensor`);
                    this.sensorVolumeService.getCharacteristic(Characteristic.ContactSensorState)
                        .onGet(async () => {
                            const state = this.sensorVolumeState;
                            return state;
                        });

                    this.allServices.push(this.sensorVolumeService);
                    accessory.addService(this.sensorVolumeService);
                };

                if (this.sensorMute) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare mute sensor service`);
                    this.sensorMuteService = new Service.ContactSensor(`${this.sZoneName} Mute Sensor`, `Mute Sensor`);
                    this.sensorMuteService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    this.sensorMuteService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Mute Sensor`);
                    this.sensorMuteService.getCharacteristic(Characteristic.ContactSensorState)
                        .onGet(async () => {
                            const state = this.power ? this.mute : false;
                            return state;
                        });

                    this.allServices.push(this.sensorMuteService);
                    accessory.addService(this.sensorMuteService);
                };

                if (this.sensorInput) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare input sensor service`);
                    this.sensorInputService = new Service.ContactSensor(`${this.sZoneName} Input Sensor`, `Input Sensor`);
                    this.sensorInputService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    this.sensorInputService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Input Sensor`);
                    this.sensorInputService.getCharacteristic(Characteristic.ContactSensorState)
                        .onGet(async () => {
                            const state = this.sensorInputState;
                            return state;
                        });

                    this.allServices.push(this.sensorInputService);
                    accessory.addService(this.sensorInputService);
                };

                //prepare sonsor services
                const sensorInputs = this.sensorInputs;
                const sensorInputsCount = sensorInputs.length;
                const possibleSensorInputsCount = 99 - this.allServices.length;
                const maxSensorInputsCount = sensorInputsCount >= possibleSensorInputsCount ? possibleSensorInputsCount : sensorInputsCount;
                if (maxSensorInputsCount > 0) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare inputs sensor service`);
                    for (let i = 0; i < maxSensorInputsCount; i++) {
                        //get sensor
                        const sensorInput = sensorInputs[i];

                        //get name		
                        const sensorInputName = sensorInput.name;

                        //get reference
                        const sensorInputReference = sensorInput.reference;

                        //get display type
                        const sensorInputDisplayType = sensorInput.displayType >= 0 ? sensorInput.displayType : -1;

                        if (sensorInputDisplayType >= 0) {
                            if (sensorInputName && sensorInputReference) {
                                const serviceType = [Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][sensorInputDisplayType];
                                const characteristicType = [Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][sensorInputDisplayType];
                                const sensorInputService = new serviceType(`${accessoryName} ${sensorInputName}`, `Sensor ${i}`);
                                sensorInputService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                sensorInputService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${sensorInputName}`);
                                sensorInputService.getCharacteristic(characteristicType)
                                    .onGet(async () => {
                                        const state = this.power ? (this.reference === sensorInputReference) : false;
                                        return state;
                                    });

                                this.sensorInputs.push(sensorInput);
                                this.sensorsInputsServices.push(sensorInputService);
                                this.allServices.push(sensorInputService);
                                accessory.addService(sensorInputService);
                            } else {
                                this.emit('message', `Sensor Name: ${sensorInputName ? sensorInputName : 'Missing'}, Reference: ${sensorInputReference ? sensorInputReference : 'Missing'}.`);
                            };
                        }
                    }
                }

                //prepare buttons services
                const buttons = this.buttons;
                const buttonsCount = buttons.length;
                const possibleButtonsCount = 99 - this.allServices.length;
                const maxButtonsCount = buttonsCount >= possibleButtonsCount ? possibleButtonsCount : buttonsCount;
                if (maxButtonsCount > 0) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare button service`);
                    for (let i = 0; i < maxButtonsCount; i++) {
                        //get button
                        const button = buttons[i];

                        //get button name
                        const buttonName = button.name;

                        //get button reference
                        const buttonReference = button.reference;

                        //get button display type
                        const buttonDisplayType = button.displayType >= 0 ? button.displayType : -1;

                        if (buttonDisplayType >= 0) {
                            if (buttonName && buttonReference) {
                                const serviceType = [Service.Outlet, Service.Switch][buttonDisplayType];
                                const buttonService = new serviceType(`${this.sZoneName} ${buttonName}`, `Button ${i}`);
                                buttonService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                buttonService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${buttonName}`);
                                buttonService.getCharacteristic(Characteristic.On)
                                    .onGet(async () => {
                                        const state = false;
                                        return state;
                                    })
                                    .onSet(async () => {
                                        try {
                                            const mode = parseInt(buttonReference.charAt(0)); //0 - All/Maiz Zone, 1 - Zone 2/3, 2 - Only Z2
                                            const command = buttonReference.substring(1);
                                            const zonePrefix = ['', 'Z2', 'Z3', ''][zoneControl];
                                            const reference = [`${command}`, `${zonePrefix}${command}`, `Z2${command}`][mode];
                                            await this.denon.send(reference);
                                            buttonService.updateCharacteristic(Characteristic.On, false);
                                            const info = this.disableLogInfo ? false : this.emit('message', `set Button Name: ${buttonName}, Reference: ${reference}`);
                                        } catch (error) {
                                            buttonService.updateCharacteristic(Characteristic.On, false);
                                            this.emit('error', `set Button error: ${error}`);
                                        };
                                    });

                                this.buttonsServices.push(buttonService);
                                this.allServices.push(buttonService);
                                accessory.addService(buttonService);
                            } else {
                                this.emit('message', `Button Name: ${buttonName ? buttonName : 'Missing'}, Reference: ${buttonReference ? buttonReference : 'Missing'}.`);
                            };
                        }
                    };
                };

                this.firstRun = false;
                resolve(accessory);
            } catch (error) {
                reject(error)
            };
        });
    }
};

module.exports = DenonDevice;
