<p align="center">
  <a href="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/main/homebridge-denon-tv.png" width="540"></a>
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
Tested with Denon AVR-X6300H and Marantz SR6013.

This plugin is based upon the official documentation for communicating with and controlling these Denon and Marantz receivers, located here: [Denon Control Protocol 2020](http://assets.denon.com/_layouts/15/xlviewer.aspx?id=/DocumentMaster/us/DENON_FY20%20AVR_PROTOCOL_V03_03042020.xlsx)

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
* MQTT publisch topic *Info*, *State* and *Sound Mode* as payload JSON data.

<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/main/graphics/homekit.png" width="382"></a> 
  <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/main/graphics/inputs.png" width="135"></a> <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/main/graphics/rc1.png" width="135"></a>
  <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/main/graphics/RC.png" width="135"></a>
</p>

### Configuration
* First enable [Network Contorl Denon/Marantz](https://manuals.denon.com/avrx6300h/na/en/HJWMSYmehwmguq.php).
* Run this plugin as a [Child Bridge](https://github.com/homebridge/homebridge/wiki/Child-Bridges) (Highly Recommended), this prevent crash Homebridge if plugin crashes.
* Install and use [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) to configure this plugin (Highly Recommended). 
* The sample configuration can be edited and used manually as an alternative. 
* See the `sample-config.json` file example or copy the example below into your config.json file, making the apporpriate changes before saving it. 
* Be sure to always make a backup copy of your config.json file before making any changes to it.

<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/main/graphics/ustawienia.png" width="840"></a>
</p>

| Key | Description |
| --- | --- |
| `name` | Here set the accessory *Name* to be displayed in *Homebridge/HomeKit*. |
| `host` | Here set the *Hsostname or Address IP* of TV. |
| `port` | Here set the API communication port, if `8080` is not working try to use port `80` which some receivers use alternatively. |
| `zoneControl` | Selects which zone will be controlled by this section (`0` - Main Zone, `1` - Zone 2, `2` - Zone 3, `3` - Surround Mode) or choice from the configurations GUI |
| `masterPower` | If enabled, then the Power switch for that zone (typically you would only use this for the Main Zone) will turn the entire receiver `ON` or `OFF/STANDBY` rather than just the zone itself |
| `sensorPower`| If enabled, then the Power will be exposed as a `Contact Sensor` to use with automations. |
| `masterVolume`| If enabled, then the Volume for that zone (typically you would only use this for the Main Zone) will set the entire receiver `UP` or `DOWN` rather than just the zone itself |
| `sensorVolume`| If enabled, then the Volume will be exposed as a `Contact Sensor` to use with automations. |
| `masterMute`| If enabled, then the Mute switch for that zone (typically you would only use this for the Main Zone) will muted the entire receiver `ON` or `OFF` rather than just the zone itself |
| `sensorMute`| If enabled, then the Mute will be exposed as a `Contact Sensor` to use with automations. |
| `sensorInput`| If enabled, then the Input will be exposed as a `Contact Sensor` to use with automations. |
| `volumeControl` | Here choice what a additional volume control mode You want to use (None, Lightbulb, Fan). |
| `infoButtonCommand` | Here select the function of `I` button in RC app. |
| `inputs.name` | Here set *Input Name* which You want expose to the *Homebridge/HomeKit*. |
| `inputs.reference` | Choose from available inputs, the inputs that should be published to and appear in HomeKit app in the device tile as inputs list |
| `inputs.mode` | Choose from available inputs mode. |
| `inputs.switch` | If enabled, the tile for that input will be expose to the *Homebridge/HomeKit* and can be used for HomeKit automation. |
| `inputs.displayType` | Here select display type in HomeKit app, possible `Button`, `Switch`, `Motion Sensor`, `Occupancy Sensor`.|
| `buttonsMainZone.name` | Here set *Button Name* which You want expose to the *Homebridge/HomeKit*. |
| `buttonsMainZone.reference` | Here choice function for additional control button for Main Zone. |
| `buttonsMainZone.displayType` | Here select display type in HomeKit app, possible `Button`, `Switch`.|
| `buttonsZone2.name` | Here set *Button Name* which You want expose to the *Homebridge/HomeKit*. |
| `buttonsZone2.reference` | Here choice function for additional control button for Zone 2. |
| `buttonsZone2.displayType` | Here select display type in HomeKit app, possible `Button`, `Switch`.|
| `buttonsZone3.name` | Here set *Button Name* which You want expose to the *Homebridge/HomeKit*. |
| `buttonsZone3.reference` | Here choice function for additional control button for Zone 3. |
| `buttonsZone3.displayType` | Here select display type in HomeKit app, possible `Button`, `Switch`.|
| `surrounds.name` | Here set *Surround Mode Name* which You want expose to the *Homebridge/HomeKit*. |
| `surrounds.reference` | Here choice *Surround Mode*, the mode that should be published to and appear in HomeKit app in the extra tile as Surrounds List. |
| `surrounds.switch` | If enabled, the tile for that surround mode will be expose to the *Homebridge/HomeKit* and can be used for HomeKit automation. |
| `surrounds.displayType` | Here select display type in HomeKit app, possible `Button`, `Switch`, `Motion Sensor`, `Occupancy Sensor`.|
| `enableDebugMode` | If enabled, deep log will be present in homebridge console. |
| `disableLogInfo` | If enabled, disable log info, all values and state will not be displayed in Homebridge log console. |
| `disableLogDeviceInfo` | If enabled, add ability to disable log device info by every connections device to the network. |
| `enableMqtt` | If enabled, MQTT Broker will start automatically and publish all awailable PV installation data. |
| `mqttHost` | Here set the *IP Address* or *Hostname* for MQTT Broker.) |
| `mqttPort` | Here set the *Port* for MQTT Broker, default 1883.) |
| `mqttPrefix` | Here set the *Prefix* for *Topic* or leave empty.) |
| `mqttAuth` | If enabled, MQTT Broker will use authorization credentials. |
| `mqttUser` | Here set the MQTT Broker user. |
| `mqttPasswd` | Here set the MQTT Broker password. |
| `mqttDebug` | If enabled, deep log will be present in homebridge console for MQTT. |
| `AV Surround Mode` | This extra Accessory will control all functions of Main Zone except (Inputs and Buttons). |


