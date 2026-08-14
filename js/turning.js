import * as THREE from 'three';

/**
 * TurningSystem — Responsive Vehicle Steering & Cornering Dynamics.
 * Gives the vehicle responsive, precise, sharp turning power on curves and corners at all speeds.
 */
export class TurningSystem {
    constructor(vehicle) {
        this.v = vehicle;

        this.steerAngle = 0;
        this.currentSteer = 0;
        this.yawRate = 0;
        this.aLat = 0;
        this.turnSpeedScale = 1.0;
        this.isHardTurning = false;
    }

    update(dt, input) {
        let sensMult = input.precision25 ? 0.25 : (input.precision ? 0.5 : 1.0);
        const kmh = Math.abs(this.v.vLong * 3.6);

        // 1. Responsive Steering Lock Angle (Up to 0.55 rad / 31.5 deg for tight curves)
        const maxSteerAngleRad = (0.55 / (1.0 + Math.pow(kmh / 90.0, 1.1))) * sensMult + 0.18 * sensMult;
        const steerDir = input.left ? 1 : (input.right ? -1 : 0);
        const targetSteer = steerDir * maxSteerAngleRad;

        // Ultra-fast steering response (dt * 18.0)
        this.currentSteer = THREE.MathUtils.lerp(this.currentSteer, targetSteer, dt * 18.0);
        this.steerAngle = this.currentSteer;

        // Detect Hard Turn (sharp turn at speed)
        this.isHardTurning = Math.abs(steerDir) > 0 && kmh > 35 && Math.abs(this.currentSteer) > 0.15;

        // 2. Dynamic Yaw Rate Calculation (Responsive turning power around curves)
        // Reversing turn direction switch
        const steerDirection = THREE.MathUtils.smoothstep(this.v.vLong, -0.6, 0.2) * 2.0 - 1.0;

        // Base turn speed scale
        const speedFactor = Math.max(0.6, Math.min(2.2, Math.abs(this.v.vLong) / 12.0));
        const targetYawRate = this.steerAngle * (1.2 + speedFactor * 0.45) * steerDirection;

        // Instant, smooth yaw rate response
        this.yawRate = THREE.MathUtils.lerp(this.yawRate, targetYawRate, dt * 18.0);
        this.v.yawRate = this.yawRate;

        // 3. Lateral Acceleration
        this.aLat = (this.v.vLong * this.yawRate);
        this.v.aLat = this.aLat;

        // 4. Update vehicle heading orientation angle
        this.v.heading += this.yawRate * dt;
    }
}
