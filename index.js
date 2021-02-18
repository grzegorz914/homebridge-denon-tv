'use strict';

const axios = require('axios').default;
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const parseStringPromise = require('xml2js').parseStringPromise;

const PLUGIN_NAME = 'homebridge-denon-tv';
const PLATFORM_NAME = 'DenonTv';
const ZONE_NAME = ['Main Zone', 'Zone 2', 'Zone 3', 'All Zones'];
const ZONE_NUMBER = ['MainZone_MainZone', 'Zone2_Zone2', 'Zone3_Zone3', 'MainZone_MainZone'];

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
		this.config = config;
		this.api = api;
		this.devices = config.devices || [];

		this.api.on('didFinishLaunching', () => {
			this.log.debug('didFinishLaunching');
			for (let i = 0, len = this.devices.length; i < len; i++) {
				let deviceName = this.devices[i];
				if (!deviceName.name) {
					this.log.warn('Device Name Missing')
				} else {
					new denonTvDevice(this.log, deviceName, this.api);
				}
			}
		});
	}

	configureAccessory(platformAccessory) {
		this.log.debug('configurePlatformAccessory');
	}

	removeAccessory(platformAccessory) {
		this.log.debug('removePlatformAccessory');
		this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [platformAccessory]);
	}
}

class denonTvDevice {
	constructor(log, config, api) {
		this.log = log;
		this.api = api;
		this.config = config;

		//device configuration
		this.name = config.name;
		this.host = config.host;
		this.port = config.port;
		this.refreshInterval = config.refreshInterval || 5;
		this.zoneControl = config.zoneControl;
		this.masterPower = config.masterPower;
		this.volumeControl = config.volumeControl;
		this.switchInfoMenu = config.switchInfoMenu;
		this.disableLogInfo = config.disableLogInfo;
		this.inputs = config.inputs;

		//get Device info
		this.manufacturer = config.manufacturer || 'Denon/Marantz';
		this.modelName = config.modelName || 'Model Name';
		this.serialNumber = config.serialNumber || 'Serial Number';
		this.firmwareRevision = config.firmwareRevision || 'Firmware Revision';
		this.zones = 1;
		this.apiVersion = null;

		//zones
		this.zoneName = ZONE_NAME[this.zoneControl];
		this.zoneNumber = ZONE_NUMBER[this.zoneControl];

		//setup variables
		this.checkDeviceInfo = false;
		this.checkDeviceState = false;
		this.startPrepareAccessory = true;
		this.currentPowerState = false;
		this.inputNames = new Array();
		this.inputReferences = new Array();
		this.inputTypes = new Array();
		this.inputModes = new Array();
		this.currentMuteState = false;
		this.currentVolume = 0;
		this.currentInputName = '';
		this.currentInputReference = '';
		this.currentInputIdentifier = 0;
		this.currentPlayPause = false;
		this.prefDir = path.join(api.user.storagePath(), 'denonTv');
		this.inputsFile = this.prefDir + '/' + 'inputs_' + this.host.split('.').join('');
		this.customInputsFile = this.prefDir + '/' + 'customInputs_' + this.host.split('.').join('');
		this.devInfoFile = this.prefDir + '/' + 'devInfo_' + this.host.split('.').join('');
		this.url = ('http://' + this.host + ':' + this.port);

		if (!Array.isArray(this.inputs) || this.inputs === undefined || this.inputs === null) {
			let defaultInputs = [
				{
					name: 'No inputs configured',
					reference: 'No references configured',
					type: 'No types configured',
					mode: 'No modes configured'
				}
			];
			this.inputs = defaultInputs;
		}

		//check if prefs directory ends with a /, if not then add it
		if (this.prefDir.endsWith('/') === false) {
			this.prefDir = this.prefDir + '/';
		}

		//check if the directory exists, if not then create it
		if (fs.existsSync(this.prefDir) === false) {
			fs.mkdir(this.prefDir, { recursive: false }, (error) => {
				if (error) {
					this.log.error('Device: %s %s, create directory: %s, error: %s', this.host, this.name, this.prefDir, error);
				} else {
					this.log.debug('Device: %s %s, create directory successful: %s', this.host, this.name, this.prefDir);
				}
			});
		}

		//Check device state
		setInterval(function () {
			if (this.checkDeviceInfo) {
				this.getDeviceInfo();
			} else if (!this.checkDeviceInfo && this.checkDeviceState) {
				this.updateDeviceState();
			}
		}.bind(this), this.refreshInterval * 1000);

		this.getDeviceInfo()
	}

