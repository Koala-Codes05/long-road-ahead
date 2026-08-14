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
    minR: 4,
    maxR: 18,
    maxDrops: 150,
    rainChance: 0.12,
    rainLimit: 2,
    dropletsRate: 20,
    dropletsSize: [1.5, 4],
    dropletsCleaningRadiusMultiplier: 0.43,
    raining: true,
    globalTimeScale: 1,
    trailRate: 0.4,
    autoShrink: true,
    spawnArea: [0.0, 1.0],
    windSpread: 0.8,
    trailScaleRange: [0.15, 0.35],
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
            const spreadX = drop.spreadX;
            const spreadY = drop.spreadY;

            const scaleX = 1;
            const scaleY = 1.5;

            let d = Math.max(0, Math.min(1, ((r - this.options.minR) / (this.deltaR)) * 0.9));
            d *= 1 / (((drop.spreadX + drop.spreadY) * 0.5) + 1);

            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';

            d = Math.floor(d * (this.dropsGfx.length - 1));
            ctx.drawImage(
                this.dropsGfx[d],
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

    updateRain(timeScale) {
        const rainDrops = [];
        if (this.options.raining) {
            const limit = this.options.rainLimit * timeScale * this.areaMultiplier;
            let count = 0;
            const cx = (this.width / this.scale) * 0.5;
            const cy = (this.height / this.scale) * 0.5;
            while (chance(this.options.rainChance * timeScale * this.areaMultiplier) && count < limit) {
                count++;
                
                // 3-Population System (80% Tiny/Micro streaks, 15% Medium droplets, 5% Large beads)
                let r;
                const layerRoll = Math.random();
                if (layerRoll < 0.80) {
                    r = random(this.options.minR * 0.35, this.options.minR * 0.75);
                } else if (layerRoll < 0.95) {
                    r = random(this.options.minR * 0.90, this.options.maxR * 0.45);
                } else {
                    r = random(this.options.maxR * 0.45, this.options.maxR * 0.85);
                }

                let x = random(this.width / this.scale);
                let y = random((this.height / this.scale) * this.options.spawnArea[0], (this.height / this.scale) * this.options.spawnArea[1]);

                // Sparse Periphery Filtering for 3rd Person Camera (keeps center 40% screen clean for driving view)
                if (this.options.sparsePeriphery) {
                    const normX = Math.abs(x - cx) / cx;
                    const normY = Math.abs(y - cy) / cy;
                    if (normX < 0.35 && normY < 0.35) { // Skip center screen spawn
                        continue;
                    }
                }

                const dx = (x - cx) / cx;
                const windFactor = this.options.windSpread || 0.0;
                const ambientWind = this.options.ambientWind || { x: 0, y: 0 };
                const rainDrop = this.createDrop({
                    x: x,
                    y: y,
                    r: r,
                    momentum: 1 + ((r - this.options.minR) * 0.1) + random(2),
                    momentumX: (dx * random(0.5, 2.5) + ambientWind.x * 1.5) * Math.min(1.0, windFactor + 0.4),
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
        if (!this.options.raining) {
            this.dropletsCtx.clearRect(0, 0, this.droplets.width, this.droplets.height);
            this.ctx.clearRect(0, 0, this.width, this.height);
            return;
        }
        if (this.textureCleaningIterations > 0) {
            this.textureCleaningIterations -= 1 * timeScale;
            this.dropletsCtx.globalCompositeOperation = 'destination-out';
            this.dropletsCtx.fillStyle = `rgba(0,0,0,${0.05 * timeScale})`;
            this.dropletsCtx.fillRect(
                0, 0,
                this.width * this.dropletsPixelDensity,
                this.height * this.dropletsPixelDensity
            );
        }
        this.dropletsCounter += this.options.dropletsRate * timeScale * this.areaMultiplier;
        times(this.dropletsCounter, () => {
            this.dropletsCounter--;
            this.drawDroplet(
                random(this.width / this.scale),
                random(this.height / this.scale),
                random(...this.options.dropletsSize, (n) => n * n),
            );
        });
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

        // Wind Center of Screen (Windshield focal point)
        const cx = (this.width / this.scale) * 0.5;
        const cy = (this.height / this.scale) * 0.45;
        const windFactor = this.options.windSpread || 0.0;

        this.drops.forEach((drop, i) => {
            if (!drop.killed) {
                if (chance((drop.r - (this.options.minR * this.options.dropFallMultiplier)) * (0.1 / this.deltaR) * timeScale)) {
                    drop.momentum += random((drop.r / this.options.maxR) * 4);
                }
                if (this.options.autoShrink && drop.r <= this.options.minR && chance(0.05 * timeScale)) {
                    drop.shrink += 0.01;
                }

                // Drops maintain their radius while streaking under high wind!
                drop.r -= drop.shrink * timeScale;
                if (drop.r <= 0) drop.killed = true;

                if (this.options.raining) {
                    // Enhanced trailing when driving fast so drops leave visible wet streaks
                    const trailSpeedBonus = windFactor > 0.1 ? windFactor * 4.0 : 0.0;
                    drop.lastSpawn += (drop.momentum + trailSpeedBonus) * timeScale * this.options.trailRate;

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
                            drop.r *= Math.pow(0.985, timeScale);
                            drop.lastSpawn = 0;
                            drop.nextSpawn = random(this.options.minR, this.options.maxR) - (drop.momentum * 2 * this.options.trailRate) + (this.options.maxR - drop.r);
                        }
                    }
                }

                const ambientWind = this.options.ambientWind || { x: 0, y: 0 };
                const ambientForceX = ambientWind.x * (2.5 + windFactor * 2.0);
                const ambientForceY = ambientWind.y * (1.8 + windFactor * 1.5);

                // Effective momentum: High speed wind & ambient crosswind drive continuous fast outward movement!
                const effectiveMomentum = Math.max(drop.momentum, windFactor * 5.0 + Math.abs(ambientWind.x) * 3.0);
                const moved = (effectiveMomentum > 0) || (windFactor > 0.05) || (Math.abs(ambientWind.x) > 0.05);

                if (moved && !drop.killed) {
                    // Normalized offset vector from center of windshield (-1.0 to +1.0)
                    const dx = (drop.x - cx) / cx;
                    const dy = (drop.y - cy) / cy;
                    const distFromCenter = Math.sqrt(dx * dx + dy * dy) + 0.06;

                    // Fast high-speed radial wind dispersion across screen!
                    const radialSpeed = (effectiveMomentum * 4.5 + 9.0) * windFactor;
                    const windX = (dx / distFromCenter) * radialSpeed;
                    const windY = (dy / distFromCenter) * radialSpeed;

                    const gravityY = drop.momentum * Math.max(0.0, 0.85 - windFactor * 0.45);

                    // Update position - drop physically streaks across the glass under relative headwind + ambient crosswind
                    const moveX = (windX + drop.momentumX + ambientForceX) * this.options.globalTimeScale;
                    const moveY = (gravityY + windY + ambientForceY) * this.options.globalTimeScale;
                    drop.x += moveX;
                    drop.y += moveY;

                    // Dynamic Elongation & Streaking along movement direction!
                    if (windFactor > 0.1) {
                        const targetSpreadX = Math.min(3.5, Math.abs(moveX) * 0.35 * windFactor);
                        const targetSpreadY = Math.min(3.5, Math.abs(moveY) * 0.35 * windFactor);
                        drop.spreadX += (targetSpreadX - drop.spreadX) * Math.min(1.0, 0.5 * timeScale);
                        drop.spreadY += (targetSpreadY - drop.spreadY) * Math.min(1.0, 0.5 * timeScale);
                    } else {
                        drop.spreadX *= Math.pow(0.4, timeScale);
                        drop.spreadY *= Math.pow(0.7, timeScale);
                    }

                    // Only despawn when the drop physically travels past the screen edge!
                    if (
                        drop.y > (this.height / this.scale) + drop.r + 30 ||
                        drop.y < -drop.r - 30 ||
                        drop.x < -drop.r - 30 ||
                        drop.x > (this.width / this.scale) + drop.r + 30
                    ) {
                        drop.killed = true;
                    }
                } else {
                    drop.spreadX *= Math.pow(0.4, timeScale);
                    drop.spreadY *= Math.pow(0.7, timeScale);
                }

                const checkCollision = (moved || drop.isNew) && !drop.killed;
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
                            const dx = drop2.x - drop.x;
                            const dy = drop2.y - drop.y;
                            const d = Math.sqrt((dx * dx) + (dy * dy));
                            const collisionThreshold = (drop.r + drop2.r) * (this.options.collisionRadius + (effectiveMomentum * this.options.collisionRadiusIncrease * timeScale) + (windFactor * 0.15));
                            if (d < collisionThreshold) {
                                const pi = Math.PI;
                                const r1 = drop.r;
                                const r2 = drop2.r;
                                const a1 = pi * (r1 * r1);
                                const a2 = pi * (r2 * r2);
                                let targetR = Math.sqrt((a1 + (a2 * 0.8)) / pi);
                                if (targetR > this.options.maxR) targetR = this.options.maxR;

                                drop.r = targetR;
                                drop.momentumX += dx * 0.15;
                                drop2.killed = true;
                                drop.momentum = Math.max(drop2.momentum, Math.min(50, drop.momentum + (targetR * this.options.collisionBoostMultiplier) + this.options.collisionBoost + windFactor * 5.0));
                            }
                        }
                    }
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

