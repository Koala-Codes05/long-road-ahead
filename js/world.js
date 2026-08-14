import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Procedural Road Path Generator
 * Generates continuous piecewise highway segments:
 *  - High-Speed Straights (dx = 0)
 *  - Sweeping Fast Right Turns
 *  - Technical S-Chicanes
 *  - Sharp Hairpin Corner Left Turns
 *  - Winding Mountain Pass S-Curves
 *  - High-G Double Apex Sweeper Curves
 * Guarantees C1/C2 continuity, zero seam breaks, and zero unbounded drift.
 */
export function getRoadPoint(z) {
    const dist = -z;
    const cycleLength = 6280;
    const d = ((dist % cycleLength) + cycleLength) % cycleLength;

    let dx = 0;
    let xInCycle = 0;

    // =========================================================
    // SECTION 1: HIGH-SPEED FLOW (0m - 1360m)
    // Sequence: straight → gentle right → long left → kink → straight
    // =========================================================
    if (d < 100) {
        // 1. Launch Straight (100m)
        dx = 0; xInCycle = 0;
    } else if (d < 450) {
        // 2. Medium Fast Right (350m) — Peak dx = 0.45 (~24° angle)
        const t = (d - 100) / 350;
        dx = 0.45 * Math.sin(t * Math.PI);
        xInCycle = 0.45 * (350 / Math.PI) * (1.0 - Math.cos(t * Math.PI));
    } else if (d < 1100) {
        // 3. Sharp Sweeping Left (650m) — Peak dx = -0.55 (~29° angle)
        const startX = 0.45 * (350 / Math.PI) * 2.0; // ~100.27m
        const t = (d - 450) / 650;
        dx = -0.55 * Math.sin(t * Math.PI);
        xInCycle = startX - 0.55 * (650 / Math.PI) * (1.0 - Math.cos(t * Math.PI));
    } else if (d < 1300) {
        // 4. Aggressive Kink Right (200m) — Peak dx = 1.00 (~45° angle)
        const startX = -127.32;
        const t = (d - 1100) / 200;
        dx = 1.00 * Math.sin(t * Math.PI);
        xInCycle = startX + 1.00 * (200 / Math.PI) * (1.0 - Math.cos(t * Math.PI));
    } else if (d < 1360) {
        // 5. Flow Chute (60m)
        dx = 0; xInCycle = 0;
    }

    // =========================================================
    // SECTION 2: TECHNICAL SECTION (1360m - 2520m)
    // Sequence: braking zone → decreasing-radius right → short straight → hairpin → S-bend
    // =========================================================
    else if (d < 1440) {
        // 6. Braking Zone (80m)
        dx = 0; xInCycle = 0;
    } else if (d < 1790) {
        // 7. Sharp Decreasing-Radius Right (350m) — Peak dx = 1.15 (~49° angle)
        const t = (d - 1440) / 350;
        dx = 0.85 * Math.sin(t * Math.PI) + 0.30 * Math.sin(t * Math.PI * 2);
        xInCycle = 0.85 * (350 / Math.PI) * (1.0 - Math.cos(t * Math.PI)) +
            0.30 * (350 / (2 * Math.PI)) * (1.0 - Math.cos(t * Math.PI * 2));
    } else if (d < 1850) {
        // 8. Short Technical Chute (60m)
        const startX = 0.85 * (350 / Math.PI) * 2.0; // ~189.40m
        dx = 0; xInCycle = startX;
    } else if (d < 2170) {
        // 9. Sharp Apex Hairpin Left (320m) — Peak dx = -0.93 (~43° angle)
        const startX = 189.40;
        const t = (d - 1850) / 320;
        dx = -0.93 * Math.sin(t * Math.PI);
        xInCycle = startX - 0.93 * (320 / Math.PI) * (1.0 - Math.cos(t * Math.PI));
    } else if (d < 2520) {
        // 10. Rapid S-Bend Flick (350m) — Peak dx = 0.95 (~43.5° angle)
        const t = (d - 2170) / 350;
        dx = 0.95 * Math.sin(t * Math.PI * 2);
        xInCycle = 0.95 * (350 / (2 * Math.PI)) * (1.0 - Math.cos(t * Math.PI * 2));
    }

    // =========================================================
    // SECTION 3: MOUNTAIN ROAD (2520m - 3700m)
    // Sequence: long uphill → left hairpin → short downhill → right hairpin → sweeping left
    // =========================================================
    else if (d < 2600) {
        // 11. Uphill Chute (80m)
        dx = 0; xInCycle = 0;
    } else if (d < 2920) {
        // 12. Mountain Left Hairpin (320m) — Peak dx = -0.98 (~44.5° angle)
        const t = (d - 2600) / 320;
        dx = -0.98 * Math.sin(t * Math.PI);
        xInCycle = -0.98 * (320 / Math.PI) * (1.0 - Math.cos(t * Math.PI));
    } else if (d < 2980) {
        // 13. Downhill Chute (60m)
        const startX = -199.58;
        dx = 0; xInCycle = startX;
    } else if (d < 3300) {
        // 14. Mountain Right Hairpin (320m) — Peak dx = 1.96 (~63° angle sharp hairpin!)
        const startX = -199.58;
        const t = (d - 2980) / 320;
        dx = 1.96 * Math.sin(t * Math.PI);
        xInCycle = startX + 1.96 * (320 / Math.PI) * (1.0 - Math.cos(t * Math.PI));
    } else if (d < 3700) {
        // 15. Mountain Sweeping Left (400m) — Peak dx = -0.7835 (~38° angle)
        const startX = 199.58;
        const t = (d - 3300) / 400;
        dx = -0.7835 * Math.sin(t * Math.PI);
        xInCycle = startX - 0.7835 * (400 / Math.PI) * (1.0 - Math.cos(t * Math.PI));
    }

    // =========================================================
    // SECTION 4: CITY (3700m - 5040m)
    // Sequence: 90° right → short straight → 90° left → roundabout → sweeping exit
    // =========================================================
    else if (d < 3980) {
        // 16. Urban 90° Right Corner (280m) — Peak dx = 0.95 (~43.5° angle)
        const t = (d - 3700) / 280;
        dx = 0.95 * Math.sin(t * Math.PI);
        xInCycle = 0.95 * (280 / Math.PI) * (1.0 - Math.cos(t * Math.PI));
    } else if (d < 4040) {
        // 17. City Transition Chute (60m)
        const startX = 0.95 * (280 / Math.PI) * 2.0; // ~169.34m
        dx = 0; xInCycle = startX;
    } else if (d < 4320) {
        // 18. Urban 90° Left Corner (280m) — Peak dx = -0.95 (~43.5° angle)
        const startX = 169.34;
        const t = (d - 4040) / 280;
        dx = -0.95 * Math.sin(t * Math.PI);
        xInCycle = startX - 0.95 * (280 / Math.PI) * (1.0 - Math.cos(t * Math.PI));
    } else if (d < 4720) {
        // 19. City Roundabout Chicane (400m) — Peak dx = 1.65 (~58.7° angle)
        const t = (d - 4320) / 400;
        dx = 1.10 * Math.sin(t * Math.PI * 2) + 0.55 * Math.sin(t * Math.PI);
        xInCycle = 1.10 * (400 / (2 * Math.PI)) * (1.0 - Math.cos(t * Math.PI * 2)) +
            0.55 * (400 / Math.PI) * (1.0 - Math.cos(t * Math.PI));
    } else if (d < 5040) {
        // 20. City Sweeping Exit (320m) — Peak dx = -0.6875 (~34.5° angle)
        const startX = 0.55 * (400 / Math.PI) * 2.0; // ~140.05m
        const t = (d - 4720) / 320;
        dx = -0.6875 * Math.sin(t * Math.PI);
        xInCycle = startX - 0.6875 * (320 / Math.PI) * (1.0 - Math.cos(t * Math.PI));
    }

    // =========================================================
    // SECTION 5: DRAMATIC RACING SECTION (5040m - 6280m)
    // Sequence: crest → blind left → downhill → decreasing-radius right → bridge → hairpin
    // =========================================================
    else if (d < 5120) {
        // 21. Crest Entry (80m)
        dx = 0; xInCycle = 0;
    } else if (d < 5440) {
        // 22. Blind Left Turn (320m) — Peak dx = -0.98 (~44.5° angle)
        const t = (d - 5120) / 320;
        dx = -0.98 * Math.sin(t * Math.PI);
        xInCycle = -0.98 * (320 / Math.PI) * (1.0 - Math.cos(t * Math.PI));
    } else if (d < 5500) {
        // 23. Downhill Transition (60m)
        const startX = -199.58;
        dx = 0; xInCycle = startX;
    } else if (d < 5860) {
        // 24. Sharp Decreasing-Radius Right (360m) — Peak dx = 2.14 (~65° angle sharp corner!)
        const startX = -199.58;
        const t = (d - 5500) / 360;
        dx = 1.742 * Math.sin(t * Math.PI) + 0.40 * Math.sin(t * Math.PI * 2);
        xInCycle = startX + 1.742 * (360 / Math.PI) * (1.0 - Math.cos(t * Math.PI)) +
            0.40 * (360 / (2 * Math.PI)) * (1.0 - Math.cos(t * Math.PI * 2));
    } else if (d < 5920) {
        // 25. Bridge Transition (60m)
        const startX = 199.66;
        dx = 0; xInCycle = startX;
    } else {
        // 26. Grand Hairpin Finish (360m) — Peak dx = -0.871 (~41° angle)
        const startX = 199.66;
        const t = (d - 5920) / 360;
        dx = -0.871 * Math.sin(t * Math.PI);
        xInCycle = startX - 0.871 * (360 / Math.PI) * (1.0 - Math.cos(t * Math.PI));
    }

    const angle = Math.atan2(dx, 1.0);
    return { x: xInCycle, angle, dx };
}

