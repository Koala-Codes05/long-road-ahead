/**
 * Raindrops — Ported directly from Lucas Bebber (rauschermate/react-weather-effects)
 * Dynamic 2D canvas physics simulation for glass water droplets:
 *  - Radial Wind Outward Physics (high speed blows droplets UP, LEFT, RIGHT, & OUTWARD from center)
 *  - Full windshield coverage spawn (top, center, left, right)
 *  - Gravity creeping when slow
 *  - Droplet collision & merging physics
 *  - Water trail leaving & wiping/cleaning radius
 */

function createCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

function random(min, max, func) {
    if (max == null) {
        max = min;
        min = 0;
    }
    if (func == null) {
        func = (n) => n;
    }
    return min + func(Math.random()) * (max - min);
}

function chance(c) {
    return Math.random() < c;
}

function times(n, func) {
    for (let i = 0; i < n; i++) {
        func(i);
    }
}

const dropSize = 64;
const Drop = {
    x: 0, y: 0, r: 0,
    spreadX: 0, spreadY: 0,
    momentum: 0, momentumX: 0,
    lastSpawn: 0, nextSpawn: 0,
    parent: null, isNew: true, killed: false, shrink: 0,
};

const defaultOptions = {
    minR: 2.0,
    maxR: 18.0,
    maxDrops: 380,
    rainChance: 0.50,
    rainLimit: 7,
    dropletsRate: 42,
    dropletsSize: [0.8, 3.6],
    dropletsCleaningRadiusMultiplier: 0.65,
    raining: true,
    globalTimeScale: 1,
    trailRate: 0.65,
    autoShrink: true,
    spawnArea: [0.0, 1.0],
    windSpread: 0.8,
    trailScaleRange: [0.22, 0.48],
    collisionRadius: 0.72,
    collisionRadiusIncrease: 0.02,
    dropFallMultiplier: 1,
    collisionBoostMultiplier: 0.08,
    collisionBoost: 1.5,
    rainMode: 'hybrid',
};

export class Raindrops {
    constructor(width, height, scale, dropAlpha, dropColor, options = {}) {
        this.width = width;
        this.height = height;
        this.scale = scale;
        this.dropAlpha = dropAlpha;
        this.dropColor = dropColor;
        this.options = Object.assign({}, defaultOptions, options);
        this.dropletsPixelDensity = 1;
        this.dropletsCounter = 0;
        this.textureCleaningIterations = 0;
        this.timeouts = [];
        this.init();
    }

    init() {
        this.canvas = createCanvas(this.width, this.height);
        this.ctx = this.canvas.getContext('2d');

        this.droplets = createCanvas(this.width * this.dropletsPixelDensity, this.height * this.dropletsPixelDensity);
        this.dropletsCtx = this.droplets.getContext('2d');

        this.drops = [];
        this.dropsGfx = [];

        this.renderDropsGfx();
        this.update();
    }

    get deltaR() {
        return this.options.maxR - this.options.minR;
    }

    get area() {
        return (this.width * this.height) / this.scale;
    }

    get areaMultiplier() {
        return Math.sqrt(this.area / (1024 * 768));
    }

    drawDroplet(x, y, r) {
        this.drawDrop(this.dropletsCtx, Object.assign(Object.create(Drop), {
            x: x * this.dropletsPixelDensity,
            y: y * this.dropletsPixelDensity,
            r: r * this.dropletsPixelDensity,
        }));
    }

    renderDropsGfx() {
        const dropBuffer = createCanvas(dropSize, dropSize);
        const dropBufferCtx = dropBuffer.getContext('2d');

        this.dropsGfx = Array.apply(null, Array(255)).map((cur, i) => {
            const drop = createCanvas(dropSize, dropSize);
            const dropCtx = drop.getContext('2d');

            dropBufferCtx.clearRect(0, 0, dropSize, dropSize);

            // Color normal map
            dropBufferCtx.globalCompositeOperation = 'source-over';
            dropBufferCtx.drawImage(this.dropColor, 0, 0, dropSize, dropSize);

            // Depth in blue channel
            dropBufferCtx.globalCompositeOperation = 'screen';
            dropBufferCtx.fillStyle = `rgba(0,0,${i},1)`;
            dropBufferCtx.fillRect(0, 0, dropSize, dropSize);

            // Alpha shape mask
            dropCtx.globalCompositeOperation = 'source-over';
            dropCtx.drawImage(this.dropAlpha, 0, 0, dropSize, dropSize);

            dropCtx.globalCompositeOperation = 'source-in';
            dropCtx.drawImage(dropBuffer, 0, 0, dropSize, dropSize);
            return drop;
        });

        // Circle brush to clear droplets in path
        this.clearDropletsGfx = createCanvas(128, 128);
        const clearDropletsCtx = this.clearDropletsGfx.getContext('2d');
        clearDropletsCtx.fillStyle = '#000';
        clearDropletsCtx.beginPath();
        clearDropletsCtx.arc(64, 64, 64, 0, Math.PI * 2);
        clearDropletsCtx.fill();
    }

