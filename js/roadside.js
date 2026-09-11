import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getRoadPoint } from './world.js';

/**
 * RoadsideGenerator — City Atmosphere & Highway Scenery Engine.
 *
 * Streams deterministic roadside content per world chunk, following the
 * same procedural road curve the asphalt uses (getRoadPoint):
 *  - CITY (3700–5040m of every cycle): storefront rows + skyscraper towers
 *    with emissive lit-window facades and animated-look neon sign plates
 *  - HIGHWAY: NFS-style ad billboards (incl. the SOVEETA hero art poster)
 *  - A glowing green-canopy GAS STATION once per city block (cycle dist ≈ 4240m)
 *
 * Everything is merged into a handful of draws per chunk and is disposed
 * together with the chunk, keeping memory bounded on the infinite road.
 */

const CYCLE_LENGTH = 6280;
const CITY_START = 3700;
const CITY_END = 5040;
const CITY_CORE_START = 4040;
const CITY_CORE_END = 4720;
const GAS_STATION_DIST = 4240;
const LOT_STEP = 14;

export function cycleDist(z) {
    return (((-z) % CYCLE_LENGTH) + CYCLE_LENGTH) % CYCLE_LENGTH;
}

export function isCityDist(d) {
    return d >= CITY_START && d < CITY_END;
}

