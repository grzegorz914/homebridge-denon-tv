'use strict';
const path = require('path');
const fs = require('fs');
const DenonDevice = require('./src/denondevice.js');
const CONSTANTS = require('./src/constants.json');

class DenonPlatform {
	constructor(log, config, api) {
		// only load if configured
		if (!config || !Array.isArray(config.devices)) {
			log.warn(`No configuration found for ${CONSTANTS.PluginName}`);
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

				//denon device
				const denonDevice = new DenonDevice(api, prefDir, device);
				denonDevice.on('publishAccessory', (accessory) => {
					api.publishExternalAccessories(CONSTANTS.PluginName, [accessory]);
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
					});
			}
		});
	}

	configureAccessory(accessory) {
		this.accessories.push(accessory);
	}
};

module.exports = (api) => {
	api.registerPlatform(CONSTANTS.PluginName, CONSTANTS.PlatformName, DenonPlatform, true);
};