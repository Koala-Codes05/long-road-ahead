import * as THREE from 'three';

/**
 * ManeuversSystem — Advanced Stunts & Vehicle Maneuvers.
 * Handles J-Turns (180 reverse spin to forward drive), Burnouts, Donuts, and Hard Turn maneuvers.
 */
export class ManeuversSystem {
    constructor(vehicle) {
        this.v = vehicle;

        this.activeManeuver = null; // 'J_TURN', 'BURNOUT', 'DONUT', 'HARD_TURN', 'DRIFT'
        this.maneuverTimer = 0;
        this.jTurnPhase = 0;        // Phase 1: reverse speed build, Phase 2: 180 snap, Phase 3: forward launch
    }

    update(dt, input, weather) {
        const speed = Math.abs(this.v.vLong);
        const kmh = speed * 3.6;
        const isReversing = this.v.vLong < -1.5;
        const isHandbrake = input.handbrake;

        // 1. Detect J-Turn Maneuver (Reversing at speed + Sharp Steer/Handbrake -> 180° spin to forward drive)
        if (isReversing && (isHandbrake || Math.abs(input.left ? 1 : (input.right ? -1 : 0)) > 0.7) && kmh > 10) {
            if (this.activeManeuver !== 'J_TURN') {
                this.activeManeuver = 'J_TURN';
                this.jTurnPhase = 1;
                this.maneuverTimer = 0;
            }
        }

        if (this.activeManeuver === 'J_TURN') {
            this.maneuverTimer += dt;

            if (this.jTurnPhase === 1) { // Rapid 180 spin
                const spinDir = input.left ? 1 : -1;
                if (this.v.turningSystem) {
                    this.v.turningSystem.yawRate = spinDir * 5.2;
                }
                this.v.yawRate = spinDir * 5.2;
                this.v.vLong *= (1.0 - 0.4 * dt);

                if (this.maneuverTimer > 0.35) { // Completed 180 spin
                    this.jTurnPhase = 2;
                    this.v.heading += spinDir * Math.PI * 0.85;
                    this.v.vLong = Math.abs(this.v.vLong) + 4.0; // Snap momentum forward into 1st gear
                }
            } else if (this.jTurnPhase === 2) {
                this.activeManeuver = null;
                this.jTurnPhase = 0;
            }
            return;
        }

        // 2. Detect Burnout
        if (input.forward && (input.backward || isHandbrake) && speed < 3.0) {
            this.activeManeuver = 'BURNOUT';
            return;
        }

        // 3. Detect Donut
        if (input.forward && Math.abs(this.v.steerAngle) > 0.35 && speed < 12.0 && isHandbrake) {
            this.activeManeuver = 'DONUT';
            if (this.v.turningSystem) {
                this.v.turningSystem.yawRate = Math.sign(this.v.steerAngle) * 4.2;
            }
            this.v.yawRate = Math.sign(this.v.steerAngle) * 4.2;
            return;
        }

        // 4. Detect Hard Turn
        if (this.v.turningSystem && this.v.turningSystem.isHardTurning) {
            this.activeManeuver = 'HARD_TURN';
            return;
        }

        // 5. Detect Drift
        if (this.v.driftingSystem && this.v.driftingSystem.isDrifting) {
            this.activeManeuver = 'DRIFT';
            return;
        }

        this.activeManeuver = null;
    }
}
