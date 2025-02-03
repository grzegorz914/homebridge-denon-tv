import { promises as fsPromises } from 'fs';
import EventEmitter from 'events';
import Mqtt from './mqtt.js';
import RestFul from './restful.js';
import Denon from './denon.js';
import { PictureModesConversionToHomeKit, PictureModesDenonNumber } from './constants.js';
let Accessory, Characteristic, Service, Categories, Encode, AccessoryUUID;

class Surround extends EventEmitter {
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
        this.inputs = device.surrounds || [];
        this.inputsDisplayOrder = device.inputsDisplayOrder || 0;
        this.sensorInput = device.sensorInput || false;
        this.sensorInputs = device.sensorSurrounds || [];
        this.enableDebugMode = device.enableDebugMode || false;
        this.disableLogInfo = device.disableLogInfo || false;
        this.disableLogError = device.disableLogError || false;
        this.infoButtonCommand = device.infoButtonCommand || 'MNINF';
        this.refreshInterval = refreshInterval;
        this.devInfoFile = devInfoFile;
        this.inputsFile = inputsFile;
        this.inputsNamesFile = inputsNamesFile;
        this.inputsTargetVisibilityFile = inputsTargetVisibilityFile;
        this.startPrepareAccessory = true;

        //services
        this.allServices = [];
        this.sensorsInputsServices = [];

