/**
 * Vehicle Audio Profiles — Multi-Vehicle Sound Engine Definitions.
 *
 * Each profile fully describes one car's sonic identity:
 * engine sample mapping (pitch RPM curve, gear offsets, filter sweep),
 * sub-bass exhaust rumble frequencies, intake chirp, tire squeal
 * band-pass centers and nitro turbine timbre.
 *
 * Add a new entry here and the AudioEngine + garage picker pick it up
 * automatically. To give a car its own loop sample just point
 * `samplePaths` at the new file — the first fetchable path wins.
 */
export const VEHICLE_AUDIO_PROFILES = {
    ferrari458: {
        id: 'ferrari458',
        displayName: 'FERRARI 458 ITALIA',
        engineNote: '4.5L NA V8 — high-strung exotic scream',
        accent: '#ff2a2a',
        samplePaths: [
            'assets/Sounds/ferrari/ferrari-458-italia-sound-effect-going-fast-360530.mp3',
        ],
        // Engine sample pitch RPM curve
        pitchBase: 0.82,
        pitchPerGear: 0.035,
        pitchPerRpm: 0.38,
        pitchMin: 0.70,
        pitchMax: 1.45,
        // Engine sample loudness curve
        volBase: 0.35,
        volPerSpeed: 0.35,
        volPerRpm: 0.20,
        filterIdle: 1400,
        filterDriveBoost: 2000,
        filterPerRpm: 5500,
        // Procedural sub-bass exhaust layer
        subIdleHz: 28.0,
        subBaseHz: 34.0,
        subPerGearHz: 4.0,
        subPerRpmHz: 35.0,
        intakeMul: 2.0,
        exhaustFilterIdle: 200,
        exhaustFilterDrive: 350,
        exhaustFilterPerRpm: 400,
        // Tire squeal band-pass centers (Hz)
        tireBp1: 850,
        tireBp1Slip: 350,
        tireBp2: 1650,
        tireBp2Slip: 450,
        // Nitro turbine spool timbre (Hz)
        nitroTurbineBase: 950,
        nitroTurbinePerRpm: 1450,
        nitroJetCutoff: 2800,
    },

    supra2jz: {
        id: 'supra2jz',
        displayName: 'KAIDO MK-IV "2JZ"',
        engineNote: '3.0L Twin-Turbo I6 — deep boost growl, turbo whistle',
        accent: '#37c8ff',
        samplePaths: [
            'assets/Sounds/ferrari/ferrari-458-italia-sound-effect-going-fast-360530.mp3',
        ],
        // Lower register: same sample pitched down = inline-6 baritone
        pitchBase: 0.62,
        pitchPerGear: 0.028,
        pitchPerRpm: 0.30,
        pitchMin: 0.52,
        pitchMax: 1.10,
        volBase: 0.42,
        volPerSpeed: 0.30,
        volPerRpm: 0.22,
        filterIdle: 950,
        filterDriveBoost: 1400,
        filterPerRpm: 3800,
        // Heavier sub-bass rumble (boosted I6)
        subIdleHz: 24.0,
        subBaseHz: 27.0,
        subPerGearHz: 5.0,
        subPerRpmHz: 26.0,
        intakeMul: 1.5,
        exhaustFilterIdle: 170,
        exhaustFilterDrive: 300,
        exhaustFilterPerRpm: 330,
        // Fatter rear-tire squeal (drift car)
        tireBp1: 760,
        tireBp1Slip: 420,
        tireBp2: 1480,
        tireBp2Slip: 520,
        // Higher-pitched turbo spool = signature 2JZ whistle
        nitroTurbineBase: 1350,
        nitroTurbinePerRpm: 2100,
        nitroJetCutoff: 3400,
    },

    v10rs: {
        id: 'v10rs',
        displayName: 'RAVEN V10 RS',
        engineNote: '5.2L NA V10 — razor-sharp F1 shriek',
        accent: '#ffd037',
        samplePaths: [
            'assets/Sounds/ferrari/ferrari-458-italia-sound-effect-going-fast-360530.mp3',
        ],
        // Highest register: V10 wail
        pitchBase: 1.00,
        pitchPerGear: 0.045,
        pitchPerRpm: 0.48,
        pitchMin: 0.85,
        pitchMax: 1.80,
        volBase: 0.32,
        volPerSpeed: 0.38,
        volPerRpm: 0.24,
        filterIdle: 1800,
        filterDriveBoost: 2600,
        filterPerRpm: 7000,
        // Tighter, higher sub-bass pulse
        subIdleHz: 32.0,
        subBaseHz: 40.0,
        subPerGearHz: 3.0,
        subPerRpmHz: 44.0,
        intakeMul: 2.4,
        exhaustFilterIdle: 240,
        exhaustFilterDrive: 420,
        exhaustFilterPerRpm: 520,
        // Sharper front-end squeal
        tireBp1: 920,
        tireBp1Slip: 320,
        tireBp2: 1900,
        tireBp2Slip: 480,
        nitroTurbineBase: 1100,
        nitroTurbinePerRpm: 1800,
        nitroJetCutoff: 3000,
    },
};

export const DEFAULT_AUDIO_PROFILE = 'ferrari458';

export function getProfile(id) {
    return VEHICLE_AUDIO_PROFILES[id] || VEHICLE_AUDIO_PROFILES[DEFAULT_AUDIO_PROFILE];
}

export function getProfileList() {
    return Object.values(VEHICLE_AUDIO_PROFILES);
}
