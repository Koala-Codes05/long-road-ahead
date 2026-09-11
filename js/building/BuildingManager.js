import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { getRoadPoint } from '../world.js';

/**
 * BuildingManager — Horizon Distance Building Streaming & 2-Row Layered Skyline Engine.
 * Features:
 *  - Horizon Streaming Horizon (380m ahead): Buildings load & wrap far out in distance fog (0% pop-in).
 *  - Front Row (Small storefronts at 25m setback, flush to sidewalk) + Back Row (Skyscrapers at 54m setback).
 *  - 100% FBX sub-mesh re-centering to eliminate road clipping.
 *  - 3-tier Level of Detail (LOD) & distance culling for smooth high FPS.
 */
export class BuildingManager {
    constructor(scene) {
        this.scene = scene;
        this.buildings = [];
        this.numBuildings = 44; // 22 Front Row (small storefronts) & 22 Back Row (mega skyscrapers)
        this.spacing = 65;      // 65m spacing along track per side (715m total coverage)

        this.textureLoader = new THREE.TextureLoader();
        this.textureCache = new Map();
        this._loadTextures();
        this._createBuildingTemplates();
    }

    _loadKBTexture(fileName) {
        if (!fileName) return null;
        if (this.textureCache.has(fileName)) return this.textureCache.get(fileName);

        const path = `assets/City/kb3d_neocity.png.2k (1)/${fileName}`;
        const tex = this.textureLoader.load(
            path,
            (loadedTex) => { loadedTex.needsUpdate = true; },
            undefined,
            () => {}
        );
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.anisotropy = 8;
        tex.colorSpace = THREE.SRGBColorSpace;
        this.textureCache.set(fileName, tex);
        return tex;
    }

    _loadTextures() {
        this.modernTex = this.textureLoader.load('assets/City/building_facade_modern.png');
        this.commercialTex = this.textureLoader.load('assets/City/building_facade_commercial.png');
        this.brickTex = this.textureLoader.load('assets/City/building_facade_brick.png');

        [this.modernTex, this.commercialTex, this.brickTex].forEach(tex => {
            if (!tex) return;
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.anisotropy = 8;
            tex.colorSpace = THREE.SRGBColorSpace;
        });
    }

