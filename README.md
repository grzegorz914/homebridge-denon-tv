<p align="center">
  <a href="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/master/homebridge-denon-tv.png" height="280"></a>
</p>

<span align="center">

# Homebridge Denon TV
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://badgen.net/npm/dt/homebridge-denon-tv?color=purple)](https://www.npmjs.com/package/homebridge-denon-tv) [![npm](https://badgen.net/npm/v/homebridge-denon-tv?color=purple)](https://www.npmjs.com/package/homebridge-denon-tv) [![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-denon-tv.svg)](https://github.com/grzegorz914/homebridge-denon-tv/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-denon-tv.svg)](https://github.com/grzegorz914/homebridge-denon-tv/issues)

Homebridge plugin for Denon/Marantz AV Receivers series X. 
Tested with AVR-X6300H.

</span>

## Package Requirements
| Package Link | Required |
| --- | --- |
| [Homebridge](https://github.com/homebridge/homebridge) | Required | 
| [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x) | Highly Recommended |

## Note
- For homebridge-denon-tv versions 3.6.0 and above the minimum required version of Homebridge is v1.3.x.

## Know issues
- If used with Hoobs, there is a possible configuration incompatibilty.

## Installation Instructions
1. Follow the step-by-step instructions at [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) for how to install Homebridge.
2. Follow the step-by-step instructions at [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) for how to install Homebridge Config UI X.
3. Install homebridge-denon-tv using: `npm install -g homebridge-denon-tv` or search for `Denon Tv` in Config UI X.


## Features and How To Use Them
1. Power the receiver ON/OFF using a short press of the created device tile in the HomeKit app.
2. Remote Control and Media control is possible by using the Apple Remote in Control Center on iPhone/iPad (must be installed from the App store prior to iOS/iPadOS 14).
3. Speaker control is possible after you go to Apple Remote in Control Center on iPhone/iPad `Speaker Service`.
4. Legacy volume and mute control is possible throught the extra `lightbulb` (slider) or using Siri `Volume Service`.
5. Inputs can be changed by performing a long press of the device tile in the HomeKit app and then selecting from the list. It is also possible to create separate tiles in the Inputs and Functions button.
6. Surround Modes can be controlled from the Inputs List from a long press of the device tile or by creating separate tiles in the Inputs and Functions button.
7. Digital Input Modes control from the inputs list or create separate tile in the Inputs and Functions button.
8. Siri control.
9. Zones control.

<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/master/graphics/homekit.png" height="300"></a> 
  </p>
  <p align="left">
  <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/master/graphics/inputs.png" height="300"></a>  <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/master/graphics/RC.png" height="300"></a>  <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/master/graphics/rc1.png" height="300"></a>
</p>

## Configuration

Install and use [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x) plugin to configure this plugin (strongly recomended). The sample configuration can be edited and used manually as an alternative. See the `sample-config.json` file in this repository for an example or copy the example below into your config.json file, making the apporpriate changes before saving it. Be sure to always make a backup copy of your config.json file before making any changes to it.
| Key | Description | 
| --- | --- |
| `port` | This is the network port that this plugin will use to communicate with the receiver. If port `8080` is not working then try to use port `80` which some receivers use alternatively. Try the other port if the first one does not work |
| `inputs` | Choose from available inputs the inputs that should be published to and appear in Homekit apps in the device tile|
| `buttonsMainZone` | here choice function for additional control button for Main Zone|
| `refreshInterval` | Set the data refresh time in seconds, default is every 5 seconds |
| `zoneControl` | Selects which zone will will be controlled by this section of the configuration |
| `masterPower` | If `true` then the power switch for that zone (typically you would only use this for the Main Zone) will turn the entire receiver `ON` or `OFF/STANDBY` rather than just the zone itself |
| `masterVolume`| If `true` then the volume for that zone (typically you would only use this for the Main Zone) will set the entire receiver `UP` or `DOWN` rather than just the zone itself |
| `masterMute`| If `true` then the mute switch for that zone (typically you would only use this for the Main Zone) will muted the entire receiver `ON` or `OFF` rather than just the zone itself |
| `volumeControl`| Select what a additional volume control mode You want to use (None, Slider, Fan) |
| `switchInfoMenu`| If `true` then the `I` button will toggle its behaviour in the Apple Remote in Control Center and `PowerModeSelection` in settings |
| `disableLogInfo`| If `true` then disable log info, all values and state will not be displayed in Homebridge log console |
| `manufacturer` | Optional free-form informational data that will be displayed in the Home.app if it is filled in |
| `modelName` | Optional free-form informational data that will be displayed in the Home.app if it is filled in |
| `serialNumber` | Optional free-form informational data that will be displayed in the Home.app if it is filled in |
| `firmwareRevision` | Optional free-form informational data that will be displayed in the Home.app if it is filled in |

All possible commands can be found in [Denon Control Protocol 2020](http://assets.denon.com/_layouts/15/xlviewer.aspx?id=/DocumentMaster/us/DENON_FY20%20AVR_PROTOCOL_V03_03042020.xlsx)


<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/master/graphics/ustawienia.png" height="150"></a>
</p>

## Main Zone control and settings
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
                    "inputsButtonMainZone": [
                        {
                            "name": "POWER ON/OFF",
                            "reference": "RCKSK0410005"
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
To enable the ability to control each zone seperately then use the configuration below.
| Key | Description |
| --- | --- |
| `zoneControl` | (0 - Main Zone, 1 - Zone 2, 2 - Zone 3) or choice from the configurations GUI |
| `masterPower` | If `true` then the power switch for that zone will turn the entire receiver `ON` or `OFF/STANDBY` rather than just the zone itself |
| `masterVolume` | If `true` then the volume for that zone (typically you would only use this for the Main Zone) will set the entire receiver `UP` or `DOWN` rather than just the zone itself |
| `masterMute` | If is `true` the mute switch for that zone (typically you would only use this for the Main Zone) will muted the entire receiver `ON` or `OFF` rather than just the zone itself |
| `volumeControl` | If `true` then allow for separate volume control for each zone |
| `switchInfoMenu` | will working for all zones seperat but have same end effect for each zone |
| `inputs` | Choose from available inputs |
| `buttonsMainZone` | Choose the function for additional control button |
| `buttonsZon2` | Choose the function for additional control button for Zone 2 |
| `buttonsZone3` | Choose the function for additional control button for Zone 3 |

After editing the conf.json or using homebridge-config-ui-x to configure this plugin then save the settings and restart Homebridge. If the configuration has multiple zones then each zone will show up as a separate Homekit Accessory that will need be be added to Home individually using the same PIN code that is used for Homebridge.

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
                            "name": "POWER ON/OFF",
                            "reference": "RCKSK0410005"
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
                            "name": "POWER ON/OFF",
                            "reference": "RCKSK0430005"
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
                            "name": "POWER ON/OFF",
                            "reference": "RCKSK0450005"
                        }
                    ],
        }
    ]
}
```

## Adding to HomeKit
Each accessory needs to be manually paired. 
1. Open the Home <img src='https://user-images.githubusercontent.com/3979615/78010622-4ea1d380-738e-11ea-8a17-e6a465eeec35.png' height='16.42px'> app on your device. 
2. Tap the Home tab, then tap <img src='https://user-images.githubusercontent.com/3979615/78010869-9aed1380-738e-11ea-9644-9f46b3633026.png' height='16.42px'>. 
3. Tap *Add Accessory*, and select *I Don't Have a Code or Cannot Scan*. 
4. Enter the Homebridge PIN, this can be found under the QR code in Homebridge UI or your Homebridge logs, alternatively you can select *Use Camera* and scan the QR code again.

## Limitations
The HomeKit app has a limitation of a maximum number of 100 services per 1 accessory. If the number of services per accessory is over 100 then the Home app will stop responding. Items that are considered to be services in each accessory are when using this plugin are: 
  1. Information service
  2. Speaker service
  3. Lightbulb service
  4. Television service and inputs service 
  5. 5-100(where every input = 1 service)). 
At this time, if all services are enabled then the number of possible inputs to configure is 96.

## What's new:
https://github.com/grzegorz914/homebridge-denon-tv/blob/master/CHANGELOG.md

## Development
Please feel free to create a Pull request and help in development. It will be highly appreciated.

