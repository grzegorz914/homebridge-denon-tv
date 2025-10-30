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
| [Homebridge UI <= v5.5.0](https://github.com/homebridge/homebridge-config-ui-x) | [Homebridge UI Wiki](https://github.com/homebridge/homebridge-config-ui-x/wiki) | Homebridge Web User Interface | Recommended |
| [Denon TV](https://www.npmjs.com/package/homebridge-denon-tv) | [Plug-In Wiki](https://github.com/grzegorz914/homebridge-denon-tv/wiki) | Homebridge Plug-In | Required |

## About The Plugin

* This plugin is based upon the official documentation: [Denon Control Protocol 2020](https://github.com/grzegorz914/homebridge-denon-tv/blob/main/doc/Denon%20Control%20Protocol.xlsx)
  * Multi Zone control.
  * Power ON/OFF control with short press the tile in HomeKit app.
  * RC/Media control, RC app on iPhone/iPad.
  * Speaker Volume and Mute control with hardware buttons, RC app on iPhone/iPad.
  * Volume and Mute control with extra tile `lightbulb`/`fan` (slider).
  * Inputs control using inputs whell or buttons.
  * Digital Input Modes control using extra buttons.
  * Surrounds/Pass Trough Inputs control as a [extra accessory tile](https://github.com/grzegorz914/homebridge-denon-tv?tab=readme-ov-file#extra-accessory-tile).
* Siri, some times need to create buttons/switches/sensors.
* Automations, some times need to create buttons/switches/sensors.
* External integrations, [RESTFul](https://github.com/grzegorz914/homebridge-denon-tv?tab=readme-ov-file#restful-integration), [MQTT](https://github.com/grzegorz914/homebridge-denon-tv?tab=readme-ov-file#mqtt-integration).

<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/main/graphics/homekit.png" width="382"></a>
  <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/main/graphics/inputs.png" width="135"></a> <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/main/graphics/rc1.png" width="135"></a>
  <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/main/graphics/RC.png" width="135"></a>
</p>

### Configuration

* First enable [Network Contorl Denon/Marantz](https://manuals.denon.com/avrx6300h/na/en/HJWMSYmehwmguq.php).
* Run this plugin as a [Child Bridge](https://github.com/homebridge/homebridge/wiki/Child-Bridges) (Highly Recommended), this prevent crash Homebridge if plugin crashes.
* Install and use [Homebridge UI <= v5.5.0](https://github.com/homebridge/homebridge-config-ui-x/wiki) to configure this plugin.
* The `sample-config.json` can be edited and used as an alternative.

<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/main/graphics/ustawienia.png" width="840"></a>
</p>

| Key | Description |
| --- | --- |
| `name` | Here set the accessory *Name* to be displayed in *Homebridge/HomeKit*. |
| `host` | Here set the `Hostname` or `Address IP` of AVR. |
| `port` | Here set the API communication port, if `8080` is not working try to use port `80` which some receivers use alternatively. |
| `generation` | Here choose generation of Your device, old `0 - 2010 - 2012`, middle `1 - 2013 - 2022`, new `2 - 2023 and newer`. |
| `zoneControl` | Here choose which zone will be controlled by this section `-1 - None/Disabled`,`0 - Main Zone`, `1 - Zone 2`, `2 - Zone 3`, `3 - Surrounds`, `4 - Pass Through Inputs`. |
| `inputs{}` | Inputs object. |
| `inputs.getFromDevice` | If enabled, `Inputs` will be loaded direct from device. |
| `inputs.getFavoritesFromDevice` | If enabled, `Favorites` will be loaded to the inputs list if exist. |
| `inputs.getQuickSmartSelectFromDevice` | If enabled, `Quick/Smart Select` will be loaded to the inputs list if exist. |
| `inputs.displayOrder` | Here choose display order of the inputs list, `0 - None`, `1 - Ascending by Name`, `2 - Descending by Name`, `3 - Ascending by Reference`, `4 - Ascending by Reference`. |
| `inputs.data[]` | Inputs array. |
| `inputs.data[].name` | Here set `Input Name`. |
| `inputs.data[].reference` | Choose from available inputs, the inputs that should be published to and appear in HomeKit app in the device tile as inputs list. |
| `surrounds.displayOrder` | Here choose display order of the surrounds list, `0 - None`, `1 - Ascending by Name`, `2 - Descending by Name`, `3 - Ascending by Reference`, `4 - Ascending by Reference`. |
| `surrounds.data[]` | Here create `Surrounds` which You want expose to the `Homebridge/HomeKit`. |
| `surrounds.data[].name` | Here set `Surround Mode Name`. |
| `surrounds.data[].reference` | Here choose `Surround Mode`, the mode that should be published to and appear in HomeKit app in the extra tile as Surrounds List. |
| `buttons[]` | Buttons array. |
| `buttons[].name` | Here set `Button Name`. |
| `buttons[].reference` | Here choose Function for this button. |
| `buttons[].displayType` | Here choose characteristic type to be exposed in HomeKit app, possible `0 - None/Disabled`, `1 - Outlet`, `2 - Switch`. |
| `buttons[].namePrefix` | Here enable/disable the accessory name as a prefix for button name. |
| `buttonsZ2[]` | Here create `Buttons` which You want expose to the `Homebridge/HomeKit` for Zone 2. |
| `buttonsZ2[].name` | Here set `Button Name`. |
| `buttonsZ2[].reference` | Here choose function for this button. |
| `buttonsZ2[].displayType` | Here choose characteristic type to be exposed in HomeKit app, possible `0 - None/Disabled`, `1 - Outlet`, `2 - Switch`. |
| `buttonsZ2[].namePrefix` | Here enable/disable the accessory name as a prefix for button name. |
| `buttonsZ3[]` | Here create `Buttons` which You want expose to the `Homebridge/HomeKit` for Zone 3. |
| `buttonsZ3[].name` | Here set `Button Name`. |
| `buttonsZ3[].reference` | Here choose function for this button. |
| `buttonsZ3[].displayType` | Here choose characteristic type to be exposed in HomeKit app, possible `0 - None/Disabled`, `1 - Outlet`, `2 - Switch`. |
| `buttonsZ3[].namePrefix` | Here enable/disable the accessory name as a prefix for button name. |
| `sensors{}` | Sensors object. |
| `sensors.power`| If enabled, then the Power will be exposed as a `Contact Sensor`, fired if power ON. |
| `sensors.volume`| If enabled, then the Volume will be exposed as a `Contact Sensor`, fired on every Volume change. |
| `sensors.mute`| If enabled, then the Mute will be exposed as a `Contact Sensor`, fired if Mmute ON. |
| `sensors.input`| If enabled, then the Input will be exposed as a `Contact Sensor`, fired on every Input change. |
| `sensors.inputs[]`| Sensor inputs array. |
| `sensors.inputs[].name` | Here set own `Sensor Name`. |
| `sensors.inputs[].reference` | Here choose `Input Reference`, sensor fired if switch to this reference. |
| `sensors.inputs[].displayType` | Here choose characteristic type to be exposed in HomeKit app, `0 - None/Disabled`, `1 - Motion Sensor`, `2 - Occupancy Sensor`, `3 - Contact Sensor`. |
| `sensors.inputs[].namePrefix` | Here enable/disable the accessory name as a prefix for sensor name. |
| `sensors.surrounds`| Sensor surrounds array. |
| `sensors.surrounds[].name` | Here set own `Sensor Name`. |
| `sensors.surrounds[].reference` | Here choose `Sensor Reference`, sensor fired if switch to this reference. |
| `sensors.surrounds[].displayType` | Here choose characteristic type to be exposed in HomeKit app, `0 - None/Disabled`, `1 - Motion Sensor`, `2 - Occupancy Sensor`, `3 - Contact Sensor`. |
| `sensors.surrounds[].namePrefix` | Here enable/disable the accessory name as a prefix for sensor name. |
| `power{}` | InpPoweruts object. |
| `power.zone` | Here select which zone the power want control, `0 - Main Zone`, `1 - Zone 2`, `2 - Zone 3`, `3 - Zone 2/3`, `4 - Main Zone + Z2`, `5 - Main Zone + Z3`, `6 - Main Zone + Z2/Z3`, `7 - Master Power`, this also working with power button in RC app. |
| `volume{}` | Volume object. |
| `volume.namePrefix` | Here enable/disable the accessory name as a prefix for volume control name. |
| `volume.name` | Here set Your own volume/mute control name or leave empty. |
| `volume.displayTtype` | Here choice what a additional volume control mode You want to use `0 - None/Disabled`, `1 - Lightbulb`, `2 - Fan`, `3 - TV Speaker`, `4 - TV Speaker / Lightbulb`, `5 - TV Speaker / Fan`.  |
| `volume.zone` | Here select which zone the volume/mute want control, `0 - Main Zone`, `1 - Zone 2`, `2 - Zone 3`, `3 - Zone 2/3`, `4 - Main Zone + Z2`, `5 - Main Zone + Z3`, `6 - Main Zone + Z2/Z3`, this also working with hardware buttons in RC app. |
| `volume.max` | Here set the maximum possible volume to set, `0 - 100`. |
| `infoButtonCommand` | Here choose the function for `I` button in RC app. |
| `refreshInterval` | Here set the data refresh interval. |
| `log{}` | Log object. |
| `log.deviceInfo` | If enabled, log device info will be displayed by every connections device to the network. |
| `log.success` | If enabled, success log will be displayed in console. |
| `log.info` | If enabled, info log will be displayed in console. |
| `log.warn` | If enabled, warn log will be displayed in console. |
| `log.error` | If enabled, error log will be displayed in console. |
| `log.debug` | If enabled, debug log will be displayed in console. |
| `restFul{}` | RESTFul object. |
| `restFul.enable` | If enabled, RESTful server will start automatically and respond to any path request. |
| `restFul.port` | Here set the listening `Port` for RESTful server. |
| `mqtt{}` | MQTT object. |
| `mqtt.enable` | If enabled, MQTT Broker will start automatically and publish all awailable PV data. |
| `mqtt.host` | Here set the `IP Address` or `Hostname` for MQTT Broker. |
| `mqtt.port` | Here set the `Port` for MQTT Broker, default 1883. |
| `mqtt.clientId` | Here optional set the `Client Id` of MQTT Broker. |
| `mqtt.prefix` | Here set the `Prefix` for `Topic` or leave empty. |
| `mqtt.auth{}` | MQTT authorization object. |
| `mqtt.auth.enable` | Here enable authorization for MQTT Broker. |
| `mqtt.auth.user` | Here set the MQTT Broker user. |
| `mqtt.auth.passwd` | Here set the MQTT Broker password. |

### Extra Accessory Tile

* Surrounds - supports only `Surrounds Control`, `Surrounds Sensors`.
* Pass Tgrough Inputs - always `ON`, supports only `Pass Through Inputs Control`, `Pass Through Inputs Sensors`.

### RESTFul Integration

* Only for Main Zone, Zone 2, Zone 3
* POST data as a JSON Object `{Power: true}`
* Header content type must be `application/json`
* Path `status` response all available paths.

| Method | URL | Path | Response | Type |
| --- | --- | --- | --- | --- |
| GET | `http//ip:port/` | `info`, `state`, `picture`, `surround` | `{"Power": {"value": OFF}}` | JSON object. |

| Method | URL | Key | Value | Type | Description |
| --- | --- | --- | --- | --- | --- |
| POST | `http//ip:port` | `Power` | `true`, `false` | boolean | Set power On/Off. |
|      | `http//ip:port` | `Input` | `SAT/CBL` | string | Set input/pass through input. |
|      | `http//ip:port` | `Surround` | `MUSIC` | string | Set surround mode. |
|      | `http//ip:port` | `Volume` | `0 - 98` | integer | Set volume. |
|      | `http//ip:port` | `Mute` | `true`, `false` | boolean | Set mute On/Off. |
|      | `http//ip:port` | `RcControl` | `NS9E` | string | Send RC command. |

### MQTT Integration

* Only for Main Zone, Zone 2, Zone 3
* Subscribe data as a JSON Object `{Power: true}`

| Method | Topic | Message | Type |
| --- | --- | --- | --- |
| Publish | `Info`, `State`, `Picture`, `Surround` | `{"Power": {"value": OFF}}` | JSON object. |

| Method | Topic | Key | Value | Type | Description |
| --- | --- | --- | --- | --- | --- |
| Subscribe | `Set` |  `Power` | `true`, `false` | boolean | Set power On/Off. |
|     | `Set` |  `Input` | `SAT/CBL` | string | Set input/pass through input. |
|     | `Set` |  `Surround` | `MUSIC` | string | Set surround mode. |
|     | `Set` |  `Volume` | `0 - 98` | integer | Set volume. |
|     | `Set` |  `Mute` | `true`, `false` | boolean | Set mute On/Off. |
|     | `Set` |  `RcControl` | `NS9E` | string | Send RC command. |