```json
{
    "platform": "DenonTv",
    "devices": [
        {
            "name": "AV Main Zone",
            "host": "192.168.1.5",
            "port": 8080,
            "zoneControl" : 0,
            "volumeControl": 0,
            "masterPower": false,
            "sensorPower": false,
            "masterVolume": false,
            "sensorVolume": false,
            "masterMute": false,
            "sensorMute": false,
            "sensorInput": false,
            "infoButtonCommand": "MNINF",
            "disableLogInfo": false,
            "disableLogDeviceInfo": false,
            "enableDebugMode": false,
            "inputs": [
                {
                    "name": "Xbox One",
                    "reference": "GAME",
                    "mode": "SI",
                    "switch": false,
					"displayType": 0
                },
                {
                    "name": "Television",
                    "reference": "TV",
                    "mode": "SI",
                    "switch": false,
					"displayType": 0
                }
            ],
            "buttonsMainZone": [
                {
                    "name": "POWER ON",
                    "reference": "ZMON",
					"displayType": 0
                }
            ],
            "enableMqtt": false,
            "mqttHost": "192.168.1.33",
            "mqttPort": 1883,
            "mqttPrefix": "home/denon",
            "mqttAuth": false,
            "mqttUser": "user",
            "mqttPass": "password",
            "mqttDebug": false
        },
        {
            "name": "AV Zone 1",
            "host": "192.168.1.5",
            "port": 8080,
            "zoneControl" : 1,
            "volumeControl": 0,
            "masterPower": false,
            "sensorPower": false,
            "masterVolume": false,
            "sensorVolume": false,
            "masterMute": false,
            "sensorMute": false,
            "sensorInput": false,
            "infoButtonCommand": "MNINF",
            "disableLogInfo": false,
            "disableLogDeviceInfo": false,
            "enableDebugMode": false,
            "inputs": [
                {
                    "name": "Xbox One",
                    "reference": "GAME",
                    "mode": "SI",
                    "switch": false,
					"displayType": 0
                },
                {
                    "name": "Television",
                    "reference": "TV",
                    "mode": "SI",
                    "switch": false,
					"displayType": 0
                }
            ],
            "buttonsZone2": [
                {
                    "name": "POWER ON",
                    "reference": "Z2ON",
					"displayType": 0
                }
            ],
            "enableMqtt": false,
            "mqttHost": "192.168.1.33",
            "mqttPort": 1883,
            "mqttPrefix": "home/denon",
            "mqttAuth": false,
            "mqttUser": "user",
            "mqttPass": "password",
            "mqttDebug": false
        },
        {
            "name": "AV Zone 2",
            "host": "192.168.1.5",
            "port": 8080,
            "zoneControl" : 2,
            "volumeControl": 0,
            "masterPower": false,
            "sensorPower": false,
            "masterVolume": false,
            "sensorVolume": false,
            "masterMute": false,
            "sensorMute": false,
            "sensorInput": false,
            "infoButtonCommand": "MNINF",
            "disableLogInfo": false,
            "disableLogDeviceInfo": false,
            "enableDebugMode": false,
            "inputs": [
                {
                    "name": "Xbox One",
                    "reference": "GAME",
                    "mode": "SI",
                    "switch": false,
					"displayType": 0
                },
                {
                    "name": "Television",
                    "reference": "TV",
                    "mode": "SI",
                    "switch": false,
					"displayType": 0
                }
            ],
            "buttonsZone3": [
                {
                    "name": "POWER ON",
                    "reference": "Z3ON",
					"displayType": 0
                }
            ],
            "enableMqtt": false,
            "mqttHost": "192.168.1.33",
            "mqttPort": 1883,
            "mqttPrefix": "home/denon",
            "mqttAuth": false,
            "mqttUser": "user",
            "mqttPass": "password",
            "mqttDebug": false
        },
        {
            "name": "AV Surround Mode",
            "host": "192.168.1.5",
            "port": 8080,
            "zoneControl" : 3,
            "volumeControl": 0,
            "masterPower": false,
            "sensorPower": false,
            "masterVolume": false,
            "sensorVolume": false,
            "masterMute": false,
            "sensorMute": false,
            "sensorInput": false,
            "infoButtonCommand": "MNINF",
            "disableLogInfo": false,
            "disableLogDeviceInfo": false,
            "enableDebugMode": false,
            "surrounds": [
                {
                    "name": "MCH Stereo",
                    "reference": "MCH STEREO",
                    "switch": false,
					"displayType": 0
                },
                {
                    "name": "Stereo",
                    "reference": "STEREO",
                    "switch": false,
					"displayType": 0
                }
            ],
            "enableMqtt": false,
            "mqttHost": "192.168.1.33",
            "mqttPort": 1883,
            "mqttPrefix": "home/denon",
            "mqttAuth": false,
            "mqttUser": "user",
            "mqttPass": "password",
            "mqttDebug": false
        }
    ]
}
```