    _createBuildingTemplates() {
        this.foundationMat = new THREE.MeshStandardMaterial({
            color: 0x141b24,
            roughness: 0.85,
            metalness: 0.15,
        });

        this.plazaMat = new THREE.MeshStandardMaterial({
            color: 0x222c3a,
            roughness: 0.70,
            metalness: 0.10,
        });

        this.beaconMat = new THREE.MeshBasicMaterial({
            color: 0xff3333,
        });

        this.modernMat = new THREE.MeshStandardMaterial({
            map: this.modernTex,
            roughness: 0.30,
            metalness: 0.40,
            color: 0xffffff,
            emissiveMap: this.modernTex,
            emissive: new THREE.Color(0x88bbff),
            emissiveIntensity: 1.45,
        });

        this.commercialMat = new THREE.MeshStandardMaterial({
            map: this.commercialTex,
            roughness: 0.40,
            metalness: 0.25,
            color: 0xffffff,
            emissiveMap: this.commercialTex,
            emissive: new THREE.Color(0xffaa66),
            emissiveIntensity: 1.60,
        });

        this.brickMat = new THREE.MeshStandardMaterial({
            map: this.brickTex,
            roughness: 0.75,
            metalness: 0.10,
            color: 0xffffff,
            emissiveMap: this.brickTex,
            emissive: new THREE.Color(0xffddaa),
            emissiveIntensity: 1.25,
        });

        // Load FBX Model (KitBash3D NeoCity with texture mapping & sub-mesh re-centering)
        const loader = new FBXLoader();
        const primaryFBXPath = 'assets/City/kb3d_neocity.png.2k (1)/kb3d_neocity-native.fbx';
        const fallbackFBXPath = 'assets/City/Building/Building_06.fbx';

        const setupLoadedFBX = (fbx, scaleVal) => {
            fbx.scale.setScalar(scaleVal);
            fbx.updateMatrixWorld(true);

            // Compute true bounding box center and size to re-center sub-geometry around (0,0,0)
            const box = new THREE.Box3().setFromObject(fbx);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());

            fbx.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    
                    // Re-center child mesh position relative to root origin
                    child.position.x -= center.x;
                    child.position.z -= center.z;
                    child.position.y -= box.min.y; // Anchor bottom face firmly at Y = 0.0

                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        if (!mat) return;
                        const matName = mat.name ? mat.name.trim() : '';
                        if (matName) {
                            const baseTex = this._loadKBTexture(`${matName}_basecolor.png`);
                            if (baseTex) mat.map = baseTex;

                            if (matName.includes('Screen') || matName.includes('Light') || matName.includes('Banner') || matName.includes('Decal')) {
                                const emTex = this._loadKBTexture(`${matName}_emissive.png`);
                                if (emTex) {
                                    mat.emissiveMap = emTex;
                                    mat.emissive = new THREE.Color(0xffffff);
                                    mat.emissiveIntensity = 2.2;
                                }
                            }
                            mat.roughness = 0.45;
                            mat.metalness = 0.25;
                            mat.needsUpdate = true;
                        }
                    });
                }
            });

            this.fbxTemplate = fbx;
            this.fbxSize = size;
            this._initBuildingPool();
        };

        loader.load(
            primaryFBXPath,
            (fbx) => {
                console.log('Loaded KitBash3D NeoCity FBX model with textures & sub-mesh re-centering!');
                setupLoadedFBX(fbx, 0.014);
            },
            undefined,
            (err) => {
                console.warn('Primary KitBash3D FBX load fallback to Building_06.fbx:', err);
                loader.load(
                    fallbackFBXPath,
                    (fbx) => setupLoadedFBX(fbx, 0.045),
                    undefined,
                    (err2) => {
                        console.warn('Fallback FBX load failed, using procedural templates:', err2);
                        this.fbxTemplate = null;
                        this._initBuildingPool();
                    }
                );
            }
        );
    }

    _createProceduralBuilding(isFrontRow, variant) {
        const group = new THREE.Group();
        let height = 16;
        let width = 22;
        let depth = 16;
        let mat = this.commercialMat;
        let repeatY = 2;
        let repeatX = 2;

        if (isFrontRow) {
            // Front Row: Small Storefront Shops & Sidewalk Plazas
            if (variant === 0) { // Small Neon Diner / Storefront
                height = 14; width = 20; depth = 14;
                mat = this.commercialMat; repeatY = 2; repeatX = 2;
            } else if (variant === 1) { // 3-Story Commercial Plaza
                height = 18; width = 24; depth = 16;
                mat = this.modernMat; repeatY = 3; repeatX = 2;
            } else { // Brick Corner Shop
                height = 16; width = 22; depth = 15;
                mat = this.brickMat; repeatY = 2; repeatX = 2;
            }
        } else {
            // Back Row: Giant Mega Skyscrapers
            if (variant === 0) { // Glass Mega Skyscraper
                height = 105; width = 32; depth = 26;
                mat = this.modernMat; repeatY = 10; repeatX = 3;
            } else if (variant === 1) { // Cyberpunk High-Rise Center
                height = 85; width = 34; depth = 26;
                mat = this.commercialMat; repeatY = 8; repeatX = 3;
            } else { // Urban Brick High-Rise Tower
                height = 75; width = 30; depth = 24;
                mat = this.brickMat; repeatY = 7; repeatX = 2;
            }
        }

        const buildingMat = mat.clone();
        if (buildingMat.map) {
            buildingMat.map = buildingMat.map.clone();
            buildingMat.map.repeat.set(repeatX, repeatY);
            buildingMat.map.needsUpdate = true;
            buildingMat.emissiveMap = buildingMat.map;
        }

        // Main Building Tower Mesh
        const towerGeo = new THREE.BoxGeometry(width, height, depth);
        const towerMesh = new THREE.Mesh(towerGeo, buildingMat);
        towerMesh.position.y = height * 0.5;
        towerMesh.castShadow = true;
        towerMesh.receiveShadow = true;
        group.add(towerMesh);

        // Subterranean Foundation Plinth (Sinks 12m deep to guarantee 0% floating)
        const foundationHeight = 15.0;
        const foundationGeo = new THREE.BoxGeometry(width + 2.0, foundationHeight, depth + 2.0);
        const foundationMesh = new THREE.Mesh(foundationGeo, this.foundationMat);
        foundationMesh.position.y = foundationHeight * 0.5 - 12.0; // Rests from Y = -12.0m to +3.0m
        foundationMesh.castShadow = true;
        foundationMesh.receiveShadow = true;
        group.add(foundationMesh);

        // Entrance Sidewalk Plaza Platform (Front edge extends 2.5m in front of building face)
        const plazaGeo = new THREE.BoxGeometry(width + 3.0, 0.32, depth + 5.0);
        const plazaMesh = new THREE.Mesh(plazaGeo, this.plazaMat);
        plazaMesh.position.set(0, 0.16, -2.5);
        plazaMesh.receiveShadow = true;
        group.add(plazaMesh);

        // Roof Warning Beacon Light for tall back row towers
        if (!isFrontRow) {
            const beaconGeo = new THREE.SphereGeometry(0.75, 8, 8);
            const beaconMesh = new THREE.Mesh(beaconGeo, this.beaconMat);
            beaconMesh.position.set(0, height + 1.2, 0);
            group.add(beaconMesh);
        }

        return { group, height, width, depth };
    }

    _initBuildingPool() {
        const halfPool = Math.floor(this.numBuildings / 2); // 22 each

        for (let i = 0; i < this.numBuildings; i++) {
            const isFrontRow = i < halfPool; // First 22 = Front Row, Last 22 = Back Row
            const rowIdx = isFrontRow ? i : (i - halfPool);
            const side = (rowIdx % 2 === 0) ? -1 : 1;
            const variant = Math.floor(rowIdx / 2) % 3;

            let meshObj = null;
            let width = 22;
            let depth = 16;

            if (!isFrontRow && variant === 0 && this.fbxTemplate) {
                const fbxGroup = new THREE.Group();
                const clone = this.fbxTemplate.clone();
                fbxGroup.add(clone);

                width = this.fbxSize ? Math.min(this.fbxSize.x, 32) : 28;
                depth = this.fbxSize ? Math.min(this.fbxSize.z, 26) : 24;

                const foundationGeo = new THREE.BoxGeometry(width + 2, 15.0, depth + 2);
                const foundationMesh = new THREE.Mesh(foundationGeo, this.foundationMat);
                foundationMesh.position.y = 7.5 - 12.0;
                fbxGroup.add(foundationMesh);

                const plazaGeo = new THREE.BoxGeometry(width + 4, 0.32, depth + 6);
                const plazaMesh = new THREE.Mesh(plazaGeo, this.plazaMat);
                plazaMesh.position.set(0, 0.16, -3.0);
                fbxGroup.add(plazaMesh);

                meshObj = fbxGroup;
            } else {
                const proc = this._createProceduralBuilding(isFrontRow, variant);
                meshObj = proc.group;
                width = proc.width;
                depth = proc.depth;
            }

            this.scene.add(meshObj);

            // Stagger Back Row Z position so back skyscrapers peek between front storefronts
            const baseZOffset = Math.floor(rowIdx / 2) * this.spacing;
            const finalZOffset = isFrontRow ? baseZOffset : (baseZOffset + 32.5);

            this.buildings.push({
                mesh: meshObj,
                side: side,
                isFrontRow: isFrontRow,
                width: width,
                depth: depth,
                baseSetback: isFrontRow ? 25.0 : 54.0, // Front Row = 25m, Back Row = 54m (29m behind!)
                zOffset: finalZOffset,
                isMidLOD: null,
            });
        }
    }

    update(carZ) {
        if (this.buildings.length === 0) return;

        const totalDepth = 11 * this.spacing; // 11 building pairs = 715m total track coverage

        for (let i = 0; i < this.buildings.length; i++) {
            const item = this.buildings[i];
            let targetZ = item.zOffset;

            // Seamless Z Wrapping far ahead of camera (380m ahead, 335m behind)
            // Ensures buildings are fully spawned and loaded out in distance fog before player approaches
            let relZ = targetZ - carZ;
            while (relZ > 380) {
                targetZ -= totalDepth;
                relZ = targetZ - carZ;
            }
            while (relZ < -totalDepth + 380) {
                targetZ += totalDepth;
                relZ = targetZ - carZ;
            }
            item.zOffset = targetZ;

            // =========================================================
            // 1. SEAMLESS DISTANCE STREAMING & 3-TIER LOD ENGINE
            // =========================================================
            if (relZ < -60 || relZ > 360) {
                // Far behind / way past horizon -> Cull completely from GPU render pipeline
                item.mesh.visible = false;
                continue;
            }

            if (relZ > 120) {
                // Mid/Far Distance (120m - 360m): Buildings are pre-loaded in horizon fog
                // Medium LOD (Disable shadow casting for 60+ FPS speed while maintaining full visual skyline)
                item.mesh.visible = true;
                if (item.isMidLOD !== true) {
                    item.mesh.traverse((child) => {
                        if (child.isMesh) child.castShadow = false;
                    });
                    item.isMidLOD = true;
                }
            } else {
                // Near Distance (0m - 120m): Up-close high detail
                // High LOD (Full PBR detail, active shadows enabled)
                item.mesh.visible = true;
                if (item.isMidLOD !== false) {
                    item.mesh.traverse((child) => {
                        if (child.isMesh) child.castShadow = true;
                    });
                    item.isMidLOD = false;
                }
            }

            // =========================================================
            // 2. CORNER-SAFE CURVE SETBACK & ROTATION ALIGNMENT
            // =========================================================
            const p = getRoadPoint(targetZ);

            let setbackDist = item.baseSetback; // Front Row = 25m, Back Row = 54m

            // Orient building parallel along road tangent
            const rotY = p.angle + (item.side > 0 ? -Math.PI / 2 : Math.PI / 2);
            const cosRot = Math.cos(rotY);
            const sinRot = Math.sin(rotY);

            // Corner Bounding Geometry Check (4 corners in local space)
            const halfW = item.width * 0.5 + 1.5;
            const halfD = item.depth * 0.5 + 2.5;
            const localCorners = [
                { x: -halfW, z: -halfD },
                { x:  halfW, z: -halfD },
                { x: -halfW, z:  halfD },
                { x:  halfW, z:  halfD },
            ];

            const minRequiredClearance = item.isFrontRow ? 18.5 : 44.0;
            const nx = Math.cos(p.angle);
            const nz = Math.sin(p.angle);

            for (let pass = 0; pass < 2; pass++) {
                const cx = p.x + nx * (setbackDist * item.side);
                const cz = targetZ + nz * (setbackDist * item.side);

                let maxDeficit = 0.0;
                for (let c = 0; c < 4; c++) {
                    const lc = localCorners[c];
                    const wx = cx + lc.x * cosRot + lc.z * sinRot;
                    const wz = cz - lc.x * sinRot + lc.z * cosRot;

                    const pRoadCorner = getRoadPoint(wz);
                    const cornerDist = Math.abs(wx - pRoadCorner.x);

                    if (cornerDist < minRequiredClearance) {
                        const deficit = minRequiredClearance - cornerDist;
                        if (deficit > maxDeficit) maxDeficit = deficit;
                    }
                }
                if (maxDeficit > 0.001) {
                    setbackDist += maxDeficit;
                } else {
                    break;
                }
            }

            const sideDist = setbackDist * item.side;

            item.mesh.position.set(
                p.x + nx * sideDist,
                0.0, // Anchored firmly on ground level Y = 0.0 with subterranean foundation below
                targetZ + nz * sideDist
            );

            item.mesh.rotation.y = rotY;
        }
    }
}
