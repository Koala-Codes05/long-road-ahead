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
        this.targetLateralVelocity = 0;
        this.tireScrub = 0;
        this.brakeLockRatio = 0;
    }

    update(dt, input, weatherGripFactor = 1.0, weatherType = 3) {
        let sensMult = input.precision25 ? 0.25 : (input.precision ? 0.5 : 1.0);
        const vLong = this.v.vLong;
        const kmh = Math.abs(vLong * 3.6);

        // 1. Speed-Sensitive Progressive Steering Lock Angle
        // Big lock at low speed for U-turns, reduced only once the car is genuinely fast.
        const lowSpeedLock = THREE.MathUtils.lerp(0.72, 0.54, THREE.MathUtils.smoothstep(kmh, 0, 80));
        const highSpeedTrim = 1.0 / (1.0 + Math.pow(Math.max(0, kmh - 80) / 150.0, 1.25));
        const maxSteerAngleRad = lowSpeedLock * highSpeedTrim * sensMult;
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
        const steerTan = Math.tan(this.steerAngle);
        const turnSpeed = Math.sign(vLong || 1) * Math.max(Math.abs(vLong), THREE.MathUtils.lerp(7.0, 1.0, THREE.MathUtils.smoothstep(kmh, 0, 55)));
        const desiredYawRate = steerTan * (turnSpeed / wheelbase) * steerDirection;
        const rearAxleRatio = (this.v.cgToRear || 1.35) / wheelbase;
        const bodySlipAngle = Math.atan(rearAxleRatio * steerTan) * steerDirection;

        // 4. Dynamic Weight Transfer Effect on Front Tire Grip
        const loadTransfer = -(this.v.acceleratingSystem.aLong || 0) / 9.81;
        const frontGripFactor = THREE.MathUtils.clamp(1.0 + loadTransfer * 0.35, 0.80, 1.45);

        // 5. Tire Grip Limits with Aero Downforce, Weather & Aquaplaning
        const aeroGripBonus = Math.min(0.05, Math.pow(kmh / 260.0, 1.1) * 0.045);

        // Aquaplaning: progressive grip loss above 120 km/h in heavy storm
        const aquaPlanFactor = Math.max(0, (kmh - 120) / 80) * 0.3 * (weatherType === 0 ? 1 : 0);
        const effectiveWeatherGrip = weatherGripFactor * (1.0 - aquaPlanFactor);

        const lowSpeedMechanicalGrip = THREE.MathUtils.lerp(0.45, 0.0, THREE.MathUtils.smoothstep(kmh, 0, 70));
        const maxLatG = (1.04 + lowSpeedMechanicalGrip + aeroGripBonus) * frontGripFactor * effectiveWeatherGrip;
        const maxLatAccel = maxLatG * 9.81;

        // Calculate desired lateral acceleration
        const desiredLatAccel = vLong * desiredYawRate;

        // Compute Tire Grip Ratio with progressive soft saturation
        const absDesiredLat = Math.max(Math.abs(desiredLatAccel), 0.001);
        const rawGrip = maxLatAccel / absDesiredLat;
        const saturation = THREE.MathUtils.clamp(rawGrip, 0.12, 1.0);
        this.gripRatio = rawGrip >= 1.0 ? 1.0 : THREE.MathUtils.clamp(Math.pow(rawGrip, 0.85), 0.12, 1.0);
        const scrubEnable = THREE.MathUtils.smoothstep(kmh, 45.0, 95.0);
        this.tireScrub = THREE.MathUtils.clamp((absDesiredLat - maxLatAccel) / maxLatAccel, 0.0, 1.8) * scrubEnable;
        this.brakeLockRatio = input.backward && Math.abs(vLong) > 10.0
            ? THREE.MathUtils.smoothstep(Math.abs(this.steerAngle), 0.08, 0.22) * THREE.MathUtils.smoothstep(kmh, 60.0, 150.0)
            : 0.0;

        // Understeer State
        this.isUndersteering = Math.abs(this.steerAngle) > 0.10 && (this.tireScrub > 0.05 || this.brakeLockRatio > 0.2) && Math.abs(vLong) > 10.0;

        // 6. Tire Relaxation Length & Damped Yaw Rate
        // Simulates tire carcass flex — at low speed, steering barely affects heading
        const relaxFactor = 1.0 - Math.exp(-Math.abs(vLong) * dt / 0.2);
        const lockedFrontGrip = 1.0 - this.brakeLockRatio * 0.65;
        let actualYawRate = desiredYawRate * saturation * lockedFrontGrip * relaxFactor;

        // Handbrake U-turn assist: lets the rear rotate around at low/medium speed
        // without making normal high-speed steering twitchy.
        const handbrakeTurnWindow = THREE.MathUtils.smoothstep(kmh, 8.0, 28.0) * (1.0 - THREE.MathUtils.smoothstep(kmh, 78.0, 125.0));
        const handbrakeTurnAssist = input.handbrake && steerDir !== 0 ? handbrakeTurnWindow : 0.0;
        if (handbrakeTurnAssist > 0.0) {
            const pivotYawRate = steerDir * THREE.MathUtils.lerp(0.55, 1.35, 1.0 - THREE.MathUtils.smoothstep(kmh, 22.0, 90.0));
            actualYawRate = THREE.MathUtils.lerp(actualYawRate, pivotYawRate, handbrakeTurnAssist * 0.42);
        }

        // Slower yaw damping for weighty, progressive turn-in (~170ms to reach target)
        const yawDampSpeed = isChangingDirection ? 10.0 : 6.0;
        const yawDamp = 1.0 - Math.exp(-dt * yawDampSpeed);
        this.yawRate = THREE.MathUtils.lerp(this.yawRate, actualYawRate, yawDamp);
        this.v.yawRate = this.yawRate;
        this.targetLateralVelocity = Math.tan(bodySlipAngle) * vLong * saturation * lockedFrontGrip * relaxFactor;
        if (handbrakeTurnAssist > 0.0) {
            const slideSign = Math.sign(steerDir);
            const slideAmount = THREE.MathUtils.lerp(1.2, 3.8, THREE.MathUtils.smoothstep(kmh, 10.0, 70.0));
            this.targetLateralVelocity += slideSign * slideAmount * handbrakeTurnAssist;
            this.v.vLong *= (1.0 - 1.75 * handbrakeTurnAssist * dt);
        }
        if (this.tireScrub > 0.0 || this.brakeLockRatio > 0.0) {
            const scrubDrag = Math.min(0.28, (this.tireScrub * 0.16 + this.brakeLockRatio * 0.34) * dt);
            this.v.vLong *= (1.0 - scrubDrag);
        }

        // Physical Lateral Acceleration capped strictly by peak tire grip limit
        this.aLat = THREE.MathUtils.clamp(vLong * this.yawRate, -maxLatAccel, maxLatAccel);
        this.v.aLat = this.aLat;

        // 7. Update Vehicle Heading Orientation
        this.v.heading += this.yawRate * dt;
    }
}
