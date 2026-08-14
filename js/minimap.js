import { getRoadPoint, getRoadZoneInfo } from './world.js';

/**
 * Minimap — Single-Line Minimal White Racing Radar HUD.
 * Renders the track path as a single crisp white line with heading-up rotation
 * and a minimal white player arrow.
 */
export class Minimap {
    constructor() {
        this.canvas = document.getElementById('minimap-canvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');

        this.elZoneIcon = document.getElementById('minimap-zone-icon');
        this.elZoneName = document.getElementById('minimap-zone-name');

        // Radar config
        this.width = 280;
        this.height = 280;
        this.centerX = 140;
        this.centerY = 160; // Offset down so player sees more track ahead
        this.zoom = 0.58;   // Pixels per meter
    }

    update(vehicle) {
        if (!this.ctx || !vehicle || !vehicle.mesh) return;

        const ctx = this.ctx;
        const carPos = vehicle.mesh.position;
        const heading = vehicle.heading;
        const px = carPos.x;
        const pz = carPos.z;

        const sinH = Math.sin(heading);
        const cosH = Math.cos(heading);

        // Clear canvas
        ctx.clearRect(0, 0, this.width, this.height);

        // 1. Draw Minimal Radar Background & Guide Rings
        ctx.save();
        ctx.beginPath();
        ctx.arc(140, 140, 138, 0, Math.PI * 2);
        ctx.clip(); // Clip to circular frame

        // Clean dark translucent background
        ctx.fillStyle = 'rgba(10, 12, 18, 0.85)';
        ctx.fillRect(0, 0, this.width, this.height);

        // Concentric Distance Guide Rings (Subtle thin white)
        [45, 90, 135].forEach(r => {
            ctx.beginPath();
            ctx.arc(this.centerX, this.centerY, r, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.lineWidth = 1;
            ctx.stroke();
        });

        // Crosshair Lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.beginPath();
        ctx.moveTo(this.centerX, 0); ctx.lineTo(this.centerX, this.height);
        ctx.moveTo(0, this.centerY); ctx.lineTo(this.width, this.centerY);
        ctx.stroke();

        // World to Minimap Coordinate Converter (Heading-Up Orientation)
        const toMinimap = (wx, wz) => {
            const dx = wx - px;
            const dz = wz - pz;
            const rx = dx * cosH - dz * sinH;
            const ry = dx * sinH + dz * cosH;
            return {
                x: this.centerX + rx * this.zoom,
                y: this.centerY + ry * this.zoom
            };
        };

        // 2. Sample Track Spline Path ahead & behind player (-100m to +500m)
        const step = 5;
        const startZ = pz + 100;
        const endZ = pz - 500;

        const pathPts = [];
        for (let z = startZ; z >= endZ; z -= step) {
            const pt = getRoadPoint(z);
            pathPts.push(toMinimap(pt.x, z));
        }

        // 3. Render Track Path as a Single Clean White Vector Line
        if (pathPts.length > 1) {
            // Track casing / subtle outer line shadow for depth
            ctx.beginPath();
            ctx.moveTo(pathPts[0].x, pathPts[0].y);
            for (let i = 1; i < pathPts.length; i++) {
                ctx.lineTo(pathPts[i].x, pathPts[i].y);
            }
            ctx.lineWidth = 5.5;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();

            // Main crisp white track line
            ctx.beginPath();
            ctx.moveTo(pathPts[0].x, pathPts[0].y);
            for (let i = 1; i < pathPts.length; i++) {
                ctx.lineTo(pathPts[i].x, pathPts[i].y);
            }
            ctx.lineWidth = 3.5;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
        }

        // 4. Minimal Solid White Player Vehicle Arrow
        ctx.save();
        ctx.translate(this.centerX, this.centerY);

        // Soft white player aura
        const speedRatio = Math.min(Math.abs(vehicle.speed) / vehicle.maxSpeed, 1.0);
        const glowRadius = 8 + speedRatio * 5;
        const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, glowRadius);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
        grad.addColorStop(0.6, 'rgba(255, 255, 255, 0.15)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        // Solid White Player Arrow Geometry (Pointing UP)
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(6, 7);
        ctx.lineTo(0, 4);
        ctx.lineTo(-6, 7);
        ctx.closePath();

        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.lineWidth = 1.0;
        ctx.stroke();
        ctx.restore();

        // Subtle Outer Circle Frame Ring
        ctx.beginPath();
        ctx.arc(140, 140, 137, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.restore();

        // Update Minimap HUD Badge Label
        const curZone = getRoadZoneInfo(carPos.z);
        if (this.elZoneIcon) this.elZoneIcon.textContent = curZone.icon;
        if (this.elZoneName) this.elZoneName.textContent = curZone.name;
    }
}
