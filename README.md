<p align="center">
  <a href="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/master/homebridge-denon-tv.png" width="540"></a>
</p>

<span align="center">

# Homebridge Denon TV
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://badgen.net/npm/dt/homebridge-denon-tv?color=purple)](https://www.npmjs.com/package/homebridge-denon-tv) [![npm](https://badgen.net/npm/v/homebridge-denon-tv?color=purple)](https://www.npmjs.com/package/homebridge-denon-tv) [![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-denon-tv.svg)](https://github.com/grzegorz914/homebridge-denon-tv/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-denon-tv.svg)](https://github.com/grzegorz914/homebridge-denon-tv/issues)

Homebridge plugin for Denon/Marantz AV Receivers series X/SR. 
Tested with Denon AVR-X6300H and Marantz SR6013.

This plugin is based upon the official documentation for communicating with and controlling these Denon and Marantz receivers, located here: [Denon Control Protocol 2020](http://assets.denon.com/_layouts/15/xlviewer.aspx?id=/DocumentMaster/us/DENON_FY20%20AVR_PROTOCOL_V03_03042020.xlsx)

</span>

## Package Requirements
| Package Link | Installation | Role | Required |
| --- | --- | --- | --- |
| [Homebridge](https://github.com/homebridge/homebridge) | [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) | HomeKit Bridge | Required |
| [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) | [Homebridge Config UI X Wiki](https://github.com/oznu/homebridge-config-ui-x/wiki) | Web User Interface | Recommended |
| [Homebridge Denon TV](https://www.npmjs.com/package/homebridge-denon-tv) | `npm install -g homebridge-denon-tv` | Plug-In | Required |

## Note
* For homebridge-denon-tv versions 3.6.0 and above the minimum required version of Homebridge is 1.3.x.

## Know issues
* If used with Hoobs, there is a possible configuration incompatibilty.

## Features and How To Use Them
* Power ON/OFF short press tile in HomeKit app.
* RC/Media control is possible after you go to the RC app on iPhone/iPad.
* Speaker control is possible after you go to RC app on iPhone/iPad `Speaker Service`.
* Legacy volume and mute control is possible throught extra `lightbulb` (slider) or using Siri `Volume Service`.
* Inputs can be changed after loong press tile in Home.app and select from the list or create separate tile in the Buttons section.
* Surround Modes can be controlled from the Inputs List from a long press of the device tile or by creating separate tiles in the Inputs and Functions button.
* Digital Input Modes control from the inputs list or create separate tile in the Inputs and Functions button.
* Multiple Zone control.
* Siri control.

<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/master/graphics/homekit.png" width="480"></a> 
  <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/master/graphics/inputs.png" width="115"></a>  <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/master/graphics/RC.png" width="115"></a>  <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/master/graphics/rc1.png" width="115"></a>
</p>

## Configuration
Install and use [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) plugin to configure this plugin (Highly Recommended). The sample configuration can be edited and used manually as an alternative. See the `sample-config.json` file in this repository for an example or copy the example below into your config.json file, making the apporpriate changes before saving it. Be sure to always make a backup copy of your config.json file before making any changes to it.

<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/master/graphics/ustawienia.png" width="840"></a>
</p>

## Configuration Values
| Key | Description | 
| --- | --- |
| `name` | Here set the accessory *Name* to be displayed in *Homebridge/HomeKit*. |
| `host` | Here set the *Hsostname or Address IP* of TV. |
| `port` | This is the network port that this plugin will use to communicate with the receiver. If port `8080` is not working then try to use port `80` which some receivers use alternatively. Try the other port if the first one does not work |
| `zoneControl` | Selects which zone will be controlled by this section (0 - Main Zone, 1 - Zone 2, 2 - Zone 3) or choice from the configurations GUI |
| `refreshInterval` | Set the data refresh time in seconds, default is every 5 seconds. |
| `disableLogInfo` | If enabled, disable log info, all values and state will not be displayed in Homebridge log console. |
| `volumeControl` | Here choice what a additional volume control mode You want to use (None, Slider, Fan). |
| `switchInfoMenu` | If enabled, `I` button change its behaviour in RC app between Menu and INFO. |
| `masterPower` | If enabled, then the power switch for that zone (typically you would only use this for the Main Zone) will turn the entire receiver `ON` or `OFF/STANDBY` rather than just the zone itself |
| `masterVolume`| If enabled, then the volume for that zone (typically you would only use this for the Main Zone) will set the entire receiver `UP` or `DOWN` rather than just the zone itself |
| `masterMute`| If enabled, then the mute switch for that zone (typically you would only use this for the Main Zone) will muted the entire receiver `ON` or `OFF` rather than just the zone itself |
| `inputs.name` | Here set *Input Name* which You want expose to the *Homebridge/HomeKit*. |
| `inputs.reference` | Choose from available inputs, the inputs that should be published to and appear in HomeKit app in the device tile as inputs list |
| `inputs.mode` | Choose from available inputs mode. |
| `buttonsMainZone.name` | Here set *Button Name* which You want expose to the *Homebridge/HomeKit*. | 
| `buttonsMainZone.reference` | Here choice function for additional control button for Main Zone. | 
| `manufacturer`, `model`, `serialNumber`, `firmwareRevision` | Optional free-form informational data that will be displayed in the Home.app. |

## Main Zone Control and Settings
```json
{
    "platform": "DenonTv",
    "devices": [
        {
            "name": "AV Receiver",
            "host": "192.168.1.5",
            "port": 8080,
            "refreshInterval": 5,
            "zoneControl" : 0,
            "volumeControl": 0,
            "masterPower": false,
            "masterVolume": false,
            "masterMute": false,
            "switchInfoMenu": false,
            "disableLogInfo": false,
            "inputs": [
                        {
                            "name": "Xbox One",
                            "reference": "GAME",
                            "mode": "SI"
                        },
                        {
                            "name": "Television",
                            "reference": "TV",
                            "mode": "SI"
                        },
                        {
                            "name": "Sat Receiver",
                            "reference": "SAT/CBL",
                            "mode": "SI"
                        }
                    ],
                    "buttonsMainZone": [
                        {
                            "name": "POWER ON",
                            "reference": "ZMON"
                        }
                    ],
            "manufacturer": "Manufacturer",
            "modelName": "Model",
            "serialNumber": "Serial Number",
            "firmwareRevision": "Firmware Revision"
        }
    ]
}
```

## Multi zone control and settings
 * To enable the ability to control each zone seperately then use the configuration below.
 
| Key | Description |
| --- | --- |
| `name` | Here set the accessory *Name* to be displayed in *Homebridge/HomeKit*. |
| `host` | Here set the *Hsostname or Address IP* of TV. |
| `port` | This is the network port that this plugin will use to communicate with the receiver. If port `8080` is not working then try to use port `80` which some receivers use alternatively. Try the other port if the first one does not work |
| `zoneControl` | Selects which zone will be controlled by this section (0 - Main Zone, 1 - Zone 2, 2 - Zone 3) or choice from the configurations GUI |
| `refreshInterval` | Set the data refresh time in seconds, default is every 5 seconds. |
| `disableLogInfo` | If enabled, disable log info, all values and state will not be displayed in Homebridge log console. |
| `volumeControl` | Here choice what a additional volume control mode You want to use (None, Slider, Fan). |
| `switchInfoMenu` | If enabled, `I` button change its behaviour in RC app between Menu and INFO. |
| `masterPower` | If enabled, then the power switch for that zone will turn the entire receiver `ON` or `OFF/STANDBY` rather than just the zone itself |
| `masterVolume` | If enabled, then the volume for that zone (typically you would only use this for the Main Zone) will set the entire receiver `UP` or `DOWN` rather than just the zone itself |
| `masterMute` | If is enabled, the mute switch for that zone (typically you would only use this for the Main Zone) will muted the entire receiver `ON` or `OFF` rather than just the zone itself |
| `inputs.name` | Here set *Input Name* which You want expose to the *Homebridge/HomeKit*. |
| `inputs.reference` | Choose from available inputs, the inputs that should be published to and appear in HomeKit app in the device tile as inputs list |
| `inputs.mode` | Choose from available inputs mode. |
| `buttonsMainZone.name` | Here set *Button Name* which You want expose to the *Homebridge/HomeKit*. | 
| `buttonsMainZone.reference` | Here choice function for additional control button for Main Zone. |
| `buttonsZone2.name` | Here set *Button Name* which You want expose to the *Homebridge/HomeKit*. | 
| `buttonsZone2.reference` | Here choice function for additional control button for Zone 2. |
| `buttonsZone3.name` | Here set *Button Name* which You want expose to the *Homebridge/HomeKit*. | 
| `buttonsZone3.reference` | Here choice function for additional control button for Zone 3. |

After editing the config.json or using homebridge-config-ui-x to configure this plugin save the settings and restart Homebridge. If the configuration has multiple zones then each zone will show up as a separate Homekit Accessory. This will need be be added to the Home individually using the same PIN code that is used for Homebridge.

```json
{
    "platform": "DenonTv",
    "devices": [
        {
            "name": "AV Main Zone",
            "host": "192.168.1.5",
            "port": 8080,
            "refreshInterval": 5,
            "zoneControl" : 0,
            "volumeControl": 0,
            "masterPower": false,
            "masterVolume": false,
            "masterMute": false,
            "switchInfoMenu": false,
            "disableLogInfo": false,
            "inputs": [
                {
                    "name": "Xbox One",
                    "reference": "GAME",
                    "mode": "SI"
                },
                {
                    "name": "Television",
                    "reference": "TV",
                    "mode": "SI"
                },
                {
                    "name": "Sat Receiver",
                    "reference": "SAT/CBL",
                    "mode": "SI"
                }
            ],
            "buttonsMainZone": [
                        {
                            "name": "POWER ON",
                            "reference": "ZMON"
                        }
                    ],
        },
        {
            "name": "AV Zone 1",
            "host": "192.168.1.5",
            "port": 8080,
            "refreshInterval": 5,
            "zoneControl" : 1,
            "volumeControl": 0,
            "masterPower": false,
            "masterVolume": false,
            "masterMute": false,
            "switchInfoMenu": false,
            "disableLogInfo": false,
            "inputs": [
                {
                    "name": "Xbox One",
                    "reference": "GAME",
                    "mode": "SI"
                },
                {
                    "name": "Television",
                    "reference": "TV",
                    "mode": "SI"
                },
                {
                    "name": "Sat Receiver",
                    "reference": "SAT/CBL",
                    "mode": "SI"
                }
            ],
            "buttonsZone2": [
                        {
                            "name": "POWER ON",
                            "reference": "Z2ON"
                        }
                    ],
        },
        {
            "name": "AV Zone 2",
            "host": "192.168.1.5",
            "port": 8080,
            "zoneControl" : 2,
            "volumeControl": 0,
            "masterPower": false,
            "masterVolume": false,
            "masterMute": false,
            "switchInfoMenu": false,
            "inputs": [
                {
                    "name": "Xbox One",
                    "reference": "GAME",
                    "mode": "SI"
                },
                {
                    "name": "Television",
                    "reference": "TV"
                    "mode": "SI"
                },
                {
                    "name": "Sat Receiver",
                    "reference": "SAT/CBL",
                    "mode": "SI"
                }
            ],
            "buttonsZone3": [
                        {
                            "name": "POWER ON",
                            "reference": "Z3ON"
                        }
                    ],
        }
    ]
}
```

## Adding to HomeKit
Each accessory needs to be manually paired. 
1. Open the Home <img src='https://user-images.githubusercontent.com/3979615/78010622-4ea1d380-738e-11ea-8a17-e6a465eeec35.png' width='16.42px'> app on your device. 
2. Tap the Home tab, then tap <img src='https://user-images.githubusercontent.com/3979615/78010869-9aed1380-738e-11ea-9644-9f46b3633026.png' width='16.42px'>. 
3. Tap *Add Accessory*, and select *I Don't Have a Code or Cannot Scan*. 
4. Select Your accessory. 
5. Enter the Homebridge PIN, this can be found under the QR code in Homebridge UI or your Homebridge logs, alternatively you can select *Use Camera* and scan the QR code again.

## Limitations
* Due to a HomeKit limitation, that maximum services for 1 accessory is 100. Acessories containing services above this value in the HomeKit app will not respond.
* If all services are enabled possible inputs to use is 95. The services in this accessory are:
  * Information service.
  * Speaker service.
  * Lightbulb service.
  * Fan service
  * Television service.
  * Inputs service which may range from 6 to 100 as each input is 1 service.
  * Buttons service which may range from 6 to 100 as each input is 1 service.

## What's new:
https://github.com/grzegorz914/homebridge-denon-tv/blob/master/CHANGELOG.md

## Development
Please feel free to create a Pull request and help in development. It will be highly appreciated.

