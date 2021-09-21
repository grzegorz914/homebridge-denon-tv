'use strict';

const path = require('path');
const axios = require('axios');
const fs = require('fs');
const fsPromises = fs.promises;
const parseStringPromise = require('xml2js').parseStringPromise;

const PLUGIN_NAME = 'homebridge-denon-tv';
const PLATFORM_NAME = 'DenonTv';

const ZONE_NAME = ['Main Zone', 'Zone 2', 'Zone 3'];
const SHORT_ZONE_NAME = ['MZ', 'Z2', 'Z3'];
const ZONE_NUMBER = ['MainZone_MainZone', 'Zone2_Zone2', 'Zone3_Zone3'];
const INPUT_SOURCE_TYPES = ['OTHER', 'HOME_SCREEN', 'TUNER', 'HDMI', 'COMPOSITE_VIDEO', 'S_VIDEO', 'COMPONENT_VIDEO', 'DVI', 'AIRPLAY', 'USB', 'APPLICATION'];
const DEFAULT_INPUTS = [{
	'name': 'Undefined',
	'reference': 'undefined',
	'type': 'undefined',
	'mode': 'undefined'
}];

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
				if (!device.name) {
					this.log.warn('Device Name Missing');
				} else {
					new denonTvDevice(this.log, device, this.api);
				}
			}
		});
	}

	configureAccessory(accessory) {
		this.log.debug('configurePlatformAccessory');
		this.accessories.push(accessory);
	}

	removeAccessory(accessory) {
		this.log.debug('removePlatformAccessory');
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
		this.host = config.host || '';
		this.port = config.port || '';
		this.refreshInterval = config.refreshInterval || 5;
		this.disableLogInfo = config.disableLogInfo || false;
		this.volumeControl = config.volumeControl || 0;
		this.switchInfoMenu = config.switchInfoMenu || false;
		this.inputs = config.inputs || [];
		this.buttonsMainZone = config.buttonsMainZone || [];
		this.buttonsZone2 = config.buttonsZone2 || [];
		this.buttonsZone3 = config.buttonsZone3 || [];
		this.zoneControl = config.zoneControl || 0;
		this.masterPower = config.masterPower || false;
		this.masterVolume = config.masterVolume || false;
		this.masterMute = config.masterMute || false;

		//add configured inputs to the default inputs
		const inputsArr = new Array();
		const defaultInputsCount = DEFAULT_INPUTS.length;
		for (let i = 0; i < defaultInputsCount; i++) {
			inputsArr.push(DEFAULT_INPUTS[i]);
		}
		const inputsCount = this.inputs.length;
		for (let j = 0; j < inputsCount; j++) {
			inputsArr.push(this.inputs[j]);
		}
		this.inputs = inputsArr;

		//get Device info
		this.manufacturer = config.manufacturer || 'Denon/Marantz';
		this.modelName = config.modelName || 'Model Name';
		this.serialNumber = config.serialNumber || 'Serial Number';
		this.firmwareRevision = config.firmwareRevision || 'Firmware Revision';
		this.apiVersion = '';

		//zones
		this.zoneName = ZONE_NAME[this.zoneControl];
		this.shortZoneName = SHORT_ZONE_NAME[this.zoneControl];
		this.zoneNumber = ZONE_NUMBER[this.zoneControl];
		this.buttons = [this.buttonsMainZone, this.buttonsZone2, this.buttonsZone3][this.zoneControl];

		//setup variables
		this.checkDeviceInfo = true;
		this.checkDeviceState = false;
		this.startPrepareAccessory = true;

		this.inputsService = new Array();
		this.inputsReference = new Array();
		this.inputsName = new Array();
		this.inputsType = new Array();
		this.inputsMode = new Array();

		this.buttonsService = new Array();
		this.buttonsReference = new Array();
		this.buttonsName = new Array();

		this.powerState = false;
		this.volume = 0;
		this.muteState = false;
		this.mediaState = false;

		this.setStartInput = false;
		this.setStartInputIdentifier = 0;

		this.inputIdentifier = 0;
		this.inputReference = '';
		this.inputName = '';

		this.pictureMode = 0;

		const prefDir = path.join(api.user.storagePath(), 'denonTv');
		const url = ('http://' + this.host + ':' + this.port);

		this.devInfoFile = prefDir + '/' + 'devInfo_' + this.shortZoneName + this.host.split('.').join('');
		this.inputsFile = prefDir + '/' + 'inputs_' + this.shortZoneName + this.host.split('.').join('');
		this.inputsNamesFile = prefDir + '/' + 'inputsNames_' + this.shortZoneName + this.host.split('.').join('');
		this.targetVisibilityInputsFile = prefDir + '/' + 'targetVisibilityInputs_' + this.shortZoneName + this.host.split('.').join('');

		this.axiosInstance = axios.create({
			method: 'GET',
			baseURL: url,
			timeout: 5000
		});

		//check if the directory exists, if not then create it
		if (fs.existsSync(prefDir) == false) {
			fsPromises.mkdir(prefDir);
		}
		if (fs.existsSync(this.devInfoFile) == false) {
			fsPromises.writeFile(this.devInfoFile, '');
		}
		if (fs.existsSync(this.inputsFile) == false) {
			fsPromises.writeFile(this.inputsFile, '');
		}
		if (fs.existsSync(this.inputsNamesFile) == false) {
			fsPromises.writeFile(this.inputsNamesFile, '');
		}
		if (fs.existsSync(this.targetVisibilityInputsFile) == false) {
			fsPromises.writeFile(this.targetVisibilityInputsFile, '');
		}

		//Check device state
		setInterval(function () {
			if (this.checkDeviceInfo) {
				this.getDeviceInfo();
			}
			if (!this.checkDeviceInfo && this.checkDeviceState) {
				this.updateDeviceState();
			}
		}.bind(this), this.refreshInterval * 1000);
	}

	async getDeviceInfo() {
		this.log.debug('Device: %s %s %s, requesting Device Info.', this.host, this.name, this.zoneName);
		try {
			const response = await this.axiosInstance('/goform/Deviceinfo.xml');
			this.log.debug('Device: %s %s %s, debug response: %s', this.host, this.name, this.zoneName, response.data);

			//save inputs to the file
			try {
				const inputsArr = this.inputs;
				const obj = JSON.stringify(inputsArr, null, 2);
				const writeInputs = fsPromises.writeFile(this.inputsFile, obj);
				this.log.debug('Device: %s %s %s, save inputs succesful, inputs: %s', this.host, this.name, this.zoneName, obj);
			} catch (error) {
				this.log.error('Device: %s %s %s, save inputs error: %s', this.host, this.name, this.zoneName, error);
			};

			const parseResponse = (response.status == 200) ? await parseStringPromise(response.data) : undefined;
			const result = (parseResponse.Device_Info.BrandCode != undefined) ? parseResponse : {
				'Device_Info': {
					'BrandCode': ['2'],
					'ModelName': [this.modelName],
					'MacAddress': [this.serialNumber],
					'UpgradeVersion': [this.firmwareRevision],
					'DeviceZones': ['Undefined'],
					'CommApiVers': ['Undefined']
				}
			};
			const obj = (parseResponse.Device_Info.BrandCode != undefined) ? {
				'Device_Info': {
					'BrandCode': result.Device_Info.BrandCode,
					'ModelName': result.Device_Info.ModelName,
					'MacAddress': result.Device_Info.MacAddress,
					'UpgradeVersion': result.Device_Info.UpgradeVersion,
					'DeviceZones': result.Device_Info.DeviceZones,
					'CommApiVers': result.Device_Info.CommApiVers
				}
			} : result;
			const devInfo = JSON.stringify(obj, null, 2);
			const writeDevInfo = fsPromises.writeFile(this.devInfoFile, devInfo);
			this.log.debug('Device: %s %s %s, saved Device Info successful: %s', this.host, this.name, this.zoneName, devInfo);

			const brandCode = result.Device_Info.BrandCode[0];
			const manufacturer = ['Denon', 'Marantz', 'Manufacturer'][brandCode];
			const modelName = result.Device_Info.ModelName[0];
			const serialNumber = result.Device_Info.MacAddress[0];
			const firmwareRevision = result.Device_Info.UpgradeVersion[0];
			const zones = result.Device_Info.DeviceZones[0];
			const apiVersion = result.Device_Info.CommApiVers[0];

			if (!this.disableLogInfo) {
				this.log('Device: %s %s %s, state: Online.', this.host, this.name, this.zoneName);
			}

			this.log('-------- %s --------', this.name);
			this.log('Manufacturer: %s', manufacturer);
			this.log('Model: %s', modelName);
			if (this.zoneControl == 0) {
				this.log('Zones: %s', zones);
				this.log('Firmware: %s', firmwareRevision);
				this.log('Api version: %s', apiVersion);
				this.log('Serialnr: %s', serialNumber);
			}
			if (this.zoneControl == 1) {
				this.log('Zone: 2');
			}
			if (this.zoneControl == 2) {
				this.log('Zone: 3');
			}
			this.log('----------------------------------');

			this.checkDeviceInfo = false;

			//start prepare accessory
			if (this.startPrepareAccessory) {
				this.prepareAccessory();
			}
			const updateDeviceState = !this.checkDeviceState ? this.updateDeviceState() : false;
		} catch (error) {
			this.log.debug('Device: %s %s %s, get device info error: %s, device offline, trying to reconnect', this.host, this.name, this.zoneName, error);
			this.checkDeviceState = false;
			this.checkDeviceInfo = true;
		};
	}

	async updateDeviceState() {
		this.log.debug('Device: %s %s %s, requesting Device state.', this.host, this.name, this.zoneName);
		try {
			const response = await this.axiosInstance('/goform/form' + this.zoneNumber + 'XmlStatusLite.xml');
			const result = await parseStringPromise(response.data);
			this.log.debug('Device: %s %s, debug response: %s, result: %s', this.host, this.name, response.data, result);

			const powerState = (result.item.Power[0].value[0] == 'ON');
			const inputReference = (result.item.InputFuncSelect[0].value[0] == 'Internet Radio') ? 'IRADIO' : (result.item.InputFuncSelect[0].value[0] == 'AirPlay') ? 'NET' : result.item.InputFuncSelect[0].value[0];
			const volume = (parseFloat(result.item.MasterVolume[0].value[0]) >= -79.5) ? parseInt(result.item.MasterVolume[0].value[0]) + 80 : 0;
			const muteState = powerState ? (result.item.Mute[0].value[0] == 'on') : true;

			const currentInputIdentifier = (this.inputsReference.indexOf(inputReference) >= 0) ? this.inputsReference.indexOf(inputReference) : 0;
			const inputIdentifier = this.setStartInput ? this.setStartInputIdentifier : currentInputIdentifier;
			const inputName = this.inputsName[inputIdentifier];

			if (this.televisionService) {
				if (powerState) {
					this.televisionService
						.updateCharacteristic(Characteristic.Active, true)
					this.powerState = true;
				}

				if (!powerState) {
					this.televisionService
						.updateCharacteristic(Characteristic.Active, false);
					this.powerState = false;
				}

				const setUpdateCharacteristic = this.setStartInput ? this.televisionService.setCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier) :
					this.televisionService.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
				this.setStartInput = (inputIdentifier == inputIdentifier) ? false : true;

				this.inputReference = inputReference;
				this.inputIdentifier = inputIdentifier;
				this.inputName = inputName;
			}

			if (this.speakerService) {
				this.speakerService
					.updateCharacteristic(Characteristic.Volume, volume)
					.updateCharacteristic(Characteristic.Mute, muteState);
				if (this.volumeService && this.volumeControl == 1) {
					this.volumeService
						.updateCharacteristic(Characteristic.Brightness, volume)
						.updateCharacteristic(Characteristic.On, !muteState);
				}
				if (this.volumeServiceFan && this.volumeControl == 2) {
					this.volumeServiceFan
						.updateCharacteristic(Characteristic.RotationSpeed, volume)
						.updateCharacteristic(Characteristic.On, !muteState);
				}
				this.volume = volume;
				this.muteState = muteState;
			}
			this.checkDeviceState = true;
		} catch (error) {
			this.log.debug('Device: %s %s %s, update device state error: %s', this.host, this.name, this.zoneName, error);
			this.checkDeviceState = false;
			this.checkDeviceInfo = true;
		};
	}

	//Prepare accessory
	async prepareAccessory() {
		this.log.debug('prepareAccessory');
		const accessoryName = this.name;
		const accessoryUUID = UUID.generate(accessoryName);
		const accessoryCategory = Categories.AUDIO_RECEIVER;
		const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);
		accessory.context.device = this.config.device;

		//Prepare information service
		this.log.debug('prepareInformationService');
		try {
			const readDevInfo = await fsPromises.readFile(this.devInfoFile);
			const devInfo = (readDevInfo != undefined) ? JSON.parse(readDevInfo) : {
				'Device_Info': {
					'BrandCode': [2],
					'ModelName': [this.modelName],
					'MacAddress': [this.serialNumber],
					'UpgradeVersion': [this.firmwareRevision],
					'DeviceZones': ['Undefined'],
					'CommApiVers': ['Undefined']
				}
			};
			this.log.debug('Device: %s %s %s, read devInfo: %s', this.host, accessoryName, this.zoneName, devInfo)

			const brandCode = devInfo.Device_Info.BrandCode[0];
			const manufacturer = (brandCode != undefined) ? ['Denon', 'Marantz', this.manufacturer][brandCode] : 'Undefined';
			const modelName = devInfo.Device_Info.ModelName[0];
			const serialNumber = devInfo.Device_Info.MacAddress[0];
			const firmwareRevision = devInfo.Device_Info.UpgradeVersion[0];

			accessory.removeService(accessory.getService(Service.AccessoryInformation));
			const informationService = new Service.AccessoryInformation(accessoryName);
			informationService
				.setCharacteristic(Characteristic.Manufacturer, manufacturer)
				.setCharacteristic(Characteristic.Model, modelName)
				.setCharacteristic(Characteristic.SerialNumber, serialNumber)
				.setCharacteristic(Characteristic.FirmwareRevision, firmwareRevision);
			accessory.addService(informationService);
		} catch (error) {
			this.log.debug('Device: %s %s %s, prepareInformationService error: %s', this.host, accessoryName, this.zoneName, error);
		};

		//Prepare television service
		this.log.debug('prepareTelevisionService');
		this.televisionService = new Service.Television(accessoryName, 'Television');
		this.televisionService.setCharacteristic(Characteristic.ConfiguredName, accessoryName);
		this.televisionService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.televisionService.getCharacteristic(Characteristic.Active)
			.onGet(async () => {
				try {
					const state = this.powerState;
					if (!this.disableLogInfo) {
						this.log('Device: %s %s %s, get Power state successfull, state: %s', this.host, accessoryName, this.zoneName, state ? 'ON' : 'OFF');
					}
					return state;
				} catch (error) {
					this.log.error('Device: %s %s %s, get Power state error: %s', this.host, accessoryName, this.zoneName, error);
				};
			})
			.onSet(async (state) => {
				try {
					if (state != this.powerState) {
						const zControl = this.masterPower ? 3 : this.zoneControl
						this.log.debug('zControl is %s', zControl)
						const newState = [(state ? 'ZMON' : 'ZMOFF'), (state ? 'Z2ON' : 'Z2OFF'), (state ? 'Z3ON' : 'Z3OFF'), (state ? 'PWON' : 'PWSTANDBY')][zControl];
						const setPower = await this.axiosInstance('/goform/formiPhoneAppDirect.xml?' + newState);
						if (!this.disableLogInfo) {
							this.log('Device: %s %s %s, set Power state successful, state: %s', this.host, accessoryName, this.zoneName, newState);
						}
					}
				} catch (error) {
					this.log.error('Device: %s %s %s, can not set Power state. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, this.zoneName, error);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
			.onGet(async () => {
				const inputName = this.inputName;
				const inputReference = this.inputReference;
				const inputIdentifier = this.inputIdentifier;
				if (!this.disableLogInfo) {
					this.log('Device: %s %s %s, get Input successful, name: %s, reference: %s', this.host, accessoryName, this.zoneName, inputName, inputReference);
				}
				return inputIdentifier;
			})
			.onSet(async (inputIdentifier) => {
				try {
					const inputName = this.inputsName[inputIdentifier];
					const inputMode = this.inputsMode[inputIdentifier];
					const inputReference = this.inputsReference[inputIdentifier];
					const zone = [inputMode, 'Z2', 'Z3'][this.zoneControl];
					const inputRef = zone + inputReference;
					const setInput = (inputReference != undefined) ? await this.axiosInstance('/goform/formiPhoneAppDirect.xml?' + inputRef) : false;
					if (!this.disableLogInfo) {
						this.log('Device: %s %s %s, set Input successful, name: %s, reference: %s', this.host, accessoryName, this.zoneName, inputName, inputRef);
					}
					this.setStartInputIdentifier = inputIdentifier;
					this.setStartInput = this.powerState ? false : true;
				} catch (error) {
					this.log.error('Device: %s %s %s, can not set Input. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, this.zoneName, error);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.RemoteKey)
			.onSet(async (command) => {
				try {
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
					const response = await this.axiosInstance('/goform/formiPhoneAppDirect.xml?' + command);
					if (!this.disableLogInfo) {
						this.log('Device: %s %s %s, Remote Key successful, command: %s', this.host, accessoryName, this.zoneName, command);
					}
				} catch (error) {
					this.log.error('Device: %s %s %s, can not Remote Key command. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, this.zoneName, error);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.PowerModeSelection)
			.onSet(async (command) => {
				try {
					switch (command) {
						case Characteristic.PowerModeSelection.SHOW:
							command = this.switchInfoMenu ? 'MNOPT' : 'MNINF';
							break;
						case Characteristic.PowerModeSelection.HIDE:
							command = 'MNRTN';
							break;
					}
					const response = await this.axiosInstance('/goform/formiPhoneAppDirect.xml?' + command);
					if (!this.disableLogInfo) {
						this.log('Device: %s %s %s, set Power Mode Selection successful, command: %s', this.host, accessoryName, this.zoneName, command);
					}
				} catch (error) {
					this.log.error('Device: %s %s %s, can not set Power Mode Selection command. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, this.zoneName, error);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.PictureMode)
			.onGet(async () => {
				const pictureMode = this.pictureMode;
				if (!this.disableLogInfo) {
					this.log('Device: %s %s %s, get Picture mode: %s', this.host, accessoryName, this.zoneName, pictureMode);
				}
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
					if (!this.disableLogInfo) {
						this.log('Device: %s %s %s, set Picture Mode successful, command: %s', this.host, accessoryName, this.zoneName, command);
					}
				} catch (error) {
					this.log.error('Device: %s %s %s, can not set Picture Mode command. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, this.zoneName, error);
				};
			});

		accessory.addService(this.televisionService);

		//Prepare speaker service
		this.log.debug('prepareSpeakerService');
		this.speakerService = new Service.TelevisionSpeaker(accessoryName, 'Speaker');
		this.speakerService
			.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
			.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
		this.speakerService.getCharacteristic(Characteristic.VolumeSelector)
			.onSet(async (command) => {
				try {
					const zControl = this.masterVolume ? 3 : this.zoneControl
					const zone = ['MV', 'Z2', 'Z3', 'MV'][zControl];
					switch (command) {
						case Characteristic.VolumeSelector.INCREMENT:
							command = 'UP';
							break;
						case Characteristic.VolumeSelector.DECREMENT:
							command = 'DOWN';
							break;
					}
					const setVolume = await this.axiosInstance('/goform/formiPhoneAppDirect.xml?' + zone + command);
					if (!this.disableLogInfo) {
						this.log('Device: %s %s %s, setVolumeSelector successful, command: %s', this.host, accessoryName, this.zoneName, command);
					}
				} catch (error) {
					this.log.error('Device: %s %s %s, can not setVolumeSelector command. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, this.zoneName, error);
				};
			});
		this.speakerService.getCharacteristic(Characteristic.Volume)
			.onGet(async () => {
				const volume = this.volume;
				if (!this.disableLogInfo) {
					this.log('Device: %s %s %s, get Volume level successful: %s dB', this.host, accessoryName, this.zoneName, (volume - 80));
				}
				return volume;
			})
			.onSet(async (volume) => {
				try {
					const zControl = this.masterVolume ? 3 : this.zoneControl
					const zone = ['MV', 'Z2', 'Z3', 'MV'][zControl];
					if (volume == 0 || volume == 100) {
						if (this.volume < 10) {
							volume = '0' + this.volume;
						} else {
							volume = this.volume;
						}
					} else {
						if (volume < 10) {
							volume = '0' + volume;
						}
					}
					const setVolume = await this.axiosInstance('/goform/formiPhoneAppDirect.xml?' + zone + volume);
					if (!this.disableLogInfo) {
						this.log('Device: %s %s %s, set new Volume level successful, volume: %s dB', this.host, accessoryName, this.zoneName, volume - 80);
					}
				} catch (error) {
					this.log.error('Device: %s %s %s, can not set new Volume level. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, this.zoneName, error);
				};
			});
		this.speakerService.getCharacteristic(Characteristic.Mute)
			.onGet(async () => {
				const state = this.powerState ? this.muteState : true;
				if (!this.disableLogInfo) {
					this.log('Device: %s %s %s, get Mute state successful: %s', this.host, accessoryName, this.zoneName, state ? 'ON' : 'OFF');
				}
				return state;
			})
			.onSet(async (state) => {
				if (state != this.muteState) {
					try {
						const zControl = this.masterMute ? 3 : this.zoneControl
						const newState = [(state ? 'MUON' : 'MUOFF'), (state ? 'Z2MUON' : 'Z2MUOFF'), (state ? 'Z3MUON' : 'Z3MUOFF'), (state ? 'MUON' : 'MUOFF')][zControl];
						const setMute = await this.axiosInstance('/goform/formiPhoneAppDirect.xml?' + newState);
						if (!this.disableLogInfo) {
							this.log('Device: %s %s %s, set new Mute state successful, state: %s', this.host, accessoryName, this.zoneName, state ? 'ON' : 'OFF');
						}
					} catch (error) {
						this.log.error('Device: %s %s %s, can not set new Mute state. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, this.zoneName, error);
					};
				}
			});

		this.televisionService.addLinkedService(this.speakerService);
		accessory.addService(this.speakerService);

		//Prepare volume service
		if (this.volumeControl >= 1) {
			this.log.debug('prepareVolumeService');
			if (this.volumeControl == 1) {
				this.volumeService = new Service.Lightbulb(accessoryName + ' Volume', 'Volume');
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
						const state = this.powerState ? !this.muteState : false;
						return state;
					})
					.onSet(async (state) => {
						this.speakerService.setCharacteristic(Characteristic.Mute, !state);
					});
				accessory.addService(this.volumeService);
			}
			if (this.volumeControl == 2) {
				this.volumeServiceFan = new Service.Fan(accessoryName + ' Volume', 'Volume');
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
						const state = this.powerState ? !this.muteState : false;
						return state;
					})
					.onSet(async (state) => {
						this.speakerService.setCharacteristic(Characteristic.Mute, !state);
					});
				accessory.addService(this.volumeServiceFan);
			}
		}

		//Prepare inputs services
		this.log.debug('prepareInputsService');

		const savedInputs = ((fs.readFileSync(this.inputsFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsFile)) : [];
		this.log.debug('Device: %s %s %s, read saved Inputs successful, inpits: %s', this.host, accessoryName, this.zoneName, savedInputs)

		const savedInputsNames = ((fs.readFileSync(this.inputsNamesFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsNamesFile)) : {};
		this.log.debug('Device: %s %s %s, read saved custom Inputs Names successful, names: %s', this.host, accessoryName, this.zoneName, savedInputsNames)

		const savedTargetVisibility = ((fs.readFileSync(this.targetVisibilityInputsFile)).length > 0) ? JSON.parse(fs.readFileSync(this.targetVisibilityInputsFile)) : {};
		this.log.debug('Device: %s %s %s, read saved Target Visibility successful, states %s', this.host, accessoryName, this.zoneName, savedTargetVisibility);

		//check available inputs and possible inputs count (max 95)
		const inputs = (savedInputs.length > 0) ? savedInputs : this.inputs;
		const inputsCount = inputs.length;
		const maxInputsCount = (inputsCount < 94) ? inputsCount : 94;
		for (let i = 0; i < maxInputsCount; i++) {

			//get input reference
			const inputReference = (inputs[i].reference != undefined) ? inputs[i].reference : undefined;

			//get input name		
			const inputName = (savedInputsNames[inputReference] != undefined) ? savedInputsNames[inputReference] : inputs[i].name;

			//get input type
			const inputType = (inputs[i].type != undefined) ? INPUT_SOURCE_TYPES.indexOf(inputs[i].type) : 3;

			//get input mode
			const inputMode = (inputs[i].mode != undefined) ? inputs[i].mode : 'SI';

			//get input configured
			const isConfigured = 1;

			//get input visibility state
			const currentVisibility = (savedTargetVisibility[inputReference] != undefined) ? savedTargetVisibility[inputReference] : 0;
			const targetVisibility = currentVisibility;

			const inputService = new Service.InputSource(accessoryName, 'Input ' + i);
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
						const nameIdentifier = (inputReference != undefined) ? inputReference : false;
						let newName = savedInputsNames;
						newName[nameIdentifier] = name;
						const newCustomName = JSON.stringify(newName);
						const writeNewCustomName = (nameIdentifier != false) ? await fsPromises.writeFile(this.inputsNamesFile, newCustomName) : false;
						this.log.debug('Device: %s %s %s, saved new Input successful, savedInputsNames: %s', this.host, accessoryName, this.zoneName, newCustomName);
						if (!this.disableLogInfo) {
							this.log('Device: %s %s %s, new Input name saved successful, name: %s, reference: %s', this.host, accessoryName, this.zoneName, name, inputReference);
						}
					} catch (error) {
						this.log.error('Device: %s %s %s, new Input name saved failed, error: %s', this.host, accessoryName, this.zoneName, error);
					}
				});

			inputService
				.getCharacteristic(Characteristic.TargetVisibilityState)
				.onSet(async (state) => {
					try {
						const targetVisibilityIdentifier = (inputReference != undefined) ? inputReference : false;
						let newState = savedTargetVisibility;
						newState[targetVisibilityIdentifier] = state;
						const newTargetVisibility = JSON.stringify(newState);
						const writeNewTargetVisibility = (targetVisibilityIdentifier != false) ? await fsPromises.writeFile(this.targetVisibilityInputsFile, newTargetVisibility) : false;
						this.log.debug('Device: %s %s %s, Input: %s, saved target visibility state: %s', this.host, accessoryName, inputName, this.zoneName, newTargetVisibility);
						if (!this.disableLogInfo) {
							this.log('Device: %s %s %s, new target visibility saved successful, name: %s, state: %s', this.host, accessoryName, this.zoneName, inputName, state ? 'HIDEN' : 'SHOWN');
						}
						inputService.setCharacteristic(Characteristic.CurrentVisibilityState, state);
					} catch (error) {
						this.log.error('Device: %s %s %s, saved target visibility state error: %s', this.host, accessoryName, this.zoneName, error);
					}
				});

			this.inputsReference.push(inputReference);
			this.inputsName.push(inputName);
			this.inputsType.push(inputType);
			this.inputsMode.push(inputMode);

			this.inputsService.push(inputService);
			this.televisionService.addLinkedService(this.inputsService[i]);
			accessory.addService(this.inputsService[i]);
		}

		//Prepare inputs button services
		this.log.debug('prepareInputsButtonService');

		//check available buttons and possible buttons count (max 94 - inputsCount)
		const buttons = this.buttons;
		const buttonsCount = buttons.length;
		const maxButtonsCount = ((inputsCount + buttonsCount) < 94) ? buttonsCount : 94 - inputsCount;
		for (let i = 0; i < maxButtonsCount; i++) {

			//get button reference
			const buttonReference = buttons[i].reference;

			//get button name
			const buttonName = (buttons[i].name != undefined) ? buttons[i].name : buttons[i].reference;

			const buttonService = new Service.Switch(accessoryName + ' ' + buttonName, 'Button ' + i);
			buttonService.getCharacteristic(Characteristic.On)
				.onGet(async () => {
					const state = false;
					if (!this.disableLogInfo) {
						this.log('Device: %s %s %s, get Button state successful, state: %s', this.host, accessoryName, this.zoneName, state);
					}
					return state;
				})
				.onSet(async (state) => {
					try {
						const setFunction = (state && this.powerState) ? await this.axiosInstance('/goform/formiPhoneAppDirect.xml?' + buttonReference) : false;
						if (!this.disableLogInfo) {
							this.log('Device: %s %s %s, set new Input successful, name: %s, reference: %s', this.host, accessoryName, this.zoneName, buttonName, buttonReference);
						}
					} catch (error) {
						this.log.error('Device: %s %s %s, can not set new Input. Might be due to a wrong settings in config, error: %s.', this.host, accessoryName, this.zoneName, error);
					};
					setTimeout(() => {
						buttonService.updateCharacteristic(Characteristic.On, false);
					}, 250);
				});
			this.buttonsReference.push(buttonReference);
			this.buttonsName.push(buttonName);

			this.buttonsService.push(buttonService)
			accessory.addService(this.buttonsService[i]);
		}

		this.startPrepareAccessory = false;
		this.log.debug('Device: %s %s %s, publishExternalAccessories.', this.host, accessoryName, this.zoneName);
		this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
	}
};