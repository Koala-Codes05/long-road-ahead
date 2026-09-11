import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getRoadPoint } from '../world.js';
import {
    ROAD_CLEARANCE,
    ZONE,
    FRONTAGE_TYPES,
    LARGE_TYPES,
    TOWER_TYPE,
    pickRole,
    sampleRange,
} from './BuildingTypes.js';

/** Deterministic per-chunk PRNG (mulberry32). */
function mulberry32(seed) {
    let a = seed | 0;
    return function () {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Signed lateral distance from the road centerline at world position (wx, wz). */
function signedLateral(wx, wz) {
    const p = getRoadPoint(wz);
    return (wx - p.x) * Math.cos(p.angle);
}

/**
 * RoadsideGenerator — Road-relative, chunk-owned city generation.
 *
 * The road owns the city: every building is placed in the road's local frame
 * (centerline + normal from getRoadPoint), never in arbitrary world space.
 *
 * Per chunk, per side, three layers are produced:
 *   1. FRONTAGE — food stalls, carts, kiosks, shops, restaurants flush to the
 *      sidewalk, facing the road, clustered with alleys/gaps.
 *   2. LARGE BLOCKS — connected apartments / offices / commercial blocks behind
 *      the frontage (shared-wall fabric with height/setback variation).
 *   3. BACKGROUND TOWERS — sparse skyline silhouettes with warning beacons.
 *
 * Every candidate passes a cheap corner-clearance filter against the road
 * (adjust outward, or reject) before being accepted.
 *
 * All geometry is merged per material bucket: one chunk costs ~10 draw calls.
 * Materials and canvas textures are shared across all chunks (never disposed).
 */
export class RoadsideGenerator {
    constructor() {
        this._createTextures();
        this._createMaterials();
    }

    // =========================================================
    // Shared canvas textures (created once)
    // =========================================================
    _createTextures() {
        // --- Sign word atlas: 6 neon storefront words ---
        {
            const words = [
                { text: 'RAMEN', color: '#ff2d78' },
                { text: '24H', color: '#00e5ff' },
                { text: 'BAR', color: '#ffb300' },
                { text: 'PIZZA', color: '#ff5533' },
                { text: 'COFFEE', color: '#b388ff' },
                { text: 'HOTEL', color: '#69f0ae' },
            ];
            const cols = words.length + 1; // +1: trailing pure-white cell for tinted glow geometry
            const canvas = document.createElement('canvas');
            canvas.width = 1024; canvas.height = 160;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#05060a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            const cellW = canvas.width / cols;
            words.forEach((w, i) => {
                ctx.save();
                ctx.font = 'bold 84px Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = w.color;
                ctx.shadowBlur = 26;
                ctx.fillStyle = w.color;
                ctx.fillText(w.text, cellW * (i + 0.5), 84);
                ctx.shadowBlur = 6;
                ctx.fillStyle = '#ffffff';
                ctx.globalAlpha = 0.9;
                ctx.fillText(w.text, cellW * (i + 0.5), 84);
                ctx.restore();
            });
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(cellW * (cols - 1), 0, cellW, canvas.height);
            this.signTex = new THREE.CanvasTexture(canvas);
            this.signTex.colorSpace = THREE.SRGBColorSpace;
            this.signTex.minFilter = THREE.LinearMipmapLinearFilter;
            this.signWordCount = words.length;
            this.signCells = cols;
            this.whiteCellU = (cols - 1) / cols;
        }

        // --- Awning stripe atlas: 2 variants stacked vertically (red top, teal bottom)
        //     so UV.x can repeat freely along the awning width ---
        {
            const canvas = document.createElement('canvas');
            canvas.width = 256; canvas.height = 256;
            const ctx = canvas.getContext('2d');
            const variants = [['#00838f', '#ececec'], ['#c62828', '#ececec']]; // v0 bottom, v1 top
            variants.forEach((v, vi) => {
                const oy = vi * 128;
                for (let s = 0; s < 8; s++) {
                    ctx.fillStyle = v[s % 2];
                    ctx.fillRect(s * 32, oy, 32, 128);
                }
                // lower scalloped shadow edge
                ctx.fillStyle = 'rgba(0,0,0,0.25)';
                ctx.fillRect(0, oy + 108, 256, 20);
            });
            this.canopyTex = new THREE.CanvasTexture(canvas);
            this.canopyTex.colorSpace = THREE.SRGBColorSpace;
            this.canopyTex.wrapS = THREE.RepeatWrapping;
            this.canopyTex.minFilter = THREE.LinearMipmapLinearFilter;
        }

        // --- Storefront atlas: 3 ground-floor shop front variants ---
        {
            const canvas = document.createElement('canvas');
            canvas.width = 768; canvas.height = 256;
            const ctx = canvas.getContext('2d');
            const cellW = 256;

            // V1: glass front, warm interior, center door
            ctx.fillStyle = '#1a2028'; ctx.fillRect(0, 0, cellW, 256);
            ctx.fillStyle = '#ffca7a';
            ctx.fillRect(18, 52, 90, 180); ctx.fillRect(148, 52, 90, 180);
            ctx.fillStyle = '#ffe9c4';
            ctx.fillRect(24, 60, 78, 164); ctx.fillRect(154, 60, 78, 164);
            ctx.fillStyle = '#2c3844'; ctx.fillRect(112, 40, 32, 216); // door frame
            ctx.fillStyle = '#9fd8ff'; ctx.fillRect(116, 48, 24, 200); // door glass
            ctx.fillStyle = '#0c1016'; ctx.fillRect(0, 0, cellW, 40);   // fascia band

            // V2: half-closed shutter + side window
            ctx.fillStyle = '#14181f'; ctx.fillRect(cellW, 0, cellW, 256);
            ctx.fillStyle = '#3a424d'; ctx.fillRect(cellW + 20, 40, 140, 216);
            ctx.strokeStyle = '#20262e'; ctx.lineWidth = 4;
            for (let y = 52; y < 250; y += 14) {
                ctx.beginPath(); ctx.moveTo(cellW + 22, y); ctx.lineTo(cellW + 158, y); ctx.stroke();
            }
            ctx.fillStyle = '#ffd9a0'; ctx.fillRect(cellW + 180, 70, 56, 110);
            ctx.fillStyle = '#0c1016'; ctx.fillRect(cellW, 0, cellW, 40);

            // V3: open restaurant front, warm stalls + counter
            ctx.fillStyle = '#201812'; ctx.fillRect(cellW * 2, 0, cellW, 256);
            ctx.fillStyle = '#ffb764'; ctx.fillRect(cellW * 2 + 16, 56, 224, 176);
            ctx.fillStyle = '#7a4a22';
            for (let x = 0; x < 5; x++) ctx.fillRect(cellW * 2 + 24 + x * 44, 140, 30, 92);
            ctx.fillStyle = '#3a2415'; ctx.fillRect(cellW * 2 + 16, 96, 224, 22); // shelf
            ctx.fillStyle = '#0c1016'; ctx.fillRect(cellW * 2, 0, cellW, 40);

            this.storefrontTex = new THREE.CanvasTexture(canvas);
            this.storefrontTex.colorSpace = THREE.SRGBColorSpace;
            this.storefrontTex.minFilter = THREE.LinearMipmapLinearFilter;
            this.storefrontVariants = 3;
        }

        // --- Facade textures (downloaded PBR-ish PNGs, shared) ---
        const loader = new THREE.TextureLoader();
        const loadFacade = (file) => {
            const tex = loader.load(`assets/City/${file}`);
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.anisotropy = 8;
            tex.colorSpace = THREE.SRGBColorSpace;
            return tex;
        };
        this.modernTex = loadFacade('building_facade_modern.png');
        this.commercialTex = loadFacade('building_facade_commercial.png');
        this.brickTex = loadFacade('building_facade_brick.png');
    }

    // =========================================================
    // Shared materials (one instance per visual type, reused forever)
    // =========================================================
    _createMaterials() {
        const facadeMat = (tex, emissiveTint, emissiveIntensity, rough, metal) =>
            new THREE.MeshStandardMaterial({
                map: tex, roughness: rough, metalness: metal,
                emissiveMap: tex, emissive: new THREE.Color(emissiveTint),
                emissiveIntensity,
            });

        this.facadeMats = {
            modern: facadeMat(this.modernTex, 0x88bbff, 1.45, 0.30, 0.40),
            commercial: facadeMat(this.commercialTex, 0xffaa66, 1.60, 0.40, 0.25),
            brick: facadeMat(this.brickTex, 0xffddaa, 1.25, 0.75, 0.10),
        };

        // One shared bucket for ALL flat-colored standard geometry (vertex-colored):
        // stall bodies, kiosk bodies, plaza slabs, rooftop boxes.
        this.flatMat = new THREE.MeshStandardMaterial({
            vertexColors: true, roughness: 0.7, metalness: 0.15,
        });
        this.flatColors = {
            stall: new THREE.Color(0x7a5c3e),
            kiosk: new THREE.Color(0x3e6e8e),
            plaza: new THREE.Color(0x222c3a),
            rooftop: new THREE.Color(0x1c2530),
        };

        this.canopyMat = new THREE.MeshStandardMaterial({
            map: this.canopyTex, roughness: 0.8, metalness: 0.05,
        });

        this.storefrontMat = new THREE.MeshStandardMaterial({
            map: this.storefrontTex, roughness: 0.4, metalness: 0.2,
            emissiveMap: this.storefrontTex, emissive: new THREE.Color(0xffbb66),
            emissiveIntensity: 0.65,
        });

        // One shared bucket for ALL glowing geometry (vertex-colored over the sign
        // atlas): word signs, neon accent strips, stall work-lights, tower beacons.
        this.glowMat = new THREE.MeshBasicMaterial({ map: this.signTex, vertexColors: true });
        this.neonColors = [
            new THREE.Color(0x00e5ff),
            new THREE.Color(0xff2d78),
            new THREE.Color(0xffb300),
        ];
    }

    // =========================================================
    // Public API — generate one road chunk's city block
    // =========================================================
    generateChunk(chunkIdx, zStart, chunkSize, isCity = false) {
        const rng = mulberry32(((chunkIdx * 2654435761) >>> 0) ^ 0x9e3779b9);
        const group = new THREE.Group();

        // Density / height modulation by road section
        const midD = ((- (zStart - chunkSize * 0.5)) % 6280 + 6280) % 6280;
        let density = 0.85, heightMult = 1.0;
        if (midD >= 3700 && midD < 5040) { density = 1.0; heightMult = 1.35; }       // CITY
        else if (midD >= 2520 && midD < 3700) { density = 0.5; heightMult = 0.65; }  // MOUNTAIN

        // Material buckets of plain geometries, merged at the end
        const buckets = new Map();
        const bucketFor = (mat) => {
            if (!buckets.has(mat)) buckets.set(mat, []);
            return buckets.get(mat);
        };

        for (const side of [-1, 1]) {
            this._buildFrontageRow(rng, side, zStart, chunkSize, density, bucketFor, isCity);
            this._buildLargeRow(rng, side, zStart, chunkSize, density, heightMult, bucketFor, isCity);
            this._buildTowers(rng, side, zStart, chunkSize, density, heightMult, bucketFor, isCity);
        }

        for (const [mat, geos] of buckets) {
            if (!geos.length) continue;
            const merged = mergeGeometries(geos, false);
            if (!merged) continue;
            const mesh = new THREE.Mesh(merged, mat);
            const glowy = mat === this.glowMat;
            mesh.castShadow = !glowy;
            mesh.receiveShadow = !glowy;
            group.add(mesh);
        }

        return group;
    }

    // =========================================================
    // Layer 1 — Frontage row (small commercial, road-facing)
    // =========================================================
    _buildFrontageRow(rng, side, zStart, chunkSize, density, bucketFor, isCity = false) {
        const zEnd = zStart - chunkSize;
        let cursor = zStart - 2.0; // border margin avoids cross-chunk collisions
        const frontageBase = isCity ? 6.675 : ZONE.FRONTAGE_FRONT;

        while (cursor > zEnd + 4.0) {
            const roleName = pickRole(FRONTAGE_TYPES, rng);
            const role = FRONTAGE_TYPES[roleName];
            const w = sampleRange(role.width, rng);
            if (cursor - w < zEnd + 2.0) break;

            const gap = rng() < 0.12 ? sampleRange([6, 16], rng) : sampleRange([0.4, 2.6], rng);
            const zSlot = cursor - w * 0.5;
            cursor -= w + gap;

            if (rng() > density) continue; // empty lot → clustering

            const d = sampleRange(role.depth, rng);
            const h = sampleRange(role.height, rng);
            const p = getRoadPoint(zSlot);
            const rotJit = THREE.MathUtils.degToRad((rng() * 2 - 1) * role.jitterDeg);
            const rotY = (side > 0 ? (-p.angle - Math.PI / 2) : (Math.PI / 2 - p.angle)) + rotJit;

            // Front face sits on the frontage line; body extends back away from road
            let latOff = frontageBase + d * 0.5;
            const placed = this._resolveClearance(zSlot, side, latOff, w * 0.5, d * 0.5, rotY, isCity);
            if (!placed) continue; // rejected: too close to road on a tight corner

            const { cx, cz } = placed;
            const fw = this._frame(cx, cz, rotY);
            const flatColor = role.bodyMat === 'stall' ? this.flatColors.stall
                : role.bodyMat === 'kiosk' ? this.flatColors.kiosk : null;
            const bodyBucket = flatColor ? bucketFor(this.flatMat)
                : bucketFor(this.facadeMats[role.bodyMat] || this.facadeMats.commercial);

            // Main body (sunk 0.3m for firm ground anchoring)
            this._box(bodyBucket, w, h + 0.3, d, cx, (h + 0.3) * 0.5 - 0.3, cz, rotY, w / 11, h / 9, 0, 0, flatColor);

            if (role.storefront) {
                // Ground-floor shop front band on the road-facing side
                const v = Math.floor(rng() * this.storefrontVariants);
                const f = fw.toWorld(0, d * 0.5 + 0.06);
                this._box(bucketFor(this.storefrontMat), w * 0.92, Math.min(3.0, h - 0.4), 0.12,
                    f.x, 1.6, f.z, rotY, 1 / this.storefrontVariants, 1, v / this.storefrontVariants, 0);
                // Sidewalk plaza slab anchoring the entrance to the walkway
                const pl = fw.toWorld(0, d * 0.5 + 0.55);
                this._box(bucketFor(this.flatMat), w + 1.0, 0.2, 1.3, pl.x, 0.1, pl.z, rotY, 1, 1, 0, 0, this.flatColors.plaza);
            }

            if (role.canopy && rng() < 0.85) {
                // Striped awning projecting toward the sidewalk
                const cw = w * (roleName === 'FoodStall' || roleName === 'Cart' ? 1.25 : 0.85);
                const c = fw.toWorld(0, d * 0.5 + 0.7);
                const v = rng() < 0.5 ? 0 : 1;
                const awnY = role.storefront ? 3.2 : Math.min(h, 2.7) + 0.05;
                if (awnY + 0.1 < h + 0.05 || !role.storefront) {
                    this._box(bucketFor(this.canopyMat), cw, 0.1, 1.5, c.x, awnY, c.z, rotY, cw / 4, 0.5, 0, v * 0.5);
                }
            }

            if (rng() < role.signChance) {
                const word = Math.floor(rng() * this.signWordCount);
                if (role.storefront) {
                    // Parapet neon sign standing proud of the roof edge
                    const s = fw.toWorld(0, d * 0.5 - 0.35);
                    this._box(bucketFor(this.glowMat), Math.min(w * 0.72, 6.0), 0.65, 0.1,
                        s.x, h + 0.33, s.z, rotY, 1 / this.signCells, 1, word / this.signCells, 0, 0xffffff);
                    // Perpendicular blade sign hanging toward the road
                    if (rng() < 0.5) {
                        const b = fw.toWorld(w * 0.5 - 0.4, d * 0.5 + 0.55);
                        const word2 = Math.floor(rng() * this.signWordCount);
                        this._box(bucketFor(this.glowMat), 0.1, 1.0, 1.1,
                            b.x, h >= 4.0 ? 3.4 : h - 0.6, b.z, rotY, 1 / this.signCells, 1, word2 / this.signCells, 0, 0xffffff);
                    }
                } else {
                    // Small face-mounted sign for stalls & kiosks
                    const s = fw.toWorld(0, d * 0.5 + 0.09);
                    this._box(bucketFor(this.glowMat), Math.min(w * 0.8, 3.2), 0.5, 0.08,
                        s.x, Math.max(1.8, h - 0.55), s.z, rotY, 1 / this.signCells, 1, word / this.signCells, 0, 0xffffff);
                }
            }

            if ((roleName === 'FoodStall' || roleName === 'Cart') && rng() < 0.8) {
                // Warm work-light strip under the stall canopy edge
                const s = fw.toWorld(0, d * 0.5 + 0.55);
                this._box(bucketFor(this.glowMat), w * 0.8, 0.07, 0.07,
                    s.x, Math.min(h, 2.6) - 0.05, s.z, rotY, 1 / this.signCells, 1, this.whiteCellU, 0, this.neonColors[2]);
            }
        }
    }

    // =========================================================
    // Layer 2 — Large connected blocks behind the frontage
    // =========================================================
    _buildLargeRow(rng, side, zStart, chunkSize, density, heightMult, bucketFor, isCity = false) {
        const zEnd = zStart - chunkSize;
        let cursor = zStart - 2.0;
        const largeBase = isCity ? 15.775 : ZONE.LARGE_FRONT;

        while (cursor > zEnd + 16.0) {
            const roleName = pickRole(LARGE_TYPES, rng);
            const role = LARGE_TYPES[roleName];
            const w = sampleRange(role.width, rng);
            if (cursor - w < zEnd + 2.0) break;

            // Mostly touching (connected fabric), occasional narrow alley
            const gap = rng() < 0.7 ? sampleRange([-0.3, 0.15], rng) : sampleRange([0.3, 1.4], rng);
            const zSlot = cursor - w * 0.5;
            cursor -= w + gap;

            if (rng() > density) continue;

            const d = sampleRange(role.depth, rng);
            const h = sampleRange(role.height, rng) * heightMult;
            const setback = rng() < role.setbackChance ? sampleRange([1.0, 3.5], rng) : 0;
            const p = getRoadPoint(zSlot);
            const rotY = side > 0 ? (-p.angle - Math.PI / 2) : (Math.PI / 2 - p.angle);

            let latOff = largeBase + setback + d * 0.5;
            const placed = this._resolveClearance(zSlot, side, latOff, w * 0.5, d * 0.5, rotY, isCity);
            if (!placed) continue;

            const { cx, cz } = placed;
            const fw = this._frame(cx, cz, rotY);
            const mat = this.facadeMats[role.facade];

            this._box(bucketFor(mat), w, h + 0.3, d, cx, (h + 0.3) * 0.5 - 0.3, cz, rotY, w / 11, h / 9);

            // Rooftop equipment box for skyline texture
            if (rng() < 0.4) {
                const rw = sampleRange([2.0, 4.5], rng);
                const rd = sampleRange([2.0, 4.0], rng);
                const rh = sampleRange([1.2, 2.6], rng);
                const r = fw.toWorld((rng() * 2 - 1) * (w * 0.5 - rw), (rng() * 2 - 1) * (d * 0.5 - rd));
                this._box(bucketFor(this.flatMat), rw, rh, rd, r.x, h - 0.3 + rh * 0.5, r.z, rotY, 1, 1, 0, 0, this.flatColors.rooftop);
            }

            // Neon accent strip across the top front edge
            if (rng() < 0.55) {
                const neon = this.neonColors[Math.floor(rng() * this.neonColors.length)];
                const s = fw.toWorld(0, d * 0.5 + 0.07);
                this._box(bucketFor(this.glowMat), w * 0.9, 0.22, 0.1, s.x, h - 0.6, s.z, rotY,
                    1 / this.signCells, 1, this.whiteCellU, 0, neon);
            }
        }
    }

    // =========================================================
    // Layer 3 — Sparse background skyline towers
    // =========================================================
    _buildTowers(rng, side, zStart, chunkSize, density, heightMult, bucketFor, isCity = false) {
        const zEnd = zStart - chunkSize;
        let cursor = zStart - sampleRange([0, 20], rng);
        const towerBand = isCity ? [30.0, 50.0] : [ZONE.TOWER_MIN, ZONE.TOWER_MAX];

        while (cursor > zEnd + 24.0) {
            const spacing = sampleRange(TOWER_TYPE.spacing, rng);
            const w = sampleRange(TOWER_TYPE.width, rng);
            const zSlot = cursor - w * 0.5;
            cursor -= w + spacing;

            if (rng() > density * 0.85) continue;

            const d = sampleRange(TOWER_TYPE.depth, rng);
            const h = sampleRange(TOWER_TYPE.height, rng) * heightMult;
            const latOff = sampleRange(towerBand, rng);
            const p = getRoadPoint(zSlot);
            const rotY = side > 0 ? (-p.angle - Math.PI / 2) : (Math.PI / 2 - p.angle);

            const placed = this._resolveClearance(zSlot, side, latOff, w * 0.5, d * 0.5, rotY, isCity);
            if (!placed) continue;

            const { cx, cz } = placed;
            const mat = this.facadeMats[TOWER_TYPE.facades[Math.floor(rng() * TOWER_TYPE.facades.length)]];
            this._box(bucketFor(mat), w, h + 0.3, d, cx, (h + 0.3) * 0.5 - 0.3, cz, rotY, w / 14, h / 11);

            if (TOWER_TYPE.beacon) {
                const beaconGeo = new THREE.SphereGeometry(0.7, 8, 8);
                // Remap UVs into the white atlas cell so the vertex tint shows pure
                const uv = beaconGeo.attributes.uv;
                for (let i = 0; i < uv.count; i++) {
                    uv.setXY(i, this.whiteCellU + uv.getX(i) / this.signCells, uv.getY(i));
                }
                this._colorize(beaconGeo, 0xff3333);
                beaconGeo.translate(cx, h + 0.9, cz);
                bucketFor(this.glowMat).push(beaconGeo);
            }
        }
    }

    // =========================================================
    // Collision filtering — corner clearance vs. road (adjust → reject)
    // =========================================================
    _resolveClearance(zSlot, side, latOff, halfW, halfD, rotY, isCity = false) {
        const roadClearance = isCity ? 6.475 : ROAD_CLEARANCE;
        for (let attempt = 0; attempt < 3; attempt++) {
            const p = getRoadPoint(zSlot);
            const nx = Math.cos(p.angle), nz = Math.sin(p.angle);
            const cx = p.x + nx * latOff * side;
            const cz = zSlot + nz * latOff * side;
            const fw = this._frame(cx, cz, rotY);

            let maxDeficit = 0;
            for (const [lx, lz] of [[-halfW, -halfD], [halfW, -halfD], [-halfW, halfD], [halfW, halfD]]) {
                const w = fw.toWorld(lx, lz);
                const lat = signedLateral(w.x, w.z) * side;
                if (lat < roadClearance) {
                    maxDeficit = Math.max(maxDeficit, roadClearance - lat);
                }
            }
            if (maxDeficit <= 0.001) return { cx, cz };
            latOff += maxDeficit + 0.3; // push outward, away from the road
        }
        return null; // could not clear the road on this corner → reject
    }

    // =========================================================
    // Geometry helpers
    // =========================================================

    /** Local→world frame for a building rotated by rotY around (cx, cz). */
    _frame(cx, cz, rotY) {
        const s = Math.sin(rotY), c = Math.cos(rotY);
        return {
            toWorld: (lx, lz) => ({ x: cx + lx * c + lz * s, z: cz - lx * s + lz * c }),
        };
    }

    /** Fill a geometry with a single vertex color (for vertex-colored buckets). */
    _colorize(geo, color) {
        const c = color && color.isColor ? color : new THREE.Color(color === null || color === undefined ? 0xffffff : color);
        const n = geo.attributes.position.count;
        const colors = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
            colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }

    /** Create a rotated, translated box with scaled (and optionally offset) UVs. */
    _box(bucket, w, h, d, cx, cy, cz, rotY, uvSX = 1, uvSY = 1, uvOX = 0, uvOY = 0, color = null) {
        const geo = new THREE.BoxGeometry(w, h, d);
        if (uvSX !== 1 || uvSY !== 1 || uvOX !== 0 || uvOY !== 0) {
            const uv = geo.attributes.uv;
            for (let i = 0; i < uv.count; i++) {
                uv.setXY(i, uv.getX(i) * uvSX + uvOX, uv.getY(i) * uvSY + uvOY);
            }
        }
        if (color !== null) this._colorize(geo, color);
        if (rotY !== 0) geo.rotateY(rotY);
        geo.translate(cx, cy, cz);
        bucket.push(geo);
    }
}
