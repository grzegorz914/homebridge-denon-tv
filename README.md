<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://github.com/grzegorz914/homebridge-denon-tv/blob/master//graphics/denon.png" height="140"></a>
</p>

<span align="center">

# Homebridge Denon TV
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://badgen.net/npm/dt/homebridge-denon-tv?color=purple)](https://www.npmjs.com/package/homebridge-denon-tv) [![npm](https://badgen.net/npm/v/homebridge-denon-tv?color=purple)](https://www.npmjs.com/package/homebridge-denon-tv) [![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-denon-tv.svg)](https://github.com/grzegorz914/homebridge-denon-tv/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-denon-tv.svg)](https://github.com/grzegorz914/homebridge-denon-tv/issues)

Control Denon/Marantz AV Receivers series X in HomeKit as TV service. Tested with AVR-X6300H. Present as TV service, change inputs, volume/mute control, power control, RC control.

</span>

## Package

1. [Homebridge](https://github.com/homebridge/homebridge)
2. [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x)

## Installation

1. Follow the step-by-step instructions on the [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) for how to install Homebridge.
2. Follow the step-by-step instructions on the [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) for how to install Homebridge Config UI X.
3. Install homebridge-denon-tv using: `npm install -g homebridge-denon-tv` 

## Configuration

1. Use [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x) to configure the plugin (strongly recomended), or update your configuration file manually. See `sample-config.json` in this repository for a sample or add the bottom example to Your config.json file.
<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-denon-tv"><img src="https://github.com/grzegorz914/homebridge-denon-tv/blob/master//graphics/ustawienia.png" height="50"></a>
</p>

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

## Whats new:
https://github.com/grzegorz914/homebridge-denon-tv/blob/master/CHANGELOG.md