	async getDeviceInfo() {
		var me = this;
		me.log.debug('Device: %s %s, requesting Device information.', me.host, me.name);
		try {
			const response = await axios.get(me.url + '/goform/Deviceinfo.xml');
			const result = await parseStringPromise(response.data);
			if (!me.disableLogInfo) {
				me.log('Device: %s %s %s, state: Online.', me.host, me.name, me.zoneName);
			}
			if (typeof result.Device_Info !== 'undefined') {
				if (typeof result.Device_Info.BrandCode[0] !== 'undefined') {
					var manufacturer = ['Denon', 'Marantz'][result.Device_Info.BrandCode[0]];
				} else {
					manufacturer = me.manufacturer;
				};
				if (typeof result.Device_Info.ModelName[0] !== 'undefined') {
					var modelName = result.Device_Info.ModelName[0];
				} else {
					modelName = me.modelName;
				};
				if (typeof result.Device_Info.MacAddress[0] !== 'undefined') {
					var serialNumber = result.Device_Info.MacAddress[0];
				} else {
					serialNumber = me.serialNumber;
				};
				if (typeof result.Device_Info.UpgradeVersion[0] !== 'undefined') {
					var firmwareRevision = result.Device_Info.UpgradeVersion[0];
				} else {
					firmwareRevision = me.firmwareRevision;
				};
				if (typeof result.Device_Info.DeviceZones[0] !== 'undefined') {
					var zones = result.Device_Info.DeviceZones[0];
				} else {
					zones = 'Undefined'
				};
				if (typeof result.Device_Info.CommApiVers[0] !== 'undefined') {
					var apiVersion = result.Device_Info.CommApiVers[0];
				} else {
					apiVersion = 'Undefined';
				};
			}
			if (me.zoneControl == 0 || me.zoneControl == 3) {
				if (fs.existsSync(me.devInfoFile) === false) {
					try {
						await fsPromises.writeFile(me.devInfoFile, JSON.stringify(result, null, 2));
						me.log.debug('Device: %s %s, devInfoFile saved successful in: %s %s', me.host, me.name, me.prefDir, JSON.stringify(result, null, 2));
					} catch (error) {
						me.log.error('Device: %s %s, could not write devInfoFile, error: %s', me.host, me.name, error);
					}
				}
				me.log('-------- %s --------', me.name);
				me.log('Manufacturer: %s', manufacturer);
				me.log('Model: %s', modelName);
				me.log('Zones: %s', zones);
				me.log('Api version: %s', apiVersion);
				me.log('Serialnr: %s', serialNumber);
				me.log('Firmware: %s', firmwareRevision);
				me.log('----------------------------------');
			}
			if (me.zoneControl == 1) {
				me.log('-------- %s --------', me.name);
				me.log('Manufacturer: %s', manufacturer);
				me.log('Model: %s', modelName);
				me.log('Zone: 2');
				me.log('----------------------------------');
			}
			if (me.zoneControl == 2) {
				me.log('-------- %s --------', me.name);
				me.log('Manufacturer: %s', manufacturer);
				me.log('Model: %s', modelName);
				me.log('Zone: 3');
				me.log('----------------------------------');
			}
			me.manufacturer = manufacturer;
			me.modelName = modelName;
			me.serialNumber = serialNumber;
			me.firmwareRevision = firmwareRevision;

			me.checkDeviceInfo = false;
			me.updateDeviceState();
		} catch (error) {
			me.log.error('Device: %s %s, Device Info eror: %s, state: Offline, trying to reconnect', me.host, me.name, error);
			me.checkDeviceInfo = true;
		};
	}

