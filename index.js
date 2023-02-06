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
		this.volumeControl = config.volumeControl || 0;
		this.infoButtonCommand = config.infoButtonCommand || 'MNINF';
		this.masterPower = config.masterPower || false;
		this.sensorPower = config.sensorPower || false;
		this.masterVolume = config.masterVolume || false;
		this.sensorVolume = config.sensorVolume || false
		this.masterMute = config.masterMute || false;
		this.sensorMute = config.sensorMute || false;
		this.sensorInput = config.sensorInput || false;
		this.sensorInputs = config.sensorInputs || [];
		this.disableLogInfo = config.disableLogInfo || false;
		this.disableLogDeviceInfo = config.disableLogDeviceInfo || false;
		this.enableDebugMode = config.enableDebugMode || false;
		this.getInputsFromDevice = config.getInputsFromDevice || false;
		this.inputs = config.inputs || [];
		this.buttonsMainZone = config.buttonsMainZone || [];
		this.buttonsZone2 = config.buttonsZone2 || [];
		this.buttonsZone3 = config.buttonsZone3 || [];
		this.soundModes = config.surrounds || [];
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
		this.inputsType = [];
		this.inputsMode = [];
		this.inputsDisplayType = [];

		this.inputsSwitchesSensors = [];

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
			zoneControl: this.zoneControl,
			refreshInterval: this.refreshInterval,
			mqttEnabled: this.mqttEnabled
		});

		this.denon.on('connected', async (devInfo) => {
			this.log(`Device: ${this.host} ${this.name}, Connected.`);

			try {
				// Create pref directory if it doesn't exist
				if (!fs.existsSync(this.prefDir)) {
					await fsPromises.mkdir(this.prefDir);
				}

				// Create device info file if it doesn't exist
				if (this.zoneControl === 0) {
					if (!fs.existsSync(this.devInfoFile)) {
						await fsPromises.writeFile(this.devInfoFile, '');
					}
					await fsPromises.writeFile(this.devInfoFile, JSON.stringify(devInfo, null, 2));
				}

				// Create inputs file if it doesn't exist
				if (!fs.existsSync(this.inputsFile)) {
					await fsPromises.writeFile(this.inputsFile, '');
				}

				// Create inputs names file if it doesn't exist
				if (!fs.existsSync(this.inputsNamesFile)) {
					await fsPromises.writeFile(this.inputsNamesFile, '');
				}

				// Create inputs target visibility file if it doesn't exist
				if (!fs.existsSync(this.inputsTargetVisibilityFile)) {
					await fsPromises.writeFile(this.inputsTargetVisibilityFile, '');
				}

				//save inputs to the file
				try {
					const inputsArr = [];
					if (this.getInputsFromDevice && this.zoneControl <= 2) {
						const deviceInputs = devInfo.DeviceZoneCapabilities[this.zoneControl].InputSource[0].List[0].Source;
						for (const input of deviceInputs) {
							const name = input.DefaultName[0];
							const reference = input.FuncName[0];
							const inputsObj = {
								'name': name,
								'reference': reference,
								'mode': 'SI',
								"displayType": -1
							}
							inputsArr.push(inputsObj);
						};

						if (this.zoneControl === 0) {
							const deviceQuickSelect = devInfo.DeviceZoneCapabilities[this.zoneControl].Operation[0].QuickSelect[0];
							const maxQuickSelect = deviceQuickSelect.MaxQuickSelect[0];
							for (let i = 0; i < maxQuickSelect; i++) {
								const key = [deviceQuickSelect.QuickSelect1, deviceQuickSelect.QuickSelect2, deviceQuickSelect.QuickSelect3, deviceQuickSelect.QuickSelect4, deviceQuickSelect.QuickSelect5, deviceQuickSelect.QuickSelect6][i];
								const name = key[0].Name[0];
								const reference = key[0].FuncName[0];
								const inputsObj = {
									'name': name,
									'reference': reference,
									'mode': 'MS',
									"displayType": -1
								}
								inputsArr.push(inputsObj);
							};
						};
					};

					const allInputsArr = this.zoneControl <= 2 ? (this.getInputsFromDevice ? inputsArr : this.inputs) : this.soundModes;
					const inputs = JSON.stringify(allInputsArr, null, 2);
					const writeInputs = await fsPromises.writeFile(this.inputsFile, inputs);
					const debug = this.enableDebugMode ? this.log(`Device: ${this.host} ${this.name}, save ${this.zoneControl <= 2 ? 'Inputs' : 'Sound Modes'} succesful: ${inputs}`) : false;
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

				if (!this.getInputsFromDevice && this.inputSwitchSensorServices) {
					const switchServicesCount = this.inputSwitchSensorServices.length;
					for (let i = 0; i < switchServicesCount; i++) {
						const index = this.inputsSwitchesSensors[i];
						const state = power ? (this.inputsReference[index] === reference) : false;
						const displayType = this.inputsDisplayType[index];
						const characteristicType = [Characteristic.On, Characteristic.On, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][displayType];
						this.inputSwitchSensorServices[i]
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
		if (this.volumeControl >= 1) {
			this.log.debug('prepareVolumeService');
			if (this.volumeControl === 1) {
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

			if (this.volumeControl === 2) {
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
		const savedInputs = fs.readFileSync(this.inputsFile).length > 0 ? JSON.parse(fs.readFileSync(this.inputsFile)) : (this.zoneControl <= 2 ? this.inputs : this.soundModes);
		const debug = this.enableDebugMode ? this.log(`Device: ${this.host} ${this.name}, read saved ${this.zoneControl <= 2 ? 'Input' : 'Sound Mode'}, successful: ${JSON.stringify(savedInputs, null, 2)}`) : false;

		const savedInputsNames = fs.readFileSync(this.inputsNamesFile).length > 0 ? JSON.parse(fs.readFileSync(this.inputsNamesFile)) : {};
		const debug1 = this.enableDebugMode ? this.log(`Device: ${this.host} ${this.name}, read saved custom ${this.zoneControl <= 2 ? 'Input' : 'Sound Mode'}, Names successful: ${JSON.stringify(savedInputsNames, null, 2)}`) : false;

		const savedInputsTargetVisibility = fs.readFileSync(this.inputsTargetVisibilityFile).length > 0 ? JSON.parse(fs.readFileSync(this.inputsTargetVisibilityFile)) : {};
		const debug2 = this.enableDebugMode ? this.log(`Device: ${this.host} ${this.name}, read saved ${this.zoneControl <= 2 ? 'Input' : 'Sound Mode'}, Target Visibility successful: ${JSON.stringify(savedInputsTargetVisibility, null, 2)}`) : false;

		//check available inputs and possible count (max 80)
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
			const inputType = (zoneControl <= 2) ? CONSTANS.InputSourceType.indexOf(input.type) || 3 : 0;


			//get mode
			const inputMode = zoneControl <= 2 ? input.mode || 'SI' : 'MS';


			//get display type
			const inputDisplayType = input.displayType || -1;

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
						const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, new ${zoneControl <= 2 ? 'Input' : 'Sound Mode'} name saved successful, name: ${name}, reference: ${inputReference}`);
					} catch (error) {
						this.log.error(`Device: ${this.host} ${accessoryName}, new ${zoneControl <= 2 ? 'Input' : 'Sound Mode'} name saved failed, Error: ${error}`);
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
						const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, new ${zoneControl <= 2 ? 'Input' : 'Sound Mode'}, Target Visibility saved successful, name: ${name}, state: ${state ? 'HIDEN' : 'SHOWN'}`);
						inputService.setCharacteristic(Characteristic.CurrentVisibilityState, state);
					} catch (error) {
						this.log.error(`Device: ${this.host} ${accessoryName}, saved ${zoneControl <= 2 ? 'Input' : 'Sound Mode'} Target Visibility state error: ${error}`);
					}
				});

			this.inputsName.push(inputName);
			this.inputsReference.push(inputReference);
			this.inputsType.push(inputType);
			this.inputsMode.push(inputMode);
			this.inputsDisplayType.push(inputDisplayType);
			const pushInputSwitchIndex = inputDisplayType >= 0 ? this.inputsSwitchesSensors.push(i) : false;

			this.televisionService.addLinkedService(inputService);
			accessory.addService(inputService);
		};

		//prepare inputs switch sensor ervice
		const inputsSwitchesSensors = this.inputsSwitchesSensors;
		const inputsSwitchesSensorsCount = inputsSwitchesSensors.length;
		const availableInputsSwitchesSensorsCount = 80 - maxInputsCount;
		const maxInputsSwitchesSensorsCount = availableInputsSwitchesSensorsCount > 0 ? (availableInputsSwitchesSensorsCount > inputsSwitchesSensorsCount ? inputsSwitchesSensorsCount : availableInputsSwitchesSensorsCount) : 0;
		if (!this.getInputsFromDevice) {
			if (maxInputsSwitchesSensorsCount > 0) {
				this.log.debug('prepareSwitchsService');
				this.inputSwitchSensorServices = [];
				for (let i = 0; i < maxInputsSwitchesSensorsCount; i++) {
					//get input index
					const index = inputsSwitchesSensors[i];

					//get name		
					const inputName = this.inputsName[index];

					//get reference
					const inputReference = this.inputsReference[index];

					//get mode
					const inputMode = (zoneControl <= 2) ? this.inputsMode[index] : 'MS';

					//get display type
					const inputDisplayType = this.inputsDisplayType[index];

					const serviceType = [Service.Outlet, Service.Switch, Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][inputDisplayType];
					const characteristicType = [Characteristic.On, Characteristic.On, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][inputDisplayType];
					const inputSwitchSensorService = new serviceType(`${this.sZoneName} ${inputName}`, `Sensor ${i}`);
					inputSwitchSensorService.getCharacteristic(characteristicType)
						.onGet(async () => {
							const state = this.power ? (this.reference === inputReference) : false;
							return state;
						})
						.onSet(async (state) => {
							if (inputDisplayType <= 1) {
								try {
									const zone = [inputMode, 'Z2', 'Z3', inputMode][zoneControl];
									const reference = zone + inputReference;

									const setSwitchInput = (state && this.power) ? await this.denon.send(CONSTANS.ApiUrls.iPhoneDirect + reference) : false;
									const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, new ${zoneControl <= 2 ? 'Input' : 'Sound Mode'}, Input successful, name: ${name}, reference: ${inputReference}`);
								} catch (error) {
									this.log.error(`Device: ${this.host} ${accessoryName}, can not set new ${zoneControl <= 2 ? 'Input' : 'Sound Mode'}. Might be due to a wrong settings in config, error: ${error}`);
								};
							};
						});

					this.inputSwitchSensorServices.push(inputSwitchSensorService);
					accessory.addService(this.inputSwitchSensorServices[i]);
				}
			};
		};

		//prepare sonsor service
		const sensorInputs = this.sensorInputs;
		const sensorInputsCount = sensorInputs.length;
		const availableSensorInputsCount = 80 - maxInputsCount;
		const maxSensorInputsCount = availableSensorInputsCount > 0 ? (availableSensorInputsCount > sensorInputsCount ? sensorInputsCount : availableSensorInputsCount) : 0;
		if (this.getInputsFromDevice) {
			if (maxSensorInputsCount > 0) {
				this.log.debug('prepareInputSensorServices');
				this.sensorInputsServices = [];
				for (let i = 0; i < maxSensorInputsCount; i++) {
					//get sensor
					const sensorInput = sensorInputs[i];

					//get name		
					const sensorInputName = sensorInput.name || 'Not set in config';

					//get reference
					const sensorInputReference = sensorInput.reference || 'Not set in config';

					//get display type
					const sensorInputDisplayType = sensorInput.displayType || -1;

					if (sensorInputDisplayType >= 0) {
						const serviceType = [Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][sensorInputDisplayType];
						const characteristicType = [Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][sensorInputDisplayType];
						const sensorInputService = new serviceType(`${accessoryName} ${sensorInputName}`, `Sensor ${sensorInputName}`);
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

		//prepare button service
		if (zoneControl <= 2) {
			//check available buttons and possible count (max 80)
			const buttons = this.buttons;
			const buttonsCount = buttons.length;
			const maxCount = this.getInputsFromDevice ? maxSensorInputsCount : maxInputsSwitchesSensorsCount;
			const availableButtonsCount = 80 - (maxInputsCount + maxCount);
			const maxButtonsCount = availableButtonsCount > 0 ? (availableButtonsCount > buttonsCount ? buttonsCount : availableButtonsCount) : 0;
			if (maxButtonsCount > 0) {
				this.log.debug('prepareButtonsService');
				for (const button of buttons) {
					//get button name
					const buttonName = button.name || 'Not set in config';

					//get button reference
					const buttonReference = button.reference || 'Not set in config'

					//get button display type
					const buttonDisplayType = button.displayType || 0;

					const serviceType = [Service.Outlet, Service.Switch][buttonDisplayType];
					const buttonService = new serviceType(`${this.sZoneName} ${buttonName}`, `Button ${buttonName}`);
					buttonService.getCharacteristic(Characteristic.On)
						.onGet(async () => {
							const state = false;
							return state;
						})
						.onSet(async (state) => {
							try {
								const setFunction = (state && this.power) ? await this.denon.send(CONSTANS.ApiUrls.iPhoneDirect + buttonReference) : false;
								const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set new Input successful, name: ${name}, reference: ${buttonReference}`);

								await new Promise(resolve => setTimeout(resolve, 300));
								const setChar = (state && this.power) ? buttonService.updateCharacteristic(Characteristic.On, false) : false;
							} catch (error) {
								this.log.error(`Device: ${this.host} ${accessoryName}, can not set new ${zoneControl <= 2 ? 'Input' : 'Sound Mode'}. Might be due to a wrong settings in config, error: ${error}`);
							};
						});

					accessory.addService(buttonService);
				}
			}
		};

		this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
		const debug3 = this.enableDebugMode ? this.log(`Device: ${this.host} ${accessoryName}, published as external accessory.`) : false;
		this.startPrepareAccessory = false;
	}
};