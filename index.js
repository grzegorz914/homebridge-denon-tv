import { join } from 'path';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import Denon from './src/denon.js';
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
		this.hosts = [];
		this.denon = null;
		this.denonInfo = null;

		const prefDir = join(api.user.storagePath(), 'denonTv');
		try {
			mkdirSync(prefDir, { recursive: true });
		} catch (error) {
			log.error(`Prepare directory error: ${error.message ?? error}`);
			return;
		}

		api.on('didFinishLaunching', async () => {
			for (const device of config.devices) {
				const zoneControl = device.zoneControl ?? -1;
				if (zoneControl === -1) continue;

				const { name, host, port } = device;
				if (!name || !host || !port) {
					log.warn(`Invalid config for device. Name: ${name || 'missing'}, Host: ${host || 'missing'}, Port: ${port || 'missing'}`);
					continue;
				}

				//refresh interval
				const refreshInterval = (device.refreshInterval ?? 5) * 1000;

				//log config
				const logLevel = {
					devInfo: device.log?.deviceInfo,
					success: device.log?.success,
					info: device.log?.info,
					warn: device.log?.warn,
					error: device.log?.error,
					debug: device.log?.debug
				};

				if (logLevel.debug) {
					log.info(`Device: ${host} ${name}, debug: Did finish launching.`);
					const safeConfig = {
						...device,
						mqtt: {
							auth: {
								...device.mqtt?.auth,
								passwd: 'removed',
							}
						},
					};
					log.info(`Device: ${host} ${name}, debug: Config: ${JSON.stringify(safeConfig, null, 2)}`);
				}

				const postFix = `${ZoneNameShort[zoneControl]}_${host.replace(/\./g, '')}`;
				const files = {
					devInfo: `${prefDir}/devInfo_${host.replace(/\./g, '')}`,
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
				} catch (error) {
					if (logLevel.error) log.error(`Device: ${host} ${name}, Prepare files error: ${error.message ?? error}`);
					continue;
				}

				try {
					// create impulse generator
					const impulseGenerator = new ImpulseGenerator()
						.on('start', async () => {
							try {
								let denon = this.denon;
								let denonInfo = this.denonInfo;
								const isNewHost = !this.hosts.includes(host);
								if (isNewHost) {
									this.hosts.push(host);

									denon = new Denon(device, files.devInfo)
										.on('success', msg => log.success(`Device: ${host}, ${msg}`))
										.on('info', msg => log.info(`Device: ${host}, ${msg}`))
										.on('debug', msg => log.info(`Device: ${host}, debug: ${msg}`))
										.on('warn', msg => log.warn(`Device: ${host}, ${msg}`))
										.on('error', msg => log.error(`Device: ${host}, ${msg}`));

									denonInfo = await denon.connect();
									if(!denonInfo) return;

									this.denon = denon;
									this.denonInfo = denonInfo;

									//start denon impulse generator
									await denon.impulseGenerator.state(true, [{ name: 'connect', sampling: 90000 }], false);
								}

								let zone;
								switch (zoneControl) {
									case 0: zone = new MainZone(api, denon, denonInfo, device, files.devInfo, files.inputs, files.inputsNames, files.inputsVisibility); break;
									case 1: zone = new Zone2(api, denon, denonInfo, device, files.devInfo, files.inputs, files.inputsNames, files.inputsVisibility); break;
									case 2: zone = new Zone3(api, denon, denonInfo, device, files.devInfo, files.inputs, files.inputsNames, files.inputsVisibility); break;
									case 3: zone = new Surrounds(api, denon, denonInfo, device, files.devInfo, files.inputs, files.inputsNames, files.inputsVisibility); break;
									case 4: zone = new PassThroughInputs(api, denon, denonInfo, device, files.devInfo, files.inputs, files.inputsNames, files.inputsVisibility); break;
									default:
										if (logLevel.warn) log.warn(`Device: ${host} ${name}, unknown zone: ${zoneControl}`);
										return;
								}

								zone.on('devInfo', (msg) => log.info(msg))
									.on('success', (msg) => log.success(`Device: ${host} ${name}, ${msg}`))
									.on('info', (msg) => log.info(`Device: ${host} ${name}, ${msg}`))
									.on('debug', (msg) => log.info(`Device: ${host} ${name}, debug: ${msg}`))
									.on('warn', (msg) => log.warn(`Device: ${host} ${name}, ${msg}`))
									.on('error', (msg) => log.error(`Device: ${host} ${name}, ${msg}`));

								const accessory = await zone.start();
								if (accessory) {
									api.publishExternalAccessories(PluginName, [accessory]);
									if (logLevel.success) log.success(`Device: ${host} ${name}, Published as external accessory.`);

									//start impulse generator for zone
									await zone.startStopImpulseGenerator(true, [{ name: 'checkState', sampling: refreshInterval }]);
								}

								//stop start impulse generator
								await impulseGenerator.state(false);
							} catch (error) {
								if (logLevel.error) log.error(`Device: ${host} ${name}, Start impulse generator error: ${error.message ?? error}, trying again.`);
							}
						})
						.on('state', (state) => {
							if (logLevel.debug) log.info(`Device: ${host} ${name}, Start impulse generator ${state ? 'started' : 'stopped'}.`);
						});

					// start impulse generator
					await impulseGenerator.state(true, [{ name: 'start', sampling: 120000 }]);
				} catch (error) {
					if (logLevel.error) log.error(`Device: ${host} ${name}, Did finish launching error: ${error.message ?? error}`);
				}
				await new Promise(r => setTimeout(r, 500));
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

