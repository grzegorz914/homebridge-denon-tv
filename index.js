const request = require('request');
const ppath = require('persist-path');
const fs = require('fs');
const mkdirp = require('mkdirp');
const xml2js = require('xml2js');
const parseString = xml2js.parseString;
const responseDelay = 1000;

var Accessory, Service, Characteristic, UUIDGen;

module.exports = homebridge => {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	Accessory = homebridge.platformAccessory;
	UUIDGen = homebridge.hap.uuid;

	homebridge.registerPlatform('homebridge-denon-tv', 'DenonTv', denonTvPlatform, true);
};


class denonTvPlatform {
	constructor(log, config, api) {
		this.log = log;
		this.config = config;
		this.api = api;

		this.tvAccessories = [];

		this.checkStateInterval = config.checkStateInterval || 5;
		this.checkIntervel = this.checkStateInterval * 1000;
		this.devices = config.devices || [];

		if (this.version < 2.1) {
			throw new Error('Unexpected API version.');
		}

		for (var i in this.devices) {
			this.tvAccessories.push(new denonTvDevice(log, this.devices[i], api));
		}

		this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));
	}
	configureAccessory() { }
	removeAccessory() { }
	didFinishLaunching() {
		var me = this;
		setTimeout(function () {
			me.log.debug('didFinishLaunching');
		},
			(this.devices.length + 1) * responseDelay);
	}
}

class denonTvDevice {
	constructor(log, device, api) {
		this.log = log;
		this.api = api;
		this.device = device;

		// devices configuration
		this.name = device.name;
		this.host = device.host;
		this.port = device.port || 8080;
		this.switchInfoMenu = device.switchInfoMenu;
		this.inputs = device.inputs;

		//get Device info
		this.getDeviceInfo();
		this.manufacturer = device.manufacturer || 'Denon/Marantz';
		this.modelName = device.model || 'homebridge-denon-tv';
		this.serialNumber = device.serialNumber || 'SN000001';
		this.firmwareRevision = device.firmwareRevision || 'FW000002';

		//setup variables
		this.inputReferences = new Array();

		this.prefsDir = ppath('denonTv/');
		this.inputsFile = this.prefsDir + 'inputs_' + this.host.split('.').join('');

		//check if prefs directory ends with a /, if not then add it
		if (this.prefsDir.endsWith('/') === false) {
			this.prefsDir = this.prefsDir + '/';
		}

		// check if the directory exists, if not then create it
		if (fs.existsSync(this.prefsDir) === false) {
			mkdirp(this.prefsDir);
		}

		//Delay to wait for device info
		setTimeout(this.prepereTvService.bind(this), responseDelay);
	}

	getDeviceInfo() {
		var me = this;
		request('http://' + this.host + ':60006/upnp/desc/aios_device/aios_device.xml', function (error, response, body) {
			if (error) {
				me.log.debug('Device: %s, can not request getDeviceInfo, error: %s', me.host, error);
			} else {
				body = body.replace(/:/g, '');
				parseString(body, function (error, result) {
					if (error) {
						me.log.debug('Device %s, getDeviceInfo parse string error: %s', me.host, error);
					} else {
						try {
							me.manufacturer = result.root.device[0].manufacturer[0];
							me.modelName = result.root.device[0].modelName[0];
							me.serialNumber = 'SN000001';
							me.firmwareRevision = 'FW000002';

							me.log('-----Device %s-----', me.host);
							me.log('Manufacturer: %s', me.manufacturer);
							me.log('Model: %s', me.modelName);
							me.log('Serialnumber: %s', me.serialNumber);
							me.log('Firmware: %s', me.firmwareRevision);
							me.log('Device: %s, getDeviceInfo succesfull.', me.host);
						} catch (error) {
							me.log.debug('Device: %s, getDeviceInfo error: %s.', me.host, error);
						}
					}
				});
			}
		});
	}

	//Start of TV integration service 
	prepereTvService() {
		this.log.debug('prepereTvService');
		this.tvAccesory = new Accessory(this.name, UUIDGen.generate(this.name + this.host));

		this.tvService = new Service.Television(this.name, 'tvService');
		this.tvService.setCharacteristic(Characteristic.ConfiguredName, this.name);
		this.tvService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.tvService.getCharacteristic(Characteristic.Active)
			.on('get', this.getPowerState.bind(this))
			.on('set', this.setPowerState.bind(this));

		this.tvService.getCharacteristic(Characteristic.ActiveIdentifier)
			.on('set', (inputIdentifier, callback) => {
				this.setInput(callback, this.inputReferences[inputIdentifier]);
			})
			.on('get', this.getInput.bind(this));

		this.tvService.getCharacteristic(Characteristic.RemoteKey)
			.on('set', this.remoteKeyPress.bind(this));

		this.tvService.getCharacteristic(Characteristic.PowerModeSelection)
			.on('set', this.setPowerMode.bind(this));


		this.tvAccesory
			.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
			.setCharacteristic(Characteristic.Model, this.modelName)
			.setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);

		this.tvAccesory.addService(this.tvService);

		this.prepereTvSpeakerService();
		this.prepareInputServices();


