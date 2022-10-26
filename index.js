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
		this.devices = config.devices;
		this.accessories = [];

		this.api.on('didFinishLaunching', () => {
			this.log.debug('didFinishLaunching');
			for (let i = 0; i < this.devices.length; i++) {
				const device = this.devices[i];
				if (!device.name || !device.host || !device.port) {
					this.log.warn('Device name, host or port missing!');
				} else {
					new denonTvDevice(this.log, device, this.api);
				}
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
		this.zoneControl = config.zoneControl;
		this.volumeControl = config.volumeControl || 0;
		this.infoButtonCommand = config.infoButtonCommand || 'MNINF';
		this.masterPower = config.masterPower || false;
		this.sensorPower = config.sensorPower || false;
		this.masterVolume = config.masterVolume || false;
		this.sensorVolume = config.sensorVolume || false
		this.masterMute = config.masterMute || false;
		this.sensorMute = config.sensorMute || false
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

		this.inputsReference = new Array();
		this.inputsName = new Array();
		this.inputsType = new Array();
		this.inputsMode = new Array();

		this.switches = new Array();
		this.switchesDisplayType = new Array();

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

		this.prefDir = path.join(api.user.storagePath(), 'denonTv');
		this.devInfoFile = `${this.prefDir}/devInfo_${this.host.split('.').join('')}`;
		this.inputsFile = `${this.prefDir}/inputs_${this.sZoneName}${this.host.split('.').join('')}`;
		this.inputsNamesFile = `${this.prefDir}/inputsNames_${this.sZoneName}${this.host.split('.').join('')}`;
		this.inputsTargetVisibilityFile = `${this.prefDir}/inputsTargetVisibility_${this.sZoneName}${this.host.split('.').join('')}`;

		//check if the directory exists, if not then create it
		if (fs.existsSync(this.prefDir) == false) {
			fs.mkdirSync(this.prefDir);
		}
		if (this.zoneControl == 0) {
			if (fs.existsSync(this.devInfoFile) == false) {
				const obj = {
					'manufacturer': this.manufacturer,
					'modelName': this.modelName,
					'serialNumber': this.serialNumber,
					'firmwareRevision': this.firmwareRevision
				};
				const devInfo = JSON.stringify(obj, null, 2);
				fs.writeFileSync(this.devInfoFile, devInfo);
			}
		}
		if (fs.existsSync(this.inputsFile) == false) {
			fs.writeFileSync(this.inputsFile, '');
		}
		if (fs.existsSync(this.inputsNamesFile) == false) {
			fs.writeFileSync(this.inputsNamesFile, '');
		}
		if (fs.existsSync(this.inputsTargetVisibilityFile) == false) {
			fs.writeFileSync(this.inputsTargetVisibilityFile, '');
		}

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
			devInfoFile: this.devInfoFile,
			zoneControl: this.zoneControl,
			mqttEnabled: this.mqttEnabled
		});

		this.denon.on('connected', async (message) => {
			this.log(`Device: ${this.host} ${this.name}, ${message}`);

			//save inputs to the file
			try {
				const inputs = (this.zoneControl <= 2) ? this.inputs : this.soundModes;
				const obj = JSON.stringify(inputs, null, 2);
				const writeInputs = await fsPromises.writeFile(this.inputsFile, obj);
				const debug = this.enableDebugMode ? this.log(`Device: ${this.host} ${this.name}, save ${this.zoneControl <= 2 ? 'Inputs' : 'Sound Modes'} succesful: ${obj}`) : false;
			} catch (error) {
				this.log.error(`Device: ${this.host} ${this.name}, save ${this.zoneControl <= 2 ? 'Inputs' : 'Sound Modes'} error: ${error}`);
			};
		})
			.on('deviceInfo', (manufacturer, modelName, serialNumber, firmwareRevision, zones, apiVersion) => {
				if (!this.disableLogDeviceInfo) {
					this.log('-------- %s --------', this.name);
					this.log('Manufacturer: %s', manufacturer);
					this.log('Model: %s', modelName);
					if (this.zoneControl == 0) {
						this.log('Zones: %s', zones);
						this.log('Control: Main Zone');
						this.log('Firmware: %s', firmwareRevision);
						this.log('Api version: %s', apiVersion);
						this.log('Serialnr: %s', serialNumber);
					}
					if (this.zoneControl == 1) {
						this.log('Control: Zone 2');
					}
					if (this.zoneControl == 2) {
						this.log('Control: Zone 3');
					}
					if (this.zoneControl == 3) {
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
					if (this.volumeService && this.volumeControl == 1) {
						this.volumeService
							.updateCharacteristic(Characteristic.Brightness, volume)
							.updateCharacteristic(Characteristic.On, !mute);
					}
					if (this.volumeServiceFan && this.volumeControl == 2) {
						this.volumeServiceFan
							.updateCharacteristic(Characteristic.RotationSpeed, volume)
							.updateCharacteristic(Characteristic.On, !mute);
					}
				}

				if (this.sensorPowerService) {
					this.sensorPowerService
						.updateCharacteristic(Characteristic.MotionDetected, power)
				}

				if (this.sensorVolumeService) {
					const state = (this.volume != volume) ? true : false;
					this.sensorVolumeService
						.updateCharacteristic(Characteristic.MotionDetected, state)
					this.sensorVolumeState = state;
				}

				if (this.sensorMuteService) {
					const state = power ? this.mute : false;
					this.sensorMuteService
						.updateCharacteristic(Characteristic.MotionDetected, state)
				}

				if (this.switchServices) {
					const switchServicesCount = this.switchServices.length;
					for (let i = 0; i < switchServicesCount; i++) {
						const index = this.switches[i];
						const state = power ? (this.inputsReference[index] == reference) : false;
						const displayType = this.switchesDisplayType[index];
						const characteristicType = [Characteristic.On, Characteristic.On, Characteristic.MotionDetected, Characteristic.OccupancyDetected][displayType];
						this.switchServices[i]
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
					const setPower = (state != this.power) ? await this.denon.send(CONSTANS.ApiUrls.iPhoneDirect + newState) : false;
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
					const setInput = (inputReference != undefined) ? await this.denon.send(CONSTANS.ApiUrls.iPhoneDirect + inputRef) : false;
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set %s successful, name: %s, reference: %s', this.host, accessoryName, zoneControl <= 2 ? 'Input' : 'Sound Mode', inputName, inputRef);
					this.inputIdentifier = inputIdentifier;
				} catch (error) {
					this.log.error('Device: %s %s, can not set %s. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, zoneControl <= 2 ? 'Input' : 'Sound Mode', error);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.RemoteKey)
			.onSet(async (command) => {
				if (this.inputReference == 'SPOTIFY' || this.inputReference == 'BT' || this.inputReference == 'USB/IPOD' || this.inputReference == 'NET' || this.inputReference == 'MPLAY') {
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
		if (zoneControl == 0) {
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
				if (volume == 0 || volume == 100) {
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
					const toggleMute = (this.power && state != this.mute) ? await this.denon.send(CONSTANS.ApiUrls.iPhoneDirect + zone + newState) : false;
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
			if (this.volumeControl == 1) {
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

			if (this.volumeControl == 2) {
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

		if (this.sensorPower) {
			this.log.debug('prepareSensorPowerService')
			this.sensorPowerService = new Service.MotionSensor(`${this.sZoneName} Power Sensor`, `Power Sensor`);
			this.sensorPowerService.getCharacteristic(Characteristic.MotionDetected)
				.onGet(async () => {
					const state = this.power;
					return state;
				});
			accessory.addService(this.sensorPowerService);
		};

		if (this.sensorVolume) {
			this.log.debug('prepareSensorVolumeService')
			this.sensorVolumeService = new Service.MotionSensor(`${this.sZoneName} Volume Sensor`, `Volume Sensor`);
			this.sensorVolumeService.getCharacteristic(Characteristic.MotionDetected)
				.onGet(async () => {
					const state = this.sensorVolumeState;
					return state;
				});
			accessory.addService(this.sensorVolumeService);
		};

		if (this.sensorMute) {
			this.log.debug('prepareSensorMuteService')
			this.sensorMuteService = new Service.MotionSensor(`${this.sZoneName} Mute Sensor`, `Mute Sensor`);
			this.sensorMuteService.getCharacteristic(Characteristic.MotionDetected)
				.onGet(async () => {
					const state = this.power ? this.mute : false;
					return state;
				});
			accessory.addService(this.sensorMuteService);
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
			const inputReference = (input.reference != undefined) ? input.reference : undefined;

			//get input name		
			const inputName = (savedInputsNames[inputReference] != undefined) ? savedInputsNames[inputReference] : input.name;

			//get input type
			const inputType = (zoneControl <= 2) ? (input.type != undefined) ? CONSTANS.InputSourceType.indexOf(input.type) : 3 : 0;

			//get input mode
			const inputMode = (zoneControl <= 2) ? (input.mode != undefined) ? input.mode : 'SI' : 'MS';

			//get input switch
			const inputSwitch = (input.switch != undefined) ? input.switch : false;

			//get input switch
			const inputSwitchDisplayType = (input.displayType != undefined) ? input.displayType : 0;

			//get input configured
			const isConfigured = 1;

			//get input visibility state
			const currentVisibility = (savedInputsTargetVisibility[inputReference] != undefined) ? savedInputsTargetVisibility[inputReference] : 0;
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
					const nameIdentifier = (inputReference != undefined) ? inputReference : false;
					let newName = savedInputsNames;
					newName[nameIdentifier] = name;
					const newCustomName = JSON.stringify(newName, null, 2);
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
					const targetVisibilityIdentifier = (inputReference != undefined) ? inputReference : false;
					let newState = savedInputsTargetVisibility;
					newState[targetVisibilityIdentifier] = state;
					const newTargetVisibility = JSON.stringify(newState, null, 2);
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
			this.switchesDisplayType.push(inputSwitchDisplayType);
			const pushSwitchIndex = inputSwitch ? this.switches.push(i) : false;

			this.televisionService.addLinkedService(inputService);
			accessory.addService(inputService);
		};

		//prepare inputs switch service
		//check available switch inputs and possible count (max 94)
		const switches = this.switches;
		const switchesCount = switches.length;
		const availableSwitchesCount = 94 - maxInputsCount;
		const maxSwitchesCount = (availableSwitchesCount > 0) ? (availableSwitchesCount > switchesCount) ? switchesCount : availableSwitchesCount : 0;
		if (maxSwitchesCount > 0) {
			this.log.debug('prepareSwitchsService');
			this.switchServices = new Array();
			for (let i = 0; i < maxSwitchesCount; i++) {
				//get switch
				const inputSwitch = switches[i];

				//get switch reference
				const inputSwitchReference = this.inputsReference[inputSwitch];

				//get switch name		
				const inputSwitchName = this.inputsName[inputSwitch];

				//get switch mode
				const inputSwitchMode = (zoneControl <= 2) ? this.inputsMode[inputSwitch] : 'MS';

				//get switch display type
				const inputSwitchDisplayType = this.switchesDisplayType[inputSwitch];

				const serviceType = [Service.Outlet, Service.Switch, Service.MotionSensor, Service.OccupancySensor][inputSwitchDisplayType];
				const characteristicType = [Characteristic.On, Characteristic.On, Characteristic.MotionDetected, Characteristic.OccupancyDetected][inputSwitchDisplayType];
				const switchService = new serviceType(`${this.sZoneName} ${inputSwitchName}`, `Sensor ${i}`);
				switchService.getCharacteristic(characteristicType)
					.onGet(async () => {
						const state = this.power ? (inputSwitchReference == this.reference) : false;
						return state;
					})
					.onSet(async (state) => {
						if (inputSwitchDisplayType <= 1) {
							const zone = [inputSwitchMode, 'Z2', 'Z3', inputSwitchMode][zoneControl];
							const inputSwitchRef = zone + inputSwitchReference;
							try {
								const setSwitchInput = (state && this.power) ? await this.denon.send(CONSTANS.ApiUrls.iPhoneDirect + inputSwitchRef) : false;
								const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set new Input successful, name: %s, reference: %s', this.host, accessoryName, inputSwitchName, inputSwitchReference);
								switchService.updateCharacteristic(Characteristic.On, false);
							} catch (error) {
								this.log.error('Device: %s %s, can not set new Input. Might be due to a wrong settings in config, error: %s.', this.host, accessoryName, error);
								switchService.updateCharacteristic(Characteristic.On, false);
							};
						};
					});

				this.switchServices.push(switchService);
				accessory.addService(this.switchServices[i]);
			}
		};

		//prepare button service
		if (zoneControl <= 2) {
			//check available buttons and possible count (max 94)
			const buttons = this.buttons;
			const buttonsCount = buttons.length;
			const availableButtonsCount = (94 - (maxInputsCount + maxSwitchesCount));
			const maxButtonsCount = (availableButtonsCount > 0) ? (availableButtonsCount > buttonsCount) ? buttonsCount : availableButtonsCount : 0;
			if (maxButtonsCount > 0) {
				this.log.debug('prepareButtonsService');
				for (let i = 0; i < maxButtonsCount; i++) {
					//button
					const button = buttons[i];

					//get button reference
					const buttonReference = button.reference;

					//get button name
					const buttonName = (button.name != undefined) ? button.name : button.reference;

					//get button display type
					const buttonDisplayType = (button.displayType != undefined) ? button.displayType : 0;

					const serviceType = [Service.Outlet, Service.Switch][buttonDisplayType];
					const buttonService = new serviceType(`${this.sZoneName} ${buttonName}`, `Button ${i}`);
					buttonService.getCharacteristic(Characteristic.On)
						.onGet(async () => {
							const state = false;
							return state;
						})
						.onSet(async (state) => {
							try {
								const setFunction = (state && this.power) ? await this.denon.send(CONSTANS.ApiUrls.iPhoneDirect + buttonReference) : false;
								const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set new Input successful, name: %s, reference: %s', this.host, accessoryName, buttonName, buttonReference);
								buttonService.updateCharacteristic(Characteristic.On, false);
							} catch (error) {
								this.log.error('Device: %s %s, can not set new Input. Might be due to a wrong settings in config, error: %s.', this.host, accessoryName, error);
								buttonService.updateCharacteristic(Characteristic.On, false);
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