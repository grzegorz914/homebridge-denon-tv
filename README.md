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
* Power ON/OFF short press tile in HomeKit app.
* RC/Media control is possible after you go to the RC app on iPhone/iPad.
* Speaker control is possible after you go to RC app on iPhone/iPad `Speaker Service`.
* Legacy Volume and Mute control is possible throught extra `lightbulb`/`fan` (slider).
* Inputs/Surrounds can be changed using Inputs selector in the Home app or using extra tile.
* Digital Input Modes can be controlled by creating separate tile in the buttons section.
* Siri can be used for all functions, some times need create legacy buttons/switches/sensors.
* Automations can be used for all functions, some times need create legacy buttons/switches/sensors.
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
| `zoneControl` | Here choose which zone will be controlled by this section `0 - Main Zone`, `1 - Zone 2`, `2 - Zone 3`, `3 - Surround Mode`. |
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
| `enableDebugMode` | If enabled, deep log will be present in homebridge console. |
| `disableLogInfo` | If enabled, disable log info, all values and state will not be displayed in Homebridge log console. |
| `disableLogDeviceInfo` | If enabled, add ability to disable log device info by every connections device to the network. |
| `disableLogConnectError` | If enabled, disable logging device connect error. |
| `masterPower` | If enabled, then the Power switch for that zone will turn the entire receiver `ON` or `OFF/STANDBY` rather than just the zone itself. |
| `masterVolume`| If enabled, then the Volume for that zone will set the entire receiver `UP` or `DOWN` rather than just the zone itself, (only for the Zone 1 and 2). |
| `masterMute`| If enabled, then the Mute switch for that zone will muted the entire receiver `ON` or `OFF` rather than just the zone itself, (only for the Zone 1 and 2). |
| `volumeControl` | Here choose what a additional volume control mode You want to use, `0 - None/Disabled`, `1 - Lightbulb`, `2 - Fan`. |
| `infoButtonCommand` | Here choose the function for `I` button in RC app. |
| `refreshInterval` | Here set the data refresh interval. |
| `enableRestFul` | If enabled, RESTful server will start automatically and respond to any path request. |
| `restFulPort` | Here set the listening `Port` for RESTful server, every zone need own port. |
| `restFulDebug` | If enabled, deep log will be present in homebridge console for RESTFul server. |
| `enableMqtt` | If enabled, MQTT Broker will start automatically and publish all awailable PV installation data. |
| `mqttHost` | Here set the `IP Address` or `Hostname` for MQTT Broker. |
| `mqttPort` | Here set the `Port` for MQTT Broker, default 1883. |
| `mqttClientId` | Here optional set the `Client Id` of MQTT Broker. |
| `mqttPrefix` | Here set the `Prefix` for `Topic` or leave empty. |
| `mqttAuth` | If enabled, MQTT Broker will use authorization credentials. |
| `mqttUser` | Here set the MQTT Broker user. |
| `mqttPasswd` | Here set the MQTT Broker password. |
| `mqttDebug` | If enabled, deep log will be present in homebridge console for MQTT. |
| `AV Surround Mode` | This extra Accessory will control all functions of Main Zone except `Inputs` and `Buttons`. |

### RESTFul Integration

* Request: `http//homebridge_ip_address:port/path`.
* Path: `info`, `state`, `picture`, `surround`.
* Respone as JSON object.

### MQTT Integration

| Direction | Topic | Message | Payload Data |
| --- | --- | --- | --- |
|  Publish   | `Info`, `State`, `Picture`, `Surround` | `{"Power": {"value": OFF}}` | JSON object. |
|  Subscribe   | `Set` | `{"Power": true}` | JSON object. |

| Subscribe | Key | Value | Type | Description |
| --- | --- | --- | --- | --- |
| Denon/Marantz |     |     |     |      |
|     | `Power` | `true`, `false` | boolean | Power state. |
|     | `Input` | `SAT/CBL` | string | Set input. |
|     | `Surround` | `MUSIC` | string | Set surround mode. |
|     | `RcControl` | `NS9E` | string | Send RC command. |
|     | `Volume` | `100` | integer | Set volume. |
|     | `Mute` | `true`, `false` | boolean | Set mute. |