		this.log.debug('publishExternalAccessories for device: %s', this.host);
		this.api.publishExternalAccessories('homebridge-openwebif-tv', [this.tvAccesory]);

	}

	prepereTvSpeakerService() {
		this.log.debug('prepereTvSpeakerService');
		this.tvSpeakerService = new Service.TelevisionSpeaker(this.name, 'tvSpeakerService');
		this.tvSpeakerService
			.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
			.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
		this.tvSpeakerService.getCharacteristic(Characteristic.VolumeSelector)
			.on('set', this.volumeSelectorPress.bind(this));
		this.tvSpeakerService.getCharacteristic(Characteristic.Volume)
			.on('get', this.getVolume.bind(this))
			.on('set', this.setVolume.bind(this));
		this.tvSpeakerService.getCharacteristic(Characteristic.Mute)
			.on('get', this.getMute.bind(this))
			.on('set', this.setMute.bind(this));

		this.tvAccesory.addService(this.tvSpeakerService);
		this.tvService.addLinkedService(this.tvSpeakerService);
	}

	prepareInputServices() {
		this.log.debug('prepareInputServices');
		if (this.inputs === undefined || this.inputs === null || this.inputs.length <= 0) {
			return;
		}

		if (Array.isArray(this.inputs) === false) {
			this.inputs = [this.inputs];
		}

		let savedNames = {};

		this.inputs.forEach((input, i) => {

			// get input reference
			let inputReference = null;

			if (input.reference !== undefined) {
				inputReference = input.reference;
			} else {
				inputReference = input;
			}

			// get input name		
			let inputName = inputReference;

			if (savedNames && savedNames[inputReference]) {
				inputName = savedNames[inputReference];
			} else if (input.name) {
				inputName = input.name;
			}

			// if reference not null or empty add the input
			if (inputReference !== undefined && inputReference !== null && inputReference !== '') {
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
					.on('set', (name, callback) => {
						this.inputs[inputReference] = name;
						fs.writeFile(this.inputsFile, JSON.stringify(this.inputs), (error) => {
							if (error) {
								this.log.debug('Device: %s, can not write new input name: %s', me.host, error);
							} else {
								this.log('Device: %s, successfully saved new input name: %s reference: %s', me.host, name, inputReference);
							}
						});
						callback()
					});
				this.tvAccesory.addService(tempInput);
				if (!tempInput.linked)
					this.tvService.addLinkedService(tempInput);
				this.inputReferences.push(inputReference);
			}

		});
	}

	httpGET(apipath, callback) {
		var me = this;
		me.httpRequest('http://' + me.host + ':' + me.port + apipath, '', 'GET', function (error, response, responseBody) {
			if (error) {
				me.log.debug('Device: %s, not reachable.', me.host);
				callback(error);
				return;
			} else {
				try {
					var result = parseString(responseBody, function (error, data) {
						if (error) {
							me.log.debug('Device: %s, parse string result error: %s', me.host, error);
							callback(error);
						} else {
							me.log.debug('Device: %s, parse string result: %s', me.host, data);
							callback(null, data);
						}
					});
				} catch (e) {
					callback(e, null);
					me.log.debug('error: %s', e);
				}
			}
			me.log.info('Device: %s, get data successful.', me.host);
		}.bind(this));
	}

	httpRequest(url, body, apipath, callback) {
		request({
			url: url,
			body: body,
			method: apipath
		},
			function (error, response, body) {
				callback(error, response, body);
			});
	}

	getPowerState(callback) {
		var me = this;
		this.httpGET('/goform/formMainZone_MainZoneXmlStatusLite.xml', function (error, data) {
			if (error) {
				me.log.debug('Device: %s, can not get current Power state. Might be due to a wrong settings in config, error: %s', me.host, error);
				if (callback)
					callback(error);
			} else {
				var state = (data.item.Power[0].value[0] == 'ON');
				me.log('Device: %s, get current Power state successfull %s', me.host, state ? 'ON' : 'STANDBY');
				callback(null, state);
			}
		});
	}

	setPowerState(state, callback) {
		var me = this;
		var newState = state ? 'ON' : 'STANDBY';
		me.httpGET('/goform/formiPhoneAppDirect.xml?PW' + newState, function (error) {
			if (error) {
				me.log.debug('Device: %s, can not set new Power state. Might be due to a wrong settings in config, error: %s', me.host, error);
				if (callback)
					callback(error);
			} else {
				me.log('Device: %s, set new Power state successfull: %s', me.host, state ? 'ON' : 'STANDBY');
				callback(null, state);
			}
		});
	}

	getMute(callback) {
		var me = this;
		this.httpGET('/goform/formMainZone_MainZoneXmlStatusLite.xml', function (error, data) {
			if (error) {
				me.log.debug('Device: %s, can not get current Mute state. Might be due to a wrong settings in config, error: %s', me.host, error);
				if (callback)
					callback(error);
			} else {
				var state = (data.item.Mute[0].value[0] == 'ON');
				me.log('Device: %s, get current Mute state successfull: %s', me.host, state ? 'ON' : 'OFF');
				callback(null, state);
			}
		});
	}

	setMute(state, callback) {
		var me = this;
		var newState = state ? 'ON' : 'OFF';
		me.httpGET('/goform/formiPhoneAppDirect.xml?MU' + newState, function (error) {
			if (error) {
				me.log.debug('Device: %s, can not set new Mute state. Might be due to a wrong settings in config, error: %s', me.host, error);
				if (callback)
					callback(error);
			} else {
				me.log('Device: %s, set new Mute state successfull: %s', me.host, state ? 'ON' : 'OFF');
				callback(null, state);
			}
		});
	}

	getVolume(callback) {
		var me = this;
		this.httpGET('/goform/formMainZone_MainZoneXmlStatusLite.xml', function (error, data) {
			if (error) {
				me.log.debug('Device: %s, can not get current Volume level. Might be due to a wrong settings in config, error: %s', me.host, error);
				if (callback)
					callback(error);
			} else {
				var volume = parseInt(data.item.MasterVolume[0].value[0]) + 80;
				me.log('Device: %s, get current Volume level successfull: %s', me.host, volume);
				callback(null, volume);
			}
		});
	}

	setVolume(volume, callback) {
		var me = this;
		var targetVolume = (volume - 2).toString();
		this.httpGET('/goform/formiPhoneAppDirect.xml?MV' + targetVolume, function (error) {
			if (error) {
				me.log.debug('Device: %s, can not set new Volume level. Might be due to a wrong settings in config, error: %s', me.host, error);
				if (callback)
					callback(error);
			} else {
				me.log('Device: %s, set new Volume level successfull: %s', me.host, targetVolume);
				callback(null, volume);
			}
		});
	}

	getInput(callback) {
		var me = this;
		this.httpGET('/goform/formMainZone_MainZoneXmlStatusLite.xml', function (error, data) {
			if (error) {
				me.log.debug('Device: %s, can not get current Input. Might be due to a wrong settings in config, error: %s', me.host, error);
				if (callback)
					callback(error);
			} else {
				let inputReference = data.item.InputFuncSelect[0].value[0];
				for (let i = 0; i < me.inputReferences.length; i++) {
					if (inputReference === me.inputReferences[i]) {
						me.tvService
							.getCharacteristic(Characteristic.ActiveIdentifier)
							.updateValue(i);
						me.log('Device: %s, get current Input successfull: %s', me.host, inputReference);
					}
				}
				callback();
			}
		});
	}

	setInput(callback, inputReference) {
		var me = this;
		me.getInput(function (error, currentInputReference) {
			if (error) {
				me.log.debug('Device: %s, can not get current Input Reference. Might be due to a wrong settings in config, error: %s', me.host, error);
				if (callback)
					callback(error);
			} else {
				if (currentInputReference == inputReference) {
					callback(null, inputReference);
				} else {
					this.httpGET('/goform/formiPhoneAppDirect.xml?SI' + inputReference, function (error, data) {
						if (error) {
							me.log.debug('Device: %s, can not set new Input. Might be due to a wrong settings in config, error: %s', me.host, error);
							if (callback)
								callback(error);
						} else {
							me.log('Device: %s, set new Input successfull %s:', me.host, inputReference);
							if (callback)
								callback(null, inputReference);
						}
					});
				}
			}
		});
	}

	setPowerMode(callback, state) {
		var me = this;
		var command = this.menuButton ? 'MNINF' : 'MNMEN ON';
		this.httpGET('/goform/formiPhoneAppDirect.xml?' + command, function (error, data) {
			if (error) {
				me.log.debug('Device: %s, can not set new Power Mode. Might be due to a wrong settings in config, error: %s', me.host, error);
				if (callback)
					callback(error);
			} else {
				me.log('Device: %s, set new Power Mode successfull and send command: %s', me.host, command);
				if (callback)
					callback(null, state);
			}
		});
	}

	volumeSelectorPress(remoteKey, callback) {
		var me = this;
		var command = 0;
		switch (remoteKey) {
			case Characteristic.VolumeSelector.INCREMENT:
				command = 'MVUP';
				break;
			case Characteristic.VolumeSelector.DECREMENT:
				command = 'MVDOWN';
				break;
		}
		me.log('Device: %s, key prssed: %s, command: %s', me.host, remoteKey, command);
		this.sendRemoteControlCommand(command, callback);
	}

	remoteKeyPress(remoteKey, callback) {
		var me = this;
		var command = 0;
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
				command = 'MNINF';
				break;
		}
		me.log('Device: %s, key prssed: %s, command: %s', me.host, remoteKey, command);
		this.sendRemoteControlCommand(command, callback);
	}

	sendRemoteControlCommand(command, callback) {
		var me = this;
		this.httpGET('/goform/formiPhoneAppDirect.xml?' + command, function (error) {
			if (error) {
				me.log.debug('Device: %s, can not send RC Command. Might be due to a wrong settings in config, error: %s', me.host, error);
				callback(error);
			} else {
				me.log('Device: %s, send RC Command successfull: %s', me.host, command);
				callback(null, command);
			}
		});
	}
};
