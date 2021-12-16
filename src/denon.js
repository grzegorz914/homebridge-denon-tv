const fs = require('fs');
const fsPromises = fs.promises;
const EventEmitter = require('events');
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
        this.apiUrl = [API_URL.MainZoneStatusLite, API_URL.Zone2StatusLite, API_URL.Zone3StatusLite, API_URL.SoundModeStatus][this.zoneControl];

        const url = (`http://${this.host}:${this.port}`);
        this.axiosInstance = axios.create({
            method: 'GET',
            baseURL: url,
            timeout: 750
        });

        this.isConnected = false;
        this.power = false;
        this.reference = '';
        this.volume = 0;
        this.mute = false;
        this.checkState = false;
        this.checkStateOnFirstRun = false;

        setInterval(() => {
            const chackState = this.isConnected ? this.emit('checkState') : false;
        }, 1000)

        this.on('connect', (message) => {
                this.isConnected = true;
                this.emit('connected', 'Connected.');
                this.emit('deviceInfo', message);
            })
            .on('checkState', async () => {
                try {
                    this.checkStateOnFirstRun = true;
                    const deviceStateData = await this.axiosInstance(this.apiUrl);
                    const parseDeviceStateData = await parseStringPromise(deviceStateData.data);
                    const power = (parseDeviceStateData.item.Power[0].value[0] == 'ON');
                    const reference = (this.zoneControl <= 2) ? (parseDeviceStateData.item.InputFuncSelect[0].value[0] == 'Internet Radio') ? 'IRADIO' : (parseDeviceStateData.item.InputFuncSelect[0].value[0] == 'AirPlay') ? 'NET' : parseDeviceStateData.item.InputFuncSelect[0].value[0] : this.reference;
                    const volume = (parseFloat(parseDeviceStateData.item.MasterVolume[0].value[0]) >= -79.5) ? parseInt(parseDeviceStateData.item.MasterVolume[0].value[0]) + 80 : this.volume;
                    const mute = power ? (parseDeviceStateData.item.Mute[0].value[0] == 'on') : true;
                    if (this.checkStateOnFirstRun == true || power != this.power || reference != this.reference || volume != this.volume || mute != this.mute) {
                        this.emit('debug', `deviceStateData: ${deviceStateData.data}`);
                        this.emit('deviceState', power, reference, volume, mute);
                        this.power = power;
                        this.reference = reference;
                        this.volume = volume;
                        this.mute = mute;
                        this.checkStateOnFirstRun = false;
                    };
                } catch (error) {
                    this.emit('error', `update device state error: ${error}`);
                    this.emit('disconnect');
                };
            })
        this.on('disconnect', () => {
            clearInterval(this.checkState);
            this.emit('deviceState', false, '', 0, true);
            this.emit('disconnected', 'Disconnected.');
            this.isConnected = false;

            setTimeout(() => {
                this.getDeviceInfo();
            }, 5000);
        });

        this.getDeviceInfo();
    };

    async getDeviceInfoUpnp() {
        try {
            const deviceInfoUpnp = await axios.get(`http://${this.host}${API_URL.UPNP}`);
            const parseDeviceInfoUpnp = await parseStringPromise(deviceInfoUpnp.data);
            this.emit('debug', `parseDeviceInfoUpnp: ${parseDeviceInfoUpnp.root.device[0]}`);
            this.emit('connect', parseDeviceInfoUpnp);
        } catch (error) {
            this.emit('error', `device info upnp error: ${error}`);
            this.emit('disconnect');
        };
    };

    async getDeviceInfo() {
        try {
            const deviceInfo = await this.axiosInstance(API_URL.DeviceInfo);
            const parseDeviceInfo = await parseStringPromise(deviceInfo.data);
            const devInfo = JSON.stringify(parseDeviceInfo.Device_Info, null, 2);
            const writeDevInfo = (this.zoneControl == 0) ? await fsPromises.writeFile(this.devInfoFile, devInfo) : false;
            this.emit('debug', `parseDeviceInfo: ${deviceInfo.data}`);
            this.emit('connect', parseDeviceInfo);
        } catch (error) {
            this.emit('error', `device info error: ${error}`);
            this.emit('disconnect');
        };
    };

    send(apiUrl) {
        return new Promise(async (resolve, reject) => {
            try {
                const sendCommand = await this.axiosInstance(apiUrl);
                this.emit('message', `send command: ${apiUrl}`);
                resolve(true);
            } catch (error) {
                this.emit('error', `send command error: ${error}`);
                reject(error);
            };
        });
    };

    connect() {
        if (!this.isConnected) {
            this.getDeviceInfo();
        };
    };
};
module.exports = DENON;