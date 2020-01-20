# homebridge-denon-tv
[![npm](https://img.shields.io/npm/dt/homebridge-denon-tv.svg)](https://www.npmjs.com/package/homebridge-denon-tv) [![npm](https://img.shields.io/npm/v/homebridge-denon-tv.svg)](https://www.npmjs.com/package/homebridge-denon-tv) [![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-denon-tv.svg)](https://github.com/grzegorz914/homebridge-denon-tv/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-config-ui-x.svg)](https://github.com/grzegorz914/homebridge-denon-tv/issues)

Plugin to control Denon/Marantz AV Receivers series X in HomeKit as TV service.
Tested with AVR-X6300H.
Present as TV service, schange inputs, volume/mute control, power control.

HomeBridge: https://github.com/nfarina/homebridge

# Installation

1. Install homebridge using: npm install -g homebridge
2. Install homebridge-denon-tv using: npm install -g homebridge-denon-tv
3. Update your configuration file. See sample-config.json in this repository for a sample. 

# Configuration

 <pre>
"accessories": [
        {
            "accessory": "DenonTv",
            "name": "Kino domowe",
            "host": "192.168.1.5",
            "port": 8080,
            "speakerService": true,
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
</pre>

# Limitations:

# Whats new:
https://github.com/grzegorz914/homebridge-denon-tv/blob/master/CHANGELOG.md
