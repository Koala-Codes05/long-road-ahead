import * as THREE from 'three';

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
        this.LIGHT_POOL_SIZE = 18;
        this._createLightPool();
    }

    /* ==================================================
       MATERIALS (Need for Speed 2015 Sodium Palette - Balanced)
       ================================================== */
    _createMaterials() {
        this.roadMat = new THREE.MeshStandardMaterial({
            color: 0x12121c, roughness: 0.06, metalness: 0.92, // High-gloss wet reflection
        });
        this.sidewalkMat = new THREE.MeshStandardMaterial({
            color: 0x1c1c28, roughness: 0.25, metalness: 0.3,
        });
        this.whiteLineMat = new THREE.MeshStandardMaterial({
            color: 0xcccccc, emissive: 0xaaaaaa, emissiveIntensity: 0.4,
        });
        this.yellowLineMat = new THREE.MeshStandardMaterial({
            color: 0xff9900, emissive: 0xff8800, emissiveIntensity: 0.6,
        });

        this.buildingBaseMats = [
            new THREE.MeshStandardMaterial({ color: 0x080812, roughness: 0.9, metalness: 0.1 }),
            new THREE.MeshStandardMaterial({ color: 0x0a0918, roughness: 0.85, metalness: 0.15 }),
            new THREE.MeshStandardMaterial({ color: 0x0e0814, roughness: 0.9, metalness: 0.1 }),
            new THREE.MeshStandardMaterial({ color: 0x070c14, roughness: 0.85, metalness: 0.1 }),
        ];

        this.neonMats = [
            new THREE.MeshStandardMaterial({ color: 0xff3300, emissive: 0xff3300, emissiveIntensity: 1.2, side: THREE.DoubleSide }),
            new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xffaa00, emissiveIntensity: 1.2, side: THREE.DoubleSide }),
            new THREE.MeshStandardMaterial({ color: 0x00aaff, emissive: 0x00aaff, emissiveIntensity: 1.2, side: THREE.DoubleSide }),
            new THREE.MeshStandardMaterial({ color: 0xff0055, emissive: 0xff0055, emissiveIntensity: 1.2, side: THREE.DoubleSide }),
        ];

        this.poleMat = new THREE.MeshStandardMaterial({
            color: 0x222233, metalness: 0.85, roughness: 0.25,
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
            color: 0x05050c, roughness: 0.95, metalness: 0.0,
        });
    }

    _createBuildingTextures() {
        this.buildingTexMats = [];
        const configs = [
            { base: [22, 22, 38], lit: [255, 170, 85], dark: [8, 8, 18] },  // Warm sodium windows
            { base: [26, 26, 48], lit: [255, 204, 120], dark: [8, 8, 22] },
            { base: [34, 22, 38], lit: [255, 120, 150], dark: [14, 8, 18] },
            { base: [22, 34, 38], lit: [120, 220, 255], dark: [8, 18, 14] },
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

        for (let z = zS; z > zS - this.chunkSize; z -= 7) {
            const d = new THREE.Mesh(dashGeo, this.whiteLineMat);
            d.rotation.x = -Math.PI / 2;
            d.position.set(0, 0.025, z);
            g.add(d);
        }

        [-6, 6].forEach(x => {
            for (let z = zS; z > zS - this.chunkSize; z -= 12) {
                const d = new THREE.Mesh(dashGeo, this.whiteLineMat);
                d.rotation.x = -Math.PI / 2;
                d.position.set(x, 0.025, z);
                g.add(d);
            }
        });

        const edgeGeo = new THREE.PlaneGeometry(0.22, this.chunkSize);
        [-11.8, 11.8].forEach(x => {
            const e = new THREE.Mesh(edgeGeo, this.yellowLineMat);
            e.rotation.x = -Math.PI / 2;
            e.position.set(x, 0.025, zC);
            g.add(e);
        });
    }

    _sidewalks(g, zC) {
        const geo = new THREE.BoxGeometry(4, 0.25, this.chunkSize);
        [-14, 14].forEach(x => {
            const sw = new THREE.Mesh(geo, this.sidewalkMat);
            sw.position.set(x, 0.125, zC);
            sw.receiveShadow = true;
            g.add(sw);
        });
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
            bld.castShadow = true;
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
            bld.castShadow = true;
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
       NEED FOR SPEED 2015 SODIUM STREETLIGHTS
       ================================================== */
    _streetLights(g, zS) {
        const spacing = 15;
        const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 7.2, 6);
        const armGeo = new THREE.BoxGeometry(3, 0.08, 0.08);
        const bulbGeo = new THREE.SphereGeometry(0.25, 10, 10);
        const haloGeo = new THREE.CircleGeometry(0.6, 12);

        for (let z = zS; z > zS - this.chunkSize; z -= spacing) {
            [-13.5, 13.5].forEach(x => {
                const dir = x > 0 ? -1 : 1;

                // Metallic Pole
                const pole = new THREE.Mesh(poleGeo, this.poleMat);
                pole.position.set(x, 3.6, z);
                g.add(pole);

                // Arm extension over highway
                const arm = new THREE.Mesh(armGeo, this.poleMat);
                arm.position.set(x + dir * 1.5, 7.0, z);
                g.add(arm);

                // Glowing Sodium Bulb Lamp
                const bulb = new THREE.Mesh(bulbGeo, this.bulbMat);
                bulb.position.set(x + dir * 2.8, 6.8, z);
                g.add(bulb);

                // Soft Subtle Light Halo Disc
                const halo = new THREE.Mesh(haloGeo, this.haloMat);
                halo.position.set(x + dir * 2.8, 6.8, z);
                halo.rotation.x = Math.PI / 2; // Facing down toward road
                g.add(halo);
            });
        }
    }
}
