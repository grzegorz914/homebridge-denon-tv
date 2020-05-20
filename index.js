'use strict';

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const parseStringPromise = require('xml2js').parseStringPromise;

const PLUGIN_NAME = 'homebridge-denon-tv';
const PLATFORM_NAME = 'DenonTv';
const ZONE_NAME = ['Main Zone', 'Zone 2', 'Zone 3'];
const ZONE_NUMBER = ['MainZone_MainZone', 'Zone2_Zone2', 'Zone3_Zone3'];

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
		this.devices = config.devices || [];
		this.accessories = [];
		if (api) {
			this.api = api;
			if (api.version < 2.1) {
				throw new Error('Unexpected API version.');
			}
			this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));
		}
	}

	didFinishLaunching() {
		this.log.debug('didFinishLaunching');
		for (let i = 0, len = this.devices.length; i < len; i++) {
			let deviceName = this.devices[i];
			if (!deviceName.name) {
				this.log.warn('Device Name Missing')
			} else {
				this.accessories.push(new denonTvDevice(this.log, deviceName, this.api));
			}
		}
	}
	configureAccessory(platformAccessory) {
		this.log.debug('configureAccessory');
		if (this.accessories) {
			this.accessories.push(platformAccessory);
		}
	}
	removeAccessory(platformAccessory) {
		this.log.debug('removeAccessory');
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
		this.zoneControl = config.zoneControl;
		this.allZonesControl = config.allZonesControl;
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
		this.zoneName = this.allZonesControl ? 'All Zones' : ZONE_NAME[this.zoneControl];
		this.zoneNumber = this.allZonesControl ? 'MainZone_MainZone' : ZONE_NUMBER[this.zoneControl];

		//setup variables
		this.deviceStatusResponse = null;
		this.inputReferences = new Array();
		this.inputNames = new Array();
		this.inputTypes = new Array();
		this.inputModes = new Array();
		this.connectionStatus = false;
		this.currentPowerState = false;
		this.currentMuteState = false;
		this.currentVolume = 0;
		this.currentInputReference = null;
		this.currentInputName = null;
		this.currentSurroundModeReference = null;
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
					this.log.debug('Device: %s %s, create directory: %s, error: %s', this.host, this.name, this.prefDir, error);
				}
			});
		}

		//Check net state
		setInterval(function () {
			axios.get(this.url + '/goform/form' + this.zoneNumber + 'XmlStatusLite.xml').then(response => {
				parseStringPromise(response.data).then(result => {
					this.deviceStatusResponse = result;
				}).catch(error => {
					this.log.debug('Device %s %s, get device status parse string error: %s', this.host, this.name, error);
				});
				if (!this.connectionStatus) {
					this.log('Device: %s %s %s, state: Online', this.host, this.name, this.zoneName);
					this.connectionStatus = true;
					setTimeout(this.getDeviceInfo.bind(this), 750);
				} else {
					this.getDeviceState();
				}
			}).catch(error => {
				this.log.debug('Device: %s %s %s, state: Offline', this.host, this.name, this.zoneName);
				this.connectionStatus = false;
				this.currentPowerState = false;
				return;
			});
		}.bind(this), 2000);

		//Delay to wait for device info before publish
		setTimeout(this.prepareTelevisionService.bind(this), 1500);
	}

	getDeviceInfo() {
		var me = this;
		me.log.debug('Device: %s %s, requesting Device information.', me.host, me.name);
		axios.get(me.url + '/goform/Deviceinfo.xml').then(response => {
			parseStringPromise(response.data).then(result => {
				me.log.debug('Device: %s %s, get Device info successful: %s', me.host, me.name, JSON.stringify(result, null, 2));
				me.manufacturer = ['Denon', 'Marantz'][result.Device_Info.BrandCode[0]];
				me.modelName = result.Device_Info.ModelName[0];
				me.serialNumber = result.Device_Info.MacAddress[0];
				me.firmwareRevision = result.Device_Info.UpgradeVersion[0];
				me.zones = result.Device_Info.DeviceZones[0];
				me.apiVersion = result.Device_Info.CommApiVers[0];
				me.log('-------- %s --------', me.name);
				me.log('Manufacturer: %s', me.manufacturer);
				me.log('Model: %s', me.modelName);
				me.log('Zones: %s', me.zones);
				me.log('Api version: %s', me.apiVersion);
				me.log('Serialnumber: %s', me.serialNumber);
				me.log('Firmware: %s', me.firmwareRevision);
				me.log('----------------------------------');
				fs.writeFile(me.devInfoFile, JSON.stringify(result, null, 2), (error) => {
					if (error) {
						me.log.debug('Device: %s %s, could not write devInfoFile, error: %s', me.host, me.name, error);
					} else {
						me.log('Device: %s %s, devInfoFile saved successful in: %s', me.host, me.name, me.prefDir);
					}
				});
			}).catch(error => {
				me.log.debug('Device %s %s, getDeviceInfo parse string error: %s', me.host, me.name, error);
			});
		}).catch(error => {
			me.log.debug('Device: %s %s, getDeviceInfo eror: %s', me.host, me.name, error);
		});
	}

	getDeviceState() {
		var me = this;
		me.log.debug('Device: %s %s, requesting Device state.', me.host, me.name);
		let result = me.deviceStatusResponse;
		let powerState = (result.item.Power[0].value[0] == 'ON');
		me.log.debug('Device: %s %s %s, get current Power state successful: %s', me.host, me.name, me.zoneName, powerState ? 'ON' : 'OFF');
		me.currentPowerState = powerState;
		if (me.televisionService) {
			me.televisionService.updateCharacteristic(Characteristic.Active, powerState);
		}

		let inputReference = result.item.InputFuncSelect[0].value[0];
		let inputIdentifier = me.inputReferences.indexOf(inputReference);
		me.log.debug('Device: %s %s %s, get current Input successful: %s', me.host, me.name, me.zoneName, inputReference);
		me.currentInputReference = inputReference;
		if (me.televisionService) {
			me.televisionService.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);

		}

		let mute = (result.item.Mute[0].value[0] == 'ON');
		let muteState = powerState ? mute : true;
		let volume = parseInt(result.item.MasterVolume[0].value[0]) + 80;
		me.log.debug('Device: %s %s %s, get current Mute state: %s', me.host, me.name, me.zoneName, muteState ? 'ON' : 'OFF');
		me.log.debug('Device: %s %s %s, get current Volume level: %s dB ', me.host, me.name, me.zoneName, (volume - 80));
		me.currentMuteState = muteState;
		me.currentVolume = volume;
		if (me.speakerService) {
			me.speakerService.updateCharacteristic(Characteristic.Mute, muteState);
			me.speakerService.updateCharacteristic(Characteristic.Volume, volume);
			if (me.volumeControl && me.volumeService) {
				me.volumeService.updateCharacteristic(Characteristic.On, !muteState);
				me.volumeService.updateCharacteristic(Characteristic.Brightness, volume);
			}
		}
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
		if (this.volumeControl) {
			this.prepareVolumeService();
		}
		if (this.soundModeControl) {
			this.prepareSoundModesService();
		}

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
		this.volumeService = new Service.Lightbulb(this.name + ' Volume', 'volumeService');
		this.volumeService.getCharacteristic(Characteristic.On)
			.on('get', this.getMuteSlider.bind(this))
			.on('set', (newValue, callback) => {
				this.speakerService.setCharacteristic(Characteristic.Mute, !newValue);
				callback(null);
			});
		this.volumeService.getCharacteristic(Characteristic.Brightness)
			.on('get', this.getVolume.bind(this))
			.on('set', this.setVolume.bind(this));

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

			//get input name		
			let inputName = input.name;

			//get input reference
			let inputReference = input.reference;

			//get input type
			let inputType = input.type;

			//get input mode
			let inputMode = input.mode;

			if (savedNames && savedNames[inputReference]) {
				inputName = savedNames[inputReference];
			} else {
				inputName = input.name;
			}

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
							this.log.debug('Device: %s %s, can not write new Input name, error: %s', this.host, this.name, error);
						} else {
							this.log('Device: %s %s, saved new Input successful, name: %s reference: %s', this.host, this.name, name, inputReference);
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

	getPower(callback) {
		var me = this;
		let state = me.currentPowerState;
		me.log('Device: %s %s %s, get current Power state successful: %s', me.host, me.name, me.zoneName, state ? 'ON' : 'OFF');
		callback(null, state);
	}

	setPower(state, callback) {
		var me = this;
		if (state !== me.currentPowerState) {
			let newState = me.allZonesControl ? (state ? 'PWON' : 'PWSTANDBY') : [(state ? 'ZMON' : 'ZMOFF'), (state ? 'Z2ON' : 'Z2OFF'), (state ? 'Z3ON' : 'Z3OFF')][me.zoneControl];
			axios.get(me.url + '/goform/formiPhoneAppDirect.xml?' + newState).then(response => {
				me.log('Device: %s %s %s, set new Power state successful: %s', me.host, me.name, me.zoneName, state ? 'ON' : 'OFF');
				callback(null);
			}).catch(error => {
				me.log.debug('Device: %s %s %s, can not set new Power state. Might be due to a wrong settings in config, error: %s', me.host, me.name, me.zoneName, error);
				callback(error);
			});
		}
	}

	getMute(callback) {
		var me = this;
		let state = me.currentPowerState ? me.currentMuteState : true;
		me.log('Device: %s %s %s, get current Mute state successful: %s', me.host, me.name, me.zoneName, state ? 'ON' : 'OFF');
		callback(null, state);
	}

	getMuteSlider(callback) {
		var me = this;
		let state = me.currentPowerState ? !me.currentMuteState : false;
		me.log.debug('Device: %s %s %s, get current Mute state successful: %s', me.host, me.name, me.zoneName, !state ? 'ON' : 'OFF');
		callback(null, state);
	}

	setMute(state, callback) {
		var me = this;
		if (me.currentPowerState) {
			let newState = me.allZonesControl ? (me.currentMuteState ? 'MUON' : 'MUOFF') : [(state ? 'MUON' : 'MUOFF'), (me.currentMuteState ? 'Z2MUON' : 'Z2MUOFF'), (me.currentMuteState ? 'Z3MUON' : 'Z3MUOFF')][me.zoneControl];
			axios.get(me.url + '/goform/formiPhoneAppDirect.xml?' + newState).then(response => {
				me.log('Device: %s %s %s, set new Mute state successful: %s', me.host, me.name, me.zoneName, state ? 'ON' : 'OFF');
				if (me.allZonesControl) {
					if (me.zones >= 2) {
						newState = state ? 'Z2MUON' : 'Z2MUOFF';
						axios.get(me.url + '/goform/formiPhoneAppDirect.xml?' + newState).then(response => {
						}).catch(error => {
							me.log.debug('Device: %s %s %s, can not set new Mute state. Might be due to a wrong settings in config, error: %s', me.host, me.name, 'Zone 2', error);
						});
					}
					if (me.zones >= 3) {
						newState = state ? 'Z3MUON' : 'Z3MUOFF';
						axios.get(me.url + '/goform/formiPhoneAppDirect.xml?' + newState).then(response => {
						}).catch(error => {
							me.log.debug('Device: %s %s %s, can not set new Mute state. Might be due to a wrong settings in config, error: %s', me.host, me.name, 'Zone 3', error);
						});
					}
				}
				callback(null);
			}).catch(error => {
				me.log.debug('Device: %s %s %s, can not set new Mute state. Might be due to a wrong settings in config, error: %s', me.host, me.name, me.zoneName, error);
				callback(error);
			});
		}
	}

	getVolume(callback) {
		var me = this;
		let volume = me.currentVolume;
		me.log('Device: %s %s %s, get current Volume level successful: %s dB', me.host, me.name, me.zoneName, (volume - 80));
		callback(null, volume);
	}

	setVolume(volume, callback) {
		var me = this;
		let zone = me.allZonesControl ? 'MV' : (['MV', 'Z2', 'Z3'][me.zoneControl]);
		let targetVolume = (volume - 2);
		axios.get(me.url + '/goform/formiPhoneAppDirect.xml?' + zone + targetVolume).then(response => {
			me.log('Device: %s %s %s, set new Volume level successful: %s', me.host, me.name, me.zoneName, targetVolume);
			if (me.allZonesControl) {
				if (me.zones >= 2) {
					axios.get(me.url + '/goform/formiPhoneAppDirect.xml?' + 'Z2' + targetVolume).then(response => {
					}).catch(error => {
						me.log.debug('Device: %s %s %s, can not set new Volume level. Might be due to a wrong settings in config, error: %s', me.host, me.name, 'Zone 2', error);
					});
				}
				if (me.zones >= 3) {
					axios.get(me.url + '/goform/formiPhoneAppDirect.xml?' + 'Z3' + targetVolume).then(response => {
					}).catch(error => {
						me.log.debug('Device: %s %s %s, can not set new Volume level. Might be due to a wrong settings in config, error: %s', me.host, me.name, 'Zone 3', error);
					});
				}
			}
			callback(null);
		}).catch(error => {
			me.log.debug('Device: %s %s %s, can not set new Volume level. Might be due to a wrong settings in config, error: %s', me.host, me.name, me.zoneName, error);
			callback(error);
		});
	}

	getInput(callback) {
		var me = this;
		let inputReference = me.currentInputReference;
		let inputIdentifier = me.inputReferences.indexOf(inputReference);
		if (!me.currentPowerState || inputReference === undefined || inputReference === null || inputReference === '') {
			me.televisionService
				.updateCharacteristic(Characteristic.ActiveIdentifier, 0);
			callback(null, 0);
		} else {
			if (inputReference === me.inputReferences[inputIdentifier]) {
				me.televisionService
					.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
				me.log('Device: %s %s %s, get current Input successful: %s', me.host, me.name, me.zoneName, inputReference);
			}
			callback(null, inputIdentifier);
		}
	}

	setInput(inputIdentifier, callback) {
		var me = this;
		setTimeout(() => {
			let inputName = me.inputNames[inputIdentifier];
			let inputReference = me.inputReferences[inputIdentifier];
			let inputMode = me.inputModes[inputIdentifier];
			let zone = me.allZonesControl ? inputMode : [inputMode, 'Z2', 'Z3'][me.zoneControl];
			axios.get(me.url + '/goform/formiPhoneAppDirect.xml?' + zone + inputReference).then(response => {
				me.log('Device: %s %s %s, set new Input successful: %s %s', me.host, me.name, me.zoneName, inputName, inputReference);
				if (me.allZonesControl) {
					if (me.zones >= 2) {
						axios.get(me.url + '/goform/formiPhoneAppDirect.xml?' + 'Z2' + inputReference).then(response => {
						}).catch(error => {
							me.log.debug('Device: %s %s %s, can not set new Input. Might be due to a wrong settings in config, error: %s', me.host, me.name, me.zoneName, error);
						});
					}
					if (me.zones >= 3) {
						axios.get(me.url + '/goform/formiPhoneAppDirect.xml?' + 'Z3' + inputReference).then(response => {
						}).catch(error => {
							me.log.debug('Device: %s %s %s, can not set new Input. Might be due to a wrong settings in config, error: %s', me.host, me.name, me.zoneName, error);
						});
					}
				}
				callback(null);
			}).catch(error => {
				me.log.debug('Device: %s %s %s, can not set new Input. Might be due to a wrong settings in config, error: %s', me.host, me.name, me.zoneName, error);
				callback(error);
			});
		}, 250);
	}

	setPictureMode(remoteKey, callback) {
		var me = this;
		if (me.currentPowerState) {
			let command = '';
			switch (remoteKey) {
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
			axios.get(me.url + '/goform/formiPhoneAppDirect.xml?' + command).then(response => {
				me.log('Device: %s %s, setPictureMode successful, command: %s', me.host, me.name, command);
				callback(null);
			}).catch(error => {
				me.log.debug('Device: %s %s %s, can not setPictureMode command. Might be due to a wrong settings in config, error: %s', me.host, me.name, me.zoneName, error);
				callback(error);
			});
		}
	}

	setPowerModeSelection(remoteKey, callback) {
		var me = this;
		if (me.currentPowerState) {
			let command = 'MEN?';
			switch (remoteKey) {
				case Characteristic.PowerModeSelection.SHOW:
					command = me.switchInfoMenu ? 'MNOPT' : 'MNINF';
					break;
				case Characteristic.PowerModeSelection.HIDE:
					command = 'MNRTN';
					break;
			}
			axios.get(me.url + '/goform/formiPhoneAppDirect.xml?' + command).then(response => {
				me.log('Device: %s %s, setPowerModeSelection successful, command: %s', me.host, me.name, command);
				callback(null);
			}).catch(error => {
				me.log.debug('Device: %s %s %s, can not setPowerModeSelection command. Might be due to a wrong settings in config, error: %s', me.host, me.name, me.zoneName, error);
				callback(error);
			});
		}
	}

	setVolumeSelector(remoteKey, callback) {
		var me = this;
		let zone = me.allZonesControl ? 'MV' : ['MV', 'Z2', 'Z3'][me.zoneControl];
		if (me.currentPowerState) {
			let command = 'MV?';
			switch (remoteKey) {
				case Characteristic.VolumeSelector.INCREMENT:
					command = 'UP';
					break;
				case Characteristic.VolumeSelector.DECREMENT:
					command = 'DOWN';
					break;
			}
			axios.get(me.url + '/goform/formiPhoneAppDirect.xml?' + zone + command).then(response => {
				me.log('Device: %s %s %s, setVolumeSelector successful, command: %s', me.host, me.name, me.zoneName, command);
				if (me.allZonesControl) {
					if (me.zones >= 2) {
						axios.get(me.url + '/goform/formiPhoneAppDirect.xml?' + 'Z2' + command).then(response => {
						}).catch(error => {
							me.log.debug('Device: %s %s %s, can not setVolumeSelector command. Might be due to a wrong settings in config, error: %s', me.host, me.name, me.zoneName, error);
						});
					}
					if (me.zones >= 3) {
						axios.get(me.url + '/goform/formiPhoneAppDirect.xml?' + 'Z3' + command).then(response => {
						}).catch(error => {
							me.log.debug('Device: %s %s %s, can not setVolumeSelector command. Might be due to a wrong settings in config, error: %s', me.host, me.name, me.zoneName, error);
						});
					}
				}
				callback(null);
			}).catch(error => {
				me.log.debug('Device: %s %s %s, can not setVolumeSelector command. Might be due to a wrong settings in config, error: %s', me.host, me.name, me.zoneName, error);
				callback(error);
			});
		}
	}

	setRemoteKey(remoteKey, callback) {
		var me = this;
		if (me.currentPowerState) {
			let command = 'MEN?';
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
			axios.get(me.url + '/goform/formiPhoneAppDirect.xml?' + command).then(response => {
				me.log('Device: %s %s, setRemoteKey successful, command: %s', me.host, me.name, command);
				callback(null);
			}).catch(error => {
				me.log.debug('Device: %s %s %s, can not setRemoteKey command. Might be due to a wrong settings in config, error: %s', me.host, me.name, me.zoneName, error);
				callback(error);
			});
		}
	}
};
