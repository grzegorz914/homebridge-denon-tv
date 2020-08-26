'use strict';

const axios = require('axios');
const fs = require('fs');
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
		this.accessories = [];

		this.api.on('didFinishLaunching', () => {
			this.log.debug('didFinishLaunching');
			for (let i = 0, len = this.devices.length; i < len; i++) {
				let deviceName = this.devices[i];
				if (!deviceName.name) {
					this.log.warn('Device Name Missing')
				} else {
					this.accessories.push(new denonTvDevice(this.log, deviceName, this.api));
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
		this.api = api;
		this.config = config;

		//device configuration
		this.name = config.name;
		this.host = config.host;
		this.port = config.port;
		this.zoneControl = config.zoneControl;
		this.volumeControl = config.volumeControl;
		this.switchInfoMenu = config.switchInfoMenu;
		this.inputs = config.inputs;

		//get Device info
		this.manufacturer = config.manufacturer || 'Denon/Marantz';
		this.modelName = config.modelName || PLUGIN_NAME;
		this.serialNumber = config.serialNumber || 'SN0000003';
		this.firmwareRevision = config.firmwareRevision || 'FW0000003';
		this.zones = 1;
		this.apiVersion = null;

		//zones
		this.zoneName = ZONE_NAME[this.zoneControl];
		this.zoneNumber = ZONE_NUMBER[this.zoneControl];

		//setup variables
		this.checkDeviceInfo = false;
		this.checkDeviceState = false;
		this.currentPowerState = false;
		this.inputNames = new Array();
		this.inputReferences = new Array();
		this.inputTypes = new Array();
		this.inputModes = new Array();
		this.currentMuteState = false;
		this.currentVolume = 0;
		this.currentInputName = '';
		this.currentInputReference = '';
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

		//update device state
		setInterval(function () {
			if (this.checkDeviceInfo) {
				this.getDeviceInfo();
			}
			if (this.checkDeviceState) {
				this.updateDeviceState();
			}
		}.bind(this), 3000);

		this.prepareTelevisionService();
	}

	//Prepare TV service 
	prepareTelevisionService() {
		this.log.debug('prepareTelevisionService');
		const accessoryName = this.name;
		const accessoryUUID = UUID.generate(accessoryName);
		this.accessory = new Accessory(accessoryName, accessoryUUID);
		this.accessory.category = Categories.AUDIO_RECEIVER;

		this.accessory.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
			.setCharacteristic(Characteristic.Model, this.modelName)
			.setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);

		this.televisionService = new Service.Television(accessoryName, 'televisionService');
		this.televisionService.setCharacteristic(Characteristic.ConfiguredName, accessoryName);
		this.televisionService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.televisionService.getCharacteristic(Characteristic.Active)
			.on('get', this.getPower.bind(this))
			.on('set', this.setPower.bind(this));

		this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
			.on('get', this.getInput.bind(this))
			.on('set', this.setInput.bind(this));

		this.televisionService.getCharacteristic(Characteristic.RemoteKey)
			.on('set', this.setRemoteKey.bind(this));

		this.televisionService.getCharacteristic(Characteristic.PowerModeSelection)
			.on('set', this.setPowerModeSelection.bind(this));

		this.televisionService.getCharacteristic(Characteristic.PictureMode)
			.on('set', this.setPictureMode.bind(this));

		this.accessory.addService(this.televisionService);
		this.prepareSpeakerService();
		this.prepareInputsService();
		if (this.volumeControl >= 1) {
			this.prepareVolumeService();
		}
		if (this.soundModeControl) {
			this.prepareSoundModesService();
		}

		this.checkDeviceInfo = true;

		this.log.debug('Device: %s %s, publishExternalAccessories.', this.host, accessoryName);
		this.api.publishExternalAccessories(PLUGIN_NAME, [this.accessory]);
	}

	//Prepare speaker service
	prepareSpeakerService() {
		this.log.debug('prepareSpeakerService');
		this.speakerService = new Service.TelevisionSpeaker(this.name + ' Speaker', 'speakerService');
		this.speakerService
			.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
			.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
		this.speakerService.getCharacteristic(Characteristic.VolumeSelector)
			.on('set', this.setVolumeSelector.bind(this));
		this.speakerService.getCharacteristic(Characteristic.Volume)
			.on('get', this.getVolume.bind(this))
			.on('set', this.setVolume.bind(this));
		this.speakerService.getCharacteristic(Characteristic.Mute)
			.on('get', this.getMute.bind(this))
			.on('set', this.setMute.bind(this));

		this.accessory.addService(this.speakerService);
		this.televisionService.addLinkedService(this.speakerService);
	}

	//Prepare volume service
	prepareVolumeService() {
		this.log.debug('prepareVolumeService');
		if (this.volumeControl == 1) {
			this.volumeService = new Service.Lightbulb(this.name + ' Volume', 'volumeService');
			this.volumeService.getCharacteristic(Characteristic.Brightness)
				.on('get', this.getVolume.bind(this))
				.on('set', (volume, callback) => {
					this.speakerService.setCharacteristic(Characteristic.Volume, volume);
					callback(null);
				});
		}
		if (this.volumeControl == 2) {
			this.volumeService = new Service.Fan(this.name + ' Volume', 'volumeService');
			this.volumeService.getCharacteristic(Characteristic.RotationSpeed)
				.on('get', this.getVolume.bind(this))
				.on('set', (volume, callback) => {
					this.speakerService.setCharacteristic(Characteristic.Volume, volume);
					callback(null);
				});
		}
		this.volumeService.getCharacteristic(Characteristic.On)
			.on('get', (callback) => {
				let state = !this.currentMuteState;
				callback(null, state);
			})
			.on('set', (state, callback) => {
				this.speakerService.setCharacteristic(Characteristic.Mute, !state);
				callback(null);
			});

		this.accessory.addService(this.volumeService);
		this.televisionService.addLinkedService(this.volumeService);
	}

	//Prepare inputs services
	prepareInputsService() {
		this.log.debug('prepareInputsService');

		let savedNames = {};
		try {
			savedNames = JSON.parse(fs.readFileSync(this.customInputsFile));
		} catch (error) {
			this.log.debug('Device: %s %s, customInputs file does not exist', this.host, this.name)
		}

		this.inputs.forEach((input, i) => {

			//get input reference
			let inputReference = input.reference;

			//get input name		
			let inputName = input.name;

			if (savedNames && savedNames[inputReference]) {
				inputName = savedNames[inputReference];
			} else {
				inputName = input.name;
			}

			//get input type
			let inputType = input.type;

			//get input mode
			let inputMode = input.mode;

			this.inputsService = new Service.InputSource(inputReference, 'input' + i);
			this.inputsService
				.setCharacteristic(Characteristic.Identifier, i)
				.setCharacteristic(Characteristic.ConfiguredName, inputName)
				.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
				.setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType, inputType)
				.setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);

			this.inputsService
				.getCharacteristic(Characteristic.ConfiguredName)
				.on('set', (name, callback) => {
					savedNames[inputReference] = name;
					fs.writeFile(this.customInputsFile, JSON.stringify(savedNames, null, 2), (error) => {
						if (error) {
							this.log.error('Device: %s %s, can not write new Input name, error: %s', this.host, this.name, error);
						} else {
							this.log.info('Device: %s %s, saved new Input successful, name: %s reference: %s', this.host, this.name, name, inputReference);
						}
					});
					callback(null)
				});
			this.accessory.addService(this.inputsService);
			this.televisionService.addLinkedService(this.inputsService);
			this.inputReferences.push(inputReference);
			this.inputNames.push(inputName);
			this.inputTypes.push(inputType);
			this.inputModes.push(inputMode);
		});
	}

	getDeviceInfo() {
		var me = this;
		me.log.debug('Device: %s %s, requesting Device information.', me.host, me.name);
		axios.get(me.url + '/goform/Deviceinfo.xml').then(response => {
			parseStringPromise(response.data).then(result => {
				me.log.info('Device: %s %s %s, state: Online.', me.host, me.name, me.zoneName);
				me.manufacturer = ['Denon', 'Marantz'][result.Device_Info.BrandCode[0]];
				me.modelName = result.Device_Info.ModelName[0];
				me.serialNumber = result.Device_Info.MacAddress[0];
				me.firmwareRevision = result.Device_Info.UpgradeVersion[0];
				me.zones = result.Device_Info.DeviceZones[0];
				me.apiVersion = result.Device_Info.CommApiVers[0];
				if (me.zoneControl == 0 || me.zoneControl == 3) {
					if (fs.existsSync(me.devInfoFile) === false) {
						fs.writeFile(me.devInfoFile, JSON.stringify(result, null, 2), (error) => {
							if (error) {
								me.log.error('Device: %s %s, could not write devInfoFile, error: %s', me.host, me.name, error);
							} else {
								me.log.debug('Device: %s %s, devInfoFile saved successful in: %s %s', me.host, me.name, me.prefDir, JSON.stringify(result, null, 2));
							}
						});
					}
					me.log('-------- %s --------', me.name);
					me.log('Manufacturer: %s', me.manufacturer);
					me.log('Model: %s', me.modelName);
					me.log('Zones: %s', me.zones);
					me.log('Api version: %s', me.apiVersion);
					me.log('Serialnumber: %s', me.serialNumber);
					me.log('Firmware: %s', me.firmwareRevision);
					me.log('----------------------------------');
				}
				if (me.zoneControl == 1) {
					me.log('-------- %s --------', me.name);
					me.log('Manufacturer: %s', me.manufacturer);
					me.log('Model: %s', me.modelName);
					me.log('Zone: 2');
					me.log('----------------------------------');
				}
				if (me.zoneControl == 2) {
					me.log('-------- %s --------', me.name);
					me.log('Manufacturer: %s', me.manufacturer);
					me.log('Model: %s', me.modelName);
					me.log('Zone: 3');
					me.log('----------------------------------');
				}
				me.checkDeviceInfo = false;
				me.checkDeviceState = true;
			}).catch(error => {
				me.log.error('Device %s %s, getDeviceInfo parse string error: %s', me.host, me.name, error);
			});
		}).catch(error => {
			me.log.error('Device: %s %s, getDeviceInfo eror: %s, state: Offline', me.host, me.name, error);
			me.checkDeviceInfo = true;
			me.checkDeviceState = false;
		});
	}

	updateDeviceState() {
		var me = this;
		me.log.debug('Device: %s %s, requesting Device state.', me.host, me.name);
		axios.get(this.url + '/goform/form' + this.zoneNumber + 'XmlStatusLite.xml').then(response => {
			parseStringPromise(response.data).then(result => {
				let powerState = (result.item.Power[0].value[0] == 'ON');
				if (me.televisionService) {
					me.televisionService.updateCharacteristic(Characteristic.Active, powerState ? 1 : 0);
				}
				me.log.debug('Device: %s %s, get current Power state successful: %s', me.host, me.name, powerState ? 'ON' : 'OFF');
				me.currentPowerStat = powerState;

				let inputReference = result.item.InputFuncSelect[0].value[0];
				let inputIdentifier = me.inputReferences.indexOf(inputReference);
				let inputName = me.inputNames[inputIdentifier];
				if (me.televisionService) {
					me.televisionService.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
				}
				me.log.debug('Device: %s %s %s, get current Input successful: %s %s', me.host, me.name, me.zoneName, inputName, inputReference);
				me.currentInputReference = inputReference;

				let mute = powerState ? (result.item.Mute[0].value[0] == 'ON') : true;
				let volume = parseInt(result.item.MasterVolume[0].value[0]) + 80;
				if (me.speakerService) {
					me.speakerService.updateCharacteristic(Characteristic.Mute, mute);
					me.speakerService.updateCharacteristic(Characteristic.Volume, volume);
					if (me.volumeService && me.volumeControl >= 1) {
						me.volumeService.updateCharacteristic(Characteristic.On, !mute);
					}
					if (me.volumeService && me.volumeControl == 1) {
						me.volumeService.updateCharacteristic(Characteristic.Brightness, volume);
					}
					if (me.volumeService && me.volumeControl == 2) {
						me.volumeService.updateCharacteristic(Characteristic.RotationSpeed, volume);
					}
				}
				me.log.debug('Device: %s %s %s, get current Mute state: %s', me.host, me.name, me.zoneName, mute ? 'ON' : 'OFF');
				me.log.debug('Device: %s %s %s, get current Volume level: %s dB ', me.host, me.name, me.zoneName, (volume - 80));
				me.currentMuteState = mute;
				me.currentVolume = volume;
			}).catch(error => {
				me.log.error('Device: %s %s %s, update Device state parse string error: %s', me.host, me.name, me.zoneName, error);
			});
		}).catch(error => {
			me.log.error('Device: %s %s %s, update Device state error: %s', me.host, me.name, me.zoneName, error);
		});
	}

	getPower(callback) {
		var me = this;
		axios.get(this.url + '/goform/form' + this.zoneNumber + 'XmlStatusLite.xml').then(response => {
			parseStringPromise(response.data).then(result => {
				let state = (result.item.Power[0].value[0] == 'ON');
				me.log.info('Device: %s %s %s, get current Power state successful: %s', me.host, me.name, me.zoneName, state ? 'ON' : 'OFF');
				callback(null, state);
			}).catch(error => {
				me.log.error('Device: %s %s %s, get current Power state parse string error: %s', me.host, me.name, me.zoneName, error);
			});
		}).catch(error => {
			me.log.error('Device: %s %s %s, get current Power state error: %s', me.host, me.name, me.zoneName, error);
		});
	}

	setPower(state, callback) {
		var me = this;
		let powerState = me.currentPowerState;
		let newState = [(powerState ? 'ZMOFF' : 'ZMON'), (powerState ? 'Z2OFF' : 'Z2ON'), (powerState ? 'Z3OFF' : 'Z3ON'), (powerState ? 'PWSTANDBY' : 'PWON')][me.zoneControl];
		if ((state && !powerState) || (!state && powerState)) {
			axios.get(me.url + '/goform/formiPhoneAppDirect.xml?' + newState).then(result => {
				me.log.info('Device: %s %s %s, set new Power state successful: %s', me.host, me.name, me.zoneName, state ? 'ON' : 'OFF');
				callback(null);
			}).catch(error => {
				me.log.error('Device: %s %s %s, can not set new Power state. Might be due to a wrong settings in config, error: %s', me.host, me.name, me.zoneName, error);
				callback(error);
			});
		}
	}

	getMute(callback) {
		var me = this;
		axios.get(this.url + '/goform/form' + this.zoneNumber + 'XmlStatusLite.xml').then(response => {
			parseStringPromise(response.data).then(result => {
				let powerState = (result.item.Power[0].value[0] == 'ON')
				let state = powerState ? (result.item.Mute[0].value[0] == 'ON') : true;
				me.log.info('Device: %s %s %s, get current Mute state successful: %s', me.host, me.name, me.zoneName, state ? 'ON' : 'OFF');
				callback(null, state);
			}).catch(error => {
				me.log.error('Device: %s %s %s, get current Mute parse string error: %s', me.host, me.name, me.zoneName, error);
			});
		}).catch(error => {
			me.log.error('Device: %s %s %s, get current Mute error: %s', me.host, me.name, me.zoneName, error);
		});
	}

	setMute(state, callback) {
		var me = this;
		let muteState = me.currentMuteState;
		let newState = [(state ? 'MUON' : 'MUOFF'), (state ? 'Z2MUON' : 'Z2MUOFF'), (state ? 'Z3MUON' : 'Z3MUOFF'), (state ? 'MUON' : 'MUOFF')][me.zoneControl];
		if (me.currentPowerState && state !== muteState) {
			axios.get(me.url + '/goform/formiPhoneAppDirect.xml?' + newState).then(result => {
				me.log.info('Device: %s %s %s, set new Mute state successful: %s', me.host, me.name, me.zoneName, state ? 'ON' : 'OFF');
				if (me.zoneControl == 3) {
					if (me.zones >= 2) {
						newState = state ? 'Z2MUON' : 'Z2MUOFF';
						axios.get(me.url + '/goform/formiPhoneAppDirect.xml?' + newState).then(result => {
						}).catch(error => {
							me.log.error('Device: %s %s %s, can not set new Mute state. Might be due to a wrong settings in config, error: %s', me.host, me.name, 'Zone 2', error);
						});
					}
					if (me.zones >= 3) {
						newState = state ? 'Z3MUON' : 'Z3MUOFF';
						axios.get(me.url + '/goform/formiPhoneAppDirect.xml?' + newState).then(result => {
						}).catch(error => {
							me.log.error('Device: %s %s %s, can not set new Mute state. Might be due to a wrong settings in config, error: %s', me.host, me.name, 'Zone 3', error);
						});
					}
				}
				callback(null);
			}).catch(error => {
				me.log.error('Device: %s %s %s, can not set new Mute state. Might be due to a wrong settings in config, error: %s', me.host, me.name, me.zoneName, error);
				callback(error);
			});
		}
	}

	getVolume(callback) {
		var me = this;
		axios.get(this.url + '/goform/form' + this.zoneNumber + 'XmlStatusLite.xml').then(response => {
			parseStringPromise(response.data).then(result => {
				let currentVolume = parseInt(result.item.MasterVolume[0].value[0]) + 80;
				me.log.info('Device: %s %s %s, get current Volume level successful: %s dB', me.host, me.name, me.zoneName, (currentVolume - 80));
				callback(null, currentVolume);
			}).catch(error => {
				me.log.error('Device: %s %s %s, get current Volume parse string error: %s', me.host, me.name, me.zoneName, error);
			});
		}).catch(error => {
			me.log.error('Device: %s %s %s, get current Volume error: %s', me.host, me.name, me.zoneName, error);
		});
	}

	setVolume(volume, callback) {
		var me = this;
		let currentVolume = me.currentVolume;
		let zone = ['MV', 'Z2', 'Z3', 'MV'][me.zoneControl];
		if (volume == 0 || volume == 100) {
			volume = currentVolume;
		}
		axios.get(me.url + '/goform/formiPhoneAppDirect.xml?' + zone + volume).then(result => {
			me.log.info('Device: %s %s %s, set new Volume level successful: %s', me.host, me.name, me.zoneName, volume);
			if (me.zoneControl == 3) {
				if (me.zones >= 2) {
					axios.get(me.url + '/goform/formiPhoneAppDirect.xml?' + 'Z2' + volume).then(result => {
					}).catch(error => {
						me.log.error('Device: %s %s %s, can not set new Volume level. Might be due to a wrong settings in config, error: %s', me.host, me.name, 'Zone 2', error);
					});
				}
				if (me.zones >= 3) {
					axios.get(me.url + '/goform/formiPhoneAppDirect.xml?' + 'Z3' + volume).then(result => {
					}).catch(error => {
						me.log.error('Device: %s %s %s, can not set new Volume level. Might be due to a wrong settings in config, error: %s', me.host, me.name, 'Zone 3', error);
					});
				}
			}
			callback(null);
		}).catch(error => {
			me.log.error('Device: %s %s %s, can not set new Volume level. Might be due to a wrong settings in config, error: %s', me.host, me.name, me.zoneName, error);
			callback(error);
		});
	}

	getInput(callback) {
		var me = this;
		axios.get(this.url + '/goform/form' + this.zoneNumber + 'XmlStatusLite.xml').then(response => {
			parseStringPromise(response.data).then(result => {
				let inputReference = result.item.InputFuncSelect[0].value[0];
				let inputIdentifier = me.inputReferences.indexOf(inputReference);
				let inputName = me.inputNames[inputIdentifier];
				me.log.info('Device: %s %s %s, get current Input successful: %s %s', me.host, me.name, me.zoneName, inputName, inputReference);
				callback(null, inputIdentifier);
			}).catch(error => {
				me.log.error('Device: %s %s %s, get current Input parse string error: %s', me.host, me.name, me.zoneName, error);
			});
		}).catch(error => {
			me.log.error('Device: %s %s %s, get current Input error: %s', me.host, me.name, me.zoneName, error);
		});
	}

	setInput(inputIdentifier, callback) {
		var me = this;
		let inputName = me.inputNames[inputIdentifier];
		let inputReference = me.inputReferences[inputIdentifier];
		let inputMode = me.inputModes[inputIdentifier];
		let zone = [inputMode, 'Z2', 'Z3', inputMode][me.zoneControl];
		setTimeout(() => {
			axios.get(me.url + '/goform/formiPhoneAppDirect.xml?' + zone + inputReference).then(result => {
				me.log.info('Device: %s %s %s, set new Input successful: %s %s', me.host, me.name, me.zoneName, inputName, inputReference);
				if (me.zoneControl == 3) {
					if (me.zones >= 2) {
						axios.get(me.url + '/goform/formiPhoneAppDirect.xml?' + 'Z2' + inputReference).then(result => {
						}).catch(error => {
							me.log.error('Device: %s %s %s, can not set new Input. Might be due to a wrong settings in config, error: %s', me.host, me.name, me.zoneName, error);
						});
					}
					if (me.zones >= 3) {
						axios.get(me.url + '/goform/formiPhoneAppDirect.xml?' + 'Z3' + inputReference).then(result => {
						}).catch(error => {
							me.log.error('Device: %s %s %s, can not set new Input. Might be due to a wrong settings in config, error: %s', me.host, me.name, me.zoneName, error);
						});
					}
				}
				callback(null);
			}).catch(error => {
				me.log.error('Device: %s %s %s, can not set new Input. Might be due to a wrong settings in config, error: %s', me.host, me.name, me.zoneName, error);
				callback(error);
			});
		}, 250);
	}

	setPictureMode(mode, callback) {
		var me = this;
		let command = '';
		if (me.currentPowerState) {
			switch (mode) {
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
			axios.get(me.url + '/goform/formiPhoneAppDirect.xml?' + command).then(result => {
				me.log.info('Device: %s %s, setPictureMode successful, command: %s', me.host, me.name, command);
				callback(null);
			}).catch(error => {
				me.log.error('Device: %s %s %s, can not setPictureMode command. Might be due to a wrong settings in config, error: %s', me.host, me.name, me.zoneName, error);
				callback(error);
			});
		}
	}

	setPowerModeSelection(state, callback) {
		var me = this;
		let command = null;
		if (me.currentPowerState) {
			switch (state) {
				case Characteristic.PowerModeSelection.SHOW:
					command = me.switchInfoMenu ? 'MNOPT' : 'MNINF';
					break;
				case Characteristic.PowerModeSelection.HIDE:
					command = 'MNRTN';
					break;
			}
			axios.get(me.url + '/goform/formiPhoneAppDirect.xml?' + command).then(result => {
				me.log.info('Device: %s %s, setPowerModeSelection successful, command: %s', me.host, me.name, command);
				callback(null);
			}).catch(error => {
				me.log.error('Device: %s %s %s, can not setPowerModeSelection command. Might be due to a wrong settings in config, error: %s', me.host, me.name, me.zoneName, error);
				callback(error);
			});
		}
	}

	setVolumeSelector(state, callback) {
		var me = this;
		let command = null;
		let zone = ['MV', 'Z2', 'Z3', 'MV'][me.zoneControl];
		if (me.currentPowerState) {
			switch (state) {
				case Characteristic.VolumeSelector.INCREMENT:
					command = 'UP';
					break;
				case Characteristic.VolumeSelector.DECREMENT:
					command = 'DOWN';
					break;
			}
			axios.get(me.url + '/goform/formiPhoneAppDirect.xml?' + zone + command).then(result => {
				me.log.info('Device: %s %s %s, setVolumeSelector successful, command: %s', me.host, me.name, me.zoneName, command);
				if (me.zoneControl == 3) {
					if (me.zones >= 2) {
						axios.get(me.url + '/goform/formiPhoneAppDirect.xml?' + 'Z2' + command).then(result => {
						}).catch(error => {
							me.log.error('Device: %s %s %s, can not setVolumeSelector command. Might be due to a wrong settings in config, error: %s', me.host, me.name, me.zoneName, error);
						});
					}
					if (me.zones >= 3) {
						axios.get(me.url + '/goform/formiPhoneAppDirect.xml?' + 'Z3' + command).then(result => {
						}).catch(error => {
							me.log.error('Device: %s %s %s, can not setVolumeSelector command. Might be due to a wrong settings in config, error: %s', me.host, me.name, me.zoneName, error);
						});
					}
				}
				callback(null);
			}).catch(error => {
				me.log.error('Device: %s %s %s, can not setVolumeSelector command. Might be due to a wrong settings in config, error: %s', me.host, me.name, me.zoneName, error);
				callback(error);
			});
		}
	}

	setRemoteKey(remoteKey, callback) {
		var me = this;
		let command = null;
		if (me.currentPowerState) {
			switch (remoteKey) {
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
					command = me.switchInfoMenu ? 'MNINF' : 'MNOPT';
					break;
			}
			axios.get(me.url + '/goform/formiPhoneAppDirect.xml?' + command).then(result => {
				me.log.info('Device: %s %s, setRemoteKey successful, command: %s', me.host, me.name, command);
				callback(null);
			}).catch(error => {
				me.log.error('Device: %s %s %s, can not setRemoteKey command. Might be due to a wrong settings in config, error: %s', me.host, me.name, me.zoneName, error);
				callback(error);
			});
		}
	}
};
