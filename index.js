"use strict";

const axios = require("axios");
const fs = require("fs");
const path = require("path");
const parseStringPromise = require("xml2js").parseStringPromise;

const PLUGIN_NAME = "homebridge-denon-tv";
const PLATFORM_NAME = "DenonTv";
const ZONE_NAME = ["Main Zone", "Zone 2", "Zone 3"];
const ZONE_NUMBER = ["MainZone_MainZone", "Zone2_Zone2", "Zone3_Zone3"];

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
			log("No configuration found for %s", PLUGIN_NAME);
			return;
		}
		this.log = log;
		this.config = config;
		this.devices = config.devices || [];
		this.accessories = [];
		if (api) {
			this.api = api;
			if (this.version < 2.1) {
				throw new Error("Unexpected API version.");
			}
			this.api.on("didFinishLaunching", this.didFinishLaunching.bind(this));
		}
	}

	didFinishLaunching() {
		this.log.debug("didFinishLaunching");
		for (let i = 0, len = this.devices.length; i < len; i++) {
			let deviceName = this.devices[i];
			if (!deviceName.name) {
				this.log.warn("Device Name Missing")
			} else {
				this.accessories.push(new denonTvDevice(this.log, deviceName, this.api));
			}
		}
	}
	configureAccessory(platformAccessory) {
		this.log.debug("configureAccessory");
		if (this.accessories) {
			this.accessories.push(platformAccessory);
		}
	}
	removeAccessory(platformAccessory) {
		this.log.debug("removeAccessory");
		this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [platformAccessory]);
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
		this.masterPowerControl = device.masterPowerControl;
		this.volumeControl = device.volumeControl;
		this.switchInfoMenu = device.switchInfoMenu;
		this.inputs = device.inputs;

		//zones
		this.zoneName = ZONE_NAME[this.zoneControl];
		this.zoneNumber = ZONE_NUMBER[this.zoneControl];

		//get Device info
		this.manufacturer = device.manufacturer || "Denon/Marantz";
		this.modelName = device.modelName || PLUGIN_NAME;
		this.serialNumber = device.serialNumber || "SN000002";
		this.firmwareRevision = device.firmwareRevision || "FW000002";

		//setup variables
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
		this.prefDir = path.join(api.user.storagePath(), "denonTv");
		this.inputsFile = this.prefDir + "/" + "inputs_" + this.host.split(".").join("");
		this.devInfoFile = this.prefDir + "/" + "devInfo_" + this.host.split(".").join("");
		this.url = ("http://" + this.host + ":" + this.port);

		let defaultInputs = [
			{
				name: "No inputs configured",
				reference: "No references configured",
				type: "No types configured"
			}
		];

		if (!Array.isArray(this.inputs) || this.inputs === undefined || this.inputs === null) {
			this.inputs = defaultInputs;
		}

		//check if prefs directory ends with a /, if not then add it
		if (this.prefDir.endsWith("/") === false) {
			this.prefDir = this.prefDir + "/";
		}

		//check if the directory exists, if not then create it
		if (fs.existsSync(this.prefDir) === false) {
			fs.mkdir(this.prefDir, { recursive: false }, (error) => {
				if (error) {
					this.log.debug("Device: %s %s, create directory: %s, error: %s", this.host, this.name, this.prefDir, error);
				}
			});
		}

		//Check net state
		setInterval(function () {
			var me = this;
			axios.get(me.url + "/goform/form" + me.zoneNumber + "XmlStatusLite.xml").then(response => {
				if (!me.connectionStatus) {
					me.log("Device: %s %s %s, state: Online", me.host, me.name, me.zoneName);
					me.connectionStatus = true;
					me.getDeviceInfo();
				} else {
					if (me.connectionStatus) {
						me.getDeviceState();
					}
				}
			}).catch(error => {
				if (error) {
					me.log.debug("Device: %s %s %s, state: Offline", me.host, me.name, me.zoneName);
					me.connectionStatus = false;
					me.currentPowerState = false;
					return;
				}
			});
		}.bind(this), 3000);

		//Delay to wait for device info before publish
		setTimeout(this.prepareTelevisionService.bind(this), 1000);
	}

	//Prepare TV service 
	prepareTelevisionService() {
		this.log.debug("prepareTelevisionService");
		this.accessoryUUID = UUID.generate(this.name);
		this.accessory = new Accessory(this.name, this.accessoryUUID);
		this.accessory.category = Categories.TELEVISION;
		this.accessory.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
			.setCharacteristic(Characteristic.Model, this.modelName)
			.setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);

		this.televisionService = new Service.Television(this.name, "televisionService");
		this.televisionService.setCharacteristic(Characteristic.ConfiguredName, this.name);
		this.televisionService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.televisionService.getCharacteristic(Characteristic.Active)
			.on("get", this.getPower.bind(this))
			.on("set", this.setPower.bind(this));

		this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
			.on("get", this.getInput.bind(this))
			.on("set", this.setInput.bind(this));

		this.televisionService.getCharacteristic(Characteristic.RemoteKey)
			.on("set", this.setRemoteKey.bind(this));

		this.televisionService.getCharacteristic(Characteristic.PowerModeSelection)
			.on("set", this.setPowerModeSelection.bind(this));

		this.televisionService.getCharacteristic(Characteristic.PictureMode)
			.on("set", this.setPictureMode.bind(this));

		this.accessory.addService(this.televisionService);
		this.prepareSpeakerService();
		this.prepareInputsService();
		if (this.volumeControl) {
			this.prepareVolumeService();
		}
		if (this.soundModeControl) {
			this.prepareSoundModesService();
		}

		this.log.debug("Device: %s %s, publishExternalAccessories.", this.host, this.name);
		this.api.publishExternalAccessories(PLUGIN_NAME, [this.accessory]);
	}

	//Prepare speaker service
	prepareSpeakerService() {
		this.log.debug("prepareSpeakerService");
		this.speakerService = new Service.TelevisionSpeaker(this.name + " Speaker", "speakerService");
		this.speakerService
			.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
			.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
		this.speakerService.getCharacteristic(Characteristic.VolumeSelector)
			.on("set", this.setVolumeSelector.bind(this));
		this.speakerService.getCharacteristic(Characteristic.Volume)
			.on("get", this.getVolume.bind(this))
			.on("set", this.setVolume.bind(this));
		this.speakerService.getCharacteristic(Characteristic.Mute)
			.on("get", this.getMute.bind(this))
			.on("set", this.setMute.bind(this));

		this.accessory.addService(this.speakerService);
		this.televisionService.addLinkedService(this.speakerService);
	}

	//Prepare volume service
	prepareVolumeService() {
		this.log.debug("prepareVolumeService");
		this.volumeService = new Service.Lightbulb(this.name + " Volume", "volumeService");
		this.volumeService.getCharacteristic(Characteristic.On)
			.on("get", this.getMuteSlider.bind(this));
		this.volumeService.getCharacteristic(Characteristic.Brightness)
			.on("get", this.getVolume.bind(this))
			.on("set", this.setVolume.bind(this));

		this.accessory.addService(this.volumeService);
		this.televisionService.addLinkedService(this.volumeService);
	}

	//Prepare inputs services
	prepareInputsService() {
		this.log.debug("prepareInputsService");

		let savedNames = {};
		try {
			savedNames = JSON.parse(fs.readFileSync(this.inputsFile));
		} catch (err) {
			this.log.debug("Device: %s %s, inputs file does not exist", this.host, this.name)
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

			this.inputsService = new Service.InputSource(inputReference, "input" + i);
			this.inputsService
				.setCharacteristic(Characteristic.Identifier, i)
				.setCharacteristic(Characteristic.ConfiguredName, inputName)
				.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
				.setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType, inputType)
				.setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);

			this.inputsService
				.getCharacteristic(Characteristic.ConfiguredName)
				.on("set", (newInputName, callback) => {
					this.inputs[inputReference] = newInputName;
					fs.writeFile(this.inputsFile, JSON.stringify(this.inputs), (error) => {
						if (error) {
							this.log.debug("Device: %s %s, can not write new Input name, error: %s", this.host, this.name, error);
						} else {
							this.log("Device: %s %s, saved new Input successful, name: %s reference: %s", this.host, this.name, newInputName, inputReference);
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
		setTimeout(() => {
			me.log.debug("Device: %s %s, requesting Device information.", me.host, me.name);
			axios.get(me.url + "/goform/Deviceinfo.xml").then(response => {
				parseStringPromise(response.data).then(result => {
					me.log.debug("Device: %s %s, get device info successful: %s", me.host, me.name, JSON.stringify(result, null, 2));
					me.manufacturer = ["Denon", "Marantz"][result.Device_Info.BrandCode[0]];
					me.modelName = result.Device_Info.ModelName[0];
					me.serialNumber = result.Device_Info.MacAddress[0];
					me.firmwareRevision = result.Device_Info.UpgradeVersion[0];
					me.zones = result.Device_Info.DeviceZones[0];
					me.apiVersion = result.Device_Info.CommApiVers[0];
					if (fs.existsSync(me.devInfoFile) === false) {
						fs.writeFile(me.devInfoFile, JSON.stringify(result), (error) => {
							if (error) {
								me.log.debug("Device: %s %s, could not write devInfoFile, error: %s", me.host, me.name, error);
							} else {
								me.log.debug("Device: %s %s, devInfoFile saved successful", me.host, me.name);
							}
						});
					} else {
						me.log.debug("Device: %s %s, devInfoFile already exists, not saving", me.host, me.name);
					}

					me.log("-------- %s --------", me.name);
					me.log("Manufacturer: %s", me.manufacturer);
					me.log("Model: %s", me.modelName);
					me.log("Zones: %s", me.zones);
					me.log("Api version: %s", me.apiVersion);
					me.log("Serialnumber: %s", me.serialNumber);
					me.log("Firmware: %s", me.firmwareRevision);
					me.log("----------------------------------");
				}).catch(error => {
					if (error) {
						me.log.debug("Device %s %s, getDeviceInfo parse string error: %s", me.host, me.name, error);
					}
				});
			}).catch(error => {
				if (error) {
					me.log.debug("Device: %s %s, getDeviceInfo eror: %s", me.host, me.name, error);
				}
			});
		}, 250);
	}

	getDeviceState() {
		var me = this;
		me.log.debug("Device: %s %s, requesting Device state.", me.host, me.name);
		axios.get(me.url + "/goform/form" + me.zoneNumber + "XmlStatusLite.xml").then(response => {
			parseStringPromise(response.data).then(result => {
				let powerState = (result.item.Power[0].value[0] == "ON");
				if (me.televisionService && (powerState !== me.currentPowerState)) {
					me.televisionService.updateCharacteristic(Characteristic.Active, powerState);
					me.log("Device: %s %s %s, get current Power state successful: %s", me.host, me.name, me.zoneName, powerState ? "ON" : (me.masterPowerControl ? "STANDBY" : "OFF"));
					me.currentPowerState = powerState;
				}

				let inputReference = result.item.InputFuncSelect[0].value[0];
				if (me.televisionService && powerState && (me.currentInputReference !== inputReference)) {
					if (me.inputReferences && me.inputReferences.length > 0) {
						let inputIdentifier = me.inputReferences.indexOf(inputReference);
						me.televisionService.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
						me.log("Device: %s %s %s, get current Input successful: %s", me.host, me.name, me.zoneName, inputReference);
						me.currentInputReference = inputReference;
					}
				}

				let muteState = powerState ? (result.item.Mute[0].value[0] == "ON") : true;
				let volume = parseInt(result.item.MasterVolume[0].value[0]) + 80;
				if (me.speakerService && powerState && (me.currentMuteState !== muteState || me.currentVolume !== volume)) {
					me.speakerService.updateCharacteristic(Characteristic.Mute, muteState);
					me.speakerService.updateCharacteristic(Characteristic.Volume, volume);
					if (me.volumeControl && me.volumeService) {
						me.volumeService.updateCharacteristic(Characteristic.On, !muteState);
						me.volumeService.updateCharacteristic(Characteristic.Brightness, volume);
					}
					me.log("Device: %s %s %s, get current Mute state: %s", me.host, me.name, me.zoneName, muteState ? "ON" : "OFF");
					me.log("Device: %s %s %s, get current Volume level: %s dB ", me.host, me.name, me.zoneName, (volume - 80));
					me.currentMuteState = muteState;
					me.currentVolume = volume;
				}
			}).catch(error => {
				if (error) {
					me.log.debug("Device %s %s, getDeviceState parse string error: %s", me.host, me.name, error);
				}
			});
		}).catch(error => {
			if (error) {
				me.log("Device: %s %s %s, getDeviceState error: %s", me.host, me.name, me.zoneName, error);
			}
		});
	}

	getPower(callback) {
		var me = this;
		let state = me.currentPowerState;
		me.log.debug("Device: %s %s %s, get current Power state successful: %s", me.host, me.name, me.zoneName, state ? "ON" : "OFF");
		callback(null, state);
	}

	setPower(state, callback) {
		var me = this;
		if (state !== me.currentPowerState) {
			let newState = me.masterPowerControl ? (state ? "PWON" : "PWSTANDBY") : [(state ? "ZMON" : "ZMOFF"), (state ? "Z2ON" : "Z2OFF"), (state ? "Z3ON" : "Z3OFF")][me.zoneControl];
			axios.get(me.url + "/goform/formiPhoneAppDirect.xml?" + newState).then(response => {
				me.log("Device: %s %s %s, set new Power state successful: %s", me.host, me.name, me.zoneName, state ? "ON" : (me.masterPowerControl ? "STANDBY" : "OFF"));
				callback(null);
			}).catch(error => {
				if (error) {
					me.log.debug("Device: %s %s %s, can not set new Power state. Might be due to a wrong settings in config, error: %s", me.host, me.name, me.zoneName, error);
					callback(error);
				}
			});
		}
	}

	getMute(callback) {
		var me = this;
		let state = me.currentPowerState ? me.currentMuteState : true;
		me.log.debug("Device: %s %s %s, get current Mute state successful: %s", me.host, me.name, me.zoneName, state ? "ON" : "OFF");
		callback(null, state);
	}

	getMuteSlider(callback) {
		var me = this;
		let state = me.currentPowerState ? !me.currentMuteState : false;
		me.log.debug("Device: %s %s %s, get current Mute state successful: %s", me.host, me.name, me.zoneName, !state ? "ON" : "OFF");
		callback(null, state);
	}

	setMute(state, callback) {
		var me = this;
		let newState = [(state ? "MUON" : "MUOFF"), (state ? "Z2MUON" : "Z2MUOFF"), (state ? "Z3MUON" : "Z3MUOFF")][me.zoneControl];
		if (state !== me.currentMuteState) {
			axios.get(me.url + "/goform/formiPhoneAppDirect.xml?" + newState).then(response => {
				me.log("Device: %s %s %s, set new Mute state successful: %s", me.host, me.name, me.zoneName, state ? "ON" : "OFF");
				callback(null);
			}).catch(error => {
				if (error) {
					me.log.debug("Device: %s %s %s, can not set new Mute state. Might be due to a wrong settings in config, error: %s", me.host, me.name, me.zoneName, error);
					callback(error);
				}
			});
		}
	}

	getVolume(callback) {
		var me = this;
		let volume = me.currentVolume;
		me.log.debug("Device: %s %s %s, get current Volume level successful: %s dB", me.host, me.name, me.zoneName, (volume - 80));
		callback(null, volume);
	}

	setVolume(volume, callback) {
		var me = this;
		let zone = ["MV", "Z2", "Z3"][me.zoneControl];
		let targetVolume = (volume - 2);
		axios.get(me.url + "/goform/formiPhoneAppDirect.xml?" + zone + targetVolume).then(response => {
			me.log("Device: %s %s %s, set new Volume level successful: %s", me.host, me.name, me.zoneName, targetVolume);
			callback(null);
		}).catch(error => {
			if (error) {
				me.log.debug("Device: %s %s %s, can not set new Volume level. Might be due to a wrong settings in config, error: %s", me.host, me.name, me.zoneName, error);
				callback(error);
			}
		});
	}

	getInput(callback) {
		var me = this;
		let inputReference = me.currentInputReference;
		if (!me.currentPowerState || inputReference === undefined || inputReference === null || inputReference === "") {
			me.televisionService
				.updateCharacteristic(Characteristic.ActiveIdentifier, 0);
			callback(null);
		} else {
			let inputIdentifier = me.inputReferences.indexOf(inputReference);
			if (inputReference === me.inputReferences[inputIdentifier]) {
				me.televisionService
					.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
				me.log.debug("Device: %s %s %s, get current Input successful: %s", me.host, me.name, me.zoneName, inputReference);
			}
			callback(null, inputIdentifier);
		}
	}

	setInput(inputIdentifier, callback) {
		var me = this;
		let inputName = me.inputNames[inputIdentifier];
		let inputReference = me.inputReferences[inputIdentifier];
		let inputMode = me.inputModes[inputIdentifier];
		let zone = [inputMode, "Z2", "Z3"][me.zoneControl];
		axios.get(me.url + "/goform/formiPhoneAppDirect.xml?" + zone + inputReference).then(response => {
			me.log("Device: %s %s %s, set new Input successful: %s %s", me.host, me.name, me.zoneName, inputName, inputReference);
			callback(null);
		}).catch(error => {
			if (error) {
				me.log.debug("Device: %s %s %s, can not set new Input. Might be due to a wrong settings in config, error: %s", me.host, me.name, me.zoneName, error);
				callback(error);
			}
		});
	}

	setPictureMode(remoteKey, callback) {
		var me = this;
		if (me.currentPowerState) {
			let command = "";
			switch (remoteKey) {
				case Characteristic.PictureMode.OTHER:
					command = "PVMOV";
					break;
				case Characteristic.PictureMode.STANDARD:
					command = "PVSTD";
					break;
				case Characteristic.PictureMode.CALIBRATED:
					command = "PVDAY";
					break;
				case Characteristic.PictureMode.CALIBRATED_DARK:
					command = "PVNGT";
					break;
				case Characteristic.PictureMode.VIVID:
					command = "PVVVD";
					break;
				case Characteristic.PictureMode.GAME:
					command = "PVSTM";
					break;
				case Characteristic.PictureMode.COMPUTER:
					command = "PVSTM";
					break;
				case Characteristic.PictureMode.CUSTOM:
					command = "PVCTM";
					break;
			}
			axios.get(me.url + "/goform/formiPhoneAppDirect.xml?" + command).then(response => {
				me.log("Device: %s %s, setPictureMode successful, remoteKey: %s, command: %s", me.host, me.name, remoteKey, command);
				callback(null, remoteKey);
			}).catch(error => {
				if (error) {
					me.log.debug("Device: %s %s, can not setPictureMode. Might be due to a wrong settings in config, error: %s", me.host, me.name, error);
					callback(error);
				}
			});
		}
	}

	setPowerModeSelection(remoteKey, callback) {
		var me = this;
		if (me.currentPowerState) {
			let command = "MEN?";
			switch (remoteKey) {
				case Characteristic.PowerModeSelection.SHOW:
					command = me.switchInfoMenu ? "MNOPT" : "MNINF";
					break;
				case Characteristic.PowerModeSelection.HIDE:
					command = "MNRTN";
					break;
			}
			axios.get(me.url + "/goform/formiPhoneAppDirect.xml?" + command).then(response => {
				me.log("Device: %s %s, setPowerModeSelection successful, remoteKey: %s, command: %s", me.host, me.name, remoteKey, command);
				callback(null, remoteKey);
			}).catch(error => {
				if (error) {
					me.log.debug("Device: %s %s, can not setPowerModeSelection. Might be due to a wrong settings in config, error: %s", me.host, me.name, error);
					callback(error);
				}
			});
		}
	}

	setVolumeSelector(remoteKey, callback) {
		var me = this;
		if (me.currentPowerState) {
			let zone = ["MV", "Z2", "Z3"][me.zoneControl];
			let command = "MV?";
			switch (remoteKey) {
				case Characteristic.VolumeSelector.INCREMENT:
					command = "UP";
					break;
				case Characteristic.VolumeSelector.DECREMENT:
					command = "DOWN";
					break;
			}
			axios.get(me.url + "/goform/formiPhoneAppDirect.xml?" + zone + command).then(response => {
				me.log("Device: %s %s %s, setVolumeSelector successful, remoteKey: %s, command: %s", me.host, me.name, me.zoneName, remoteKey, command);
				callback(null, remoteKey);
			}).catch(error => {
				if (error) {
					me.log.debug("Device: %s %s %s, can not setVolumeSelector. Might be due to a wrong settings in config, error: %s", me.host, me.name, me.zoneName, error);
					callback(error);
				}
			});
		}
	}

	setRemoteKey(remoteKey, callback) {
		var me = this;
		if (me.currentPowerState) {
			let command = "MEN?";
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
					command = me.switchInfoMenu ? "MNINF" : "MNOPT";
					break;
			}
			axios.get(me.url + "/goform/formiPhoneAppDirect.xml?" + command).then(response => {
				me.log("Device: %s %s, setRemoteKey successful, remoteKey: %s, command: %s", me.host, me.name, remoteKey, command);
				callback(null, remoteKey);
			}).catch(error => {
				if (error) {
					me.log.debug("Device: %s %s, can not setRemoteKey. Might be due to a wrong settings in config, error: %s", me.host, me.name, error);
					callback(error);
				}
			});
		}
	}
};
