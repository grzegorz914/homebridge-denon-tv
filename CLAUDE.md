# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`homebridge-denon-tv` is a Homebridge platform plugin that exposes Denon/Marantz AV Receivers as HomeKit accessories. It supports multi-zone control (Main Zone, Zone 2, Zone 3, Sound Mode, Pass-Through Inputs), MQTT v5 integration, and a RESTful API.

The project uses **ES modules** (`"type": "module"` in package.json) — all imports use `.js` extensions and there is no build step. The entry point is [index.js](index.js).

## Commands

Install dependencies:
```
npm install
```

Link for local Homebridge testing (from the plugin directory):
```
npm link
```

There is no test suite (`npm test` exits with error by design).

## Architecture

### Startup flow

1. **[index.js](index.js)** — Registers `DenonPlatform` with Homebridge. On `didFinishLaunching`, groups config entries by `host`, deduplicates zones, then calls `setupDevice()` for each physical receiver.
2. **`setupDevice()`** — Creates an `ImpulseGenerator` that retries `startDevice()` every 120 s until successful.
3. **`startDevice()`** — Instantiates `Denon`, calls `denon.connect()` to fetch device info via HTTP, then switches to the Denon class's own `ImpulseGenerator` (reconnect every 90 s, state poll every 5 s). Registers each zone.
4. **`registerZone()`** — Instantiates the appropriate zone class based on `zoneControl` (0–4) and calls `zoneInstance.start()`, then publishes the accessory externally.

### Key classes

| File | Role |
|---|---|
| [src/denon.js](src/denon.js) | HTTP client (axios) for AVR. Fetches device info, sends commands via `/goform/formiPhoneAppDirect.xml?<cmd>`. Owns the periodic `ImpulseGenerator`. All HTTP calls run through a promise-chain execution queue to prevent race conditions. |
| [src/zone.js](src/zone.js) | Base class for all zone types. Parses XML status responses, resolves inputs/sound modes via `InputConversion`/`SoundModeConversion` lookup tables, handles state polling triggered by `denon`'s `checkState` event. |
| [src/mainzone.js](src/mainzone.js) | Main Zone accessory — extends EventEmitter, composes `Zone` + `Mqtt` + `RestFul`. Builds the HAP `Television` service, `VolumeControl`, `Buttons`, and `Sensors`. |
| [src/zone2.js](src/zone2.js) / [src/zone3.js](src/zone3.js) | Same pattern as `MainZone` for Zone 2/3. |
| [src/surrounds.js](src/surrounds.js) | Sound Mode zone (zoneControl=3). Uses surround mode list instead of input list. |
| [src/passthroughinputs.js](src/passthroughinputs.js) | Pass-Through Inputs zone (zoneControl=4). Fixed input list from constants. |
| [src/mqtt.js](src/mqtt.js) | MQTT v5 client (QoS 1, persistent session). Subscribes to `<prefix>/Set`, publishes state to `<prefix>/<key>`. |
| [src/restful.js](src/restful.js) | Express v5 REST server. GET `/<key>` returns cached state; POST `/` dispatches `set` events. |
| [src/impulsegenerator.js](src/impulsegenerator.js) | Thin `EventEmitter` wrapper around `setInterval`. Emits named events on each tick; used for both startup retry and periodic polling. |
| [src/functions.js](src/functions.js) | Utilities: async file read/write (JSON-aware), string sanitization (diacritics → ASCII), linear value scaling. |
| [src/constants.js](src/constants.js) | All lookup tables and enumerations: API URL paths, XML command bodies, zone names, input/sound mode conversion maps, picture mode maps, `ZonePrefixMap`, etc. |

### Device generations

`generation` (0/1/2) selects the device-info URL and response shape:
- `0` (2010–2012): `/goform/formMainZone_MainZoneXml.xml`, parses `item`
- `1` (2013–2022): `/goform/Deviceinfo.xml`, parses `Device_Info`
- `2` (2023+): same URL as gen 1 but uses HTTPS with `rejectUnauthorized: false`

### Zone control values

| `zoneControl` | Class | Short name |
|---|---|---|
| 0 | MainZone | MZ |
| 1 | Zone2 | Z2 |
| 2 | Zone3 | Z3 |
| 3 | Surrounds | SM |
| 4 | PassThroughInputs | PTI |

Multiple `zoneControl` entries with the same `host` share a single `Denon` instance (and therefore a single HTTP connection and impulse generator).

### Persistent state files

Stored in `<homebridgeStoragePath>/denonTv/`:
- `devInfo_<hostNodots>` — device info JSON
- `inputs_<ZoneShort>_<hostNodots>` — discovered/saved inputs
- `inputsNames_<ZoneShort>_<hostNodots>` — user-renamed inputs
- `inputsTargetVisibility_<ZoneShort>_<hostNoots>` — HomeKit input visibility state

### Adding a new command

Commands are sent as plain strings to `denon.send(command)`, which appends them to `/goform/formiPhoneAppDirect.xml?`. Command references are in the Denon Control Protocol spreadsheet at [doc/Denon Control Protocol.xlsx](doc/Denon%20Control%20Protocol.xlsx).

New input/sound mode mappings belong in `InputConversion` or `SoundModeConversion` in [src/constants.js](src/constants.js).