	async updateDeviceState() {
		var me = this;
		try {
			me.log.debug('Device: %s %s, requesting Device state.', me.host, me.name);
			const response = await axios.get(me.url + '/goform/form' + me.zoneNumber + 'XmlStatusLite.xml');
			const result = await parseStringPromise(response.data);
			let powerState = (result.item.Power[0].value[0] === 'ON');
			if (me.televisionService && (powerState !== me.currentPowerState)) {
				me.televisionService.updateCharacteristic(Characteristic.Active, powerState ? 1 : 0);
			}
			me.log.debug('Device: %s %s, get current Power state successful: %s', me.host, me.name, powerState ? 'ON' : 'OFF');
			me.currentPowerState = powerState;

			if (powerState) {
				let inputReference = result.item.InputFuncSelect[0].value[0];
				let inputIdentifier = 0;
				if (me.inputReferences.indexOf(inputReference) >= 0) {
					inputIdentifier = me.inputReferences.indexOf(inputReference);
				}
				let inputName = me.inputNames[inputIdentifier];
				if (me.televisionService && (inputReference !== me.currentInputReference)) {
					me.televisionService.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
				}
				me.log.debug('Device: %s %s %s, get current Input successful: %s %s', me.host, me.name, me.zoneName, inputName, inputReference);
				me.currentInputReference = inputReference;
				me.currentInputIdentifier = inputIdentifier;
				me.currentInputName = inputName;

				let mute = powerState ? (result.item.Mute[0].value[0] === 'on') : true;
				let volume = parseInt(result.item.MasterVolume[0].value[0]) + 80;
				if (me.speakerService) {
					me.speakerService.updateCharacteristic(Characteristic.Mute, mute);
					me.speakerService.updateCharacteristic(Characteristic.Volume, volume);
					if (me.volumeService && me.volumeControl == 1) {
						me.volumeService.updateCharacteristic(Characteristic.Brightness, volume);
						me.volumeService.updateCharacteristic(Characteristic.On, !mute);
					}
					if (me.volumeServiceFan && me.volumeControl == 2) {
						me.volumeServiceFan.updateCharacteristic(Characteristic.RotationSpeed, volume);
						me.volumeServiceFan.updateCharacteristic(Characteristic.On, !mute);
					}
				}
				me.log.debug('Device: %s %s %s, get current Mute state: %s', me.host, me.name, me.zoneName, mute ? 'ON' : 'OFF');
				me.log.debug('Device: %s %s %s, get current Volume level: %s dB ', me.host, me.name, me.zoneName, (volume - 80));
				me.currentMuteState = mute;
				me.currentVolume = volume;
			}
			me.checkDeviceState = true

			//start prepare accessory
			if (me.startPrepareAccessory) {
				me.prepareAccessory();
			}
		} catch (error) {
			me.log.error('Device: %s %s %s, update Device state error: %s', me.host, me.name, me.zoneName, error);
			me.checkDeviceState = false;
			me.checkDeviceInfo = true;
		};
	}

