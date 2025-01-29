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
			log.warn(`No configuration found for ${PluginName}.`);
			return;
		}
		this.accessories = [];

		//check if prefs directory exist
		const prefDir = join(api.user.storagePath(), 'denonTv');
		try {
			mkdirSync(prefDir, { recursive: true });
		} catch (error) {
			log.error(`Prepare directory error: ${error}.`);
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

				//log config
				const enableDebugMode = device.enableDebugMode || false;
				const disableLogDeviceInfo = device.disableLogDeviceInfo || false;
				const disableLogInfo = device.disableLogInfo || false;
				const disableLogSuccess = device.disableLogSuccess || false;
				const disableLogWarn = device.disableLogWarn || false;
				const disableLogError = device.disableLogError || false;
				const debug = enableDebugMode ? log.info(`Device: ${host} ${deviceName}, debug: Did finish launching.`) : false;
				const config = {
					...device,
					mqtt: {
						...device.mqtt,
						passwd: 'removed'
					}
				};
				const debug1 = !enableDebugMode ? false : log.info(`Device: ${host} ${deviceName}, Config: ${JSON.stringify(config, null, 2)}.`);

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
					const emitLog = disableLogError ? false : log.error(`Device: ${host} ${deviceName}, Prepare files error: ${error}.`);
					return;
				}

				//zones
				switch (zoneControl) {
					case 0: //main zone
						try {
							const mainZone = new MainZone(api, device, zoneControl, deviceName, host, port, generation, devInfoFile, inputsFile, inputsNamesFile, inputsTargetVisibilityFile, refreshInterval);
							mainZone.on('publishAccessory', (accessory) => {
								api.publishExternalAccessories(PluginName, [accessory]);
								const emitLog = disableLogSuccess ? false : log.success(`Device: ${host} ${deviceName}, Published as external accessory.`);
							})
								.on('devInfo', (devInfo) => {
									const emitLog = disableLogDeviceInfo ? false : log.info(devInfo);
								})
								.on('success', (success) => {
									const emitLog = disableLogSuccess ? false : log.success(`Device: ${host} ${deviceName}, ${success}.`);
								})
								.on('info', (info) => {
									const emitLog = disableLogInfo ? false : log.info(`Device: ${host} ${deviceName}, ${info}.`);
								})
								.on('debug', (debug) => {
									const emitLog = !enableDebugMode ? false : log.info(`Device: ${host} ${deviceName}, debug: ${debug}.`);
								})
								.on('warn', (warn) => {
									const emitLog = disableLogWarn ? false : log.warn(`Device: ${host} ${deviceName}, ${warn}.`);
								})
								.on('error', (error) => {
									const emitLog = disableLogError ? false : log.error(`Device: ${host} ${deviceName}, ${error}.`);
								});

							//create impulse generator
							const impulseGenerator = new ImpulseGenerator();
							impulseGenerator.on('start', async () => {
								try {
									const startDone = await mainZone.start();
									const stopImpulseGenerator = startDone ? await impulseGenerator.stop() : false;
								} catch (error) {
									const emitLog = disableLogError ? false : log.error(`Device: ${host} ${deviceName}, ${error}, trying again.`);
								};
							}).on('state', (state) => {
								const emitLog = !enableDebugMode ? false : state ? log.info(`Device: ${host} ${deviceName}, Start impulse generator started.`) : log.info(`Device: ${host} ${deviceName}, Start impulse generator stopped.`);
							});

							//start impulse generator
							await impulseGenerator.start([{ name: 'start', sampling: 45000 }]);
						} catch (error) {
							throw new Error(`Device: ${host} ${deviceName}, Did finish launching error: ${error}.`);
						}
						break;
					case 1: //zone 1
						try {
							const zone2 = new Zone2(api, device, zoneControl, deviceName, host, port, generation, devInfoFile, inputsFile, inputsNamesFile, inputsTargetVisibilityFile, refreshInterval);
							zone2.on('publishAccessory', (accessory) => {
								api.publishExternalAccessories(PluginName, [accessory]);
								const emitLog = disableLogSuccess ? false : log.success(`Device: ${host} ${deviceName}, Published as external accessory.`);
							})
								.on('devInfo', (devInfo) => {
									const emitLog = disableLogDeviceInfo ? false : log.info(devInfo);
								})
								.on('success', (success) => {
									const emitLog = disableLogSuccess ? false : log.success(`Device: ${host} ${deviceName}, ${success}.`);
								})
								.on('info', (info) => {
									const emitLog = disableLogInfo ? false : log.info(`Device: ${host} ${deviceName}, ${info}.`);
								})
								.on('debug', (debug) => {
									const emitLog = !enableDebugMode ? false : log.info(`Device: ${host} ${deviceName}, debug: ${debug}.`);
								})
								.on('warn', (warn) => {
									const emitLog = disableLogWarn ? false : log.warn(`Device: ${host} ${deviceName}, ${warn}.`);
								})
								.on('error', (error) => {
									const emitLog = disableLogError ? false : log.error(`Device: ${host} ${deviceName}, ${error}.`);
								});

							//create impulse generator
							const impulseGenerator = new ImpulseGenerator();
							impulseGenerator.on('start', async () => {
								try {
									const startDone = await zone2.start();
									const stopImpulseGenerator = startDone ? await impulseGenerator.stop() : false;
								} catch (error) {
									const emitLog = disableLogError ? false : log.error(`Device: ${host} ${deviceName}, ${error}, trying again.`);
								};
							}).on('state', (state) => {
								const emitLog = !enableDebugMode ? false : state ? log.info(`Device: ${host} ${deviceName}, Start impulse generator started.`) : log.info(`Device: ${host} ${deviceName}, Start impulse generator stopped.`);
							});

							//start impulse generator
							await impulseGenerator.start([{ name: 'start', sampling: 45000 }]);
						} catch (error) {
							throw new Error(`Device: ${host} ${deviceName}, Did finish launching error: ${error}.`);
						}
						break;
					case 2: //zone 2
						try {
							const zone3 = new Zone3(api, device, zoneControl, deviceName, host, port, generation, devInfoFile, inputsFile, inputsNamesFile, inputsTargetVisibilityFile, refreshInterval);
							zone3.on('publishAccessory', (accessory) => {
								api.publishExternalAccessories(PluginName, [accessory]);
								const emitLog = disableLogSuccess ? false : log.success(`Device: ${host} ${deviceName}, Published as external accessory.`);
							})
								.on('devInfo', (devInfo) => {
									const emitLog = disableLogDeviceInfo ? false : log.info(devInfo);
								})
								.on('success', (success) => {
									const emitLog = disableLogSuccess ? false : log.success(`Device: ${host} ${deviceName}, ${success}.`);
								})
								.on('info', (info) => {
									const emitLog = disableLogInfo ? false : log.info(`Device: ${host} ${deviceName}, ${info}.`);
								})
								.on('debug', (debug) => {
									const emitLog = !enableDebugMode ? false : log.info(`Device: ${host} ${deviceName}, debug: ${debug}.`);
								})
								.on('warn', (warn) => {
									const emitLog = disableLogWarn ? false : log.warn(`Device: ${host} ${deviceName}, ${warn}.`);
								})
								.on('error', (error) => {
									const emitLog = disableLogError ? false : log.error(`Device: ${host} ${deviceName}, ${error}.`);
								});

							//create impulse generator
							const impulseGenerator = new ImpulseGenerator();
							impulseGenerator.on('start', async () => {
								try {
									const startDone = await zone3.start();
									const stopImpulseGenerator = startDone ? await impulseGenerator.stop() : false;
								} catch (error) {
									const emitLog = disableLogError ? false : log.error(`Device: ${host} ${deviceName}, ${error}, trying again.`);
								};
							}).on('state', (state) => {
								const emitLog = !enableDebugMode ? false : state ? log.info(`Device: ${host} ${deviceName}, Start impulse generator started.`) : log.info(`Device: ${host} ${deviceName}, Start impulse generator stopped.`);
							});

							//start impulse generator
							await impulseGenerator.start([{ name: 'start', sampling: 45000 }]);
						} catch (error) {
							throw new Error(`Device: ${host} ${deviceName}, Did finish launching error: ${error}.`);
						}
						break;
					case 3: //surround
						try {
							const surround = new Surround(api, device, zoneControl, deviceName, host, port, generation, devInfoFile, inputsFile, inputsNamesFile, inputsTargetVisibilityFile, refreshInterval);
							surround.on('publishAccessory', (accessory) => {
								api.publishExternalAccessories(PluginName, [accessory]);
								const emitLog = disableLogSuccess ? false : log.success(`Device: ${host} ${deviceName}, Published as external accessory.`);
							})
								.on('devInfo', (devInfo) => {
									const emitLog = disableLogDeviceInfo ? false : log.info(devInfo);
								})
								.on('success', (success) => {
									const emitLog = disableLogSuccess ? false : log.success(`Device: ${host} ${deviceName}, ${success}.`);
								})
								.on('info', (info) => {
									const emitLog = disableLogInfo ? false : log.info(`Device: ${host} ${deviceName}, ${info}.`);
								})
								.on('debug', (debug) => {
									const emitLog = !enableDebugMode ? false : log.info(`Device: ${host} ${deviceName}, debug: ${debug}.`);
								})
								.on('warn', (warn) => {
									const emitLog = disableLogWarn ? false : log.warn(`Device: ${host} ${deviceName}, ${warn}.`);
								})
								.on('error', (error) => {
									const emitLog = disableLogError ? false : log.error(`Device: ${host} ${deviceName}, ${error}.`);
								});

							//create impulse generator
							const impulseGenerator = new ImpulseGenerator();
							impulseGenerator.on('start', async () => {
								try {
									const startDone = await surround.start();
									const stopImpulseGenerator = startDone ? await impulseGenerator.stop() : false;
								} catch (error) {
									const emitLog = disableLogError ? false : log.error(`Device: ${host} ${deviceName}, ${error}, trying again.`);
								};
							}).on('state', (state) => {
								const emitLog = !enableDebugMode ? false : state ? log.info(`Device: ${host} ${deviceName}, Start impulse generator started.`) : log.info(`Device: ${host} ${deviceName}, Start impulse generator stopped.`);
							});

							//start impulse generator
							await impulseGenerator.start([{ name: 'start', sampling: 45000 }]);
						} catch (error) {
							throw new Error(`Device: ${host} ${deviceName}, Did finish launching error: ${error}.`);
						}
						break;
					default:
						const emitLog = disableLogWarn ? false : log.warn(`Device: ${host} ${deviceName}, unknown zone: ${zoneControl}.`);
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