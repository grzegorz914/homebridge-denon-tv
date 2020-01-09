'use strict';
const net = require('net');
const request = require('request');
var Package = require('./package.json');

var Accessory, Service, Characteristic, hap, UUIDGen;
var parseString = require('xml2js').parseString;

module.exports = function(homebridge) {

          Accessory = homebridge.platformAccessory;
	  hap = homebridge.hap;
          Service = homebridge.hap.Service;
          Characteristic = homebridge.hap.Characteristic;
          UUIDGen = homebridge.hap.uuid;

	homebridge.registerPlatform("homebridge-denon-tv", "DenonTv", DenonTvPlatform, true);
};

    function DenonTvPlatform(log, config, api) {
	    var me = this;
	    this.api = api;
	    
	    //config
	    this.log = log;
	    this.config = config;
	    this.name = config["name"];
	    this.host = config["host"];
	    this.port = config["port"] || 80;
	    this.speakerService = config["speakerService"] || true;
	    this.inputs = config["inputs"];
	    
	    if (api) {
                me.api = api;
            if (api.version < 2.1) {
                throw new Error("Unexpected API version.");
               }
		me.api.on('didFinishLaunching', me.didFinishLaunching.bind(this));
            }
	   
    }

DenonTvPlatform.prototype.configureAccessory = function(accessory) {
}

DenonTvPlatform.prototype.didFinishLaunching = function() {
  var me = this;
  
  if (me.config.receivers) {
    var configuredAccessories = [];

    var receivers = me.config.receivers;
    receivers.forEach(function(receiverConfig) {
      var receiverName = receiverConfig.name;

      if (!receiverName) {
        me.log("Missing receiver.");
        return;
      }

      var uuid = UUIDGen.generate(receiverName);
      var receiverAccessory = new Accessory(receiverName, uuid, hap.Accessory.Categories.TV);
      var receiverAccessoryInfo = receiverAccessory.getService(Service.AccessoryInformation);
      if (receiverConfig.manufacturer) {
        receiverAccessoryInfo.setCharacteristic(Characteristic.Manufacturer, receiverConfig.manufacturer);
      }
      if (receiverConfig.model) {
        receiverAccessoryInfo.setCharacteristic(Characteristic.Model, receiverConfig.model);
      }
      if (receiverConfig.serialNumber) {
        receiverAccessoryInfo.setCharacteristic(Characteristic.SerialNumber, receiverConfig.serialNumber);
      }
      if (receiverConfig.firmwareRevision) {
        receiverAccessoryInfo.setCharacteristic(Characteristic.FirmwareRevision, receiverConfig.firmwareRevision);
      }
	    
      configuredAccessories.push(receiverAccessory);

      });

    me.api.publishReceiverAccessories("DenonTv", configuredAccessories);
  }
};

