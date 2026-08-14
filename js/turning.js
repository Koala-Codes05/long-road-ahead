import * as THREE from 'three';

/**
 * TurningSystem — Kinematic Bicycle Model with Physical Tire Grip Limits & Dynamic Weight Transfer.
 * Provides a grounded, heavy, responsive Driveclub / NFS Unbound steering dynamics model:
 *  - Kinematic Wheelbase Curvature (desiredYawRate = tan(steerAngle) * vLong / wheelbase)
 *  - Physical Tire Grip Limits (capped strictly at ~1.18G base + high-speed aero downforce up to 1.45G)
 *  - Progressive Understeer when steering beyond available tire grip limits
 *  - Dynamic Weight Transfer (Trail-braking loads front tires for sharper turn-in; hard accel lightens front)
 *  - Smooth Damped Yaw Response (1 - exp(-dt * 8.5)) for a heavy, planted feel on the road
 */
export class TurningSystem {
    constructor(vehicle) {
        this.v = vehicle;

        this.steerAngle = 0;
        this.currentSteer = 0;
        this.yawRate = 0;
        this.aLat = 0;
        this.gripRatio = 1.0;
        this.isHardTurning = false;
        this.isUndersteering = false;
    }

    update(dt, input, weatherGripFactor = 1.0, weatherType = 3) {
        let sensMult = input.precision25 ? 0.25 : (input.precision ? 0.5 : 1.0);
        const vLong = this.v.vLong;
        const kmh = Math.abs(vLong * 3.6);

        // 1. Speed-Sensitive Progressive Steering Lock Angle
        // Max steer lock ~0.50 rad (28 deg) at low speed; progressively reduced at higher speeds
        const maxSteerAngleRad = (0.50 / (1.0 + Math.pow(kmh / 100.0, 1.1))) * sensMult;
        const steerDir = input.left ? 1 : (input.right ? -1 : 0);
        const targetSteer = steerDir * maxSteerAngleRad;

        // Dynamic S-Turn Direction Transition Detection (Flick left <-> right)
        const isChangingDirection = steerDir !== 0 && Math.sign(steerDir) !== Math.sign(this.currentSteer);

        // 2. Damped Steering Input Ramp with Self-Aligning Torque
        // Tires take ~120ms to reach full lock; self-center faster when no input (self-aligning torque)
        const steerDampSpeed = steerDir === 0 ? 12.0 : (isChangingDirection ? 14.0 : 8.0);
        const steerDamp = 1.0 - Math.exp(-dt * steerDampSpeed);
        this.currentSteer = THREE.MathUtils.lerp(this.currentSteer, targetSteer, steerDamp);
        this.steerAngle = this.currentSteer;

        // Detect Hard Turning
        this.isHardTurning = Math.abs(steerDir) > 0 && kmh > 35 && Math.abs(this.currentSteer) > 0.10;

        // Direction multiplier (reverse steering logic)
        const steerDirection = THREE.MathUtils.smoothstep(vLong, -0.8, 0.2) * 2.0 - 1.0;

        // 3. Kinematic Bicycle Model: Desired Yaw Rate from Wheelbase & Velocity
        const wheelbase = this.v.wheelbase || 2.65; // Ferrari 458 wheelbase = 2.65m
        const desiredYawRate = Math.tan(this.steerAngle) * (vLong / wheelbase) * steerDirection;

        // 4. Dynamic Weight Transfer Effect on Front Tire Grip
        const loadTransfer = -(this.v.acceleratingSystem.aLong || 0) / 9.81;
        const frontGripFactor = THREE.MathUtils.clamp(1.0 + loadTransfer * 0.35, 0.80, 1.45);

        // 5. Tire Grip Limits with Aero Downforce, Weather & Aquaplaning
        const aeroGripBonus = Math.pow(kmh / 180.0, 1.3) * 0.40;

        // Aquaplaning: progressive grip loss above 120 km/h in heavy storm
        const aquaPlanFactor = Math.max(0, (kmh - 120) / 80) * 0.3 * (weatherType === 0 ? 1 : 0);
        const effectiveWeatherGrip = weatherGripFactor * (1.0 - aquaPlanFactor);

        const maxLatG = (1.45 + aeroGripBonus) * frontGripFactor * effectiveWeatherGrip;
        const maxLatAccel = maxLatG * 9.81;

        // Calculate desired lateral acceleration
        const desiredLatAccel = vLong * desiredYawRate;

        // Compute Tire Grip Ratio with progressive soft saturation
        const absDesiredLat = Math.max(Math.abs(desiredLatAccel), 0.001);
        const rawGrip = maxLatAccel / absDesiredLat;
        this.gripRatio = THREE.MathUtils.clamp(0.35 + 0.65 * Math.min(1.0, rawGrip), 0.35, 1.0);

        // Understeer State
        this.isUndersteering = Math.abs(this.steerAngle) > 0.12 && this.gripRatio < 0.70 && Math.abs(vLong) > 12.0;

        // 6. Tire Relaxation Length & Damped Yaw Rate
        // Simulates tire carcass flex — at low speed, steering barely affects heading
        const relaxFactor = 1.0 - Math.exp(-Math.abs(vLong) * dt / 0.2);
        const actualYawRate = desiredYawRate * this.gripRatio * relaxFactor;

        // Slower yaw damping for weighty, progressive turn-in (~170ms to reach target)
        const yawDampSpeed = isChangingDirection ? 10.0 : 6.0;
        const yawDamp = 1.0 - Math.exp(-dt * yawDampSpeed);
        this.yawRate = THREE.MathUtils.lerp(this.yawRate, actualYawRate, yawDamp);
        this.v.yawRate = this.yawRate;

        // Physical Lateral Acceleration capped strictly by peak tire grip limit
        this.aLat = THREE.MathUtils.clamp(vLong * this.yawRate, -maxLatAccel, maxLatAccel);
        this.v.aLat = this.aLat;

        // 7. Update Vehicle Heading Orientation
        this.v.heading += this.yawRate * dt;
    }
}
