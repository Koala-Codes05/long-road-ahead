/**
 * Soveeta Catin BealaLim — Playable Driver Character System.
 *
 * Photorealistic character built from the provided concept images
 * (porcelain-white tech armor, cat-ear headgear, crimson stockings, katana)
 * reimagined as a real human street-racer. She is the face, voice and
 * personality of the game:
 *  - HUD driver chip (avatar + live quips reacting to gameplay)
 *  - Full driver profile panel (TAB or click her chip)
 *  - Voice-line engine using her female voice pack
 *  - Loading screen & garage key art
 */

export const DRIVER_PROFILE = {
    id: 'soveeta',
    displayName: 'SOVEETA',
    fullName: 'SOVEETA CATIN BEALALIM',
    callsign: '"NEKO-01"',
    role: 'Drift Queen — Neo-Kyoto Sector 7',
    age: 24,
    ride: 'Ferrari 458 Italia · Kaido MK-IV',
    wantsTo: 'Run the NighTrunners off her mountain.',
    bio: [
        'Ex-Kaido-Works test pilot turned outlaw street-racer. The porcelain cat-ear rig she wears is a custom heads-up display helmet from her prototype days — the ears are range antennas, supposedly.',
        'She drives the 6.3 km loop they call the LONG ROAD — storm, drizzle, day or dead of night — chasing a perfect drift chain nobody has ever laid down end-to-end.',
        'Rivals say she talks to her car. Her car seems to answer.',
    ],
    stats: { topSpeed: 315, bestChain: 0, racesWon: 47, rep: 'S-CLASS' },
    art: {
        full: 'assets/character/soveeta_full.png',
        portrait: 'assets/character/soveeta_portrait.png',
        garage: 'assets/character/soveeta_garage.jpg',
    },
};

const VOICE_DIR = 'assets/Sounds/soveeta/';

const VOICE_BANKS = {
    nitro: [
        'Voice_Female_V1_Effort_Mono_01.wav',
        'Voice_Female_V1_Effort_Mono_03.wav',
        'Voice_Female_V1_Effort_Mono_05.wav',
        'Voice_Female_V1_Effort_Mono_07.wav',
    ],
    laugh: [
        'Voice_Female_V1_Laugh_Short_Mono_01.wav',
        'Voice_Female_V1_Laugh_Short_Mono_04.wav',
        'Voice_Female_V1_Laugh_Short_Mono_07.wav',
        'Voice_Female_V1_Laugh_Short_Mono_10.wav',
    ],
    best: [
        'Voice_Female_V1_Laugh_Long_Mono_02.wav',
        'Voice_Female_V1_Laugh_Long_Mono_05.wav',
    ],
    attack: [
        'Voice_Female_V1_Attack_Mono_02.wav',
        'Voice_Female_V1_Attack_Mono_05.wav',
        'Voice_Female_V1_Attack_Mono_08.wav',
    ],
};

const QUIPS = {
    nitro: ['NOS lit — hold on!', '全開 — FULL SEND!', 'Boost engaged.'],
    burnout: ['Smokin’ the rears!', 'Haha — tire smoke cocktail!'],
    donut: ['Round and round we go!', 'Donuts in the rain!'],
    hardTurn: ['Tight!', 'Easy… easy— GOT IT.'],
    driftStart: ['Sideways.', 'Initiating slide.'],
    driftBig: ['THAT is how you slide!', 'Chain it, don’t break it!'],
    newBest: ['NEW BEST CHAIN! Unbelievable!', 'Record run — keep pushing!'],
    photo: ['Smile for the camera.', 'That one’s going on the speedwall.', 'Send it to the crew.'],
    garage: ['Let’s try the other machine.', 'Fresh tune loaded.'],
    profile: ['You wanted my file? Here.', 'Eyes on the road, racer.'],
    weather: ['Rain suit weather.', 'Cloud cover — perfect grip.'],
};

/** Minimum seconds between two lines from the same bank. */
const BANK_COOLDOWN = {
    nitro: 5.0, laugh: 3.5, best: 8.0, attack: 4.0,
};

export class CharacterSystem {
    constructor() {
        this.profile = DRIVER_PROFILE;
        this._audioPool = new Map();
        this._lastBankTime = new Map();
        this._quipTimer = 0;
        this._panelOpen = false;
        this._el = {};
    }

