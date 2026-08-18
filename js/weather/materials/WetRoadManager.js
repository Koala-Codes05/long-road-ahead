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
            roadMat.roughness = 0.030;
            roadMat.metalness = 0.90;
            roadMat.envMapIntensity = 2.6;
            roadMat.bumpScale = 0.015; // Drenched water layer smoothes micro-bump relief
            roadMat.normalScale.set(0.85, 0.85);
            roadMat.color.setHex(0x666666); // Deep drenched wet asphalt tint
            if (this.world.whiteLineMat) {
                this.world.whiteLineMat.emissiveIntensity = 1.8;
                this.world.whiteLineMat.emissive.setHex(0xffffff);
            }
            if (this.world.yellowLineMat) {
                this.world.yellowLineMat.emissiveIntensity = 2.0;
                this.world.yellowLineMat.emissive.setHex(0xffaa00);
            }
        } else if (weatherType === 1) { // DRIZZLE
            roadMat.roughness = 0.08;
            roadMat.metalness = 0.80;
            roadMat.envMapIntensity = 1.8;
            roadMat.bumpScale = 0.025;
            roadMat.normalScale.set(0.95, 0.95);
            roadMat.color.setHex(0x999999);
            if (this.world.whiteLineMat) {
                this.world.whiteLineMat.emissiveIntensity = 1.1;
                this.world.whiteLineMat.emissive.setHex(0xdddddd);
            }
            if (this.world.yellowLineMat) {
                this.world.yellowLineMat.emissiveIntensity = 1.3;
                this.world.yellowLineMat.emissive.setHex(0xff9900);
            }
        } else if (weatherType === 2) { // CLOUDY DAY (DAYTIME STORM)
            roadMat.roughness = 0.16;
            roadMat.metalness = 0.14;
            roadMat.envMapIntensity = 1.65;
            roadMat.bumpScale = 0.028;
            roadMat.normalScale.set(0.95, 0.95);
            roadMat.color.setHex(0xaaaaaa);
            if (this.world.whiteLineMat) {
                this.world.whiteLineMat.emissiveIntensity = 0.8;
                this.world.whiteLineMat.emissive.setHex(0xcccccc);
            }
            if (this.world.yellowLineMat) {
                this.world.yellowLineMat.emissiveIntensity = 0.9;
                this.world.yellowLineMat.emissive.setHex(0xeeaa00);
            }
        } else { // CLEAR / DRY
            roadMat.roughness = 0.52;
            roadMat.metalness = 0.10;
            roadMat.envMapIntensity = 0.85;
            roadMat.bumpScale = 0.04;
            roadMat.normalScale.set(0.8, 0.8);
            roadMat.color.setHex(0xffffff); // Full base color map
            if (this.world.whiteLineMat) {
                this.world.whiteLineMat.emissiveIntensity = 0.3;
                this.world.whiteLineMat.emissive.setHex(0x888888);
            }
            if (this.world.yellowLineMat) {
                this.world.yellowLineMat.emissiveIntensity = 0.4;
                this.world.yellowLineMat.emissive.setHex(0xbb7700);
            }
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
