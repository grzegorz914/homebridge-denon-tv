const request = require('request');
const ppath = require('persist-path');
const fs = require('fs');
const mkdirp = require('mkdirp');
const xml2js = require('xml2js');
const parseString = xml2js.parseString;
const responseDelay = 1000;

var Accessory, Service, Characteristic, UUIDGen;
var checkingInterval;

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

		this.checkingInterval = config.checkStateInterval || 5;
		this.checkingInterval = this.checkingInterval * 1000;
		checkingInterval = this.checkingInterval;
		this.devices = config.devices || [];

		if (this.version < 2.1) {
			throw new Error('Unexpected API version.');
		}

		for (var i in this.devices) {
			this.tvAccessories.push(new denonTvClient(log, this.devices[i], api));
		}

		this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));
	}
	configureAccessory() { }
	removeAccessory() { }
	didFinishLaunching() {
		var me = this;
		setTimeout(function () {
			me.log.debug('didFinishLaunching');
		}, (this.devices.length + 1) * responseDelay);
	}
}

class denonTvClient {
	constructor(log, device, api) {
		this.log = log;
		this.api = api;
		this.device = device;

		this.devInfoSet = false;

		this.manufacturer = device.manufacturer || 'Denon/Marantz';
		this.modelName = device.model || 'homebridge-denon-tv';
		this.serialNumber = device.serialNumber || 'SN00000001';
		this.firmwareRevision = device.firmwareRevision || 'FW00000001';

		// devices configuration
		this.name = device.name || 'AV Receiver';
		this.host = device.host;
		this.port = device.port || 8080;
		this.inputs = device.inputs;

		this.getDeviceInfo();

		this.switchInfoMenu = device.switchInfoMenu;
		if (this.switchInfoMenu === true) {
			this.infoButton = 'MNINF';
			this.menuButton = 'MNMEN ON';
		} else {
			this.infoButton = 'MNMEN ON';
			this.menuButton = 'MNINF';
		}

		/* setup variables */
		this.connected = false;
		this.inputReferenceSet = false;
		this.inputReferences = new Array();
		this.checkAliveInterval = null;

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

		/* Delay to wait for retrieve device info */
		setTimeout(this.setupTvService.bind(this), responseDelay);
	}

	getDeviceInfo() {
		var me = this;
		request('http://' + this.host + ':60006/upnp/desc/aios_device/aios_device.xml', function (error, response, body) {
			if (error) {
				me.devInfoSet = true;
				me.log.debug('Error while getting information of device: %s, error: %s', me.host, error);
			} else {
				body = body.replace(/:/g, '');
				parseString(body, function (err, result) {
					if (err) {
						me.log.debug('Error while parsing information of device %s, error: %s', me.host, err);
					} else {
						try {
							me.manufacturer = result.root.device[0].manufacturer[0];
							me.modelName = (' ' + result.root.device[0].modelName[0]).slice(1);
							for (let i = 0; i < result.root.device[0].deviceList[0].device.length; i++) {
								try {
									me.serialNumber = result.root.device[0].deviceList[0].device[i].serialNumber[0];
									break;
								} catch (error) {
									me.log.debug(error);
								}
							}

							for (let i = 0; i < result.root.device[0].deviceList[0].device.length; i++) {
								try {
									me.firmwareRevision = result.root.device[0].deviceList[0].device[i].firmware_version[0];
									break;
								} catch (error) {
									me.log.debug(error);
								}
							}

							me.log('-----Device %s-----', me.host);
							me.log('Manufacturer: %s', me.manufacturer);
							me.log('Model: %s', me.modelName);
							me.log('Serialnumber: %s', me.serialNumber);
							me.log('Firmware: %s', me.firmwareRevision);
							me.devInfoSet = true;
						} catch (error) {
							me.log('Device: %s, not reachable %s.', me.host, error);
						}
					}
				});
			}
		});
	}

