'use strict';
const path = require('path');
const fs = require('fs');
const RestFul = require('./src/restful.js');
const Mqtt = require('./src/mqtt.js');
const DenonDevice = require('./src/denondevice.js');
const CONSTANS = require('./src/constans.json');

class DenonPlatform {
	constructor(log, config, api) {
		// only load if configured
		if (!config || !Array.isArray(config.devices)) {
			log.warn(`No configuration found for ${CONSTANS.PluginName}`);
			return;
		}
		this.accessories = [];

		//check if prefs directory exist
		const prefDir = path.join(api.user.storagePath(), 'denonTv');
		if (!fs.existsSync(prefDir)) {
			fs.mkdirSync(prefDir);
		};

		api.on('didFinishLaunching', async () => {
			for (const device of config.devices) {
				const deviceName = device.name;
				const host = device.host;
				const port = device.port;
				const zoneControl = device.zoneControl;

				if (!deviceName || !host || !port || !(zoneControl >= 0 && zoneControl <= 3)) {
					log.warn(`Name: ${deviceName ? 'OK' : deviceName}, host: ${host ? 'OK' : host}, port: ${port ? 'OK' : port}, zone: ${(zoneControl >= 0 && zoneControl <= 3) ? 'OK' : zoneControl}, in config wrong or missing.`);
					return;
				}
				await new Promise(resolve => setTimeout(resolve, 500))

				//debug config
				const enableDebugMode = device.enableDebugMode || false;
				const debug = enableDebugMode ? log(`Device: ${host} ${deviceName}, did finish launching.`) : false;
				const debug1 = enableDebugMode ? log(`Device: ${host} ${deviceName}, Config: ${JSON.stringify(device, null, 2)}`) : false;

				//RESTFul server
				const restFulEnabled = device.enableRestFul || false;
				if (restFulEnabled) {
					this.restFulConnected = false;
					const restFulPort = device.restFulPort || 3000;
					const restFulDebug = device.restFulDebug || false;
					this.restFul = new RestFul({
						port: restFulPort,
						debug: restFulDebug
					});

					this.restFul.on('connected', (message) => {
						log(`Device: ${host} ${deviceName}, ${message}`);
						this.restFulConnected = true;
					})
						.on('error', (error) => {
							log.error(`Device: ${host} ${deviceName}, ${error}`);
						})
						.on('debug', (debug) => {
							log(`Device: ${host} ${deviceName}, debug: ${debug}`);
						});
				}

				//MQTT client
				const mqttEnabled = device.enableMqtt || false;
				if (mqttEnabled) {
					this.mqttConnected = false;
					const mqttHost = device.mqttHost;
					const mqttPort = device.mqttPort || 1883;
					const mqttClientId = device.mqttClientId || `Denon_${Math.random().toString(16).slice(3)}`;
					const mqttPrefix = device.mqttPrefix;
					const mqttUser = device.mqttUser;
					const mqttPasswd = device.mqttPasswd;
					const mqttDebug = device.mqttDebug || false;
					this.mqtt = new Mqtt({
						host: mqttHost,
						port: mqttPort,
						clientId: mqttClientId,
						user: mqttUser,
						passwd: mqttPasswd,
						prefix: `${mqttPrefix}/${deviceName}`,
						debug: mqttDebug
					});

					this.mqtt.on('connected', (message) => {
						log(`Device: ${host} ${deviceName}, ${message}`);
						this.mqttConnected = true;
					})
						.on('error', (error) => {
							log.error(`Device: ${host} ${deviceName}, ${error}`);
						})
						.on('debug', (debug) => {
							log(`Device: ${host} ${deviceName}, debug: ${debug}`);
						});
				}

				//denon device
				const denonDevice = new DenonDevice(api, prefDir, device);
				denonDevice.on('publishAccessory', (accessory) => {
					api.publishExternalAccessories(CONSTANS.PluginName, [accessory]);
					const debug = enableDebugMode ? log(`Device: ${host} ${deviceName}, published as external accessory.`) : false;
				})
					.on('devInfo', (devInfo) => {
						log(devInfo);
					})
					.on('message', (message) => {
						log(`Device: ${host} ${deviceName}, ${message}`);
					})
					.on('debug', (debug) => {
						log(`Device: ${host} ${deviceName}, debug: ${debug}`);
					})
					.on('error', (error) => {
						log.error(`Device: ${host} ${deviceName}, ${error}`);
					})
					.on('restFul', (path, data) => {
						const restFul = this.restFulConnected ? this.restFul.update(path, data) : false;
					})
					.on('mqtt', (topic, message) => {
						const mqtt = this.mqttConnected ? this.mqtt.send(topic, message) : false;
					});
			}
		});
	}

	configureAccessory(accessory) {
		this.accessories.push(accessory);
	}
};

module.exports = (api) => {
	api.registerPlatform(CONSTANS.PluginName, CONSTANS.PlatformName, DenonPlatform, true);
};