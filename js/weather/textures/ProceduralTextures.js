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

/**
 * Generates BaseColor and Normal maps for Cement / Concrete Road Slabs.
 */
export function createCementRoadTextures() {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Base light-gray concrete slab tone
    ctx.fillStyle = '#8e9296';
    ctx.fillRect(0, 0, size, size);

    // Fine concrete speckled noise
    const imgData = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < imgData.data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 24;
        imgData.data[i] = Math.min(255, Math.max(0, imgData.data[i] + noise));
        imgData.data[i + 1] = Math.min(255, Math.max(0, imgData.data[i + 1] + noise));
        imgData.data[i + 2] = Math.min(255, Math.max(0, imgData.data[i + 2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);

    // Grid of concrete slab expansion joints (grooves)
    ctx.strokeStyle = '#3a3d40';
    ctx.lineWidth = 6;

    // Longitudinal & Transverse seams
    for (let x = 0; x <= size; x += size / 2) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke();
    }
    for (let y = 0; y <= size; y += size / 4) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
    }

    // Concrete seam sealant line highlights
    ctx.strokeStyle = '#222528';
    ctx.lineWidth = 2;
    for (let x = 0; x <= size; x += size / 2) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke();
    }
    for (let y = 0; y <= size; y += size / 4) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
    }

    const baseMap = new THREE.CanvasTexture(canvas);
    baseMap.wrapS = THREE.RepeatWrapping;
    baseMap.wrapT = THREE.RepeatWrapping;
    baseMap.colorSpace = THREE.SRGBColorSpace;

    return { baseMap };
}

/**
 * Generates BaseColor, Normal, and Puddle/Pothole noise textures for worn asphalt with potholes.
 */
export function createPotholeAsphaltTextures() {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Base dark weathered asphalt color
    ctx.fillStyle = '#26292d';
    ctx.fillRect(0, 0, size, size);

    // Asphalt aggregate grain noise
    const imgData = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < imgData.data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 32;
        imgData.data[i] = Math.min(255, Math.max(0, imgData.data[i] + noise));
        imgData.data[i + 1] = Math.min(255, Math.max(0, imgData.data[i + 1] + noise));
        imgData.data[i + 2] = Math.min(255, Math.max(0, imgData.data[i + 2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);

    // Draw irregular Potholes & Cracks
    const potholes = [
        { x: 140, y: 180, rx: 55, ry: 40, angle: 0.3 },
        { x: 380, y: 320, rx: 70, ry: 50, angle: -0.4 },
        { x: 260, y: 410, rx: 45, ry: 35, angle: 0.1 },
    ];

    potholes.forEach(p => {
        // Jagged outer broken asphalt rim (dark exposed aggregate & water ring)
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);

        ctx.fillStyle = '#111315'; // Dark recessed pit bottom
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 2; a += 0.2) {
            const radX = p.rx + (Math.random() - 0.5) * 16;
            const radY = p.ry + (Math.random() - 0.5) * 14;
            const px = Math.cos(a) * radX;
            const py = Math.sin(a) * radY;
            if (a === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();

        // Inner water puddle reflection zone inside pothole
        ctx.fillStyle = '#080a0c';
        ctx.beginPath();
        ctx.ellipse(0, 0, p.rx * 0.7, p.ry * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();

        // Cracks branching out from pothole
        ctx.strokeStyle = '#181b1e';
        ctx.lineWidth = 3;
        for (let c = 0; c < 4; c++) {
            let cx = Math.cos((c / 4) * Math.PI * 2) * p.rx;
            let cy = Math.sin((c / 4) * Math.PI * 2) * p.ry;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            for (let step = 0; step < 4; step++) {
                cx += (Math.random() - 0.5) * 30;
                cy += (Math.random() - 0.5) * 30;
                ctx.lineTo(cx, cy);
            }
            ctx.stroke();
        }

        ctx.restore();
    });

    const baseMap = new THREE.CanvasTexture(canvas);
    baseMap.wrapS = THREE.RepeatWrapping;
    baseMap.wrapT = THREE.RepeatWrapping;
    baseMap.colorSpace = THREE.SRGBColorSpace;

    return { baseMap };
}

/**
 * Generates tile pattern BaseColor map for concrete sidewalks and curbs.
 */
export function createSidewalkTileTexture() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Concrete pavement base
    ctx.fillStyle = '#9aa0a6';
    ctx.fillRect(0, 0, size, size);

    // Speckled concrete texture
    const imgData = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < imgData.data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 20;
        imgData.data[i] = Math.min(255, Math.max(0, imgData.data[i] + noise));
        imgData.data[i + 1] = Math.min(255, Math.max(0, imgData.data[i + 1] + noise));
        imgData.data[i + 2] = Math.min(255, Math.max(0, imgData.data[i + 2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);

    // Sidewalk paving tile grooves (50cm x 50cm square tiles)
    ctx.strokeStyle = '#52565c';
    ctx.lineWidth = 4;
    for (let x = 0; x <= size; x += size / 4) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke();
    }
    for (let y = 0; y <= size; y += size / 4) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
    }

    // Concrete curb edge bevel highlight on outer edge
    ctx.fillStyle = '#b6bcc4';
    ctx.fillRect(0, 0, size, 12);
    ctx.fillStyle = '#484b50';
    ctx.fillRect(0, 12, size, 4);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

