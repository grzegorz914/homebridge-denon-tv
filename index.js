import { join } from 'path';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import MainZone from './src/mainzone.js';
import Zone2 from './src/zone2.js';
import Zone3 from './src/zone3.js';
import Surround from './src/surround.js';
import ImpulseGenerator from './src/impulsegenerator.js';
import { PluginName, PlatformName, ZoneNameShort } from './src/constants.js';

class DenonPlatform {
	constructor(log, config, api) {
		// only load if configured
		if (!config || !Array.isArray(config.devices)) {
			log.warn(`No configuration found for ${PluginName}`);
			return;
		}
		this.accessories = [];

		//check if prefs directory exist
		const prefDir = join(api.user.storagePath(), 'denonTv');
		try {
			mkdirSync(prefDir, { recursive: true });
		} catch (error) {
			log.error(`Prepare directory error: ${error.message ?? error}`);
			return;
		}

		api.on('didFinishLaunching', async () => {
			for (const device of config.devices) {
				const deviceName = device.name;
				const host = device.host;
				const port = device.port;

				if (!deviceName || !host || !port) {
					log.warn(`Name: ${deviceName ? 'OK' : deviceName}, host: ${host ? 'OK' : host}, port: ${port ? 'OK' : port}}, in config wrong or missing.`);
					return;
				}

				//debug config
				const enableDebugMode = device.enableDebugMode || false;
				const disableLogConnectError = device.disableLogConnectError || false;
				const debug = enableDebugMode ? log.info(`Device: ${host} ${deviceName}, debug: Did finish launching.`) : false;
				const config = {
					...device,
					mqtt: {
						...device.mqtt,
						passwd: 'removed'
					}
				};
				const debug1 = enableDebugMode ? log.info(`Device: ${host} ${deviceName}, Config: ${JSON.stringify(config, null, 2)}`) : false;

				//zones
				const zoneControl = device.zoneControl;
				const generation = device.generation || 0;
				const refreshInterval = device.refreshInterval * 1000 || 5000;

				//check files exists, if not then create it
				const postFix = `${ZoneNameShort[zoneControl]}${host.split('.').join('')}`
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
						if (!existsSync(file)) {
							writeFileSync(file, '');
						}
					});
				} catch (error) {
					log.error(`Device: ${host} ${deviceName}, Prepare files error: ${error}`);
					return;
				}

				//zones
				switch (zoneControl) {
					case 0: //main zone
						try {
							const mainZone = new MainZone(api, device, zoneControl, deviceName, host, port, generation, devInfoFile, inputsFile, inputsNamesFile, inputsTargetVisibilityFile, refreshInterval);
							mainZone.on('publishAccessory', (accessory) => {
								api.publishExternalAccessories(PluginName, [accessory]);
								log.success(`Device: ${host} ${deviceName}, Published as external accessory.`);
							})
								.on('devInfo', (devInfo) => {
									log.info(devInfo);
								})
								.on('success', (message) => {
									log.success(`Device: ${host} ${deviceName}, ${message}`);
								})
								.on('message', (message) => {
									log.info(`Device: ${host} ${deviceName}, ${message}`);
								})
								.on('debug', (debug) => {
									log.info(`Device: ${host} ${deviceName}, debug: ${debug}`);
								})
								.on('warn', (warn) => {
									log.warn(`Device: ${host} ${deviceName}, ${warn}`);
								})
								.on('error', async (error) => {
									log.error(`Device: ${host} ${deviceName}, ${error}`);
								});

							//create impulse generator
							const impulseGenerator = new ImpulseGenerator();
							impulseGenerator.on('start', async () => {
								try {
									await mainZone.start();
									impulseGenerator.stop();
								} catch (error) {
									const logError = disableLogConnectError ? false : log.error(`Device: ${host} ${deviceName}, ${error}, trying again.`);
								};
							}).on('state', (state) => {
								const debug = enableDebugMode ? state ? log.info(`Device: ${host} ${deviceName}, Start impulse generator started.`) : log.info(`Device: ${host} ${deviceName}, Start impulse generator stopped.`) : false;
							});

							//start impulse generator
							impulseGenerator.start([{ name: 'start', sampling: 45000 }]);
						} catch (error) {
							log.error(`Device: ${host} ${deviceName}, Did finish launching error: ${error}`);
						}
						break;
					case 1: //zone 1
						try {
							const zone2 = new Zone2(api, device, zoneControl, deviceName, host, port, generation, devInfoFile, inputsFile, inputsNamesFile, inputsTargetVisibilityFile, refreshInterval);
							zone2.on('publishAccessory', (accessory) => {
								api.publishExternalAccessories(PluginName, [accessory]);
								log.success(`Device: ${host} ${deviceName}, Published as external accessory.`);
							})
								.on('devInfo', (devInfo) => {
									log(devInfo);
								})
								.on('success', (message) => {
									log.success(`Device: ${host} ${deviceName}, ${message}`);
								})
								.on('message', (message) => {
									log(`Device: ${host} ${deviceName}, ${message}`);
								})
								.on('debug', (debug) => {
									log(`Device: ${host} ${deviceName}, debug: ${debug}`);
								})
								.on('warn', (warn) => {
									log.warn(`Device: ${host} ${deviceName}, ${warn}`);
								})
								.on('error', async (error) => {
									log.error(`Device: ${host} ${deviceName}, ${error}`);
								});

							//create impulse generator
							const impulseGenerator = new ImpulseGenerator();
							impulseGenerator.on('start', async () => {
								try {
									await zone2.start();
									impulseGenerator.stop();
								} catch (error) {
									const logError = disableLogConnectError ? false : log.error(`Device: ${host} ${deviceName}, ${error}, trying again.`);
								};
							}).on('state', (state) => {
								const debug = enableDebugMode ? state ? log.info(`Device: ${host} ${deviceName}, Start impulse generator started.`) : log.info(`Device: ${host} ${deviceName}, Start impulse generator stopped.`) : false;
							});

							//start impulse generator
							impulseGenerator.start([{ name: 'start', sampling: 45000 }]);
						} catch (error) {
							log.error(`Device: ${host} ${deviceName}, Did finish launching error: ${error}`);
						}
						break;
					case 2: //zone 2
						try {
							const zone3 = new Zone3(api, device, zoneControl, deviceName, host, port, generation, devInfoFile, inputsFile, inputsNamesFile, inputsTargetVisibilityFile, refreshInterval);
							zone3.on('publishAccessory', (accessory) => {
								api.publishExternalAccessories(PluginName, [accessory]);
								log.success(`Device: ${host} ${deviceName}, Published as external accessory.`);
							})
								.on('devInfo', (devInfo) => {
									log.info(devInfo);
								})
								.on('success', (message) => {
									log.success(`Device: ${host} ${deviceName}, ${message}`);
								})
								.on('message', (message) => {
									log.info(`Device: ${host} ${deviceName}, ${message}`);
								})
								.on('debug', (debug) => {
									log.info(`Device: ${host} ${deviceName}, debug: ${debug}`);
								})
								.on('warn', (warn) => {
									log.warn(`Device: ${host} ${deviceName}, ${warn}`);
								})
								.on('error', async (error) => {
									log.error(`Device: ${host} ${deviceName}, ${error}`);
								});

							//create impulse generator
							const impulseGenerator = new ImpulseGenerator();
							impulseGenerator.on('start', async () => {
								try {
									await zone3.start();
									impulseGenerator.stop();
								} catch (error) {
									const logError = disableLogConnectError ? false : log.error(`Device: ${host} ${deviceName}, ${error}, trying again.`);
								};
							}).on('state', (state) => {
								const debug = enableDebugMode ? state ? log.info(`Device: ${host} ${deviceName}, Start impulse generator started.`) : log.info(`Device: ${host} ${deviceName}, Start impulse generator stopped.`) : false;
							});

							//start impulse generator
							impulseGenerator.start([{ name: 'start', sampling: 45000 }]);
						} catch (error) {
							log.error(`Device: ${host} ${deviceName}, Did finish launching error: ${error}`);
						}
						break;
					case 3: //surround
						try {
							const surround = new Surround(api, device, zoneControl, deviceName, host, port, generation, devInfoFile, inputsFile, inputsNamesFile, inputsTargetVisibilityFile, refreshInterval);
							surround.on('publishAccessory', (accessory) => {
								api.publishExternalAccessories(PluginName, [accessory]);
								log.success(`Device: ${host} ${deviceName}, Published as external accessory.`);
							})
								.on('devInfo', (devInfo) => {
									log.info(devInfo);
								})
								.on('success', (message) => {
									log.success(`Device: ${host} ${deviceName}, ${message}`);
								})
								.on('message', (message) => {
									log.info(`Device: ${host} ${deviceName}, ${message}`);
								})
								.on('debug', (debug) => {
									log.info(`Device: ${host} ${deviceName}, debug: ${debug}`);
								})
								.on('warn', (warn) => {
									log.warn(`Device: ${host} ${deviceName}, ${warn}`);
								})
								.on('error', async (error) => {
									log.error(`Device: ${host} ${deviceName}, ${error}`);
								});

							//create impulse generator
							const impulseGenerator = new ImpulseGenerator();
							impulseGenerator.on('start', async () => {
								try {
									await surround.start();
									impulseGenerator.stop();
								} catch (error) {
									const logError = disableLogConnectError ? false : log.error(`Device: ${host} ${deviceName}, ${error}, trying again.`);
								};
							}).on('state', (state) => {
								const debug = enableDebugMode ? state ? log.info(`Device: ${host} ${deviceName}, Start impulse generator started.`) : log.info(`Device: ${host} ${deviceName}, Start impulse generator stopped.`) : false;
							});

							//start impulse generator
							impulseGenerator.start([{ name: 'start', sampling: 45000 }]);
						} catch (error) {
							log.error(`Device: ${host} ${deviceName}, Did finish launching error: ${error}`);
						}
						break;
					default:
						log.warn(`Device: ${host} ${deviceName}, unknown zone: ${zoneControl}`);
						break;
				}
				await new Promise(resolve => setTimeout(resolve, 500));
			}
		});
	}

	configureAccessory(accessory) {
		this.accessories.push(accessory);
	}
};

export default (api) => {
	api.registerPlatform(PluginName, PlatformName, DenonPlatform, true);
};