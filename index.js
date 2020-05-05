'use strict';

const request = require('request');
const fs = require('fs');
const mkdirp = require('mkdirp');
const xml2js = require('xml2js');
const path = require('path');
const parseString = xml2js.parseString;

let Accessory, Service, Characteristic, UUIDGen, Categories;

module.exports = homebridge => {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	Accessory = homebridge.platformAccessory;
	UUIDGen = homebridge.hap.uuid;
	Categories = homebridge.hap.Accessory.Categories;

	homebridge.registerPlatform('homebridge-denon-tv', 'DenonTv', denonTvPlatform, true);
};

class denonTvPlatform {
	constructor(log, config, api) {
		// only load if configured
		if (!config || !Array.isArray(config.devices)) {
			log('No configuration found for homebridge-denon-tv');
			return;
		}
		this.log = log;
		this.config = config;
		this.devices = config.devices || [];
		this.tvAccessories = [];

		if (api) {
			this.api = api;
			if (this.version < 2.1) {
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
				this.tvAccessories.push(new denonTvDevice(this.log, deviceName, this.api));
			}
		}
	}
	configureAccessory(platformAccessory) {
		this.log.debug('configureAccessory');
		if (this.tvAccessories) {
			this.tvAccessories.push(platformAccessory);
		}
	}
	removeAccessory(platformAccessory) {
		this.log.debug('removeAccessory');
		this.api.unregisterPlatformAccessories('homebridge-denon-tv', 'DenonTv', [platformAccessory]);
	}
}

class denonTvDevice {
	constructor(log, device, api) {
		this.log = log;
		this.api = api;
		this.device = device;

		//device configuration
		this.name = device.name;
		this.host = device.host;
		this.port = device.port;
		this.zoneControl = device.zoneControl;
		this.volumeControl = device.volumeControl;
		this.switchInfoMenu = device.switchInfoMenu;
		this.inputs = device.inputs;

		//get Device info
		this.manufacturer = device.manufacturer || 'Denon/Marantz';
		this.modelName = device.modelName || 'homebridge-denon-tv';
		this.serialNumber = device.serialNumber || 'SN000002';
		this.firmwareRevision = device.firmwareRevision || 'FW000002';

		//setup variables
		this.zoneName = ['Main Zone', 'Zone 2', ' Zone 3'][this.zoneControl];
		this.zoneNumber = ['MainZone_MainZone', 'Zone2_Zone2', 'Zone3_Zone3'][this.zoneControl];
		this.inputReferences = new Array();
		this.connectionStatus = false;
		this.currentPowerState = false;
		this.currentMuteState = false;
		this.currentVolume = 0;
		this.currentInputReference = null;
		this.prefDir = path.join(api.user.storagePath(), 'denonTv');
		this.inputsFile = this.prefDir + '/' + 'inputs_' + this.host.split('.').join('');
		this.devInfoFile = this.prefDir + '/' + 'info_' + this.host.split('.').join('');
		this.url = ('http://' + this.host + ':' + this.port);

		//check if prefs directory ends with a /, if not then add it
		if (this.prefDir.endsWith('/') === false) {
			this.prefDir = this.prefDir + '/';
		}

		//check if the directory exists, if not then create it
		if (fs.existsSync(this.prefDir) === false) {
			mkdirp(this.prefDir);
		}

		//Check net state
		setInterval(function () {
			var me = this;
			request(me.url + '/goform/form' + me.zoneNumber + 'XmlStatusLite.xml', (error, response, data) => {
				if (error) {
					me.log.debug('Device: %s %s %s, state: Offline', me.host, me.name, me.zoneName);
					me.connectionStatus = false;
					return;
				} else {
					if (!me.connectionStatus) {
						me.log('Device: %s %s %s, state: Online', me.host, me.name, me.zoneName);
						me.connectionStatus = true;
						me.getDeviceInfo();
					} else {
						if (me.connectionStatus) {
							me.getDeviceState();
						}
					}
				}
			});
		}.bind(this), 3000);

		//Delay to wait for device info before publish
		setTimeout(this.prepareTelevisionService.bind(this), 1000);
	}

	getDeviceInfo() {
		var me = this;
		me.log.debug('Device: %s %s, requesting Device information.', me.host, me.name);
		request(me.url + '/goform/Deviceinfo.xml', (error, response, data) => {
			if (error) {
				me.log.debug('Device: %s %s, getDeviceInfo eror: %s', me.host, me.name, error);
			} else {
				parseString(data, (error, result) => {
					if (error) {
						me.log.debug('Device %s %s, getDeviceInfo parse string error: %s', me.host, me.name, error);
					} else {
						let brand = ['Denon','Marantz'][result.Device_Info.BrandCode[0]];
						me.manufacturer = brand;
						me.modelName = result.Device_Info.ModelName[0];
						me.serialNumber = result.Device_Info.MacAddress[0];
						me.firmwareRevision = result.Device_Info.UpgradeVersion[0];

						me.log('-------- %s --------', me.name);
						me.log('Manufacturer: %s', me.manufacturer);
						me.log('Model: %s', me.modelName);
						me.log('Zones: %s', result.Device_Info.DeviceZones[0]);
						me.log('Api version: %s', result.Device_Info.CommApiVers[0]);
						me.log('Serialnumber: %s', me.serialNumber);
						me.log('Firmware: %s', me.firmwareRevision);
						me.log('----------------------------------');
					}
				});
			}
		});
	}

