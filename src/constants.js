export const PlatformName = "DenonTv";
export const PluginName = "homebridge-denon-tv";

export const ApiUrls = {
    "UPNP": ":60006/upnp/desc/aios_device/aios_device.xml",
    "Description": ":8080/description.xml",
    "DeviceInfoGen0": "/goform/formMainZone_MainZoneXml.xml",
    "DeviceInfoGen1": "/goform/Deviceinfo.xml",
    "DeviceInfoGen2": "/goform/Deviceinfo.xml",
    "MainZoneStatus": "/goform/formMainZone_MainZoneXmlStatus.xml",
    "MainZoneStatusLite": "/goform/formMainZone_MainZoneXmlStatusLite.xml",
    "Zone2Status": "/goform/formZone2_Zone2XmlStatus.xml",
    "Zone2StatusLite": "/goform/formZone2_Zone2XmlStatusLite.xml",
    "Zone3Status": "/goform/formZone3_Zone3XmlStatus.xml",
    "Zone3StatusLite": "/goform/formZone3_Zone3XmlStatusLite.xml",
    "Zone4Status": "/goform/formZone4_Zone4XmlStatus.xml",
    "Zone4StatusLite": "/goform/formZone4_Zone4XmlStatusLite.xml",
    "SoundModeStatus": "/goform/formMainZone_MainZoneXmlStatusLite.xml",
    "iPhoneDirect": "/goform/formiPhoneAppDirect.xml?",
    "AppCommand": "/goform/AppCommand.xml",
    "AppCommand300": "/goform/AppCommand0300.xml",
    "TunerStatus": "/goform/formTuner_TunerXml.xml",
    "HdTunerStatus": "/goform/formTuner_HdXml.xml",
    "NetAudioStatus": "/goform/formNetAudio_StatusXml.xml",
    "NetAudioAlbum": "/img/album%20art_S.png",
    "NetAudioArt": "/NetAudio/art.asp-jpg?{time}",
    "NetAudioPost": "/NetAudio/index.put.asp"
};

export const BodyXml = {
    "GetZoneName": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='1'>GetZoneName</cmd> </tx>"
    },
    "GetAllZonePowerStatus": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='1'>GetAllZonePowerStatus</cmd> </tx>"
    },
    "GetAllZoneSource": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='1'>GetAllZoneSource</cmd> </tx>"
    },
    "GetAllZoneVolume": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='1'>GetAllZoneVolume</cmd> </tx>"
    },
    "GetAllZoneMuteStatus": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='1'>GetAllZoneMuteStatus</cmd> </tx>"
    },
    "GetAllZoneStereo": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='1'>GetAllZoneStereo</cmd> </tx>"
    },
    "GetPowerStatus": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='1'>GetPowerStatus</cmd> </tx>"
    },
    "GetSourceStatus": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='1'>GetSourceStatus</cmd> </tx>"
    },
    "GetVolumeLevel": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='1'>GetVolumeLevel</cmd> </tx>"
    },
    "GetMuteStatus": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='1'>GetMuteStatus</cmd> </tx>"
    },
    "GetPictureMode": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='1'>GetPictureMode</cmd> </tx>"
    },
    "GetSurroundModeStatus": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='1'>GetSurroundModeStatus</cmd> </tx>"
    },
    "GetDimmer": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='1'>GetDimmer</cmd> </tx>"
    },
    "GetChannelIndicators": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='1'>GetChannelIndicators</cmd> </tx>"
    },
    "GetVideoSelect": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='1'>GetVideoSelect</cmd> </tx>"
    },
    "GetQuickSelectName": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='1'>GetQuickSelectName</cmd> </tx>"
    },
    "GetAutoStandby": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='1'>GetAutoStandby</cmd> </tx>"
    },
    "GetToneControl": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='1'>GetToneControl</cmd> </tx>"
    },
    "GetSubwooferLevel": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='1'>GetSubwooferLevel</cmd> </tx>"
    },
    "GetNetAudioStatus": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='1'>GetNetAudioStatus</cmd> </tx>"
    },
    "GetRenameSource": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='1'>GetRenameSource</cmd> </tx>"
    },
    "GetDeletedSource": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='1'>GetDeletedSource</cmd> </tx>"
    },
    "GetAudyssey": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='1'>GetAudyssey</cmd> </tx>"
    },
    "GetAudysseyEQCurveType": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='1'>GetAudysseyEQCurveType</cmd> </tx>"
    },
    "SetAudyssey": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='1'>SetAudyssey</cmd> </tx>"
    }
};

