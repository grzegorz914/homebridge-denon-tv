# homebridge-denon-tv
[![npm](https://img.shields.io/npm/dt/homebridge-denon-tv.svg)](https://www.npmjs.com/package/homebridge-denon-tv) [![npm](https://img.shields.io/npm/v/homebridge-denon-tv.svg)](https://www.npmjs.com/package/homebridge-denon-tv)

Plugin to control Denon/Marantz AV Receivers series X in HomeKit as TV service.
Tested with AVR-X6300H.
Can operate as TV service, switch and read channels.

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
