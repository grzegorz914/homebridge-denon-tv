import { promises as fsPromises } from 'fs';
import EventEmitter from 'events';
import Denon from './denon.js';
let Accessory, Characteristic, Service, Categories, Encode, AccessoryUUID;

class PassThroughInputs extends EventEmitter {
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
        this.inputsDisplayOrder = device.inputsDisplayOrder || 0;
        this.inputs = device.passThroughInputs || [];
        this.sensorInput = device.sensorInput || false;
        this.sensorInputs = device.sensorInputs || [];
        this.infoButtonCommand = device.infoButtonCommand || 'MNINF';
        this.refreshInterval = device.refreshInterval * 1000 || 5000;
        this.enableDebugMode = device.enableDebugMode || false;
        this.disableLogInfo = device.disableLogInfo || false;
        this.devInfoFile = devInfoFile;
        this.inputsFile = inputsFile;
        this.inputsNamesFile = inputsNamesFile;
        this.inputsTargetVisibilityFile = inputsTargetVisibilityFile;

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

        //variable
        this.inputIdentifier = 1;
        this.power = false;
        this.reference = '';
        this.mediaState = false;
        this.sensorInputState = false;
    };

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
            throw new Error(`Read data error: ${error}`);
        }
    }

    async sanitizeString(str) {
        if (!str) return '';

        // Normalize & transliterate (usuń akcenty/ogonkowe litery)
        str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        // Replace dot/colon/semicolon inside words with a space
        str = str.replace(/(\w)[.:;]+(\w)/g, '$1 $2');

        // Replace certain separators (+, -, /) with a space
        str = str.replace(/[+\-\/]/g, ' ');

        // Remove remaining invalid characters (keep letters, digits, space, apostrophe)
        str = str.replace(/[^A-Za-z0-9 ']/g, ' ');

        // Collapse multiple spaces into one
        str = str.replace(/\s+/g, ' ');

        // Trim leading/trailing spaces
        return str.trim();
    }

    async startImpulseGenerator() {
        try {
            //start impulse generator 
            await this.denon.impulseGenerator.start([{ name: 'connect', sampling: 50000 }, { name: 'checkState', sampling: this.refreshInterval }]);
            return true;
        } catch (error) {
            throw new Error(`Impulse generator start error: ${error}`);
        }
    }

    async prepareDataForAccessory() {
        try {
            //read dev info from file
            const savedInfo = await this.readData(this.devInfoFile);
            this.savedInfo = savedInfo.toString().trim() !== '' ? JSON.parse(savedInfo) : {};
            if (this.enableDebugMode) this.emit('debug', `Read saved Info: ${JSON.stringify(this.savedInfo, null, 2)}`);

            //read inputs file
            const savedInputs = await this.readData(this.inputsFile);
            this.savedInputs = savedInputs.toString().trim() !== '' ? JSON.parse(savedInputs) : this.inputs;
            if (!this.enableDebugMode) this.emit('debug', `Read saved Inputs: ${JSON.stringify(this.savedInputs, null, 2)}`);

            //read inputs names from file
            const savedInputsNames = await this.readData(this.inputsNamesFile);
            this.savedInputsNames = savedInputsNames.toString().trim() !== '' ? JSON.parse(savedInputsNames) : {};
            if (this.enableDebugMode) this.emit('debug', `Read saved Inputs Names: ${JSON.stringify(this.savedInputsNames, null, 2)}`);

            //read inputs visibility from file
            const savedInputsTargetVisibility = await this.readData(this.inputsTargetVisibilityFile);
            this.savedInputsTargetVisibility = savedInputsTargetVisibility.toString().trim() !== '' ? JSON.parse(savedInputsTargetVisibility) : {};
            if (this.enableDebugMode) this.emit('debug', `Read saved Inputs Target Visibility: ${JSON.stringify(this.savedInputsTargetVisibility, null, 2)}`);

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

            // Sort inputs in memory
            this.inputsServices.sort(sortFn);

            // Debug dump
            if (this.enableDebugMode) {
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

    async addRemoveOrUpdateInput(input, remove = false) {
        try {
            // Safety: no services or too many inputs (only block on add)
            if (!this.inputsServices || (this.inputsServices.length >= 85 && !remove)) return;

            // Input reference
            const inputReference = input.reference;

            // Remove input
            if (remove) {
                const svc = this.inputsServices.find(s => s.reference === inputReference);
                if (svc) {
                    if (this.enableDebugMode) this.emit('debug', `Removing input: ${input.name}, reference: ${inputReference}`);
                    this.accessory.removeService(svc);
                    this.inputsServices = this.inputsServices.filter(s => s.reference !== inputReference);
                    await this.displayOrder();
                    return true;
                }
                if (this.enableDebugMode) this.emit('debug', `Remove input: ${input.name}, reference: ${inputReference}, failed`);
                return false;
            }

            // Add or update input
            let inputService = this.inputsServices.find(s => s.reference === inputReference);

            const savedName = this.savedInputsNames[inputReference] ?? input.name;
            const sanitizedName = await this.sanitizeString(savedName);
            const inputMode = input.mode ?? 0;
            const inputZonePrefix = input.zonePrefix;
            const inputVisibility = this.savedInputsTargetVisibility[inputReference] ?? 0;

            if (inputService) {
                // Update existing input
                const nameChanged = inputService.name !== sanitizedName;

                if (nameChanged) {
                    inputService.name = sanitizedName;
                    inputService
                        .updateCharacteristic(Characteristic.Name, sanitizedName)
                        .updateCharacteristic(Characteristic.ConfiguredName, sanitizedName)

                    if (this.enableDebugMode) this.emit('debug', `Updated Input: ${input.name}, reference: ${inputReference}`);
                }
            } else {
                // Create new input
                const identifier = this.inputsServices.length + 1;
                inputService = this.accessory.addService(Service.InputSource, sanitizedName, `Input ${identifier}`);

                // Custom props
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
                    .setCharacteristic(Characteristic.InputSourceType, inputMode) // 0=HDMI-like Input, 1=Tuner/Channel
                    .setCharacteristic(Characteristic.CurrentVisibilityState, inputVisibility)
                    .setCharacteristic(Characteristic.TargetVisibilityState, inputVisibility);

                // ConfiguredName rename persistence
                inputService.getCharacteristic(Characteristic.ConfiguredName)
                    .onSet(async (value) => {
                        try {
                            const newName = await this.sanitizeString(value);
                            this.savedInputsNames[inputReference] = newName;
                            await this.saveData(this.inputsNamesFile, this.savedInputsNames);
                            if (this.enableDebugMode) this.emit('debug', `Saved Input: ${input.name}, reference: ${inputReference}`);

                            // Update service name to sanitized version
                            inputService.name = newName;
                            await this.displayOrder();
                        } catch (error) {
                            this.emit('warn', `Save Input Name error: ${error}`);
                        }
                    });

                // TargetVisibility persistence
                inputService.getCharacteristic(Characteristic.TargetVisibilityState)
                    .onSet(async (state) => {
                        try {
                            this.savedInputsTargetVisibility[inputReference] = state;
                            await this.saveData(this.inputsTargetVisibilityFile, this.savedInputsTargetVisibility);
                            if (this.enableDebugMode) this.emit('debug', `Saved Input: ${input.name}, reference: ${inputReference}, target visibility: ${state ? 'HIDDEN' : 'SHOWN'}`);

                            // Update service visibility to match target state
                            inputService.visibility = state;
                        } catch (error) {
                            this.emit('warn', `Save Target Visibility error: ${error}`);
                        }
                    });

                this.inputsServices.push(inputService);
                this.televisionService.addLinkedService(inputService);

                if (this.enableDebugMode) this.emit('debug', `Added Input: ${input.name}, reference: ${inputReference}`);
            }

            // Oorder inputs after add/update
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
            if (this.enableDebugMode) this.emit('debug', `Prepare accessory`);
            const accessoryName = this.name;
            const accessoryUUID = AccessoryUUID.generate(this.savedInfo.serialNumber + this.zone);
            const accessoryCategory = Categories.AUDIO_RECEIVER;
            const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);
            this.accessory = accessory;

            //information service
            if (this.enableDebugMode) this.emit('debug', `Prepare information service`);
            this.informationService = accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Manufacturer, this.savedInfo.manufacturer)
                .setCharacteristic(Characteristic.Model, this.savedInfo.modelName)
                .setCharacteristic(Characteristic.SerialNumber, this.savedInfo.serialNumber)
                .setCharacteristic(Characteristic.FirmwareRevision, this.savedInfo.firmwareRevision);

            //prepare television service
            if (this.enableDebugMode) this.emit('debug', `Prepare television service`);
            this.televisionService = accessory.addService(Service.Television, `${accessoryName} Television`, 'Television');
            this.televisionService.setCharacteristic(Characteristic.ConfiguredName, accessoryName);
            this.televisionService.setCharacteristic(Characteristic.SleepDiscoveryMode, 1);

            this.televisionService.getCharacteristic(Characteristic.Active)
                .onGet(async () => {
                    const state = true;
                    return state;
                })
                .onSet(async (state) => {
                    try {
                        //const powerState = this.masterPower ? (state ? 'PWON' : 'PWSTANDBY') : (state ? 'ZMON' : 'ZMOFF');
                        //await this.denon.send(powerState);
                        //if (!this.disableLogInfo) this.emit('info', `set Power: ${powerState}`);
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
                        const input = this.inputsServices.find(i => i.identifier === activeIdentifier);
                        if (!input) {
                            this.emit('warn', `Input with identifier ${activeIdentifier} not found`);
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
                        if (!this.disableLogInfo) this.emit('info', `set Input Name: ${name}, Reference: ${reference}`);
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
                        if (!this.disableLogInfo) this.emit('info', `set Remote Key: ${command}`);
                    } catch (error) {
                        this.emit('warn', `set Remote Key error: ${error}`);
                    }
                });

            //prepare inputs service
            if (this.enableDebugMode) this.emit('debug', `Prepare inputs services`);
            this.inputsServices = [];
            for (const input of this.savedInputs) {
                await this.addRemoveOrUpdateInput(input, false);
            }

            //prepare sonsor input service
            if (this.sensorInput) {
                if (this.enableDebugMode) this.emit('debug', `Prepare input sensor service`);
                this.sensorInputService = accessory.addService(Service.ContactSensor, `${this.sZoneName} Input Sensor`, `Input Sensor`);
                this.sensorInputService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorInputService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Input Sensor`);
                this.sensorInputService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.sensorInputState;
                        return state;
                    });
            }

            //prepare sonsor inputs service
            const possibleSensorInputsCount = 99 - this.accessory.services.length.length;
            const maxSensorInputsCount = this.sensorsInputsConfiguredCount >= possibleSensorInputsCount ? possibleSensorInputsCount : this.sensorsInputsConfiguredCount;
            if (maxSensorInputsCount > 0) {
                if (this.enableDebugMode) this.emit('debug', `Prepare inputs sensors services`);
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
                    accessory.addService(sensorInputService);
                }
            }

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
                getInputsFromDevice: false,
                getFavoritesFromDevice: false,
                getQuickSmartSelectFromDevice: false,
                enableDebugLog: this.enableDebugMode
            })
                .on('deviceInfo', (info) => {
                    this.emit('devInfo', `-------- ${this.name} --------`);
                    this.emit('devInfo', `Manufacturer: ${info.manufacturer}`);
                    this.emit('devInfo', `Model: ${info.modelName}`);
                    this.emit('devInfo', `Control: ${info.controlZone}`);
                    this.emit('devInfo', `----------------------------------`);

                    this.informationService?.updateCharacteristic(Characteristic.FirmwareRevision, info.firmwareRevision);
                })
                .on('addRemoveOrUpdateInput', async (input, remove) => {
                    await this.addRemoveOrUpdateInput(input, remove);
                })
                .on('stateChanged', async (power, reference) => {
                    const input = this.inputsServices.find(input => input.reference === reference) ?? false;
                    const inputIdentifier = input ? input.identifier : this.inputIdentifier;
                    this.inputIdentifier = inputIdentifier;
                    this.power = power;
                    this.reference = reference;

                    if (this.televisionService) {
                        this.televisionService
                            .updateCharacteristic(Characteristic.Active, power)
                            .updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
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

                    if (!this.disableLogInfo) {
                        const name = input ? input.name : reference;
                        this.emit('info', `Power: ${power ? 'ON' : 'OFF'}`);
                        this.emit('info', `Pass Through Input Name: ${name}`);
                        this.emit('info', `Reference: ${reference}`);
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

            //connect to avr
            const connect = await this.denon.connect();
            if (!connect) {
                return false;
            }

            //prepare data for accessory
            await this.prepareDataForAccessory();

            //prepare accessory
            const accessory = await this.prepareAccessory();
            return accessory;
        } catch (error) {
            throw new Error(`Start error: ${error}`);
        }
    }
}

export default PassThroughInputs;
