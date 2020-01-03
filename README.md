# homebridge-denon-tv
[![npm](https://img.shields.io/npm/dt/homebridge-denon-tv.svg)](https://www.npmjs.com/package/homebridge-denon-tv) [![npm](https://img.shields.io/npm/v/homebridge-denon-tv.svg)](https://www.npmjs.com/package/homebridge-denon-tv)

Plugin to control Denon/Marantz AVR-X (4300H) in HomeKit as TV service.
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
            "name": "Wzmacniacz",
            "host": "192.168.1.10",
            "port": 8080,
            "speakerService": true,
            "inputs": []
   
        }
    ]
</pre>

# Limitations:

# Whats new:
https://github.com/grzegorz914/homebridge-denon-tv/blob/master/CHANGELOG.md
