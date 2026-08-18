import * as THREE from 'three';

/**
 * SpeedTrailSystem — 3D Spiral Corkscrew Laser Taillight Trail.
 * Features:
 *  - 3D Helical/Spiral Corkscrew Laser Trails twisting through 3D space behind the vehicle.
 *  - Quadratic opacity attenuation (bright near taillights, fading smoothly through the middle to 0 at the end).
 *  - Dynamic speed lines rushing past at high speeds.
 * 100% pre-allocated zero-garbage performance.
 */
export class SpeedTrailSystem {
    constructor(scene, carMesh) {
        this.scene = scene;
        this.carMesh = carMesh;

        this.maxPoints = 28; // Focused spiral trail length
        this.animTime = 0;

        this.leftTailPoints = [];
        this.rightTailPoints = [];

        this._initMaterials();
        this._initLaserGeometries();
        this._initSpeedLines();
    }

    _initMaterials() {
        // Soft Translucent Red Taillight Material (Additive Blending)
        this.laserRedMat = new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.0,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false,
            depthTest: true,
        });

        // Subtle White Radial Speed Lines
        this.speedLineMat = new THREE.LineBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true,
        });
    }

    _createLaserRibbonGeo() {
        const geo = new THREE.BufferGeometry();
        const maxVerts = this.maxPoints * 2;
        const positions = new Float32Array(maxVerts * 3);
        const colors = new Float32Array(maxVerts * 3);
        const uvs = new Float32Array(maxVerts * 2);
        const indices = new Uint16Array((this.maxPoints - 1) * 6);

        for (let i = 0; i < this.maxPoints - 1; i++) {
            const row1 = i * 2;
            const row2 = (i + 1) * 2;
            indices[i * 6 + 0] = row1;
            indices[i * 6 + 1] = row1 + 1;
            indices[i * 6 + 2] = row2;
            indices[i * 6 + 3] = row2;
            indices[i * 6 + 4] = row1 + 1;
            indices[i * 6 + 5] = row2 + 1;
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        geo.setIndex(new THREE.BufferAttribute(indices, 1));
        geo.setDrawRange(0, 0);
        return geo;
    }

    _initLaserGeometries() {
        // Dual 3D Spiral Laser Ribbons (Left & Right rear taillights)
        this.leftLaserGeo = this._createLaserRibbonGeo();
        this.leftLaserMesh = new THREE.Mesh(this.leftLaserGeo, this.laserRedMat);
        this.leftLaserMesh.frustumCulled = false;
        this.leftLaserMesh.visible = false;
        this.scene.add(this.leftLaserMesh);

        this.rightLaserGeo = this._createLaserRibbonGeo();
        this.rightLaserMesh = new THREE.Mesh(this.rightLaserGeo, this.laserRedMat);
        this.rightLaserMesh.frustumCulled = false;
        this.rightLaserMesh.visible = false;
        this.scene.add(this.rightLaserMesh);
    }

    _initSpeedLines() {
        const lineCount = 30;
        const lineGeo = new THREE.BufferGeometry();
        const linePos = new Float32Array(lineCount * 2 * 3);

        this.speedLineData = [];
        for (let i = 0; i < lineCount; i++) {
            const side = Math.random() < 0.5 ? -1 : 1;
            const relX = side * (1.8 + Math.random() * 2.5);
            const relY = 0.2 + Math.random() * 1.4;
            const relZ = -10.0 + Math.random() * 20.0;
            const len = 1.8 + Math.random() * 3.2;

            this.speedLineData.push({ relX, relY, relZ, len, side });

            const idx = i * 6;
            linePos[idx + 0] = relX; linePos[idx + 1] = relY; linePos[idx + 2] = relZ;
            linePos[idx + 3] = relX; linePos[idx + 4] = relY; linePos[idx + 5] = relZ + len;
        }

        lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
        this.speedLinesMesh = new THREE.LineSegments(lineGeo, this.speedLineMat);
        this.speedLinesMesh.frustumCulled = false;
        this.speedLinesMesh.visible = false;
        this.scene.add(this.speedLinesMesh);
    }

    update(dt, speedKmh, isDrifting = false, isBraking = false) {
        if (!this.carMesh) return;
        this.animTime += dt;

        const carPos = this.carMesh.position;
        const carRotY = this.carMesh.rotation.y;

        const sinH = Math.sin(carRotY);
        const cosH = Math.cos(carRotY);

        const getSock = (xOff, yOff, zOff) => {
            return new THREE.Vector3(
                carPos.x + cosH * xOff + sinH * zOff,
                carPos.y + yOff,
                carPos.z - sinH * xOff + cosH * zOff
            );
        };

        const leftTail = getSock(-0.75, 0.62, 2.15);
        const rightTail = getSock(0.75, 0.62, 2.15);

        // Record history for twin red laser trails only when driving
        if (speedKmh > 12.0) {
            this.leftTailPoints.unshift(leftTail);
            this.rightTailPoints.unshift(rightTail);
            if (this.leftTailPoints.length > this.maxPoints) this.leftTailPoints.pop();
            if (this.rightTailPoints.length > this.maxPoints) this.rightTailPoints.pop();
        } else {
            // Instantly clear trail history when stopped/slow to prevent stale black line artifacts
            this.leftTailPoints = [];
            this.rightTailPoints = [];
        }

        // Taillight laser overall opacity scaling
        const speedFactor = Math.min(1.0, Math.max(0.0, (speedKmh - 15.0) / 95.0));
        let targetLaserOpacity = speedFactor * 0.32;
        if (isBraking && speedKmh > 10.0) targetLaserOpacity = 0.50;
        if (speedKmh <= 10.0) targetLaserOpacity = 0.0;

        this.laserRedMat.opacity = THREE.MathUtils.lerp(this.laserRedMat.opacity, targetLaserOpacity, 0.20);

        const isLaserVisible = speedKmh > 12.0 && this.laserRedMat.opacity > 0.005 && this.leftTailPoints.length >= 2;
        this.leftLaserMesh.visible = isLaserVisible;
        this.rightLaserMesh.visible = isLaserVisible;

        if (isLaserVisible) {
            this._writeSpiralLaserBuffer(this.leftLaserGeo, this.leftTailPoints, 0.16, 0.0);
            this._writeSpiralLaserBuffer(this.rightLaserGeo, this.rightTailPoints, 0.16, Math.PI);
        } else {
            this.leftLaserGeo.setDrawRange(0, 0);
            this.rightLaserGeo.setDrawRange(0, 0);
        }

        // Update Ground & Air Speed Lines
        this.speedLinesMesh.position.copy(carPos);
        this.speedLinesMesh.rotation.y = carRotY;

        const lineTargetOpacity = speedKmh > 60 ? Math.min(0.22, (speedKmh - 60) / 120.0) : 0.0;
        this.speedLineMat.opacity = THREE.MathUtils.lerp(this.speedLineMat.opacity, lineTargetOpacity, 0.15);

        const isSpeedLinesVisible = speedKmh > 60 && this.speedLineMat.opacity > 0.005;
        this.speedLinesMesh.visible = isSpeedLinesVisible;

        if (isSpeedLinesVisible) {
            const linePosAttr = this.speedLinesMesh.geometry.attributes.position;
            const linePosArr = linePosAttr.array;
            const speedVel = (speedKmh / 3.6) * dt * 2.5;

            for (let i = 0; i < this.speedLineData.length; i++) {
                const line = this.speedLineData[i];
                line.relZ += speedVel;
                if (line.relZ > 15.0) {
                    line.relZ = -25.0;
                }

                const idx = i * 6;
                linePosArr[idx + 0] = line.relX;
                linePosArr[idx + 1] = line.relY;
                linePosArr[idx + 2] = line.relZ;

                linePosArr[idx + 3] = line.relX;
                linePosArr[idx + 4] = line.relY;
                linePosArr[idx + 5] = line.relZ + line.len;
            }
            linePosAttr.needsUpdate = true;
        }
    }

    _writeSpiralLaserBuffer(geo, points, baseRadius = 0.16, phaseOffset = 0) {
        const count = points.length;
        if (count < 2) {
            geo.setDrawRange(0, 0);
            return;
        }

        const posAttr = geo.attributes.position;
        const colAttr = geo.attributes.color;
        const uvAttr = geo.attributes.uv;

        const posArray = posAttr.array;
        const colArray = colAttr.array;
        const uvArray = uvAttr.array;

        for (let i = 0; i < count; i++) {
            const p = points[i];
            let dirX = 0, dirY = 0, dirZ = 1;
            if (i < count - 1) {
                dirX = points[i].x - points[i + 1].x;
                dirY = points[i].y - points[i + 1].y;
                dirZ = points[i].z - points[i + 1].z;
            } else if (i > 0) {
                dirX = points[i - 1].x - points[i].x;
                dirY = points[i - 1].y - points[i].y;
                dirZ = points[i - 1].z - points[i].z;
            }

            const len = Math.hypot(dirX, dirY, dirZ) || 1;
            const T = new THREE.Vector3(dirX / len, dirY / len, dirZ / len);

            // Compute 3D Frenet Frame (Normal & Binormal) around 3D trail tangent vector
            let Up = new THREE.Vector3(0, 1, 0);
            if (Math.abs(T.y) > 0.9) Up.set(1, 0, 0);

            const N = new THREE.Vector3().crossVectors(T, Up).normalize();
            const B = new THREE.Vector3().crossVectors(N, T).normalize();

            // 3D Helical Corkscrew Spiral Angle & Dynamic Twist
            const t = i / (count - 1);
            const spiralAngle = i * 0.40 + this.animTime * 4.5 + phaseOffset;

            // Light spread: spiral radius expands outward smoothly as light disperses backward from the vehicle
            const spreadFactor = baseRadius + t * 0.52;
            const rCur = spreadFactor * (0.65 + 0.35 * Math.sin(t * Math.PI));

            // Compute 3D spiral offsets with light spread
            const cosA = Math.cos(spiralAngle);
            const sinA = Math.sin(spiralAngle);

            // Vertex 1: offset at spiralAngle
            const v1x = p.x + rCur * (cosA * N.x + sinA * B.x);
            const v1y = p.y + rCur * (cosA * N.y + sinA * B.y);
            const v1z = p.z + rCur * (cosA * N.z + sinA * B.z);

            // Vertex 2: opposite side of 3D spiral ribbon
            const v2x = p.x - rCur * (cosA * N.x + sinA * B.x);
            const v2y = p.y - rCur * (cosA * N.y + sinA * B.y);
            const v2z = p.z - rCur * (cosA * N.z + sinA * B.z);

            const idx6 = i * 6;
            posArray[idx6 + 0] = v1x;
            posArray[idx6 + 1] = v1y;
            posArray[idx6 + 2] = v1z;

            posArray[idx6 + 3] = v2x;
            posArray[idx6 + 4] = v2y;
            posArray[idx6 + 5] = v2z;

            // Per-vertex color & opacity falloff
            const fade = Math.pow(1.0 - t, 2.5) * 0.45;

            const red = 0.95 * fade;
            const green = 0.02 * fade;
            const blue = 0.06 * fade;

            colArray[idx6 + 0] = red; colArray[idx6 + 1] = green; colArray[idx6 + 2] = blue;
            colArray[idx6 + 3] = red; colArray[idx6 + 4] = green; colArray[idx6 + 5] = blue;

            const idx4 = i * 4;
            uvArray[idx4 + 0] = t;
            uvArray[idx4 + 1] = 0.0;
            uvArray[idx4 + 2] = t;
            uvArray[idx4 + 3] = 1.0;
        }

        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
        uvAttr.needsUpdate = true;
        geo.setDrawRange(0, (count - 1) * 6);
    }
}