/** Deterministic PRNG so every chunk regenerates identical scenery. */
function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export class RoadsideGenerator {
    constructor() {
        this._createFacadeTextures();
        this._createNeonAtlas();
        this._createMaterials();
    }

    /* ============================================================
       TEXTURES (procedural, generated once, shared by all chunks)
       ============================================================ */

    _createFacadeTextures() {
        // Three lit-window facade variants (warm / cool / mixed)
        this.facadeTextures = [
            this._makeFacadeCanvas(0, 'warm'),
            this._makeFacadeCanvas(1, 'cool'),
            this._makeFacadeCanvas(2, 'mixed'),
        ].map(c => {
            const t = new THREE.CanvasTexture(c);
            t.colorSpace = THREE.SRGBColorSpace;
            t.anisotropy = 4;
            return t;
        });

        // Green-lit convenience store facade (gas station)
        const storeCanvas = this._makeFacadeCanvas(3, 'green', 5, 3);
        this.storeFacadeTexture = new THREE.CanvasTexture(storeCanvas);
        this.storeFacadeTexture.colorSpace = THREE.SRGBColorSpace;
    }

    _makeFacadeCanvas(seed, tint, cols = 10, rows = 18) {
        const rng = mulberry32(1234 + seed * 999);
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Dark concrete base
        ctx.fillStyle = '#070a10';
        ctx.fillRect(0, 0, 256, 512);

        const palette = {
            warm: ['#ffd9a0', '#ffbf7a', '#ffe9c8', '#ffb469'],
            cool: ['#bfe1ff', '#9fc9ff', '#d5ecff', '#8fd0ff'],
            green: ['#9dffc0', '#6fe89d', '#c8ffdc'],
            mixed: ['#ffd9a0', '#bfe1ff', '#ff9ecb', '#c8ffe0'],
        }[tint] || ['#ffffff'];

        const cw = 256 / cols;
        const rh = 512 / rows;
        for (let r = 1; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const x = c * cw + cw * 0.18;
                const y = r * rh + rh * 0.22;
                const w = cw * 0.64;
                const h = rh * 0.56;
                if (rng() < 0.44) {
                    const col = palette[Math.floor(rng() * palette.length)];
                    // Soft glow around lit window
                    const g = ctx.createRadialGradient(x + w / 2, y + h / 2, 1, x + w / 2, y + h / 2, w * 1.2);
                    g.addColorStop(0, col);
                    g.addColorStop(0.55, col + 'cc');
                    g.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = g;
                    ctx.fillRect(x - w * 0.4, y - h * 0.6, w * 1.8, h * 2.2);
                    ctx.fillStyle = col;
                    ctx.fillRect(x, y, w, h);
                    // Interior crossbar silhouettes
                    ctx.fillStyle = 'rgba(10,12,20,0.55)';
                    ctx.fillRect(x, y + h * 0.45, w, h * 0.12);
                } else {
                    ctx.fillStyle = '#0d1119';
                    ctx.fillRect(x, y, w, h);
                }
            }
        }
        return canvas;
    }

    _createNeonAtlas() {
        // 1024x1024 sign atlas — 6 neon plates + 1 hero brand plate.
        // Rects normalized {x0,y0,x1,y1}.
        const canvas = document.createElement('canvas');
        canvas.width = 1024; canvas.height = 1024;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, 1024, 1024);

        const plates = [
            { id: 'racezone', text: 'RACE ZONE', sub: '夜間ドリフト', color: '#ff2d95', x: 0, y: 0, w: 512, h: 200 },
            { id: 'tuning', text: 'TUNING SHOP', sub: '速', color: '#37c8ff', x: 512, y: 0, w: 512, h: 200 },
            { id: 'noodle', text: 'ラーメン NOODLE', sub: '24H', color: '#ffb937', x: 0, y: 200, w: 512, h: 200 },
            { id: 'arcade', text: 'ARCADE', sub: 'GAME CENTER', color: '#9dff57', x: 512, y: 200, w: 512, h: 200 },
            { id: 'gas', text: 'GAS', sub: '24H · SELF', color: '#59ff96', x: 0, y: 400, w: 512, h: 200 },
            { id: 'garage', text: 'GARAGE', sub: '速度工房', color: '#ff5544', x: 512, y: 400, w: 512, h: 200 },
            { id: 'brand', text: 'LONG ROAD AHEAD', sub: 'NIGHTRUNNERS PRESENT · DRIFT TRIALS', color: '#e8f4ff', x: 0, y: 640, w: 1024, h: 260 },
        ];

        this.atlasRects = {};
        plates.forEach(p => {
            ctx.save();
            ctx.translate(p.x, p.y);

            // Backing plate
            ctx.fillStyle = 'rgba(8,10,16,0.92)';
            ctx.fillRect(0, 0, p.w, p.h);
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 6;
            ctx.strokeRect(8, 8, p.w - 16, p.h - 16);

            // Neon text w/ layered glow
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const mainSize = p.h * 0.42;
            ctx.font = `900 ${mainSize}px Orbitron, Arial, sans-serif`;
            for (let i = 4; i >= 1; i--) {
                ctx.shadowColor = p.color;
                ctx.shadowBlur = 18 * i;
                ctx.fillStyle = p.color;
                ctx.fillText(p.text, p.w / 2, p.h * 0.40, p.w - 70);
            }
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#ffffff';
            ctx.font = `900 ${mainSize}px Orbitron, Arial, sans-serif`;
            ctx.fillText(p.text, p.w / 2, p.h * 0.40, p.w - 70);

            ctx.font = `700 ${p.h * 0.16}px Rajdhani, Arial, sans-serif`;
            ctx.fillStyle = p.color;
            ctx.fillText(p.sub, p.w / 2, p.h * 0.78, p.w - 90);
            ctx.restore();

            this.atlasRects[p.id] = {
                x0: p.x / 1024, y0: 1 - (p.y + p.h) / 1024,
                x1: (p.x + p.w) / 1024, y1: 1 - p.y / 1024,
            };
        });

        this.neonAtlasTexture = new THREE.CanvasTexture(canvas);
        this.neonAtlasTexture.colorSpace = THREE.SRGBColorSpace;
        this.neonAtlasTexture.anisotropy = 8;
    }

    _createMaterials() {
        this.facadeMats = this.facadeTextures.map(t => new THREE.MeshStandardMaterial({
            color: 0x11151d,
            emissive: 0xffffff,
            emissiveMap: t,
            emissiveIntensity: 1.35,
            map: t,
            roughness: 0.9,
            metalness: 0.05,
        }));

        this.roofMat = new THREE.MeshStandardMaterial({
            color: 0x05070b, roughness: 0.95, metalness: 0.0,
        });

        this.neonMat = new THREE.MeshBasicMaterial({
            map: this.neonAtlasTexture,
            transparent: true,
            side: THREE.DoubleSide,
        });

        this.storeMat = new THREE.MeshStandardMaterial({
            color: 0x0c1210,
            emissive: 0xffffff,
            emissiveMap: this.storeFacadeTexture,
            emissiveIntensity: 1.1,
            roughness: 0.85,
        });

        this.canopyMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5, metalness: 0.1 });
        this.canopyStripeMat = new THREE.MeshStandardMaterial({
            color: 0xc0202a, emissive: 0xc0202a, emissiveIntensity: 0.7, roughness: 0.4,
        });
        this.pumpMat = new THREE.MeshStandardMaterial({ color: 0x30353d, roughness: 0.6, metalness: 0.4 });
        this.poleMat = new THREE.MeshStandardMaterial({ color: 0x1c2128, roughness: 0.7, metalness: 0.5 });

        // Fuel price board (styled like the NFS gas-station sign)
        const priceCanvas = document.createElement('canvas');
        priceCanvas.width = 256; priceCanvas.height = 256;
        const pctx = priceCanvas.getContext('2d');
        pctx.fillStyle = '#f4f0e6'; pctx.fillRect(0, 0, 256, 256);
        pctx.fillStyle = '#c0202a'; pctx.fillRect(0, 0, 256, 64);
        pctx.fillStyle = '#ffffff'; pctx.font = '900 34px Arial';
        pctx.textAlign = 'center'; pctx.fillText('GAS 24H', 128, 44);
        pctx.fillStyle = '#1a1a1a'; pctx.font = '700 26px Arial'; pctx.textAlign = 'left';
        pctx.fillText('REGULAR  385', 24, 110);
        pctx.fillText('PLUS     399', 24, 152);
        pctx.fillText('SUPREME  414', 24, 194);
        pctx.font = '700 20px Arial'; pctx.fillStyle = '#c0202a';
        pctx.fillText('ATM · DRIFT CREW WELCOME', 128, 234);
        const priceTex = new THREE.CanvasTexture(priceCanvas);
        priceTex.colorSpace = THREE.SRGBColorSpace;
        this.priceMat = new THREE.MeshBasicMaterial({ map: priceTex, side: THREE.DoubleSide });

        // SOVEETA hero poster (AI key art built from the provided reference images)
        this.soveetaTexture = new THREE.TextureLoader().load('assets/character/soveeta_full.png');
        this.soveetaTexture.colorSpace = THREE.SRGBColorSpace;
        this.soveetaTexture.anisotropy = 8;
        this.soveetaMat = new THREE.MeshBasicMaterial({
            map: this.soveetaTexture,
            side: THREE.DoubleSide,
            toneMapped: false,
        });
    }

    /* ============================================================
       GEOMETRY HELPERS
       ============================================================ */

    _box(arr, w, h, d, cx, cy, cz, rotY = 0) {
        const g = new THREE.BoxGeometry(w, h, d);
        if (rotY) g.rotateY(rotY);
        g.translate(cx, cy, cz);
        arr.push(g);
    }

    /** Quad facing direction `normal` (used for neon plates & billboards). */
    _facingQuad(arr, cx, cy, cz, w, h, nxz, uvRect = null) {
        const g = new THREE.PlaneGeometry(w, h);
        const theta = Math.atan2(nxz.x, nxz.z);
        g.rotateY(theta);
        g.translate(cx, cy, cz);
        if (uvRect) {
            const uv = g.attributes.uv;
            for (let i = 0; i < uv.count; i++) {
                const u = uv.getX(i);
                const v = uv.getY(i);
                uv.setXY(i,
                    uvRect.x0 + u * (uvRect.x1 - uvRect.x0),
                    uvRect.y0 + v * (uvRect.y1 - uvRect.y0),
                );
            }
        }
        arr.push(g);
    }

    /** World placement for a lateral offset from the road curve at z. */
    _place(z, sideSign, lateral) {
        const p = getRoadPoint(z);
        const nx = Math.cos(p.angle);
        const nz = Math.sin(p.angle);
        return {
            x: p.x + nx * sideSign * lateral,
            z: z + nz * sideSign * lateral,
            nx, nz, angle: p.angle,
            roadX: p.x,
        };
    }

    /* ============================================================
       CHUNK CONTENT BUILD
       ============================================================ */

    addChunkContent(chunkIdx, group, chunkSize) {
        const zStart = -chunkIdx * chunkSize;
        const zEnd = zStart - chunkSize;

        const facadeGeos = [[], [], []];
        const roofGeos = [];
        const neonGeos = [];
        const billboardGeos = [];   // brand plate quads (atlas)
        const poleGeos = [];
        const posterGeos = [];      // Soveeta hero poster quads
        const storeGeos = [];
        const canopyGeos = [];
        const stripeGeos = [];
        const pumpGeos = [];
        const priceGeos = [];

        // Walk lots along the chunk (negative z direction)
        let prevBillIdx = Math.floor(cycleDist(zStart) / 96);
        let gasPlaced = false;

        for (let z = zStart; z > zEnd; z -= LOT_STEP) {
            const dMid = cycleDist(z - LOT_STEP * 0.5);
            const rng = mulberry32((chunkIdx * 7919) ^ ((Math.round(-z / LOT_STEP) * 104729) | 0));

            /* ---------- CITY BUILDINGS ---------- */
            if (isCityDist(dMid)) {
                for (const side of [-1, 1]) {
                    if (rng() < 0.16) continue; // occasional gap lot (alley)
                    const isCore = dMid >= CITY_CORE_START && dMid < CITY_CORE_END;
                    const lat = 19 + rng() * 9;
                    const pos = this._place(z - LOT_STEP * 0.5, side, lat);
                    const rotY = -pos.angle;

                    const w = 9 + rng() * 13;
                    const depth = 8 + rng() * 10;
                    const h = isCore ? (16 + rng() * 46) : (7 + rng() * 13);

                    const variant = Math.floor(rng() * 3);
                    this._box(facadeGeos[variant], w, h, depth, pos.x, h / 2, pos.z, rotY);
                    this._box(roofGeos, w + 0.4, 0.35, depth + 0.4, pos.x, h + 0.17, pos.z, rotY);

                    // Storefront neon plate facing the road (low-rise lots)
                    if (!isCore && rng() < 0.75) {
                        const plateIds = ['racezone', 'tuning', 'noodle', 'arcade', 'garage', 'gas'];
                        const plate = plateIds[Math.floor(rng() * plateIds.length)];
                        const signW = Math.min(w * 0.72, 6.5);
                        const signH = signW * 0.39;
                        const signY = Math.min(h - 1.2, 3.4 + rng() * 2.2);
                        const frontLat = lat - (depth / 2) - 0.10;
                        const sp = this._place(z - LOT_STEP * 0.5, side, frontLat);
                        this._facingQuad(
                            neonGeos,
                            sp.x, signY, sp.z,
                            signW, signH,
                            { x: -pos.nx * side, z: -pos.nz * side },
                            this.atlasRects[plate],
                        );
                    }
                }
            }

            /* ---------- HIGHWAY BILLBOARDS ---------- */
            const billIdx = Math.floor(dMid / 96);
            if (billIdx !== prevBillIdx && !isCityDist(dMid)) {
                const side = (billIdx % 2 === 0) ? -1 : 1;
                const lat = 24 + rng() * 6;
                const pos = this._place(z - LOT_STEP * 0.5, side, lat);
                const facing = { x: -pos.nx * side, z: -pos.nz * side };
                const bw = 12.5, bh = 6.2, by = 7.4;

                const isPoster = (billIdx % 5 === 2); // every 5th board = SOVEETA hero art
                if (isPoster) {
                    this._facingQuad(posterGeos, pos.x, by, pos.z, 10.5, 6.4, facing, null);
                } else {
                    this._facingQuad(billboardGeos, pos.x, by, pos.z, bw, bh, facing, this.atlasRects.brand);
                }
                // Support posts (offset along the road tangent, under the board)
                const tx = -pos.nz, tz = pos.nx;
                const postH = by - bh / 2;
                this._box(poleGeos, 0.35, postH, 0.35, pos.x - tx * 2.6, postH / 2, pos.z - tz * 2.6);
                this._box(poleGeos, 0.35, postH, 0.35, pos.x + tx * 2.6, postH / 2, pos.z + tz * 2.6);
            }
            prevBillIdx = billIdx;

            /* ---------- GAS STATION (once per city block) ---------- */
            if (!gasPlaced && dMid >= GAS_STATION_DIST && dMid < GAS_STATION_DIST + LOT_STEP * 2) {
                gasPlaced = true;
                const side = 1;
                const pos = this._place(z - LOT_STEP * 0.5, side, 30);
                const rotY = -pos.angle;
                const facing = { x: -pos.nx * side, z: -pos.nz * side };

                // Canopy: white slab + red glowing stripe + 4 columns
                this._box(canopyGeos, 18, 0.5, 11, pos.x, 5.6, pos.z, rotY);
                this._box(stripeGeos, 18.2, 0.9, 11.2, pos.x, 6.1, pos.z, rotY);
                for (const [lx, lz] of [[-7, -4], [7, -4], [-7, 4], [7, 4]]) {
                    const cos = Math.cos(rotY), sin = Math.sin(rotY);
                    const wx = pos.x + lx * cos + lz * sin;
                    const wz = pos.z - lx * sin + lz * cos;
                    this._box(poleGeos, 0.4, 5.4, 0.4, wx, 2.7, wz);
                }
                // Convenience store behind canopy
                this._box(storeGeos, 14, 4.2, 7, pos.x + pos.nx * 10 * side, 2.1, pos.z + pos.nz * 10 * side, rotY);
                // Pumps
                this._box(pumpGeos, 0.7, 1.3, 0.55, pos.x, 0.65, pos.z, rotY);
                this._box(pumpGeos, 0.7, 1.3, 0.55, pos.x + pos.nx * 3 * -side, 0.65, pos.z + pos.nz * 3 * -side, rotY);
                // Price board near road edge
                const ps = this._place(z - LOT_STEP * 0.5, side, 16);
                this._facingQuad(priceGeos, ps.x, 2.6, ps.z, 3.0, 3.0, facing, null);
                this._box(poleGeos, 0.3, 1.2, 0.3, ps.x, 0.6, ps.z);
            }
        }

        // Merge & attach (one mesh per material bucket → bounded draw calls)
        const addMerged = (geos, mat, opts = {}) => {
            if (!geos || geos.length === 0) return;
            const merged = mergeGeometries(geos, false);
            if (!merged) return;
            const mesh = new THREE.Mesh(merged, mat);
            mesh.matrixAutoUpdate = false;
            group.add(mesh);
        };

        facadeGeos.forEach((arr, i) => addMerged(arr, this.facadeMats[i]));
        addMerged(roofGeos, this.roofMat);
        addMerged(neonGeos, this.neonMat);
        addMerged(billboardGeos, this.neonMat);
        addMerged(posterGeos, this.soveetaMat);
        addMerged(poleGeos, this.poleMat);
        addMerged(storeGeos, this.storeMat);
        addMerged(canopyGeos, this.canopyMat);
        addMerged(stripeGeos, this.canopyStripeMat);
        addMerged(pumpGeos, this.pumpMat);
        addMerged(priceGeos, this.priceMat);
    }
}
