import EventEmitter from 'events';
import Zone from './zone.js';
import Functions from './functions.js';
let Accessory, Characteristic, Service, Categories, Encode, AccessoryUUID;

class PassThroughInputs extends EventEmitter {
    constructor(api, denon, denonInfo, device, devInfoFile, inputsFile, inputsNamesFile, inputsTargetVisibilityFile) {
        super();

        Accessory = api.platformAccessory;
        Characteristic = api.hap.Characteristic;
        Service = api.hap.Service;
        Categories = api.hap.Categories;
        Encode = api.hap.encode;
        AccessoryUUID = api.hap.uuid;

        //device configuration
        this.denon = denon;
        this.denonInfo = denonInfo;
        this.device = device;
        this.name = device.name;
        this.zoneControl = device.zoneControl;
        this.inputsDisplayOrder = device.inputs?.displayOrder || 0;
        this.sensorInput = device.sensors?.input || false;
        this.sensorInputs = (device.sensors?.inputs || []).filter(sensor => (sensor.displayType ?? 0) > 0);
        this.infoButtonCommand = device.infoButtonCommand || 'MNINF';
        this.logInfo = device.log?.info || false;
        this.logWarn = device.log?.warn || true;
        this.logDebug = device.log?.debug || false;
        this.devInfoFile = devInfoFile;
        this.inputsFile = inputsFile;
        this.inputsNamesFile = inputsNamesFile;
        this.inputsTargetVisibilityFile = inputsTargetVisibilityFile;

        //sensors
        for (const sensor of this.sensorInputs) {
            sensor.name = sensor.name;
            sensor.serviceType = [null, Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][sensor.displayType];
            sensor.characteristicType = [null, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][sensor.displayType];
            sensor.state = false;
        }

        //variable
        this.functions = new Functions();
        this.inputIdentifier = 1;
        this.power = false;
        this.reference = '';
        this.mediaState = false;
        this.sensorInputState = false;
    };

    async startStopImpulseGenerator(state, timers = []) {
        try {
            //start impulse generator 
            await this.zone.impulseGenerator.state(state, timers)
            return true;
        } catch (error) {
            throw new Error(`Impulse generator start error: ${error}`);
        }
    }

    async prepareDataForAccessory() {
        try {
            //read dev info from file
            this.savedInfo = await this.functions.readData(this.devInfoFile, true) ?? {};
            if (this.logDebug) this.emit('debug', `Read saved Info: ${JSON.stringify(this.savedInfo, null, 2)}`);

            //read inputs file
            this.savedInputs = await this.functions.readData(this.inputsFile, true) ?? [];
            if (this.logDebug) this.emit('debug', `Read saved Inputs: ${JSON.stringify(this.savedInputs, null, 2)}`);

            //read inputs names from file
            this.savedInputsNames = await this.functions.readData(this.inputsNamesFile, true) ?? {};
            if (this.logDebug) this.emit('debug', `Read saved Inputs Names: ${JSON.stringify(this.savedInputsNames, null, 2)}`);

            //read inputs visibility from file
            this.savedInputsTargetVisibility = await this.functions.readData(this.inputsTargetVisibilityFile, true) ?? {};
            if (this.logDebug) this.emit('debug', `Read saved Inputs Target Visibility: ${JSON.stringify(this.savedInputsTargetVisibility, null, 2)}`);

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

            // Sort only if a valid function exists
            if (sortFn) {
                this.inputsServices.sort(sortFn);
            }

            // Debug
            if (this.logDebug) {
                const orderDump = this.inputsServices.map(svc => ({
                    name: svc.name,
                    reference: svc.reference,
                    identifier: svc.identifier,
                }));
                this.emit('debug', `Inputs display order:\n${JSON.stringify(orderDump, null, 2)}`);
            }

            // Always update DisplayOrder characteristic, even for "none"
            const displayOrder = this.inputsServices.map(svc => svc.identifier);
            const encodedOrder = Encode(1, displayOrder).toString('base64');
            this.televisionService.updateCharacteristic(Characteristic.DisplayOrder, encodedOrder);

            return;
        } catch (error) {
            throw new Error(`Display order error: ${error}`);
        }
    }

    async addRemoveOrUpdateInput(inputs, remove = false) {
        try {
            if (!this.inputsServices) return;

            let updated = false; // flaga, żeby wiedzieć, czy coś faktycznie się zmieniło

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
                        updated = true;
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
                        updated = true;
                    }
                } else {
                    const identifier = this.inputsServices.length + 1;
                    inputService = this.accessory.addService(Service.InputSource, sanitizedName, `Input ${inputReference}`);
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
                    updated = true;
                }
            }

            // Only one time run
            if (updated) await this.displayOrder();

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
            const accessoryUUID = AccessoryUUID.generate(this.savedInfo.serialNumber + this.zoneControl);
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
                    const state = true;
                    return state;
                })
                .onSet(async (state) => {
                    try {
                        //const powerState = this.masterPower ? (state ? 'PWON' : 'PWSTANDBY') : (state ? 'ZMON' : 'ZMOFF');
                        //await this.zone.send(powerState);
                        //if (this.logInfo) this.emit('info', `set Power: ${powerState}`);
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

                        await this.zone.send(`${zonePrefix}${reference}`);
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

                        await this.zone.send(command);
                        if (this.logInfo) this.emit('info', `set Remote Key: ${command}`);
                    } catch (error) {
                        if (this.logWarn) this.emit('warn', `set Remote Key error: ${error}`);
                    }
                });

            //prepare inputs service
            if (this.logDebug) this.emit('debug', `Prepare inputs services`);
            this.inputsServices = [];
            await this.addRemoveOrUpdateInput(this.savedInputs, false);

            //prepare sonsor input service
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

            //prepare sonsor inputs service
            const possibleSensorInputsCount = 99 - this.accessory.services.length;
            const maxSensorInputsCount = this.sensorInputs.length >= possibleSensorInputsCount ? possibleSensorInputsCount : this.sensorInputs.length;
            if (maxSensorInputsCount > 0) {
                if (this.logDebug) this.emit('debug', `Prepare inputs sensors services`);
                this.sensorInputsServices = [];
                for (let i = 0; i < maxSensorInputsCount; i++) {
                    //get sensor
                    const sensor = this.sensorInputs[i];

                    //get sensor name		
                    const name = sensor.name || `Sensor ${i}`;

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
                    this.sensorInputsServices.push(sensorInputService);
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
            this.zone = new Zone(this.denon, this.device, this.inputsFile)
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
                .on('stateChanged', async (power, reference) => {
                    const input = this.inputsServices?.find(input => input.reference === reference);
                    const inputIdentifier = input ? input.identifier : this.inputIdentifier;
                    this.inputIdentifier = inputIdentifier;
                    this.power = power;
                    this.reference = reference;

                    this.televisionService
                        ?.updateCharacteristic(Characteristic.Active, power)
                        .updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);

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
                        this.sensorInputsServices?.[i]?.updateCharacteristic(characteristicType, state);
                    }

                    if (this.logInfo) {
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
            const connect = await this.zone.connect(this.denonInfo);
            if (!connect) return false;

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
