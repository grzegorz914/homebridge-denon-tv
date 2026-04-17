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

		const prefDir = join(api.user.storagePath(), 'denonTv');
		try {
			mkdirSync(prefDir, { recursive: true });
		} catch (error) {
			log.error(`Prepare directory error: ${error.message ?? error}`);
			return;
		}

		api.on('didFinishLaunching', () => {
			// ===== GROUP ZONES BY HOST =====
			const seenZones = [];
			const deviceMap = {};

			for (const zone of config.devices) {
				const { name, host, port, zoneControl } = zone;

				if (!name || !host || !port || zoneControl === -1) {
					log.warn(`Device: ${host || 'host missing'}, ${name || 'name missing'}, ${port || 'port missing'}${zoneControl === -1 ? ', zone disabled' : ''}`);
					continue;
				}

				const key = `${host}:${zoneControl}`;
				if (seenZones.includes(key)) {
					log.warn(`Duplicate zone ${zoneControl} for ${host}`);
					continue;
				}

				seenZones.push(key);
				if (!deviceMap[host]) deviceMap[host] = { zones: [] };
				deviceMap[host].zones.push(zone);
			}

			// ===== LAUNCH EACH DEVICE =====
			for (const host of Object.keys(deviceMap)) {
				this.setupDevice(host, deviceMap[host].zones, prefDir, log, api);
			}
		});
	}

	// ── Per-device setup ──────────────────────────────────────────────────────

	setupDevice(host, zones, prefDir, log, api) {
		const devInfoFile = `${prefDir}/devInfo_${host.replace(/\./g, '')}`;

		try {
			if (!existsSync(devInfoFile)) writeFileSync(devInfoFile, '');
		} catch (error) {
			log.error(`Device: ${host}, info file init error: ${error.message ?? error}`);
			return;
		}

		// Log level is driven by the first zone's config (device-wide setting)
		const baseLogLevel = {
			success: zones[0].log?.success,
			info: zones[0].log?.info,
			warn: zones[0].log?.warn,
			error: zones[0].log?.error,
			debug: zones[0].log?.debug,
		};

		// The startup impulse generator retries the full connect cycle every
		// 120 s until it succeeds, then stops itself.
		const impulseGenerator = new ImpulseGenerator()
			.on('start', async () => {
				try {
					await this.startDevice(
						host, zones, devInfoFile, prefDir,
						baseLogLevel, log, api, impulseGenerator
					);
				} catch (error) {
					if (baseLogLevel.error) log.error(`Device: ${host}, start error: ${error.message ?? error}`);
				}
			})
			.on('state', (state) => {
				if (baseLogLevel.debug) log.info(`Device: ${host}, impulse ${state ? 'started' : 'stopped'}`);
			});

		impulseGenerator.state(true, [{ name: 'start', sampling: 120_000 }]);
	}

	// ── Connect and launch all zones for one device ───────────────────────────

	async startDevice(host, zones, devInfoFile, prefDir, baseLogLevel, log, api, impulseGenerator) {
		const denon = new Denon(zones[0], devInfoFile)
			.on('success', (msg) => baseLogLevel.success && log.success(`Device: ${host}, ${msg}`))
			.on('info', (msg) => log.info(`Device: ${host}, ${msg}`))
			.on('debug', (msg) => baseLogLevel.debug && log.info(`Device: ${host}, debug: ${msg}`))
			.on('warn', (msg) => log.warn(`Device: ${host}, ${msg}`))
			.on('error', (msg) => log.error(`Device: ${host}, ${msg}`));

		const denonInfo = await denon.connect();
		if (!denonInfo) {
			log.warn(`Device: ${host}, no AVR data`);
			return;
		}

		// Stop startup generator and hand off to the denon class generator
		await impulseGenerator.state(false);
		await denon.impulseGenerator.state(true, [
			{ name: 'connect', sampling: 90_000 },
			{ name: 'checkState', sampling: 5_000 },
		], false);

		// ===== REGISTER EACH ZONE =====
		for (const zone of zones) {
			await this.registerZone({ zone, host, denon, denonInfo, devInfoFile, prefDir, log, api });
		}
	}

	// ── Register a single zone as a Homebridge accessory ─────────────────────

	async registerZone({ zone, host, denon, denonInfo, devInfoFile, prefDir, log, api }) {
		const { name, zoneControl } = zone;

		const logLevel = {
			devInfo: zone.log?.deviceInfo,
			success: zone.log?.success,
			info: zone.log?.info,
			warn: zone.log?.warn,
			error: zone.log?.error,
			debug: zone.log?.debug,
		};

		if (logLevel.debug) {
			const safeConfig = {
				...zone,
				mqtt: { auth: { ...zone.mqtt?.auth, passwd: 'removed' } },
			};
			log.info(`Device: ${host} ${name}, debug config: ${JSON.stringify(safeConfig, null, 2)}`);
		}

		const postFix = `${ZoneNameShort[zoneControl]}_${host.replace(/\./g, '')}`;
		const zoneFiles = {
			devInfo: devInfoFile,
			inputs: `${prefDir}/inputs_${postFix}`,
			inputsNames: `${prefDir}/inputsNames_${postFix}`,
			inputsVisibility: `${prefDir}/inputsTargetVisibility_${postFix}`,
		};

		try {
			Object.values(zoneFiles).forEach((file) => {
				if (!existsSync(file)) writeFileSync(file, '');
			});
		} catch (error) {
			if (logLevel.error) log.error(`Device: ${host} ${name}, file error: ${error.message ?? error}`);
			return;
		}

		// Construct the zone instance — original constructor signatures preserved
		let zoneInstance;
		switch (zoneControl) {
			case 0: zoneInstance = new MainZone(api, denon, denonInfo, zone, zoneFiles.devInfo, zoneFiles.inputs, zoneFiles.inputsNames, zoneFiles.inputsVisibility); break;
			case 1: zoneInstance = new Zone2(api, denon, denonInfo, zone, zoneFiles.devInfo, zoneFiles.inputs, zoneFiles.inputsNames, zoneFiles.inputsVisibility); break;
			case 2: zoneInstance = new Zone3(api, denon, denonInfo, zone, zoneFiles.devInfo, zoneFiles.inputs, zoneFiles.inputsNames, zoneFiles.inputsVisibility); break;
			case 3: zoneInstance = new Surrounds(api, denon, denonInfo, zone, zoneFiles.devInfo, zoneFiles.inputs, zoneFiles.inputsNames, zoneFiles.inputsVisibility); break;
			case 4: zoneInstance = new PassThroughInputs(api, denon, denonInfo, zone, zoneFiles.devInfo, zoneFiles.inputs, zoneFiles.inputsNames, zoneFiles.inputsVisibility); break;
			default:
				if (logLevel.warn) log.warn(`Device: ${host} ${name}, unknown zone: ${zoneControl}`);
				return;
		}

		zoneInstance
			.on('devInfo', (msg) => logLevel.devInfo && log.info(msg))
			.on('success', (msg) => logLevel.success && log.success(`Device: ${host} ${name}, ${msg}`))
			.on('info', (msg) => log.info(`Device: ${host} ${name}, ${msg}`))
			.on('debug', (msg) => logLevel.debug && log.info(`Device: ${host} ${name}, debug: ${msg}`))
			.on('warn', (msg) => log.warn(`Device: ${host} ${name}, ${msg}`))
			.on('error', (msg) => log.error(`Device: ${host} ${name}, ${msg}`));

		const accessory = await zoneInstance.start();
		if (!accessory) return;

		api.publishExternalAccessories(PluginName, [accessory]);
		if (logLevel.success) log.success(`Device: ${host} ${name}, published`);
	}

	// ── Homebridge accessory cache ────────────────────────────────────────────

	configureAccessory(accessory) {
		this.accessories.push(accessory);
	}
}

export default (api) => {
	api.registerPlatform(PluginName, PlatformName, DenonPlatform);
};