    init() {
        this._el.chip = document.getElementById('driver-chip');
        this._el.chipName = document.getElementById('driver-chip-name');
        this._el.quip = document.getElementById('driver-quip');
        this._el.avatar = document.getElementById('driver-avatar');
        this._el.panel = document.getElementById('driver-profile');
        this._el.panelClose = document.getElementById('driver-profile-close');
        this._el.stats = document.getElementById('driver-stat-list');

        if (this._el.avatar) this._el.avatar.src = this.profile.art.portrait;
        if (this._el.chipName) this._el.chipName.textContent = this.profile.displayName;
        if (this._el.chip) {
            this._el.chip.style.display = 'flex';
            this._el.chip.addEventListener('click', () => this.toggleProfilePanel());
        }
        if (this._el.panelClose) {
            this._el.panelClose.addEventListener('click', () => this.toggleProfilePanel(false));
        }
        if (this._el.panel) {
            const art = document.getElementById('driver-profile-art');
            if (art) art.src = this.profile.art.full;
            const bg = document.getElementById('driver-profile-art-bg');
            if (bg) bg.style.backgroundImage = `url('${this.profile.art.garage}')`;
            const nameEl = document.getElementById('driver-profile-name');
            if (nameEl) nameEl.textContent = this.profile.fullName;
            const roleEl = document.getElementById('driver-profile-role');
            if (roleEl) roleEl.textContent = `${this.profile.callsign} · ${this.profile.role}`;
            const bioEl = document.getElementById('driver-profile-bio');
            if (bioEl) bioEl.innerHTML = this.profile.bio.map(p => `<p>${p}</p>`).join('');
            this._renderStats();
        }

        // TAB toggles the driver dossier
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Tab') {
                e.preventDefault();
                this.toggleProfilePanel();
            }
        });

        // Pre-warm audio files so first playback isn't latent
        Object.values(VOICE_BANKS).flat().forEach(f => this._poolAudio(f));
    }

    _renderStats() {
        if (!this._el.stats) return;
        const s = this.profile.stats;
        this._el.stats.innerHTML = `
            <li><span>TOP SPEED</span><b>${s.topSpeed} KM/H</b></li>
            <li><span>BEST CHAIN</span><b id="driver-stat-best">${s.bestChain.toLocaleString('en-US')}</b></li>
            <li><span>RACES WON</span><b>${s.racesWon}</b></li>
            <li><span>REP</span><b>${s.rep}</b></li>`;
    }

    _poolAudio(file) {
        if (this._audioPool.has(file)) return this._audioPool.get(file);
        const a = new Audio(VOICE_DIR + file);
        a.preload = 'auto';
        a.volume = 0.85;
        this._audioPool.set(file, a);
        return a;
    }

    /** Play a random voice line from a bank (cooldown-guarded). */
    playVoice(bank) {
        const files = VOICE_BANKS[bank];
        if (!files || files.length === 0) return;
        const now = performance.now();
        const last = this._lastBankTime.get(bank) || -1e9;
        if ((now - last) / 1000 < (BANK_COOLDOWN[bank] || 3.0)) return;
        this._lastBankTime.set(bank, now);

        const pick = files[Math.floor(Math.random() * files.length)];
        const a = this._poolAudio(pick);
        try {
            a.currentTime = 0;
            const p = a.play();
            if (p && p.catch) p.catch(() => {});
        } catch (e) { /* audio not unlocked yet */ }
    }

    /** Flash a personality quip near her HUD chip. */
    quip(text, duration = 3.2) {
        if (!this._el.quip) return;
        this._el.quip.textContent = `${this.profile.displayName}: ${text}`;
        this._el.quip.classList.add('visible');
        this._quipTimer = duration;
    }

    _pickQuip(cat) {
        const list = QUIPS[cat];
        return list ? list[Math.floor(Math.random() * list.length)] : '';
    }

    /* ---------- Gameplay event bindings ---------- */

    onNitroStart() { this.playVoice('nitro'); this.quip(this._pickQuip('nitro')); }
    onBurnout() { this.playVoice('laugh'); this.quip(this._pickQuip('burnout')); }
    onDonut() { this.playVoice('laugh'); this.quip(this._pickQuip('donut')); }
    onHardTurn() { this.playVoice('attack'); this.quip(this._pickQuip('hardTurn')); }
    onDriftStart() { this.quip(this._pickQuip('driftStart')); }
    onBigDriftChain() { this.playVoice('laugh'); this.quip(this._pickQuip('driftBig')); }
    onNewBest(points) {
        this.playVoice('best');
        this.quip(this._pickQuip('newBest'));
        if (points > this.profile.stats.bestChain) {
            this.profile.stats.bestChain = Math.round(points);
            this._renderStats();
        }
    }
    onPhotoSaved(label) { this.playVoice('best'); this.quip(`${this._pickQuip('photo')} ${label || ''}`.trim()); }
    onGarageChange(carName) { this.playVoice('laugh'); this.quip(`${this._pickQuip('garage')} [${carName}]`); }
    onWeatherChange() { this.quip(this._pickQuip('weather')); }

    toggleProfilePanel(force) {
        if (!this._el.panel) return;
        const show = force !== undefined ? force : !this._panelOpen;
        this._panelOpen = show;
        this._el.panel.classList.toggle('open', show);
        this._el.panel.setAttribute('aria-hidden', show ? 'false' : 'true');
        if (show) this.quip(this._pickQuip('profile'));
    }

    update(dt) {
        if (this._quipTimer > 0) {
            this._quipTimer -= dt;
            if (this._quipTimer <= 0 && this._el.quip) {
                this._el.quip.classList.remove('visible');
            }
        }
    }
}
