import * as THREE from 'three';

/**
 * CloudSystem — Volumetric Drifting Night Cloud Layer
 * Features:
 *  - Procedural multi-puff radial noise cloud texture
 *  - Floating upper sky cloud plane array (y: 35..65)
 *  - Atmospheric drift & endless scrolling tracking player position
 *  - Additive blending for subtle moonlight & sodium reflection highlights
 */
export class CloudSystem {
    constructor(scene) {
        this.scene = scene;
        this.cloudsGroup = new THREE.Group();
        this.scene.add(this.cloudsGroup);

        this.cloudCount = 35;
        this.clouds = [];

        this._createClouds();
    }

    _createCloudTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, 256, 256);

        const drawPuff = (x, y, r, opacity) => {
            const g = ctx.createRadialGradient(x, y, r * 0.08, x, y, r);
            g.addColorStop(0.0, `rgba(170, 195, 225, ${opacity * 0.45})`);
            g.addColorStop(0.3, `rgba(75, 100, 135, ${opacity * 0.28})`);
            g.addColorStop(0.7, `rgba(25, 38, 58, ${opacity * 0.14})`);
            g.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        };

        // Combine soft puff circles to create volumetric night cloud cluster
        drawPuff(128, 128, 90, 1.0);
        drawPuff(90, 140, 70, 0.85);
        drawPuff(165, 135, 75, 0.88);
        drawPuff(110, 100, 65, 0.78);
        drawPuff(150, 105, 60, 0.72);

        return new THREE.CanvasTexture(canvas);
    }

    _createClouds() {
        const cloudTexture = this._createCloudTexture();
        const cloudGeo = new THREE.PlaneGeometry(140, 70);

        for (let i = 0; i < this.cloudCount; i++) {
            const cloudMat = new THREE.MeshBasicMaterial({
                map: cloudTexture,
                transparent: true,
                opacity: 0.25 + Math.random() * 0.25,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide,
            });

            const mesh = new THREE.Mesh(cloudGeo, cloudMat);
            const x = (Math.random() - 0.5) * 400;
            const y = 35 + Math.random() * 30;
            const z = (Math.random() - 0.5) * 700;

            mesh.position.set(x, y, z);
            mesh.rotation.x = Math.PI / 2; // Upper atmosphere orientation
            mesh.rotation.z = Math.random() * Math.PI * 2;
            const scale = 0.8 + Math.random() * 1.5;
            mesh.scale.set(scale, scale, 1);

            this.cloudsGroup.add(mesh);
            const baseOpacity = 0.25 + Math.random() * 0.25;
            this.clouds.push({
                mesh: mesh,
                baseOpacity: baseOpacity,
                speed: 0.4 + Math.random() * 1.2,
                rotSpeed: (Math.random() - 0.5) * 0.015,
            });
        }
    }

    setWeather(type) {
        const isDaytime = (type === 2); // 2 = CLOUDY DAY (DAYTIME STORM)
        this.clouds.forEach(cloud => {
            const mat = cloud.mesh.material;
            if (isDaytime) {
                mat.blending = THREE.NormalBlending;
                mat.color.setHex(0x9eb2c6);
                mat.opacity = Math.min(0.88, cloud.baseOpacity * 2.5);
            } else {
                mat.blending = THREE.AdditiveBlending;
                mat.color.setHex(0xffffff);
                mat.opacity = cloud.baseOpacity;
            }
            mat.needsUpdate = true;
        });
    }

    update(dt, carPos) {
        this.clouds.forEach(cloud => {
            // Atmospheric drift
            cloud.mesh.position.z += cloud.speed * dt * 5.0;
            cloud.mesh.rotation.z += cloud.rotSpeed * dt;

            // Endless scrolling cloud loop tracking player vehicle position
            if (cloud.mesh.position.z > carPos.z + 200) {
                cloud.mesh.position.z = carPos.z - 500;
                cloud.mesh.position.x = carPos.x + (Math.random() - 0.5) * 400;
            }
        });
    }
}
