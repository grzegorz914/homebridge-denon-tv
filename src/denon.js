const fs = require('fs');
const fsPromises = fs.promises;
const EventEmitter = require('events').EventEmitter;
const axios = require('axios');
const parseStringPromise = require('xml2js').parseStringPromise;

const API_URL = {
    'UPNP': ':60006/upnp/desc/aios_device/aios_device.xml',
    'DeviceInfo': '/goform/Deviceinfo.xml',
    'MainZone': '/goform/formMainZone_MainZoneXml.xml',
    'MainZoneStatus': '/goform/formMainZone_MainZoneXmlStatus.xml',
    'MainZoneStatusLite': '/goform/formMainZone_MainZoneXmlStatusLite.xml',
    'Zone2Status': '/goform/forZone2_Zone2XmlStatus.xml',
    'Zone2StatusLite': '/goform/formZone2_Zone2XmlStatusLite.xml',
    'Zone3Status': '/goform/forZone3_Zone3XmlStatus.xml',
    'Zone3StatusLite': '/goform/formZone3_Zone3XmlStatusLite.xml',
    'Zone4Status': '/goform/forZone4_Zone4XmlStatus.xml',
    'Zone4StatusLite': '/goform/formZone4_Zone4XmlStatusLite.xml',
    'SoundModeStatus': '/goform/formMainZone_MainZoneXmlStatusLite.xml',
    'TunerStatus': '/goform/formTuner_TunerXml.xml',
    'iPhoneDirect': '/goform/formiPhoneAppDirect.xml?',
    'AppCommand': '/goform/AppCommand.xml',
    'AppCommand300': '/goform/AppCommand0300.xml',
    'NetAudioStatusS': '/goform/formNetAudio_StatusXml.xml',
    'HdTunerStatus': '/goform/formTuner_HdXml.xml',
    'NetAudioCommandPost': '/NetAudio/index.put.asp'
}

class DENON extends EventEmitter {
    constructor(config) {
        super();
        this.host = config.host;
        this.port = config.port;
        this.zoneControl = config.zoneControl;
        this.devInfoFile = config.devInfoFile;

        const url = (`http://${this.host}:${this.port}`);
        this.axiosInstance = axios.create({
            method: 'GET',
            baseURL: url,
            timeout: 5000
        });

        this.checkDeviceInfo = true;
        this.parseDeviceStateData = {};
        this.powerState = false;
        this.inputReference = '';
        this.volume = 0;
        this.muteState = false;

        setInterval(() => {
            if (this.checkDeviceInfo) {
                this.getDeviceInfo();
            }
        }, 5000);
    };

    async getDeviceInfoUpnp() {
        try {
            const deviceInfoUpnp = await axios.get(`http://${this.host}${API_URL.UPNP}`);
            const parseDeviceInfoUpnp = await parseStringPromise(deviceInfoUpnp.data);
            this.emit('debug', `parseDeviceInfoUpnp: ${parseDeviceInfoUpnp.root.device[0]}`);
            this.emit('deviceInfoUpnp', parseDeviceInfoUpnp);
        } catch (error) {
            this.emit('error', `device info upnp: ${error}`);
        };
    };

    async getDeviceInfo() {
        try {
            const deviceInfo = await this.axiosInstance(API_URL.DeviceInfo);
            const parseDeviceInfo = await parseStringPromise(deviceInfo.data);
            const devInfo = JSON.stringify(parseDeviceInfo.Device_Info, null, 2);
            const writeDevInfo = (this.zoneControl == 0) ? await fsPromises.writeFile(this.devInfoFile, devInfo) : false;
            this.emit('debug', `parseDeviceInfo: ${deviceInfo.data}`);
            this.emit('deviceInfo', parseDeviceInfo);
            this.checkDeviceInfo = false;
            this.updateDeviceState();
        } catch (error) {
            this.emit('error', `device info: ${error}`);
        };
    }

    updateDeviceState() {
        setInterval(async () => {
            try {
                const apiUrl = [API_URL.MainZoneStatusLite, API_URL.Zone2StatusLite, API_URL.Zone3StatusLite, API_URL.SoundModeStatus][this.zoneControl];
                const deviceStateData = await this.axiosInstance(apiUrl);
                const parseDeviceStateData = await parseStringPromise(deviceStateData.data);
                const powerState = (parseDeviceStateData.item.Power[0].value[0] == 'ON');
                const inputReference = parseDeviceStateData.item.InputFuncSelect[0].value[0];
                const volume = parseDeviceStateData.item.MasterVolume[0].value[0];
                const muteState = (parseDeviceStateData.item.Mute[0].value[0] == 'on');
                if (powerState != this.powerState || inputReference != this.inputReference || volume != this.volume || muteState != this.muteState) {
                    this.emit('debug', `parseDeviceStateData: ${deviceStateData.data}`);
                    this.emit('deviceState', parseDeviceStateData);
                    this.powerState = powerState;
                    this.inputReference = inputReference;
                    this.volume = volume;
                    this.muteState = muteState;
                };
            } catch (error) {
                this.emit('error', `update device state: ${error}`);
                this.checkDeviceInfo = true;
            };
        }, 750)
    }

};
module.exports = DENON;