	//Start of TV integration service 
	setupTvService() {
		this.log.debug('setupTvService');
		this.tvAccesory = new Accessory(this.name, UUIDGen.generate(this.host + this.name));

		this.tvService = new Service.Television(this.name, 'tvService');
		this.tvService.setCharacteristic(Characteristic.ConfiguredName, this.name);
		this.tvService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.tvService.getCharacteristic(Characteristic.Active)
			.on('get', this.getPowerState.bind(this))
			.on('set', this.setPowerState.bind(this));

		this.tvService.getCharacteristic(Characteristic.ActiveIdentifier)
			.on('set', (inputIdentifier, callback) => {
				this.setInput(true, callback, this.inputReferences[inputIdentifier]);
			})
			.on('get', this.getInput.bind(this));

		this.tvService.getCharacteristic(Characteristic.RemoteKey)
			.on('set', this.remoteKeyPress.bind(this));

		this.tvService.getCharacteristic(Characteristic.PowerModeSelection)
			.on('set', (newValue, callback) => {
				if (this.connected) {
					if (this.devInfoSet == false)
						this.getDeviceInfo();
					else
						this.httpGet('/goform/formiPhoneAppDirect.xml?' + this.menuButton, function (error, data) { });
				}
				callback();
			});


		this.tvAccesory
			.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
			.setCharacteristic(Characteristic.Model, this.modelName)
			.setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);

		this.tvAccesory.addService(this.tvService);

		this.setupTvSpeakerService();
		this.prepareInputServices();


		this.log.debug('publishExternalAccessories for device: %s', this.host);
		this.api.publishExternalAccessories('homebridge-openwebif-tv', [this.tvAccesory]);

