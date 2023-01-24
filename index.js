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
		this.disableLogInfo = config.disableLogInfo || false;
		this.disableLogDeviceInfo = config.disableLogDeviceInfo || false;
		this.enableDebugMode = config.enableDebugMode || false;
		this.getInputsFromDevice = config.getInputsFromDevice || false;
		this.inputs = config.inputs || [];
		this.buttonsMainZone = config.buttonsMainZone || [];
		this.buttonsZone2 = config.buttonsZone2 || [];
		this.buttonsZone3 = config.buttonsZone3 || [];
		this.getSurroundsFromDevice = config.getSurroundsFromDevice || false;
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
		this.inputsSwitchesSensors = [];
		this.inputsSwitchsSensorsDisplayType = [];

		this.power = false;
		this.reference = '';
		this.volume = 0;
		this.mute = true;
		this.soundMode = '';
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
		this.mqtt = new Mqtt({
			enabled: this.mqttEnabled,
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
					await fsPromises.writeFile(this.devInfoFile, devInfo);
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
					const source = (this.zoneControl <= 2) ? this.inputs : this.soundModes;
					const inputs = JSON.stringify(source, null, 2);
					const writeInputs = await fsPromises.writeFile(this.inputsFile, inputs);
					const debug = this.enableDebugMode ? this.log(`Device: ${this.host} ${this.name}, save ${this.zoneControl <= 2 ? 'Inputs' : 'Sound Modes'} succesful: ${inputs}`) : false;
				} catch (error) {
					this.log.error(`Device: ${this.host} ${this.name}, save ${this.zoneControl <= 2 ? 'Inputs' : 'Sound Modes'} error: ${error}`);
				};
			} catch (error) {
				this.log.error(`Device: ${this.host} ${this.name}, ${this.zoneControl} create files or save devInfo error: ${error}`);
			};
		})
			.on('deviceInfo', (manufacturer, modelName, serialNumber, firmwareRevision, zones, apiVersion) => {

				if (!this.disableLogDeviceInfo) {
					this.log('-------- %s --------', this.name);
					this.log('Manufacturer: %s', manufacturer);
					this.log('Model: %s', modelName);
					if (this.zoneControl === 0) {
						this.log('Zones: %s', zones);
						this.log('Control: Main Zone');
						this.log('Firmware: %s', firmwareRevision);
						this.log('Api version: %s', apiVersion);
						this.log('Serialnr: %s', serialNumber);
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

				this.manufacturer = manufacturer;
				this.modelName = modelName;
				this.serialNumber = serialNumber;
				this.firmwareRevision = firmwareRevision;
			})
			.on('stateChanged', (power, reference, volume, mute, soundMode) => {
				const inputIdentifier = (this.inputsReference.indexOf(reference) >= 0) ? this.inputsReference.indexOf(reference) : this.inputIdentifier;

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
					const state = (this.volume !== volume) ? true : false;
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
					const state = (this.inputIdentifier !== inputIdentifier) ? true : false;
					this.sensorInputService
						.updateCharacteristic(Characteristic.ContactSensorState, state)
					this.sensorInputState = state;
				}

				if (this.inputSwitchSensorServices) {
					const switchServicesCount = this.inputSwitchSensorServices.length;
					for (let i = 0; i < switchServicesCount; i++) {
						const index = this.inputsSwitchesSensors[i];
						const state = power ? (this.inputsReference[index] === reference) : false;
						const displayType = this.inputsSwitchsSensorsDisplayType[index];
						const characteristicType = [Characteristic.On, Characteristic.On, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][displayType];
						this.inputSwitchSensorServices[i]
							.updateCharacteristic(characteristicType, state);
					}
				}

				this.power = power;
				this.reference = reference;
				this.volume = volume;
				this.mute = mute;
				this.soundMode = soundMode;
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
		accessory.getService(Service.AccessoryInformation)
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
				const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, get Power state successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
				return state;
			})
			.onSet(async (state) => {
				const masterControl = this.masterPower ? 4 : zoneControl;
				const newState = [(state ? 'ZMON' : 'ZMOFF'), (state ? 'Z2ON' : 'Z2OFF'), (state ? 'Z3ON' : 'Z3OFF'), (state ? 'ZMON' : 'ZMOFF'), (state ? 'PWON' : 'PWSTANDBY')][masterControl];
				try {
					const setPower = (state !== this.power) ? await this.denon.send(CONSTANS.ApiUrls.iPhoneDirect + newState) : false;
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Power state successful, state: %s', this.host, accessoryName, newState);
					this.power = state;
				} catch (error) {
					this.log.error('Device: %s %s, can not set Power state. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
			.onGet(async () => {
				const inputIdentifier = this.inputIdentifier;
				const inputName = this.inputsName[inputIdentifier];
				const inputReference = this.inputsReference[inputIdentifier];
				const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, get %s successful, name: %s, reference: %s', this.host, accessoryName, zoneControl <= 2 ? 'Input' : 'Sound Mode', inputName, inputReference);
				return inputIdentifier;
			})
			.onSet(async (inputIdentifier) => {
				const inputName = this.inputsName[inputIdentifier];
				const inputMode = this.inputsMode[inputIdentifier];
				const inputReference = this.inputsReference[inputIdentifier];
				const zone = [inputMode, 'Z2', 'Z3', inputMode][zoneControl];
				const inputRef = zone + inputReference;
				try {
					const setInput = await this.denon.send(CONSTANS.ApiUrls.iPhoneDirect + inputRef);
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set %s successful, name: %s, reference: %s', this.host, accessoryName, zoneControl <= 2 ? 'Input' : 'Sound Mode', inputName, inputRef);
					this.inputIdentifier = inputIdentifier;
				} catch (error) {
					this.log.error('Device: %s %s, can not set %s. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, zoneControl <= 2 ? 'Input' : 'Sound Mode', error);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.RemoteKey)
			.onSet(async (command) => {
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
				try {
					const setCommand = await this.denon.send(CONSTANS.ApiUrls.iPhoneDirect + command);
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, Remote Key successful, command: %s', this.host, accessoryName, command);
				} catch (error) {
					this.log.error('Device: %s %s, can not Remote Key command. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
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
					const brightness = `PVBR ${value}`;
					try {
						const setBrightness = await this.denon.send(CONSTANS.ApiUrls.iPhoneDirect + brightness);
						const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Brightness successful, brightness: %s', this.host, accessoryName, value);
					} catch (error) {
						this.log.error('Device: %s %s, can not set Brightness. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
					};
				});

			this.televisionService.getCharacteristic(Characteristic.PictureMode)
				.onGet(async () => {
					const pictureMode = this.pictureMode;
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, get Picture mode: %s', this.host, accessoryName, pictureMode);
					return pictureMode;
				})
				.onSet(async (command) => {
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
					try {
						const setCommand = await this.denon.send(CONSTANS.ApiUrls.iPhoneDirect + command);
						const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Picture Mode successful, command: %s', this.host, accessoryName, command);
					} catch (error) {
						this.log.error('Device: %s %s, can not set Picture Mode command. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
					};
				});

			this.televisionService.getCharacteristic(Characteristic.PowerModeSelection)
				.onSet(async (command) => {
					switch (command) {
						case Characteristic.PowerModeSelection.SHOW:
							command = 'MNOPT';
							break;
						case Characteristic.PowerModeSelection.HIDE:
							command = 'MNRTN';
							break;
					}
					try {
						const setCommand = await this.denon.send(CONSTANS.ApiUrls.iPhoneDirect + command);
						const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Power Mode Selection successful, command: %s', this.host, accessoryName, command);
					} catch (error) {
						this.log.error('Device: %s %s, can not set Power Mode Selection command. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
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
				try {
					const setVolume = await this.denon.send(CONSTANS.ApiUrls.iPhoneDirect + zone + command);
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, setVolumeSelector successful, command: %s', this.host, accessoryName, command);
				} catch (error) {
					this.log.error('Device: %s %s, can not setVolumeSelector command. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
				};
			});

		this.tvSpeakerService.getCharacteristic(Characteristic.Volume)
			.onGet(async () => {
				const volume = this.volume;
				const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, get Volume level successful: %s dB', this.host, accessoryName, (volume - 80));
				return volume;
			})
			.onSet(async (volume) => {
				const masterControl = this.masterVolume ? 4 : zoneControl;
				const zone = ['MV', 'Z2', 'Z3', 'MV', 'MV'][masterControl];
				if (volume === 0 || volume === 100) {
					if (this.volume < 10) {
						volume = `0${this.volume}`;
					} else {
						volume = this.volume;
					}
				} else {
					if (volume < 10) {
						volume = `0${volume}`;
					}
				}
				try {
					const setVolume = await this.denon.send(CONSTANS.ApiUrls.iPhoneDirect + zone + volume);
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set new Volume level successful, volume: %s dB', this.host, accessoryName, volume - 80);
					this.volume = volume;
				} catch (error) {
					this.log.error('Device: %s %s, can not set new Volume level. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
				};
			});

		this.tvSpeakerService.getCharacteristic(Characteristic.Mute)
			.onGet(async () => {
				const state = this.mute;
				const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, get Mute state successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
				return state;
			})
			.onSet(async (state) => {
				const masterControl = this.masterMute ? 4 : zoneControl;
				const zone = ['', 'Z2', 'Z3', '', ''][masterControl];
				const newState = state ? 'MUON' : 'MUOFF';
				try {
					const toggleMute = (this.power && state !== this.mute) ? await this.denon.send(CONSTANS.ApiUrls.iPhoneDirect + zone + newState) : false;
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set new Mute state successful, state: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
					this.mute = state;
				} catch (error) {
					this.log.error('Device: %s %s, can not set new Mute state. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
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

		const savedInputs = ((fs.readFileSync(this.inputsFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsFile)) : [];
		const debug = this.enableDebugMode ? this.log('Device: %s %s, read saved %s successful: %s', this.host, accessoryName, zoneControl <= 2 ? 'Input' : 'Sound Mode', JSON.stringify(savedInputs, null, 2)) : false;

		const savedInputsNames = ((fs.readFileSync(this.inputsNamesFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsNamesFile)) : {};
		const debug1 = this.enableDebugMode ? this.log('Device: %s %s, read saved custom %s Names successful: %s', this.host, accessoryName, zoneControl <= 2 ? 'Input' : 'Sound Mode', JSON.stringify(savedInputsNames, null, 2)) : false;

		const savedInputsTargetVisibility = ((fs.readFileSync(this.inputsTargetVisibilityFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsTargetVisibilityFile)) : {};
		const debug2 = this.enableDebugMode ? this.log('Device: %s %s, read saved %s Target Visibility successful: %s', this.host, accessoryName, zoneControl <= 2 ? 'Input' : 'Sound Mode', JSON.stringify(savedInputsTargetVisibility, null, 2)) : false;

		//check available inputs and possible count (max 94)
		const inputs = (savedInputs.length > 0) ? savedInputs : (zoneControl <= 2) ? this.inputs : this.soundModes;
		const inputsCount = inputs.length;
		const maxInputsCount = (inputsCount < 94) ? inputsCount : 94;
		for (let i = 0; i < maxInputsCount; i++) {
			//input
			const input = inputs[i];

			//get input reference
			const inputReference = (input.reference) ? input.reference : undefined;

			//get input name		
			const inputName = (savedInputsNames[inputReference]) ? savedInputsNames[inputReference] : input.name;

			//get input type
			const inputType = (zoneControl <= 2) ? (input.type) ? CONSTANS.InputSourceType.indexOf(input.type) : 3 : 0;

			//get input mode
			const inputMode = (zoneControl <= 2) ? (input.mode) ? input.mode : 'SI' : 'MS';

			//get input switch
			const inputSwitchSensorDisplayType = input.displayType || -1;

			//get input configured
			const isConfigured = 1;

			//get input visibility state
			const currentVisibility = (savedInputsTargetVisibility[inputReference]) ? savedInputsTargetVisibility[inputReference] : 0;
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
					const nameIdentifier = (inputReference) ? inputReference : false;
					savedInputsNames[nameIdentifier] = name;
					const newCustomName = JSON.stringify(savedInputsNames, null, 2);
					try {
						const writeNewCustomName = nameIdentifier ? await fsPromises.writeFile(this.inputsNamesFile, newCustomName) : false;
						const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, new %s name saved successful, name: %s, reference: %s', this.host, accessoryName, zoneControl <= 2 ? 'Input' : 'Sound Mode', name, inputReference);
					} catch (error) {
						this.log.error('Device: %s %s, new %s name saved failed, Error: %s', this.host, accessoryName, zoneControl <= 2 ? 'Input' : 'Sound Mode', error);
					}
				});

			inputService
				.getCharacteristic(Characteristic.TargetVisibilityState)
				.onSet(async (state) => {
					const targetVisibilityIdentifier = (inputReference) ? inputReference : false;
					savedInputsTargetVisibility[targetVisibilityIdentifier] = state;
					const newTargetVisibility = JSON.stringify(savedInputsTargetVisibility, null, 2);
					try {
						const writeNewTargetVisibility = targetVisibilityIdentifier ? await fsPromises.writeFile(this.inputsTargetVisibilityFile, newTargetVisibility) : false;
						const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, new %s Target Visibility saved successful, name: %s, state: %s', this.host, accessoryName, zoneControl <= 2 ? 'Input' : 'Sound Mode', inputName, state ? 'HIDEN' : 'SHOWN');
						inputService.setCharacteristic(Characteristic.CurrentVisibilityState, state);
					} catch (error) {
						this.log.error('Device: %s %s, saved %s Target Visibility state error: %s', this.host, accessoryName, zoneControl <= 2 ? 'Input' : 'Sound Mode', error);
					}
				});

			this.inputsReference.push(inputReference);
			this.inputsName.push(inputName);
			this.inputsType.push(inputType);
			this.inputsMode.push(inputMode);
			this.inputsSwitchsSensorsDisplayType.push(inputSwitchSensorDisplayType);
			const pushInputSwitchIndex = inputSwitchSensorDisplayType >= 0 ? this.inputsSwitchesSensors.push(i) : false;

			this.televisionService.addLinkedService(inputService);
			accessory.addService(inputService);
		};

		//prepare inputs switch service
		//check available switch inputs and possible count (max 94)
		const inputsSwitchesSensors = this.inputsSwitchesSensors;
		const inputsSwitchesSensorsCount = inputsSwitchesSensors.length;
		const availableInputsSwitchesSensorsCount = 94 - maxInputsCount;
		const maxInputsSwitchesSensorsCount = (availableInputsSwitchesSensorsCount > 0) ? (availableInputsSwitchesSensorsCount > inputsSwitchesSensorsCount) ? inputsSwitchesSensorsCount : availableInputsSwitchesSensorsCount : 0;
		if (maxInputsSwitchesSensorsCount > 0) {
			this.log.debug('prepareSwitchsService');
			this.inputSwitchSensorServices = [];
			for (let i = 0; i < maxInputsSwitchesSensorsCount; i++) {
				//get switch
				const index = inputsSwitchesSensors[i];

				//get switch reference
				const inputSwitchSensorReference = this.inputsReference[index];

				//get switch name		
				const inputSwitchSensorName = this.inputsName[index];

				//get switch mode
				const inputSwitchSensorMode = (zoneControl <= 2) ? this.inputsMode[index] : 'MS';

				//get switch display type
				const inputSwitchSensorDisplayType = this.inputsSwitchsSensorsDisplayType[index];

				const serviceType = [Service.Outlet, Service.Switch, Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][inputSwitchSensorDisplayType];
				const characteristicType = [Characteristic.On, Characteristic.On, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][inputSwitchSensorDisplayType];
				const switchService = new serviceType(`${this.sZoneName} ${inputSwitchSensorName}`, `Sensor ${i}`);
				switchService.getCharacteristic(characteristicType)
					.onGet(async () => {
						const state = this.power ? (inputSwitchSensorReference === this.reference) : false;
						return state;
					})
					.onSet(async (state) => {
						if (inputSwitchSensorDisplayType <= 1) {
							const zone = [inputSwitchSensorMode, 'Z2', 'Z3', inputSwitchSensorMode][zoneControl];
							const inputSwitchRef = zone + inputSwitchSensorReference;
							try {
								const setSwitchInput = (state && this.power) ? await this.denon.send(CONSTANS.ApiUrls.iPhoneDirect + inputSwitchRef) : false;
								const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set new Input successful, name: %s, reference: %s', this.host, accessoryName, inputSwitchSensorName, inputSwitchSensorReference);
							} catch (error) {
								this.log.error('Device: %s %s, can not set new Input. Might be due to a wrong settings in config, error: %s.', this.host, accessoryName, error);
							};
						};
					});

				this.inputSwitchSensorServices.push(switchService);
				accessory.addService(this.inputSwitchSensorServices[i]);
			}
		};

		//prepare button service
		if (zoneControl <= 2) {
			//check available buttons and possible count (max 94)
			const buttons = this.buttons;
			const buttonsCount = buttons.length;
			const availableButtonsCount = (94 - (maxInputsCount + maxInputsSwitchesSensorsCount));
			const maxButtonsCount = (availableButtonsCount > 0) ? (availableButtonsCount > buttonsCount) ? buttonsCount : availableButtonsCount : 0;
			if (maxButtonsCount > 0) {
				this.log.debug('prepareButtonsService');
				for (const button of buttons) {
					//get button reference
					const buttonReference = button.reference;

					//get button name
					const buttonName = (button.name) ? button.name : button.reference;

					//get button display type
					const buttonDisplayType = (button.displayType) ? button.displayType : 0;

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
								const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set new Input successful, name: %s, reference: %s', this.host, accessoryName, buttonName, buttonReference);

								setTimeout(() => {
									const setChar = (state && this.power) ? buttonService.updateCharacteristic(Characteristic.On, false) : false;
								}, 300)
							} catch (error) {
								this.log.error('Device: %s %s, can not set new Input. Might be due to a wrong settings in config, error: %s.', this.host, accessoryName, error);
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