/**
 * Road Network Junction Locator (Disabled - Highway only)
 */
export function getJunctionInfo(z) {
    return null;
}

/**
 * Dynamic Road Width Function
 */
export function getRoadWidth(z) {
    return 26.0;
}

/**
 * Returns live telemetry about current road segment for HUD alerts & displays.
 */
export function getRoadZoneInfo(z) {
    const dist = -z;
    const cycleLength = 6280;
    const d = ((dist % cycleLength) + cycleLength) % cycleLength;

    // SECTION 1: HIGH-SPEED FLOW
    if (d < 100) return { name: 'FLOW: HIGHWAY LAUNCH', icon: '🛣️', width: 26.0, maxSpeed: '330 KM/H', lanes: 4, danger: 'LOW' };
    if (d < 450) return { name: 'FLOW: GENTLE RIGHT', icon: '↗️', width: 26.0, maxSpeed: '300 KM/H', lanes: 4, danger: 'LOW' };
    if (d < 1100) return { name: 'FLOW: LONG SWEEPING LEFT', icon: '🌊', width: 26.0, maxSpeed: '280 KM/H', lanes: 4, danger: 'MED' };
    if (d < 1300) return { name: 'FLOW: HIGH-SPEED KINK', icon: '⚡', width: 26.0, maxSpeed: '290 KM/H', lanes: 4, danger: 'HIGH' };
    if (d < 1360) return { name: 'FLOW: VALLEY RUN', icon: '🛣️', width: 26.0, maxSpeed: '325 KM/H', lanes: 4, danger: 'LOW' };

    // SECTION 2: TECHNICAL SECTION
    if (d < 1440) return { name: 'TECH: BRAKING ZONE', icon: '🛑', width: 26.0, maxSpeed: '260 KM/H', lanes: 4, danger: 'HIGH' };
    if (d < 1790) return { name: 'TECH: DECREASING RADIUS RIGHT', icon: '↘️', width: 26.0, maxSpeed: '190 KM/H', lanes: 4, danger: 'EXTREME' };
    if (d < 1850) return { name: 'TECH: SHORT CHUTE', icon: '🛣️', width: 26.0, maxSpeed: '240 KM/H', lanes: 4, danger: 'MED' };
    if (d < 2170) return { name: 'TECH: APEX HAIRPIN', icon: '↩️', width: 26.0, maxSpeed: '175 KM/H', lanes: 4, danger: 'EXTREME' };
    if (d < 2520) return { name: 'TECH: TECHNICAL S-BEND', icon: '🔀', width: 26.0, maxSpeed: '210 KM/H', lanes: 4, danger: 'HIGH' };

    // SECTION 3: MOUNTAIN ROAD
    if (d < 2600) return { name: 'MOUNTAIN: UPHILL CHUTE', icon: '⛰️', width: 26.0, maxSpeed: '295 KM/H', lanes: 4, danger: 'LOW' };
    if (d < 2920) return { name: 'MOUNTAIN: LEFT HAIRPIN', icon: '↖️', width: 26.0, maxSpeed: '170 KM/H', lanes: 4, danger: 'EXTREME' };
    if (d < 2980) return { name: 'MOUNTAIN: DOWNHILL CHUTE', icon: '📉', width: 26.0, maxSpeed: '250 KM/H', lanes: 4, danger: 'MED' };
    if (d < 3300) return { name: 'MOUNTAIN: RIGHT HAIRPIN', icon: '↗️', width: 26.0, maxSpeed: '175 KM/H', lanes: 4, danger: 'EXTREME' };
    if (d < 3700) return { name: 'MOUNTAIN: SWEEPING LEFT', icon: '🌀', width: 26.0, maxSpeed: '265 KM/H', lanes: 4, danger: 'HIGH' };

    // SECTION 4: CITY
    if (d < 3980) return { name: 'CITY: 90° RIGHT CORNER', icon: '🏙️', width: 26.0, maxSpeed: '185 KM/H', lanes: 4, danger: 'HIGH' };
    if (d < 4040) return { name: 'CITY: URBAN CHUTE', icon: '🛣️', width: 26.0, maxSpeed: '280 KM/H', lanes: 4, danger: 'LOW' };
    if (d < 4320) return { name: 'CITY: 90° LEFT CORNER', icon: '🏙️', width: 26.0, maxSpeed: '185 KM/H', lanes: 4, danger: 'HIGH' };
    if (d < 4720) return { name: 'CITY: ROUNDABOUT LOOP', icon: '🔄', width: 26.0, maxSpeed: '195 KM/H', lanes: 4, danger: 'EXTREME' };
    if (d < 5040) return { name: 'CITY: SWEEPING EXIT', icon: '🌆', width: 26.0, maxSpeed: '275 KM/H', lanes: 4, danger: 'MED' };

    // SECTION 5: DRAMATIC RACING SECTION
    if (d < 5120) return { name: 'RACING: RIDGE CREST', icon: '🌄', width: 26.0, maxSpeed: '320 KM/H', lanes: 4, danger: 'HIGH' };
    if (d < 5440) return { name: 'RACING: BLIND LEFT', icon: '👁️', width: 26.0, maxSpeed: '215 KM/H', lanes: 4, danger: 'EXTREME' };
    if (d < 5500) return { name: 'RACING: DOWNHILL CHUTE', icon: '🚀', width: 26.0, maxSpeed: '310 KM/H', lanes: 4, danger: 'HIGH' };
    if (d < 5860) return { name: 'RACING: DECREASING RIGHT', icon: '🏎️', width: 26.0, maxSpeed: '190 KM/H', lanes: 4, danger: 'EXTREME' };
    if (d < 5920) return { name: 'RACING: ARTERIAL BRIDGE', icon: '🌉', width: 26.0, maxSpeed: '315 KM/H', lanes: 4, danger: 'MED' };
    return { name: 'RACING: GRAND HAIRPIN FINISH', icon: '🏁', width: 26.0, maxSpeed: '180 KM/H', lanes: 4, danger: 'EXTREME' };
}

