import * as THREE from 'three';

/**
 * PhotoMode — Dedicated Photo Mode with Tiled Super-Resolution Renderer.
 *
 * Features:
 *  - Free orbit camera around the car (drag rotate / wheel zoom / Q-E height)
 *  - Live grade controls: exposure, FOV, bloom, film grain, LUT-style filters
 *  - RENDER: instant full-quality capture of the current viewport
 *  - SUPER RESOLUTION: renders the scene TILE BY TILE at 2K / 4K / 8K / 16K,
 *    stitching tiles into one giant canvas and exporting PNG or JPEG —
 *    far beyond the window/GPU backbuffer limits.
 *
 * While photo mode is active the simulation is frozen (rain, spray, sparks
 * stay perfectly still) so every tile captures the exact same frame.
 */

const FILTERS = {
    none: { exposure: 1.0, saturation: 1.04, warmth: 0.0, grain: 0.055 },
    neon: { exposure: 1.05, saturation: 1.35, warmth: -0.10, grain: 0.05 },
    golden: { exposure: 1.02, saturation: 1.12, warmth: 0.55, grain: 0.07 },
    noire: { exposure: 1.08, saturation: 0.0, warmth: 0.0, grain: 0.11 },
    vhs: { exposure: 0.97, saturation: 1.5, warmth: 0.15, grain: 0.16 },
};

const RESOLUTIONS = [
    { id: 'native', label: 'VIEWPORT', width: 0 },
    { id: '2k', label: '2K QHD', width: 2560 },
    { id: '4k', label: '4K UHD', width: 3840 },
    { id: '8k', label: '8K UHD', width: 7680 },
    { id: '16k', label: '16K ULTRA', width: 15360 },
];

export class PhotoMode {
    /**
     * @param {object} env live refs: { camera, renderer, vehicle, character }
     *                     + pass getters: getComposer/getBloom/getGrain/getMotionBlur/getGrade
     */
    constructor(env) {
        this.env = env;
        this.camera = env.camera;
        this.vehicle = env.vehicle;
        this.character = env.character;

        this.active = false;
        this.capturing = false;
        this._cancelRequested = false;

        // Orbit state
        this.yaw = Math.PI;         // start behind the car
        this.pitch = 0.22;
        this.dist = 7.5;
        this.targetYaw = this.yaw;
        this.targetPitch = this.pitch;
        this.targetDist = this.dist;
        this.heightOffset = 0;
        this._dragging = false;
        this._lastX = 0; this._lastY = 0;

        // Photo settings
        this.settings = {
            exposure: 1.0,
            fov: 55,
            bloom: 0.45,
            grain: 0.055,
            filter: 'none',
            format: 'png',
            resId: '4k',
        };

        this._saved = null; // backup of live renderer/pass state
        this._el = {};
        this._captures = [];
    }

    get renderer() { return this.env.getRenderer ? this.env.getRenderer() : this.env.renderer; }
    get composer() { return this.env.getComposer ? this.env.getComposer() : this.env.composer; }

    /* ============================ DOM ============================ */