export const BodyXml300 = {
    "GetZoneName": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='3'>GetZoneName</cmd> </tx>"
    },
    "GetAllZonePowerStatus": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='3'>GetAllZonePowerStatus</cmd> </tx>"
    },
    "GetAllZoneSource": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='3'>GetAllZoneSource</cmd> </tx>"
    },
    "GetAllZoneVolume": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='3'>GetAllZoneVolume</cmd> </tx>"
    },
    "GetAllZoneMuteStatus": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='3'>GetAllZoneMuteStatus</cmd> </tx>"
    },
    "GetAllZoneStereo": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='3'>GetAllZoneStereo</cmd> </tx>"
    },
    "GetPowerStatus": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='3'>GetPowerStatus</cmd> </tx>"
    },
    "GetSourceStatus": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='3'>GetSourceStatus</cmd> </tx>"
    },
    "GetVolumeLevel": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='3'>GetVolumeLevel</cmd> </tx>"
    },
    "GetMuteStatus": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='3'>GetMuteStatus</cmd> </tx>"
    },
    "GetPictureMode": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='3'>GetPictureMode</cmd> </tx>"
    },
    "GetSurroundModeStatus": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='3'>GetSurroundModeStatus</cmd> </tx>"
    },
    "GetDimmer": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='3'>GetDimmer</cmd> </tx>"
    },
    "GetChannelIndicators": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='3'>GetChannelIndicators</cmd> </tx>"
    },
    "GetVideoSelect": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='3'>GetVideoSelect</cmd> </tx>"
    },
    "GetQuickSelectName": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='3'>GetQuickSelectName</cmd> </tx>"
    },
    "GetAutoStandby": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='3'>GetAutoStandby</cmd> </tx>"
    },
    "GetToneControl": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='3'>GetToneControl</cmd> </tx>"
    },
    "GetSubwooferLevel": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='3'>GetSubwooferLevel</cmd> </tx>"
    },
    "GetNetAudioStatus": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='3'>GetNetAudioStatus</cmd> </tx>"
    },
    "GetRenameSource": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='3'>GetRenameSource</cmd> </tx>"
    },
    "GetDeletedSource": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='3'>GetDeletedSource</cmd> </tx>"
    },
    "GetAudyssey": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='3'>GetAudyssey</cmd> </tx>"
    },
    "GetAudysseyEQCurveType": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='3'>GetAudysseyEQCurveType</cmd> </tx>"
    },
    "SetAudyssey": {
        "data": "<?xml version='1.0' encoding='utf-8'?> <tx> <cmd id='3'>SetAudyssey</cmd> </tx>"
    }
};

export const ZoneName = [
    "Main Zone",
    "Zone 2",
    "Zone 3",
    "Sound Mode",
    "Pass Through Input"
];

export const ZoneNameShort = [
    "MZ",
    "Z2",
    "Z3",
    "SM",
    "PTI"
];

export const ZoneInputSurroundName = [
    "Input",
    "Input",
    "Input",
    "Surround",
    "Input"
];

export const InputSourceType = [
    "OTHER",
    "HOME_SCREEN",
    "TUNER",
    "HDMI",
    "COMPOSITE_VIDEO",
    "S_VIDEO",
    "COMPONENT_VIDEO",
    "DVI",
    "AIRPLAY",
    "USB",
    "APPLICATION"
];