	//Prepare accessory
	prepareAccessory() {
		this.log.debug('prepareAccessory');
		const accessoryName = this.name;
		const accessoryUUID = UUID.generate(accessoryName);
		const accessoryCategory = Categories.AUDIO_RECEIVER;
		const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

		//Prepare information service
		this.log.debug('prepareInformationService');
		const manufacturer = this.manufacturer;
		const modelName = this.modelName;
		const serialNumber = this.serialNumber;
		const firmwareRevision = this.firmwareRevision;

		accessory.removeService(accessory.getService(Service.AccessoryInformation));
		const informationService = new Service.AccessoryInformation();
		informationService
			.setCharacteristic(Characteristic.Name, accessoryName)
			.setCharacteristic(Characteristic.Manufacturer, manufacturer)
			.setCharacteristic(Characteristic.Model, modelName)
			.setCharacteristic(Characteristic.SerialNumber, serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, firmwareRevision);

		accessory.addService(informationService);

		//Prepare television service
		this.log.debug('prepareTelevisionService');
		this.televisionService = new Service.Television(accessoryName, 'televisionService');
		this.televisionService.setCharacteristic(Characteristic.ConfiguredName, accessoryName);
		this.televisionService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.televisionService.getCharacteristic(Characteristic.Active)
			.on('get', (callback) => {
				let state = this.currentPowerState ? 1 : 0;
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, get current Power state successfull, state: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
				}
				callback(null, state);
			})
			.onSet(async (state) => {
				if (state != this.currentPowerState) {
					try {
						const zControl = this.masterPower ? 3 : this.zoneControl
						this.log.debug('zControl is %s', zControl)
						let newState = [(state ? 'ZMON' : 'ZMOFF'), (state ? 'Z2ON' : 'Z2OFF'), (state ? 'Z3ON' : 'Z3OFF'), (state ? 'PWON' : 'PWSTANDBY')][zControl];
						const response = await axios.get(this.url + '/goform/formiPhoneAppDirect.xml?' + newState);
						if (!this.disableLogInfo) {
							this.log('Device: %s %s %s, set new Power state successful: %s', this.host, accessoryName, this.zoneName, newState);
						}
					} catch (error) {
						this.log.error('Device: %s %s %s, can not set new Power state. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, this.zoneName, error);
					};
				}
			});

		this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
			.on('get', (callback) => {
				let inputReference = this.currentInputReference;
				let inputIdentifier = 0;
				if (this.inputReferences.indexOf(inputReference) >= 0) {
					inputIdentifier = this.inputReferences.indexOf(inputReference);
				}
				let inputName = this.inputNames[inputIdentifier];
				if (!this.disableLogInfo) {
					this.log('Device: %s %s %s, get current Input successful: %s %s', this.host, accessoryName, this.zoneName, inputName, inputReference);
				}
				callback(null, inputIdentifier);
			})
			.onSet(async (inputIdentifier) => {
				try {
					let inputName = this.inputNames[inputIdentifier];
					let inputReference = this.inputReferences[inputIdentifier];
					let inputMode = this.inputModes[inputIdentifier];
					let zone = [inputMode, 'Z2', 'Z3', inputMode][this.zoneControl];
					const response = await axios.get(this.url + '/goform/formiPhoneAppDirect.xml?' + zone + inputReference);
					if (this.zoneControl == 3) {
						if (this.zones >= 2) {
							const response1 = await axios.get(this.url + '/goform/formiPhoneAppDirect.xml?' + 'Z2' + inputReference);
						}
						if (this.zones >= 3) {
							const response1 = await axios.get(this.url + '/goform/formiPhoneAppDirect.xml?' + 'Z3' + inputReference);
						}
					}
					if (!this.disableLogInfo) {
						this.log('Device: %s %s %s, set new Input successful: %s %s', this.host, accessoryName, this.zoneName, inputName, inputReference);
					}
				} catch (error) {
					this.log.error('Device: %s %s %s, can not set new Input. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, this.zoneName, error);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.RemoteKey)
			.onSet(async (command) => {
				try {
					if (this.currentInputReference === 'SPOTIFY' || this.currentInputReference === 'BT' || this.currentInputReference === 'USB/IPOD' || this.currentInputReference === 'NET' || this.currentInputReference === 'MPLAY') {
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
								command = this.currentPlayPause ? 'NS9B' : 'NS9A';
								this.currentPlayPause = !this.currentPlayPause;
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
					const response = await axios.get(this.url + '/goform/formiPhoneAppDirect.xml?' + command);
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, setRemoteKey successful, command: %s', this.host, accessoryName, command);
					}
				} catch (error) {
					this.log.error('Device: %s %s, can not setRemoteKey command. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
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
					const response = await axios.get(this.url + '/goform/formiPhoneAppDirect.xml?' + command);
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, setPowerModeSelection successful, command: %s', this.host, accessoryName, command);
					}
				} catch (error) {
					this.log.error('Device: %s %s %s, can not setPowerModeSelection command. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, this.zoneName, error);
				};
			});
		this.televisionService.getCharacteristic(Characteristic.PictureMode)
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
					const response = await axios.get(this.url + '/goform/formiPhoneAppDirect.xml?' + command);
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, setPictureMode successful, command: %s', this.host, accessoryName, command);
					}
				} catch (error) {
					this.log.error('Device: %s %s %s, can not setPictureMode command. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, this.zoneName, error);
				};
			});

		accessory.addService(this.televisionService);

		//Prepare speaker service
		this.log.debug('prepareSpeakerService');
		this.speakerService = new Service.TelevisionSpeaker(accessoryName + ' Speaker', 'speakerService');
		this.speakerService
			.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
			.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
		this.speakerService.getCharacteristic(Characteristic.VolumeSelector)
			.onSet(async (command) => {
				try {
					let zone = ['MV', 'Z2', 'Z3', 'MV'][this.zoneControl];
					switch (command) {
						case Characteristic.VolumeSelector.INCREMENT:
							command = 'UP';
							break;
						case Characteristic.VolumeSelector.DECREMENT:
							command = 'DOWN';
							break;
					}
					const response = await axios.get(this.url + '/goform/formiPhoneAppDirect.xml?' + zone + command);
					if (this.zoneControl == 3) {
						if (this.zones >= 2) {
							const response1 = await axios.get(this.url + '/goform/formiPhoneAppDirect.xml?' + 'Z2' + command);
						}
						if (this.zones >= 3) {
							const response2 = await axios.get(this.url + '/goform/formiPhoneAppDirect.xml?' + 'Z3' + command);
						}
					}
					if (!this.disableLogInfo) {
						this.log('Device: %s %s %s, setVolumeSelector successful, command: %s', this.host, accessoryName, this.zoneName, command);
					}
				} catch (error) {
					this.log.error('Device: %s %s %s, can not setVolumeSelector command. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, this.zoneName, error);
				};
			});
		this.speakerService.getCharacteristic(Characteristic.Volume)
			.on('get', (callback) => {
				let volume = this.currentVolume;
				if (!this.disableLogInfo) {
					this.log('Device: %s %s %s, get current Volume level successful: %s dB', this.host, accessoryName, this.zoneName, (volume - 80));
				}
				callback(null, volume);
			})
			.onSet(async (volume) => {
				try {
					let currentVolume = this.currentVolume;
					let zone = ['MV', 'Z2', 'Z3', 'MV'][this.zoneControl];
					if (volume == 0 || volume == 100) {
						volume = currentVolume;
					}
					const response = await axios.get(this.url + '/goform/formiPhoneAppDirect.xml?' + zone + volume);
					if (this.zoneControl == 3) {
						if (this.zones >= 2) {
							const response1 = await axios.get(this.url + '/goform/formiPhoneAppDirect.xml?' + 'Z2' + volume);
						}
						if (this.zones >= 3) {
							const response2 = await axios.get(this.url + '/goform/formiPhoneAppDirect.xml?' + 'Z3' + volume);
						}
					}
					if (!this.disableLogInfo) {
						this.log('Device: %s %s %s, set new Volume level successful: %s', this.host, accessoryName, this.zoneName, volume);
					}
				} catch (error) {
					this.log.error('Device: %s %s %s, can not set new Volume level. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, this.zoneName, error);
				};
			});
		this.speakerService.getCharacteristic(Characteristic.Mute)
			.on('get', (callback) => {
				let state = this.currentMuteState;
				if (!this.disableLogInfo) {
					this.log('Device: %s %s %s, get current Mute state successful: %s', this.host, accessoryName, this.zoneName, state ? 'ON' : 'OFF');
				}
				callback(null, state);
			})
			.onSet(async (state) => {
				if (state !== this.currentMuteState) {
					try {
						const newState = [(state ? 'MUON' : 'MUOFF'), (state ? 'Z2MUON' : 'Z2MUOFF'), (state ? 'Z3MUON' : 'Z3MUOFF'), (state ? 'MUON' : 'MUOFF')][this.zoneControl];
						const response = await axios.get(this.url + '/goform/formiPhoneAppDirect.xml?' + newState);
						if (this.zoneControl == 3) {
							if (this.zones >= 2) {
								newState = state ? 'Z2MUON' : 'Z2MUOFF';
								const response1 = await axios.get(this.url + '/goform/formiPhoneAppDirect.xml?' + newState);
							}
							if (this.zones >= 3) {
								newState = state ? 'Z3MUON' : 'Z3MUOFF';
								const response2 = await axios.get(this.url + '/goform/formiPhoneAppDirect.xml?' + newState);
							}
						}
						if (!this.disableLogInfo) {
							this.log('Device: %s %s %s, set new Mute state successful: %s', this.host, accessoryName, this.zoneName, state ? 'ON' : 'OFF');
						}
					} catch (error) {
						this.log.error('Device: %s %s %s, can not set new Mute state. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, this.zoneName, error);
					};
				}
			});

		accessory.addService(this.speakerService);
		this.televisionService.addLinkedService(this.speakerService);

		//Prepare volume service
		if (this.volumeControl >= 1) {
			this.log.debug('prepareVolumeService');
			if (this.volumeControl == 1) {
				this.volumeService = new Service.Lightbulb(accessoryName + ' Volume', 'volumeService');
				this.volumeService.getCharacteristic(Characteristic.Brightness)
					.on('get', (callback) => {
						let volume = this.currentVolume;
						callback(null, volume);
					})
					.on('set', (volume, callback) => {
						this.speakerService.setCharacteristic(Characteristic.Volume, volume);
						callback(null);
					});
				this.volumeService.getCharacteristic(Characteristic.On)
					.on('get', (callback) => {
						let state = this.currentPowerState ? this.currentMuteState : true;
						callback(null, !state);
					})
					.on('set', (state, callback) => {
						this.speakerService.setCharacteristic(Characteristic.Mute, !state);
						callback(null);
					});
				accessory.addService(this.volumeService);
				this.volumeService.addLinkedService(this.volumeService);
			}
			if (this.volumeControl == 2) {
				this.volumeServiceFan = new Service.Fan(accessoryName + ' Volume', 'volumeServiceFan');
				this.volumeServiceFan.getCharacteristic(Characteristic.RotationSpeed)
					.on('get', (callback) => {
						let volume = this.currentVolume;
						callback(null, volume);
					})
					.on('set', (volume, callback) => {
						this.speakerService.setCharacteristic(Characteristic.Volume, volume);
						callback(null);
					});
				this.volumeServiceFan.getCharacteristic(Characteristic.On)
					.on('get', (callback) => {
						let state = this.currentPowerState ? this.currentMuteState : true;
						callback(null, !state);
					})
					.on('set', (state, callback) => {
						this.speakerService.setCharacteristic(Characteristic.Mute, !state);
						callback(null);
					});
				accessory.addService(this.volumeServiceFan);
				this.televisionService.addLinkedService(this.volumeServiceFan);
			}
		}

		//Prepare inputs services
		this.log.debug('prepareInputsService');
		let savedNames = {};
		try {
			savedNames = JSON.parse(fs.readFileSync(this.customInputsFile));
		} catch (error) {
			this.log.debug('Device: %s %s, customInputs file does not exist', this.host, accessoryName)
		}

		this.inputs.forEach((input, i) => {

			//get input reference
			let inputReference = input.reference;

			//get input name		
			let inputName = input.name;

			if (savedNames && savedNames[inputReference]) {
				inputName = savedNames[inputReference];
			};

			//get input type
			let inputType = input.type;

			//get input mode
			let inputMode = input.mode;

			this.inputsService = new Service.InputSource(inputReference, 'input' + i);
			this.inputsService
				.setCharacteristic(Characteristic.Identifier, i)
				.setCharacteristic(Characteristic.ConfiguredName, inputName)
				.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
				.setCharacteristic(Characteristic.InputSourceType, inputType)
				.setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);

			this.inputsService
				.getCharacteristic(Characteristic.ConfiguredName)
				.onSet(async (name) => {
					try {
						savedNames[inputReference] = name;
						await fsPromises.writeFile(this.customInputsFile, JSON.stringify(savedNames, null, 2));
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, saved new Input successful, name: %s reference: %s', this.host, accessoryName, name, inputReference);
						}
					} catch (error) {
						this.log.error('Device: %s %s, can not write new Input name, error: %s', this.host, accessoryName, error);
					}
				});

			this.inputReferences.push(inputReference);
			this.inputNames.push(inputName);
			this.inputTypes.push(inputType);
			this.inputModes.push(inputMode);

			accessory.addService(this.inputsService);
			this.televisionService.addLinkedService(this.inputsService);
		});

		this.startPrepareAccessory = false;
		this.log.debug('Device: %s %s, publishExternalAccessories.', this.host, accessoryName);
		this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
	}
};
