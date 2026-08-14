import * as THREE from 'three';

/**
 * AcceleratingSystem — Powertrain, Transmission & Speed Control.
 * Handles engine torque curves, gear ratios, throttle response, reverse dynamics, braking, drag, and nitro.
 */
export class AcceleratingSystem {
    constructor(vehicle) {
        this.v = vehicle;

        // Powertrain Specs
        this.maxSpeed = 315 / 3.6;       // 87.5 m/s (~315 km/h) top speed
        this.reverseMaxSpeed = 40 / 3.6; // 11.1 m/s (~40 km/h) max reverse
        this.baseAcceleration = 7.5;     // m/s^2
        this.brakeForce = 35.0;          // kN
        this.nitroBoost = 1.45;          // 45% power boost on nitro

        // Engine & Transmission state
        this.engineRpm = 900;
        this.gearIndex = 0;
        this.shiftTimer = 0;
        this.gearRatios = [3.08, 2.18, 1.63, 1.29, 1.03, 0.84]; // 6 gears
        this.finalDriveRatio = 4.35;
        this.isNitro = false;
        this.isReversing = false;

        // Progressive throttle state
        this.currentThrottle = 0;

        // Dynamics telemetry output
        this.aLong = 0;
        this.driveForce = 0;
    }

    _getEngineTorque(rpm) {
        const normRpm = Math.max(0, Math.min(1.0, (rpm - 900) / (9000 - 900)));
        // Peak torque at ~5500 RPM (normRpm ≈ 0.57), wider powerband with smoother falloff
        if (normRpm <= 0.57) {
            return 320 + 310 * Math.sin((normRpm / 0.57) * (Math.PI / 2));
        } else {
            return 630 - 120 * Math.pow((normRpm - 0.57) / 0.43, 1.6);
        }
    }

    _calcGearIndex(vLong) {
        const kmh = Math.abs(vLong * 3.6);
        if (kmh < 48) return 0;
        if (kmh < 92) return 1;
        if (kmh < 142) return 2;
        if (kmh < 192) return 3;
        if (kmh < 242) return 4;
        return 5;
    }

    update(dt, input, weatherGripFactor = 1.0) {
        let sensMult = input.precision25 ? 0.25 : (input.precision ? 0.5 : 1.0);

        // 1. Gear Shifts
        const newGear = this._calcGearIndex(this.v.vLong);
        if (newGear !== this.gearIndex && Math.abs(this.v.vLong) > 1) {
            this.gearIndex = newGear;
            this.shiftTimer = 0.06; // 60ms shift power dip
        }
        if (this.shiftTimer > 0) this.shiftTimer -= dt;

        // 2. Engine RPM calculation
        const totalRatio = this.gearRatios[this.gearIndex] * this.finalDriveRatio;
        const wheelRps = Math.abs(this.v.vLong) / (2 * Math.PI * this.v.wheelRadius);
        const calcRpm = wheelRps * totalRatio * 60;
        const targetRpm = (input.forward && Math.abs(this.v.vLong) < 2) ? 5200 : calcRpm;
        this.engineRpm = THREE.MathUtils.lerp(this.engineRpm, Math.max(900, Math.min(9000, targetRpm)), dt * 16.0);

        // 3. Nitro Boost
        this.isNitro = input.nitro && Math.abs(this.v.vLong) > 2;
        const nitroMult = this.isNitro ? this.nitroBoost : 1.0;

        // 4. Progressive Throttle Application (simulates turbo lag at high RPM)
        const throttleTarget = input.forward ? 1.0 : 0.0;
        const throttleRate = 1.0 - Math.exp(-dt * 6.0);
        this.currentThrottle = THREE.MathUtils.lerp(this.currentThrottle, throttleTarget, throttleRate);

        // 5. Raw Engine Power & Drive Force
        let rawTorque = this._getEngineTorque(this.engineRpm) * nitroMult;
        if (this.shiftTimer > 0) rawTorque *= 0.25;

        const effectiveRadius = Math.max(0.32, this.v.wheelRadius);
        this.driveForce = 0;
        this.isReversing = false;

        // Speed ratio for progressive brake feel
        const speedRatio = Math.min(Math.abs(this.v.vLong) / 30.0, 1.0);

        if (input.forward) {
            if (this.v.vLong < -0.5) {
                // Braking while rolling in reverse
                this.driveForce = this.brakeForce * 800 * sensMult * weatherGripFactor;
            } else {
                // Launch control: limit initial acceleration from standstill to prevent wheelspin jump
                const launchFactor = Math.min(1.0, Math.abs(this.v.vLong) / 5.0 + 0.3);
                // Forward acceleration with progressive throttle application
                this.driveForce = (rawTorque * totalRatio / effectiveRadius) * sensMult * 0.9 * this.currentThrottle * launchFactor;
            }
        } else if (input.backward) {
            if (this.v.vLong > 0.5) {
                // Progressive brake feel: less grabby at low speed, stronger at high speed
                this.driveForce = -this.brakeForce * 900 * sensMult * (0.4 + 0.6 * speedRatio) * weatherGripFactor;
            } else {
                // Reverse acceleration drive power
                this.isReversing = true;
                this.driveForce = -(rawTorque * 0.8 * (this.gearRatios[0] * this.finalDriveRatio) / effectiveRadius) * sensMult;
            }
        }

        // 6. Engine Braking — progressive realistic off-throttle coasting deceleration
        let engineBrakeForce = 0;
        if (!input.forward && !input.backward && Math.abs(this.v.vLong) > 0.5) {
            // Smooth natural off-throttle coasting (~0.8 to 1.5 m/s² deceleration)
            engineBrakeForce = -1.2 * Math.sign(this.v.vLong) * (1.0 + Math.abs(this.v.vLong) * 0.015) * this.v.mass;
        }

        // 7. Aerodynamic Drag & Rolling Friction
        const airDrag = 0.5 * 1.225 * 0.31 * 2.05 * this.v.vLong * Math.abs(this.v.vLong);
        const rollingResist = 0.012 * this.v.mass * 9.81 * Math.sign(this.v.vLong);
        const netLongForce = this.driveForce + engineBrakeForce - airDrag - (Math.abs(this.v.vLong) > 0.1 ? rollingResist : 0);

        // 8. Longitudinal Acceleration Integration
        this.aLong = netLongForce / this.v.mass;
        this.v.vLong += this.aLong * dt;

        // 9. Handbrake friction drag
        if (input.handbrake && Math.abs(this.v.vLong) > 2) {
            this.v.vLong *= (1.0 - 0.45 * dt);
        }

        // 10. Low speed standstill snap
        if (Math.abs(this.v.vLong) < 0.15 && !input.forward && !input.backward) {
            this.v.vLong = 0;
        }

        // Top speed limits
        const cap = this.isNitro ? (335 / 3.6) : (305 / 3.6);
        this.v.vLong = Math.max(-this.reverseMaxSpeed, Math.min(this.v.vLong, cap));
        this.v.speed = this.v.vLong;
    }
}
