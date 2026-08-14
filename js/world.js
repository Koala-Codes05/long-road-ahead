import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Procedural Road Curve Function
 * Guarantees that at z = 0, position X = 0 and road heading angle = 0.
 * Curves smoothly into sweeping corners, S-bends, and wide highway turns.
 */
export function getRoadPoint(z) {
    const k1 = 0.006;
    const k2 = 0.014;
    const slope0 = 32.0 * k1 + 16.0 * k2; // Ensures dx/dz = 0 at z = 0

    const x = 32.0 * Math.sin(z * k1) + 16.0 * Math.sin(z * k2) - slope0 * z;
    const dx = 32.0 * k1 * Math.cos(z * k1) + 16.0 * k2 * Math.cos(z * k2) - slope0;
    const angle = Math.atan2(dx, -1.0); // Heading direction along -Z
    return { x, angle, dx };
}

/**
 * World — Procedural Curved Highway & Corner Generator.
 * Generates continuous curved asphalt roads, yellow shoulder lines, white lane dividers.
 */
export class World {
    constructor(scene) {
        this.scene = scene;
        this.chunkSize = 200;
        this.segmentsPerChunk = 40; // 5m per segment for smooth curves
        this.roadWidth = 26.0; // Wide 4-lane highway road
        this.generatedChunks = new Map();
        this.chunksAhead = 4;
        this.chunksBehind = 2;

        this._createMaterials();
    }

    _createMaterials() {
        this.roadMat = new THREE.MeshStandardMaterial({
            color: 0x1c2336,
            roughness: 0.12,
            metalness: 0.85,
            envMapIntensity: 1.8,
        });
        this.whiteLineMat = new THREE.MeshStandardMaterial({
            color: 0xeeeeee,
            emissive: 0xcccccc,
            emissiveIntensity: 0.5,
        });
        this.yellowLineMat = new THREE.MeshStandardMaterial({
            color: 0xffaa00,
            emissive: 0xff8800,
            emissiveIntensity: 0.7,
        });
    }

    init() {
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
    }

    _genChunk(idx) {
        const g = new THREE.Group();
        const zStart = -idx * this.chunkSize;
        const step = this.chunkSize / this.segmentsPerChunk;

        const roadGeos = [];
        const whiteGeos = [];
        const yellowGeos = [];

        for (let i = 0; i < this.segmentsPerChunk; i++) {
            const z0 = zStart - i * step;
            const z1 = zStart - (i + 1) * step;

            const p0 = getRoadPoint(z0);
            const p1 = getRoadPoint(z1);

            // Perpendicular normal vectors for road cross-sections
            const nx0 = Math.cos(p0.angle), nz0 = -Math.sin(p0.angle);
            const nx1 = Math.cos(p1.angle), nz1 = -Math.sin(p1.angle);

            const hw = this.roadWidth / 2;

            // 1. Asphalt Road Quad
            const rGeo = new THREE.BufferGeometry();
            const rVertices = new Float32Array([
                p0.x - nx0 * hw, 0.01, z0 - nz0 * hw,
                p0.x + nx0 * hw, 0.01, z0 + nz0 * hw,
                p1.x - nx1 * hw, 0.01, z1 - nz1 * hw,
                p1.x + nx1 * hw, 0.01, z1 + nz1 * hw,
            ]);
            const rIndices = [0, 2, 1, 1, 2, 3];
            const rUvs = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
            const rNormals = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);

            rGeo.setAttribute('position', new THREE.BufferAttribute(rVertices, 3));
            rGeo.setAttribute('uv', new THREE.BufferAttribute(rUvs, 2));
            rGeo.setAttribute('normal', new THREE.BufferAttribute(rNormals, 3));
            rGeo.setIndex(rIndices);
            roadGeos.push(rGeo);

            // 2. Yellow Shoulder Lines (Outer Edges)
            [-hw + 0.3, hw - 0.3].forEach(off => {
                const yGeo = new THREE.BufferGeometry();
                const lw = 0.25;
                const yVerts = new Float32Array([
                    p0.x + nx0 * (off - lw), 0.025, z0 + nz0 * (off - lw),
                    p0.x + nx0 * (off + lw), 0.025, z0 + nz0 * (off + lw),
                    p1.x + nx1 * (off - lw), 0.025, z1 + nz1 * (off - lw),
                    p1.x + nx1 * (off + lw), 0.025, z1 + nz1 * (off + lw),
                ]);
                yGeo.setAttribute('position', new THREE.BufferAttribute(yVerts, 3));
                yGeo.setAttribute('normal', new THREE.BufferAttribute(rNormals, 3));
                yGeo.setIndex(rIndices);
                yellowGeos.push(yGeo);
            });

            // 3. Dashed White Center & Lane Line Markings
            if (i % 2 === 0) {
                [-6.5, 0.0, 6.5].forEach(off => {
                    const wGeo = new THREE.BufferGeometry();
                    const lw = 0.14;
                    const wVerts = new Float32Array([
                        p0.x + nx0 * (off - lw), 0.025, z0 + nz0 * (off - lw),
                        p0.x + nx0 * (off + lw), 0.025, z0 + nz0 * (off + lw),
                        p1.x + nx1 * (off - lw), 0.025, z1 + nz1 * (off - lw),
                        p1.x + nx1 * (off + lw), 0.025, z1 + nz1 * (off + lw),
                    ]);
                    wGeo.setAttribute('position', new THREE.BufferAttribute(wVerts, 3));
                    wGeo.setAttribute('normal', new THREE.BufferAttribute(rNormals, 3));
                    wGeo.setIndex(rIndices);
                    whiteGeos.push(wGeo);
                });
            }
        }

        if (roadGeos.length > 0) {
            const mergedRoad = mergeGeometries(roadGeos, false);
            const roadMesh = new THREE.Mesh(mergedRoad, this.roadMat);
            roadMesh.receiveShadow = true;
            g.add(roadMesh);
        }
        if (yellowGeos.length > 0) {
            const mergedYellow = mergeGeometries(yellowGeos, false);
            const yellowMesh = new THREE.Mesh(mergedYellow, this.yellowLineMat);
            g.add(yellowMesh);
        }
        if (whiteGeos.length > 0) {
            const mergedWhite = mergeGeometries(whiteGeos, false);
            const whiteMesh = new THREE.Mesh(mergedWhite, this.whiteLineMat);
            g.add(whiteMesh);
        }

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
}
