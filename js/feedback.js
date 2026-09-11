/**
 * FeedbackSystem — Gameplay Reward & Fame Loop.
 *
 * Turns raw physics telemetry into visible & audible reward:
 *  - Binds DriftingSystem.driftScore chains to the #dc-score HUD fame counter
 *  - Stunt popups (BURNOUT / DONUT / HARD TURN / DRIFT CHAIN BANKED)
 *  - Score multipliers for sustained maneuvers
 *  - Extra tire smoke + squeal triggers via TireMist & AudioEngine hooks
 */

const MANEUVER_REWARDS = {
    BURNOUT: { points: 150, label: '🔥 BURNOUT', mult: 2, voice: 'onBurnout' },
    DONUT: { points: 320, label: '🍩 DONUT', mult: 3, voice: 'onDonut' },
    HARD_TURN: { points: 90, label: '↩ HARD TURN', mult: 2, voice: 'onHardTurn' },
};

const MANEUVER_COOLDOWN = 4.5; // seconds between rewards of the same stunt type

export class FeedbackSystem {
    constructor(vehicle, character, audioEngine) {
        this.vehicle = vehicle;
        this.character = character;
        this.audio = audioEngine;
        this.weather = null; // attachWeather()

        // Fame economy
        this.fameBanked = 0;     // confirmed fame (HUD total)
        this.chainLive = 0;      // current un-banked drift chain
        this.chainPeak = 0;      // biggest chain of the session
        this.lastDriftScore = 0;
        this._wasDrifting = false;

        // Maneuver tracking
        this._lastManeuver = null;
        this._maneuverTimers = {};

        // DOM
        this.elScore = document.getElementById('dc-score');
        this.elChain = document.getElementById('dc-chain');
        this.elPopupLayer = document.getElementById('popup-layer');
        this.elFamePopup = document.getElementById('fame-popup');

        this._popupQueue = [];
    }

    attachWeather(weather) {
        this.weather = weather;
    }

    _format(n) {
        return Math.floor(n).toLocaleString('en-US');
    }

    /** Central stunt/fame popup. type: 'stunt' | 'bank' | 'best' */
    popup(text, type = 'stunt') {
        if (!this.elPopupLayer) return;
        const el = document.createElement('div');
        el.className = `stunt-popup stunt-${type}`;
        el.innerHTML = text;
        this.elPopupLayer.appendChild(el);
        requestAnimationFrame(() => el.classList.add('show'));
        setTimeout(() => {
            el.classList.add('fade');
            setTimeout(() => el.remove(), 500);
        }, 1600);
    }

    _centerFlash(points, label, mult) {
        if (!this.elFamePopup) return;
        this.elFamePopup.innerHTML = `<span class="fp-points">+${this._format(points)}</span><span class="fp-label">${label}${mult > 1 ? ` <em>×${mult}</em>` : ''}</span>`;
        this.elFamePopup.classList.remove('show');
        // force reflow to restart animation
        void this.elFamePopup.offsetWidth;
        this.elFamePopup.classList.add('show');
    }

    _bankChain() {
        if (this.chainLive < 60) { this.chainLive = 0; return; }

        const ds = this.vehicle.driftingSystem;
        const mult = ds ? ds.driftMultiplier : 1;
        const bankPts = Math.round(this.chainLive);
        this.fameBanked += bankPts;
        this.chainPeak = Math.max(this.chainPeak, bankPts);

        this._centerFlash(bankPts, 'DRIFT BANKED', mult);
        if (bankPts >= 5000) {
            this.popup(`🔥 MASSIVE CHAIN +${this._format(bankPts)}`, 'best');
            if (this.character) this.character.onNewBest(bankPts);
        } else if (bankPts >= 1500) {
            this.popup(`★ BIG CHAIN +${this._format(bankPts)}`, 'bank');
            if (this.character) this.character.onBigDriftChain();
        } else {
            this.popup(`+${this._format(bankPts)} DRIFT`, 'bank');
        }

        this.chainLive = 0;
    }

    _rewardManeuver(type) {
        const def = MANEUVER_REWARDS[type];
        if (!def) return;

        const now = performance.now() / 1000;
        if (now - (this._maneuverTimers[type] || -1e9) < MANEUVER_COOLDOWN) return;
        this._maneuverTimers[type] = now;

        const pts = def.points * def.mult;
        this.fameBanked += pts;
        this._centerFlash(pts, def.label, def.mult);
        this.popup(`${def.label} +${this._format(pts)}`, 'stunt');

        // Bonus tire smoke + squeal reward
        if (this.audio) this.audio.squealBoost = 1.0;
        if (this.weather && this.weather.tireMist && typeof this.weather.tireMist.spawnManeuverBurst === 'function') {
            this.weather.tireMist.spawnManeuverBurst();
        }

        if (this.character && typeof this.character[def.voice] === 'function') {
            this.character[def.voice]();
        }
    }

    update(dt) {
        if (!this.vehicle) return;
        const ds = this.vehicle.driftingSystem;
        const ms = this.vehicle.maneuversSystem;
        if (!ds) return;

        // ---- Drift chain accumulation (fame only banks when you stop sliding) ----
        const scoreDelta = Math.max(0, ds.driftScore - this.lastDriftScore);
        this.lastDriftScore = ds.driftScore;

        if (ds.isDrifting && Math.abs(ds.driftAngle) > 0.06) {
            if (!this._wasDrifting && this.character) this.character.onDriftStart();
            this._wasDrifting = true;
            this.chainLive += scoreDelta;
        } else if (this._wasDrifting) {
            this._wasDrifting = false;
            this._bankChain();
        }

        // ---- Stunt maneuver detection (rising edge) ----
        const active = ms ? ms.activeManeuver : null;
        if (active && active !== this._lastManeuver) {
            if (active === 'BURNOUT' || active === 'DONUT' || active === 'HARD_TURN') {
                this._rewardManeuver(active);
            }
        }
        this._lastManeuver = active;

        // ---- HUD score binding ----
        const displayTotal = this.fameBanked + this.chainLive;
        if (this.elScore) this.elScore.textContent = this._format(displayTotal);
        if (this.elChain) {
            if (this.chainLive > 50) {
                this.elChain.style.display = 'block';
                this.elChain.innerHTML = `CHAIN +${this._format(this.chainLive)} <span>×${ds.driftMultiplier}</span>`;
            } else {
                this.elChain.style.display = 'none';
            }
        }
    }
}
