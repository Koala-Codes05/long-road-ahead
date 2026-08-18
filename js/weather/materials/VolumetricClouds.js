import * as THREE from 'three';

/**
 * VolumetricClouds — Manages dynamic cloud dome layer geometry, multi-scale noise texture, and atmospheric drifting.
 */
export class VolumetricClouds {
    constructor(scene) {
        this.scene = scene;
        this.cloudDome = this._initVolumetricClouds();
    }

    _initVolumetricClouds() {
        const cloudCanvas = document.createElement('canvas');
        cloudCanvas.width = 512;
        cloudCanvas.height = 512;
        const ctx = cloudCanvas.getContext('2d');

        ctx.fillStyle = 'rgba(0, 0, 0, 0)';
        ctx.fillRect(0, 0, 512, 512);

        // Generate organic multi-scale cloud mass texture
        for (let i = 0; i < 55; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const r = 35 + Math.random() * 75;
            const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
            grad.addColorStop(0, 'rgba(255, 255, 255, 0.40)');
            grad.addColorStop(0.4, 'rgba(180, 205, 230, 0.25)');
            grad.addColorStop(0.8, 'rgba(60, 85, 115, 0.10)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        const cloudTex = new THREE.CanvasTexture(cloudCanvas);
        cloudTex.wrapS = THREE.RepeatWrapping;
        cloudTex.wrapT = THREE.RepeatWrapping;
        cloudTex.repeat.set(2, 2);

        const geo = new THREE.SphereGeometry(360, 32, 16);
        const mat = new THREE.MeshBasicMaterial({
            map: cloudTex,
            transparent: true,
            opacity: 0.35,
            side: THREE.BackSide,
            blending: THREE.NormalBlending,
            depthWrite: false,
        });

        const cloudDome = new THREE.Mesh(geo, mat);
        cloudDome.position.set(0, -10, 0);
        this.scene.add(cloudDome);
        return cloudDome;
    }

    setWeather(type) {
        if (!this.cloudDome) return;
        const mat = this.cloudDome.material;
        if (type === 2) { // CLOUDY DAY (DAYTIME STORM)
            mat.blending = THREE.NormalBlending;
            mat.color.setHex(0x5a6d7f);
            mat.opacity = 0.55;
        } else if (type === 0) { // STORM
            mat.blending = THREE.NormalBlending;
            mat.color.setHex(0x121a26);
            mat.opacity = 0.65;
        } else if (type === 1) { // DRIZZLE
            mat.blending = THREE.NormalBlending;
            mat.color.setHex(0x1c2838);
            mat.opacity = 0.45;
        } else { // CLEAR
            mat.blending = THREE.AdditiveBlending;
            mat.color.setHex(0xffffff);
            mat.opacity = 0.15;
        }
        mat.needsUpdate = true;
    }

    update(dt, cameraPos) {
        if (!this.cloudDome) return;
        this.cloudDome.position.x = cameraPos.x;
        this.cloudDome.position.z = cameraPos.z;
        if (this.cloudDome.material.map) {
            this.cloudDome.material.map.offset.x += dt * 0.0025;
            this.cloudDome.material.map.offset.y += dt * 0.0012;
        }
    }
}

