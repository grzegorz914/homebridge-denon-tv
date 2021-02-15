<p align="center">
  <a href="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/master/graphics/denon.png" height="140"></a>
</p>

<span align="center">

# Homebridge Denon TV
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://badgen.net/npm/dt/homebridge-denon-tv?color=purple)](https://www.npmjs.com/package/homebridge-denon-tv) [![npm](https://badgen.net/npm/v/homebridge-denon-tv?color=purple)](https://www.npmjs.com/package/homebridge-denon-tv) [![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-denon-tv.svg)](https://github.com/grzegorz914/homebridge-denon-tv/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-denon-tv.svg)](https://github.com/grzegorz914/homebridge-denon-tv/issues)

Homebridge plugin to control Denon/Marantz AV Receivers series X in HomeKit as TV service. 
Tested with AVR-X6300H.

</span>

## Package
1. [Homebridge](https://github.com/homebridge/homebridge)
2. [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x)

## Installation
1. Follow the step-by-step instructions on the [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) for how to install Homebridge.
2. Follow the step-by-step instructions on the [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) for how to install Homebridge Config UI X.
3. Install homebridge-denon-tv using: `npm install -g homebridge-denon-tv` or search for `Denon Tv` in Config UI X.

## Know issues
1. If use with Hoobs possible config incompatibilty.

## HomeKit pairing
1. Each accessories needs to be manually paired. 
2. Open the Home <img src='https://user-images.githubusercontent.com/3979615/78010622-4ea1d380-738e-11ea-8a17-e6a465eeec35.png' height='16.42px'> app on your device. 
3. Tap the Home tab, then tap <img src='https://user-images.githubusercontent.com/3979615/78010869-9aed1380-738e-11ea-9644-9f46b3633026.png' height='16.42px'>. 
4. Tap *Add Accessory*, and select *I Don't Have a Code or Cannot Scan*. 
5. Enter the Homebridge PIN, this can be found under the QR code in Homebridge UI or your Homebridge logs, alternatively you can select *Use Camera* and scan the QR code again.

## Info
1. Power ON/OFF short press tile in HomeKit app.
2. RC/Media control is possible after you go to the RC app on iPhone/iPad.
3. Speaker control is possible after you go to RC app on iPhone/iPad `Speaker Service`.
4. Legacy volume and mute control is possible throught extra `lightbulb` (slider) or using Siri `Volume Service`.
5. Inputs can be changed after loong press tile in HomeKit app and select from the list.
6. Surround Modes control from the inputs list.
7. Digital Input Modes control from the inputs list.
8. Siri control.
9. Zones control.

<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/master/graphics/homekit.png" height="300"></a> 
  </p>
  <p align="left">
  <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/master/graphics/inputs.png" height="300"></a>  <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/master/graphics/RC.png" height="300"></a>  <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/master/graphics/rc1.png" height="300"></a>
</p>

## Configuration
1. If port `8080` not working check with port `80`, different receivers uses different ports, You need to check which one is correct for you.
2. Use [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x) to configure the plugin (strongly recomended), or update your configuration file manually. See `sample-config.json` in this repository for a sample or add the bottom example to Your config.json file.
3. Different model of AV Receiver uses different `Inputs`, `SI` reference:
`PHONO, CD, TUNER, DVD, BD, TV, SAT/CBL, MPLAY, GAME, HDRADIO, NET, PANDORA, SIRIUSXM, SPOTIFY, LASTFM, FLICKR, IRADIO, SERVER, FAVORITES, AUX1, AUX2, AUX3, AUX4, AUX5, AUX6, AUX7, BT, USB/IPOD, USB, IPD, IRP, FVP, HDP, VCR, DVR, SAT, XM`
4. Different model of AV Receiver uses different `Digital Inputs`, `DC` reference:
`AUTO` - set DIGITAL INPUT AUTO mode, `PCM` - set DIGITAL INPUT force PCM, `DTS` - set DIGITAL INPUT force DTS.
5. Different model of AV Receiver uses different `Surrounds Modes`, `MS` reference:
`DIRECT, PURE DIRECT, STEREO, STANDARD, DOLBY DIGITAL, DTS SUROUND, 7CH STEREO, MCH STEREO, ROCK ARENA, JAZZ CLUB, MONO MOVIE, MATRIX, GAME, VIRTUAL, AURO3D, AURO2DSURR, WIDE SCREEN, SUPER STADIUM, CLASSIC CONCERT, LEFT, RIGHT, AUX3, AUX4, AUX5, AUX6, AUX7, BT, USB/IPOD, USB, QUICK1, QUICK2, QUICK3, QUICK4, QUICK1 MEMORY, QUICK2 MEMORY, QUICK3 MEMORY, QUICK4 MEMORY`
6. Different model of AV Receiver uses different `Surrounds Modes`, `MN` to controll all zones stereo reference:
`ZST ON, ZST OFF`
7. In `refreshInterval` set the data refresh time in seconds, default 5sec.
8. In `zoneControl` You can select which zone U want to control.
9. If `masterPower` is `true` the power switch for that zone (typically you would only use this for the Main Zone) will turn the entire receiver `ON` or `OFF/STANDBY` rather than just the zone itself.
10. In `volumeControl` You can select what a additional volume control mode You want to use (None, Slider, Fan).
11. If `switchInfoMenu` is enabled, `I` button toggle its behaviour in RC app and `PowerModeSelection` in settings.
11. If `disableLogInfo` is enabled, disable log info, all values and state will not be displayed in Homebridge log console.
12. All possible commands can be found in [Denon Control Protocol 2020](http://assets.denon.com/_layouts/15/xlviewer.aspx?id=/DocumentMaster/us/DENON_FY20%20AVR_PROTOCOL_V03_03042020.xlsx)
13. `manufacturer`, `modelName`, `serialNumber`, `firmwareRevision` - optional branding data displayed in Home.app

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
            "switchInfoMenu": false,
            "disableLogInfo": false,
            "inputs": [
                        {
                            "name": "Xbox One",
                            "reference": "GAME",
                            "type": "HDMI",
                            "mode": "SI"
                        },
                        {
                            "name": "Television",
                            "reference": "TV",
                            "type": "HDMI",
                            "mode": "SI"
                        },
                        {
                            "name": "Sat Receiver",
                            "reference": "SAT/CBL",
                            "type": "HDMI",
                            "mode": "SI"
                        },
                        {
                            "name": "Stereo",
                            "reference": "STEREO",
                            "type": "OTHER",
                            "mode": "MS"
                        },
                        {
                            "name": "Multi Channel Stereo",
                            "reference": "MCH STEREO",
                            "type": "OTHER",
                            "mode": "MS"
                        },
                        {
                            "name": "Digital Input AUTO",
                            "reference": "AUTO",
                            "type": "OTHER",
                            "mode": "DC"
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
1. If U want control all zones seperat at the same time U can use config as present bottom.
2. Select `zoneControl` (0 - Main Zone, 1 - Zone 2, 2 - Zone 3, 3 - All Zones) or choice from the configurations GUI.
3. If `masterPower` is `true` the power switch for that zone will turn the entire receiver `ON` or `OFF/STANDBY` rather than just the zone itself.
4. The `volumeControl` will working seperat for every zone.
5. The `switchInfoMenu` will working for all zones seperat but have same end effect for every zone.
6. All `inputs` `name`, `reference`, `type` can be used for every zone.
7. Surrounds `mode` can be only used for Main Zone and All Zones, do not set this for Zone 2 and 3.
8. After correct settings and save restart Homebridge, every zone need to be added separat in HomeKit app using same PIN CODE.

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
            "switchInfoMenu": false,
            "disableLogInfo": false,
            "inputs": [
                {
                    "name": "Xbox One",
                    "reference": "GAME",
                    "type": "HDMI",
                    "mode": "SI"
                },
                {
                    "name": "Television",
                    "reference": "TV",
                    "type": "HDMI",
                    "mode": "SI"
                },
                {
                    "name": "Sat Receiver",
                    "reference": "SAT/CBL",
                    "type": "HDMI",
                    "mode": "SI"
                },
                {
                    "name": "Digital Input AUTO",
                    "reference": "AUTO",
                    "type": "OTHER",
                    "mode": "DC"
                },
                {
                    "name": "Multi Channel Stereo",
                    "reference": "MCH STEREO",
                    "type": "OTHER",
                    "mode": "MS"
                },
                {
                    "name": "All zones stereo ON",
                    "reference": "ZST ON",
                    "type": "OTHER",
                    "mode": "MN"
                },
                {
                    "name": "All zones stereo OFF",
                    "reference": "ZST OFF",
                    "type": "OTHER",
                    "mode": "MN"
                },
            ]
        },
        {
            "name": "AV Zone 1",
            "host": "192.168.1.5",
            "port": 8080,
            "refreshInterval": 5,
            "zoneControl" : 1,
            "volumeControl": 0,
            "masterPower": false,
            "switchInfoMenu": false,
            "disableLogInfo": false,
            "inputs": [
                {
                    "name": "Xbox One",
                    "reference": "GAME",
                    "type": "HDMI",
                    "mode": "SI"
                },
                {
                    "name": "Television",
                    "reference": "TV",
                    "type": "HDMI",
                    "mode": "SI"
                },
                {
                    "name": "Sat Receiver",
                    "reference": "SAT/CBL",
                    "type": "HDMI",
                    "mode": "SI"
                },
                {
                    "name": "Digital Input AUTO",
                    "reference": "AUTO",
                    "type": "OTHER",
                    "mode": "DC"
                }
            ]
        },
        {
            "name": "AV Zone 2",
            "host": "192.168.1.5",
            "port": 8080,
            "zoneControl" : 2,
            "volumeControl": 0,
            "masterPower": false,
            "switchInfoMenu": false,
            "inputs": [
                {
                    "name": "Xbox One",
                    "reference": "GAME",
                    "type": "HDMI",
                    "mode": "SI"
                },
                {
                    "name": "Television",
                    "reference": "TV",
                    "type": "HDMI",
                    "mode": "SI"
                },
                {
                    "name": "Sat Receiver",
                    "reference": "SAT/CBL",
                    "type": "HDMI",
                    "mode": "SI"
                },
                {
                    "name": "Digital Input AUTO",
                    "reference": "AUTO",
                    "type": "OTHER",
                    "mode": "DC"
                }
            ]
        }
    ]
}
```

## Limitations
1. Due to HomeKit app limitation max. services for 1 accessory is 100. Over this value HomeKit app will no response. As services in this accessory are, (1.information service, 2.speaker service, 3.lightbulb service, 4.television service and inputs service 5-100(where every input = 1 service)). If all services are enabled possible inputs to use is 96.

## Whats new:
https://github.com/grzegorz914/homebridge-denon-tv/blob/master/CHANGELOG.md

## Development
- Pull request and help in development highly appreciated.

