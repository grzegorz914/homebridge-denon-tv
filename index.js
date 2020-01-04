const net = require('net');
const request = require('request');

var Service, Characteristic;
var inherits = require('util').inherits;
var parseString = require('xml2js').parseString;

module.exports = function(homebridge) {

        Service = homebridge.hap.Service;
        Characteristic = homebridge.hap.Characteristic;

	homebridge.registerAccessory("homebridge-denon-tv", "DenonTv", DenonTvAccessory);
};

function DenonTvAccessory(log, config) {
	this.log = log;
	this.config = config
	this.name = config["name"];

	//required
	var me = this;
	this.host = config["host"];
	this.port = config["port"] || 80;
	this.speakerService = config["speakerService"] || true;
	this.inputs = config["inputs"];
}

DenonTvAccessory.prototype = {

	generateTVService() {
		var me = this;
		this.tvService = new Service.Television(this.name, 'tvService');
		this.tvService.setCharacteristic(Characteristic.ConfiguredName, this.name);
		this.tvService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.tvService.getCharacteristic(Characteristic.Active)
		.on('get', this.getPowerState.bind(this))
		.on('set', this.setPowerState.bind(this));

		// Identifier of Active imput.
		this.tvService.getCharacteristic(Characteristic.ActiveIdentifier)
		.on('set', (inputIdentifier, callback) => {
			this.log("new input " + inputIdentifier);
			var source = this.inputReference[inputIdentifier]
			this.setInput(source.reference, callback);
		})
		.on('get', (callback) => {
			me.log.error("received information");
			me.getInput(function(error, ref) {
				for (var i = 0; i < me.inputReference.length; i++) {
					 var source = me.inputReference[i];
					 if (source.reference == ref) {
						me.log("current input: " + i + " " + source.name + " reference: " + ref);
						callback(null, i);
						return;
					}
				}
				callback("no input found");
			});
		});

		this.tvService.getCharacteristic(Characteristic.RemoteKey)
		    .on('set', this.remoteKeyPress.bind(this));

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

		this.inputName = new Array();
		this.inputReference = new Array();
               var counter = 0;
		this.inputs.forEach((source, i) => {
				this.log("Adding input " + source.name);
		
				let tmpInput = new Service.InputSource(source.name, "inputLink" + counter);
				tmpInput
				.setCharacteristic(Characteristic.Identifier, counter)
				.setCharacteristic(Characteristic.ConfiguredName, source.name)
				.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
				.setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.TV)
				.setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);
		
				tmpInput
				.getCharacteristic(Characteristic.ConfiguredName)
				.on('set', (name, callback) => {
					callback()
				});
		
				this.inputReference.push(source);
				this.inputName.push(tmpInput);
                             counter++;
			});
		return this.inputName;
},

	volumeSelectorPress(remoteKey, callback) {
		this.log('remote key pressed: %d', remoteKey);
		var command = 0;
		switch (remoteKey) {
			case Characteristic.VolumeSelector.INCREMENT:
			command = MVUP;
			break;
			case Characteristic.VolumeSelector.DECREMENT:
			command = MVDOWN;
			break;
		}
		this.sendRemoteControlCommand(command, callback);
	},

	remoteKeyPress(remoteKey, callback) {
		this.log('remote key pressed: %d', remoteKey);
		var command = 0;
		switch (remoteKey) {
			case Characteristic.RemoteKey.REWIND:
			command = MN9E;
			break;
			case Characteristic.RemoteKey.FAST_FORWARD:
			command = MN9D;
			break;
			case Characteristic.RemoteKey.NEXT_TRACK:
			command = MN9F;
			break;
			case Characteristic.RemoteKey.PREVIOUS_TRACK:
			command = MN9G;
			break;
			case Characteristic.RemoteKey.ARROW_UP:
			command = MNCUP;
			break;
			case Characteristic.RemoteKey.ARROW_DOWN:
			command = MNCDN;
			break;
			case Characteristic.RemoteKey.ARROW_LEFT:
			command = MNCLT;
			break;
			case Characteristic.RemoteKey.ARROW_RIGHT:
			command = MNCRT;
			break;
			case Characteristic.RemoteKey.SELECT:
			command = MNENT;
			break;
			case Characteristic.RemoteKey.BACK:
			command = MNRTN;
			break;
			case Characteristic.RemoteKey.EXIT:
			command = MNRTN;
			break;
			case Characteristic.RemoteKey.PLAY_PAUSE:
			command = NS94;
			break;
			case Characteristic.RemoteKey.INFORMATION:
			command = MNINF;
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

		var inputName = this.generateInputServices();
		inputName.forEach((service, i) => {
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

	checkHostIsReachable(host, port, callback) {
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
	  
	  httpGetForMethod(method, callback) {
		if (!this.host) {
		  this.log.error("No Host defined in method: " + method);
		  callback(new Error("No host defined."));
		}
		if (!this.port) {
		  this.log.error("No port defined in method: " + method);
		  callback(new Error("No port defined."));
		}
		var me = this;
		me.checkHostIsReachable(this.host, this.port, function(reachable) {
		  if (reachable) {
			me.httpRequest('http://' + me.host + ':' + me.port + method , '', 'GET', function(error, response, responseBody) {
			  if (error) {
				callback(error)
			  } else {
				try {
				  var result = parseString(responseBody, function(err, data) {
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
	  
	  httpRequest(url, body, method, callback) {
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
	  
	  getPowerState(callback) {
		var me = this;
		this.httpGetForMethod("/goform/formMainZone_MainZoneXmlStatusLite.xml", function(error,data) {
		  if (error){
			callback(error)
		  } else {
			var state = (data.item.Power[0].value[0] == "ON");
			me.log('getPowerState() succeded: %s', state? 'ON':'STANDBY');
			callback(null, state);
		  }
		});
	  },
	  
	  setPowerState(state, callback) {
		var state = state? "ON": "STANDBY"; //number to boolean
		var me = this;
		me.getPowerState(function(error, currentState) {
		  if(error){
			callback(null, state? false : true); //receiver is off
		  } else {
			if (currentState == state) { //state like expected
			  callback(null, state);
			} else { //set new state
			  me.httpGetForMethod("/goform/formiPhoneAppDirect.xml?PW" + state, function(error) {
				if (error){
				  callback(error)
				} else {
				  me.log('setPowerState() succeded %s', state? 'ON':'STANDBY');
				  callback(null, state);
				}
			  });
			}
		  }
		});
	  },
	  
	  getMute(callback) {
		var me = this;
		this.httpGetForMethod("/goform/formMainZone_MainZoneXmlStatusLite.xml", function(error,data) {
		  if (error){
			  callback(error)
		  } else {
			var state = (data.item.Mute[0].value[0] == "ON");
			me.log('getMute() succeded: %s', state? 'ON':'OFF');
			callback(null, state);
		  }
		});
	  },
	  
	  setMute(state, callback) {
		var state = state? "ON" : "OFF"; //number to boolean
		var me = this;
		me.getMute(function(error, currentState) {
		  if (error){
			callback(null, state? true : false); //receiver is off
		  } else {
			if (currentState == state) { //state like expected
				callback(null, state);
			} else { //set new state
			  me.httpGetForMethod("/goform/formiPhoneAppDirect.xml?MU" + state, function(error) {
				if (error){
					callback(error)
				} else {
				  me.log('setMute() succeded %s',  state? 'ON':'OFF');
				  callback(null, state);
				}
			  });
			}
		  }
		});
	  },
	  
	  getVolume(callback) {
		var me = this;
		this.httpGetForMethod("/goform/formMainZone_MainZoneXmlStatusLite.xml", function(error,data) {
		  if (error){
			callback(error)
		  } else {
			var volume = parseInt(data.item.MasterVolume[0].value[0]) + 80;
			me.log('getVolume() succeded: %s', volume);
			callback(null, volume);
		  }
		});
	  },
	  
	  setVolume(volume, callback) {
		var me = this;
		var targetVolume = (volume - 80).toFixed(1); 
		this.httpGetForMethod("/goform/formiPhoneAppDirect.xml?MV" + targetVolume, function(error) {
		  if (error){
			callback(error)
		  } else {
			me.log('setVolume() succesed %s', targetVolume);
			callback(null, targetVolume);
		  }
		});
	  },
		  
	  getInput(callback) {
		var me = this;
		this.httpGetForMethod("/goform/formMainZone_MainZoneXmlStatusLite.xml", function(error,data) {
		  if (error){
			 callback(error)
		  } else {
			var ref = data.item.InputFuncSelect[0].value[0];
			me.log('getInput() succeded: %s', ref); 
			callback(null, ref);
			}
		});
	  },
	  
	  setInput(ref, callback){
		var me = this;
		this.httpGetForMethod("/goform/formiPhoneAppDirect.xml?SI" + ref,  function(error) {
		  if (error){
			 callback(error)
		  } else { 
			   me.log('setInput() succeded: %s', ref);     
			   callback(null, ref);
		  } 
		});
	  },

	  getModelInfo(callback) {
		var me = this;
		this.httpGetForMethod("/goform/formMainZone_MainZoneXmlStatusLite.xml", function(error,data) {
		  if (error){
			 callback(error)
		  } else {
			var name = data.item.FriendlyName[0].value[0];
			var brand = data.item.BrandId[0].value[0];
			me.log('getModelInfo() succeded: %s', name, brand); 
			callback(null, name, brand);
			}
		});
	  },

	  getName(callback) {
		var me = this;
		this.httpGetForMethod("/goform/formMainZone_MainZoneXmlStatusLite.xml", function(error,data) {
		  if (error){
			 callback(error)
		  } else {
			var name = data.item.FriendlyName[0].value[0];
			me.log('getName() succeded: %s', name); 
			callback(null, name);
			}
		});
	  },

	  getBrand(callback) {
		var me = this;
		this.httpGetForMethod("/goform/formMainZone_MainZoneXmlStatusLite.xml", function(error,data) {
		  if (error){
			 callback(error)
		  } else {
			var brand = data.item.BrandId[0].value[0];
			me.log('getBrand() succeded: %s', brand); 
			callback(null, brand);
			}
		});
	  },

	  getSurround(callback) {
		var me = this;
		this.httpGetForMethod("/goform/formMainZone_MainZoneXmlStatusLite.xml", function(error,data) {
		  if (error){
			 callback(error)
		  } else {
			var surround = data.item.selectSurround[0].value[0];
			me.log('getSurround() succeded: %s', surround); 
			callback(null, surround);
			}
		});
	  },
	  
	  sendRemoteControlCommand(command, callback) {
		var me = this;
		this.httpGetForMethod("/goform/formiPhoneAppDirect.xml?" + command, function(error) {
		  if (error){
			 callback(error)
		  } else { 
			   me.log('sendCommand() succeded: %s', command);     
			   callback(null, command);
		  }
		});
	  }

};