		//start the state checking
		if (!this.checkAliveInterval) {
			this.checkAliveInterval = setInterval(this.checkDeviceState.bind(this, this.updateReceiverStatus.bind(this)), checkingInterval);
		}
	}

	setupTvSpeakerService() {
		this.log.debug('setupTvSpeakerService');
		this.tvSpeakerService = new Service.TelevisionSpeaker(this.name + ' Volume', 'tvSpeakerService');
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
				//inputReference = inputReference.replace(/\s/g, ''); // remove all white spaces from the string

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
						fs.writeFile(this.inputsFile, JSON.stringify(this.inputs), (err) => {
							if (err) {
								this.log('Error occuredon device: %s, could not write new input name %s', me.host, err);
							} else {
								this.log('New input name for device: %s, successfully saved! New name: %s reference: %s', me.host, name, inputReference);
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

	updateReceiverStatus(error, tvStatus, inputReference) {
		this.log.debug('updateReceiverStatus');
	}

	checkDeviceState(callback) {
		var me = this;
		if (this.devInfoSet == false) {
			this.getDeviceInfo();
		} else {
			this.httpGET('/goform/formMainZone_MainZoneXmlStatusLite.xml', function (error, data) {
				if (error) {
					me.connected = false;
					me.log('Can not acces device: %s. Might be due to a wrong settings in config, error %s:', me.host, error);
				} else {
					var powerState = ((data.item.Power[0].value[0] == 'ON') == true);
					if (powerState == true) {
						let inputName = data.item.InputFuncSelect[0].value[0];
						for (let i = 0; i < me.inputReferences.length; i++) {
							if (inputName === me.inputReferences[i]) {
								if (me.inputReferenceSet === false)
									me.tvService
										.getCharacteristic(Characteristic.ActiveIdentifier)
										.updateValue(i);
								else
									me.inputReferenceSet = false;
							}
						}
						me.connected = true;
						me.log.debug('Check device state, device: %s ON', me.host);
					} else {
						me.connected = false;
						me.log.debug('Device %s not reachable or power in standby.', me.host);
					}
				}
			});
		}
		callback(null, this.connected, this.inputReference);
	}

	httpGET(apipath, callback) {
		if (!this.host) {
			callback(new Error('No host defined for device: %s.', this.host));
		}
		if (!this.port) {
			callback(new Error('No port defined for device: %s.', this.host));
		}

		var me = this;
		me.httpRequest('http://' + me.host + ':' + me.port + apipath, '', 'GET', function (error, response, responseBody) {
			if (error) {
				callback(error)
				me.log.error('Device: %s, not reachable.', me.host + ':' + me.port + apipath);
				return;
			} else {
				try {
					var result = parseString(responseBody, function (err, data) {
						if (err) {
							callback(error);
						} else {
							//me.log('result %s', data);
							callback(null, data);
						}
					});
				} catch (e) {
					callback(e, null);
					me.log('error: ' + e);
				}
			}
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
				me.log('Can not acces device: %s. Might be due to a wrong settings in config, error %s:', me.host, error);
			} else {
				var state = (data.item.Power[0].value[0] == 'ON');
				me.log('Device: %s, set Power succeded %s', me.host, state ? 'ON' : 'STANDBY');
				callback(null, state);
			}
		});
	}

	setPowerState(state, callback) {
		var me = this;
		var state = state ? 'ON' : 'STANDBY'; //number to boolean
		me.getPowerState(function (error, currentState) {
			if (error) {
				if (callback)
					callback(null, state ? false : true); //receiver is off
				me.log('Can not acces device: %s. Might be due to a wrong settings in config, error %s:', me.host, error);
			} else {
				if (currentState == state) { //state like expected
					callback(null, state);
				} else { //set new state
					me.httpGET('/goform/formiPhoneAppDirect.xml?PW' + state, function (error) {
						if (error) {
							callback(error)
						} else {
							me.log('setPowerState() succeded %s', state ? 'ON' : 'STANDBY');
							callback(null, state);
						}
					});
				}
			}
		});
	}

	getMute(callback) {
		var me = this;
		this.httpGET('/goform/formMainZone_MainZoneXmlStatusLite.xml', function (error, data) {
			if (error) {
				me.log('Can not acces device: %s. Might be due to a wrong settings in config, error %s:', me.host, error);
			} else {
				var state = (data.item.Mute[0].value[0] == 'ON');
				me.log('Device: %s, get Mute succeded: %s', me.host, state ? 'OFF' : 'ON');
				callback(null, state);
			}
		});
	}

	setMute(state, callback) {
		var me = this;
		var state = state ? 'ON' : 'OFF'; //number to boolean
		me.getMute(function (error, currentState) {
			if (error) {
				if (callback)
					callback(null, state ? true : false); //receiver is off
				me.log('Can not acces device: %s. Might be due to a wrong settings in config, error %s:', me.host, error);
			} else {
				if (currentState == state) { //state like expected
					callback(null, state);
				} else { //set new state
					me.httpGET('/goform/formiPhoneAppDirect.xml?MU' + state, function (error) {
						if (error) {
							callback(error)
						} else {
							me.log('Device: %s, set Mute succeded: %s', me.host, state ? 'OFF' : 'ON');
							callback(null, state);
						}
					});
				}
			}
		});
	}

	getVolume(callback) {
		var me = this;
		this.httpGET('/goform/formMainZone_MainZoneXmlStatusLite.xml', function (error, data) {
			if (error) {
				me.log('Can not acces device: %s. Might be due to a wrong settings in config, error %s:', me.host, error);
			} else {
				var currentVolume = parseInt(data.item.MasterVolume[0].value[0]) + 80;
				me.log('Device: %s, get Volume succeded: %s', me.host, volume);
				callback(null, currentVolume);
			}
		});
	}

	setVolume(volume, callback) {
		var me = this;
		var targetVolume = (volume - 80).toFixed(1);
		this.httpGET('/goform/formiPhoneAppDirect.xml?MV' + targetVolume, function (error) {
			if (error) {
				me.log('Can not acces device: %s. Might be due to a wrong settings in config, error %s:', me.host, error);
			} else {
				me.log('Device: %s, set Volume succesed: %s', me.host, targetVolume);
				callback(null, targetVolume);
			}
		});
	}

	getInput(callback) {
		var me = this;
		this.httpGET('/goform/formMainZone_MainZoneXmlStatusLite.xml', function (error, data) {
			if (error) {
				me.log('Can not acces devive: %s. Might be due to a wrong settings in config, error %s:', me.host, error);
			} else {
				let inputName = data.item.InputFuncSelect[0].value[0];
				for (let i = 0; i < me.inputReferences.length; i++) {
					if (inputName === me.inputReferences[i]) {
						me.tvService
							.getCharacteristic(Characteristic.ActiveIdentifier)
							.updateValue(i);
						me.log('Device: %s, get Channel succesed %s:', me.host, inputName);
					}
				}
				callback();
			}
		});
	}

	setInput(state, callback, inputReference) {
		if (state) {
			var me = this;
			me.inputReferenceSet = true;
			this.httpGET('/goform/formiPhoneAppDirect.xml?SI' + inputReference, function (error, data) {
				if (error) {
					me.log('Error while set input on device: %s, error: %s', me.host, error);
					if (callback)
						callback(error);
					me.log('Can not acces device: %s. Might be due to a wrong settings in config.', me.host);
				} else {
					if (callback)
						callback();
					me.log('Device: %s, set Channel succesed %s:', me.host, inputReference);
				}
			});
		}
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
				callback(error)
			} else {
				me.log('Device: %s, send Command succeded: %s', me.host, command);
				callback(null, command);
			}
		});
	}

};
	