	getDeviceState() {
		var me = this;
		request(me.url + '/goform/form' + me.zoneNumber + 'XmlStatusLite.xml', (error, response, data) => {
			if (error) {
				me.log('Device: %s %s %s, getDeviceState error: %s', me.host, me.name, me.zoneName, error);
			} else {
				parseString(data, (error, result) => {
					if (error) {
						me.log.debug('Device %s %s %s, getDeviceState parse string error: %s', me.host, me.name, me.zoneName, error);
					} else {
						let powerState = (result.item.Power[0].value[0] == 'ON');
						if (me.televisionService && (powerState !== me.currentPowerState)) {
							me.televisionService.getCharacteristic(Characteristic.Active).updateValue(powerState);
							me.log('Device: %s %s %s, get current Power state successful: %s', me.host, me.name, me.zoneName, powerState ? 'ON' : 'STANDBY');
							me.currentPowerState = powerState;
						}

						let inputReference = result.item.InputFuncSelect[0].value[0];
						if (me.televisionService && powerState && (me.currentInputReference !== inputReference)) {
							if (me.inputReferences && me.inputReferences.length > 0) {
								let inputIdentifier = me.inputReferences.indexOf(inputReference);
								me.televisionService.getCharacteristic(Characteristic.ActiveIdentifier).updateValue(inputIdentifier);
								me.log('Device: %s %s %s, get current Input successful: %s', me.host, me.name, me.zoneName, inputReference);
								me.currentInputReference = inputReference;
							}
						}

						let muteState = powerState ? (result.item.Mute[0].value[0] == 'ON') : true;
						let volume = parseInt(result.item.MasterVolume[0].value[0]) + 80;
						if (me.speakerService && powerState && (me.currentMuteState !== muteState || me.currentVolume !== volume)) {
							me.speakerService.getCharacteristic(Characteristic.Mute).updateValue(muteState);
							me.speakerService.getCharacteristic(Characteristic.Volume).updateValue(volume);
							if (me.volumeControl && me.volumeService) {
								me.volumeService.getCharacteristic(Characteristic.On).updateValue(!muteState);
								me.volumeService.getCharacteristic(Characteristic.Brightness).updateValue(volume);
							}
							me.log('Device: %s %s %s, get current Mute state: %s', me.host, me.name, me.zoneName, muteState ? 'ON' : 'OFF');
							me.log('Device: %s %s %s, get current Volume level: %s dB ', me.host, me.name, me.zoneName, (volume - 80));
							me.currentMuteState = muteState;
							me.currentVolume = volume;
						}
					}
				});
			}
		});
	}

	//Prepare TV service 
	prepareTelevisionService() {
		this.log.debug('prepareTelevisionService');
		this.UUID = UUIDGen.generate(this.name)
		this.accessory = new Accessory(this.name, this.UUID, Categories.TELEVISION);

		this.televisionService = new Service.Television(this.name, 'televisionService');
		this.televisionService.setCharacteristic(Characteristic.ConfiguredName, this.name);
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


		this.accessory
			.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
			.setCharacteristic(Characteristic.Model, this.modelName)
			.setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);

		this.accessory.addService(this.televisionService);
		this.prepareSpeakerService();
		this.prepareInputsService();
		if (this.volumeControl) {
			this.prepareVolumeService();
		}

		this.log.debug('Device: %s %s, publishExternalAccessories.', this.host, this.name);
		this.api.publishExternalAccessories('homebridge-denon-tv', [this.accessory]);
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
			.on('get', this.getMuteSlider.bind(this));
		this.volumeService.getCharacteristic(Characteristic.Brightness)
			.on('get', this.getVolume.bind(this))
			.on('set', this.setVolume.bind(this));