    init() {
        const ids = [
            'photo-ui', 'pm-close', 'pm-exposure', 'pm-fov', 'pm-bloom', 'pm-grain',
            'pm-format', 'pm-render-btn', 'pm-superres-btn', 'pm-progress',
            'pm-progress-bar', 'pm-progress-label', 'pm-cancel', 'pm-gallery',
            'pm-res-buttons', 'pm-filter-buttons', 'pm-status', 'pm-hud-btn',
        ];
        ids.forEach(id => { this._el[id] = document.getElementById(id); });

        if (this._el['pm-close']) this._el['pm-close'].addEventListener('click', () => this.exit());
        if (this._el['pm-render-btn']) this._el['pm-render-btn'].addEventListener('click', () => this.captureViewport());
        if (this._el['pm-superres-btn']) this._el['pm-superres-btn'].addEventListener('click', () => this.startSuperResolution());
        if (this._el['pm-cancel']) this._el['pm-cancel'].addEventListener('click', () => { this._cancelRequested = true; });
        if (this._el['pm-hud-btn']) this._el['pm-hud-btn'].addEventListener('click', () => this.toggle());

        // Filters
        if (this._el['pm-filter-buttons']) {
            this._el['pm-filter-buttons'].querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', () => {
                    this._el['pm-filter-buttons'].querySelectorAll('button').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.settings.filter = btn.dataset.filter;
                    this._applyFilter(btn.dataset.filter);
                });
            });
        }

        // Resolutions
        if (this._el['pm-res-buttons']) {
            this._el['pm-res-buttons'].querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', () => {
                    this._el['pm-res-buttons'].querySelectorAll('button').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.settings.resId = btn.dataset.res;
                    const res = RESOLUTIONS.find(r => r.id === this.settings.resId);
                    this._setStatus(res && res.width
                        ? `SUPER RES set to ${res.label} — hit SUPER-RES RENDER`
                        : 'Native viewport resolution — hit RENDER');
                });
            });
        }

        // Sliders
        const bind = (id, key, cb) => {
            const el = this._el[id];
            if (!el) return;
            el.addEventListener('input', () => {
                this.settings[key] = parseFloat(el.value);
                const out = document.getElementById(`${id}-val`);
                if (out) out.textContent = parseFloat(el.value).toFixed(2);
                if (cb) cb(this.settings[key]);
            });
        };
        bind('pm-exposure', 'exposure', v => { if (this.renderer) this.renderer.toneMappingExposure = this._baseExposure() * v; });
        bind('pm-fov', 'fov', v => { this.camera.fov = v; this.camera.updateProjectionMatrix(); });
        bind('pm-bloom', 'bloom', v => { const b = this.env.getBloom && this.env.getBloom(); if (b) b.strength = v; });
        bind('pm-grain', 'grain', v => { const g = this.env.getGrain && this.env.getGrain(); if (g) g.uniforms.uIntensity.value = v; });

        if (this._el['pm-format']) {
            this._el['pm-format'].addEventListener('change', () => {
                this.settings.format = this._el['pm-format'].value;
            });
        }

        // Orbit input (bound to the GL canvas)
        const canvas = document.getElementById('webgl-canvas');
        if (canvas) {
            canvas.addEventListener('mousedown', (e) => {
                if (!this.active || e.button !== 0) return;
                this._dragging = true;
                this._lastX = e.clientX; this._lastY = e.clientY;
            });
            window.addEventListener('mouseup', () => { this._dragging = false; });
            window.addEventListener('mousemove', (e) => {
                if (!this.active || !this._dragging) return;
                this.targetYaw -= (e.clientX - this._lastX) * 0.006;
                this.targetPitch += (e.clientY - this._lastY) * 0.004;
                this.targetPitch = THREE.MathUtils.clamp(this.targetPitch, -0.25, 1.25);
                this._lastX = e.clientX; this._lastY = e.clientY;
            });
            window.addEventListener('wheel', (e) => {
                if (!this.active) return;
                this.targetDist = THREE.MathUtils.clamp(this.targetDist + e.deltaY * 0.008, 2.4, 24);
            }, { passive: true });
        }

        window.addEventListener('keydown', (e) => {
            if (e.code === 'KeyP' && !e.repeat) this.toggle();
            if (!this.active) return;
            switch (e.code) {
                case 'KeyQ': this.heightOffset = Math.max(-1.2, this.heightOffset - 0.12); break;
                case 'KeyE': this.heightOffset = Math.min(6, this.heightOffset + 0.12); break;
                case 'KeyR':
                    this.targetYaw = Math.PI; this.targetPitch = 0.22;
                    this.targetDist = 7.5; this.heightOffset = 0;
                    break;
                case 'Enter':
                    if (!this.capturing) {
                        if (this.settings.resId === 'native') this.captureViewport();
                        else this.startSuperResolution();
                    }
                    break;
                case 'Escape': this.exit(); break;
            }
        });
    }

    _baseExposure() {
        // The weather presets tune renderer exposure (0.88–0.95); respect that as the base.
        return this.env.getBaseExposure ? this.env.getBaseExposure() : 0.9;
    }

    _applyFilter(name) {
        const f = FILTERS[name] || FILTERS.none;
        const grade = this.env.getGrade && this.env.getGrade();
        if (grade) {
            grade.uniforms.uSaturation.value = f.saturation;
            if (grade.uniforms.uWarmth) grade.uniforms.uWarmth.value = f.warmth;
        }
        this.settings.exposure = f.exposure;
        this.settings.grain = f.grain;
        if (this._el['pm-exposure']) {
            this._el['pm-exposure'].value = f.exposure;
            const out = document.getElementById('pm-exposure-val');
            if (out) out.textContent = f.exposure.toFixed(2);
        }
        if (this._el['pm-grain']) {
            this._el['pm-grain'].value = f.grain;
            const out = document.getElementById('pm-grain-val');
            if (out) out.textContent = f.grain.toFixed(3);
        }
        if (this.renderer) this.renderer.toneMappingExposure = this._baseExposure() * f.exposure;
        const g = this.env.getGrain && this.env.getGrain();
        if (g) g.uniforms.uIntensity.value = f.grain;
    }

    _setStatus(msg) {
        if (this._el['pm-status']) this._el['pm-status'].textContent = msg;
    }

    /* ============================ STATE ============================ */

    toggle() { this.active ? this.exit() : this.enter(); }

    enter() {
        if (this.active) return;
        this.active = true;

        // Backup live presentation state
        const grade = this.env.getGrade && this.env.getGrade();
        const grain = this.env.getGrain && this.env.getGrain();
        this._saved = {
            exposure: this.renderer ? this.renderer.toneMappingExposure : 0.9,
            fov: this.camera.fov,
            bloom: (this.env.getBloom && this.env.getBloom()) ? this.env.getBloom().strength : 0.45,
            grainVal: grain ? grain.uniforms.uIntensity.value : 0.055,
            saturation: grade ? grade.uniforms.uSaturation.value : 1.04,
            warmth: grade && grade.uniforms.uWarmth ? grade.uniforms.uWarmth.value : 0,
        };

        // Start orbit from current chase orientation
        this.targetYaw = Math.PI; this.yaw = Math.PI;
        this.targetPitch = 0.22; this.pitch = 0.22;
        this.targetDist = 7.5; this.dist = 7.5;
        this.heightOffset = 0;

        document.body.classList.add('photo-mode');
        if (this._el['photo-ui']) this._el['photo-ui'].classList.add('open');
        this._applyFilter(this.settings.filter);
        this._setStatus('Photo mode live — drag to orbit, wheel to zoom, Q/E height, ENTER shoots.');
    }

    exit() {
        if (!this.active) return;
        this.active = false;
        this._cancelRequested = true; // abort any running capture

        // Restore presentation state
        if (this._saved) {
            if (this.renderer) this.renderer.toneMappingExposure = this._saved.exposure;
            const b = this.env.getBloom && this.env.getBloom();
            if (b) b.strength = this._saved.bloom;
            const g = this.env.getGrain && this.env.getGrain();
            if (g) g.uniforms.uIntensity.value = this._saved.grainVal;
            const grade = this.env.getGrade && this.env.getGrade();
            if (grade) {
                grade.uniforms.uSaturation.value = this._saved.saturation;
                if (grade.uniforms.uWarmth) grade.uniforms.uWarmth.value = this._saved.warmth;
            }
            this.camera.fov = this._saved.fov;
            this.camera.updateProjectionMatrix();
        }

        document.body.classList.remove('photo-mode');
        if (this._el['photo-ui']) this._el['photo-ui'].classList.remove('open');
        this._hideProgress();
    }

    /** Free orbit camera update (called from the game loop while active). */
    updateCamera(dt) {
        if (!this.vehicle || !this.vehicle.mesh) return;
        const carPos = this.vehicle.mesh.position;
        const heading = this.vehicle.heading || 0;

        const s = 1 - Math.exp(-10 * dt);
        this.yaw += (this.targetYaw - this.yaw) * s;
        this.pitch += (this.targetPitch - this.pitch) * s;
        this.dist += (this.targetDist - this.dist) * s;

        const a = heading + this.yaw;
        const cx = carPos.x + Math.sin(a) * Math.cos(this.pitch) * this.dist;
        const cy = carPos.y + 0.9 + Math.sin(this.pitch) * this.dist + this.heightOffset;
        const cz = carPos.z + Math.cos(a) * Math.cos(this.pitch) * this.dist;

        this.camera.position.set(cx, cy, cz);
        this.camera.lookAt(carPos.x, carPos.y + 0.85 + this.heightOffset * 0.5, carPos.z);
    }

    /* ============================ CAPTURE ============================ */

    _nextTick() { return new Promise(r => setTimeout(r, 0)); }

    _showProgress(label) {
        if (this._el['pm-progress']) this._el['pm-progress'].classList.add('open');
        if (this._el['pm-progress-bar']) this._el['pm-progress-bar'].style.width = '0%';
        if (this._el['pm-progress-label']) this._el['pm-progress-label'].textContent = label;
    }

    _hideProgress() {
        if (this._el['pm-progress']) this._el['pm-progress'].classList.remove('open');
    }

    _setProgress(f, label) {
        if (this._el['pm-progress-bar']) this._el['pm-progress-bar'].style.width = `${(f * 100).toFixed(1)}%`;
        if (label && this._el['pm-progress-label']) this._el['pm-progress-label'].textContent = label;
    }

    /** Freeze post-fx that depend on frame time so tiles stitch perfectly. */
    _freezeFrameState() {
        const mb = this.env.getMotionBlur && this.env.getMotionBlur();
        const g = this.env.getGrain && this.env.getGrain();
        this._fxFrozen = {
            motion: mb ? mb.uniforms.uStrength.value : 0,
            grainTime: g ? g.uniforms.uTime.value : 0,
            grainSpeed: g ? g.uniforms.uSpeedBoost.value : 0,
        };
        if (mb) mb.uniforms.uStrength.value = 0;
        if (g) g.uniforms.uSpeedBoost.value = 0;
    }

    _unfreezeFrameState(finished) {
        const mb = this.env.getMotionBlur && this.env.getMotionBlur();
        if (mb && this._fxFrozen) mb.uniforms.uStrength.value = this._fxFrozen.motion;
        // grain time keeps advancing live; nothing else to restore
    }

    _readTileToCanvas(tw, th) {
        const gl = this.renderer.getContext();
        const pixels = new Uint8Array(tw * th * 4);
        gl.readPixels(0, 0, tw, th, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

        const tileCanvas = document.createElement('canvas');
        tileCanvas.width = tw; tileCanvas.height = th;
        const tctx = tileCanvas.getContext('2d');
        const img = tctx.createImageData(tw, th);
        // GL origin is bottom-left — flip rows
        for (let y = 0; y < th; y++) {
            const src = (th - 1 - y) * tw * 4;
            img.data.set(pixels.subarray(src, src + tw * 4), y * tw * 4);
        }
        tctx.putImageData(img, 0, 0);
        return tileCanvas;
    }

    _downloadAndGallery(bigCanvas, label, format) {
        return new Promise((resolve, reject) => {
            const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
            const q = format === 'jpeg' ? 0.92 : undefined;
            bigCanvas.toBlob((blob) => {
                if (!blob) { reject(new Error('Canvas export failed (image too large for this browser). Try a lower resolution or JPEG.')); return; }
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `LONGROAD_SOVEETA_${label}.${format === 'jpeg' ? 'jpg' : 'png'}`;
                a.click();
                this._addToGallery(url, label);
                resolve({ url, size: blob.size });
            }, mime, q);
        });
    }

    _addToGallery(url, label) {
        if (!this._el['pm-gallery']) return;
        const item = document.createElement('a');
        item.className = 'pm-shot';
        item.href = url;
        item.target = '_blank';
        item.download = `LONGROAD_SOVEETA_${label}`;
        const img = document.createElement('img');
        img.src = url;
        img.alt = label;
        const cap = document.createElement('span');
        cap.textContent = label;
        item.appendChild(img);
        item.appendChild(cap);
        this._el['pm-gallery'].prepend(item);
        this._captures.push({ url, label });
    }

    /** Instant capture at the current viewport resolution. */
    async captureViewport() {
        if (this.capturing || !this.composer) return;
        this.capturing = true;
        this._cancelRequested = false;
        this._showProgress('Rendering viewport frame…');
        try {
            await this._nextTick(); await this._nextTick();
            this._freezeFrameState();
            this.composer.render();
            const w = this.renderer.domElement.width;
            const h = this.renderer.domElement.height;
            const tile = this._readTileToCanvas(w, h);
            const label = `VIEWPORT_${w}x${h}`;
            this._setProgress(0.9, 'Encoding image…');
            await this._downloadAndGallery(tile, label, this.settings.format);
            this._setProgress(1.0, 'Saved ✔');
            if (this.character) this.character.onPhotoSaved(label);
        } catch (err) {
            console.error('Viewport capture failed:', err);
            this._setStatus(`⚠ ${err.message}`);
        } finally {
            this._unfreezeFrameState();
            this.capturing = false;
            setTimeout(() => this._hideProgress(), 900);
        }
    }

    /**
     * TILED SUPER RESOLUTION RENDERER.
     * Renders the frozen frame tile-by-tile through the full post-processing
     * composer using camera.setViewOffset() + readPixels, then stitches the
     * tiles into a single huge canvas. 2K = 2 tiles wide, 16K = 8×5 = 40 tiles.
     */
    async startSuperResolution() {
        if (this.capturing || !this.composer) return;

        const res = RESOLUTIONS.find(r => r.id === this.settings.resId) || RESOLUTIONS[2];
        if (!res.width) { this.captureViewport(); return; }

        const fullW = res.width;
        const fullH = Math.round(fullW / this.camera.aspect);

        // Memory guard: 16K RGBA ≈ 530 MB — confirm before melting the tab.
        const bytes = fullW * fullH * 4;
        if (bytes > 320 * 1024 * 1024) {
            const ok = window.confirm(
                `${res.label} = ${fullW}×${fullH} (~${(bytes / 1024 / 1024).toFixed(0)} MB of canvas memory).\n` +
                `This can freeze weaker machines for ~10 s. Continue?`
            );
            if (!ok) return;
        }

        this.capturing = true;
        this._cancelRequested = false;
        const renderer = this.renderer;
        const composer = this.composer;

        const prevPR = renderer.getPixelRatio();
        const cssW = window.innerWidth;
        const cssH = window.innerHeight;

        this._freezeFrameState();
        this._showProgress(`Preparing ${res.label} capture…`);

        // Pick tile size (≤ 2048 keeps readbacks fast and memory tiny)
        const maxTex = renderer.capabilities.maxTextureSize || 4096;
        const tile = Math.min(2048, maxTex);
        const cols = Math.ceil(fullW / tile);
        const rows = Math.ceil(fullH / tile);
        const totalTiles = cols * rows;

        try {
            const big = document.createElement('canvas');
            big.width = fullW;
            big.height = fullH;
            const bctx = big.getContext('2d');
            bctx.fillStyle = '#000';
            bctx.fillRect(0, 0, fullW, fullH);

            renderer.setPixelRatio(1);
            if (composer.setPixelRatio) composer.setPixelRatio(1);

            let done = 0;
            const t0 = performance.now();

            for (let ty = 0; ty < rows; ty++) {
                for (let tx = 0; tx < cols; tx++) {
                    if (this._cancelRequested) throw new Error('Capture cancelled');

                    const ox = tx * tile;
                    // GL rows run bottom→top: tile row 0 is the BOTTOM of the image
                    const oyGL = (rows - 1 - ty) * tile;
                    const tw = Math.min(tile, fullW - ox);
                    const th = Math.min(tile, fullH - oyGL);

                    renderer.setSize(tw, th, false);
                    composer.setSize(tw, th);

                    this.camera.setViewOffset(fullW, fullH, ox, oyGL, tw, th);
                    this.camera.updateProjectionMatrix();

                    composer.render();

                    const tileCanvas = this._readTileToCanvas(tw, th);
                    bctx.drawImage(tileCanvas, ox, oyGL);

                    done++;
                    const frac = done / totalTiles;
                    const elapsed = (performance.now() - t0) / 1000;
                    const eta = elapsed / done * (totalTiles - done);
                    this._setProgress(frac * 0.92,
                        `Tile ${done}/${totalTiles} · ${res.label} (${fullW}×${fullH}) · ETA ${eta.toFixed(1)}s`);
                    await this._nextTick();
                }
            }

            this.camera.setViewOffset(); // reset

            this._setProgress(0.95, 'Encoding image…');
            await this._nextTick();

            const label = `${res.label.replace(/\s/g, '')}_${fullW}x${fullH}`;
            const { size } = await this._downloadAndGallery(big, label, this.settings.format);
            this._setProgress(1.0, `Saved ✔ (${(size / 1024 / 1024).toFixed(1)} MB)`);
            this._setStatus(`${res.label} captured — ${fullW}×${fullH}, ${totalTiles} tiles stitched.`);
            if (this.character) this.character.onPhotoSaved(res.label);
        } catch (err) {
            console.error('Super-resolution capture failed:', err);
            this._setStatus(`⚠ ${err.message}`);
        } finally {
            this.camera.setViewOffset();
            this.camera.updateProjectionMatrix();
            renderer.setPixelRatio(prevPR);
            if (composer.setPixelRatio) composer.setPixelRatio(prevPR);
            renderer.setSize(cssW, cssH); // restore CSS-size (updateStyle=true)
            composer.setSize(cssW, cssH);
            this._unfreezeFrameState();
            this.capturing = false;
            setTimeout(() => this._hideProgress(), 1200);
        }
    }
}
