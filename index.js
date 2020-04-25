'use strict';

const request = require('request');
const fs = require('fs');
const mkdirp = require('mkdirp');
const xml2js = require('xml2js');
const path = require('path');
const parseString = xml2js.parseString;

let Accessory, Service, Characteristic, UUIDGen;

module.exports = homebridge => {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	Accessory = homebridge.platformAccessory;
	UUIDGen = homebridge.hap.uuid;

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
		this.switchInfoMenu = device.switchInfoMenu;
		this.inputs = device.inputs;

		//get Device info
		this.manufacturer = device.manufacturer || 'Denon/Marantz';
		this.modelName = device.modelName || 'homebridge-denon-tv';
		this.serialNumber = device.serialNumber || 'SN000002';
		this.firmwareRevision = device.firmwareRevision || 'FW000002';

		//setup letiables
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
			request(me.url + '/goform/formMainZone_MainZoneXmlStatusLite.xml', function (error, response, data) {
				if (error) {
					me.log('Device: %s, name: %s, state: Offline', me.host, me.name);
					me.connectionStatus = false;
					return;
				} else if (!me.connectionStatus) {
					me.log('Device: %s, name: %s, state: Online', me.host, me.name);
					me.connectionStatus = true;
					me.getDeviceInfo();
				}
			});
		}.bind(this), 5000);

		//Delay to wait for device info before publish
		setTimeout(this.prepareTvService.bind(this), 1000);
	}

	getDeviceInfo() {
		var me = this;
		setTimeout(() => {
			me.log.debug('Device: %s, requesting information from: %s', me.host, me.name);
			request('http://' + me.host + ':60006/upnp/desc/aios_device/aios_device.xml', function (error, response, data) {
				if (error) {
					me.log.debug('Device: %s, name: %s, getDeviceInfo eror: %s', me.host, me.name, error);
				} else {
					data = data.replace(/:/g, '');
					parseString(data, function (error, result) {
						if (error) {
							me.log.debug('Device %s, getDeviceInfo parse string error: %s', me.host, error);
						} else {
							me.manufacturer = result.root.device[0].manufacturer[0];
							me.modelName = result.root.device[0].modelName[0];
							me.serialNumber = 'SN0000002';
							me.firmwareRevision = 'FW0000002';

							me.log('-------- %s --------', me.name);
							me.log('Manufacturer: %s', me.manufacturer);
							me.log('Model: %s', me.modelName);
							me.log('Serialnumber: %s', me.serialNumber);
							me.log('Firmware: %s', me.firmwareRevision);
							me.log('----------------------------------');
						}
					});
				}
			});
		}, 350);
	}

	//Prepare TV service 
	prepareTvService() {
		this.log.debug('prepareTvService');
		this.tvAccesory = new Accessory(this.name, UUIDGen.generate(this.name));

		this.tvService = new Service.Television(this.name, 'tvService');
		this.tvService.setCharacteristic(Characteristic.ConfiguredName, this.name);
		this.tvService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.tvService.getCharacteristic(Characteristic.Active)
			.on('get', this.getPowerState.bind(this))
			.on('set', this.setPowerState.bind(this));

		this.tvService.getCharacteristic(Characteristic.ActiveIdentifier)
			.on('get', this.getInput.bind(this))
			.on('set', this.setInput.bind(this));

		this.tvService.getCharacteristic(Characteristic.RemoteKey)
			.on('set', this.setRemoteKey.bind(this));

		this.tvService.getCharacteristic(Characteristic.PowerModeSelection)
			.on('set', this.setPowerModeSelection.bind(this));

		this.tvService.getCharacteristic(Characteristic.PictureMode)
			.on('set', this.setPictureMode.bind(this));


		this.tvAccesory
			.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
			.setCharacteristic(Characteristic.Model, this.modelName)
			.setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);

		this.tvAccesory.addService(this.tvService);
		this.prepareTvSpeakerService();
		this.prepareInputServices();

		this.log.debug('Device: %s, publishExternalAccessories: %s', this.host, this.name);
		this.api.publishExternalAccessories('homebridge-denon-tv', [this.tvAccesory]);
	}

	//Prepare speaker service
	prepareTvSpeakerService() {
		this.log.debug('prepareTvSpeakerService');
		this.tvSpeakerService = new Service.TelevisionSpeaker(this.name, 'tvSpeakerService');
		this.tvSpeakerService
			.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
			.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
		this.tvSpeakerService.getCharacteristic(Characteristic.VolumeSelector)
			.on('set', this.setVolumeSelector.bind(this));
		this.tvSpeakerService.getCharacteristic(Characteristic.Volume)
			.on('get', this.getVolume.bind(this))
			.on('set', this.setVolume.bind(this));
		this.tvSpeakerService.getCharacteristic(Characteristic.Mute)
			.on('get', this.getMute.bind(this))
			.on('set', this.setMute.bind(this));

		this.tvAccesory.addService(this.tvSpeakerService);
		this.tvService.addLinkedService(this.tvSpeakerService);
	}

	//Prepare inputs services
	prepareInputServices() {
		this.log.debug('prepareInputServices');
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
			this.log.debug('Device: %s, inputs file does not exist', this.host)
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
			if (inputReference !== undefined && inputReference !== null || inputReference !== ' ') {
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
								this.log.debug('Device: %s, can not write new Input name, error: %s', this.host, error);
							} else {
								this.log('Device: %s, saved new Input successful, name: %s reference: %s', this.host, newInputName, inputReference);
							}
						});
						callback(null, newInputName)
					});
				this.tvAccesory.addService(tempInput);
				this.tvService.addLinkedService(tempInput);
				this.inputReferences.push(inputReference);
			}
		});
	}

	getPowerState(callback) {
		var me = this;
		request(me.url + '/goform/formMainZone_MainZoneXmlStatusLite.xml', function (error, response, data) {
			if (error) {
				me.log.debug('Device: %s, can not get current Power state. Might be due to a wrong settings in config, error: %s', me.host, error);
				callback(error);
			} else {
				parseString(data, function (error, result) {
					if (error) {
						me.log.debug('Device %s, getPowerState parse string error: %s', me.host, error);
						callback(error);
					} else {
						let state = (result.item.Power[0].value[0] == 'ON');
						me.log('Device: %s, get current Power state successful: %s', me.host, state ? 'ON' : 'STANDBY');
						me.currentPowerState = state;
						callback(null, state);
					}
				});
			}
		});
	}

	setPowerState(state, callback) {
		var me = this;
		me.getPowerState(function (error, currentPowerState) {
			if (error) {
				me.log.debug('Device: %s, can not get current Power state. Might be due to a wrong settings in config, error: %s', me.host, error);
				callback(error);
			} else {
				if (state !== currentPowerState) {
					let newState = state ? 'ON' : 'STANDBY';
					request(me.url + '/goform/formiPhoneAppDirect.xml?PW' + newState, function (error, response, data) {
						if (error) {
							me.log.debug('Device: %s, can not set new Power state. Might be due to a wrong settings in config, error: %s', me.host, error);
							callback(error);
						} else {
							me.log('Device: %s, set new Power state successful: %s', me.host, state ? 'ON' : 'STANDBY');
							me.currentPowerState = state;
							callback(null, state);
						}
					});
				}
			}
		});
	}

	getMute(callback) {
		var me = this;
		request(me.url + '/goform/formMainZone_MainZoneXmlStatusLite.xml', function (error, response, data) {
			if (error) {
				me.log.debug('Device: %s, can not get current Mute state. Might be due to a wrong settings in config, error: %s', me.host, error);
				callback(error);
			} else {
				parseString(data, function (error, result) {
					if (error) {
						me.log.debug('Device %s, getMute parse string error: %s', me.host, error);
						callback(error);
					} else {
						let state = (result.item.Mute[0].value[0] == 'ON');
						me.log('Device: %s, get current Mute state successful: %s', me.host, state ? 'ON' : 'OFF');
						me.currentMuteState = state;
						callback(null, state);
					}
				});
			}
		});
	}

	setMute(state, callback) {
		var me = this;
		me.getMute(function (error, currentMuteState) {
			if (error) {
				me.log.debug('Device: %s, can not get current Mute for new state. Might be due to a wrong settings in config, error: %s', me.host, error);
				callback(error);
			} else {
				if (state !== currentMuteState) {
					let newState = state ? 'ON' : 'OFF';
					request(me.url + '/goform/formiPhoneAppDirect.xml?MU' + newState, function (error, response, data) {
						if (error) {
							me.log.debug('Device: %s, can not set new Mute state. Might be due to a wrong settings in config, error: %s', me.host, error);
							callback(error);
						} else {
							me.log('Device: %s, set new Mute state successful: %s', me.host, state ? 'ON' : 'OFF');
							me.currentMuteState = state;
							callback(null, state);
						}
					});
				}
			}
		});
	}

	getVolume(callback) {
		var me = this;
		request(me.url + '/goform/formMainZone_MainZoneXmlStatusLite.xml', function (error, response, data) {
			if (error) {
				me.log.debug('Device: %s, can not get current Volume level. Might be due to a wrong settings in config, error: %s', me.host, error);
				callback(error);
			} else {
				parseString(data, function (error, result) {
					if (error) {
						me.log.debug('Device %s, getVolume parse string error: %s', me.host, error);
						callback(error);
					} else {
						let volume = parseInt(result.item.MasterVolume[0].value[0]) + 80;
						me.log('Device: %s, get current Volume level successful: %s', me.host, volume);
						me.currentVolume = volume;
						callback(null, volume);
					}
				});
			}
		});
	}

	setVolume(volume, callback) {
		var me = this;
		let targetVolume = (volume - 2).toString();
		request(me.url + '/goform/formiPhoneAppDirect.xml?MV' + targetVolume, function (error, response, data) {
			if (error) {
				me.log.debug('Device: %s, can not set new Volume level. Might be due to a wrong settings in config, error: %s', me.host, error);
				callback(error);
			} else {
				me.log('Device: %s, set new Volume level successful: %s', me.host, targetVolume);
				callback(null, volume);
			}
		});
	}

	getInput(callback) {
		var me = this;
		request(me.url + '/goform/formMainZone_MainZoneXmlStatusLite.xml', function (error, response, data) {
			if (error) {
				me.log.debug('Device: %s, can not get current Input. Might be due to a wrong settings in config, error: %s', me.host, error);
				callback(error);
			} else {
				parseString(data, function (error, result) {
					if (error) {
						me.log.debug('Device %s, getInput parse string error: %s', me.host, error);
						callback(error);
					} else {
						let inputReference = result.item.InputFuncSelect[0].value[0];
						for (let i = 0; i < me.inputReferences.length; i++) {
							if (inputReference === me.inputReferences[i]) {
								me.log('Device: %s, get current Input successful: %s', me.host, inputReference);
								me.currentInputReference = inputReference;
								callback(null, i);
							}
						}
					}
				});
			}
		});
	}

	setInput(inputIdentifier, callback) {
		var me = this;
		me.getInput(function (error, currentInputReference) {
			if (error) {
				me.log.debug('Device: %s, can not get current Input. Might be due to a wrong settings in config, error: %s', me.host, error);
				callback(error);
			} else {
				let inputReference = me.inputReferences[inputIdentifier];
				if (inputReference !== currentInputReference) {
					request(me.url + '/goform/formiPhoneAppDirect.xml?SI' + inputReference, function (error, response, data) {
						if (error) {
							me.log.debug('Device: %s, can not set new Input. Might be due to a wrong settings in config, error: %s', me.host, error);
							callback(error);
						} else {
							me.log('Device: %s, set new Input successful: %s', me.host, inputReference);
							me.currentInputReference = inputReference;
							callback(null, inputIdentifier);
						}
					});
				}
			}
		});
	}

	setPictureMode(remoteKey, callback) {
		var me = this;
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
		request(me.url + '/goform/formiPhoneAppDirect.xml?' + command, function (error, response, data) {
			if (error) {
				me.log.debug('Device: %s can not setPictureMode. Might be due to a wrong settings in config, error: %s', me.host, error);
				callback(error);
			} else {
				me.log('Device: %s, setPictureMode successful, remoteKey: %s, command: %s', me.host, remoteKey, command);
				callback(null, remoteKey);
			}
		});
	}

	setPowerModeSelection(remoteKey, callback) {
		var me = this;
		let command = 'MEN?';
		switch (remoteKey) {
			case Characteristic.PowerModeSelection.SHOW:
				command = me.switchInfoMenu ? 'MNOPT' : 'MNINF';
				break;
			case Characteristic.PowerModeSelection.HIDE:
				command = 'MNRTN';
				break;
		}
		request(me.url + '/goform/formiPhoneAppDirect.xml?' + command, function (error, response, data) {
			if (error) {
				me.log.debug('Device: %s can not setPowerModeSelection. Might be due to a wrong settings in config, error: %s', me.host, error);
				callback(error);
			} else {
				me.log('Device: %s, setPowerModeSelection successful, remoteKey: %s, command: %s', me.host, remoteKey, command);
				callback(null, remoteKey);
			}
		});
	}

	setVolumeSelector(remoteKey, callback) {
		var me = this;
		let command = 'MV?';
		switch (remoteKey) {
			case Characteristic.VolumeSelector.INCREMENT:
				command = 'MVUP';
				break;
			case Characteristic.VolumeSelector.DECREMENT:
				command = 'MVDOWN';
				break;
		}
		request(me.url + '/goform/formiPhoneAppDirect.xml?' + command, function (error, response, data) {
			if (error) {
				me.log.debug('Device: %s can not setVolumeSelector. Might be due to a wrong settings in config, error: %s', me.host, error);
				callback(error);
			} else {
				me.log('Device: %s, setVolumeSelector successful, remoteKey: %s, command: %s', me.host, remoteKey, command);
				callback(null, remoteKey);
			}
		});
	}

	setRemoteKey(remoteKey, callback) {
		var me = this;
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
		request(me.url + '/goform/formiPhoneAppDirect.xml?' + command, function (error, response, data) {
			if (error) {
				me.log.debug('Device: %s can not setRemoteKey. Might be due to a wrong settings in config, error: %s', me.host, error);
				callback(error);
			} else {
				me.log('Device: %s, setRemoteKey successful, remoteKey: %s, command: %s', me.host, remoteKey, command);
				callback(null, remoteKey);
			}
		});
	}
};
