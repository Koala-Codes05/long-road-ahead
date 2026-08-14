import * as THREE from 'three';

/**
 * VolumetricClouds — Manages night cloud layer geometry, noise texture, and atmospheric drifting.
 */
export class VolumetricClouds {
    constructor(scene) {
        this.scene = scene;
        this.cloudDome = this._initVolumetricClouds();
    }

    _initVolumetricClouds() {
        const cloudCanvas = document.createElement('canvas');
        cloudCanvas.width = 256;
        cloudCanvas.height = 256;
        const ctx = cloudCanvas.getContext('2d');

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, 256, 256);

        for (let i = 0; i < 40; i++) {
            const x = Math.random() * 256;
            const y = Math.random() * 256;
            const r = 20 + Math.random() * 45;
            const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
            grad.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        const cloudTex = new THREE.CanvasTexture(cloudCanvas);
        cloudTex.wrapS = THREE.RepeatWrapping;
        cloudTex.wrapT = THREE.RepeatWrapping;
        cloudTex.repeat.set(3, 3);

        const geo = new THREE.SphereGeometry(350, 32, 16);
        const mat = new THREE.MeshBasicMaterial({
            map: cloudTex,
            transparent: true,
            opacity: 0.25,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        const cloudDome = new THREE.Mesh(geo, mat);
        cloudDome.position.set(0, -20, 0);
        this.scene.add(cloudDome);
        return cloudDome;
    }

    update(dt, cameraPos) {
        if (!this.cloudDome) return;
        this.cloudDome.position.x = cameraPos.x;
        this.cloudDome.position.z = cameraPos.z;
        if (this.cloudDome.material.map) {
            this.cloudDome.material.map.offset.x += dt * 0.002;
            this.cloudDome.material.map.offset.y += dt * 0.001;
        }
    }
}