export const InputMode = {
    "INPUT": "SI",
    "FAVOR": "ZM",
    "QUICK": "MS",
    "SMART": "MS",
    "FV": "FV "
};

export const DirectSoundMode = {
    "0MSMOVIE0": {
        "mode": "MSMOVIE",
        "surround": "MSSTEREO"
    },
    "0MSMOVIE1": {
        "mode": "MSMOVIE",
        "surround": "MSDOLBY DIGITAL"
    },
    "0MSMOVIE2": {
        "mode": "MSMOVIE",
        "surround": "MSDTS SURROUND"
    },
    "0MSMOVIE3": {
        "mode": "MSMOVIE",
        "surround": "MSAURO2DSURR"
    },
    "0MSMOVIE4": {
        "mode": "MSMOVIE",
        "surround": "MSAURO3D"
    },
    "0MSMOVIE5": {
        "mode": "MSMOVIE",
        "surround": "MSMCH STEREO"
    },
    "0MSMOVIE6": {
        "mode": "MSMOVIE",
        "surround": "MSMONO MOVIE"
    },
    "0MSMOVIE7": {
        "mode": "MSMOVIE",
        "surround": "MSVIRTUAL"
    },
    "0MSMUSIC0": {
        "mode": "MSMUSIC",
        "surround": "MSSTEREO"
    },
    "0MSMUSIC1": {
        "mode": "MSMUSIC",
        "surround": "MSDOLBY DIGITAL"
    },
    "0MSMUSIC2": {
        "mode": "MSMUSIC",
        "surround": "MSDTS SURROUND"
    },
    "0MSMUSIC3": {
        "mode": "MSMUSIC",
        "surround": "MSAURO2DSURR"
    },
    "0MSMUSIC4": {
        "mode": "MSMUSIC",
        "surround": "MSAURO3D"
    },
    "0MSMUSIC5": {
        "mode": "MSMUSIC",
        "surround": "MSMCH STEREO"
    },
    "0MSMUSIC6": {
        "mode": "MSMUSIC",
        "surround": "MSROCK ARENA"
    },
    "0MSMUSIC7": {
        "mode": "MSMUSIC",
        "surround": "MSJAZZ CLUB"
    },
    "0MSMUSIC8": {
        "mode": "MSMUSIC",
        "surround": "MSMATRIX"
    },
    "0MSMUSIC9": {
        "mode": "MSMUSIC",
        "surround": "MSVIRTUAL"
    },
    "0MSGAME0": {
        "mode": "MSGAME",
        "surround": "MSSTEREO"
    },
    "0MSGAME1": {
        "mode": "MSGAME",
        "surround": "MSDOLBY DIGITAL"
    },
    "0MSGAME2": {
        "mode": "MSGAME",
        "surround": "MSDTS SURROUND"
    },
    "0MSGAME3": {
        "mode": "MSGAME",
        "surround": "MSAURO2DSURR"
    },
    "0MSGAME4": {
        "mode": "MSGAME",
        "surround": "MSAURO3D"
    },
    "0MSGAME5": {
        "mode": "MSGAME",
        "surround": "MSMCH STEREO"
    },
    "0MSGAME6": {
        "mode": "MSGAME",
        "surround": "MSVIDEO GAME"
    },
    "0MSGAME7": {
        "mode": "MSGAME",
        "surround": "MSVIRTUAL"
    }
};

