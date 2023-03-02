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
Tested with Denon AVR-X6300H, Denon AVR-X2700H, Denon AVR-3311CI, Marantz SR8012, Marantz SR6013, Marantz M-CR611.

</span>

## Package Requirements
| Package | Installation | Role | Required |
| --- | --- | --- | --- |
| [Homebridge](https://github.com/homebridge/homebridge) | [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) | HomeKit Bridge | Required |
| [Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) | [Config UI X Wiki](https://github.com/oznu/homebridge-config-ui-x/wiki) | Homebridge Web User Interface | Recommended |
| [Denon TV](https://www.npmjs.com/package/homebridge-denon-tv) | [Plug-In Wiki](https://github.com/grzegorz914/homebridge-denon-tv/wiki) | Homebridge Plug-In | Required |

## About The Plugin
* Multi Zone control.
* Power ON/OFF short press tile in HomeKit app.
* RC/Media control is possible after you go to the RC app on iPhone/iPad.
* Speaker control is possible after you go to RC app on iPhone/iPad `Speaker Service`.
* Legacy Volume and Mute control is possible throught extra `lightbulb`/`fan` (slider).
* Inputs can be changed using Inputs selector in HomeKit.app, additionally can create separate tile.
* Surrounds can be changed using Surrounds selector in HomeKit.app, additionally can create separate tile.
* Digital Input Modes can be controlled by creating separate tile in the buttons section.
* Siri can be used for all functions, some times need create legacy buttons/switches/sensors.
* Automations can be used for all functions, some times need create legacy buttons/switches/sensors.
* MQTT publisch topic *Info*, *State* *Picture* and *Surround* as payload JSON data.
* This plugin is based upon the official documentation: [Denon Control Protocol 2020](https://github.com/grzegorz914/homebridge-denon-tv/blob/main/src/Denon%20Control%20Protocol.xlsx)

<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/main/graphics/homekit.png" width="382"></a> 
  <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/main/graphics/inputs.png" width="135"></a> <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/main/graphics/rc1.png" width="135"></a>
  <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/main/graphics/RC.png" width="135"></a>
</p>

### Configuration
* First enable [Network Contorl Denon/Marantz](https://manuals.denon.com/avrx6300h/na/en/HJWMSYmehwmguq.php).
* Run this plugin as a [Child Bridge](https://github.com/homebridge/homebridge/wiki/Child-Bridges) (Highly Recommended), this prevent crash Homebridge if plugin crashes.
* Install and use [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) to configure this plugin. 
* See the `sample-config.json` file example or copy the example making the apporpriate changes before saving it. 
* Be sure to always make a backup copy of your config.json file before making any changes to it.

<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/main/graphics/ustawienia.png" width="840"></a>
</p>

| Key | Description |
| --- | --- |
| `name` | Here set the accessory *Name* to be displayed in *Homebridge/HomeKit*. |
| `host` | Here set the *Hsostname or Address IP* of AVR. |
| `port` | Here set the API communication port, if `8080` is not working try to use port `80` which some receivers use alternatively. |
| `zoneControl` | Selects which zone will be controlled by this section `0 - Main Zone`, `1 - Zone 2`, `2 - Zone 3`, `3 - Surround Mode`. |
| `supportOldAvr` | This enable support for old AVR like AVR-3311CI. |
| `getInputsFromDevice` | If enabled, source *Inputs* will be loaded direct from device. |
| `getFavoritesFromDevice` | If enabled, *Favorites* will be loaded to the inputs list if exist. |
| `getQuickSmartSelectFromDevice` | If enabled, *Quick/Smart Select* will be loaded to the inputs list if exist. |
| `inputs.name` | Here set *Input Name* which You want expose to the *Homebridge/HomeKit*. |
| `inputs.reference` | Choose from available inputs, the inputs that should be published to and appear in HomeKit app in the device tile as inputs list |
| `inputs.mode` | Choose from available inputs mode. |
| `surrounds.name` | Here set *Surround Mode Name* which You want expose to the *Homebridge/HomeKit*. |
| `surrounds.reference` | Here choice *Surround Mode*, the mode that should be published to and appear in HomeKit app in the extra tile as Surrounds List. |
| `buttons.name` | Here set *Button Name* which You want expose to the *Homebridge/HomeKit*. |
| `buttons.reference` | Here choice function for additional control button for Main Zone. |
| `buttons.displayType` | Here select display type in HomeKit app, possible `-1 - None/Disabled`, `0 - Outlet`, `1 - Switch`.|
| `sensorPower`| If enabled, then the Power will be exposed as a `Contact Sensor` to use with automations. |
| `sensorVolume`| If enabled, then the Volume will be exposed as a `Contact Sensor` to use with automations. |
| `sensorMute`| If enabled, then the Mute will be exposed as a `Contact Sensor` to use with automations. |
| `sensorInput`| If enabled, then the Input will be exposed as a `Contact Sensor` to use with automations. |
| `sensorInputs.name` | Here set own *Name* which You want expose to the *Homebridge/HomeKit* for this sensor. |
| `sensorInputs.reference` | Here set *Reference* like `CBL/SAT`, `GAME` to be exposed as `Contact Sensor` active on switch to this Input. | 
| `sensorInputs.displayType` | Here select sensor type to be exposed in HomeKit app, `-1 - None/Disabled`, `0 - Motion Sensor`, `1 - Occupancy Sensor`, `2 - Contact Sensor`. |
| `enableDebugMode` | If enabled, deep log will be present in homebridge console. |
| `disableLogInfo` | If enabled, disable log info, all values and state will not be displayed in Homebridge log console. |
| `disableLogDeviceInfo` | If enabled, add ability to disable log device info by every connections device to the network. |
| `disableLogConnectError` | If enabled, disable logging device connect error. |
| `masterPower` | If enabled, then the Power switch for that zone (typically you would only use this for the Main Zone) will turn the entire receiver `ON` or `OFF/STANDBY` rather than just the zone itself |
| `masterVolume`| If enabled, then the Volume for that zone (typically you would only use this for the Main Zone) will set the entire receiver `UP` or `DOWN` rather than just the zone itself |
| `masterMute`| If enabled, then the Mute switch for that zone (typically you would only use this for the Main Zone) will muted the entire receiver `ON` or `OFF` rather than just the zone itself |
| `volumeControl` | Here choice what a additional volume control mode You want to use (`-1 - None/Disabled`, `0 - Lightbulb`, `1 - Fan`). |
| `infoButtonCommand` | Here select the function of `I` button in RC app. |
| `refreshInterval` | Here set the data refresh interval. |
| `enableMqtt` | If enabled, MQTT Broker will start automatically and publish all awailable PV installation data. |
| `mqttDebug` | If enabled, deep log will be present in homebridge console for MQTT. |
| `mqttHost` | Here set the *IP Address* or *Hostname* for MQTT Broker. |
| `mqttPort` | Here set the *Port* for MQTT Broker, default 1883. |
| `mqttPrefix` | Here set the *Prefix* for *Topic* or leave empty. |
| `mqttAuth` | If enabled, MQTT Broker will use authorization credentials. |
| `mqttUser` | Here set the MQTT Broker user. |
| `mqttPasswd` | Here set the MQTT Broker password. |
| `AV Surround Mode` | This extra Accessory will control all functions of Main Zone except (Inputs). |