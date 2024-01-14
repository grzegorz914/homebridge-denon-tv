'use strict';
const path = require('path');
const fs = require('fs');
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
				if (!device.name || !device.host || !device.port || !(device.zoneControl >= 0 && device.zoneControl <= 3)) {
					log.warn(`Name: ${device.name ? 'OK' : device.name}, host: ${device.host ? 'OK' : device.host}, port: ${device.port ? 'OK' : device.port}, zone: ${(device.zoneControl >= 0 && device.zoneControl <= 3) ? 'OK' : device.zoneControl} ,in config wrong or missing.`);
					return;
				}
				await new Promise(resolve => setTimeout(resolve, 250))

				//debug config
				const debug = device.enableDebugMode ? log(`Device: ${device.host} ${device.name}, did finish launching.`) : false;
				const debug1 = device.enableDebugMode ? log(`Device: ${device.host} ${device.name}, Config: ${JSON.stringify(device, null, 2)}`) : false;

				//denon device
				const denonDevice = new DenonDevice(api, prefDir, device);
				denonDevice.on('publishAccessory', (accessory) => {
					api.publishExternalAccessories(CONSTANS.PluginName, [accessory]);
					const debug = device.enableDebugMode ? log(`Device: ${device.host} ${device.name}, published as external accessory.`) : false;
				})
					.on('devInfo', (devInfo) => {
						log(devInfo);
					})
					.on('message', (message) => {
						log(`Device: ${device.host} ${device.name}, ${message}`);
					})
					.on('debug', (debug) => {
						log(`Device: ${device.host} ${device.name}, debug: ${debug}`);
					})
					.on('error', (error) => {
						log.error(`Device: ${device.host} ${device.name}, ${error}`);
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