		this.accessory.addService(this.volumeService);
		this.televisionService.addLinkedService(this.volumeService);
	}

	//Prepare inputs services
	prepareInputsService() {
		this.log.debug('prepareInputsService');
		if (this.inputs === undefined || this.inputs === null || this.inputs.length <= 0) {
			return;
		}

		if (Array.isArray(this.inputs) === false) {
			this.inputs = [this.inputs];
		}

		let savedNames = {};
		try {
			savedNames = JSON.parse(fs.readFileSync(this.inputsFile));
		} catch (err) {
			this.log.debug('Device: %s %s, inputs file does not exist', this.host, this.name)
		}

		this.inputs.forEach((input, i) => {

			//get input reference
			let inputReference = null;

			if (input.reference !== undefined) {
				inputReference = input.reference;
			} else {
				inputReference = input;
			}

			//get input name		
			let inputName = inputReference;

			if (savedNames && savedNames[inputReference]) {
				inputName = savedNames[inputReference];
			} else if (input.name) {
				inputName = input.name;
			}

			//if reference not null or empty add the input
			if (inputReference !== undefined && inputReference !== null || inputReference !== '') {
				inputReference = inputReference.replace(/\s/g, ''); // remove all white spaces from the string

				let tempInput = new Service.InputSource(inputReference, 'input' + i);
				tempInput
					.setCharacteristic(Characteristic.Identifier, i)
					.setCharacteristic(Characteristic.ConfiguredName, inputName)
					.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
					.setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.TV)
					.setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);

				tempInput
					.getCharacteristic(Characteristic.ConfiguredName)
					.on('set', (newInputName, callback) => {
						this.inputs[inputReference] = newInputName;
						fs.writeFile(this.inputsFile, JSON.stringify(this.inputs), (error) => {
							if (error) {
								this.log.debug('Device: %s %s, can not write new Input name, error: %s', this.host, this.name, error);
							} else {
								this.log('Device: %s %s, saved new Input successful, name: %s reference: %s', this.host, this.name, newInputName, inputReference);
							}
						});
						callback(null, newInputName)
					});
				this.accessory.addService(tempInput);
				this.televisionService.addLinkedService(tempInput);
				this.inputReferences.push(inputReference);
			}
		});
	}

	getPower(callback) {
		var me = this;
		let state = me.currentPowerState;
		me.log.debug('Device: %s %s %s, get current Power state successful: %s', me.host, me.name, me.zoneName, state ? 'ON' : 'STANDBY');
		callback(null, state);
	}

	setPower(state, callback) {
		var me = this;
		if (state !== me.currentPowerState) {
			let newState = [(state ? 'PWON' : 'PWSTANDBY'), (state ? 'Z2ON' : 'Z2OFF'), (state ? 'Z3ON' : 'Z3OFF')][me.zoneControl];
			request(me.url + '/goform/formiPhoneAppDirect.xml?' + newState, (error, response, data) => {
				if (error) {
					me.log.debug('Device: %s %s %s, can not set new Power state. Might be due to a wrong settings in config, error: %s', me.host, me.name, me.zoneName, error);
					callback(error);
				} else {
					me.log('Device: %s %s %s, set new Power state successful: %s', me.host, me.name, me.zoneName, state ? 'ON' : 'STANDBY');
					callback(null, state);
				}
			});
		}
	}

	getMute(callback) {
		var me = this;
		let state = me.currentPowerState ? me.currentMuteState : true;
		me.log.debug('Device: %s %s %s, get current Mute state successful: %s', me.host, me.name, me.zoneName, state ? 'ON' : 'OFF');
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
		let newState = [(state ? 'MUON' : 'MUOFF'), (state ? 'Z2MUON' : 'Z2MUOFF'), (state ? 'Z3MUON' : 'Z3MUOFF')][me.zoneControl];
		if (state !== me.currentMuteState) {
			request(me.url + '/goform/formiPhoneAppDirect.xml?' + newState, (error, response, data) => {
				if (error) {
					me.log.debug('Device: %s %s %s, can not set new Mute state. Might be due to a wrong settings in config, error: %s', me.host, me.name, me.zoneName, error);
					callback(error);
				} else {
					me.log('Device: %s %s %s, set new Mute state successful: %s', me.host, me.name, me.zoneName, state ? 'ON' : 'OFF');
					callback(null, state);
				}
			});
		}
	}

	getVolume(callback) {
		var me = this;
		let volume = me.currentVolume;
		me.log.debug('Device: %s %s %s, get current Volume level successful: %s dB', me.host, me.name, me.zoneName, (volume - 80));
		callback(null, volume);
	}

	setVolume(volume, callback) {
		var me = this;
		let zone = ['MV', 'Z2', 'Z3'][me.zoneControl];
		let targetVolume = (volume - 2);
		request(me.url + '/goform/formiPhoneAppDirect.xml?' + zone + targetVolume, (error, response, data) => {
			if (error) {
				me.log.debug('Device: %s %s %s, can not set new Volume level. Might be due to a wrong settings in config, error: %s', me.host, me.name, me.zoneName, error);
				callback(error);
			} else {
				me.log('Device: %s %s %s, set new Volume level successful: %s', me.host, me.name, me.zoneName, targetVolume);
				callback(null, volume);
			}
		});
	}

	getInput(callback) {
		var me = this;
		let inputReference = me.currentInputReference;
		if (!me.connectionStatus || inputReference === undefined || inputReference === null) {
			me.televisionService
				.getCharacteristic(Characteristic.ActiveIdentifier)
				.updateValue(0);
			callback(null);
		} else {
			let inputIdentifier = me.inputReferences.indexOf(inputReference);
			if (inputReference === me.inputReferences[inputIdentifier]) {
				me.televisionService
					.getCharacteristic(Characteristic.ActiveIdentifier)
					.updateValue(inputIdentifier);
				me.log.debug('Device: %s %s %s, get current Input successful: %s', me.host, me.name, me.zoneName, inputReference);
			}
			callback(null, inputIdentifier);
		}
	}

	setInput(inputIdentifier, callback) {
		var me = this;
		let zone = ['SI', 'Z2', 'Z3'][me.zoneControl];
		let inputReference = me.inputReferences[inputIdentifier];
		if (inputReference !== me.currentInputReference) {
			request(me.url + '/goform/formiPhoneAppDirect.xml?' + zone + inputReference, (error, response, data) => {
				if (error) {
					me.log.debug('Device: %s %s %s, can not set new Input. Might be due to a wrong settings in config, error: %s', me.host, me.name, me.zoneName, error);
					callback(error);
				} else {
					me.log('Device: %s %s %s, set new Input successful: %s', me.host, me.name, me.zoneName, inputReference);
					callback(null, inputIdentifier);
				}
			});
		}
	}

	setPictureMode(remoteKey, callback) {
		var me = this;
		if (me.currentPowerState) {
			let command;
			switch (remoteKey) {
				case Characteristic.PictureMode.OTHER:
					command = 'INFO';
					break;
				case Characteristic.PictureMode.STANDARD:
					command = 'BACK';
					break;
				case Characteristic.PictureMode.CALIBRATED:
					command = 'INFO';
					break;
				case Characteristic.PictureMode.CALIBRATED_DARK:
					command = 'BACK';
					break;
				case Characteristic.PictureMode.VIVID:
					command = 'INFO';
					break;
				case Characteristic.PictureMode.GAME:
					command = 'BACK';
					break;
				case Characteristic.PictureMode.COMPUTER:
					command = 'INFO';
					break;
				case Characteristic.PictureMode.CUSTOM:
					command = 'BACK';
					break;
			}
			request(me.url + '/goform/formiPhoneAppDirect.xml?' + command, (error, response, data) => {
				if (error) {
					me.log.debug('Device: %s %s, can not setPictureMode. Might be due to a wrong settings in config, error: %s', me.host, me.name, error);
					callback(error);
				} else {
					me.log('Device: %s %s, setPictureMode successful, remoteKey: %s, command: %s', me.host, me.name, remoteKey, command);
					callback(null, remoteKey);
				}
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
			request(me.url + '/goform/formiPhoneAppDirect.xml?' + command, (error, response, data) => {
				if (error) {
					me.log.debug('Device: %s %s, can not setPowerModeSelection. Might be due to a wrong settings in config, error: %s', me.host, me.name, error);
					callback(error);
				} else {
					me.log('Device: %s %s, setPowerModeSelection successful, remoteKey: %s, command: %s', me.host, me.name, remoteKey, command);
					callback(null, remoteKey);
				}
			});
		}
	}

	setVolumeSelector(remoteKey, callback) {
		var me = this;
		if (me.currentPowerState) {
			let zone = ['MV', 'Z2', 'Z3'][this.zoneControl];
			let command = 'MV?';
			switch (remoteKey) {
				case Characteristic.VolumeSelector.INCREMENT:
					command = 'UP';
					break;
				case Characteristic.VolumeSelector.DECREMENT:
					command = 'DOWN';
					break;
			}
			request(me.url + '/goform/formiPhoneAppDirect.xml?' + zone + command, (error, response, data) => {
				if (error) {
					me.log.debug('Device: %s %s %s, can not setVolumeSelector. Might be due to a wrong settings in config, error: %s', me.host, me.name, me.zoneName, error);
					callback(error);
				} else {
					me.log('Device: %s %s %s, setVolumeSelector successful, remoteKey: %s, command: %s', me.host, me.name, me.zoneName, remoteKey, command);
					callback(null, remoteKey);
				}
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
			request(me.url + '/goform/formiPhoneAppDirect.xml?' + command, (error, response, data) => {
				if (error) {
					me.log.debug('Device: %s %s, can not setRemoteKey. Might be due to a wrong settings in config, error: %s', me.host, me.name, error);
					callback(error);
				} else {
					me.log('Device: %s %s, setRemoteKey successful, remoteKey: %s, command: %s', me.host, me.name, remoteKey, command);
					callback(null, remoteKey);
				}
			});
		}
	}
};
