import * as THREE from 'three';

/**
 * CloudSystem — Multi-Layered Volumetric Drifting Cloud Layer
 * Features:
 *  - Procedural multi-puff texture with dark underbellies & silver rim highlights
 *  - 3 altitude decks (Low storm y:28..45, Mid stratus y:45..70, High cirrus y:70..105)
 *  - Endless scrolling tracking player vehicle position with parallax drift
 *  - Weather preset color/opacity/blending transitions
 */
export class CloudSystem {
    constructor(scene) {
        this.scene = scene;
        this.cloudsGroup = new THREE.Group();
        this.scene.add(this.cloudsGroup);

        this.cloudCount = 65;
        this.clouds = [];

        this._createClouds();
    }

    _createCloudTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, 512, 512);

        const drawPuff = (x, y, r, opacity, darkCore = false) => {
            const g = ctx.createRadialGradient(x, y, r * 0.05, x, y, r);
            if (darkCore) {
                g.addColorStop(0.0, `rgba(25, 36, 52, ${opacity * 0.85})`);
                g.addColorStop(0.35, `rgba(60, 85, 115, ${opacity * 0.55})`);
                g.addColorStop(0.75, `rgba(130, 160, 195, ${opacity * 0.25})`);
                g.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
            } else {
                g.addColorStop(0.0, `rgba(210, 230, 255, ${opacity * 0.70})`);
                g.addColorStop(0.3, `rgba(110, 140, 175, ${opacity * 0.45})`);
                g.addColorStop(0.7, `rgba(40, 60, 85, ${opacity * 0.20})`);
                g.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
            }
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        };

        // Dark cloud undersides & core mass
        drawPuff(256, 280, 160, 0.9, true);
        drawPuff(180, 310, 130, 0.85, true);
        drawPuff(330, 290, 140, 0.88, true);
        drawPuff(220, 230, 120, 0.8, true);

        // Lighter top puff highlights & silver edges
        drawPuff(256, 220, 150, 0.9, false);
        drawPuff(170, 200, 120, 0.85, false);
        drawPuff(340, 210, 130, 0.85, false);
        drawPuff(210, 160, 110, 0.75, false);
        drawPuff(300, 170, 105, 0.75, false);

        // Broad atmospheric wisps
        drawPuff(120, 260, 100, 0.6, false);
        drawPuff(390, 250, 110, 0.6, false);

        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        return tex;
    }

    _createClouds() {
        const cloudTexture = this._createCloudTexture();
        const cloudGeo = new THREE.PlaneGeometry(160, 85);

        for (let i = 0; i < this.cloudCount; i++) {
            // Determine altitude deck: 40% low, 40% mid, 20% high
            let y, scale, speed, baseOpacity;
            const rand = Math.random();

            if (rand < 0.4) {
                // Low heavy storm layer
                y = 28 + Math.random() * 18;
                scale = 1.2 + Math.random() * 1.5;
                speed = 1.2 + Math.random() * 2.0;
                baseOpacity = 0.35 + Math.random() * 0.30;
            } else if (rand < 0.8) {
                // Mid stratus deck
                y = 46 + Math.random() * 24;
                scale = 2.0 + Math.random() * 2.2;
                speed = 0.6 + Math.random() * 1.2;
                baseOpacity = 0.25 + Math.random() * 0.25;
            } else {
                // High atmospheric Deck
                y = 70 + Math.random() * 35;
                scale = 3.5 + Math.random() * 3.0;
                speed = 0.3 + Math.random() * 0.6;
                baseOpacity = 0.18 + Math.random() * 0.20;
            }

            const cloudMat = new THREE.MeshBasicMaterial({
                map: cloudTexture,
                transparent: true,
                opacity: baseOpacity,
                depthWrite: false,
                blending: THREE.NormalBlending,
                side: THREE.DoubleSide,
            });

            const mesh = new THREE.Mesh(cloudGeo, cloudMat);
            const x = (Math.random() - 0.5) * 800;
            const z = (Math.random() - 0.5) * 900;

            mesh.position.set(x, y, z);
            mesh.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.2; // Slight tilt
            mesh.rotation.z = Math.random() * Math.PI * 2;
            mesh.scale.set(scale, scale, 1);

            this.cloudsGroup.add(mesh);

            this.clouds.push({
                mesh: mesh,
                baseOpacity: baseOpacity,
                speed: speed,
                rotSpeed: (Math.random() - 0.5) * 0.012,
                driftX: (Math.random() - 0.5) * 0.4,
            });
        }
    }

    setWeather(type) {
        const isCloudyDay = (type === 2); // 2 = CLOUDY DAY (DAYTIME STORM)
        const isStorm = (type === 0);     // 0 = HEAVY STORM
        const isDrizzle = (type === 1);   // 1 = DRIZZLE

        this.clouds.forEach(cloud => {
            const mat = cloud.mesh.material;
            if (isCloudyDay) {
                mat.blending = THREE.NormalBlending;
                mat.color.setHex(0x6e8296);
                mat.opacity = Math.min(0.88, cloud.baseOpacity * 2.4);
            } else if (isStorm) {
                mat.blending = THREE.NormalBlending;
                mat.color.setHex(0x1e2a3a);
                mat.opacity = Math.min(0.92, cloud.baseOpacity * 2.8);
            } else if (isDrizzle) {
                mat.blending = THREE.NormalBlending;
                mat.color.setHex(0x2d3e52);
                mat.opacity = Math.min(0.75, cloud.baseOpacity * 1.8);
            } else { // CLEAR
                mat.blending = THREE.AdditiveBlending;
                mat.color.setHex(0xffffff);
                mat.opacity = cloud.baseOpacity * 0.8;
            }
            mat.needsUpdate = true;
        });
    }

    update(dt, carPos) {
        this.clouds.forEach(cloud => {
            // Atmospheric wind drift
            cloud.mesh.position.z += cloud.speed * dt * 5.0;
            cloud.mesh.position.x += cloud.driftX * dt * 3.0;
            cloud.mesh.rotation.z += cloud.rotSpeed * dt;

            // Endless scrolling cloud loop around player vehicle
            if (cloud.mesh.position.z > carPos.z + 250) {
                cloud.mesh.position.z = carPos.z - 650;
                cloud.mesh.position.x = carPos.x + (Math.random() - 0.5) * 800;
            } else if (cloud.mesh.position.z < carPos.z - 650) {
                cloud.mesh.position.z = carPos.z + 250;
            }
        });
    }
}