    drawDrop(ctx, drop) {
        if (this.dropsGfx.length > 0) {
            const x = drop.x;
            const y = drop.y;
            const r = drop.r;
            const vx = drop.vx || 0;
            const vy = drop.vy || 0.1;

            const speedMag = Math.sqrt(vx * vx + vy * vy);

            let angle = Math.PI / 2;
            let stretch = 1.0;
            let compress = 1.0;

            // Aerodynamic liquid streak elongation when moving
            if (speedMag > 0.08) {
                angle = Math.atan2(vy, vx);
                stretch = 1.0 + Math.min(2.5, (speedMag - 0.08) * 0.55);
                compress = 1.0 / Math.sqrt(stretch); // Liquid volume preservation
            }

            let d = Math.max(0, Math.min(1, ((r - this.options.minR) / (this.deltaR)) * 0.9));
            d *= 1 / (((stretch + compress) * 0.5));

            ctx.save();
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
            ctx.translate(x * this.scale, y * this.scale);
            ctx.rotate(angle - Math.PI / 2); // Orient drop along movement vector
            ctx.scale(compress, stretch);

            d = Math.floor(d * (this.dropsGfx.length - 1));
            d = Math.max(0, Math.min(this.dropsGfx.length - 1, d));

            const rw = r * this.scale;
            // Perfectly round 1:1 ratio liquid droplet canvas quad
            ctx.drawImage(
                this.dropsGfx[d],
                -rw,
                -rw,
                rw * 2,
                rw * 2,
            );
            ctx.restore();
        }
    }

    clearDroplets(x, y, r = 30) {
        const ctx = this.dropletsCtx;
        ctx.globalCompositeOperation = 'destination-out';
        ctx.drawImage(
            this.clearDropletsGfx,
            (x - r) * this.dropletsPixelDensity * this.scale,
            (y - r) * this.dropletsPixelDensity * this.scale,
            (r * 2) * this.dropletsPixelDensity * this.scale,
            (r * 2) * this.dropletsPixelDensity * this.scale * 1.5,
        );
    }

