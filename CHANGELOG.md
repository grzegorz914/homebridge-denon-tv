# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.2.0] - (08.09.2020)
## Changs
- added async/await function to read deviceInfo and updateStatus

## [3.1.0] - (06.09.2020)
## Changs
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