export const SoundModeConversion = {
    "AUTO": "AUTO",
    "MOVIE": "MOVIE",
    "MUSIC": "MUSIC",
    "GAME": "GAME",
    "DIRECT": "DIRECT",
    "DSDDIRECT": "DIRECT",
    "PUREDIRECT": "PURE DIRECT",
    "DSDPUREDIRECT": "PURE DIRECT",
    "STEREO": "STEREO",
    "ALLZONESTEREO": "STEREO",
    "71IN": "MCH STEREO",
    "MCHSTEREO": "MCH STEREO",
    "MULTICHSTEREO": "MCH STEREO",
    "DOLBYSURROUND": "DOLBY DIGITAL",
    "DOLBYPROLOGIC": "DOLBY DIGITAL",
    "DOLBYPLIIMV": "DOLBY DIGITAL",
    "DOLBYPLIIMS": "DOLBY DIGITAL",
    "DOLBYPLIIGM": "DOLBY DIGITAL",
    "DOLBYPL2C": "DOLBY DIGITAL",
    "DOLBYPL2M": "DOLBY DIGITAL",
    "DOLBYPL2G": "DOLBY DIGITAL",
    "DOLBYPL2XC": "DOLBY DIGITAL",
    "DOLBYPL2XM": "DOLBY DIGITAL",
    "DOLBYPL2XG": "DOLBY DIGITAL",
    "DOLBYPL2ZH": "DOLBY DIGITAL",
    "DOLBYATMOS": "DOLBY DIGITAL",
    "DOLBYDIGITAL": "DOLBY DIGITAL",
    "DOLBYAUDIODSUR": "DOLBY DIGITAL",
    "DOLBYAUDIODD": "DOLBY DIGITAL",
    "DOLBYDEX": "DOLBY DIGITAL",
    "DOLBYDPL2XC": "DOLBY DIGITAL",
    "DOLBYDPL2XM": "DOLBY DIGITAL",
    "DOLBYDPL2ZH": "DOLBY DIGITAL",
    "DOLBYDDS": "DOLBY DIGITAL",
    "DOLBYAUDIODDDSUR": "DOLBY DIGITAL",
    "DOLBYDNEOXC": "DOLBY DIGITAL",
    "DOLBYDNEOXM": "DOLBY DIGITAL",
    "DOLBYDNEOXG": "DOLBY DIGITAL",
    "DOLBYDNEURALX": "DOLBY DIGITAL",
    "DOLBYAUDIODDNEURALX": "DOLBY DIGITAL",
    "DOLBYAUDIODDNERUALX": "DOLBY DIGITAL",
    "DOLBYAUDIOTRUEHD": "DOLBY DIGITAL",
    "DOLBYHDEX": "DOLBY DIGITAL",
    "DOLBYHDPL2XC": "DOLBY DIGITAL",
    "DOLBYHDPL2XM": "DOLBY DIGITAL",
    "DOLBYHDPL2ZH": "DOLBY DIGITAL",
    "DOLBYAUDIOTRUEHDDSUR": "DOLBY DIGITAL",
    "DOLBYHDNEOXC": "DOLBY DIGITAL",
    "DOLBYHDNEOXM": "DOLBY DIGITAL",
    "DOLBYHDNEOXG": "DOLBY DIGITAL",
    "DOLBYAUDIOTRUEHDNEURALX": "DOLBY DIGITAL",
    "MULTIINDOLBYSURROUND": "DOLBY DIGITAL",
    "DTSSURROUND": "DTS SURROUND",
    "DTSDSUR": "DTS SURROUND",
    "DTS9624": "DTS SURROUND",
    "DTS96ESMTRX": "DTS SURROUND",
    "DTSPL2XC": "DTS SURROUND",
    "DTSPL2XM": "DTS SURROUND",
    "DTSPL2ZH": "DTS SURROUND",
    "DTSNEURALX": "DTS SURROUND",
    "DTSVIRTUALX": "DTS SURROUND",
    "DTSEXPRESS": "DTS SURROUND",
    "DTSNEO6": "DTS SURROUND",
    "DTSNEO6C": "DTS SURROUND",
    "DTSNEO6M": "DTS SURROUND",
    "DTSNEOXC": "DTS SURROUND",
    "DTSNEOXM": "DTS SURROUND",
    "DTSNEOXG": "DTS SURROUND",
    "DTSESDSCRT61": "DTS SURROUND",
    "DTSESMTRX61": "DTS SURROUND",
    "DTSESMTRXNEURALX": "DTS SURROUND",
    "DTSESDSCRTNEURALX": "DTS SURROUND",
    "DTSES8CHDSCRT": "DTS SURROUND",
    "DTSHD": "DTS SURROUND",
    "DTSHDMSTR": "DTS SURROUND",
    "DTSHDPL2XC": "DTS SURROUND",
    "DTSHDPL2XM": "DTS SURROUND",
    "DTSHDPL2ZH": "DTS SURROUND",
    "DTSHDDSUR": "DTS SURROUND",
    "DTSHDNEO6": "DTS SURROUND",
    "DTSHDNEOXC": "DTS SURROUND",
    "DTSHDNEOXM": "DTS SURROUND",
    "DTSHDNEOXG": "DTS SURROUND",
    "DTSHDNEURALX": "DTS SURROUND",
    "DTSHDVIRTUALX": "DTS SURROUND",
    "DTSX": "DTS SURROUND",
    "DTSXMSTR": "DTS SURROUND",
    "DTSXVIRTUALX": "DTS SURROUND",
    "IMAXDTS": "DTS SURROUND",
    "IMAXDTSX": "DTS SURROUND",
    "IMAXDTSNEURALX": "DTS SURROUND",
    "IMAXDTSVIRTUALX": "DTS SURROUND",
    "IMAXDTSXVIRTUALX": "DTS SURROUND",
    "IMAXDTSXNEURALX": "DTS SURROUND",
    "MCHINDOLBYEX": "DTS SURROUND",
    "MCHINPL2XC": "DTS SURROUND",
    "MCHINPL2XM": "DTS SURROUND",
    "MCHINPL2ZH": "DTS SURROUND",
    "MCHINDSUR": "DTS SURROUND",
    "MCHINNEOXC": "DTS SURROUND",
    "MCHINNEOXM": "DTS SURROUND",
    "MCHINNEOXG": "DTS SURROUND",
    "MCHINNEURALX": "DTS SURROUND",
    "MCHINVIRTUALX": "DTS SURROUND",
    "MULTICHIN": "DTS SURROUND",
    "MULTICHIN71": "DTS SURROUND",
    "MULTIINNEURALX": "DTS SURROUND",
    "MULTIINVIRTUALX": "DTS SURROUND",
    "MPEG2AAC": "DTS SURROUND",
    "AACDOLBYEX": "DTS SURROUND",
    "AACPL2XC": "DTS SURROUND",
    "AACPL2XM": "DTS SURROUND",
    "AACPL2ZH": "DTS SURROUND",
    "AACDSUR": "DTS SURROUND",
    "AACDS": "DTS SURROUND",
    "AACNEOXC": "DTS SURROUND",
    "AACNEOXM": "DTS SURROUND",
    "AACNEOXG": "DTS SURROUND",
    "AACNEURALX": "DTS SURROUND",
    "AACVIRTUALX": "DTS SURROUND",
    "NEO6CDSX": "DTS SURROUND",
    "NEO6MDSX": "DTS SURROUND",
    "AUDYSSEYDSX": "DTS SURROUND",
    "NEURALX": "DTS SURROUND",
    "VIRTUALX": "DTS SURROUND",
    "AURO3D": "AURO3D",
    "AURO2DSURR": "AURO2DSURR",
    "WISDESCREEN": "WIDE SCREEN",
    "SUPERSTADIUM": "SUPER STADIUM",
    "ROCKARENA": "ROCK ARENA",
    "JAZZCLUB": "JAZZ CLUB",
    "CLASSICCONCERT": "CLASSIC CONCERT",
    "MONOMOVIE": "MONO MOVIE",
    "MATRIX": "MATRIX",
    "VIDEOGAME": "VIDEO GAME",
    "VIRTUAL": "VIRTUAL",
    "NEURAL": "NEURAL",
    "STANDARD": "STANDARD",
    "LEFT": "LEFT",
    "RIGHT": "RIGHT"
};

