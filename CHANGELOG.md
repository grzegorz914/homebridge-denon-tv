# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Note - after update to 3.15.x need remove the accessory frome Home app and add it again.

## [3.17.13] - (23.07.2022)
## Changes
- refactor information service

## [3.17.12] - (23.05.2022)
## Changes
- refactor send debug and info log
- refactor send mqtt message
- update dependencies
- fix [#144](https://github.com/grzegorz914/homebridge-denon-tv/issues/144)

## [3.17.9] - (24.04.2022)
## Changes
- fixed MQTT info report

## [3.17.7] - (23.04.2022)
## Changes
- prepare accessory process to prevent create accessory with wrong UUID
- in config.schema.json MQTT section

## [3.17.6] - (21.03.2022)
## Changes
- added PR [#140](https://github.com/grzegorz914/homebridge-denon-tv/pull/140)
- update readme

## [3.17.5] - (16.03.2022)
## Changes
- fix power mode selection

## [3.17.4] - (27.02.2022)
## Changes
- increase timeout to 10sec, fixed [#133](https://github.com/grzegorz914/homebridge-denon-tv/issues/133)
## [3.17.3] - (27.02.2022)

## Added
- possibility to set custom command for Info button in RC
- MQTT Debug
## Changes
- refactor check state and connect process

## [3.17.2] - (18.02.2022)

## Changes
- fix #136

## [3.17.0] - (18.02.2022)
## Added
- MQTT Client, publish all device data

## Changes
- update dependencies
- code refactor

## [3.16.11] - (15.02.2022)
### Changes
- fix [#133](https://github.com/grzegorz914/homebridge-denon-tv/issues/133)
- bump dependencies

## [3.16.8] - (07.02.2022)
### Changes
- code cleanup

## [3.16.7] - (04.02.2022)
### Changes
- stability and performance improvements
- wording corrections in debug log

## [3.16.5] - (28.01.2022)
### Changes
- code refactor

## [3.16.4] - (20.01.2022)
### Changes
- prevent create inputs switch services if count <= 0

## [3.16.3] - (18.01.2022)
### Changes
- update dependencies

## [3.16.2] - (17.01.2022)
### Changes
- update dependencies

## [3.16.1] - (14.01.2022)
### Fixed
- possible crash if input/surround switch, mode, displayType are not defined 

## [3.16.0] - (14.01.2022)
### Added
- ability to use inputs and surrounds mode with automations, shortcuts in HomeKit app [#131](https://github.com/grzegorz914/homebridge-denon-tv/issues/131)
- ability to choice type of inputs or surrounds in automations (button, switch, motion sensor, occupancy sensor)

### Changs
- code cleanup
- removed all inputs and favorites function from buttons, now available in input section
- update config.schema

### Fixed
- services calculation count
- start input automation or scenes [#129](https://github.com/grzegorz914/homebridge-denon-tv/issues/129)

## [3.15.10] - (03.01.2022)
### Added
-  ability to disable log device info by every connections device to the network (Advanced Section)
-  extend PR #128
## [3.15.9] - (31.12.2021)
### Fixed
- power state report if device is disconnected from network

### Changs
- code cleanup

## [3.15.7/8] - (30.12.2021)
### Changs
- log AVR Disconnected if plugin restart and AVR not on network

## [3.15.5] - (30.12.2021)
### Changs
- reduce logging if receiver for some reason lose the connection
- moved info and state error to debug

## [3.15.4] - (29.12.2021)
### Added
- prevent load plugin if host or port not set
- prepare directory and files synchronously

## [3.15.3] - (28.12.2021)
## Changs
-update node minimum requirements
## [3.15.2] - (28.12.2021)
### Added
- Selectable display type of buttons in Home app
## [3.15.00] - (22.12.2021)

## Changes
- remove branding fom config, not nedded anymore
- code cleanup
- config.schema update

## [3.14.00] - (21.12.2021)
## Changes
- added read sound mode from device
- update config.schema
- stability and performance improvements

## [3.13.03] - (11.12.2021)
## Changes
- use event emmiter for state changes
- added debug mode
- removed refresh interval

## [3.12.18] - (11.12.2021)
## Changes
- fixed input selector unexcepted behaviour
- other small fixes

## [3.12.0] - (04.10.2021)
## Changes
- config.schema update
- added Surrounds Mode Control as extra Accessory
- code cleanup
- bump dependencies

## [3.11.13] - (14.09.2021)
## Changes
- config.schema update

## [3.11.12] - (14.09.2021)
## Changes
- code cleanup
- update config.schema

## [3.11.10] - (14.09.2021)
## Changes
- code cleanup

## [3.11.8] - (14.09.2021)
## Changes
- fixed wrong reference response of Net/AirPlay 

## [3.11.7] - (09.09.2021)
## Changes
- stability improvements
- performance improvements

## [3.11.6] - (08.09.2021)
## Changes
- bump dependencies

## [3.11.5] - (06.09.2021)
## Changes
- code cleanup
- update config.schema
- fixed wrong reference response of Internet Radio

## [3.11.3] - (05.09.2021)
## Changes
- bump dependencies

## [3.11.2] - (04.09.2021)
## Changes
- added INTERNET RADIO Input
- bump dependencies

## [3.11.1] - (02.09.2021)
## Changes
- added 8K input

## [3.11.0] - (31.08.2021)
## Changes
- inputs list updatd
- code refactoring
- many small changes and stability improvements

## [3.10.0] - (17.03.2021)
## Changes
- reconfigured buttons services
- added possibility to hide inputs direct from HomeKit app


## [3.9.0] - (15.03.2021)
## Changes
- rebuild complettly all inputs and buttons function
- added master Volume control
- added master Mute control

## [3.8.0] - (01.03.2021)
## Changes
- added possibility to create separate buttons for all functions of Receiver

## [3.6.0] - (18.02.2021)
## Changes
- code rebuild, use Characteristic.onSet/onGet
- require Homebridge 1.3.x or above

## [3.5.4] - (15.02.2021)
## Changes
- added possibility disable log info, optins available in config

## [3.5.0] - (19.01.2021)
## Changes
- some improvements and fixes
- fix delay of inputs reads/changes

## [3.4.16] - (06.01.2021)
## Changes
- bump dependiencies

## [3.4.15] - (20.11.2020)
## Changes
- fixed slow response on RC control

## [3.4.2] - (17.11.2020)
## Changes
- fixed #53

## [3.4.1] - (17.11.2020)
## Changes
- fixed broken input switch in scene #50 

## [3.4.0] - (17.11.2020)
## Changes
- added master Power control
- fixed bug in mute control
- update config.schema.json

## [3.3.1] - (14.09.2020)
## Changes
- added refreshInterval, default 5sec

## [3.3.0] - (10.09.2020)
## Changes
- added async/await function

## [3.2.0] - (08.09.2020)
## Changes
- added async/await function to read deviceInfo and updateStatus

## [3.1.0] - (06.09.2020)
## Changes
- completly reconfigured layout of config schema

## [3.0.4] - (25.08.2020)
### Changes
- performance improvements
- other small fixes

## [3.0.1] - (23.08.2020)
### Added
- donate option on plugin gui
- some cleanup

## [3.0.0] - (28.06.2020)
### Added
-release version.

## [2.7.0] - (27.05.2020)
### Added
- position in *Input mode*, *Surround mode all zones* which enable Stereo ON/OFF for alll zones (configure this only in Main Zone).
- for reference please look in README.md

## [2.6.0] - (23.05.2020)
- added possibility to select what a type of extra volume control You want to use (None, Slider, Fan)

## [2.5.0] - (20.05.2020)
- removed check box *allZonesControl* and moved this to selections list *zoneControl* (please update config.json)
- code corrections to work with zones control separat at the same time

## [2.4.0] - (20.05.2020)
- added mute ON/OFF to the slider volume

## [2.3.60] - (18.05.2020)
- fixed bug in RC control

## [2.3.35] - (17.05.2020)
- fixed switch input if start with scene or automation

## [2.3.0] - (16.05.2020)
- removed master volume and power control (best Use Config UI X to set new config)
- added all zones control (if enabled all zones will be control togheter, (power, source input, volume, mute))

## [2.2.0] - (16.05.2020) 
- added master volume control (if enabled volume will change volume in all zones)

## [2.1.0] - (15.05.2020) 
- added master power control (if enabled power button switch ON/OFF all zones)

## [2.0.5] - (15.05.2020) 
- fixed sources input selection

## [2.0.2] - (14.05.2020) 
- added descriptions in config.schema.json

## [2.0.0] - (14.05.2020) 
- changed 'type' to 'mode' as Input mode] - (Source input mode, Digital input mode, Surround mode), selectable from list
- added 'type' as source Input typ (HDMI, USB, APPLICATION, etc..), selectable from list
- prevent plugin from crash if no inputs are defined, now display in the list 'No inputs configured'
- please look at the sample.config or best use Config UI X to configure the plugin

## [1.9.0] - (10.05.2020) 
- code cleanup

## [1.8.5] - (10.05.2020) 
- use Promise to parseString

## [1.8.0] - (09.05.2020) 
- changed 'request' with 'axios'

## [1.7.0] - (06.05.2020) 
- adapted to HAP-Node JS lib

## [1.6.4] - (06.05.2020) 
- code cleanup
- update README.md

## [1.6.3] - (06.05.2020) 
- removed Favorites from input source type

## [1.6.0] - (05.05.2020)
- added possibility to set Surrounds Mode
- added possibility to set Digital Input Mode
- added possibility to set Favorite
- please update Your config.json, best to use GUI Config UI X to Settings the plugin.

## [1.5.30] - (05.05.2020)
- read more detailed info from device

## [1.5.10] - (05.05.2020)
- fixes and performance inprovements
- correted logging state

## [1.5.0] - (03.05.2020)
- added zone control] - (please update Your config.json)

## [1.4.22] - (02.05.2020)
- added real time read and write data for (lightbulb slider volume control)

## [1.4.15] - (01.05.2020)
- fixes in real time data read and write

## [1.4.0] - (30.04.2020)
- added realtime data read and write

## [1.3.3] - (27.04.2020)
- added switch ON/OFF volume control (please update config.json)

## [1.3.0] - (26.04.2020)
- add Siri volume control
- add Slider (Brightness) volume control

## [1.2.56] - (21.04.2020)
- different fixes.

## [1.2.42] - (07.04.2020)
- some fixes.

## [1.2.32] - (07.04.2020)
- fixed store of positin in HomeKit fav.

## [1.2.30] - (05.04.2020)
- update README.md
- update sample-config.json

## [1.2.30] - (29.03.2020)
- fixes crash if no device name defined
- fixed config.schema.json
- fixed store file inside the Homebridge directory

## [1.2.20] - (28.03.2020)
- some small fixes

## [1.2.17] - (21.03.2020)
- corrections for homebridge git
- performance improvement

## [1.1.2] - (6.02.2020)
- removed checkStateInterval in config
- some fixes

## [1.1.1] - (3.02.2020)
- fixed crash if save new Input name

## [1.1.0] - (3.02.2020)
- code cleanup
- performance improvements
- log corrections

## [1.0.5] - (1.01.2020)
- some fixes and code cleanup

## [1.0.0] - (21.01.2020)
- all moved to the platform and publisch as externall accessory
- please update Yours config!!!

## [0.0.13] - (18.01.2020)
- some fixes
- removed possibility to disable speaker servive
- stability and performance improvements

## [0.0.11] - (15.01.2020)
- some fixes

## [0.0.10] - (11.01.2020)
- fix power off/on

## [0.0.9] - (11.01.2020)
- fix unresponse

## [0.0.8] - (11.01.2020)
- code cleanup

## [0.0.7] - (08.01.2020)
- fixed current input identyfication

## [0.0.6] - (08.01.2020)
- some small changes

## [0.0.5] - (07.01.2019)
- fixed some small bugs

## [0.0.4] - (06.01.2020)
- code cleanup
- some small fixes

## [0.0.3] - (04.01.2020)
- fixed sources list
- some other fixes

## [0.0.2] - (03.01.2020)
- added RC  control
- some fixes

## [0.0.1] - (03.01.2020)
- Initial release