    clearWiperArc(pivotX, pivotY, startAngle, endAngle, innerR, outerR) {
        // 1. Clear static micro droplets canvas along the swept triangular swath
        const ctx = this.dropletsCtx;
        const scale = this.dropletsPixelDensity * this.scale;

        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(pivotX * scale, pivotY * scale, outerR * scale, startAngle, endAngle, false);
        ctx.arc(pivotX * scale, pivotY * scale, innerR * scale, endAngle, startAngle, true);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // 2. Clear dynamic water drops within the wiper sweep swath
        let minA = Math.min(startAngle, endAngle);
        let maxA = Math.max(startAngle, endAngle);

        this.drops.forEach((drop) => {
            if (drop.killed) return;
            const dx = drop.x - pivotX;
            const dy = drop.y - pivotY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist >= innerR && dist <= outerR) {
                let angle = Math.atan2(dy, dx);
                if (angle < minA - 0.1) angle += Math.PI * 2;
                if (angle >= minA - 0.1 && angle <= maxA + 0.1) {
                    drop.killed = true;
                }
            }
        });
    }

    clearCanvas() {
        this.ctx.clearRect(0, 0, this.width, this.height);
    }

    createDrop(options) {
        if (this.drops.length >= this.options.maxDrops * this.areaMultiplier) return null;
        return Object.assign(Object.create(Drop), options);
    }

    clearDrops() {
        this.drops = [];
        if (this.dropletsCtx) {
            this.dropletsCtx.clearRect(0, 0, this.droplets.width, this.droplets.height);
        }
        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.width, this.height);
        }
        this.textureCleaningIterations = 0;
    }

    clearTexture() {
        this.textureCleaningIterations = 50;
    }

    clean() {
        this.timeouts.forEach(clearTimeout);
        this.timeouts = [];
    }

    updateDroplets(timeScale) {
        if (this.options.dropletsRate <= 0) return;

        this.dropletsCounter += this.options.dropletsRate * timeScale * this.areaMultiplier;

        const maxDroplets = this.options.maxDrops * this.areaMultiplier * 6;
        while (this.dropletsCounter > 1) {
            this.dropletsCounter--;
            const count = random(1, 3);
            const baseR = random(...this.options.dropletsSize);
            const x = random(0, this.width / this.scale);
            const y = random(0, this.height / this.scale);

            for (let i = 0; i < count; i++) {
                this.drawDroplet(
                    x + random(-15, 15),
                    y + random(-15, 15),
                    baseR * random(0.5, 1.2),
                );
            }
        }
    }

    updateRain(timeScale) {
        if (!this.options.raining) return [];

        const rainDrops = [];
        const limit = (this.options.rainLimit || 4) * timeScale * this.areaMultiplier;
        let count = 0;

        while (chance(this.options.rainChance * timeScale * this.areaMultiplier) && count < limit) {
            count++;
            const spawnX = random(0, this.width / this.scale);
            const spawnY = random(...this.options.spawnArea) * (this.height / this.scale);
            const r = random(this.options.minR, this.options.maxR);

            // Per-droplet Surface Tension / Adhesion factor (small drops = high adhesion, large = lower)
            const relR = (r - this.options.minR) / Math.max(1, this.options.maxR - this.options.minR);
            const baseAdhesion = 1.0 - (relR * 0.7);
            const adhesion = Math.min(0.98, Math.max(0.15, baseAdhesion + random(-0.15, 0.15)));

            const rainDrop = this.createDrop({
                x: spawnX,
                y: spawnY,
                r: r,
                adhesion: adhesion,
                momentum: random(1, 4),
                momentumX: 0,
                shrink: 0,
                isNew: true,
            });
            if (rainDrop != null) {
                rainDrops.push(rainDrop);
            }
        }
        return rainDrops;
    }

    drawDroplets() {
        this.ctx.drawImage(this.droplets, 0, 0, this.width, this.height);
    }

    updateDrops(timeScale) {
        let newDrops = [];

        this.updateDroplets(timeScale);
        const rainDrops = this.updateRain(timeScale);
        newDrops = newDrops.concat(rainDrops);

        this.drops.sort((a, b) => {
            const va = (a.y * (this.width / this.scale)) + a.x;
            const vb = (b.y * (this.width / this.scale)) + b.x;
            return va > vb ? 1 : va === vb ? 0 : -1;
        });

        // Wind Center of Screen (Windshield/Camera focal point)
        const cx = (this.width / this.scale) * 0.5;
        const cy = (this.height / this.scale) * 0.45;
        const speedRatio = this.options.speedRatio || 0.0;
        const steerAngle = this.options.steerAngle || 0.0;
        const ambientWind = this.options.ambientWind || { x: 0, y: 0 };

        this.drops.forEach((drop, i) => {
            if (!drop.killed) {
                if (chance((drop.r - (this.options.minR * this.options.dropFallMultiplier)) * (0.1 / this.deltaR) * timeScale)) {
                    drop.momentum += random((drop.r / this.options.maxR) * 4);
                }
                if (this.options.autoShrink && drop.r <= this.options.minR && chance(0.05 * timeScale)) {
                    drop.shrink += 0.01;
                }

                drop.r -= drop.shrink * timeScale;
                if (drop.r <= 0) drop.killed = true;

                if (this.options.raining && speedRatio > 0.15) {
                    // Enhanced trailing when driving fast so drops leave visible wet streaks
                    const trailSpeedBonus = speedRatio * 5.0;
                    drop.lastSpawn += (drop.momentum + trailSpeedBonus) * timeScale * this.options.trailRate;

                    if (drop.lastSpawn > drop.nextSpawn) {
                        const trailDrop = this.createDrop({
                            x: drop.x + (random(-drop.r, drop.r) * 0.1),
                            y: drop.y - (drop.r * 0.01),
                            r: drop.r * random(...this.options.trailScaleRange),
                            adhesion: Math.min(0.95, (drop.adhesion || 0.5) + 0.2), // Micro trails have high adhesion
                            parent: drop,
                        });

                        if (trailDrop != null) {
                            newDrops.push(trailDrop);
                            drop.r *= Math.pow(0.985, timeScale);
                            drop.lastSpawn = 0;
                            drop.nextSpawn = random(this.options.minR, this.options.maxR) - (drop.momentum * 2 * this.options.trailRate) + (this.options.maxR - drop.r);
                        }
                    }
                }

                // HIGH-SPEED DRIVECLUB RADIAL WIND & AERODYNAMIC AIRFLOW MODEL
                const dx = (drop.x - cx) / cx;
                const dy = (drop.y - cy) / cy;
                const distFromCenter = Math.max(0.08, Math.sqrt(dx * dx + dy * dy));

                // 1. Gravity fall when stopped / slow:
                const gravityFall = (0.4 + (drop.r / this.options.maxR) * 1.5 + drop.momentum * 0.35) * Math.max(0.05, 1.0 - speedRatio * 0.90);

                // 2. High-Speed Radial Airflow: blows drops violently OUTWARD from screen center
                // At 200 km/h (speedRatio ~ 1.0-1.4), radial airflow speed reaches 25-45 px/frame!
                const airflowPower = (speedRatio > 0.05) ? ((speedRatio * 18.0) + Math.pow(speedRatio, 1.8) * 14.0) : 0.0;
                const steerShift = steerAngle * speedRatio * 12.0;

                const windX = (dx / distFromCenter) * airflowPower + steerShift + ambientWind.x * (2.0 + speedRatio * 3.0);
                const windY = (dy / distFromCenter) * airflowPower + ambientWind.y * 2.0;

                const moveX = (windX + drop.momentumX) * timeScale * this.options.globalTimeScale;
                const moveY = (gravityFall + windY) * timeScale * this.options.globalTimeScale;

                drop.x += moveX;
                drop.y += moveY;

                drop.vx = moveX;
                drop.vy = moveY;

                const speedMag = Math.sqrt(moveX * moveX + moveY * moveY);

                // High-speed wind detachment for large drops
                if (speedRatio > 0.70 && drop.r > this.options.minR * 1.8) {
                    if (Math.random() < (speedRatio - 0.70) * 0.08 * timeScale) {
                        drop.killed = true;
                    }
                }

                // Despawn when droplet physically travels past screen edge boundaries
                if (
                    drop.y > (this.height / this.scale) + drop.r + 30 ||
                    drop.y < -drop.r - 30 ||
                    drop.x < -drop.r - 30 ||
                    drop.x > (this.width / this.scale) + drop.r + 30
                ) {
                    drop.killed = true;
                }

                const checkCollision = !drop.killed;
                drop.isNew = false;

                if (checkCollision) {
                    const maxCheck = Math.min(i + 50, this.drops.length);
                    for (let j = i + 1; j < maxCheck; j++) {
                        const drop2 = this.drops[j];
                        if (
                            drop !== drop2 &&
                            drop.r > drop2.r &&
                            drop.parent !== drop2 &&
                            drop2.parent !== drop &&
                            !drop2.killed
                        ) {
                            const cdx = drop2.x - drop.x;
                            const cdy = drop2.y - drop.y;
                            const d = Math.sqrt((cdx * cdx) + (cdy * cdy));
                            const collisionThreshold = (drop.r + drop2.r) * (this.options.collisionRadius + (speedMag * 0.05) + (speedRatio * 0.15));
                            if (d < collisionThreshold) {
                                const pi = Math.PI;
                                const r1 = drop.r;
                                const r2 = drop2.r;
                                const a1 = pi * (r1 * r1);
                                const a2 = pi * (r2 * r2);
                                let targetR = Math.sqrt((a1 + (a2 * 0.85)) / pi);
                                if (targetR > this.options.maxR) targetR = this.options.maxR;

                                drop.r = targetR;
                                drop.adhesion = Math.max(0.15, drop.adhesion * 0.85); // Merged larger drop lowers adhesion
                                drop.momentumX += cdx * 0.15;
                                drop2.killed = true;
                                drop.momentum = Math.min(60, drop.momentum + (targetR * 0.1) + 2.5 + speedRatio * 5.0);
                            }
                        }
                    }
                }

                drop.momentum -= Math.max(1, (this.options.minR * 0.5) - drop.momentum) * 0.1 * timeScale;
                if (drop.momentum < 0) drop.momentum = 0;
                drop.momentumX *= Math.pow(0.7, timeScale);

                if (!drop.killed) {
                    newDrops.push(drop);
                    if (speedMag > 0.05 && this.options.dropletsRate > 0) {
                        this.clearDroplets(drop.x, drop.y, drop.r * (this.options.dropletsCleaningRadiusMultiplier || 1.4));
                    }
                    this.drawDrop(this.ctx, drop);
                }
            }
        });

        this.drops = newDrops;
    }

    update(deltaT = null) {
        this.clearCanvas();

        let timeScale = 1.0;
        if (deltaT !== null) {
            timeScale = (deltaT / (1 / 60)) * this.options.globalTimeScale;
            timeScale = Math.min(Math.max(timeScale, 0.1), 2.0);
        } else {
            const now = Date.now();
            if (this.lastRender == null) this.lastRender = now;
            const dtMs = now - this.lastRender;
            timeScale = (dtMs / ((1 / 60) * 1000)) * this.options.globalTimeScale;
            timeScale = Math.min(Math.max(timeScale, 0.1), 2.0);
            this.lastRender = now;
        }

        this.updateDrops(timeScale);
    }
}

