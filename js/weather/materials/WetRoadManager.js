import * as THREE from 'three';
import { createRippleNormalMap } from '../textures/ProceduralTextures.js';

/**
 * WetRoadManager — Manages PBR wet road surface optics, porosity-based darkening,
 * GGX specular roughness reduction, and dynamic wave ripple normal maps.
 */
export class WetRoadManager {
    constructor(world) {
        this.world = world;
        this.rippleNormalTex = createRippleNormalMap();
        this.porosity = 0.75; // Porous asphalt light absorption coefficient

        this.dryRoadColor = new THREE.Color(0x181e28);

        this.applyWetRoad();
    }

    applyWetRoad() {
        if (this.world && this.world.roadMat) {
            const roadMat = this.world.roadMat;
            roadMat.roughness = 0.16;
            roadMat.metalness = 0.14;
            roadMat.envMapIntensity = 1.65;
            if (this.world.roadNormalMap) {
                roadMat.normalMap = this.world.roadNormalMap;
                roadMat.normalScale.set(0.95, 0.95);
            }
            if (this.world.roadHeightMap) {
                roadMat.bumpMap = this.world.roadHeightMap;
                roadMat.bumpScale = 0.028;
            }
            roadMat.color.setHex(0xaaaaaa);
            roadMat.needsUpdate = true;
        }
        if (this.world && this.world.guardrailMat) {
            this.world.guardrailMat.roughness = 0.15;
            this.world.guardrailMat.metalness = 0.75;
            this.world.guardrailMat.envMapIntensity = 1.6;
        }
    }

    /**
     * Updates road PBR parameters based on weather type (0: STORM, 1: DRIZZLE, 2: CLOUDY DAY, 3: CLEAR)
     * and wetness level (0.0 to 1.0).
     */
    updatePreset(weatherType, wetness = 1.0) {
        if (!this.world || !this.world.roadMat) return;

        const roadMat = this.world.roadMat;

        if (this.world.roadNormalMap) {
            roadMat.normalMap = this.world.roadNormalMap;
        }
        if (this.world.roadHeightMap) {
            roadMat.bumpMap = this.world.roadHeightMap;
        }

        if (weatherType === 0) { // STORM
            roadMat.roughness = 0.15;
            roadMat.metalness = 0.14;
            roadMat.envMapIntensity = 1.70;
            roadMat.bumpScale = 0.025;
            roadMat.normalScale.set(0.95, 0.95);
            roadMat.color.setHex(0x999999);
        } else if (weatherType === 1) { // DRIZZLE
            roadMat.roughness = 0.24;
            roadMat.metalness = 0.12;
            roadMat.envMapIntensity = 1.30;
            roadMat.bumpScale = 0.03;
            roadMat.normalScale.set(0.85, 0.85);
            roadMat.color.setHex(0xbbbbbb);
        } else if (weatherType === 2) { // CLOUDY DAY (DAYTIME STORM)
            roadMat.roughness = 0.16;
            roadMat.metalness = 0.14;
            roadMat.envMapIntensity = 1.65;
            roadMat.bumpScale = 0.028;
            roadMat.normalScale.set(0.95, 0.95);
            roadMat.color.setHex(0xaaaaaa);
        } else { // CLEAR / DRY
            roadMat.roughness = 0.52;
            roadMat.metalness = 0.10;
            roadMat.envMapIntensity = 0.85;
            roadMat.bumpScale = 0.04;
            roadMat.normalScale.set(0.8, 0.8);
            roadMat.color.setHex(0xffffff);
        }

        if (this.world.puddleMat) {
            if (weatherType === 0) {
                this.world.puddleMat.opacity = 0.88;
                this.world.puddleMat.envMapIntensity = 2.5;
                this.world.puddleMat.roughness = 0.012;
            } else if (weatherType === 1) {
                this.world.puddleMat.opacity = 0.58;
                this.world.puddleMat.envMapIntensity = 1.9;
                this.world.puddleMat.roughness = 0.025;
            } else if (weatherType === 2) {
                this.world.puddleMat.opacity = 0.84;
                this.world.puddleMat.envMapIntensity = 2.4;
                this.world.puddleMat.roughness = 0.015;
            } else {
                this.world.puddleMat.opacity = 0.0;
            }
            this.world.puddleMat.needsUpdate = true;
        }

        roadMat.needsUpdate = true;
    }
}
