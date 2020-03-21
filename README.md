# homebridge-denon-tv
[![npm](https://badgen.net/npm/dt/homebridge-denon-tv?color=purple)](https://www.npmjs.com/package/homebridge-denon-tv) [![npm](https://badgen.net/npm/v/homebridge-denon-tv?color=purple)](https://www.npmjs.com/package/homebridge-denon-tv) [![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-denon-tv.svg)](https://github.com/grzegorz914/homebridge-denon-tv/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-denon-tv.svg)](https://github.com/grzegorz914/homebridge-denon-tv/issues)

Plugin to control Denon/Marantz AV Receivers series X in HomeKit as TV service. Tested with AVR-X6300H. Present as TV service, change inputs, volume/mute control, power control.

Homebridge: https://github.com/homebridge/homebridge

## Installation

1. Follow the step-by-step instructions on the [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) for how to install Homebridge.
2. Install homebridge-denon-tv using: `npm install -g homebridge-denon-tv`
3. Update your configuration file. See `sample-config.json` in this repository for a sample. 

## Configuration

```json
{
    "platform": "DenonTv",
    "devices": [
        {
            "name": "AV Receiver",
            "host": "192.168.1.5",
            "port": 8080,
            "switchInfoMenu": true,
            "inputs": [
                {
                    "name": "Xbox One",
                    "reference": "GAME"
                },
                {
                    "name": "Telewizor",
                    "reference": "TV"
                },
                {
                    "name": "Tuner Sat",
                    "reference": "SAT/CBL"
                },
                {
                    "name": "CD",
                    "reference": "CD"
                }
            ]
        }
    ]
}
```

## Limitations:

## Whats new:
https://github.com/grzegorz914/homebridge-denon-tv/blob/master/CHANGELOG.md

