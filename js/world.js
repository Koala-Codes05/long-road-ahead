import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * World – Need for Speed 2015 Warm Sodium Streetlight & Highway City Generator.
 * Features:
 *  - Warm sodium amber streetlights with soft atmosphere glow
 *  - Wet asphalt mirror reflecting orange streetlight pools
 *  - 4-lane highway with bright edge lines and guardrails
 *  - City skyline with warm horizon atmosphere
 */
export class World {
    constructor(scene) {
        this.scene = scene;
        this.chunkSize = 200;
        this.generatedChunks = new Map();
        this.chunksAhead = 4;
        this.chunksBehind = 2;

        this._createMaterials();
        this._createBuildingTextures();

        // Dynamic light pool (PointLights that move with car)
        this.lightPool = [];
        this.LIGHT_POOL_SIZE = 6;
        this._createLightPool();
    }

    /* ==================================================
       MATERIALS (Need for Speed 2015 Sodium Palette - Balanced)
       ================================================== */
    _createMaterials() {
        this.roadMat = new THREE.MeshStandardMaterial({
            color: 0x1c2336, roughness: 0.12, metalness: 0.85, // High-gloss wet reflection under moonlight
        });
        this.sidewalkMat = new THREE.MeshStandardMaterial({
            color: 0x2e364f, roughness: 0.35, metalness: 0.25,
        });
        this.whiteLineMat = new THREE.MeshStandardMaterial({
            color: 0xeeeeee, emissive: 0xcccccc, emissiveIntensity: 0.5,
        });
        this.yellowLineMat = new THREE.MeshStandardMaterial({
            color: 0xffaa00, emissive: 0xff8800, emissiveIntensity: 0.7,
        });

        this.buildingBaseMats = [
            new THREE.MeshStandardMaterial({ color: 0x182033, roughness: 0.8, metalness: 0.2 }),
            new THREE.MeshStandardMaterial({ color: 0x1a2238, roughness: 0.8, metalness: 0.2 }),
            new THREE.MeshStandardMaterial({ color: 0x221e33, roughness: 0.85, metalness: 0.2 }),
            new THREE.MeshStandardMaterial({ color: 0x162636, roughness: 0.8, metalness: 0.2 }),
        ];

        this.neonMats = [
            new THREE.MeshStandardMaterial({ color: 0xff3300, emissive: 0xff3300, emissiveIntensity: 1.2, side: THREE.DoubleSide }),
            new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xffaa00, emissiveIntensity: 1.2, side: THREE.DoubleSide }),
            new THREE.MeshStandardMaterial({ color: 0x00aaff, emissive: 0x00aaff, emissiveIntensity: 1.2, side: THREE.DoubleSide }),
            new THREE.MeshStandardMaterial({ color: 0xff0055, emissive: 0xff0055, emissiveIntensity: 1.2, side: THREE.DoubleSide }),
        ];

        this.poleMat = new THREE.MeshStandardMaterial({
            color: 0x333b52, metalness: 0.85, roughness: 0.25,
        });

        // Warm Sodium Lamp Bulb Material (Tamed)
        this.bulbMat = new THREE.MeshStandardMaterial({
            color: 0xff8822, emissive: 0xff6600, emissiveIntensity: 2.2,
        });

        // Soft Subtle Radial Glow Disc for Streetlamps
        this.haloMat = new THREE.MeshBasicMaterial({
            color: 0xff7711,
            transparent: true,
            opacity: 0.12,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
        });

        this.groundMat = new THREE.MeshStandardMaterial({
            color: 0x101626, roughness: 0.9, metalness: 0.0,
        });
    }

    _createBuildingTextures() {
        this.buildingTexMats = [];
        const configs = [
            { base: [35, 45, 68], lit: [255, 190, 110], dark: [20, 26, 42] },  // Warm sodium windows
            { base: [38, 48, 75], lit: [255, 215, 140], dark: [22, 28, 46] },
            { base: [48, 38, 65], lit: [255, 140, 170], dark: [26, 22, 42] },
            { base: [35, 55, 68], lit: [140, 230, 255], dark: [20, 32, 42] },
        ];
        configs.forEach(({ base, lit, dark }) => {
            const c = document.createElement('canvas');
            c.width = 128; c.height = 256;
            const ctx = c.getContext('2d');
            ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
            ctx.fillRect(0, 0, 128, 256);
            const cols = 4, rows = 10, ww = 18, wh = 16;
            const sx = 128 / cols, sy = 256 / rows;
            for (let r = 0; r < rows; r++) {
                for (let cl = 0; cl < cols; cl++) {
                    const on = Math.random() > 0.35;
                    const [cr, cg, cb] = on ? lit : dark;
                    ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
                    ctx.fillRect(cl * sx + (sx - ww) / 2, r * sy + (sy - wh) / 2, ww, wh);
                }
            }
            const tex = new THREE.CanvasTexture(c);
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            this.buildingTexMats.push(
                new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.1 }),
            );
        });
    }

    _createLightPool() {
        for (let i = 0; i < this.LIGHT_POOL_SIZE; i++) {
            // Warm Sodium Golden PointLight
            const pl = new THREE.PointLight(0xff7711, 14, 40, 1.8);
            pl.position.set(0, 7.0, 0);
            this.scene.add(pl);
            this.lightPool.push(pl);
        }
    }

    _updateLightPool(carPos) {
        const spacing = 15;
        const startZ = Math.round(carPos.z / spacing) * spacing + spacing * 4;
        for (let i = 0; i < this.LIGHT_POOL_SIZE; i++) {
            const z = startZ - i * spacing;
            const side = i % 2 === 0 ? -13.5 : 13.5;
            this.lightPool[i].position.set(side, 7.0, z);
        }
    }

    init() {
        this.ground = new THREE.Mesh(
            new THREE.PlaneGeometry(600, 12000),
            this.groundMat,
        );
        this.ground.rotation.x = -Math.PI / 2;
        this.ground.position.set(0, -0.05, -4000);
        this.ground.receiveShadow = true;
        this.scene.add(this.ground);

        for (let i = -1; i <= this.chunksAhead; i++) this._genChunk(i);
    }

    _chunkIdx(z) { return Math.floor(-z / this.chunkSize); }

    update(carPos) {
        const cur = this._chunkIdx(carPos.z);

        for (let i = cur - 1; i <= cur + this.chunksAhead; i++) {
            if (!this.generatedChunks.has(i)) this._genChunk(i);
        }

        for (const [idx] of this.generatedChunks) {
            if (idx < cur - this.chunksBehind || idx > cur + this.chunksAhead + 2) {
                this._removeChunk(idx);
            }
        }

        this.ground.position.z = carPos.z - 4000;
        this._updateLightPool(carPos);
    }

    _genChunk(idx) {
        const g = new THREE.Group();
        const zC = -(idx * this.chunkSize + this.chunkSize / 2);
        const zS = -idx * this.chunkSize;

        this._road(g, zC);
        this._laneMarks(g, zC, zS);
        this._sidewalks(g, zC);
        this._buildings(g, zC, -1);
        this._buildings(g, zC, 1);
        this._streetLights(g, zS);

        this.scene.add(g);
        this.generatedChunks.set(idx, g);
    }

    _removeChunk(idx) {
        const g = this.generatedChunks.get(idx);
        if (!g) return;
        g.traverse(c => { if (c.geometry) c.geometry.dispose(); });
        this.scene.remove(g);
        this.generatedChunks.delete(idx);
    }

    _road(g, zC) {
        const r = new THREE.Mesh(
            new THREE.PlaneGeometry(24, this.chunkSize),
            this.roadMat,
        );
        r.rotation.x = -Math.PI / 2;
        r.position.set(0, 0.01, zC);
        r.receiveShadow = true;
        g.add(r);
    }

    _laneMarks(g, zC, zS) {
        const dashGeo = new THREE.PlaneGeometry(0.18, 3.5);
        const whiteGeos = [];
        const matrix = new THREE.Matrix4();
        const rotMatrix = new THREE.Matrix4().makeRotationX(-Math.PI / 2);

        for (let z = zS; z > zS - this.chunkSize; z -= 7) {
            const geo = dashGeo.clone();
            matrix.makeTranslation(0, 0.025, z).multiply(rotMatrix);
            geo.applyMatrix4(matrix);
            whiteGeos.push(geo);
        }

        [-6, 6].forEach(x => {
            for (let z = zS; z > zS - this.chunkSize; z -= 12) {
                const geo = dashGeo.clone();
                matrix.makeTranslation(x, 0.025, z).multiply(rotMatrix);
                geo.applyMatrix4(matrix);
                whiteGeos.push(geo);
            }
        });

        if (whiteGeos.length > 0) {
            const mergedWhite = mergeGeometries(whiteGeos, false);
            const whiteMesh = new THREE.Mesh(mergedWhite, this.whiteLineMat);
            g.add(whiteMesh);
        }

        const edgeGeo = new THREE.PlaneGeometry(0.22, this.chunkSize);
        const yellowGeos = [];
        [-11.8, 11.8].forEach(x => {
            const geo = edgeGeo.clone();
            matrix.makeTranslation(x, 0.025, zC).multiply(rotMatrix);
            geo.applyMatrix4(matrix);
            yellowGeos.push(geo);
        });

        if (yellowGeos.length > 0) {
            const mergedYellow = mergeGeometries(yellowGeos, false);
            const yellowMesh = new THREE.Mesh(mergedYellow, this.yellowLineMat);
            g.add(yellowMesh);
        }
    }

    _sidewalks(g, zC) {
        const geo = new THREE.BoxGeometry(4, 0.25, this.chunkSize);
        const swGeos = [];
        const matrix = new THREE.Matrix4();
        [-14, 14].forEach(x => {
            const sw = geo.clone();
            matrix.makeTranslation(x, 0.125, zC);
            sw.applyMatrix4(matrix);
            swGeos.push(sw);
        });
        if (swGeos.length > 0) {
            const swMesh = new THREE.Mesh(mergeGeometries(swGeos, false), this.sidewalkMat);
            swMesh.receiveShadow = true;
            g.add(swMesh);
        }
    }

    _buildings(g, zC, side) {
        const zTop = zC + this.chunkSize / 2;
        let z = zTop;
        while (z > zC - this.chunkSize / 2) {
            const w = 8 + Math.random() * 18;
            const h = 14 + Math.random() * 75;
            const d = 8 + Math.random() * 15;
            const gap = 0.5 + Math.random() * 3;

            const mat = Math.random() > 0.35
                ? this.buildingTexMats[Math.floor(Math.random() * this.buildingTexMats.length)]
                : this.buildingBaseMats[Math.floor(Math.random() * this.buildingBaseMats.length)];

            const bld = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
            const xOff = 18 + w / 2 + Math.random() * 8;
            bld.position.set(side * xOff, h / 2, z - d / 2);
            bld.matrixAutoUpdate = false;
            bld.updateMatrix();
            bld.receiveShadow = true;
            g.add(bld);

            if (Math.random() > 0.6) this._neonAccent(g, bld, w, h, d, side);
            if (h > 40 && Math.random() > 0.7) this._rooftopLight(g, bld, h);

            z -= d + gap;
        }

        z = zTop;
        while (z > zC - this.chunkSize / 2) {
            const w = 10 + Math.random() * 25;
            const h = 20 + Math.random() * 100;
            const d = 10 + Math.random() * 20;
            const gap = 1 + Math.random() * 5;
            const mat = this.buildingBaseMats[Math.floor(Math.random() * this.buildingBaseMats.length)];
            const bld = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
            bld.position.set(side * (45 + w / 2 + Math.random() * 30), h / 2, z - d / 2);
            bld.matrixAutoUpdate = false;
            bld.updateMatrix();
            bld.receiveShadow = true;
            g.add(bld);
            z -= d + gap;
        }
    }

    _neonAccent(g, bld, w, h, d, side) {
        const mat = this.neonMats[Math.floor(Math.random() * this.neonMats.length)];
        const sw = d * (0.3 + Math.random() * 0.4);
        const sh = 0.3 + Math.random() * 0.7;
        const strip = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), mat);
        strip.position.copy(bld.position);
        strip.position.x += -side * (w / 2 + 0.05);
        strip.position.y = 2 + Math.random() * Math.min(h - 4, 15);
        strip.rotation.y = side * Math.PI / 2;
        g.add(strip);
    }

    _rooftopLight(g, bld, h) {
        const col = Math.random() > 0.5 ? 0xff3300 : 0xffaa00;
        const mat = new THREE.MeshStandardMaterial({
            color: col, emissive: col, emissiveIntensity: 1.5,
        });
        const light = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 6), mat);
        light.position.copy(bld.position);
        light.position.y = h + 0.3;
        g.add(light);
    }

    /* ==================================================
       NEED FOR SPEED 2015 SODIUM STREETLIGHTS (BATCHED)
       ================================================== */
    _streetLights(g, zS) {
        const spacing = 20;
        const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 7.2, 6);
        const armGeo = new THREE.BoxGeometry(3, 0.08, 0.08);
        const bulbGeo = new THREE.SphereGeometry(0.25, 8, 8);
        const haloGeo = new THREE.CircleGeometry(0.6, 8);

        const poleGeos = [];
        const armGeos = [];
        const bulbGeos = [];
        const haloGeos = [];
        const matrix = new THREE.Matrix4();
        const rotHaloMatrix = new THREE.Matrix4().makeRotationX(Math.PI / 2);

        for (let z = zS; z > zS - this.chunkSize; z -= spacing) {
            [-13.5, 13.5].forEach(x => {
                const dir = x > 0 ? -1 : 1;

                // Pole
                const p = poleGeo.clone();
                matrix.makeTranslation(x, 3.6, z);
                p.applyMatrix4(matrix);
                poleGeos.push(p);

                // Arm
                const a = armGeo.clone();
                matrix.makeTranslation(x + dir * 1.5, 7.0, z);
                a.applyMatrix4(matrix);
                armGeos.push(a);

                // Bulb
                const b = bulbGeo.clone();
                matrix.makeTranslation(x + dir * 2.8, 6.8, z);
                b.applyMatrix4(matrix);
                bulbGeos.push(b);

                // Halo
                const h = haloGeo.clone();
                matrix.makeTranslation(x + dir * 2.8, 6.8, z).multiply(rotHaloMatrix);
                h.applyMatrix4(matrix);
                haloGeos.push(h);
            });
        }

        if (poleGeos.length > 0) {
            g.add(new THREE.Mesh(mergeGeometries(poleGeos, false), this.poleMat));
            g.add(new THREE.Mesh(mergeGeometries(armGeos, false), this.poleMat));
            g.add(new THREE.Mesh(mergeGeometries(bulbGeos, false), this.bulbMat));
            g.add(new THREE.Mesh(mergeGeometries(haloGeos, false), this.haloMat));
        }
    }
}
