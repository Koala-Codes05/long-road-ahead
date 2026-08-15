/**
 * ManeuversSystem - Advanced Stunts & Vehicle Maneuvers.
 * Handles burnouts, donuts, hard turns, and drift status.
 */
export class ManeuversSystem {
    constructor(vehicle) {
        this.v = vehicle;

        this.activeManeuver = null; // 'BURNOUT', 'DONUT', 'HARD_TURN', 'DRIFT'
        this.maneuverTimer = 0;
    }

    update(dt, input, weather) {
        const speed = Math.abs(this.v.vLong);
        const isHandbrake = input.handbrake;

        // 1. Detect Burnout
        if (input.forward && (input.backward || isHandbrake) && speed < 3.0) {
            this.activeManeuver = 'BURNOUT';
            return;
        }

        // 2. Detect Donut
        if (input.forward && Math.abs(this.v.steerAngle) > 0.35 && speed < 12.0 && isHandbrake) {
            this.activeManeuver = 'DONUT';
            if (this.v.turningSystem) {
                this.v.turningSystem.yawRate = Math.sign(this.v.steerAngle) * 4.2;
            }
            this.v.yawRate = Math.sign(this.v.steerAngle) * 4.2;
            return;
        }

        // 3. Detect Hard Turn
        if (this.v.turningSystem && this.v.turningSystem.isHardTurning) {
            this.activeManeuver = 'HARD_TURN';
            return;
        }

        // 4. Detect Drift
        if (this.v.driftingSystem && this.v.driftingSystem.isDrifting) {
            this.activeManeuver = 'DRIFT';
            return;
        }

        this.activeManeuver = null;
    }
}