DenonTvPlatform.prototype = {

	generateTVService() {
		var me = this;
        this.log("Adding Television Service...")
		this.tvService = new Service.Television(this.name, 'tvService');
		this.tvService.setCharacteristic(Characteristic.ConfiguredName, this.name);
		this.tvService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.tvService.getCharacteristic(Characteristic.Active)
		.on('get', this.getPowerState.bind(this))
		.on('set', this.setPowerState.bind(this));

		// Identifier of current active input.
		this.tvService.getCharacteristic(Characteristic.ActiveIdentifier)
		.on('set', (inputIdentifier, callback) => {
			var input = this.inputReference[inputIdentifier]
            me.log("new input: %s" + input.name);
			this.setInput(input.reference, callback);
		})
		.on('get', (callback) => {
             me.getInput(function(error, inputReference) {
				if (inputReference == undefined || inputReference == null || inputReference.length <= 0) {
                    callback(null);
                    return;
                } else {
				    for (var i = 0; i < me.inputReference.length; i++) {
					     var input = me.inputReference[i];
					        if (input.reference == inputReference) {
						        me.log("current input nr: " + i + " name: " + input.name + " reference: " + input.reference);
						        callback(null, i);
						        return;
					    }
					}
				}
                me.log("received information: %s", error);
				callback("no input found");
			});
		});
               
        this.log("Adding Remote Key Service...");
		this.tvService.getCharacteristic(Characteristic.RemoteKey)
		    .on('set', this.remoteKeyPress.bind(this));

		return this.tvService;
	},
	
	generateSpeakerService() {
        if (this.speakerService){
            this.log("Adding Speaker Service...");
        }
		this.speakerService = new Service.TelevisionSpeaker(this.name + ' Volume');
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
		this.inputs.forEach((input, i) => {
				
                this.log("Adding Input Service..." + input.name);
				let tmpInput = new Service.InputSource(input.name, "input nr: " + counter);
				tmpInput
				.setCharacteristic(Characteristic.Identifier, counter)
				.setCharacteristic(Characteristic.ConfiguredName, input.name)
				.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
				.setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.TV)
				.setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);
		
				tmpInput
				.getCharacteristic(Characteristic.ConfiguredName)
				.on('set', (name, callback) => {
					callback()
				});
		
				this.inputReference.push(input);
				this.inputName.push(tmpInput);
                counter++;
			});
		return this.inputName;
    },

	getServices() {
		var me = this;
        this.log("Adding Information Service...")
		var informationService = new Service.AccessoryInformation();
		informationService
		.setCharacteristic(Characteristic.Manufacturer, "Denon/Marantz")
		.setCharacteristic(Characteristic.Model, "AV Receiver")
		.setCharacteristic(Characteristic.SerialNumber, "00000002")
		.setCharacteristic(Characteristic.FirmwareRevision, Package.version);

		var tvService  = this.generateTVService();
		var services = [informationService, tvService];

		var inputName = this.generateInputServices();
		inputName.forEach((service, i) => {
			tvService.addLinkedService(service);
			services.push(service);
		});

		if (this.speakerService){
			let speakerService = this.generateSpeakerService();
			services.push(speakerService);
			tvService.addLinkedService(speakerService);
		}
		return services;
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
        var me = this;
		if (!this.host) {
		  me.log.error("No Host defined in method: " + method);
		  callback(new Error("No host defined."));
		}
		if (!this.port) {
		  me.log.error("No port defined in method: " + method);
		  callback(new Error("No port defined."));
		}
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
		  } else {
			me.log.error("Device not reachable" + me.host + ":" + me.port + " in method: " + method);
			callback(new Error("device is not reachable, please check connection and all config data"), null); //receiver is off
			return;
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
               var me = this;
		var state = state? "ON": "STANDBY"; //number to boolean
		me.getPowerState(function(error, currentState) {
		  if(error){
			callback(null, state? false : true); //receiver is off
		  } else {
			if (currentState == state) { //state like expected
			  callback(null, state);
			} else { //set new state
			  this.httpGetForMethod("/goform/formiPhoneAppDirect.xml?PW" + state, function(error) {
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
               var me = this;
		var state = state? "ON" : "OFF"; //number to boolean
		me.getMute(function(error, currentState) {
		  if (error){
			callback(null, state? true : false); //receiver is off
		  } else {
			if (currentState == state) { //state like expected
				callback(null, state);
			} else { //set new state
			  this.httpGetForMethod("/goform/formiPhoneAppDirect.xml?MU" + state, function(error) {
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
			var currentVolume = parseInt(data.item.MasterVolume[0].value[0]) + 80;
			me.log('getVolume() succeded: %s', currentVolume);
			callback(null, currentVolume);
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
			var inputReference = data.item.InputFuncSelect[0].value[0];
			me.log('getInput() succeded: %s', inputReference); 
			callback(null, inputReference);
			}
		});
	},
	  
	setInput(ref, callback){
		var me = this;
		this.httpGetForMethod("/goform/formiPhoneAppDirect.xml?SI" + inputReference,  function(error) {
		  if (error){
			 callback(error)
		  } else { 
			   me.log('setInput() succeded: %s', inputReference);     
			   callback(null, inputReference);
		  } 
		});
	},

	getModelInfo(callback) {
		var me = this;
		this.httpGetForMethod("/goform/formMainZone_MainZoneXmlStatusLite.xml", function(error,data) {
		  if (error){
			 callback(error)
		  } else {
			var deviceName = data.item.FriendlyName[0].value[0];
			var deviceBrand = data.item.BrandId[0].value[0];
			me.log('getModelInfo() succeded: %s', deviceName, deviceBrand); 
			callback(null, deviceName, deviceBrand);
			}
		});
	},

	getName(callback) {
		var me = this;
		this.httpGetForMethod("/goform/formMainZone_MainZoneXmlStatusLite.xml", function(error,data) {
		  if (error){
			 callback(error)
		  } else {
			var deviceName = data.item.FriendlyName[0].value[0];
			me.log('getName() succeded: %s', deviceName); 
			callback(null, deviceName);
			}
		});
	},

	getBrand(callback) {
		var me = this;
		this.httpGetForMethod("/goform/formMainZone_MainZoneXmlStatusLite.xml", function(error,data) {
		  if (error){
			 callback(error)
		  } else {
			var beviceBrand = data.item.BrandId[0].value[0];
			me.log('getBrand() succeded: %s', deviceBrand); 
			callback(null, deviceBrand);
			}
		});
	},

	getSurround(callback) {
		var me = this;
		this.httpGetForMethod("/goform/formMainZone_MainZoneXmlStatusLite.xml", function(error,data) {
		  if (error){
			 callback(error)
		  } else {
			var surroundMode = data.item.selectSurround[0].value[0];
			me.log('getSurround() succeded: %s', surroundMode); 
			callback(null, surroundMode);
			}
		});
	},

	volumeSelectorPress(remoteKey, callback) {
        var me = this;
		var command = 0;
		switch (remoteKey) {
			case Characteristic.VolumeSelector.INCREMENT:
			command = "MVUP";
			break;
			case Characteristic.VolumeSelector.DECREMENT:
			command = "MVDOWN";
			break;
		}
               me.log('remote key pressed: %s', remoteKey, "remote command send: %s", command);
		this.sendRemoteControlCommand(command, callback);
	},

	remoteKeyPress(remoteKey, callback) {
               var me = this;
		var command = 0;
		switch (remoteKey) {
			case Characteristic.RemoteKey.REWIND:
			command = "MN9E";
			break;
			case Characteristic.RemoteKey.FAST_FORWARD:
			command = "MN9D";
			break;
			case Characteristic.RemoteKey.NEXT_TRACK:
			command = "MN9F";
			break;
			case Characteristic.RemoteKey.PREVIOUS_TRACK:
			command = "MN9G";
			break;
			case Characteristic.RemoteKey.ARROW_UP:
			command = "MNCUP";
			break;
			case Characteristic.RemoteKey.ARROW_DOWN:
			command = "MNCDN";
			break;
			case Characteristic.RemoteKey.ARROW_LEFT:
			command = "MNCLT";
			break;
			case Characteristic.RemoteKey.ARROW_RIGHT:
			command = "MNCRT";
			break;
			case Characteristic.RemoteKey.SELECT:
			command = "MNENT";
			break;
			case Characteristic.RemoteKey.BACK:
			command = "MNRTN";
			break;
			case Characteristic.RemoteKey.EXIT:
			command = "MNRTN";
			break;
			case Characteristic.RemoteKey.PLAY_PAUSE:
			command = "NS94";
			break;
			case Characteristic.RemoteKey.INFORMATION:
			command = "MNINF";
			break;
		}
               me.log('remote key pressed: %s', remoteKey, "remote command send: %s", command);
		this.sendRemoteControlCommand(command, callback);
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


