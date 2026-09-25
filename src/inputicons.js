import { readFile } from 'fs/promises';

// Icons of the receiver inputs for Home Assistant, the receiver does not provide any.
// Material Design Icons (Apache 2.0, https://pictogrammers.com) rendered to PNG in /icons
const IconsDir = new URL('../icons/', import.meta.url);

const InputIcons = {
    'PHONO': 'record-player',
    'CD': 'disc',
    'CDR': 'disc',
    'DVD': 'disc-player',
    'BD': 'disc-player',
    'HDP': 'disc-player',
    'TV': 'television',
    'SAT/CBL': 'satellite-variant',
    'SAT': 'satellite-variant',
    'CBL': 'satellite-variant',
    'MPLAY': 'play-circle',
    'OTP': 'play-circle',
    'GAME': 'gamepad-variant',
    'GAME1': 'gamepad-variant',
    'GAME2': 'gamepad-variant',
    'TUNER': 'radio',
    'HDRADIO': 'radio',
    'DVR': 'harddisk',
    'VCR': 'video-vintage',
    'DOCK': 'dock-window',
    'NET/USB': 'usb',
    'USB/IPOD': 'usb',
    'USB': 'usb',
    'IPD': 'usb',
    'NET': 'lan',
    'BT': 'bluetooth',
    '8K': 'video-input-hdmi',
    'DIGITALIN1': 'audio-input-rca',
    'IRADIO': 'radio-tower',
    'IRP': 'radio-tower',
    'SERVER': 'server-network',
    'SPOTIFY': 'spotify',
    'SPOTIFYCONNECT': 'spotify',
    'FLICKR': 'image-multiple',
    'SIRIUS': 'music-circle',
    'SIRIUSXM': 'music-circle',
    'RHAPSODY': 'music-circle',
    'PANDORA': 'music-circle',
    'NAPSTER': 'music-circle',
    'LASTFM': 'music-circle',
    'FAVORITES': 'star',
    'FVP': 'star',
    'SOURCE': 'speaker'
};

class InputIconsStore {
    constructor() {
        this.cache = new Map();
    }

    // Icon file name of an input reference, AUX and quick / smart / favorite selects by prefix, others the generic input icon
    iconName(reference) {
        const ref = String(reference ?? '').toUpperCase().replace(/ MEMORY$/, '');
        if (InputIcons[ref]) return InputIcons[ref];
        if (/^(AUX|V\.AUX|M-XPORT)/.test(ref)) return 'audio-input-stereo-minijack';
        if (/^FAVORITE\d/.test(ref)) return 'star';
        const select = ref.match(/^(QUICK|SMART)([1-5])$/);
        if (select) return `numeric-${select[2]}-circle`;
        return 'import';
    }

    // PNG bytes of the input icon, read once and cached
    async get(reference) {
        const name = this.iconName(reference);
        if (!this.cache.has(name)) this.cache.set(name, await readFile(new URL(`${name}.png`, IconsDir)).catch(() => null));
        return this.cache.get(name);
    }
}

export default new InputIconsStore();
