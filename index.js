'use strict';

const path = require('path');
const axios = require('axios');
const fs = require('fs');
const fsPromises = fs.promises;
const parseStringPromise = require('xml2js').parseStringPromise;

const PLUGIN_NAME = 'homebridge-denon-tv';
const PLATFORM_NAME = 'DenonTv';

const API_URL = {
	'UPNP': ':60006/upnp/desc/aios_device/aios_device.xml',
	'DeviceInfo': '/goform/Deviceinfo.xml',
	'MainZone': '/goform/formMainZone_MainZoneXml.xml',
	'MainZoneStatus': '/goform/formMainZone_MainZoneXmlStatus.xml',
	'MainZoneStatusLite': '/goform/formMainZone_MainZoneXmlStatusLite.xml',
	'Zone2Status': '/goform/forZone2_Zone2XmlStatus.xml',
	'Zone2StatusLite': '/goform/formZone2_Zone2XmlStatusLite.xml',
	'Zone3Status': '/goform/forZone3_Zone3XmlStatus.xml',
	'Zone3StatusLite': '/goform/formZone3_Zone3XmlStatusLite.xml',
	'Zone4Status': '/goform/forZone4_Zone4XmlStatus.xml',
	'Zone4StatusLite': '/goform/formZone4_Zone4XmlStatusLite.xml',
	'SoundModeStatus': '/goform/formMainZone_MainZoneXmlStatusLite.xml',
	'TunerStatus': '/goform/formTuner_TunerXml.xml',
	'iPhoneDirect': '/goform/formiPhoneAppDirect.xml?',
	'AppCommand': '/goform/AppCommand.xml',
	'AppCommand300': '/goform/AppCommand0300.xml',
	'NetAudioStatusS': '/goform/formNetAudio_StatusXml.xml',
	'HdTunerStatus': '/goform/formTuner_HdXml.xml',
	'NetAudioCommandPost': '/NetAudio/index.put.asp'
}

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
				if (!device.name) {
					this.log.warn('Device Name Missing');
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
		this.soundModes = config.surrounds || [];
		this.zoneControl = config.zoneControl || 0;
		this.masterPower = config.masterPower || false;
		this.masterVolume = config.masterVolume || false;
		this.masterMute = config.masterMute || false;

		//get Device info
		this.manufacturer = config.manufacturer || 'Denon/Marantz';
		this.modelName = config.modelName || 'Model Name';
		this.serialNumber = config.serialNumber || 'Serial Number';
		this.firmwareRevision = config.firmwareRevision || 'Firmware Revision';
		this.apiVersion = '';

		//zones
		this.apiUrl = [API_URL.MainZoneStatusLite, API_URL.Zone2StatusLite, API_URL.Zone3StatusLite, API_URL.SoundModeStatus][this.zoneControl];
		this.zoneName = ZONE_NAME[this.zoneControl];
		this.sZoneName = SHORT_ZONE_NAME[this.zoneControl];
		this.buttons = [this.buttonsMainZone, this.buttonsZone2, this.buttonsZone3, this.buttonsMainZone][this.zoneControl];

		//setup variables
		this.checkDeviceInfo = true;
		this.checkDeviceState = false;
		this.startPrepareAccessory = true;

		this.inputsReference = new Array();
		this.inputsName = new Array();
		this.inputsType = new Array();
		this.inputsMode = new Array();

		this.powerState = false;
		this.volume = 0;
		this.muteState = false;
		this.mediaState = false;

		this.setStartInput = false;
		this.setStartInputIdentifier = 0;

		this.inputReference = '';
		this.inputName = '';
		this.inputType = 0;
		this.inputMode = '';
		this.inputIdentifier = 0;

		this.pictureMode = 0;
		this.brightness = 0;

		this.prefDir = path.join(api.user.storagePath(), 'denonTv');
		this.devInfoFile = `${this.prefDir}/devInfo_${this.host.split('.').join('')}`;
		this.inputsFile = `${this.prefDir}/inputs_${this.sZoneName}${this.host.split('.').join('')}`;
		this.inputsNamesFile = `${this.prefDir}/inputsNames_${this.sZoneName}${this.host.split('.').join('')}`;
		this.inputsTargetVisibilityFile = `${this.prefDir}/inputsTargetVisibility_${this.sZoneName}${this.host.split('.').join('')}`;

		const url = (`http://${this.host}:${this.port}`);
		this.axiosInstance = axios.create({
			method: 'GET',
			baseURL: url,
			timeout: 5000
		});

		//Check device state
		setInterval(function () {
			if (this.checkDeviceInfo) {
				this.prepareDirectoryAndFiles();
			}
			if (!this.checkDeviceInfo && this.checkDeviceState) {
				this.updateDeviceState();
			}
		}.bind(this), this.refreshInterval * 1000);
	}

	async prepareDirectoryAndFiles() {
		this.log.debug('Device: %s %s %s, prepare directory and files.', this.host, this.name, this.zoneName);

		try {
			//check if the directory exists, if not then create it
			if (fs.existsSync(this.prefDir) == false) {
				await fsPromises.mkdir(this.prefDir);
			}
			if (this.zoneControl == 0) {
				if (fs.existsSync(this.devInfoFile) == false) {
					await fsPromises.writeFile(this.devInfoFile, '');
				}
			}
			if (fs.existsSync(this.inputsFile) == false) {
				await fsPromises.writeFile(this.inputsFile, '');
			}
			if (fs.existsSync(this.inputsNamesFile) == false) {
				await fsPromises.writeFile(this.inputsNamesFile, '');
			}
			if (fs.existsSync(this.inputsTargetVisibilityFile) == false) {
				await fsPromises.writeFile(this.inputsTargetVisibilityFile, '');
			}

			//save inputs to the file
			const inputs = (this.zoneControl <= 2) ? this.inputs : this.soundModes;
			const obj = JSON.stringify(inputs, null, 2);
			const writeInputs = await fsPromises.writeFile(this.inputsFile, obj);
			this.log.debug('Device: %s %s %s, save %s succesful: %s', this.host, this.name, this.zoneName, this.zoneControl <= 2 ? 'Inputs' : 'Sound Modes', obj);

			const getDeviceInfo = this.getDeviceInfo();
		} catch (error) {
			this.log.error('Device: %s %s %s, save %s error: %s', this.host, this.name, this.zoneName, this.zoneControl <= 2 ? 'Inputs' : 'Sound Modes', error);
			this.checkDeviceState = false;
			this.checkDeviceInfo = true;
		};
	};

	async getDeviceInfoUpnp() {
		this.log.debug('Device: %s %s %s, requesting UPNP Device Info.', this.host, this.name, this.zoneName);

		try {
			const deviceInfoUpnp = await axios.get(`http://${this.host}${API_URL.UPNP}`);
			const parseDeviceInfoUpnp = await parseStringPromise(deviceInfoUpnp.data);
			this.log.debug('Device: %s %s %s, debug parseDeviceInfoUpnp: %s', this.host, this.name, this.zoneName, parseDeviceInfoUpnp.root.device[0]);

			const deviceType = parseDeviceInfoUpnp.root.device[0].deviceType[0];
			const friendlyName = parseDeviceInfoUpnp.root.device[0].friendlyName[0];
			const manufacturer = parseDeviceInfoUpnp.root.device[0].manufacturer[0];
			const manufacturerURL = parseDeviceInfoUpnp.root.device[0].manufacturerURL[0];
			const modelName = parseDeviceInfoUpnp.root.device[0].modelName[0];
			const modelNumber = parseDeviceInfoUpnp.root.device[0].modelNumber[0];
			const deviceUDN = parseDeviceInfoUpnp.root.device[0].UDN[0];
			const X_Audyssey = parseDeviceInfoUpnp.root.device[0]['DMH:X_Audyssey'][0];
			const X_AudysseyPort = parseDeviceInfoUpnp.root.device[0]['DMH:X_AudysseyPort'][0];
			const X_WebAPIPort = parseDeviceInfoUpnp.root.device[0]['DMH:X_WebAPIPort'][0];

			this.manufacturer = (manufacturer != undefined) ? manufacturer : this.manufacturer;
			this.modelName = modelName;
			this.WebAPIPort = X_WebAPIPort;

			const getDeviceInfo = this.getDeviceInfo();
		} catch (error) {
			this.log.debug('Device: %s %s %s, get UPNP Device Info error: %s', this.host, this.name, this.zoneName, error);
			const getDeviceInfo = this.getDeviceInfo();
		};
	};

	async getDeviceInfo() {
		this.log.debug('Device: %s %s %s, requesting Device Info.', this.host, this.name, this.zoneName);

		try {
			const deviceInfo = await this.axiosInstance(API_URL.DeviceInfo);
			this.log.debug('Device: %s %s %s, debug deviceInfo: %s', this.host, this.name, this.zoneName, deviceInfo.data);

			const parseDeviceInfo = await parseStringPromise(deviceInfo.data);
			const manufacturer = (parseDeviceInfo.Device_Info.BrandCode[0] != undefined) ? ['Denon', 'Marantz'][parseDeviceInfo.Device_Info.BrandCode[0]] : this.manufacturer;
			const modelName = parseDeviceInfo.Device_Info.ModelName[0] || this.modelName;
			const serialNumber = parseDeviceInfo.Device_Info.MacAddress[0] || this.serialNumber;
			const firmwareRevision = parseDeviceInfo.Device_Info.UpgradeVersion[0] || this.firmwareRevision;
			const zones = parseDeviceInfo.Device_Info.DeviceZones[0] || 'Unknown';
			const apiVersion = parseDeviceInfo.Device_Info.CommApiVers[0] || 'Unknown';

			const devInfo = JSON.stringify(parseDeviceInfo.Device_Info, null, 2);
			const writeDevInfo = (this.zoneControl == 0) ? await fsPromises.writeFile(this.devInfoFile, devInfo) : false;
			this.log.debug('Device: %s %s %s, saved Device Info successful: %s', this.host, this.name, this.zoneName, devInfo);

			if (!this.disableLogInfo) {
				this.log('Device: %s %s %s, state: Online.', this.host, this.name, this.zoneName);
			}

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

			this.manufacturer = manufacturer;
			this.modelName = modelName;
			this.serialNumber = serialNumber;
			this.firmwareRevision = firmwareRevision;
			this.checkDeviceInfo = false;

			const updateDeviceState = !this.checkDeviceState ? this.updateDeviceState() : false;
		} catch (error) {
			this.log.debug('Device: %s %s %s, deviceInfo error: %s, device offline, trying to reconnect', this.host, this.name, this.zoneName, error);
			this.checkDeviceState = false;
			this.checkDeviceInfo = true;
		};
	}

	async updateDeviceState() {
		this.log.debug('Device: %s %s %s, requesting Device state.', this.host, this.name, this.zoneName);

		try {
			const deviceStateData = await this.axiosInstance(this.apiUrl);
			const parseDeviceStateData = await parseStringPromise(deviceStateData.data);
			this.log.debug('Device: %s %s, debug deviceStateData: %s, parseDeviceStateData: %s', this.host, this.name, deviceStateData.data, parseDeviceStateData);

			const powerState = (parseDeviceStateData.item.Power[0].value[0] == 'ON');
			const inputReference = (this.zoneControl <= 2) ? (parseDeviceStateData.item.InputFuncSelect[0].value[0] == 'Internet Radio') ? 'IRADIO' : (parseDeviceStateData.item.InputFuncSelect[0].value[0] == 'AirPlay') ? 'NET' : parseDeviceStateData.item.InputFuncSelect[0].value[0] : this.inputReference;
			const volume = (parseFloat(parseDeviceStateData.item.MasterVolume[0].value[0]) >= -79.5) ? parseInt(parseDeviceStateData.item.MasterVolume[0].value[0]) + 80 : this.volume;
			const muteState = powerState ? (parseDeviceStateData.item.Mute[0].value[0] == 'on') : true;

			const currentInputIdentifier = (this.inputsReference.indexOf(inputReference) >= 0) ? this.inputsReference.indexOf(inputReference) : this.inputIdentifier;
			const inputIdentifier = this.setStartInput ? this.setStartInputIdentifier : currentInputIdentifier;

			if (this.televisionService) {
				this.televisionService
					.updateCharacteristic(Characteristic.Active, powerState)

				const setUpdateCharacteristic = this.setStartInput ? this.televisionService.setCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier) :
					this.televisionService.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
				this.setStartInput = (currentInputIdentifier == inputIdentifier) ? false : true;
			}
			this.powerState = powerState;
			this.inputReference = inputReference;
			this.inputIdentifier = inputIdentifier;

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
			}
			this.volume = volume;
			this.muteState = muteState;
			this.checkDeviceState = true;

			//start prepare accessory
			if (this.startPrepareAccessory) {
				this.prepareAccessory();
			}
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
				if (!this.disableLogInfo) {
					this.log('Device: %s %s %s, get Power state successfull, state: %s', this.host, accessoryName, this.zoneName, state ? 'ON' : 'OFF');
				}
				return state;
			})
			.onSet(async (state) => {
				const zControl = this.masterPower ? 4 : this.zoneControl;
				this.log.debug('zControl is %s', zControl)
				const newState = [(state ? 'ZMON' : 'ZMOFF'), (state ? 'Z2ON' : 'Z2OFF'), (state ? 'Z3ON' : 'Z3OFF'), (state ? 'ZMON' : 'ZMOFF'), (state ? 'PWON' : 'PWSTANDBY')][zControl];
				try {
					const setPower = (state != this.powerState) ? await this.axiosInstance(API_URL.iPhoneDirect + newState) : false;
					if (!this.disableLogInfo) {
						this.log('Device: %s %s %s, set Power state successful, state: %s', this.host, accessoryName, this.zoneName, newState);
					}
				} catch (error) {
					this.log.error('Device: %s %s %s, can not set Power state. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, this.zoneName, error);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
			.onGet(async () => {
				const inputIdentifier = this.inputIdentifier;
				const inputName = this.inputsName[inputIdentifier];
				const inputReference = this.inputsReference[inputIdentifier];
				if (!this.disableLogInfo) {
					this.log('Device: %s %s %s, get %s successful, name: %s, reference: %s', this.host, accessoryName, this.zoneName, this.zoneControl <= 2 ? 'Input' : 'Sound Mode', inputName, inputReference);
				}
				return inputIdentifier;
			})
			.onSet(async (inputIdentifier) => {
				const inputName = this.inputsName[inputIdentifier];
				const inputMode = this.inputsMode[inputIdentifier];
				const inputReference = this.inputsReference[inputIdentifier];
				const zone = [inputMode, 'Z2', 'Z3', inputMode][this.zoneControl];
				const inputRef = zone + inputReference;
				try {
					const setInput = (this.powerState && inputReference != undefined) ? await this.axiosInstance(API_URL.iPhoneDirect + inputRef) : false;
					if (!this.disableLogInfo) {
						this.log('Device: %s %s %s, set %s successful, name: %s, reference: %s', this.host, accessoryName, this.zoneName, this.zoneControl <= 2 ? 'Input' : 'Sound Mode', inputName, inputRef);
					}
					this.setStartInputIdentifier = inputIdentifier;
					this.setStartInput = this.powerState ? false : true;
					this.inputIdentifier = inputIdentifier;
					this.inputReference = inputReference;
				} catch (error) {
					this.log.error('Device: %s %s %s, can not set %s. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, this.zoneName, this.zoneControl <= 2 ? 'Input' : 'Sound Mode', error);
				};
			});

		if (this.zoneControl <= 2) {
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
						const setCommand = await this.axiosInstance(API_URL.iPhoneDirect + command);
						if (!this.disableLogInfo) {
							this.log('Device: %s %s %s, Remote Key successful, command: %s', this.host, accessoryName, this.zoneName, command);
						}
					} catch (error) {
						this.log.error('Device: %s %s %s, can not Remote Key command. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, this.zoneName, error);
					};
				});
		}


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
						const setBrightness = await this.axiosInstance(API_URL.iPhoneDirect + brightness);
						if (!this.disableLogInfo) {
							this.log('Device: %s %s %s, set Brightness successful, brightness: %s', this.host, accessoryName, this.zoneName, value);
						}
						this.brightness = value;
					} catch (error) {
						this.log.error('Device: %s %s %s, can not set Brightness. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, this.zoneName, error);
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
						const setCommand = await this.axiosInstance(API_URL.iPhoneDirect + command);
						if (!this.disableLogInfo) {
							this.log('Device: %s %s %s, set Picture Mode successful, command: %s', this.host, accessoryName, this.zoneName, command);
						}
					} catch (error) {
						this.log.error('Device: %s %s %s, can not set Picture Mode command. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, this.zoneName, error);
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
						const setCommand = await this.axiosInstance(API_URL.iPhoneDirect + command);
						if (!this.disableLogInfo) {
							this.log('Device: %s %s %s, set Power Mode Selection successful, command: %s', this.host, accessoryName, this.zoneName, command);
						}
					} catch (error) {
						this.log.error('Device: %s %s %s, can not set Power Mode Selection command. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, this.zoneName, error);
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
					const setVolume = await this.axiosInstance(API_URL.iPhoneDirect + zone + command);
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
					const setVolume = await this.axiosInstance(API_URL.iPhoneDirect + zone + volume);
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
					const zControl = this.masterMute ? 4 : this.zoneControl;
					const zone = ['', 'Z2', 'Z3', '', ''][zControl];
					const newState = state ? 'MUON' : 'MUOFF';
					try {
						const setMute = await this.axiosInstance(API_URL.iPhoneDirect + zone + newState);
						if (!this.disableLogInfo) {
							this.log('Device: %s %s %s, set new Mute state successful, state: %s', this.host, accessoryName, this.zoneName, state ? 'ON' : 'OFF');
						}
					} catch (error) {
						this.log.error('Device: %s %s %s, can not set new Mute state. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, this.zoneName, error);
					};
				}
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
						const state = this.powerState ? !this.muteState : false;
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
						const state = this.powerState ? !this.muteState : false;
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
		this.log.debug('Device: %s %s %s, read saved %s successful: %s', this.host, accessoryName, this.zoneName, this.zoneControl <= 2 ? 'Input' : 'Sound Mode', savedInputs)

		const savedInputsNames = ((fs.readFileSync(this.inputsNamesFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsNamesFile)) : {};
		this.log.debug('Device: %s %s %s, read saved custom %s Names successful: %s', this.host, accessoryName, this.zoneName, this.zoneControl <= 2 ? 'Input' : 'Sound Mode', savedInputsNames)

		const savedInputsTargetVisibility = ((fs.readFileSync(this.inputsTargetVisibilityFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsTargetVisibilityFile)) : {};
		this.log.debug('Device: %s %s %s, read saved %s Target Visibility successful: %s', this.host, accessoryName, this.zoneName, this.zoneControl <= 2 ? 'Input' : 'Sound Mode', savedInputsTargetVisibility);

		//check available inputs and possible inputs count (max 95)
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
						this.log.debug('Device: %s %s %s, saved new Input successful, savedInputsNames: %s', this.host, accessoryName, this.zoneName, newCustomName);
						if (!this.disableLogInfo) {
							this.log('Device: %s %s %s, new %s name saved successful, name: %s, reference: %s', this.host, accessoryName, this.zoneName, this.zoneControl <= 2 ? 'Input' : 'Sound Mode', name, inputReference);
						}
					} catch (error) {
						this.log.error('Device: %s %s %s, new %s name saved failed, Error: %s', this.host, accessoryName, this.zoneName, this.zoneControl <= 2 ? 'Input' : 'Sound Mode', error);
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
						this.log.debug('Device: %s %s %s, %s: %s, saved Target Visibility state: %s', this.host, accessoryName, this.zoneName, this.zoneControl <= 2 ? 'Input' : 'Sound Mode', inputName, newTargetVisibility);
						if (!this.disableLogInfo) {
							this.log('Device: %s %s %s, new %s Target Visibility saved successful, name: %s, state: %s', this.host, accessoryName, this.zoneName, this.zoneControl <= 2 ? 'Input' : 'Sound Mode', inputName, state ? 'HIDEN' : 'SHOWN');
						}
						inputService.setCharacteristic(Characteristic.CurrentVisibilityState, state);
					} catch (error) {
						this.log.error('Device: %s %s %s, saved %s Target Visibility state error: %s', this.host, accessoryName, this.zoneName, this.zoneControl <= 2 ? 'Input' : 'Sound Mode', error);
					}
				});

			this.inputsReference.push(inputReference);
			this.inputsName.push(inputName);
			this.inputsType.push(inputType);
			this.inputsMode.push(inputMode);

			this.televisionService.addLinkedService(inputService);
			accessory.addService(inputService);
		}

		//Prepare button service
		if (this.zoneControl <= 2) {
			this.log.debug('prepareButtonsService');

			//check available buttons and possible buttons count (max 94 - inputsCount)
			const buttons = this.buttons;
			const buttonsCount = buttons.length;
			const maxButtonsCount = ((maxInputsCount + buttonsCount) < 94) ? buttonsCount : 94 - maxInputsCount;
			for (let i = 0; i < maxButtonsCount; i++) {

				//get button reference
				const buttonReference = buttons[i].reference;

				//get button name
				const buttonName = (buttons[i].name != undefined) ? buttons[i].name : buttons[i].reference;

				const buttonService = new Service.Switch(`${accessoryName} ${buttonName}`, `Button ${i}`);
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
							const setFunction = (state && this.powerState) ? await this.axiosInstance(API_URL.iPhoneDirect + buttonReference) : false;
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

				accessory.addService(buttonService);
			}
		}

		this.startPrepareAccessory = false;
		this.log.debug('Device: %s %s %s, publishExternalAccessories.', this.host, accessoryName, this.zoneName);
		this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
	}
};