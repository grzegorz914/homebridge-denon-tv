'use strict';
const path = require('path');
const fs = require('fs');
const MainZone = require('./src/mainzone.js');
const Zone2 = require('./src/zone2.js');
const Zone3 = require('./src/zone3.js');
const Surround = require('./src/surround.js');
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

				if (!deviceName || !host || !port) {
					log.warn(`Name: ${deviceName ? 'OK' : deviceName}, host: ${host ? 'OK' : host}, port: ${port ? 'OK' : port}}, in config wrong or missing.`);
					return;
				}
				await new Promise(resolve => setTimeout(resolve, 500));

				//debug config
				const enableDebugMode = device.enableDebugMode || false;
				const debug = enableDebugMode ? log(`Device: ${host} ${deviceName}, did finish launching.`) : false;
				const debug1 = enableDebugMode ? log(`Device: ${host} ${deviceName}, Config: ${JSON.stringify(device, null, 2)}`) : false;

				//zones
				const zoneControl = device.zoneControl;
				const generation = device.generation || 0;
				const refreshInterval = device.refreshInterval * 1000 || 5000;

				//check files exists, if not then create it
				const postFix = `${CONSTANTS.ZoneNameShort[zoneControl]}${host.split('.').join('')}`
				const devInfoFile = `${prefDir}/devInfo_${postFix}`;
				const inputsFile = `${prefDir}/inputs_${postFix}`;
				const inputsNamesFile = `${prefDir}/inputsNames_${postFix}`;
				const inputsTargetVisibilityFile = `${prefDir}/inputsTargetVisibility_${postFix}`;

				try {
					const files = [
						devInfoFile,
						inputsFile,
						inputsNamesFile,
						inputsTargetVisibilityFile,
					];

					files.forEach((file) => {
						if (!fs.existsSync(file)) {
							fs.writeFileSync(file, '');
						}
					});
				} catch (error) {
					log.error(`Device: ${host} ${deviceName}, prepare files error: ${error}`);
				}

				//zones
				switch (zoneControl) {
					case 0: //main zone
						const mainZone = new MainZone(api, device, zoneControl, deviceName, host, port, generation, devInfoFile, inputsFile, inputsNamesFile, inputsTargetVisibilityFile, refreshInterval);
						mainZone.on('publishAccessory', (accessory) => {
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
						break;
					case 1: //zone 1
						const zone2 = new Zone2(api, device, zoneControl, deviceName, host, port, generation, devInfoFile, inputsFile, inputsNamesFile, inputsTargetVisibilityFile, refreshInterval);
						zone2.on('publishAccessory', (accessory) => {
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
						break;
					case 2: //zone 2
						const zone3 = new Zone3(api, device, zoneControl, deviceName, host, port, generation, devInfoFile, inputsFile, inputsNamesFile, inputsTargetVisibilityFile, refreshInterval);
						zone3.on('publishAccessory', (accessory) => {
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
						break;
					case 3: //surround
						const surround = new Surround(api, device, zoneControl, deviceName, host, port, generation, devInfoFile, inputsFile, inputsNamesFile, inputsTargetVisibilityFile, refreshInterval);
						surround.on('publishAccessory', (accessory) => {
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
						break;
					default:
						log(`Device: ${host} ${deviceName}, unknoen zone: ${zoneControl}`);
						break;
				}
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