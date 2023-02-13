'use strict';
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const Mqtt = require('./src/mqtt.js');
const Denon = require('./src/denon.js');

const PLUGIN_NAME = 'homebridge-denon-tv';
const PLATFORM_NAME = 'DenonTv';
const CONSTANS = require('./src/constans.json');

let Accessory, Characteristic, Service, Categories, UUID;

module.exports = (api) => {
	Accessory = api.platformAccessory;
	Characteristic = api.hap.Characteristic;
	Service = api.hap.Service;
	Categories = api.hap.Categories;
	UUID = api.hap.uuid;
	api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, denonTvPlatform, true);
};

class denonTvPlatform {
	constructor(log, config, api) {
		// only load if configured
		if (!config || !Array.isArray(config.devices)) {
			log(`No configuration found for ${PLUGIN_NAME}`);
			return;
		}
		this.log = log;
		this.api = api;
		this.accessories = [];
		const devices = config.devices;

		this.api.on('didFinishLaunching', () => {
			this.log.debug('didFinishLaunching');
			for (const device of devices) {
				if (!device.name || !device.host || !device.port) {
					this.log.warn('Device name, host or port missing!');
					return;
				}
				new denonTvDevice(this.log, device, this.api);
			}
		});
	}

	configureAccessory(accessory) {
		this.log.debug('configureAccessory');
		this.accessories.push(accessory);
	}

	removeAccessory(accessory) {
		this.log.debug('removeAccessory');
		this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
	}
}

