import * as THREE from 'three';

/**
 * ProceduralTextures — Canvas-based texture generators for rain droplets,
 * surface normal maps, and water ripple normal maps.
 */

/**
 * Generates a soft-core vertical drop alpha gradient texture.
 */
export function createRainDropAlphaTexture() {
    const alphaCanvas = document.createElement('canvas');
    alphaCanvas.width = 128;
    alphaCanvas.height = 256;
    const actx = alphaCanvas.getContext('2d');

    const grad = actx.createLinearGradient(64, 0, 64, 256);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.0)');
    grad.addColorStop(0.20, 'rgba(255, 255, 255, 0.6)');
    grad.addColorStop(0.50, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.80, 'rgba(255, 255, 255, 0.6)');
    grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
    actx.fillStyle = grad;
    actx.fillRect(0, 0, 128, 256);

    const texture = new THREE.CanvasTexture(alphaCanvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
}

/**
 * Generates a high-precision spherical normal map for specular highlights (N·H).
 */
export function createRainDropNormalTexture() {
    const normCanvas = document.createElement('canvas');
    normCanvas.width = 128;
    normCanvas.height = 128;
    const nctx = normCanvas.getContext('2d');
    const imgData = nctx.createImageData(128, 128);

    for (let y = 0; y < 128; y++) {
        for (let x = 0; x < 128; x++) {
            const nx = (x / 128.0) * 2.0 - 1.0;
            const ny = (y / 128.0) * 2.0 - 1.0;
            const r2 = nx * nx + ny * ny;
            let nz = 1.0;
            if (r2 < 1.0) {
                nz = Math.sqrt(1.0 - r2);
            } else {
                nz = 0.0;
            }
            const idx = (y * 128 + x) * 4;
            imgData.data[idx] = Math.round((nx * 0.5 + 0.5) * 255);
            imgData.data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
            imgData.data[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
            imgData.data[idx + 3] = 255;
        }
    }
    nctx.putImageData(imgData, 0, 0);

    const texture = new THREE.CanvasTexture(normCanvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
}

/**
 * Generates a seamless water ripple normal map for wet asphalt and puddles.
 */
export function createRippleNormalMap() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const heightField = new Float32Array(size * size);
    const ripples = [];
    for (let i = 0; i < 18; i++) {
        ripples.push({
            x: Math.random() * size,
            y: Math.random() * size,
            phase: Math.random() * Math.PI * 2,
            freq: 0.12 + Math.random() * 0.28,
            amp: 0.5 + Math.random() * 0.5,
        });
    }

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let h = 0;
            for (const r of ripples) {
                const dx = x - r.x;
                const dy = y - r.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                h += Math.sin(dist * r.freq + r.phase) * r.amp * Math.exp(-dist * 0.02);
            }
            heightField[y * size + x] = h;
        }
    }

    const imgData = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const idx = (y * size + x) * 4;
            const hL = heightField[y * size + (x > 0 ? x - 1 : x)];
            const hR = heightField[y * size + (x < size - 1 ? x + 1 : x)];
            const hD = heightField[(y > 0 ? y - 1 : y) * size + x];
            const hU = heightField[(y < size - 1 ? y + 1 : y) * size + x];
            const ddx = (hR - hL) * 0.5;
            const ddy = (hU - hD) * 0.5;
            const len = Math.sqrt(ddx * ddx + ddy * ddy + 1.0);
            imgData.data[idx] = Math.round((-ddx / len * 0.5 + 0.5) * 255);
            imgData.data[idx + 1] = Math.round((-ddy / len * 0.5 + 0.5) * 255);
            imgData.data[idx + 2] = Math.round((1.0 / len * 0.5 + 0.5) * 255);
            imgData.data[idx + 3] = 255;
        }
    }
    ctx.putImageData(imgData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 8);
    return tex;
}
