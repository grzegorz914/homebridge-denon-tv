import { join } from 'path';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import MainZone from './src/mainzone.js';
import Zone2 from './src/zone2.js';
import Zone3 from './src/zone3.js';
import Surrounds from './src/surrounds.js';
import PassThroughInputs from './src/passthroughinputs.js';
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

				//check accessory is enabled
				const zoneControl = device.zoneControl ?? -1;
				if (zoneControl === -1) {
					continue;
				}

				const name = device.name;
				const host = device.host;
				const port = device.port;
				const generation = device.generation ?? 0;

				if (!name || !host || !port) {
					log.warn(`Name: ${name ? 'OK' : name}, host: ${host ? 'OK' : host}, port: ${port ? 'OK' : port}}, in config wrong or missing.`);
					return;
				}

				//log config
				const enableDebugMode = device.enableDebugMode || false;
				const disableLogDeviceInfo = device.disableLogDeviceInfo || false;
				const disableLogInfo = device.disableLogInfo || false;
				const disableLogSuccess = device.disableLogSuccess || false;
				const disableLogWarn = device.disableLogWarn || false;
				const disableLogError = device.disableLogError || false;
				const debug = enableDebugMode ? log.info(`Device: ${host} ${name}, debug: Did finish launching.`) : false;
				const config = {
					...device,
					mqtt: {
						...device.mqtt,
						passwd: 'removed'
					}
				}
				const debug1 = !enableDebugMode ? false : log.info(`Device: ${host} ${name}, debug: Config: ${JSON.stringify(config, null, 2)}.`);

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
						inputsTargetVisibilityFile
					];

					files.forEach((file) => {
						if (!existsSync(file)) {
							writeFileSync(file, '');
						}
					});
				} catch (error) {
					const emitLog = disableLogError ? false : log.error(`Device: ${host} ${name}, Prepare files error: ${error}.`);
					return;
				}

				//zones
				try {
					let zone;
					switch (zoneControl) {
						case 0: //main zone
							zone = new MainZone(api, device, name, host, port, generation, zoneControl, devInfoFile, inputsFile, inputsNamesFile, inputsTargetVisibilityFile);
							break;
						case 1: //zone 2
							zone = new Zone2(api, device, name, host, port, generation, zoneControl, devInfoFile, inputsFile, inputsNamesFile, inputsTargetVisibilityFile);
							break;
						case 2: //zone 3
							zone = new Zone3(api, device, name, host, port, generation, zoneControl, devInfoFile, inputsFile, inputsNamesFile, inputsTargetVisibilityFile);
							break;
						case 3: //surrounds
							zone = new Surrounds(api, device, name, host, port, generation, zoneControl, devInfoFile, inputsFile, inputsNamesFile, inputsTargetVisibilityFile);
							break;
						case 4: //pass through inputs
							zone = new PassThroughInputs(api, device, name, host, port, generation, zoneControl, devInfoFile, inputsFile, inputsNamesFile, inputsTargetVisibilityFile);
							break;
						default:
							const emitLog = disableLogWarn ? false : log.warn(`Device: ${host} ${name}, unknown zone: ${zoneControl}.`);
							return;
					}

					zone.on('publishAccessory', (accessory) => {
						api.publishExternalAccessories(PluginName, [accessory]);
						const emitLog = disableLogSuccess ? false : log.success(`Device: ${host} ${name}, Published as external accessory.`);
					})
						.on('devInfo', (devInfo) => {
							const emitLog = disableLogDeviceInfo ? false : log.info(devInfo);
						})
						.on('success', (success) => {
							const emitLog = disableLogSuccess ? false : log.success(`Device: ${host} ${name}, ${success}.`);
						})
						.on('info', (info) => {
							const emitLog = disableLogInfo ? false : log.info(`Device: ${host} ${name}, ${info}.`);
						})
						.on('debug', (debug) => {
							const emitLog = !enableDebugMode ? false : log.info(`Device: ${host} ${name}, debug: ${debug}.`);
						})
						.on('warn', (warn) => {
							const emitLog = disableLogWarn ? false : log.warn(`Device: ${host} ${name}, ${warn}.`);
						})
						.on('error', (error) => {
							const emitLog = disableLogError ? false : log.error(`Device: ${host} ${name}, ${error}.`);
						});

					//create impulse generator
					const impulseGenerator = new ImpulseGenerator();
					impulseGenerator.on('start', async () => {
						try {
							const startDone = await zone.start();
							const stopImpulseGenerator = startDone ? await impulseGenerator.stop() : false;

							//start device impulse generator 
							const startImpulseGenerator = stopImpulseGenerator ? await zone.startImpulseGenerator() : false;
						} catch (error) {
							const emitLog = disableLogError ? false : log.error(`Device: ${host} ${name}, ${error}, trying again.`);
						}
					}).on('state', (state) => {
						const emitLog = !enableDebugMode ? false : state ? log.info(`Device: ${host} ${name}, Start impulse generator started.`) : log.info(`Device: ${host} ${name}, Start impulse generator stopped.`);
					});

					//start impulse generator
					await impulseGenerator.start([{ name: 'start', sampling: 45000 }]);
				} catch (error) {
					const emitLog = disableLogError ? false : log.error(`Device: ${host} ${name}, Did finish launching error: ${error}.`);
				}

				await new Promise(resolve => setTimeout(resolve, 500));
			}
		});
	}

	configureAccessory(accessory) {
		this.accessories.push(accessory);
	}
}

export default (api) => {
	api.registerPlatform(PluginName, PlatformName, DenonPlatform);
}