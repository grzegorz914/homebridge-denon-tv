<p align="center">
  <a href="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/master/graphics/denon.png" height="140"></a>
</p>

<span align="center">

# Homebridge Denon TV
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://badgen.net/npm/dt/homebridge-denon-tv?color=purple)](https://www.npmjs.com/package/homebridge-denon-tv) [![npm](https://badgen.net/npm/v/homebridge-denon-tv?color=purple)](https://www.npmjs.com/package/homebridge-denon-tv) [![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-denon-tv.svg)](https://github.com/grzegorz914/homebridge-denon-tv/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-denon-tv.svg)](https://github.com/grzegorz914/homebridge-denon-tv/issues)

Homebridge plugin to control Denon/Marantz AV Receivers series X in HomeKit as TV service. Tested with AVR-X6300H.

</span>

## Info
1. Power ON/OFF short press tile in HomeKit app.
2. RC/Media control is possible after You go to the RC app on iPhone/iPad.
3. Speaker control is possible after You go to RC app on iPhone/iPad `Speaker Service`.
4. Legacy volume control is possible throught extra `lightbulb` (slider) or using Siri `Volume Service`.
5. Inputs can be changed after loong press tile in HomeKit app and select from the list.
6. Surround Modes control from the inputs list.
7. Digital Input Modes control from the inputs list.
8. Siri control.

<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/master/graphics/homekit.png" height="300"></a>  <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/master/graphics/inputs.png" height="300"></a>  <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/master/graphics/RC.png" height="300"></a>
</p>

## Package
1. [Homebridge](https://github.com/homebridge/homebridge)
2. [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x)

## Installation
1. Follow the step-by-step instructions on the [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) for how to install Homebridge.
2. Follow the step-by-step instructions on the [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) for how to install Homebridge Config UI X.
3. Install homebridge-denon-tv using: `npm install -g homebridge-denon-tv` or search for `Denon Tv` in Config UI X.

## Configuration
1. If port `8080` not working check with port `80`, different receivers uses different ports, You need to check which one is correct for you.
2. Use [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x) to configure the plugin (strongly recomended), or update your configuration file manually. See `sample-config.json` in this repository for a sample or add the bottom example to Your config.json file.
3. Different model of AV Receiver uses different `Inputs`, `SI` reference:
`PHONO, CD, TUNER, DVD, BD, TV, SAT/CBL, MPLAY, GAME, HDRADIO, NET, PANDORA, SIRIUSXM, SPOTIFY, LASTFM, FLICKR, IRADIO, SERVER, FAVORITES, AUX1, AUX2, AUX3, AUX4, AUX5, AUX6, AUX7, BT, USB/IPOD, USB, IPD, IRP, FVP, HDP, VCR, DVR, SAT, XM`
4. Different model of AV Receiver uses different `Digital Inputs`, `DC` reference:
`AUTO` - set DIGITAL INPUT AUTO mode, `PCM` - set DIGITAL INPUT force PCM, `DTS` - set DIGITAL INPUT force DTS.
5. Different model of AV Receiver uses different `Surrounds Modes`, `MS` reference:
`DIRECT, PURE DIRECT, STEREO, STANDARD, DOLBY DIGITAL, DTS SUROUND, 7CH STEREO, MCH STEREO, ROCK ARENA, JAZZ CLUB, MONO MOVIE, MATRIX, GAME, VIRTUAL, AURO3D, AURO2DSURR, WIDE SCREEN, SUPER STADIUM, CLASSIC CONCERT, LEFT, RIGHT, AUX3, AUX4, AUX5, AUX6, AUX7, BT, USB/IPOD, USB, QUICK1, QUICKK2, QUICK3, QUCIK4, QUICK1 MEMORY, QUICK2 MEMORY, QUICK3 MEMORY, QUICK4 MEMORY`
6. All possible commands can be found in [Denon Control Protocol 2020](http://assets.denon.com/_layouts/15/xlviewer.aspx?id=/DocumentMaster/us/DENON_FY20%20AVR_PROTOCOL_V03_03042020.xlsx)


<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-denon-tv/master/graphics/ustawienia.png" height="150"></a>
</p>

```json
{
    "platform": "DenonTv",
    "devices": [
        {
            "name": "AV Receiver",
            "host": "192.168.1.5",
            "port": 8080,
            "zoneControl" : 0,
            "volumeControl": false,
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
                            "name": "CD",
                            "reference": "CD",
                            "type": "OTHER",
                            "mode": "SI"
                        },
                        {
                            "name": "DVD",
                            "reference": "DVD",
                            "type": "HDMI",
                            "mode": "SI"
                        },
                        {
                            "name": "Bluray",
                            "reference": "BD",
                            "type": "HDMI",
                            "mode": "SI"
                        },
                        {
                            "name": "Tuner",
                            "reference": "TUNER",
                            "type": "TUNER",
                            "mode": "SI"
                        },
                        {
                            "name": "Spotify",
                            "reference": "SPOTIFY",
                            "type": "APPLICATION",
                            "mode": "SI"
                        },
                        {
                            "name": "Net",
                            "reference": "NET",
                            "type": "APPLICATION",
                            "mode": "SI"
                        },
                        {
                            "name": "Media player",
                            "reference": "MPLAY",
                            "type": "APPLICATION",
                            "mode": "SI"
                        },
                        {
                            "name": "USB IPOD",
                            "reference": "USB/IPOD",
                            "type": "USB",
                            "mode": "SI"
                        },
                        {
                            "name": "AUX 1",
                            "reference": "AUX1",
                            "type": "HDMI",
                            "mode": "SI"
                        },
                        {
                            "name": "AUX 2",
                            "reference": "AUX2",
                            "type": "HDMI",
                            "mode": "SI"
                        },
                        {
                            "name": "Source",
                            "reference": "SOURCE",
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
            ]
        }
    ]
}
```

## Whats new:
https://github.com/grzegorz914/homebridge-denon-tv/blob/master/CHANGELOG.md

