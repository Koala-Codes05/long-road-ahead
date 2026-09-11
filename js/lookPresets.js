/* ================================================================
   LookPresets — one-key cinematic film look (KeyM / Settings).
   "Cinema" is a recipe, not an effect stack:
     2.39:1 letterbox · disciplined exposure · compressed highlights
     · slightly lifted blacks · desaturated teal-orange grade ·
     stronger halation bloom · heavier grain · tighter lens (0.9x FOV)
   ================================================================ */

export const LOOK_PRESETS = {
    native: {
        id: 'native', label: 'NATIVE (Arcade)',
        exposure: 0.88, highlightCompress: 0.70, shadowLift: 0.035, saturation: 1.04,
        warmth: 0.0, bloomScale: 1.0, bloomThreshold: 0.78, grain: 0.055,
        letterbox: false, fovScale: 1.0,
    },
    cinematic: {
        id: 'cinematic', label: 'CINEMATIC FILM',
        exposure: 0.82, highlightCompress: 1.35, shadowLift: 0.030, saturation: 0.86,
        warmth: 0.30, bloomScale: 1.35, bloomThreshold: 0.68, grain: 0.095,
        letterbox: true, fovScale: 0.90,
    },
    noir: {
        id: 'noir', label: 'NOIR (Kodak 500T night)',
        exposure: 0.78, highlightCompress: 1.6, shadowLift: 0.05, saturation: 0.45,
        warmth: -0.18, bloomScale: 1.5, bloomThreshold: 0.62, grain: 0.13,
        letterbox: true, fovScale: 0.86,
    },
};

export class LookPresets {
    constructor(deps) {
        this.deps = deps;
        this.current = LOOK_PRESETS.native;
    }

    list() { return Object.values(LOOK_PRESETS); }

    apply(id) {
        const p = LOOK_PRESETS[id] || LOOK_PRESETS.native;
        this.current = p;
        const { gradePass, bloomPass, grainPass } = this.deps;

        if (gradePass) {
            const u = gradePass.uniforms;
            u.uExposure.value = p.exposure;
            u.uHighlightCompress.value = p.highlightCompress;
            u.uShadowLift.value = p.shadowLift;
            u.uSaturation.value = p.saturation;
            u.uWarmth.value = p.warmth;
        }
        if (bloomPass) bloomPass.threshold = p.bloomThreshold;
        if (grainPass) grainPass.uniforms.uIntensity.value = p.grain;

        // Per-frame driven values are scaled via globals read in main loop
        window.__LRA_FOV_SCALE = p.fovScale;
        window.__LRA_BLOOM_SCALE = p.bloomScale;

        // 2.39:1 letterbox bars
        const bars = document.getElementById('cine-bars');
        if (bars) bars.classList.toggle('active', p.letterbox);

        try { localStorage.setItem('lra_look', id); } catch (e) { /* noop */ }
        return p;
    }

    cycle() {
        const ids = Object.keys(LOOK_PRESETS);
        const next = ids[(ids.indexOf(this.current.id) + 1) % ids.length];
        return this.apply(next);
    }

    restoreFromStorage() {
        let id = 'native';
        try { id = localStorage.getItem('lra_look') || 'native'; } catch (e) { /* noop */ }
        return this.apply(id);
    }
}
