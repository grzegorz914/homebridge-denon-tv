import net from 'net';
import EventEmitter from 'events';

// Play state and progress of network sources (Online Music, Spotify, internet radio...) from the HEOS CLI
// of the receiver, the same interface the HEOS app and the Home Assistant HEOS integration use.
// Plain text on port 1255, commands heos://..., JSON answers and change events separated by CRLF
const Port = 1255;
const ReconnectDelays = [5000, 10000, 30000, 60000];
const HeartbeatInterval = 30000;
const PlayStates = { play: 'playing', pause: 'paused', stop: 'idle' };

class Heos extends EventEmitter {
    constructor(host) {
        super();
        this.host = host;
        this.enabled = false;
        this.socket = null;
        this.buffer = '';
        this.pid = null;
        this.attempt = 0;
        this.state = null;
        this.progress = null;
    }

    start() {
        if (this.enabled) return;
        this.enabled = true;
        this.connect();
    }

    stop() {
        this.enabled = false;
        clearTimeout(this.reconnectTimer);
        this.close();
    }

    connect() {
        if (!this.enabled || this.socket) return;

        const socket = net.connect({ host: this.host, port: Port, timeout: 60000 });
        this.socket = socket;
        socket.setEncoding('utf8');
        socket.on('connect', () => {
            this.attempt = 0;
            this.send('system/register_for_change_events?enable=on');
            this.send('player/get_players');
            this.heartbeat = setInterval(() => this.send('system/heart_beat'), HeartbeatInterval);
            this.emit('debug', 'HEOS connected');
        });
        socket.on('data', (data) => this.receive(data));
        socket.on('timeout', () => socket.destroy(new Error('HEOS connection timeout')));
        socket.on('error', (error) => this.emit('debug', `HEOS connection error: ${error.message}`));
        socket.on('close', () => {
            if (this.socket !== socket) return;
            this.close();
            if (!this.enabled) return;
            const delay = ReconnectDelays[Math.min(this.attempt++, ReconnectDelays.length - 1)];
            this.reconnectTimer = setTimeout(() => this.connect(), delay);
        });
    }

    close() {
        clearInterval(this.heartbeat);
        const socket = this.socket;
        this.socket = null;
        this.buffer = '';
        socket?.destroy();
        this.state = null;
        this.progress = null;
        this.update();
    }

    send(command) {
        if (!this.socket || this.socket.destroyed) return;
        this.socket.write(`heos://${command}\r\n`);
    }

    receive(data) {
        this.buffer += data;
        let index;
        while ((index = this.buffer.indexOf('\r\n')) >= 0) {
            const line = this.buffer.slice(0, index).trim();
            this.buffer = this.buffer.slice(index + 2);
            if (!line) continue;
            try {
                this.handle(JSON.parse(line));
            } catch (error) {
                this.emit('debug', `HEOS message error: ${error.message}`);
            }
        }
    }

    handle(message) {
        const heos = message.heos ?? {};
        const command = heos.command ?? '';
        // Answers not ready yet come again when they are
        if (String(heos.message ?? '').includes('command under process')) return;
        const params = Object.fromEntries(new URLSearchParams(heos.message ?? ''));

        switch (command) {
            case 'player/get_players': {
                // The HEOS player of this receiver, several HEOS devices can answer
                const players = Array.isArray(message.payload) ? message.payload : [];
                const player = players.find(p => p.ip === this.host) ?? (players.length === 1 ? players[0] : null);
                this.pid = player?.pid ?? null;
                this.emit('debug', `HEOS player: ${player ? `${player.name}, pid: ${player.pid}` : 'not found'}`);
                if (this.pid !== null) this.send(`player/get_play_state?pid=${this.pid}`);
                break;
            }
            case 'player/get_play_state':
            case 'event/player_state_changed':
                if (String(params.pid) !== String(this.pid)) break;
                this.state = PlayStates[params.state] ?? null;
                this.update();
                break;
            case 'event/player_now_playing_progress': {
                if (String(params.pid) !== String(this.pid)) break;
                // Milliseconds
                const position = Number(params.cur_pos) / 1000;
                const duration = Number(params.duration) / 1000;
                this.progress = Number.isFinite(position) && Number.isFinite(duration) && duration > 0
                    ? { position, duration, positionAt: Date.now() / 1000 }
                    : null;
                this.update();
                break;
            }
            case 'event/player_now_playing_changed':
                if (String(params.pid) !== String(this.pid)) break;
                // A new track, the progress of the old one no longer applies
                this.progress = null;
                this.update();
                break;
            case 'event/players_changed':
                this.send('player/get_players');
                break;
        }
    }

    update() {
        const media = this.state ? { state: this.state, ...(this.progress ?? {}) } : null;
        // Progress events come every second, Home Assistant moves the bar itself, publish only when the state,
        // the track length or the position changes by more than the time passed (seek, new track)
        const last = this.published;
        const drift = media?.position !== undefined && last?.position !== undefined
            ? Math.abs(media.position - (last.position + (last.state === 'playing' ? media.positionAt - last.positionAt : 0)))
            : 0;
        const changed = !media || !last
            || media.state !== last.state
            || media.duration !== last.duration
            || (media.position === undefined) !== (last.position === undefined)
            || drift > 3;
        if (!changed || (!media && !last)) return;
        this.published = media;
        this.emit('media', media);
    }
}

export default Heos;
