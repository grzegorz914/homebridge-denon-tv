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
		if (!config || !Array.isArray(config.devices)) {
			log.warn(`No configuration found for ${PluginName}.`);
			return;
		}

		this.accessories = [];

		const prefDir = join(api.user.storagePath(), 'denonTv');
		try {
			mkdirSync(prefDir, { recursive: true });
		} catch (err) {
			log.error(`Prepare directory error: ${err}`);
			return;
		}

		api.on('didFinishLaunching', async () => {
			for (const device of config.devices) {
				const zoneControl = device.zoneControl ?? -1;
				if (zoneControl === -1) continue;

				const { name, host, port, generation = 0 } = device;
				if (!name || !host || !port) {
					log.warn(`Invalid config for device. Name: ${name || 'missing'}, Host: ${host || 'missing'}, Port: ${port || 'missing'}`);
					return;
				}

				const enableDebugMode = !!device.enableDebugMode;
				const logLevel = {
					debug: enableDebugMode,
					info: !device.disableLogInfo,
					success: !device.disableLogSuccess,
					warn: !device.disableLogWarn,
					error: !device.disableLogError,
					devInfo: !device.disableLogDeviceInfo,
				};

				if (enableDebugMode) {
					log.info(`Device: ${host} ${name}, debug: Did finish launching.`);
					const safeConfig = {
						...device,
						mqtt: {
							...device.mqtt,
							passwd: 'removed',
						},
					};
					log.info(`Device: ${host} ${name}, debug: Config: ${JSON.stringify(safeConfig, null, 2)}`);
				}

				const postFix = `${ZoneNameShort[zoneControl]}_${host.replace(/\./g, '')}`;
				const files = {
					devInfo: `${prefDir}/devInfo_${postFix}`,
					inputs: `${prefDir}/inputs_${postFix}`,
					inputsNames: `${prefDir}/inputsNames_${postFix}`,
					inputsVisibility: `${prefDir}/inputsTargetVisibility_${postFix}`,
				};

				try {
					Object.values(files).forEach((file) => {
						if (!existsSync(file)) {
							writeFileSync(file, '');
						}
					});
				} catch (err) {
					if (logLevel.error) log.error(`Device: ${host} ${name}, Prepare files error: ${err}`);
					return;
				}

				try {
					let zone;
					switch (zoneControl) {
						case 0: zone = new MainZone(api, device, name, host, port, generation, zoneControl, ...Object.values(files)); break;
						case 1: zone = new Zone2(api, device, name, host, port, generation, zoneControl, ...Object.values(files)); break;
						case 2: zone = new Zone3(api, device, name, host, port, generation, zoneControl, ...Object.values(files)); break;
						case 3: zone = new Surrounds(api, device, name, host, port, generation, zoneControl, ...Object.values(files)); break;
						case 4: zone = new PassThroughInputs(api, device, name, host, port, generation, zoneControl, ...Object.values(files)); break;
						default:
							if (logLevel.warn) log.warn(`Device: ${host} ${name}, unknown zone: ${zoneControl}`);
							return;
					}

					zone.on('publishAccessory', (accessory) => {
						api.publishExternalAccessories(PluginName, [accessory]);
						if (logLevel.success) log.success(`Device: ${host} ${name}, Published as external accessory.`);
					})
						.on('devInfo', (msg) => logLevel.devInfo && log.info(msg))
						.on('success', (msg) => logLevel.success && log.success(`Device: ${host} ${name}, ${msg}`))
						.on('info', (msg) => logLevel.info && log.info(`Device: ${host} ${name}, ${msg}`))
						.on('debug', (msg) => logLevel.debug && log.info(`Device: ${host} ${name}, debug: ${msg}`))
						.on('warn', (msg) => logLevel.warn && log.warn(`Device: ${host} ${name}, ${msg}`))
						.on('error', (msg) => logLevel.error && log.error(`Device: ${host} ${name}, ${msg}`));

					const impulseGenerator = new ImpulseGenerator();
					impulseGenerator
						.on('start', async () => {
							try {
								if (await zone.start()) {
									await impulseGenerator.stop();
									await zone.startImpulseGenerator();
								}
							} catch (err) {
								if (logLevel.error) log.error(`Device: ${host} ${name}, ${err}, trying again.`);
							}
						})
						.on('state', (state) => {
							if (logLevel.debug) {
								log.info(`Device: ${host} ${name}, Start impulse generator ${state ? 'started' : 'stopped'}.`);
							}
						});

					await impulseGenerator.start([{ name: 'start', sampling: 45000 }]);
				} catch (err) {
					if (logLevel.error) log.error(`Device: ${host} ${name}, Did finish launching error: ${err}`);
				}

				await new Promise((resolve) => setTimeout(resolve, 500));
			}
		});
	}

	configureAccessory(accessory) {
		this.accessories.push(accessory);
	}
}

export default (api) => {
	api.registerPlatform(PluginName, PlatformName, DenonPlatform);
};