class denonTvDevice {
	constructor(log, config, api) {
		this.log = log;
		this.config = config;
		this.api = api;

		//device configuration
		this.name = config.name;
		this.host = config.host;
		this.port = config.port;
		this.zoneControl = config.zoneControl || 0;
		this.getInputsFromDevice = config.getInputsFromDevice || false;
		this.inputs = config.inputs || [];
		this.buttonsMainZone = config.buttonsMainZone || [];
		this.buttonsZone2 = config.buttonsZone2 || [];
		this.buttonsZone3 = config.buttonsZone3 || [];
		this.soundModes = config.surrounds || [];
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
		this.volumeControl = config.volumeControl || -1;
		this.refreshInterval = config.refreshInterval || 5;
		this.mqttEnabled = config.enableMqtt || false;
		this.mqttHost = config.mqttHost;
		this.mqttPort = config.mqttPort || 1883;
		this.mqttPrefix = config.mqttPrefix;
		this.mqttAuth = config.mqttAuth || false;
		this.mqttUser = config.mqttUser;
		this.mqttPasswd = config.mqttPasswd;
		this.mqttDebug = config.mqttDebug || false;

		//get Device info
		this.manufacturer = 'Denon/Marantz';
		this.modelName = 'Model Name';
		this.serialNumber = 'Serial Number';
		this.firmwareRevision = 'Firmware Revision';

		//zones
		this.zoneName = CONSTANS.ZoneName[this.zoneControl];
		this.sZoneName = CONSTANS.ZoneNameShort[this.zoneControl];
		this.buttons = [this.buttonsMainZone, this.buttonsZone2, this.buttonsZone3, this.buttonsMainZone][this.zoneControl];

		//setup variables
		this.startPrepareAccessory = true;

		this.inputsReference = [];
		this.inputsName = [];
		this.inputsMode = [];
		this.inputsDisplayType = [];
		this.inputsSwitchesButtons = [];

		this.sensorInputsReference = [];
		this.sensorInputsDisplayType = [];

		this.power = false;
		this.reference = '';
		this.volume = 0;
		this.mute = true;
		this.mediaState = false;
		this.inputIdentifier = 0;
		this.pictureMode = 0;
		this.brightness = 0;
		this.sensorVolumeState = false;
		this.sensorInputState = false;

		this.prefDir = path.join(api.user.storagePath(), 'denonTv');
		this.devInfoFile = `${this.prefDir}/devInfo_${this.host.split('.').join('')}`;
		this.inputsFile = `${this.prefDir}/inputs_${this.sZoneName}${this.host.split('.').join('')}`;
		this.inputsNamesFile = `${this.prefDir}/inputsNames_${this.sZoneName}${this.host.split('.').join('')}`;
		this.inputsTargetVisibilityFile = `${this.prefDir}/inputsTargetVisibility_${this.sZoneName}${this.host.split('.').join('')}`;

		//mqtt client
		if (this.mqttEnabled) {
			this.mqtt = new Mqtt({
				host: this.mqttHost,
				port: this.mqttPort,
				prefix: this.mqttPrefix,
				topic: this.name,
				auth: this.mqttAuth,
				user: this.mqttUser,
				passwd: this.mqttPasswd,
				debug: this.mqttDebug
			});

			this.mqtt.on('connected', (message) => {
				this.log(`Device: ${this.host} ${this.name}, ${message}`);
			})
				.on('error', (error) => {
					this.log.error(`Device: ${this.host} ${this.name}, ${error}`);
				})
				.on('debug', (message) => {
					this.log(`Device: ${this.host} ${this.name}, debug: ${message}`);
				})
				.on('message', (message) => {
					this.log(`Device: ${this.host} ${this.name}, ${message}`);
				})
				.on('disconnected', (message) => {
					this.log(`Device: ${this.host} ${this.name}, ${message}`);
				});
		};

		//denon client
		this.denon = new Denon({
			host: this.host,
			port: this.port,
			debugLog: this.enableDebugMode,
			disableLogConnectError: this.disableLogConnectError,
			zoneControl: this.zoneControl,
			refreshInterval: this.refreshInterval,
			mqttEnabled: this.mqttEnabled
		});

		this.denon.on('connected', async (devInfo) => {
			this.log(`Device: ${this.host} ${this.name}, Connected.`);

			try {
				const object = JSON.stringify({});
				const array = JSON.stringify([]);

				// Create pref directory if it doesn't exist
				if (!fs.existsSync(this.prefDir)) {
					await fsPromises.mkdir(this.prefDir);
				}

				// Create device info file if it doesn't exist
				if (this.zoneControl === 0) {
					if (!fs.existsSync(this.devInfoFile)) {
						await fsPromises.writeFile(this.devInfoFile, object);
					}

					//save device info to the file
					try {
						const devInfo1 = JSON.stringify(devInfo, null, 2);
						const writeDevInfo = await fsPromises.writeFile(this.devInfoFile, devInfo1);
						const debug = this.enableDebugMode ? this.log(`Device: ${this.host} ${this.name}, saved device info: ${devInfo1}`) : false;
					} catch (error) {
						this.log.error(`Device: ${this.host} ${this.name}, save device info error: ${error}`);
					};
				}

				// Create inputs file if it doesn't exist
				if (!fs.existsSync(this.inputsFile)) {
					await fsPromises.writeFile(this.inputsFile, array);
				}

				// Create inputs names file if it doesn't exist
				if (!fs.existsSync(this.inputsNamesFile)) {
					await fsPromises.writeFile(this.inputsNamesFile, object);
				}

				// Create inputs target visibility file if it doesn't exist
				if (!fs.existsSync(this.inputsTargetVisibilityFile)) {
					await fsPromises.writeFile(this.inputsTargetVisibilityFile, object);
				}

				//save inputs to the file
				try {
					const inputsArr = [];
					if (this.getInputsFromDevice && this.zoneControl <= 2) {
						const referencesArray = [];
						const referenceConversionArray = Object.keys(CONSTANS.InputConversion);

						const deviceInputs = devInfo.DeviceZoneCapabilities[this.zoneControl].InputSource[0].List[0].Source;
						for (const input of deviceInputs) {
							const name = input.DefaultName[0];
							const inputReference = (input.FuncName[0]).toUpperCase();
							const reference = referenceConversionArray.includes(inputReference) ? CONSTANS.InputConversion[inputReference] : inputReference;
							const inputsObj = {
								'name': name,
								'reference': reference,
								'mode': 'SI',
								"displayType": -1
							}
							inputsArr.push(inputsObj);
							referencesArray.push(reference);
						};

						const deviceSchortcuts = devInfo.DeviceZoneCapabilities[this.zoneControl].ShortcutControl[0].EntryList[0].Shortcut;
						for (const input of deviceSchortcuts) {
							const category = input.Category[0];
							const name = input.DispName[0];
							const inputReference = (input.FuncName[0]).toUpperCase();
							const reference = referenceConversionArray.includes(inputReference) ? CONSTANS.InputConversion[inputReference] : inputReference;
							const inputsObj = {
								'name': name,
								'reference': reference,
								'mode': ['', '', '', 'MS', 'SI'][category],
								"displayType": -1
							}

							const existedInput = referencesArray.includes(reference);
							const push = category === '4' && !existedInput ? inputsArr.push(inputsObj) : false;
						};
					};

					const allInputsArr = this.zoneControl <= 2 ? (this.getInputsFromDevice ? inputsArr : this.inputs) : this.soundModes;
					const inputs = JSON.stringify(allInputsArr, null, 2);
					const writeInputs = await fsPromises.writeFile(this.inputsFile, inputs);
					const debug = this.enableDebugMode ? this.log(`Device: ${this.host} ${this.name}, saved ${this.zoneControl <= 2 ? 'Inputs' : 'Sound Modes'}: ${inputs}`) : false;
				} catch (error) {
					this.log.error(`Device: ${this.host} ${this.name}, save ${this.zoneControl <= 2 ? 'Inputs' : 'Sound Modes'} error: ${error}`);
				};
			} catch (error) {
				this.log.error(`Device: ${this.host} ${this.name}, create files or save devInfo error: ${error}`);
			};
		})
			.on('deviceInfo', (manufacturer, modelName, serialNumber, firmwareRevision, zones, apiVersion) => {
				if (!this.disableLogDeviceInfo) {
					this.log(`-------- ${this.name} --------`);
					this.log(`Manufacturer: ${manufacturer}`);
					this.log(`Model: ${modelName}`);
					if (this.zoneControl === 0) {
						this.log(`Zones: ${zones}`);
						this.log(`Control: Main Zone`);
						this.log(`Firmware: ${firmwareRevision}`);
						this.log(`Api version: ${apiVersion}`);
						this.log(`Serialnr: ${serialNumber}`);
					}
					if (this.zoneControl === 1) {
						this.log('Control: Zone 2');
					}
					if (this.zoneControl === 2) {
						this.log('Control: Zone 3');
					}
					if (this.zoneControl === 3) {
						this.log('Control: Sound Modes');
					}
					this.log('----------------------------------');
				}

				if (this.informationService) {
					this.informationService
						.setCharacteristic(Characteristic.Manufacturer, manufacturer)
						.setCharacteristic(Characteristic.Model, modelName)
						.setCharacteristic(Characteristic.SerialNumber, serialNumber)
						.setCharacteristic(Characteristic.FirmwareRevision, firmwareRevision);
				};

				this.manufacturer = manufacturer;
				this.modelName = modelName;
				this.serialNumber = serialNumber;
				this.firmwareRevision = firmwareRevision;
			})
			.on('stateChanged', (power, reference, volume, mute) => {
				const inputIdentifier = this.inputsReference.includes(reference) ? this.inputsReference.findIndex(index => index === reference) : this.inputIdentifier;

				if (this.televisionService) {
					this.televisionService
						.updateCharacteristic(Characteristic.Active, power)
						.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
				}

				if (this.tvSpeakerService) {
					this.tvSpeakerService
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

				if (this.sensorInputService) {
					const state = power ? (this.inputIdentifier !== inputIdentifier) : false;
					this.sensorInputService
						.updateCharacteristic(Characteristic.ContactSensorState, state)
					this.sensorInputState = state;
				}

				if (!this.getInputsFromDevice && this.inputSwitchButtonServices) {
					const switchButtonServicesCount = this.inputSwitchButtonServices.length;
					for (let i = 0; i < switchButtonServicesCount; i++) {
						const index = this.inputsSwitchesButtons[i];
						const state = power ? (this.inputsReference[index] === reference) : false;
						const displayType = this.inputsDisplayType[index];
						const characteristicType = [Characteristic.On, Characteristic.On][displayType];
						this.inputSwitchButtonServices[i]
							.updateCharacteristic(characteristicType, state);
					}
				}

				if (this.getInputsFromDevice && this.sensorInputsServices) {
					const servicesCount = this.sensorInputsServices.length;
					for (let i = 0; i < servicesCount; i++) {
						const state = power ? (this.sensorInputsReference[i] === reference) : false;
						const displayType = this.sensorInputsDisplayType[i];
						const characteristicType = [Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][displayType];
						this.sensorInputsServices[i]
							.updateCharacteristic(characteristicType, state);
					}
				}


				this.power = power;
				this.reference = reference;
				this.volume = volume;
				this.mute = mute;
				this.inputIdentifier = inputIdentifier;

				//start prepare accessory
				if (this.startPrepareAccessory) {
					this.prepareAccessory();
				};
			})
			.on('error', (error) => {
				this.log.error(`Device: ${this.host} ${this.name}, ${error}`);
			})
			.on('debug', (message) => {
				this.log(`Device: ${this.host} ${this.name}, debug: ${message}`);
			})
			.on('message', (message) => {
				this.log(`Device: ${this.host} ${this.name}, ${message}`);
			})
			.on('mqtt', (topic, message) => {
				this.mqtt.send(topic, message);
			})
			.on('disconnected', (message) => {
				this.log(`Device: ${this.host} ${this.name}, ${message}`);
			});
	};

	//prepare accessory
	prepareAccessory() {
		this.log.debug('prepareAccessory');
		const zoneControl = this.zoneControl;
		const manufacturer = this.manufacturer;
		const modelName = this.modelName;
		const serialNumber = this.serialNumber;
		const firmwareRevision = this.firmwareRevision;

		//accessory
		const accessoryName = this.name;
		const accessoryUUID = UUID.generate(serialNumber + zoneControl);
		const accessoryCategory = Categories.AUDIO_RECEIVER;
		const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

		//information service
		this.log.debug('prepareInformationService');
		this.informationService = accessory.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Manufacturer, manufacturer)
			.setCharacteristic(Characteristic.Model, modelName)
			.setCharacteristic(Characteristic.SerialNumber, serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, firmwareRevision);


		//prepare television service
		this.log.debug('prepareTelevisionService');
		this.televisionService = new Service.Television(`${accessoryName} Television`, 'Television');
		this.televisionService.setCharacteristic(Characteristic.ConfiguredName, accessoryName);
		this.televisionService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.televisionService.getCharacteristic(Characteristic.Active)
			.onGet(async () => {
				const state = this.power;
				const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, get Power state successful: ${state ? 'ON' : 'OFF'}`);
				return state;
			})
			.onSet(async (state) => {
				try {
					const masterControl = this.masterPower ? 4 : zoneControl;
					const newState = [(state ? 'ZMON' : 'ZMOFF'), (state ? 'Z2ON' : 'Z2OFF'), (state ? 'Z3ON' : 'Z3OFF'), (state ? 'ZMON' : 'ZMOFF'), (state ? 'PWON' : 'PWSTANDBY')][masterControl];

					const setPower = (state !== this.power) ? await this.denon.send(CONSTANS.ApiUrls.iPhoneDirect + newState) : false;
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set Power state successful, state${newState}`);
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName}, can not set Power state. Might be due to a wrong settings in config, error: ${error}`);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
			.onGet(async () => {
				const inputIdentifier = this.inputIdentifier;
				const inputName = this.inputsName[inputIdentifier];
				const inputReference = this.inputsReference[inputIdentifier];
				const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, get ${zoneControl <= 2 ? 'Input' : 'Sound Mode'} successful, name: ${inputName}, reference: ${inputReference}`);
				return inputIdentifier;
			})
			.onSet(async (inputIdentifier) => {
				try {
					const inputName = this.inputsName[inputIdentifier];
					const inputMode = this.inputsMode[inputIdentifier];
					const inputReference = this.inputsReference[inputIdentifier];
					const zone = [inputMode, 'Z2', 'Z3', inputMode][zoneControl];
					const reference = zone + inputReference;

					const setInput = await this.denon.send(CONSTANS.ApiUrls.iPhoneDirect + reference);
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set ${zoneControl <= 2 ? 'Input' : 'Sound Mode'} successful, name: ${inputName}, reference: ${inputReference}`);
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName}, can not set ${zoneControl <= 2 ? 'Input' : 'Sound Mode'}. Might be due to a wrong settings in config, error: ${error}`);
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

					const setCommand = await this.denon.send(CONSTANS.ApiUrls.iPhoneDirect + command);
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, Remote Key successful, command: ${command}`);
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName}, can not Remote Key command. Might be due to a wrong settings in config, error: ${error}`);
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
						const brightness = `PVBR ${value}`;
						const setBrightness = await this.denon.send(CONSTANS.ApiUrls.iPhoneDirect + brightness);
						const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set Brightness successful, brightness:${value}`);
					} catch (error) {
						this.log.error(`Device: ${this.host} ${accessoryName}, can not set Brightness. Might be due to a wrong settings in config, error: ${error}`);
					};
				});

			this.televisionService.getCharacteristic(Characteristic.PictureMode)
				.onGet(async () => {
					const pictureMode = this.pictureMode;
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, get Picture mode: ${pictureMode}`);
					return pictureMode;
				})
				.onSet(async (command) => {
					try {
						switch (command) {
							case Characteristic.PictureMode.OTHER:
								command = 'PVMOV';
								break;
							case Characteristic.PictureMode.STANDARD:
								command = 'PVSTD';
								break;
							case Characteristic.PictureMode.CALIBRATED:
								command = 'PVDAY';
								break;
							case Characteristic.PictureMode.CALIBRATED_DARK:
								command = 'PVNGT';
								break;
							case Characteristic.PictureMode.VIVID:
								command = 'PVVVD';
								break;
							case Characteristic.PictureMode.GAME:
								command = 'PVSTM';
								break;
							case Characteristic.PictureMode.COMPUTER:
								command = 'PVSTM';
								break;
							case Characteristic.PictureMode.CUSTOM:
								command = 'PVCTM';
								break;
						}

						const setCommand = await this.denon.send(CONSTANS.ApiUrls.iPhoneDirect + command);
						const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set Picture Mode successful, command: ${command}`);
					} catch (error) {
						this.log.error(`Device: ${this.host} ${accessoryName}, can not set Picture Mode command. Might be due to a wrong settings in config, error: ${error}`);
					};
				});

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

						const setCommand = await this.denon.send(CONSTANS.ApiUrls.iPhoneDirect + command);
						const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set Power Mode Selection successful, command: ${command}`);
					} catch (error) {
						this.log.error(`Device: ${this.host} ${accessoryName}, can not set Power Mode Selection command. Might be due to a wrong settings in config, error: ${error}`);
					};
				});
		};

		accessory.addService(this.televisionService);

		//prepare speaker service
		this.log.debug('prepareSpeakerService');
		this.tvSpeakerService = new Service.TelevisionSpeaker(`${accessoryName} Speaker`, 'Speaker');
		this.tvSpeakerService
			.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
			.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
		this.tvSpeakerService.getCharacteristic(Characteristic.VolumeSelector)
			.onSet(async (command) => {
				try {
					const masterControl = this.masterVolume ? 4 : zoneControl;
					const zone = ['MV', 'Z2', 'Z3', 'MV', 'MV'][masterControl];
					switch (command) {
						case Characteristic.VolumeSelector.INCREMENT:
							command = 'UP';
							break;
						case Characteristic.VolumeSelector.DECREMENT:
							command = 'DOWN';
							break;
					}

					const setVolume = await this.denon.send(CONSTANS.ApiUrls.iPhoneDirect + zone + command);
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, setVolumeSelector successful, command: ${command}`);
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName}, can not setVolumeSelector command. Might be due to a wrong settings in config, error: ${error}`);
				};
			});

		this.tvSpeakerService.getCharacteristic(Characteristic.Volume)
			.onGet(async () => {
				const volume = this.volume;
				const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, get Volume level successful: ${volume - 80}`);
				return volume;
			})
			.onSet(async (volume) => {
				try {
					const masterControl = this.masterVolume ? 4 : zoneControl;
					const zone = ['MV', 'Z2', 'Z3', 'MV', 'MV'][masterControl];
					if (volume === 0 || volume === 100) {
						volume = this.volume < 10 ? `0${this.volume}` : this.volume;
					} else if (volume < 10) {
						volume = `0${volume}`;
					}

					const setVolume = await this.denon.send(CONSTANS.ApiUrls.iPhoneDirect + zone + volume);
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set new Volume level successful, volume: ${volume - 80}`);
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName}, can not set new Volume level. Might be due to a wrong settings in config, error: ${error}`);
				};
			});

		this.tvSpeakerService.getCharacteristic(Characteristic.Mute)
			.onGet(async () => {
				const state = this.mute;
				const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, get Mute state successful:  ${state ? 'ON' : 'OFF'}`);
				return state;
			})
			.onSet(async (state) => {
				try {
					const masterControl = this.masterMute ? 4 : zoneControl;
					const zone = ['', 'Z2', 'Z3', '', ''][masterControl];
					const newState = state ? 'MUON' : 'MUOFF';

					const toggleMute = (this.power && state !== this.mute) ? await this.denon.send(CONSTANS.ApiUrls.iPhoneDirect + zone + newState) : false;
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set new Mute state successful, state: ${state ? 'ON' : 'OFF'}`);
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName}, can not set new Mute state. Might be due to a wrong settings in config, error: ${error}`);
				};
			});

		accessory.addService(this.tvSpeakerService);


		//prepare volume service
		if (this.volumeControl >= 0) {
			this.log.debug('prepareVolumeService');
			if (this.volumeControl === 0) {
				this.volumeService = new Service.Lightbulb(`${accessoryName} Volume`, 'Volume');
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

				accessory.addService(this.volumeService);
			}

			if (this.volumeControl === 1) {
				this.volumeServiceFan = new Service.Fan(`${accessoryName} Volume`, 'Volume');
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

				accessory.addService(this.volumeServiceFan);
			}
		};

		//prepare sensor service
		if (this.sensorPower) {
			this.log.debug('prepareSensorPowerService')
			this.sensorPowerService = new Service.ContactSensor(`${this.sZoneName} Power Sensor`, `Power Sensor`);
			this.sensorPowerService.getCharacteristic(Characteristic.ContactSensorState)
				.onGet(async () => {
					const state = this.power;
					return state;
				});
			accessory.addService(this.sensorPowerService);
		};

		if (this.sensorVolume) {
			this.log.debug('prepareSensorVolumeService')
			this.sensorVolumeService = new Service.ContactSensor(`${this.sZoneName} Volume Sensor`, `Volume Sensor`);
			this.sensorVolumeService.getCharacteristic(Characteristic.ContactSensorState)
				.onGet(async () => {
					const state = this.sensorVolumeState;
					return state;
				});
			accessory.addService(this.sensorVolumeService);
		};

		if (this.sensorMute) {
			this.log.debug('prepareSensorMuteService')
			this.sensorMuteService = new Service.ContactSensor(`${this.sZoneName} Mute Sensor`, `Mute Sensor`);
			this.sensorMuteService.getCharacteristic(Characteristic.ContactSensorState)
				.onGet(async () => {
					const state = this.power ? this.mute : false;
					return state;
				});
			accessory.addService(this.sensorMuteService);
		};

		if (this.sensorInput) {
			this.log.debug('prepareSensorChannelService')
			this.sensorInputService = new Service.ContactSensor(`${this.sZoneName} Input Sensor`, `Input Sensor`);
			this.sensorInputService.getCharacteristic(Characteristic.ContactSensorState)
				.onGet(async () => {
					const state = this.sensorInputState;
					return state;
				});
			accessory.addService(this.sensorInputService);
		};

		//prepare input service
		this.log.debug('prepareInputsService');
		const savedInputs = fs.readFileSync(this.inputsFile).length > 2 ? JSON.parse(fs.readFileSync(this.inputsFile)) : (this.zoneControl <= 2 ? this.inputs : this.soundModes);
		const debug = this.enableDebugMode ? this.log(`Device: ${this.host} ${this.name}, read saved ${this.zoneControl <= 2 ? 'Inputs' : 'Sound Modes'}: ${JSON.stringify(savedInputs, null, 2)}`) : false;

		const savedInputsNames = fs.readFileSync(this.inputsNamesFile).length > 2 ? JSON.parse(fs.readFileSync(this.inputsNamesFile)) : {};
		const debug1 = this.enableDebugMode ? this.log(`Device: ${this.host} ${this.name}, read saved ${this.zoneControl <= 2 ? 'Inputs' : 'Sound Modes'} names: ${JSON.stringify(savedInputsNames, null, 2)}`) : false;

		const savedInputsTargetVisibility = fs.readFileSync(this.inputsTargetVisibilityFile).length > 2 ? JSON.parse(fs.readFileSync(this.inputsTargetVisibilityFile)) : {};
		const debug2 = this.enableDebugMode ? this.log(`Device: ${this.host} ${this.name}, read saved ${this.zoneControl <= 2 ? 'Inputs' : 'Sound Modes'}, Target Visibility states: ${JSON.stringify(savedInputsTargetVisibility, null, 2)}`) : false;

		//check possible inputs and possible count (max 80)
		const inputs = savedInputs;
		const inputsCount = inputs.length;
		const maxInputsCount = inputsCount < 80 ? inputsCount : 80;
		for (let i = 0; i < maxInputsCount; i++) {
			//get input
			const input = inputs[i];

			//get reference
			const inputReference = input.reference || 'Undefined';

			//get name		
			const inputName = savedInputsNames[inputReference] || input.name;

			//get type
			const inputType = 0;


			//get mode
			const inputMode = zoneControl <= 2 ? input.mode || 'SI' : 'MS';


			//get display type
			const inputDisplayType = input.displayType >= 0 ? input.displayType : -1;

			//get configured
			const isConfigured = 1;

			//get visibility state
			const currentVisibility = savedInputsTargetVisibility[inputReference] || 0;
			const targetVisibility = currentVisibility;

			const service = zoneControl <= 2 ? 'Input' : 'Sound Mode';
			const inputService = new Service.InputSource(inputName, service + i);
			inputService
				.setCharacteristic(Characteristic.Identifier, i)
				.setCharacteristic(Characteristic.ConfiguredName, inputName)
				.setCharacteristic(Characteristic.IsConfigured, isConfigured)
				.setCharacteristic(Characteristic.InputSourceType, inputType)
				.setCharacteristic(Characteristic.CurrentVisibilityState, currentVisibility)
				.setCharacteristic(Characteristic.TargetVisibilityState, targetVisibility);

			inputService
				.getCharacteristic(Characteristic.ConfiguredName)
				.onSet(async (name) => {
					try {
						const nameIdentifier = inputReference || false;
						savedInputsNames[nameIdentifier] = name;
						const newCustomName = JSON.stringify(savedInputsNames, null, 2);

						const writeNewCustomName = nameIdentifier ? await fsPromises.writeFile(this.inputsNamesFile, newCustomName) : false;
						const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, saved new ${zoneControl <= 2 ? 'Input' : 'Sound Mode'} name: ${name}, reference: ${inputReference}`);
					} catch (error) {
						this.log.error(`Device: ${this.host} ${accessoryName}, new Input name save error: ${error}`);
					}
				});

			inputService
				.getCharacteristic(Characteristic.TargetVisibilityState)
				.onSet(async (state) => {
					try {
						const targetVisibilityIdentifier = inputReference || false;
						savedInputsTargetVisibility[targetVisibilityIdentifier] = state;
						const newTargetVisibility = JSON.stringify(savedInputsTargetVisibility, null, 2);

						const writeNewTargetVisibility = targetVisibilityIdentifier ? await fsPromises.writeFile(this.inputsTargetVisibilityFile, newTargetVisibility) : false;
						const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, saved new ${zoneControl <= 2 ? 'Input' : 'Sound Mode'}: ${inputName}, target visibility state: ${state ? 'HIDEN' : 'SHOWN'}`);
						inputService.setCharacteristic(Characteristic.CurrentVisibilityState, state);
					} catch (error) {
						this.log.error(`Device: ${this.host} ${accessoryName}, new target visibility state save error: ${error}`);
					}
				});

			this.inputsName.push(inputName);
			this.inputsReference.push(inputReference);
			this.inputsMode.push(inputMode);
			this.inputsDisplayType.push(inputDisplayType);
			const pushInputSwitchIndex = inputDisplayType >= 0 ? this.inputsSwitchesButtons.push(i) : false;

			this.televisionService.addLinkedService(inputService);
			accessory.addService(inputService);
		};

		//prepare inputs switch button ervices
		this.inputSwitchButtonServices = [];
		const inputsSwitchesButtons = this.inputsSwitchesButtons;
		const inputsSwitchesButtonsCount = inputsSwitchesButtons.length;
		const possibleInputsSwitchesButtonsCount = 80 - this.inputsReference.length;
		const maxInputsSwitchesButtonsCount = possibleInputsSwitchesButtonsCount >= inputsSwitchesButtonsCount ? inputsSwitchesButtonsCount : possibleInputsSwitchesButtonsCount;
		if (!this.getInputsFromDevice) {
			if (maxInputsSwitchesButtonsCount > 0) {
				this.log.debug('prepareSwitchsService');
				for (let i = 0; i < maxInputsSwitchesButtonsCount; i++) {
					//get input index
					const index = inputsSwitchesButtons[i];

					//get name		
					const inputName = this.inputsName[index] || 'Not set';

					//get reference
					const inputReference = this.inputsReference[index] || 'Not set';

					//get mode
					const inputMode = (zoneControl <= 2) ? this.inputsMode[index] : 'MS';

					//get display type
					const inputDisplayType = this.inputsDisplayType[index] >= 0 ? this.inputsDisplayType[index] : -1;

					if (inputDisplayType >= 0) {
						const serviceType = [Service.Outlet, Service.Switch][inputDisplayType];
						const characteristicType = [Characteristic.On, Characteristic.On][inputDisplayType];
						const inputSwitchButtonService = new serviceType(`${this.sZoneName} ${inputName}`, `Switch ${i}`);
						inputSwitchButtonService.getCharacteristic(characteristicType)
							.onGet(async () => {
								const state = this.power ? (this.reference === inputReference) : false;
								return state;
							})
							.onSet(async (state) => {
								try {
									const zone = [inputMode, 'Z2', 'Z3', inputMode][zoneControl];
									const reference = zone + inputReference;

									const setSwitchInput = state && this.power ? await this.denon.send(CONSTANS.ApiUrls.iPhoneDirect + reference) : false;
									const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set new ${zoneControl <= 2 ? 'Input' : 'Sound Mode'} successful, name: ${inputName}, reference: ${inputReference}`);
								} catch (error) {
									this.log.error(`Device: ${this.host} ${accessoryName}, can not set new ${zoneControl <= 2 ? 'Input' : 'Sound Mode'}. Might be due to a wrong settings in config, error: ${error}`);
								};
							});

						this.inputSwitchButtonServices.push(inputSwitchButtonService);
						accessory.addService(this.inputSwitchButtonServices[i]);
					}
				}
			};
		};

		//prepare sonsor services
		this.sensorInputsServices = [];
		const sensorInputs = this.sensorInputs;
		const sensorInputsCount = sensorInputs.length;
		const possibleSensorInputsCount = 80 - this.inputsReference.length;
		const maxSensorInputsCount = possibleSensorInputsCount >= sensorInputsCount ? sensorInputsCount : possibleSensorInputsCount;
		if (this.getInputsFromDevice) {
			if (maxSensorInputsCount > 0) {
				this.log.debug('prepareInputSensorServices');
				for (let i = 0; i < maxSensorInputsCount; i++) {
					//get sensor
					const sensorInput = sensorInputs[i];

					//get name		
					const sensorInputName = sensorInput.name || 'Not set';

					//get reference
					const sensorInputReference = sensorInput.reference || 'Not set';

					//get display type
					const sensorInputDisplayType = sensorInput.displayType >= 0 ? sensorInput.displayType : -1;

					if (sensorInputDisplayType >= 0) {
						const serviceType = [Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][sensorInputDisplayType];
						const characteristicType = [Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][sensorInputDisplayType];
						const sensorInputService = new serviceType(`${accessoryName} ${sensorInputName}`, `Sensor ${i}`);
						sensorInputService.getCharacteristic(characteristicType)
							.onGet(async () => {
								const state = this.power ? (this.reference === sensorInputReference) : false;
								return state;
							});

						this.sensorInputsReference.push(sensorInputReference);
						this.sensorInputsDisplayType.push(sensorInputDisplayType);
						this.sensorInputsServices.push(sensorInputService);
						accessory.addService(this.sensorInputsServices[i]);
					}
				}
			}
		}

		//prepare button services zone 0 to 2
		if (zoneControl <= 2) {
			this.buttonsServices = [];
			const buttons = this.buttons;
			const buttonsCount = buttons.length;
			const maxbuttonsCount = this.getInputsFromDevice ? this.inputsReference.length + this.sensorInputsServices.length : this.inputsReference.length + this.inputSwitchButtonServices.length;
			const possibleButtonsCount = 80 - (maxInputsCount + maxbuttonsCount);
			const maxButtonsCount = possibleButtonsCount >= buttonsCount ? buttonsCount : possibleButtonsCount;
			if (maxButtonsCount > 0) {
				this.log.debug('prepareInputsButtonService');
				for (let i = 0; i < maxButtonsCount; i++) {
					//get button
					const button = buttons[i];

					//get button name
					const buttonName = button.name || 'Not set';

					//get button reference
					const buttonReference = button.reference || 'Not set'

					//get button display type
					const buttonDisplayType = button.displayType >= 0 ? button.displayType : -1;

					if (buttonDisplayType >= 0) {
						const serviceType = [Service.Outlet, Service.Switch][buttonDisplayType];
						const buttonService = new serviceType(`${this.sZoneName} ${buttonName}`, `Button ${i}`);
						buttonService.getCharacteristic(Characteristic.On)
							.onGet(async () => {
								const state = false;
								return state;
							})
							.onSet(async (state) => {
								try {
									const setFunction = state && this.power ? await this.denon.send(CONSTANS.ApiUrls.iPhoneDirect + buttonReference) : false;
									const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set Input successful, name: ${buttonName}, reference: ${buttonReference}`);

									await new Promise(resolve => setTimeout(resolve, 300));
									const setChar = state && this.power ? buttonService.updateCharacteristic(Characteristic.On, false) : false;
								} catch (error) {
									this.log.error(`Device: ${this.host} ${accessoryName}, can not set new ${zoneControl <= 2 ? 'Input' : 'Sound Mode'}. Might be due to a wrong settings in config, error: ${error}`);
								};
							});
						this.buttonsServices.push(buttonService);
						accessory.addService(this.buttonsServices[i]);
					}
				};
			}
		};

		this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
		const debug3 = this.enableDebugMode ? this.log(`Device: ${this.host} ${accessoryName}, published as external accessory.`) : false;
		this.startPrepareAccessory = false;
	}
};
