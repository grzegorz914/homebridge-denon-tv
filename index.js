const request = require('request');
const ppath = require('persist-path');
const fs = require('fs');
const mkdirp = require('mkdirp');
const xml2js = require('xml2js');
const parseString = xml2js.parseString;
const responseDelay = 1500;

var Accessory, Service, Characteristic, hap, UUIDGen;

module.exports = homebridge => {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	Accessory = homebridge.platformAccessory;
	UUIDGen = homebridge.hap.uuid;
	hap = homebridge.hap;

	homebridge.registerPlatform('homebridge-denon-tv', 'DenonTv', denonTvPlatform, true);
};

class denonTvPlatform {
	constructor(log, config, api) {
		this.log = log;
		this.config = config;
		this.api = api;

		this.devices = config.devices || [];
		this.tvAccessories = [];

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

		//device configuration
		this.device = device;
		this.name = device.name;
		this.host = device.host;
		this.port = device.port || 8080;
		this.switchInfoMenu = device.switchInfoMenu;
		this.inputs = device.inputs;

		//setup variables
		this.connectionStatus = false;
		this.prefDir = ppath('denonTv/');
		this.inputsFile = this.prefDir + 'inputs_' + this.host.split('.').join('');
		this.deviceInfoFile = this.prefDir + 'info_' + this.host.split('.').join('');

		//get Device info
		this.getDeviceInfo();
		this.manufacturer = device.manufacturer || 'Denon/Marantz';
		this.modelName = device.model || 'homebridge-denon-tv';
		this.serialNumber = device.serialNumber || 'SN000002';
		this.firmwareRevision = device.firmwareRevision || 'FW000002';

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
			request('http://' + me.host + ':60006/upnp/desc/aios_device/aios_device.xml', function (error, response, body) {
				if (error) {
					me.log('Device: %s, name: %s, state: Offline', me.host, me.name);
					me.connectionStatus = false;
				} else {
					if (!me.connectionStatus) {
						me.log('Device: %s, name: %s, state: Online', me.host, me.name);
						me.connectionStatus = true;

					}
				}
			});
		}.bind(this), 5000);

		//Delay to wait for device info
		setTimeout(this.prepereTvService.bind(this), responseDelay);

		var deviceName = this.name;
		var uuid = UUIDGen.generate(deviceName);
		this.tvAccesory = new Accessory(deviceName, uuid, hap.Accessory.Categories.TV);
		this.log.debug('Device: %s, publishExternalAccessories: %s', this.host, this.name);
		this.api.publishExternalAccessories('homebridge-denon-tv', [this.tvAccesory]);
	}

	//get device info
	getDeviceInfo() {
		var me = this;
		setTimeout(() => {
			request('http://' + me.host + ':60006/upnp/desc/aios_device/aios_device.xml', (error, response, body) => {
				if (error) {
					me.log('Device: %s, name: %s, state: Offline', me.host, me.name);
				} else {
					body = body.replace(/:/g, '');
					parseString(body, function (error, result) {
						if (error) {
							me.log.debug('Device %s, getDeviceInfo parse string error: %s', me.host, error);
						} else {
							try {
								me.manufacturer = result.root.device[0].manufacturer[0];
								me.modelName = result.root.device[0].modelName[0];
								me.serialNumber = 'SN0000002';
								me.firmwareRevision = 'FW0000002';

								me.log('-----Device %s-----', me.host);
								me.log('Manufacturer: %s', me.manufacturer);
								me.log('Model: %s', me.modelName);
								me.log('Serialnumber: %s', me.serialNumber);
								me.log('Firmware: %s', me.firmwareRevision);
								me.log('Device: %s, getDeviceInfo successfull.', me.host);
							} catch (error) {
								me.log.debug('Device: %s, getDeviceInfo error: %s', me.host, error);
							}
						}
					});
				}
			});
		}, 200);
	}

	//Prepare TV service 
	prepereTvService() {
		this.log.debug('prepereTvService');
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
	}

	//Prepare speaker service
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

		this.inputReferences = new Array();
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
								this.log.debug('Device: %s, can not write new Input name, error: %s', this.host, error);
							} else {
								this.log('Device: %s, saved new Input successfull, name: %s reference: %s', this.host, name, inputReference);
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
				me.log.debug('Device: %s, not reachable, error: %s', me.host, error);
				callback(error);
				return;
			} else {
				try {
					var result = parseString(responseBody, function (error, data) {
						if (error) {
							me.log.debug('Device: %s, parseString error: %s', me.host, error);
							callback(error);
						} else {
							me.log.debug('Device: %s, parseString successfull, result: %s', me.host, data);
							callback(null, data);
						}
					});
				} catch (e) {
					callback(e, null);
					me.log.debug('error: %s', e);
				}
			}
			me.log('Device: %s, get data successfull.', me.host);
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
		if (me.connectionStatus) {
			this.httpGET('/goform/formMainZone_MainZoneXmlStatusLite.xml', function (error, data) {
				if (error) {
					me.log.debug('Device: %s, can not get current Power state. Might be due to a wrong settings in config, error: %s', me.host, error);
					if (callback)
						callback(error);
				} else {
					var state = (data.item.Power[0].value[0] == 'ON');
					me.log('Device: %s, get current Power state successfull: %s', me.host, state ? 'ON' : 'STANDBY');
					callback(null, state);
				}
			});
		} else {
			me.log('Device: %s, get current Power state failed, not connected to network.', me.host);
			callback(null, false);
		}
	}

	setPowerState(state, callback) {
		var me = this;
		if (me.connectionStatus) {
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
		} else {
			me.log('Device: %s, set new Power state failed, not connected to network.', me.host);
		}
	}

	getMute(callback) {
		var me = this;
		if (me.connectionStatus) {
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
		} else {
			me.log('Device: %s, get current Mute failed, not connected to network.', me.host);
			callback(null, false);
		}
	}

	setMute(state, callback) {
		var me = this;
		if (me.connectionStatus) {
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
		} else {
			me.log('Device: %s, set Mute failed, not connected to network.', me.host);
		}
	}

	getVolume(callback) {
		var me = this;
		if (me.connectionStatus) {
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
		} else {
			me.log('Device: %s, get Volume level failed, not connected to network.', me.host);
			callback(null, false);
		}
	}

	setVolume(volume, callback) {
		var me = this;
		if (me.connectionStatus) {
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
		} else {
			me.log('Device: %s, set new Volume level failed, not connected to network.', me.host);
		}
	}

	getInput(callback) {
		var me = this;
		if (me.connectionStatus) {
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
					callback(null, inputReference);
				}
			});
		} else {
			me.log('Device: %s, get current Input failed, not connected to network.', me.host);
			callback(null, false);
		}
	}

	setInput(callback, inputReference) {
		var me = this;
		if (me.connectionStatus) {
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
								me.log('Device: %s, set new Input successfull: %s', me.host, inputReference);
								callback(null, inputReference);
							}
						});
					}
				}
			});
		} else {
			me.log('Device: %s, set new Input failed, not connected to network.', me.host);
		}
	}

	setPowerMode(callback, state) {
		var me = this;
		if (me.connectionStatus) {
			var command = this.menuButton ? 'MNINF' : 'MNMEN ON';
			this.httpGET('/goform/formiPhoneAppDirect.xml?' + command, function (error, data) {
				if (error) {
					me.log.debug('Device: %s, can not set new Power Mode. Might be due to a wrong settings in config, error: %s', me.host, error);
					if (callback)
						callback(error);
				} else {
					me.log('Device: %s, set new Power Mode successfull, send command: %s', me.host, command);
					callback(null, state);
				}
			});
		} else {
			me.log('Device: %s, set new PowerModeSelection failed, not connected to network.', me.host);
		}
	}

	volumeSelectorPress(remoteKey, callback) {
		var me = this;
		if (me.connectionStatus) {
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
		} else {
			me.log('Device: %s, set new Volume level failed, not connected to network.', me.host);
		}
	}

	remoteKeyPress(remoteKey, callback) {
		var me = this;
		if (me.connectionStatus) {
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
		} else {
			me.log('Device: %s, set RemoteKey failed, not connected to network.', me.host);
		}
	}

	sendRemoteControlCommand(command, callback) {
		var me = this;
		if (me.connectionStatus) {
			this.httpGET('/goform/formiPhoneAppDirect.xml?' + command, function (error) {
				if (error) {
					me.log.debug('Device: %s, can not send RC command. Might be due to a wrong settings in config, error: %s', me.host, error);
					callback(error);
				} else {
					me.log('Device: %s, send RC command successfull: %s', me.host, command);
					callback(null, command);
				}
			});
		} else {
			me.log('Device: %s, send RC command failed, not connected to network.', me.host);
			callback(null, false);
		}
	}
};