export const PassThroughInputs = [
    {
        'name': "TV AUDIO",
        'reference': "TV",
        'mode': "SI"
    },
    {
        'name': "CD Player",
        'reference': "CD",
        'mode': "SI"
    },
    {
        'name': "DVD Player",
        'reference': "DVD",
        'mode': "SI"
    },
    {
        'name': "Media Player",
        'reference': "MPLAY",
        'mode': "SI"
    },
    {
        'name': "Blu-ray",
        'reference': "BD",
        'mode': "SI"
    },
    {
        'name': "CBL/SAT",
        'reference': "SAT/CBL",
        'mode': "SI"
    },
    {
        'name': "Game",
        'reference': "GAME",
        'mode': "SI"
    },
    {
        'name': "AUX",
        'reference': "AUX1",
        'mode': "SI"
    },
    {
        'name': "Input 8K",
        'reference': "8K",
        'mode': "SI"
    }
];

export const InputConversion = {
    "TV AUDIO": "TV",
    "iPod/USB": "USB/IPOD",
    "Bluetooth": "BT",
    "Blu-ray": "BD",
    "CBL/SAT": "SAT/CBL",
    "AUX": "AUX1",
    "NETWORK": "NET",
    "HEOS": "NET",
    "AirPlay": "NET",
    "Online Music": "NET",
    "Media Player": "MPLAY",
    "Tuner": "TUNER",
    "FM": "TUNER",
    "SpotifyConnect": "SPOTIFYCONNECT",
    "Internet Radio": "IRADIO",
    "Media Server": "SERVER",
    "Spotify": "SPOTIFY",
    "Flickr": "FLICKR",
    "Favorites": "FAVORITES",
    "Quick Select1": "QUICK1",
    "Quick Select2": "QUICK2",
    "Quick Select3": "QUICK3",
    "Quick Select4": "QUICK4",
    "Quick Select5": "QUICK5",
    "Quick Select1 Mode Memory": "QUICK1 MEMORY",
    "Quick Select2 Mode Memory": "QUICK2 MEMORY",
    "Quick Select3 Mode Memory": "QUICK3 MEMORY",
    "Quick Select4 Mode Memory": "QUICK4 MEMORY",
    "Quick Select5 Mode Memory": "QUICK5 MEMORY",
    "Smart Select1": "SMART1",
    "Smart Select2": "SMART2",
    "Smart Select3": "SMART3",
    "Smart Select4": "SMART4",
    "Smart Select5": "SMART5",
    "Smart Select1 Mode Memory": "SMART1 MEMORY",
    "Smart Select2 Mode Memory": "SMART2 MEMORY",
    "Smart Select3 Mode Memory": "SMART3 MEMORY",
    "Smart Select4 Mode Memory": "SMART4 MEMORY",
    "Smart Select5 Mode Memory": "SMART5 MEMORY"
};

export const PictureModesDenon = {
    "Off": "OFF",
    "Standard": "STANDARD",
    "Movie": "MOVIE",
    "Vivid": "VIVID",
    "Stream": "STREAM",
    "Custom": "CUSTOM",
    "ISF Day": "ISF DAY",
    "ISF Night": "ISF NIGHT"
};

export const PictureModesDenonString = {
    "PVOFF": "OFF",
    "PVSTD": "STANDARD",
    "PVMOV": "MOVIE",
    "PVVVD": "VIVID",
    "PVSTM": "STREAM",
    "PVDAY": "ISF DAY",
    "PVNGT": "ISF NIGHT",
    "PVCTM": "CUSTOM"
};

export const PictureModesDenonNumber = {
    "0": "OFF",
    "1": "STANDARD",
    "2": "MOVIE",
    "3": "VIVID",
    "4": "STREAM",
    "5": "ISF DAY",
    "6": "ISF NIGHT",
    "7": "CUSTOM"
};

export const PictureModesConversionToHomeKit = {
    "0": 0,
    "1": 1,
    "2": 5,
    "3": 4,
    "4": 6,
    "5": 2,
    "6": 3,
    "7": 7
};