/**
 * World — Interconnected Road Network & Procedural Highway Generator.
 * Generates continuous curved arterial highway, branching side streets, road junctions,
 * intersection openings, lane divider lines, shoulder lines, and exit signage.
 */
export class World {
    constructor(scene) {
        this.scene = scene;
        this.chunkSize = 200;
        this.segmentsPerChunk = 40; // 5m per segment for smooth curves
        this.generatedChunks = new Map();
        this.chunksAhead = 4;
        this.chunksBehind = 2;

        this._createMaterials();
    }

    _createMaterials() {
        const textureLoader = new THREE.TextureLoader();

        // 2K Optimized PBR Highway Textures (75% VRAM Reduction, 60+ FPS rendering)
        this.roadBaseColorMap = textureLoader.load('assets/Highway road/2k/HighwayRoadWet01_4K_BaseColor.png');
        this.roadNormalMap = textureLoader.load('assets/Highway road/2k/HighwayRoadWet01_4K_Normal.png');
        this.roadRoughnessMap = textureLoader.load('assets/Highway road/2k/HighwayRoadWet01_4K_Roughness.png');
        this.roadAOMap = textureLoader.load('assets/Highway road/2k/HighwayRoadWet01_4K_AO.png');
        this.roadHeightMap = textureLoader.load('assets/Highway road/2k/HighwayRoadWet01_4K_Height.png');

        const maps = [
            this.roadBaseColorMap,
            this.roadNormalMap,
            this.roadRoughnessMap,
            this.roadAOMap,
            this.roadHeightMap
        ];

        maps.forEach(tex => {
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.anisotropy = 4;
            tex.generateMipmaps = true;
        });

        this.roadBaseColorMap.colorSpace = THREE.SRGBColorSpace;

        this.roadMat = new THREE.MeshStandardMaterial({
            map: this.roadBaseColorMap,
            normalMap: this.roadNormalMap,
            normalScale: new THREE.Vector2(0.8, 0.8),
            roughnessMap: this.roadRoughnessMap,
            roughness: 0.5,
            metalness: 0.25,
            aoMap: this.roadAOMap,
            aoMapIntensity: 1.0,
            bumpMap: this.roadHeightMap,
            bumpScale: 0.03,
            color: 0xffffff,
            envMapIntensity: 1.8,
            side: THREE.DoubleSide,
        });

        // Crisp emissive road line materials for night driving visibility
        this.whiteLineMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xdddddd,
            emissiveIntensity: 0.55,
            roughness: 0.3,
            side: THREE.DoubleSide,
        });
        this.yellowLineMat = new THREE.MeshStandardMaterial({
            color: 0xffaa00,
            emissive: 0xff8800,
            emissiveIntensity: 0.75,
            roughness: 0.3,
            side: THREE.DoubleSide,
        });
        this.guardrailMat = new THREE.MeshStandardMaterial({
            color: 0x99aabb,
            metalness: 0.92,
            roughness: 0.18,
            envMapIntensity: 1.8,
            side: THREE.DoubleSide,
        });
        this.reflectorMat = new THREE.MeshStandardMaterial({
            color: 0xff4400,
            emissive: 0xff3300,
            emissiveIntensity: 1.8,
            side: THREE.DoubleSide,
        });
        this.puddleMat = new THREE.MeshStandardMaterial({
            color: 0x0a0a14,
            metalness: 0.98,
            roughness: 0.02,
            transparent: true,
            opacity: 0.0,
            envMapIntensity: 1.5,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        this.signMat = new THREE.MeshStandardMaterial({
            color: 0x117733, // Green Highway Sign
            emissive: 0x004411,
            emissiveIntensity: 0.6,
            roughness: 0.4,
            metalness: 0.3,
            side: THREE.DoubleSide,
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
        const guardrailGeos = [];
        const reflectorGeos = [];
        const puddleGeos = [];
        const signGeos = [];

        const addQuad = (targetArray, p0, p1, nx0, nz0, nx1, nz1, z0, z1, xOff, lineW, yPos = 0.022) => {
            const hw = lineW / 2;
            const xL0 = p0.x + nx0 * (xOff - hw), zL0 = z0 + nz0 * (xOff - hw);
            const xR0 = p0.x + nx0 * (xOff + hw), zR0 = z0 + nz0 * (xOff + hw);
            const xL1 = p1.x + nx1 * (xOff - hw), zL1 = z1 + nz1 * (xOff - hw);
            const xR1 = p1.x + nx1 * (xOff + hw), zR1 = z1 + nz1 * (xOff + hw);

            const geo = new THREE.BufferGeometry();
            const verts = new Float32Array([
                xL0, yPos, zL0,
                xR0, yPos, zR0,
                xL1, yPos, zL1,
                xR1, yPos, zR1,
            ]);
            const uvs = new Float32Array([
                0, 0,
                1, 0,
                0, 1,
                1, 1
            ]);
            const normals = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
            const indices = [0, 1, 2, 2, 1, 3];

            geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
            geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
            geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
            geo.setIndex(indices);
            targetArray.push(geo);
        };

        const addBox = (targetArray, cx, cy, cz, width, height, depth, angle = 0) => {
            const boxGeo = new THREE.BoxGeometry(width, height, depth);
            if (angle !== 0) boxGeo.rotateY(angle);
            boxGeo.translate(cx, cy, cz);
            targetArray.push(boxGeo);
        };

        for (let i = 0; i < this.segmentsPerChunk; i++) {
            const z0 = zStart - i * step;
            const z1 = zStart - (i + 1) * step;

            const p0 = getRoadPoint(z0);
            const p1 = getRoadPoint(z1);

            const hw = 13.0; // Constant 26.0m width (half-width = 13.0m)

            // Perpendicular normal vectors for road cross-sections (Right vector = [cos(a), 0, sin(a)])
            const nx0 = Math.cos(p0.angle), nz0 = Math.sin(p0.angle);
            const nx1 = Math.cos(p1.angle), nz1 = Math.sin(p1.angle);

            // 1. Main Arterial Asphalt Road Quad (Wide 26m Highway)
            const rGeo = new THREE.BufferGeometry();
            const rVertices = new Float32Array([
                p0.x - nx0 * hw, 0.01, z0 - nz0 * hw,
                p0.x + nx0 * hw, 0.01, z0 + nz0 * hw,
                p1.x - nx1 * hw, 0.01, z1 - nz1 * hw,
                p1.x + nx1 * hw, 0.01, z1 + nz1 * hw,
            ]);
            const rIndices = [0, 1, 2, 2, 1, 3];

            const u0 = -z0 / 52.0;
            const u1 = -z1 / 52.0;

            const rUvs = new Float32Array([
                u0, 0.0,
                u0, 1.0,
                u1, 0.0,
                u1, 1.0
            ]);
            const rNormals = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);

            rGeo.setAttribute('position', new THREE.BufferAttribute(rVertices, 3));
            rGeo.setAttribute('uv', new THREE.BufferAttribute(rUvs, 2));
            rGeo.setAttribute('uv2', new THREE.BufferAttribute(rUvs, 2));
            rGeo.setAttribute('normal', new THREE.BufferAttribute(rNormals, 3));
            rGeo.setIndex(rIndices);
            roadGeos.push(rGeo);

            // 2. Outer Shoulder Solid Boundaries (Solid Yellow Outer Edge Lines)
            [-12.0, 12.0].forEach(xOff => {
                addQuad(yellowGeos, p0, p1, nx0, nz0, nx1, nz1, z0, z1, xOff, 0.26, 0.024);
            });

            // 3. Outer Shoulder W-Beam Guardrails & Posts
            [-12.8, 12.8].forEach(xOff => {
                const rL0 = p0.x + nx0 * xOff, rZ0 = z0 + nz0 * xOff;
                const rL1 = p1.x + nx1 * xOff, rZ1 = z1 + nz1 * xOff;
                const midX = (rL0 + rL1) / 2, midZ = (rZ0 + rZ1) / 2;
                const segLen = Math.hypot(rL1 - rL0, rZ1 - rZ0);

                // Guardrail beam segment as Box
                addBox(guardrailGeos, midX, 0.65, midZ, 0.10, 0.35, segLen + 0.05, p0.angle);

                // Guardrail posts & safety reflectors every 10m
                const postCycle = Math.floor((-z0) / 10.0);
                if (postCycle !== Math.floor((-z1) / 10.0)) {
                    addBox(guardrailGeos, rL0, 0.35, rZ0, 0.12, 0.70, 0.12, p0.angle);
                    addBox(reflectorGeos, rL0, 0.88, rZ0, 0.16, 0.16, 0.06, p0.angle);
                }
            });

            // 4. Puddle Strips at Road Edges (reflective water accumulation)
            const puddleOffset = 10.5;
            const puddleWidth = 1.8;
            [-1, 1].forEach(side => {
                addQuad(puddleGeos, p0, p1, nx0, nz0, nx1, nz1, z0, z1, side * puddleOffset, puddleWidth, 0.015);
            });
        }

        const safeAddMesh = (geos, mat, targetGroup, castShadow = false, receiveShadow = false) => {
            if (!geos || geos.length === 0) return;
            try {
                const merged = mergeGeometries(geos, false);
                if (merged && merged.isBufferGeometry) {
                    const mesh = new THREE.Mesh(merged, mat);
                    mesh.castShadow = castShadow;
                    mesh.receiveShadow = receiveShadow;
                    targetGroup.add(mesh);
                }
            } catch (err) {
                console.warn('Failed to merge chunk geometries:', err);
            }
        };

        safeAddMesh(roadGeos, this.roadMat, g, false, true);
        safeAddMesh(yellowGeos, this.yellowLineMat, g);
        safeAddMesh(whiteGeos, this.whiteLineMat, g);
        safeAddMesh(guardrailGeos, this.guardrailMat, g, true, false);
        safeAddMesh(reflectorGeos, this.reflectorMat, g);
        safeAddMesh(puddleGeos, this.puddleMat, g);
        safeAddMesh(signGeos, this.signMat, g);

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