        //inputs
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
                const log = sensorInputDisplayType === 0 ? false : this.emit('info', `Sensor Name: ${sensorInputName ? sensorInputName : 'Missing'}, Reference: ${sensorInputReference ? sensorInputReference : 'Missing'}`);
            };
        }
        this.sensorsInputsConfiguredCount = this.sensorsInputsConfigured.length || 0;
        this.sensorInputState = false;

        //state variable
        this.startPrepareAccessory = true;
        this.power = false;
        this.reference = '';
        this.inputsNamesFile = inputsNamesFile;
        this.inputsTargetVisibilityFile = inputsTargetVisibilityFile;
    };

    async saveData(path, data) {
        try {
            data = JSON.stringify(data, null, 2);
            await fsPromises.writeFile(path, data);
            const debug = this.enableDebugLog ? this.emit('debug', `Saved data: ${data}`) : false;
            return true;
        } catch (error) {
            throw new Error(`Save data error: ${error}`);
        };
    }

    async readData(path) {
        try {
            const data = await fsPromises.readFile(path);
            return data;
        } catch (error) {
            throw new Error(`Read saved data error: ${error}`);
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
            const debug = !this.enableDebugMode ? false : this.emit('debug', `Surrounds display order: ${JSON.stringify(this.inputsConfigured, null, 2)}`);

            const displayOrder = this.inputsConfigured.map(input => input.identifier);
            this.televisionService.setCharacteristic(Characteristic.DisplayOrder, Encode(1, displayOrder).toString('base64'));
            return true;
        } catch (error) {
            throw new Error(`Display order error: ${error}`);
        };
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
                    try {
                        //const powerState = this.masterPower ? (state ? 'PWON' : 'PWSTANDBY') : (state ? 'ZMON' : 'ZMOFF');
                        //await this.denon.send(powerState);
                        //const info = this.disableLogInfo ? false : this.emit('info', `set Power: ${powerState}`);
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
                                const info = this.disableLogInfo ? false : this.emit('info', `set Surround Name: ${inputName}, Reference: ${reference}`);
                                break;
                        }
                    } catch (error) {
                        this.emit('warn', `set Surround error: ${error}`);
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
                        const info = this.disableLogInfo ? false : this.emit('info', `set Remote Key: ${command}`);
                    } catch (error) {
                        this.emit('warn', `set Remote Key error: ${error}`);
                    };
                });
            this.allServices.push(this.televisionService);

            //prepare inputs service
            const debug8 = !this.enableDebugMode ? false : this.emit('debug', `Prepare surrounds services`);

            //check possible inputs count (max 85)
            const inputs = this.savedInputs;
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
                const inputService = accessory.addService(Service.InputSource, input.name, `Surround ${inputIdentifier}`);
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
                        try {
                            input.name = value;
                            this.savedInputsNames[inputReference] = value;
                            await this.saveData(this.inputsNamesFile, this.savedInputsNames);
                            const debug = !this.enableDebugMode ? false : this.emit('debug', `Saved Surround Name: ${value}, Reference: ${inputReference}`);

                            //sort inputs
                            const index = this.inputsConfigured.findIndex(input => input.reference === inputReference);
                            this.inputsConfigured[index].name = value;
                            await this.displayOrder();
                        } catch (error) {
                            this.emit('warn', `save Surround Name error: ${error}`);
                        }
                    });

                inputService.getCharacteristic(Characteristic.TargetVisibilityState)
                    .onGet(async () => {
                        return input.visibility;
                    })
                    .onSet(async (state) => {
                        try {
                            input.visibility = state;
                            this.savedInputsTargetVisibility[inputReference] = state;
                            await this.saveData(this.inputsTargetVisibilityFile, this.savedInputsTargetVisibility);
                            const debug = !this.enableDebugMode ? false : this.emit('debug', `Saved  Surround: ${input.name} Target Visibility: ${state ? 'HIDEN' : 'SHOWN'}`);
                        } catch (error) {
                            this.emit('warn', `save Surround Target Visibility error: ${error}`);
                        }
                    });

                this.inputsConfigured.push(input);
                this.televisionService.addLinkedService(inputService);
                this.allServices.push(inputService);
            };

            //prepare sonsor input service
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

            //prepare sonsor inputs service
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

            //sort inputs list
            const sortInputsDisplayOrder = this.televisionService ? await this.displayOrder() : false;

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
                getInputsFromDevice: false,
                getFavoritesFromDevice: false,
                getQuickSmartSelectFromDevice: false,
                enableDebugLog: this.enableDebugMode,
                disableLogError: this.disableLogError
            });

            this.denon.on('deviceInfo', (manufacturer, modelName, serialNumber, firmwareRevision, deviceZones, apiVersion, supportPictureMode) => {
                this.emit('devInfo', `-------- ${this.name} --------`);
                this.emit('devInfo', `Manufacturer: ${manufacturer}`);
                this.emit('devInfo', `Model: ${modelName}`);
                this.emit('devInfo', `Control: Sound Modes`);
                this.emit('devInfo', `----------------------------------`);

                this.manufacturer = manufacturer;
                this.modelName = modelName;
                this.serialNumber = serialNumber;
                this.firmwareRevision = firmwareRevision;
                this.supportPictureMode = supportPictureMode;
            })
                .on('stateChanged', async (power, reference, volume, volumeDisplay, mute, pictureMode) => {
                    const input = this.inputsConfigured.find(input => input.reference === reference) ?? false;
                    const inputIdentifier = input ? input.identifier : this.inputIdentifier;

                    if (this.televisionService) {
                        this.televisionService
                            .updateCharacteristic(Characteristic.Active, power ? 1 : 0)
                            .updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier)
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

                    this.inputIdentifier = inputIdentifier;
                    this.power = power;
                    this.reference = reference;

                    if (!this.disableLogInfo) {
                        const name = input ? input.name : reference;
                        this.emit('info', `Power: ${power ? 'ON' : 'OFF'}`);
                        this.emit('info', `Surround Name: ${name}`);
                        this.emit('info', `Reference: ${reference}`);
                    };
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
                });

            //connect to avr and check state
            const connect = await this.denon.connect();

            if (!connect) {
                return false;
            }

            //prepare data for accessory
            await this.prepareDataForAccessory();

            //prepare accessory
            if (this.startPrepareAccessory) {
                const accessory = await this.prepareAccessory();
                this.emit('publishAccessory', accessory);
                this.startPrepareAccessory = false;

                //start impulse generator 
                await this.denon.impulseGenerator.start([{ name: 'checkState', sampling: this.refreshInterval }]);
            }

            return true;
        } catch (error) {
            throw new Error(`Start error: ${error}`);
        };
    };
};

export default Surround;
