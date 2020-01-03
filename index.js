const net = require('net');
const request = require('request');
var parseString = require('xml2js');

var Service, Characteristic;
var inherits = require('util').inherits;

module.exports = function(homebridge) {

        Service = homebridge.hap.Service;
        Characteristic = homebridge.hap.Characteristic;

	homebridge.registerAccessory("homebridge-openwebif-tv", "OpenWebIfTv", OpenWebIfTvAccessory);
};

function OpenWebIfTvAccessory(log, config) {
	this.log = log;
	this.config = config
	this.name = config["name"];

	//required
	this.host = config["host"];
	this.port = config["port"] || 80;
	this.speakerService = config["speakerService"] || true;
	this.bouquets = config["bouquets"];
	var me = this;
}

OpenWebIfTvAccessory.prototype = {

	generateTVService() {
		var me = this;
		this.tvService = new Service.Television(this.name, 'tvService');
		this.tvService.setCharacteristic(Characteristic.ConfiguredName, this.name);
		this.tvService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.tvService.getCharacteristic(Characteristic.Active)
		.on('get', this.getPowerState.bind(this))
		.on('set', this.setPowerState.bind(this));

		// Identifier of Current Active imput.
		this.tvService.getCharacteristic(Characteristic.ActiveIdentifier)
		.on('set', (inputIdentifier, callback) => {
			this.log("new input " + inputIdentifier);
			var channel = this.inputChannels[inputIdentifier]
			this.setCurrentChannelWithsRef(channel.reference, callback);
		})
		.on('get', (callback) => {
			me.log.error("received information");
			me.getCurrentChannelWithsRef(function(error, ref) {
				for (var i = 0; i < me.inputChannels.length; i++) {
					 var channel = me.inputChannels[i];
					 if (channel.reference == ref) {
						me.log("current channel: " + i + " " + channel.name + " reference: " + ref);
						callback(null, i);
						return;
					}
				}
				callback("no reference found");
			});
		});

		this.tvService.getCharacteristic(Characteristic.RemoteKey)
		    .on('set', this.remoteKeyPress.bind(this));
		this.tvService.addCharacteristic(this.makeDiscSpaceCharacteristic())
		    .on('get', this.getDiscSpace.bind(this))

		if (this.config["includeIP"] || false) {
			this.tvService.setCharacteristic(this.makeIPCharacteristic(this.host), this.host);
		}
		return this.tvService;
	},
	
	generateSpeakerService() {
		this.speakerService = new Service.TelevisionSpeaker(this.name);
		this.speakerService.getCharacteristic(Characteristic.Volume)
		    .on('get', this.getVolume.bind(this))
		    .on('set', this.setVolume.bind(this));
		this.speakerService.getCharacteristic(Characteristic.VolumeSelector) //increase/decrease volume
                    .on('set', this.volumeSelectorPress.bind(this));
		this.speakerService.getCharacteristic(Characteristic.Mute)
		    .on('get', this.getMute.bind(this))
		    .on('set', this.setMute.bind(this));

		this.speakerService.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);

		return this.speakerService;
	},

	generateInputServices() {
                // TODO load persisted Names

		this.inputServices = new Array();
		this.inputChannels = new Array();
		var counter = 0;
		this.bouquets.forEach((bouquet, i) => {
			 bouquet.channels.forEach((channel, i) => {
				this.log("Adding Channel " + channel.name);

				let tmpInput = new Service.InputSource(channel.name, "channelLink" + counter);
				tmpInput
				.setCharacteristic(Characteristic.Identifier, counter)
				.setCharacteristic(Characteristic.ConfiguredName, channel.name)
				.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
				.setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.TV)
				.setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);

				tmpInput
				.getCharacteristic(Characteristic.ConfiguredName)
				.on('set', (name, callback) => {
					// TODO: persist name
					callback()
				});

				this.inputChannels.push(channel);
				this.inputServices.push(tmpInput);
				counter++;
			});
		});
		if (counter == 0){
			this._printBouquets()
		}
		return this.inputServices;
	},

	volumeSelectorPress(remoteKey, callback) {
		this.log('remote key pressed: %d', remoteKey);
		var command = 0;
		switch (remoteKey) {
			case Characteristic.VolumeSelector.INCREMENT:
			command = 115;
			break;
			case Characteristic.VolumeSelector.DECREMENT:
			command = 114;
			break;
		}
		this.sendRemoteControlCommand(command, callback);
	},

	remoteKeyPress(remoteKey, callback) {
		this.log('remote key pressed: %d', remoteKey);
		var command = 0;
		switch (remoteKey) {
			case Characteristic.RemoteKey.REWIND:
			command = 168;
			break;
			case Characteristic.RemoteKey.FAST_FORWARD:
			command = 159;
			break;
			case Characteristic.RemoteKey.NEXT_TRACK:
			command = 407;
			break;
			case Characteristic.RemoteKey.PREVIOUS_TRACK:
			command = 412;
			break;
			case Characteristic.RemoteKey.ARROW_UP:
			command = 103;
			break;
			case Characteristic.RemoteKey.ARROW_DOWN:
			command = 108;
			break;
			case Characteristic.RemoteKey.ARROW_LEFT:
			command = 105;
			break;
			case Characteristic.RemoteKey.ARROW_RIGHT:
			command = 106;
			break;
			case Characteristic.RemoteKey.SELECT:
			command = 352;
			break;
			case Characteristic.RemoteKey.BACK:
			command = 174;
			break;
			case Characteristic.RemoteKey.EXIT:
			command = 174;
			break;
			case Characteristic.RemoteKey.PLAY_PAUSE:
			command = 164;
			break;
			case Characteristic.RemoteKey.INFORMATION:
			command = 139;
			break;
		}
		this.sendRemoteControlCommand(command, callback);
	},

    identify(callback) {
		this.log("Identify requested!");
		callback();
	},

	getServices() {
		var me = this;
		var informationService = new Service.AccessoryInformation();
		informationService
		.setCharacteristic(Characteristic.Manufacturer)
		.setCharacteristic(Characteristic.Model)
		.setCharacteristic(Characteristic.SerialNumber)
		.setCharacteristic(Characteristic.FirmwareRevision);

		var tvService  = this.generateTVService();
		var services = [informationService, tvService];

		var inputServices = this.generateInputServices();
		inputServices.forEach((service, i) => {
			tvService.addLinkedService(service);
			services.push(service);
		});

		if (this.speakerService){
			this.log("Adding SpeakerService");
			let speakerService = this.generateSpeakerService();
			services.push(speakerService);
			tvService.addLinkedService(speakerService);
		}
		return services;
	},

	makeDiscSpaceCharacteristic() {
		var discSpaceChar = function() {
			Characteristic.call(this, 'DiscSpace', 'B795302F-FFBA-41D9-9076-337986B81D27');
			this.setProps({
				format: Characteristic.Formats.INT,
				unit: Characteristic.Units.PERCENTAGE,
				maxValue: 100,
				minValue: 0,
				minStep: 1,
				perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
			});
			this.value = 0;
		}
		inherits(discSpaceChar, Characteristic);
		return discSpaceChar;
	},

	makeIPCharacteristic(ip) {
		var volumeCharacteristic = function() {
			Characteristic.call(this, 'IP', 'B795302F-FFBA-41D9-9076-337986B81D29');
			this.setProps({
				format: Characteristic.Formats.STRING,
				perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
			});
			this.value = ip;
		}
		inherits(volumeCharacteristic, Characteristic);
		return volumeCharacteristic;
	},

	_checkHostIsReachable(host, port, callback) {
		var timeout = 2000;
		var callbackCalled = false;
		
		var client = new net.Socket();
		client.on('error', function (err) {
			clearTimeout(timer);
			client.destroy();
			if (!callbackCalled) {
				callback(false);
				callbackCalled = true;
			}
		})
		
		client.connect(port, host, function () {
			clearTimeout(timer);
			client.end();
			if (!callbackCalled) {
				callback(true);
				callbackCalled = true;
			}
		});
		
		var timer = setTimeout(function() {
			client.end();
			if (!callbackCalled) {
				callback(false);
				callbackCalled = true;
			}
		}, timeout);
	  },
	  
	  _httpGetForMethod(method, callback) {
		if (!this.host) {
		  this.log.error("No Host defined in method: " + method);
		  callback(new Error("No host defined."));
		}
		if (!this.port) {
		  this.log.error("No port defined in method: " + method);
		  callback(new Error("No port defined."));
		}
		var me = this;
		me._checkHostIsReachable(this.host, this.port, function(reachable) {
		  if (reachable) {
			me._httpRequest('http://' + me.host + ':' + me.port + method , '', 'GET', function(error, response, responseBody) {
			  if (error) {
				callback(error)
			  } else {
				try {
				  var result = JSON.stringify(responseBody, function(err, data) {
					if (err) {
					  callback(err)
					} else {
					  me.log('result %s', data);
					  callback(null, data);
					}
				  });
				} catch (e) {
				  callback(e, null);
				  me.log('error: ' + e);
				}
			  }
			}.bind(this));
		  } else {
			me.log.error("Device not reachable" + me.host + ":" + me.port + " in method: " + method);
			callback(new Error("device is off"), null); //receiver is off
		  }
		});
	  },
	  
	  _httpRequest(url, body, method, callback) {
		request({
		  url: url,
		  body: body,
		  method: method,
		  rejectUnauthorized: false
		},
		function(error, response, body) {
		  callback(error, response, body);
		});
	  },
	  
	  getDiscSpace(callback) {
		var me = this;
		this._httpGetForMethod("/api/about", function(error,data) {
		  if (error){
			callback(error)
		  } else {
			var json = JSON.parse(data);
			var freeDiscSpaceValue = json.info.hdd[0].free;
			var freeDouble = parseFloat(freeDiscSpaceValue);
			var capacityDiscSpaceValue = json.info.hdd[0].capacity;
			var capacityDouble = parseFloat(capacityDiscSpaceValue);
			var percentage = (freeDouble / capacityDouble) * 100;
			me.log('getDiscSpace() succeded, free: %s', percentage);
			callback(null, percentage);
		  }
		});
	  },

	  getDeviceInfo(callback) {
		var me = this;
		this._httpGetForMethod("/api/about", function(error,data) {
		  if (error){
			callback(error)
		  } else {
			var json = JSON.parse(data);
			var brand = json.brand;
			var model = json.info.bname;
			var firmware = json.info.enigmaver;
			var serial = json.ifaces[0].mac;
			me.log('getDeviceInfo() succeded, free: %s', data);
			callback(null, data);
		  }
		});
	  },
	  
	  getPowerState(callback) {
		var me = this;
		this._httpGetForMethod("/api/statusinfo", function(error,data) {
		  if (error){
			callback(error)
		  } else {
			var json = JSON.parse(data); 
			var state = (json.inStandby == "false");
			me.log('getPowerState() succeded: %s', state? 'ON':'OFF');
			callback(null, state);
		  }
		});
	  },
	  
	  setPowerState(state, callback) {
		var state = state? true : false; //number to boolean
		var me = this;
		me.getPowerState(function(error, currentState) {
		  if(error){
			callback(null, state? false : true); //receiver is off
		  } else {
			if (currentState == state) { //state like expected
			  callback(null, state);
			} else { //set new state
			  me._httpGetForMethod("/api/powerstate?newstate=0", function(error) {
				if (error){
				  callback(error)
				} else {
				  me.log('setPowerState() succeded %s', state? 'ON':'OFF');
				  callback(null, state);
				}
			  });
			}
		  }
		});
	  },
	  
	  getMute(callback) {
		var me = this;
		this._httpGetForMethod("/api/statusinfo", function(error,data) {
		  if (error){
			  callback(error)
		  } else {
			var json = JSON.parse(data);
			var state = (json.muted == false);
			me.log('getMute() succeded: %s', state? 'OFF':'ON');
			callback(null, state);
		  }
		});
	  },
	  
	  setMute(state, callback) {
		var state = state? false : true; //number to boolean
		var me = this;
		me.getMute(function(error, currentState) {
		  if (error){
			callback(null, state? true : false); //receiver is off
		  } else {
			if (currentState == state) { //state like expected
				callback(null, state);
			} else { //set new state
			  me._httpGetForMethod("/api/vol?set=mute", function(error) {
				if (error){
					callback(error)
				} else {
				  me.log('setMute() succeded %s',  state? 'OFF':'ON');
				  callback(null, state);
				}
			  });
			}
		  }
		});
	  },
	  
	  getVolume(callback) {
		var me = this;
		this._httpGetForMethod("/api/statusinfo", function(error,data) {
		  if (error){
			callback(error)
		  } else {
			var json = JSON.parse(data);
			var volume = parseFloat(json.volume);
			me.log('getVolume() succeded: %s', volume);
			callback(null, volume);
		  }
		});
	  },
	  
	  setVolume(volume, callback) {
		var me = this;
		var targetVolume = parseInt(volume);
		this._httpGetForMethod("/api/vol?set=set" + targetVolume, function(error) {
		  if (error){
			callback(error)
		  } else {
			me.log('setVolume() succesed %s', targetVolume);
			callback(null, targetVolume);
		  }
		});
	  },
	  
	  _printBouquets() {
		var me = this;
		this._httpGetForMethod("/api/getservices", function(error,data) {
		  if (error){
		  } else {
			var json = JSON.parse(data);
			var servicesList = json.services;
			me._printBouquetsDetail(servicesList, new Array());
			var arrayLength = servicesList.length;
			for (var i = 0; i < arrayLength; i++) {
			var service = servicesList[i];
			}
		  }
		});
	  },
	  
	  _printBouquetsDetail(bouquets, printArray) {
		if (bouquets == undefined || bouquets == null || bouquets.length <= 0) {
		  var string =  JSON.stringify(printArray, null, 2);
		  this.log('JSON for adding to bouquet array in config in openwebif accessory under key bouquets: %s', string);
		  return;
		}
		let bouquet = bouquets[0];
		bouquets.shift();
	  
		let name = bouquet.servicename;
		let ref = bouquet.servicereference;
		var me = this;
		this._httpGetForMethod("/api/getservices?sRef=" + ref, function(error,data) {
		  if (error){
		  } else {
			var json = JSON.parse(data);
			var servicesList = json.services;
			var arr = [];
			var arrayLength = servicesList.length;
			for (var i = 0; i < arrayLength; i++) {
			  var service = servicesList[i];
			  let name = service.servicename;
			  let ref = service.servicereference;
			  var object = {"name": name, "reference": ref};
			  arr.push(object);
			}
			var jsonobj = {"name": name, "reference": ref, "channels": arr };
			printArray.push(jsonobj)
			me.log('Adding this to bouquet array in config: %s', string);
			me._printBouquetsDetail(bouquets, printArray);
		  }
		});
	  },
	  
	  getCurrentChannelWithsRef(callback) {
		var me = this;
		this._httpGetForMethod("/api/statusinfo", function(error,data) {
		  if (error){
			 callback(error)
		  } else {
			var json = JSON.parse(data);
			var ref = json.currservice_serviceref;
			me.log('getCurrentChannelWithsRef() succeded: %s', ref); 
			callback(null, String(ref));
			}
		});
	  },
	  
	  setCurrentChannelWithsRef(ref, callback){
		var me = this;
		this._httpGetForMethod("/api/zap?sRef=" + ref,  function(error) {
		  if (error){
			 callback(error)
		  } else { 
			   me.log('setCurrentChannelWithsRef() succeded: %s', ref);     
			   callback(null, ref);
		  } 
		});
	  },
	  
	  sendRemoteControlCommand(command, callback) {
		var me = this;
		this._httpGetForMethod("/api/remotecontrol?command=" + command, function(error) {
		  if (error){
			 callback(error)
		  } else { 
			   me.log('sendCommand() succeded: %s', command);     
			   callback(null, command);
		  }
		});
	  }

};


