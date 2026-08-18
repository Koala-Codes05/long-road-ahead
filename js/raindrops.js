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
    age: 0,
    lastSpawn: 0, nextSpawn: 0,
    parent: null, isNew: true, killed: false, shrink: 0,
};

const defaultOptions = {
    minR: 3.5,
    maxR: 15.0,
    maxDrops: 450,
    rainChance: 0.35,
    rainLimit: 4,
    dropletsRate: 35,
    dropletsSize: [0.5, 1.8],
    dropletsCleaningRadiusMultiplier: 0.43,
    raining: true,
    globalTimeScale: 1,
    trailRate: 1,
    autoShrink: true,
    spawnArea: [0.0, 1.0], // Full windshield coverage
    windSpread: 0.0,
    trailScaleRange: [0.2, 0.5],
    collisionRadius: 0.65,
    collisionRadiusIncrease: 0.01,
    dropFallMultiplier: 1,
    collisionBoostMultiplier: 0.05,
    collisionBoost: 1,
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
        this.init();
    }

    init() {
        this.canvas = createCanvas(this.width, this.height);
        this.ctx = this.canvas.getContext('2d');

        this.droplets = createCanvas(this.width * this.dropletsPixelDensity, this.height * this.dropletsPixelDensity);
        this.dropletsCtx = this.droplets.getContext('2d');

        this.drops = [];
        this.dropsGfx = [];
        this.blurredDropsGfx = [];

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

        this.blurredDropsGfx = [
            this.dropsGfx,
            this.renderBlurredDropsGfx(0.9),
            this.renderBlurredDropsGfx(1.7),
            this.renderBlurredDropsGfx(2.4),
        ];

        // Circle brush to clear droplets in path
        this.clearDropletsGfx = createCanvas(128, 128);
        const clearDropletsCtx = this.clearDropletsGfx.getContext('2d');
        clearDropletsCtx.fillStyle = '#000';
        clearDropletsCtx.beginPath();
        clearDropletsCtx.arc(64, 64, 64, 0, Math.PI * 2);
        clearDropletsCtx.fill();
    }

    renderBlurredDropsGfx(blurAmount) {
        return this.dropsGfx.map((sourceDrop) => {
            const drop = createCanvas(dropSize, dropSize);
            const dropCtx = drop.getContext('2d');

            dropCtx.filter = `blur(${blurAmount}px)`;
            dropCtx.drawImage(sourceDrop, 0, 0, dropSize, dropSize);
            dropCtx.filter = 'none';
            return drop;
        });
    }

    drawDrop(ctx, drop) {
        if (this.dropsGfx.length > 0) {
            const x = drop.x;
            const y = drop.y;
            const r = drop.r;
            const oldDropAmount = Math.max(0, Math.min(1, ((drop.age || 0) - 2.0) / 1.5));
            const spreadX = drop.spreadX * (1 - oldDropAmount * 0.8);
            const spreadY = drop.spreadY * (1 - oldDropAmount * 0.9);

            const scaleX = 1;
            const scaleY = 1.5 - oldDropAmount * 0.5;

            let d = Math.max(0, Math.min(1, ((r - this.options.minR) / (this.deltaR)) * 0.9));
            d *= 1 / (((drop.spreadX + drop.spreadY) * 0.5) + 1);

            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';

            d = Math.floor(d * (this.dropsGfx.length - 1));
            const blurLevel = Math.min(this.blurredDropsGfx.length - 1, Math.floor(oldDropAmount * 3));
            const dropGfx = this.blurredDropsGfx[blurLevel][d];
            ctx.drawImage(
                dropGfx,
                (x - (r * scaleX * (spreadX + 1))) * this.scale,
                (y - (r * scaleY * (spreadY + 1))) * this.scale,
                (r * 2 * scaleX * (spreadX + 1)) * this.scale,
                (r * 2 * scaleY * (spreadY + 1)) * this.scale,
            );
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

    clearCanvas() {
        this.ctx.clearRect(0, 0, this.width, this.height);
    }

    createDrop(options) {
        if (this.drops.length >= this.options.maxDrops * this.areaMultiplier) return null;
        return Object.assign(Object.create(Drop), options);
    }

    updateRain(timeScale) {
        const rainDrops = [];
        if (this.options.raining) {
            const limit = this.options.rainLimit * timeScale * this.areaMultiplier;
            let count = 0;
            while (chance(this.options.rainChance * timeScale * this.areaMultiplier) && count < limit) {
                count++;
                const r = random(this.options.minR, this.options.maxR, (n) => Math.pow(n, 3));
                const rainDrop = this.createDrop({
                    x: random(this.width / this.scale),
                    y: random((this.height / this.scale) * this.options.spawnArea[0], (this.height / this.scale) * this.options.spawnArea[1]),
                    r: r,
                    momentum: 1 + ((r - this.options.minR) * 0.1) + random(2),
                    spreadX: 1.5,
                    spreadY: 1.5,
                });
                if (rainDrop != null) {
                    rainDrops.push(rainDrop);
                }
            }
        }
        return rainDrops;
    }

    updateDroplets(timeScale) {
        if (this.options.raining) {
            this.dropletsCounter += this.options.dropletsRate * timeScale * this.areaMultiplier;
            times(this.dropletsCounter, () => {
                this.dropletsCounter--;
                this.drawDroplet(
                    random(this.width / this.scale),
                    random(this.height / this.scale),
                    random(...this.options.dropletsSize, (n) => n * n),
                );
            });
        }
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

        // Wind Center of Screen
        const cx = (this.width / this.scale) * 0.5;
        const cy = (this.height / this.scale) * 0.45;
        const windFactor = Math.min(2.5, this.options.windSpread || 0.0);

        this.drops.forEach((drop, i) => {
            if (!drop.killed) {
                // Evaporate / shrink droplets over time so water spot buildup clears dynamically
                drop.age += timeScale / 60;
                if (this.options.autoShrink) {
                    const ageDecay = Math.max(0, drop.age - 1.2) * 0.035;
                    drop.r -= (0.015 + ageDecay) * timeScale;
                    if (drop.r <= 1.2) drop.killed = true;
                }

                if (chance((drop.r - (this.options.minR * this.options.dropFallMultiplier)) * (0.1 / this.deltaR) * timeScale)) {
                    drop.momentum += random((drop.r / this.options.maxR) * 4);
                }

                if (this.options.raining && !drop.killed) {
                    drop.lastSpawn += drop.momentum * timeScale * this.options.trailRate;
                    if (drop.lastSpawn > drop.nextSpawn) {
                        const trailDrop = this.createDrop({
                            x: drop.x + (random(-drop.r, drop.r) * 0.1),
                            y: drop.y - (drop.r * 0.01),
                            r: drop.r * random(...this.options.trailScaleRange),
                            spreadY: drop.momentum * 0.1,
                            parent: drop,
                        });

                        if (trailDrop != null) {
                            newDrops.push(trailDrop);
                            drop.r *= Math.pow(0.97, timeScale);
                            drop.lastSpawn = 0;
                            drop.nextSpawn = random(this.options.minR, this.options.maxR) - (drop.momentum * 2 * this.options.trailRate) + (this.options.maxR - drop.r);
                        }
                    }
                }

                drop.spreadX *= Math.pow(0.4, timeScale);
                drop.spreadY *= Math.pow(0.7, timeScale);

                // Continuous Airflow Radial Wind Spreading Physics
                const moved = (drop.momentum > 0) || (windFactor > 0.08);
                if (moved && !drop.killed) {
                    // Normalized offset vector from center of screen (-1.0 to +1.0)
                    const dx = (drop.x - cx) / cx;
                    const dy = (drop.y - cy) / cy;

                    // When stationary (windFactor = 0): gravity pulls down (+y)
                    // When driving at speed (windFactor > 0): wind continuously pushes droplets OUTWARD in all directions
                    const gravityY = (drop.momentum + 0.8) * Math.max(0.0, 1.0 - windFactor * 0.5);
                    const windPush = windFactor * (1.4 + drop.r * 0.06);
                    const windX = dx * (drop.momentum * 0.5 + windPush);
                    const windY = dy * (drop.momentum * 0.5 + windPush);

                    drop.x += (windX + drop.momentumX) * this.options.globalTimeScale * timeScale;
                    drop.y += (gravityY + windY) * this.options.globalTimeScale * timeScale;

                    if (
                        drop.y > (this.height / this.scale) + drop.r + 30 ||
                        drop.y < -drop.r - 30 ||
                        drop.x < -drop.r - 30 ||
                        drop.x > (this.width / this.scale) + drop.r + 30
                    ) {
                        drop.killed = true;
                    }
                }

                const checkCollision = (moved || drop.isNew) && !drop.killed;
                drop.isNew = false;

                if (checkCollision) {
                    this.drops.slice(i + 1, i + 45).forEach((drop2) => {
                        if (
                            drop !== drop2 &&
                            drop.r > drop2.r &&
                            drop.parent !== drop2 &&
                            drop2.parent !== drop &&
                            !drop2.killed
                        ) {
                            const dx = drop2.x - drop.x;
                            const dy = drop2.y - drop.y;
                            const d = Math.sqrt((dx * dx) + (dy * dy));
                            if (d < (drop.r + drop2.r) * (this.options.collisionRadius + (drop.momentum * this.options.collisionRadiusIncrease * timeScale))) {
                                const pi = Math.PI;
                                const r1 = drop.r;
                                const r2 = drop2.r;
                                const a1 = pi * (r1 * r1);
                                const a2 = pi * (r2 * r2);
                                let targetR = Math.sqrt((a1 + (a2 * 0.8)) / pi);
                                if (targetR > this.options.maxR) targetR = this.options.maxR;

                                drop.r = targetR;
                                drop.momentumX += dx * 0.1;
                                drop.spreadX = 0;
                                drop.spreadY = 0;
                                drop2.killed = true;
                                drop.momentum = Math.max(drop2.momentum, Math.min(40, drop.momentum + (targetR * this.options.collisionBoostMultiplier) + this.options.collisionBoost));
                            }
                        }
                    });
                }

                drop.momentum -= Math.max(1, (this.options.minR * 0.5) - drop.momentum) * 0.1 * timeScale;
                if (drop.momentum < 0) drop.momentum = 0;
                drop.momentumX *= Math.pow(0.7, timeScale);

                if (!drop.killed) {
                    newDrops.push(drop);
                    if (moved && this.options.dropletsRate > 0) this.clearDroplets(drop.x, drop.y, drop.r * this.options.dropletsCleaningRadiusMultiplier);
                    this.drawDrop(this.ctx, drop);
                }
            }
        });

        this.drops = newDrops;
    }

    update() {
        this.clearCanvas();

        const now = Date.now();
        if (this.lastRender == null) this.lastRender = now;
        const deltaT = now - this.lastRender;
        let timeScale = deltaT / ((1 / 60) * 1000);
        if (timeScale > 1.1) timeScale = 1.1;
        timeScale *= this.options.globalTimeScale;
        this.lastRender = now;

        this.updateDrops(timeScale);
    }
}
