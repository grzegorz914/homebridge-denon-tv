<p align="center">
  <a href="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/main/graphics/homebridge-denon-tv.png" width="540"></a>
</p>

<span align="center">

# Homebridge Denon TV

[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://badgen.net/npm/dt/homebridge-denon-tv?color=purple)](https://www.npmjs.com/package/homebridge-denon-tv)
[![npm](https://badgen.net/npm/v/homebridge-denon-tv?color=purple)](https://www.npmjs.com/package/homebridge-denon-tv)
[![npm](https://img.shields.io/npm/v/homebridge-denon-tv/beta.svg?style=flat-square)](https://www.npmjs.com/package/homebridge-denon-tv)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-denon-tv.svg)](https://github.com/grzegorz914/homebridge-denon-tv/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-denon-tv.svg)](https://github.com/grzegorz914/homebridge-denon-tv/issues)

Homebridge plugin for Denon/Marantz AV Receivers series X/SR.
Tested Denon AVR-2112CI, AVR-3311CI, AVR-X6300H, AVR-X2700H, AVC-X4800H, Marantz SR8012, SR6013, M-CR611, PM7000N.

</span>

## Package Requirements

| Package | Installation | Role | Required |
| --- | --- | --- | --- |
| [Homebridge](https://github.com/homebridge/homebridge) | [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) | HomeKit Bridge | Required |
| [Config UI X](https://github.com/homebridge/homebridge-config-ui-x) | [Config UI X Wiki](https://github.com/homebridge/homebridge-config-ui-x/wiki) | Homebridge Web User Interface | Recommended |
| [Denon TV](https://www.npmjs.com/package/homebridge-denon-tv) | [Plug-In Wiki](https://github.com/grzegorz914/homebridge-denon-tv/wiki) | Homebridge Plug-In | Required |

## About The Plugin

* Multi Zone control.
* Power ON/OFF control with short press the tile in HomeKit app.
* RC/Media control, RC app on iPhone/iPad.
* Speaker Volume and Mute control with hardware buttons, RC app on iPhone/iPad.
* Volume and Mute control with extra tile `lightbulb`/`fan` (slider).
* Inputs control using inputs whell or extra tile (buttons).
* Surrounds/Pass Trough Inputs control with [extra accessory tile](https://github.com/grzegorz914/homebridge-denon-tv?tab=readme-ov-file#extra-accessory-tile) or with buttons.
* Digital Input Modes control using extra buttons.
* Siri can be used for all functions, some times need to create buttons/switches/sensors.
* Automations can be used for all functions, some times need to create buttons/switches/sensors.
* This plugin is based upon the official documentation: [Denon Control Protocol 2020](https://github.com/grzegorz914/homebridge-denon-tv/blob/main/doc/Denon%20Control%20Protocol.xlsx)
* Support external integrations, [RESTFul](https://github.com/grzegorz914/homebridge-denon-tv?tab=readme-ov-file#restful-integration), [MQTT](https://github.com/grzegorz914/homebridge-denon-tv?tab=readme-ov-file#mqtt-integration).

<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/main/graphics/homekit.png" width="382"></a>
  <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/main/graphics/inputs.png" width="135"></a> <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/main/graphics/rc1.png" width="135"></a>
  <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/main/graphics/RC.png" width="135"></a>
</p>

### Configuration

* First enable [Network Contorl Denon/Marantz](https://manuals.denon.com/avrx6300h/na/en/HJWMSYmehwmguq.php).
* Run this plugin as a [Child Bridge](https://github.com/homebridge/homebridge/wiki/Child-Bridges) (Highly Recommended), this prevent crash Homebridge if plugin crashes.
* Install and use [Homebridge Config UI X](https://github.com/homebridge/homebridge-config-ui-x/wiki) to configure this plugin.
* The `sample-config.json` can be edited and used as an alternative.

<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/main/graphics/ustawienia.png" width="840"></a>
</p>

| Key | Description |
| --- | --- |
| `name` | Here set the accessory *Name* to be displayed in *Homebridge/HomeKit*. |
| `host` | Here set the `Hostname` or `Address IP` of AVR. |
| `port` | Here set the API communication port, if `8080` is not working try to use port `80` which some receivers use alternatively. |
| `zoneControl` | Here choose which zone will be controlled by this section `0 - Main Zone`, `1 - Zone 2`, `2 - Zone 3`, `3 - Surround Mode`, `4 - Pass Through Inputs`. |
| `generation` | Here choose generation of Your device, old `0 - 2010 - 2012`, middle `1 - 2013 - 2022`, new `2 - 2023 and newer`. |
| `getInputsFromDevice` | If enabled, `Inputs` will be loaded direct from device. |
| `getFavoritesFromDevice` | If enabled, `Favorites` will be loaded to the inputs list if exist. |
| `getQuickSmartSelectFromDevice` | If enabled, `Quick/Smart Select` will be loaded to the inputs list if exist. |
| `inputsDisplayOrder` | Here choose display order of the inputs list, `0 - None`, `1 - Ascending by Name`, `2 - Descending by Name`, `3 - Ascending by Reference`, `4 - Ascending by Reference`. |
| `inputs` | Here create `Inputs` which You want expose to the `Homebridge/HomeKit`. |
| `inputs.name` | Here set `Input Name`. |
| `inputs.reference` | Choose from available inputs, the inputs that should be published to and appear in HomeKit app in the device tile as inputs list. |
| `surrounds` | Here create `Surrounds` which You want expose to the `Homebridge/HomeKit`. |
| `surrounds.name` | Here set `Surround Mode Name`. |
| `surrounds.reference` | Here choose `Surround Mode`, the mode that should be published to and appear in HomeKit app in the extra tile as Surrounds List. |
| `passThroughInputs` | Here create `Pass Through Inputs` which You want expose to the `Homebridge/HomeKit`. |
| `passThroughInputs.name` | Here set `Pass ThroughInput Name`. |
| `passThroughInputs.reference` | Choose from available inputs, the inputs that should be published to and appear in HomeKit app in the device tile as inputs list. |
| `buttons` | Here create `Buttons` which You want expose to the `Homebridge/HomeKit` for Main Zone. |
| `buttons.name` | Here set `Button Name`. |
| `buttons.reference` | Here choose Function for this button. |
| `buttons.displayType` | Here choose characteristic type to be exposed in HomeKit app, possible `0 - None/Disabled`, `1 - Outlet`, `2 - Switch`. |
| `buttons.namePrefix` | Here enable/disable the accessory name as a prefix for button name. |
| `buttonsZ2` | Here create `Buttons` which You want expose to the `Homebridge/HomeKit` for Zone 2. |
| `buttonsZ2.name` | Here set `Button Name`. |
| `buttonsZ2.reference` | Here choose function for this button. |
| `buttonsZ2.displayType` | Here choose characteristic type to be exposed in HomeKit app, possible `0 - None/Disabled`, `1 - Outlet`, `2 - Switch`. |
| `buttonsZ2.namePrefix` | Here enable/disable the accessory name as a prefix for button name. |
| `buttonsZ3` | Here create `Buttons` which You want expose to the `Homebridge/HomeKit` for Zone 3. |
| `buttonsZ3.name` | Here set `Button Name`. |
| `buttonsZ3.reference` | Here choose function for this button. |
| `buttonsZ3.displayType` | Here choose characteristic type to be exposed in HomeKit app, possible `0 - None/Disabled`, `1 - Outlet`, `2 - Switch`. |
| `buttonsZ3.namePrefix` | Here enable/disable the accessory name as a prefix for button name. |
| `sensorPower`| If enabled, then the Power will be exposed as a `Contact Sensor`, fired if power ON. |
| `sensorVolume`| If enabled, then the Volume will be exposed as a `Contact Sensor`, fired on every Volume change. |
| `sensorMute`| If enabled, then the Mute will be exposed as a `Contact Sensor`, fired if Mmute ON. |
| `sensorInput`| If enabled, then the Input will be exposed as a `Contact Sensor`, fired on every Input change. |
| `sensorInputs`| Here create custom `Inputs Sensor` which You want expose to the `Homebridge/HomeKit`. |
| `sensorInputs.name` | Here set own `Sensor Name`. |
| `sensorInputs.reference` | Here choose `Input Reference`, sensor fired if switch to this reference. |
| `sensorInputs.displayType` | Here choose characteristic type to be exposed in HomeKit app, `0 - None/Disabled`, `1 - Motion Sensor`, `2 - Occupancy Sensor`, `3 - Contact Sensor`. |
| `sensorInputs.namePrefix` | Here enable/disable the accessory name as a prefix for sensor name. |
| `sensorSurrounds`| Here create custom `Surrounds Sensor` which You want expose to the `Homebridge/HomeKit`. |
| `sensorSurrounds.name` | Here set own `Sensor Name`. |
| `sensorSurrounds.reference` | Here choose `Sensor Reference`, sensor fired if switch to this reference. |
| `sensorSurrounds.displayType` | Here choose characteristic type to be exposed in HomeKit app, `0 - None/Disabled`, `1 - Motion Sensor`, `2 - Occupancy Sensor`, `3 - Contact Sensor`. |
| `sensorSurrounds.namePrefix` | Here enable/disable the accessory name as a prefix for sensor name. |
| `masterPower` | If enabled, then the Power switch for that zone will turn the entire receiver `ON` or `OFF/STANDBY` rather than just the zone itself. |
| `volumeControlNamePrefix` | Here enable/disable the accessory name as a prefix for volume control name. |
| `volumeControlName` | Here set Your own volume control name or leave empty. |
| `volumeControlType` | Here choose what a additional volume control type You want to use, `0 - None/Disabled`, `1 - Lightbulb`, `2 - Fan`. |
| `volumeControlZone` | Here select which zone the volume/mute want control, `0 - Main Zone`, `1 - Zone 2`, `2 - Zone 3`, `3 - Zone 2/3`, `4 - Main Zone + Z2`, `5 - Main Zone + Z3`, `6 - Main Zone + Z2/Z3`, this also working with hardware buttons in RC app. |
| `volumeMax` | Here set the maximum possible volume to set, `0 - 100`. |
| `infoButtonCommand` | Here choose the function for `I` button in RC app. |
| `refreshInterval` | Here set the data refresh interval. |
| `disableLogDeviceInfo` | If enabled, add ability to disable log device info by every connections device to the network. |
| `disableLogInfo` | If enabled, disable log info, all values and state will not be displayed in Homebridge log console. |
| `disableLogSuccess` | If enabled, disable logging device success. |
| `disableLogWarn` | If enabled, disable logging device warnings. |
| `disableLogError` | If enabled, disable logging device error. |
| `enableDebugMode` | If enabled, debug log will be present in homebridge console. |
| `enableRestFul` | If enabled, RESTful server will start automatically and respond to any path request. |
| `restFul` | This is RSTful server. |
| `enable` | If enabled, RESTful server will start automatically and respond to any path request. |
| `port` | Here set the listening `Port` for RESTful server. |
| `debug` | If enabled, debug log will be present in homebridge console for RESTFul server. |
| `mqtt` | This is MQTT Broker. |
| `enable` | If enabled, MQTT Broker will start automatically and publish all awailable PV data. |
| `host` | Here set the `IP Address` or `Hostname` for MQTT Broker. |
| `port` | Here set the `Port` for MQTT Broker, default 1883. |
| `clientId` | Here optional set the `Client Id` of MQTT Broker. |
| `prefix` | Here set the `Prefix` for `Topic` or leave empty. |
| `auth` | If enabled, MQTT Broker will use authorization credentials. |
| `user` | Here set the MQTT Broker user. |
| `passwd` | Here set the MQTT Broker password. |
| `debug` | If enabled, debug log will be present in homebridge console for MQTT. |

### Extra Accessory Tile

* Surround Mode - This extra accessory supports only `Surrounds Control`, `Surrounds Sensors`.
* Pass Tgrough Inputs - This extra accessory supports only `Pass Through Inputs Control`, `Pass Through Inputs Sensors`.

### RESTFul Integration

* Only for Main Zone, Zone 1, Zone 2
* POST data as a JSON Object `{Power: true}`
* Header content type must be `application/json`

| Method | URL | Path | Response | Type |
| --- | --- | --- | --- | --- |
| GET | `http//ip:port/` | `info`, `state`, `picture`, `surround` | `{"Power": {"value": OFF}}` | JSON object. |

| Method | URL | Key | Value | Type | Description |
| --- | --- | --- | --- | --- | --- |
| POST | `http//ip:port` | `Power` | `true`, `false` | boolean | Set power On/Off. |
|      | `http//ip:port` | `Input` | `SAT/CBL` | string | Set input. |
|      | `http//ip:port` | `Surround` | `MUSIC` | string | Set surround mode. |
|      | `http//ip:port` | `RcControl` | `NS9E` | string | Send RC command. |
|      | `http//ip:port` | `Volume` | `0 - 98` | integer | Set volume. |
|      | `http//ip:port` | `Mute` | `true`, `false` | boolean | Set mute On/Off. |

### MQTT Integration

* Only for Main Zone, Zone 1, Zone 2
* Subscribe data as a JSON Object `{Power: true}`

| Method | Topic | Message | Type |
| --- | --- | --- | --- |
| Publish | `Info`, `State`, `Picture`, `Surround` | `{"Power": {"value": OFF}}` | JSON object. |

| Method | Topic | Key | Value | Type | Description |
| --- | --- | --- | --- | --- | --- |
| Subscribe | `Set` |  `Power` | `true`, `false` | boolean | Set power On/Off. |
|     | `Set` |  `Input` | `SAT/CBL` | string | Set input. |
|     | `Set` |  `Surround` | `MUSIC` | string | Set surround mode. |
|     | `Set` |  `RcControl` | `NS9E` | string | Send RC command. |
|     | `Set` |  `Volume` | `0 - 98` | integer | Set volume. |
|     | `Set` |  `Mute` | `true`, `false` | boolean | Set mute. |
