/* ================================================================
   UISystem — Real pause menu (ESC), settings page, HUD polish glue.
   - Pauses the simulation (animate loop gates on pauseSystem.paused)
   - Settings persist to localStorage and are applied live:
     graphics quality, post-FX toggles, audio volume, voice, FPS HUD,
     handling mood mirror
   ================================================================ */

const SETTINGS_KEY = 'lra_settings_v1';

const DEFAULT_SETTINGS = {
    quality: 'balanced',       // performance | balanced | quality | ultra
    bloom: true,
    motionBlur: true,
    filmGrain: true,
    masterVolume: 0.9,
    voiceLines: true,
    showFps: true,
};

export class PauseSystem {
    constructor() {
        this.paused = false;
        this._el = {};
    }

    init(deps) {
        this.deps = deps;   // { renderer, passes, audioEngine, character, vehicle, photoMode, feedback }
        this._el.overlay = document.getElementById('pause-overlay');
        this._el.tabs = document.querySelectorAll('#pause-overlay .pm-tab');
        this._el.panels = document.querySelectorAll('#pause-overlay .pm-panel');

        // Resume / tab / photo buttons
        document.getElementById('pm-resume')?.addEventListener('click', () => this.close());
        document.getElementById('pm-photo')?.addEventListener('click', () => {
            this.close();
            this.deps.photoMode?.enter?.();
        });
        this._el.tabs.forEach(t => t.addEventListener('click', () => this._showTab(t.dataset.tab)));

        window.addEventListener('keydown', (e) => {
            if (e.code !== 'Escape' || e.repeat) return;
            if (this.deps.photoMode?.active) return; // photo mode owns ESC
            if (window.__LRA_IN_PHOTO) return;
            this.toggle();
        });
    }

    _showTab(name) {
        this._el.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
        this._el.panels.forEach(p => p.classList.toggle('active', p.id === `pm-panel-${name}`));
    }

    toggle() { this.paused ? this.close() : this.open(); }

    open() {
        if (this.paused) return;
        this.paused = true;
        this._el.overlay?.classList.add('open');
        this._syncStats();
        this.deps.settings?.refresh();
        this.deps.character?.quip('Pit stop. Take your time.');
    }

    close() {
        this.paused = false;
        this._el.overlay?.classList.remove('open');
    }

    _syncStats() {
        const el = document.getElementById('pm-stats');
        if (!el) return;
        const ds = this.deps.drifting;
        const fame = this.deps.feedback?.totalScore ?? Math.floor(ds?.driftScore ?? 0);
        el.innerHTML = `
            <div class="pm-stat"><span>DRIFT FAME</span><b>${fame.toLocaleString()}</b></div>
            <div class="pm-stat"><span>BEST CHAIN</span><b>${Math.floor(ds?.bestChain || 0).toLocaleString()}</b></div>
            <div class="pm-stat"><span>HANDLING</span><b>${this.deps.vehicle?.handling?.name?.split(' · ')[0] || 'BALANCED'}</b></div>`;
    }
}

export class SettingsSystem {
    constructor() {
        this.settings = { ...DEFAULT_SETTINGS };
        this._load();
    }

    _load() {
        try {
            const raw = localStorage.getItem(SETTINGS_KEY);
            if (raw) Object.assign(this.settings, JSON.parse(raw));
        } catch (e) { /* noop */ }
    }

    _save() {
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch (e) { /* noop */ }
    }

    init(deps) {
        this.deps = deps;
        this._bindUI();
        this.applyAll();
    }

    _bindUI() {
        const s = this.settings;

        const qualitySel = document.getElementById('set-quality');
        if (qualitySel) {
            qualitySel.value = s.quality;
            qualitySel.addEventListener('change', () => this.set('quality', qualitySel.value));
        }
        const bindToggle = (id, key) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.checked = !!s[key];
            el.addEventListener('change', () => this.set(key, el.checked));
        };
        bindToggle('set-bloom', 'bloom');
        bindToggle('set-motion', 'motionBlur');
        bindToggle('set-grain', 'filmGrain');
        bindToggle('set-voice', 'voiceLines');
        bindToggle('set-fps', 'showFps');

        const vol = document.getElementById('set-volume');
        if (vol) {
            vol.value = Math.round(s.masterVolume * 100);
            vol.addEventListener('input', () => this.set('masterVolume', vol.value / 100));
        }

        // Handling mood mirror (three buttons)
        document.querySelectorAll('#set-handling button').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.handling, 10);
                if (this.deps.vehicle && idx !== this.deps.vehicle.handlingIndex) {
                    this.deps.vehicle.handlingIndex = idx;
                    try { localStorage.setItem('lra_handling', String(idx)); } catch (e) { /* noop */ }
                    this.deps.feedback?.popup(`🕹 ${this.deps.vehicle.handling.name}`, 'bank');
                }
                this._syncHandlingButtons();
            });
        });
    }

    set(key, value) {
        this.settings[key] = value;
        this._save();
        this.apply(key);
    }

    applyAll() { Object.keys(this.settings).forEach(k => this.apply(k)); }

    apply(key) {
        const d = this.deps, s = this.settings;
        switch (key) {
            case 'quality': {
                // Feed the adaptive governor's CAP (it picks the actual ratio)
                const pr = { performance: 0.95, balanced: 1.3, quality: 1.6, ultra: 2.0 }[s.quality] || 1.3;
                if (window.__LRA_GOVERNOR) window.__LRA_GOVERNOR.setCap(pr);
                else { d.renderer?.setPixelRatio(Math.min(window.devicePixelRatio, pr)); window.dispatchEvent(new Event('resize')); }
                break;
            }
            case 'bloom':
                if (d.passes?.bloomPass) d.passes.bloomPass.enabled = s.bloom;
                break;
            case 'motionBlur':
                if (d.passes?.motionBlurPass) d.passes.motionBlurPass.enabled = s.motionBlur;
                break;
            case 'filmGrain':
                if (d.passes?.filmGrainPass) d.passes.filmGrainPass.enabled = s.filmGrain;
                break;
            case 'masterVolume':
                if (d.audioEngine?.masterGain) d.audioEngine.masterGain.gain.value = s.masterVolume;
                break;
            case 'voiceLines':
                if (d.character) d.character.voiceEnabled = s.voiceLines;
                break;
            case 'showFps': {
                const hud = document.getElementById('fps-hud-panel');
                if (hud) hud.style.display = s.showFps ? '' : 'none';
                break;
            }
        }
    }

    _syncHandlingButtons() {
        const v = this.deps.vehicle;
        document.querySelectorAll('#set-handling button').forEach(btn =>
            btn.classList.toggle('active', v && parseInt(btn.dataset.handling, 10) === v.handlingIndex));
    }

    /** Called when pause opens so handling buttons mirror current mood. */
    refresh() { this._syncHandlingButtons(); }
}
