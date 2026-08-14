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
            roadMat.roughness = 0.035;
            roadMat.metalness = 0.88;
            roadMat.envMapIntensity = 2.4;
            if (this.world.roadNormalMap) {
                roadMat.normalMap = this.world.roadNormalMap;
                roadMat.normalScale.set(0.85, 0.85);
            }
            if (this.world.roadHeightMap) {
                roadMat.bumpMap = this.world.roadHeightMap;
                roadMat.bumpScale = 0.02; // Water fills micro asphalt pores
            }
            roadMat.color.setHex(0x777777); // Drenched wet asphalt darkening
            roadMat.needsUpdate = true;
        }
        if (this.world && this.world.guardrailMat) {
            this.world.guardrailMat.roughness = 0.08;
            this.world.guardrailMat.metalness = 0.95;
            this.world.guardrailMat.envMapIntensity = 2.0;
        }
    }

    /**
     * Updates road PBR parameters based on weather type (0: STORM, 1: DRIZZLE, 3: CLEAR)
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
        } else if (weatherType === 1) { // DRIZZLE
            roadMat.roughness = 0.08;
            roadMat.metalness = 0.80;
            roadMat.envMapIntensity = 1.8;
            roadMat.bumpScale = 0.025;
            roadMat.normalScale.set(0.75, 0.75);
            roadMat.color.setHex(0x999999);
        } else { // CLEAR / DRY
            roadMat.roughness = 0.50;
            roadMat.metalness = 0.20;
            roadMat.envMapIntensity = 0.8;
            roadMat.bumpScale = 0.04; // Dry asphalt full height relief
            roadMat.normalScale.set(0.8, 0.8);
            roadMat.color.setHex(0xffffff); // Full base color map
        }

        roadMat.needsUpdate = true;
    }
}
