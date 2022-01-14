'use strict';

const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const denon = require('./src/denon');
const API_URL = require('./src/apiurl.json');

const PLUGIN_NAME = 'homebridge-denon-tv';
const PLATFORM_NAME = 'DenonTv';

const ZONE_NAME = ['Main Zone', 'Zone 2', 'Zone 3', 'Sound Mode'];
const SHORT_ZONE_NAME = ['MZ', 'Z2', 'Z3', 'SM'];
const INPUT_SOURCE_TYPES = ['OTHER', 'HOME_SCREEN', 'TUNER', 'HDMI', 'COMPOSITE_VIDEO', 'S_VIDEO', 'COMPONENT_VIDEO', 'DVI', 'AIRPLAY', 'USB', 'APPLICATION'];

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
			log('No configuration found for %s', PLUGIN_NAME);
			return;
		}
		this.log = log;
		this.api = api;
		this.devices = config.devices || [];
		this.accessories = [];

		this.api.on('didFinishLaunching', () => {
			this.log.debug('didFinishLaunching');
			for (let i = 0; i < this.devices.length; i++) {
				const device = this.devices[i];
				if (!device.name || !device.host || !device.port) {
					this.log.warn('Device Name, Host or Port Missing');
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
		this.name = config.name || 'AV Receiver';
		this.host = config.host;
		this.port = config.port;
		this.volumeControl = config.volumeControl || 0;
		this.switchInfoMenu = config.switchInfoMenu || false;
		this.inputs = config.inputs || [];
		this.buttonsMainZone = config.buttonsMainZone || [];
		this.buttonsZone2 = config.buttonsZone2 || [];
		this.buttonsZone3 = config.buttonsZone3 || [];
		this.soundModes = config.surrounds || [];
		this.zoneControl = config.zoneControl || 0;
		this.masterPower = config.masterPower || false;
		this.masterVolume = config.masterVolume || false;
		this.masterMute = config.masterMute || false;
		this.enableDebugMode = config.enableDebugMode || false;
		this.disableLogInfo = config.disableLogInfo || false;
		this.disableLogDeviceInfo = config.disableLogDeviceInfo || false;

		//get Device info
		this.manufacturer = 'Denon/Marantz';
		this.modelName = 'Model Name';
		this.serialNumber = 'Serial Number';
		this.firmwareRevision = 'Firmware Revision';

		//zones
		this.zoneName = ZONE_NAME[this.zoneControl];
		this.sZoneName = SHORT_ZONE_NAME[this.zoneControl];
		this.buttons = [this.buttonsMainZone, this.buttonsZone2, this.buttonsZone3, this.buttonsMainZone][this.zoneControl];

		//setup variables
		this.startPrepareAccessory = true;

		this.inputsReference = new Array();
		this.inputsName = new Array();
		this.inputsType = new Array();
		this.inputsMode = new Array();
		this.inputsSwitchIndex = new Array();

		this.powerState = false;
		this.reference = '';
		this.volume = 0;
		this.muteState = true;
		this.soundMode = '';
		this.mediaState = false;

		this.setStartInput = false;
		this.startInputIdentifier = 0;
		this.inputIdentifier = 0;

		this.pictureMode = 0;
		this.brightness = 0;

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
				fs.writeFileSync(this.devInfoFile, '');
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

		//save inputs to the file
		try {
			const inputs = (this.zoneControl <= 2) ? this.inputs : this.soundModes;
			const obj = JSON.stringify(inputs, null, 2);
			fs.writeFileSync(this.inputsFile, obj);
			const debug = this.enableDebugMode ? this.log('Device: %s %s %s, save %s succesful: %s', this.host, this.name, this.sZoneName, this.zoneControl <= 2 ? 'Inputs' : 'Sound Modes', obj) : false;
		} catch (error) {
			this.log.error('Device: %s %s %s, save %s error: %s', this.host, this.name, this.sZoneName, this.zoneControl <= 2 ? 'Inputs' : 'Sound Modes', error);
		};

		this.denon = new denon({
			host: this.host,
			port: this.port,
			zoneControl: this.zoneControl,
			devInfoFile: this.devInfoFile
		});

		this.denon.on('connected', (message) => {
				this.log('Device: %s %s %s, %s', this.host, this.name, this.sZoneName, message);
			})
			.on('error', (error) => {
				this.log('Device: %s %s %s, %s', this.host, this.name, this.sZoneName, error);
			})
			.on('debug', (message) => {
				const debug = this.enableDebugMode ? this.log('Device: %s %s %s, debug: %s', this.host, this.name, this.sZoneName, message) : false;
			})
			.on('message', (message) => {
				const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s %s, %s', this.host, this.name, this.sZoneName, message);
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

				//start prepare accessory
				if (this.startPrepareAccessory) {
					this.prepareAccessory();
				};
			})
			.on('stateChanged', (isConnected, power, reference, volume, mute, soundMode) => {
				reference = (reference == 'Internet Radio') ? 'IRADIO' : (reference == 'AirPlay') ? 'NET' : reference;

				const powerState = (isConnected == true && power == true);
				const inputIdentifier = (this.inputsReference.indexOf(reference) >= 0) ? this.inputsReference.indexOf(reference) : this.inputIdentifier;

				if (this.televisionService) {
					this.televisionService
						.updateCharacteristic(Characteristic.Active, powerState)
						.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);

					if (this.setStartInput) {
						setTimeout(() => {
							this.televisionService.setCharacteristic(Characteristic.ActiveIdentifier, this.startInputIdentifier);
							this.setStartInput = false;
						}, 1200);
					}
				}

				if (this.speakerService) {
					this.speakerService
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

				if (this.switchServices) {
					const switchServicesCount = this.switchServices.length;
					for (let i = 0; i < switchServicesCount; i++) {
						const switchIndex = this.inputsSwitchIndex[i];
						const switchState = (this.inputsReference[switchIndex] == reference);
						this.switchServices[i]
							.updateCharacteristic(Characteristic.On, switchState);
					}
				}

				this.powerState = power;
				this.reference = reference;
				this.volume = volume;
				this.muteState = mute;
				this.soundMode = soundMode;
				this.inputIdentifier = inputIdentifier;
			})
			.on('disconnected', (message) => {
				this.log('Device: %s %s %s, %s', this.host, this.name, this.sZoneName, message);
			});
	}

	//Prepare accessory
	prepareAccessory() {
		this.log.debug('prepareAccessory');
		const accessoryName = this.name;
		const accessoryUUID = UUID.generate(this.serialNumber + this.zoneControl);
		const accessoryCategory = Categories.AUDIO_RECEIVER;
		const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

		//Prepare information service
		this.log.debug('prepareInformationService');

		const manufacturer = this.manufacturer;
		const modelName = this.modelName;
		const serialNumber = this.serialNumber;
		const firmwareRevision = this.firmwareRevision;

		accessory.removeService(accessory.getService(Service.AccessoryInformation));
		const informationService = new Service.AccessoryInformation(accessoryName);
		informationService
			.setCharacteristic(Characteristic.Manufacturer, manufacturer)
			.setCharacteristic(Characteristic.Model, modelName)
			.setCharacteristic(Characteristic.SerialNumber, serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, firmwareRevision);
		accessory.addService(informationService);

		//Prepare television service
		this.log.debug('prepareTelevisionService');
		this.televisionService = new Service.Television(`${accessoryName} Television`, 'Television');
		this.televisionService.setCharacteristic(Characteristic.ConfiguredName, accessoryName);
		this.televisionService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.televisionService.getCharacteristic(Characteristic.Active)
			.onGet(async () => {
				const state = this.powerState;
				const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s %s, get Power state successfull, state: %s', this.host, accessoryName, this.sZoneName, state ? 'ON' : 'OFF');
				return state;
			})
			.onSet(async (state) => {
				const zControl = this.masterPower ? 4 : this.zoneControl;
				const newState = [(state ? 'ZMON' : 'ZMOFF'), (state ? 'Z2ON' : 'Z2OFF'), (state ? 'Z3ON' : 'Z3OFF'), (state ? 'ZMON' : 'ZMOFF'), (state ? 'PWON' : 'PWSTANDBY')][zControl];
				try {
					const setPower = (state != this.powerState) ? await this.denon.send(API_URL.iPhoneDirect + newState) : false;
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s %s, set Power state successful, state: %s', this.host, accessoryName, this.sZoneName, newState);
				} catch (error) {
					this.log.error('Device: %s %s %s, can not set Power state. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, this.sZoneName, error);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
			.onGet(async () => {
				const inputIdentifier = this.inputIdentifier;
				const inputName = this.inputsName[inputIdentifier];
				const inputReference = this.inputsReference[inputIdentifier];
				const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s %s, get %s successful, name: %s, reference: %s', this.host, accessoryName, this.sZoneName, this.zoneControl <= 2 ? 'Input' : 'Sound Mode', inputName, inputReference);
				return inputIdentifier;
			})
			.onSet(async (inputIdentifier) => {
				const inputName = this.inputsName[inputIdentifier];
				const inputMode = this.inputsMode[inputIdentifier];
				const inputReference = this.inputsReference[inputIdentifier];
				const zone = [inputMode, 'Z2', 'Z3', inputMode][this.zoneControl];
				const inputRef = zone + inputReference;
				try {
					const setInput = (this.powerState && inputReference != undefined) ? await this.denon.send(API_URL.iPhoneDirect + inputRef) : false;
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s %s, set %s successful, name: %s, reference: %s', this.host, accessoryName, this.sZoneName, this.zoneControl <= 2 ? 'Input' : 'Sound Mode', inputName, inputRef);
					this.inputIdentifier = inputIdentifier;
				} catch (error) {
					this.log.error('Device: %s %s %s, can not set %s. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, this.sZoneName, this.zoneControl <= 2 ? 'Input' : 'Sound Mode', error);
				};
				this.setStartInput = !this.powerState;
				this.startInputIdentifier = inputIdentifier;
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
							command = this.switchInfoMenu ? 'MNINF' : 'MNOPT';
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
							command = this.switchInfoMenu ? 'MNINF' : 'MNOPT';
							break;
					}
				}
				try {
					const setCommand = await this.denon.send(API_URL.iPhoneDirect + command);
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s %s, Remote Key successful, command: %s', this.host, accessoryName, this.sZoneName, command);
				} catch (error) {
					this.log.error('Device: %s %s %s, can not Remote Key command. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, this.sZoneName, error);
				};
			});


		//optional television characteristics
		if (this.zoneControl == 0) {
			this.televisionService.getCharacteristic(Characteristic.Brightness)
				.onGet(async () => {
					const brightness = this.brightness;
					return brightness;
				})
				.onSet(async (value) => {
					const brightness = `PVBR ${value}`;
					try {
						const setBrightness = await this.denon.send(API_URL.iPhoneDirect + brightness);
						const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s %s, set Brightness successful, brightness: %s', this.host, accessoryName, this.sZoneName, value);
						this.brightness = value;
					} catch (error) {
						this.log.error('Device: %s %s %s, can not set Brightness. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, this.sZoneName, error);
					};
				});

			this.televisionService.getCharacteristic(Characteristic.PictureMode)
				.onGet(async () => {
					const pictureMode = this.pictureMode;
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s %s, get Picture mode: %s', this.host, accessoryName, this.sZoneName, pictureMode);
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
						const setCommand = await this.denon.send(API_URL.iPhoneDirect + command);
						const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s %s, set Picture Mode successful, command: %s', this.host, accessoryName, this.sZoneName, command);
					} catch (error) {
						this.log.error('Device: %s %s %s, can not set Picture Mode command. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, this.sZoneName, error);
					};
				});

			this.televisionService.getCharacteristic(Characteristic.PowerModeSelection)
				.onSet(async (command) => {
					switch (command) {
						case Characteristic.PowerModeSelection.SHOW:
							command = this.switchInfoMenu ? 'MNOPT' : 'MNINF';
							break;
						case Characteristic.PowerModeSelection.HIDE:
							command = 'MNRTN';
							break;
					}
					try {
						const setCommand = await this.denon.send(API_URL.iPhoneDirect + command);
						const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s %s, set Power Mode Selection successful, command: %s', this.host, accessoryName, this.sZoneName, command);
					} catch (error) {
						this.log.error('Device: %s %s %s, can not set Power Mode Selection command. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, this.sZoneName, error);
					};
				});
		};

		accessory.addService(this.televisionService);

		//Prepare speaker service
		this.log.debug('prepareSpeakerService');
		this.speakerService = new Service.TelevisionSpeaker(`${accessoryName} Speaker`, 'Speaker');
		this.speakerService
			.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
			.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
		this.speakerService.getCharacteristic(Characteristic.VolumeSelector)
			.onSet(async (command) => {
				const zControl = this.masterVolume ? 4 : this.zoneControl;
				const zone = ['MV', 'Z2', 'Z3', 'MV', 'MV'][zControl];
				switch (command) {
					case Characteristic.VolumeSelector.INCREMENT:
						command = 'UP';
						break;
					case Characteristic.VolumeSelector.DECREMENT:
						command = 'DOWN';
						break;
				}
				try {
					const setVolume = await this.denon.send(API_URL.iPhoneDirect + zone + command);
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s %s, setVolumeSelector successful, command: %s', this.host, accessoryName, this.sZoneName, command);
				} catch (error) {
					this.log.error('Device: %s %s %s, can not setVolumeSelector command. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, this.sZoneName, error);
				};
			});

		this.speakerService.getCharacteristic(Characteristic.Volume)
			.onGet(async () => {
				const volume = this.volume;
				const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s %s, get Volume level successful: %s dB', this.host, accessoryName, this.sZoneName, (volume - 80));
				return volume;
			})
			.onSet(async (volume) => {
				const zControl = this.masterVolume ? 4 : this.zoneControl;
				const zone = ['MV', 'Z2', 'Z3', 'MV', 'MV'][zControl];
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
					const setVolume = await this.denon.send(API_URL.iPhoneDirect + zone + volume);
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s %s, set new Volume level successful, volume: %s dB', this.host, accessoryName, this.sZoneName, volume - 80);
				} catch (error) {
					this.log.error('Device: %s %s %s, can not set new Volume level. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, this.sZoneName, error);
				};
			});

		this.speakerService.getCharacteristic(Characteristic.Mute)
			.onGet(async () => {
				const state = this.muteState;
				const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s %s, get Mute state successful: %s', this.host, accessoryName, this.sZoneName, state ? 'ON' : 'OFF');
				return state;
			})
			.onSet(async (state) => {
				const zControl = this.masterMute ? 4 : this.zoneControl;
				const zone = ['', 'Z2', 'Z3', '', ''][zControl];
				const newState = state ? 'MUON' : 'MUOFF';
				try {
					const toggleMute = (this.powerState && state != this.muteState) ? await this.denon.send(API_URL.iPhoneDirect + zone + newState) : false;
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s %s, set new Mute state successful, state: %s', this.host, accessoryName, this.sZoneName, state ? 'ON' : 'OFF');
				} catch (error) {
					this.log.error('Device: %s %s %s, can not set new Mute state. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, this.sZoneName, error);
				};
			});

		accessory.addService(this.speakerService);

		//Prepare volume service
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
						this.speakerService.setCharacteristic(Characteristic.Volume, volume);
					});
				this.volumeService.getCharacteristic(Characteristic.On)
					.onGet(async () => {
						const state = !this.muteState;
						return state;
					})
					.onSet(async (state) => {
						this.speakerService.setCharacteristic(Characteristic.Mute, !state);
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
						this.speakerService.setCharacteristic(Characteristic.Volume, volume);
					});
				this.volumeServiceFan.getCharacteristic(Characteristic.On)
					.onGet(async () => {
						const state = !this.muteState;
						return state;
					})
					.onSet(async (state) => {
						this.speakerService.setCharacteristic(Characteristic.Mute, !state);
					});

				accessory.addService(this.volumeServiceFan);
			}
		}

		//Prepare input service
		this.log.debug('prepareInputsService');

		const savedInputs = ((fs.readFileSync(this.inputsFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsFile)) : [];
		const debug = this.enableDebugMode ? this.log('Device: %s %s %s, read saved %s successful: %s', this.host, accessoryName, this.sZoneName, this.zoneControl <= 2 ? 'Input' : 'Sound Mode', savedInputs) : false;

		const savedInputsNames = ((fs.readFileSync(this.inputsNamesFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsNamesFile)) : {};
		const debug1 = this.enableDebugMode ? this.log('Device: %s %s %s, read saved custom %s Names successful: %s', this.host, accessoryName, this.sZoneName, this.zoneControl <= 2 ? 'Input' : 'Sound Mode', savedInputsNames) : false;

		const savedInputsTargetVisibility = ((fs.readFileSync(this.inputsTargetVisibilityFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsTargetVisibilityFile)) : {};
		const debug2 = this.enableDebugMode ? this.log('Device: %s %s %s, read saved %s Target Visibility successful: %s', this.host, accessoryName, this.sZoneName, this.zoneControl <= 2 ? 'Input' : 'Sound Mode', savedInputsTargetVisibility) : false;

		//check available inputs and possible count (max 94)
		const inputs = (savedInputs.length > 0) ? savedInputs : (this.zoneControl <= 2) ? this.inputs : this.soundModes;
		const inputsCount = inputs.length;
		const maxInputsCount = (inputsCount < 94) ? inputsCount : 94;
		for (let i = 0; i < maxInputsCount; i++) {

			//get input reference
			const inputReference = (inputs[i].reference != undefined) ? inputs[i].reference : undefined;

			//get input name		
			const inputName = (savedInputsNames[inputReference] != undefined) ? savedInputsNames[inputReference] : inputs[i].name;

			//get input type
			const inputType = (this.zoneControl <= 2) ? (inputs[i].type != undefined) ? INPUT_SOURCE_TYPES.indexOf(inputs[i].type) : 3 : 0;

			//get input mode
			const inputMode = (this.zoneControl <= 2) ? inputs[i].mode : 'MS';

			//get input switch
			const inputSwitch = inputs[i].switch;

			//get input configured
			const isConfigured = 1;

			//get input visibility state
			const currentVisibility = (savedInputsTargetVisibility[inputReference] != undefined) ? savedInputsTargetVisibility[inputReference] : 0;
			const targetVisibility = currentVisibility;

			const service = this.zoneControl <= 2 ? 'Input' : 'Sound Mode';
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
					const newCustomName = JSON.stringify(newName);
					try {
						const writeNewCustomName = (nameIdentifier != false) ? await fsPromises.writeFile(this.inputsNamesFile, newCustomName) : false;
						const debug = this.enableDebugMode ? this.log('Device: %s %s %s, saved new Input successful, savedInputsNames: %s', this.host, accessoryName, this.sZoneName, newCustomName) : false;
						const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s %s, new %s name saved successful, name: %s, reference: %s', this.host, accessoryName, this.sZoneName, this.zoneControl <= 2 ? 'Input' : 'Sound Mode', name, inputReference);
					} catch (error) {
						this.log.error('Device: %s %s %s, new %s name saved failed, Error: %s', this.host, accessoryName, this.sZoneName, this.zoneControl <= 2 ? 'Input' : 'Sound Mode', error);
					}
				});

			inputService
				.getCharacteristic(Characteristic.TargetVisibilityState)
				.onSet(async (state) => {
					const targetVisibilityIdentifier = (inputReference != undefined) ? inputReference : false;
					let newState = savedInputsTargetVisibility;
					newState[targetVisibilityIdentifier] = state;
					const newTargetVisibility = JSON.stringify(newState);
					try {
						const writeNewTargetVisibility = (targetVisibilityIdentifier != false) ? await fsPromises.writeFile(this.inputsTargetVisibilityFile, newTargetVisibility) : false;
						const debug = this.enableDebugMode ? this.log('Device: %s %s %s, %s: %s, saved Target Visibility state: %s', this.host, accessoryName, this.sZoneName, this.zoneControl <= 2 ? 'Input' : 'Sound Mode', inputName, newTargetVisibility) : false;
						const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s %s, new %s Target Visibility saved successful, name: %s, state: %s', this.host, accessoryName, this.sZoneName, this.zoneControl <= 2 ? 'Input' : 'Sound Mode', inputName, state ? 'HIDEN' : 'SHOWN');
						inputService.setCharacteristic(Characteristic.CurrentVisibilityState, state);
					} catch (error) {
						this.log.error('Device: %s %s %s, saved %s Target Visibility state error: %s', this.host, accessoryName, this.sZoneName, this.zoneControl <= 2 ? 'Input' : 'Sound Mode', error);
					}
				});

			this.inputsReference.push(inputReference);
			this.inputsName.push(inputName);
			this.inputsType.push(inputType);
			this.inputsMode.push(inputMode);
			const pushInputSwitchIndex = inputSwitch ? this.inputsSwitchIndex.push(i) : false;

			this.televisionService.addLinkedService(inputService);
			accessory.addService(inputService);
		}

		//Prepare inputs switch service
		//check available switch inputs and possible count (max 94)
		this.switchServices = new Array();
		const inputsSwitchCount = this.inputsSwitchIndex.length;
		const availableInputSwitchCount = 94 - maxInputsCount;
		const maxInputsSwitchCount = (availableInputSwitchCount > 0) ? (availableInputSwitchCount > inputsSwitchCount) ? inputsSwitchCount : availableInputSwitchCount : 0;
		for (let i = 0; i < maxInputsSwitchCount; i++) {

			//get input switch index
			const inputSwitchIndex = this.inputsSwitchIndex[i];

			//get input switch reference
			const inputSwitchReference = this.inputsReference[inputSwitchIndex];

			//get input switch name		
			const inputSwitchName = this.inputsName[inputSwitchIndex];

			//get input switch mode
			const inputSwitchMode = (this.zoneControl <= 2) ? this.inputsMode[inputSwitchIndex] : 'MS';

			const switchService = new Service.Switch(`${this.sZoneName} ${inputSwitchName}`, `Switch ${i}`);
			switchService.getCharacteristic(Characteristic.On)
				.onGet(async () => {
					const state = this.powerState ? (inputSwitchReference == this.reference) : false;
					return state;
				})
				.onSet(async (state) => {
					const zone = [inputSwitchMode, 'Z2', 'Z3', inputSwitchMode][this.zoneControl];
					const inputSwitchRef = zone + inputSwitchReference;
					try {
						const setSwitchInput = (state && this.powerState) ? await this.denon.send(API_URL.iPhoneDirect + inputSwitchRef) : false;
						const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s %s, set new Input successful, name: %s, reference: %s', this.host, accessoryName, this.sZoneName, inputSwitchName, inputSwitchReference);
					} catch (error) {
						this.log.error('Device: %s %s %s, can not set new Input. Might be due to a wrong settings in config, error: %s.', this.host, accessoryName, this.sZoneName, error);
					};
					if (!this.powerState) {
						setTimeout(() => {
							this.switchServices[i]
								.updateCharacteristic(Characteristic.On, false);
						}, 150);
					}
				});

			this.switchServices.push(switchService);
			accessory.addService(this.switchServices[i]);
		}

		//Prepare button service
		if (this.zoneControl <= 2) {
			this.log.debug('prepareButtonsService');

			//check available buttons and possible count (max 94)
			const buttons = this.buttons;
			const buttonsCount = buttons.length;
			const availableButtonsCount = (94 - (maxInputsCount + maxInputsSwitchCount));
			const maxButtonsCount = (availableButtonsCount > 0) ? (availableButtonsCount > buttonsCount) ? buttonsCount : availableButtonsCount : 0;
			for (let i = 0; i < maxButtonsCount; i++) {

				//get button reference
				const buttonReference = buttons[i].reference;

				//get button name
				const buttonName = (buttons[i].name != undefined) ? buttons[i].name : buttons[i].reference;

				//get button display type
				const buttonDisplayType = (buttons[i].displayType != undefined) ? buttons[i].displayType : 0;

				const serviceType = [Service.Outlet, Service.Switch][buttonDisplayType];
				const buttonService = new serviceType(`${this.sZoneName} ${buttonName}`, `Button ${i}`);
				buttonService.getCharacteristic(Characteristic.On)
					.onGet(async () => {
						const state = false;
						return state;
					})
					.onSet(async (state) => {
						try {
							const setFunction = (state && this.powerState) ? await this.denon.send(API_URL.iPhoneDirect + buttonReference) : false;
							const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s %s, set new Input successful, name: %s, reference: %s', this.host, accessoryName, this.sZoneName, buttonName, buttonReference);
						} catch (error) {
							this.log.error('Device: %s %s %s, can not set new Input. Might be due to a wrong settings in config, error: %s.', this.host, accessoryName, this.sZoneName, error);
						};
						setTimeout(() => {
							buttonService.updateCharacteristic(Characteristic.On, false);
						}, 150);
					});

				accessory.addService(buttonService);
			}
		}

		this.startPrepareAccessory = false;
		const debug3 = this.enableDebugMode ? this.log('Device: %s %s %s, publishExternalAccessories.', this.host, accessoryName, this.sZoneName) : false;
		this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
	}
};