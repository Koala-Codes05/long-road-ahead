/**
 * InputManager – Tracks keyboard state for game controls.
 * Supports WASD, Arrow keys, Space (handbrake), ShiftLeft (nitro), ShiftRight (50% precision mode),
 * L/F (headlights), H (hazards), Q/E (turn signals).
 */
export class InputManager {
    constructor() {
        this.forward = false;
        this.backward = false;
        this.left = false;
        this.right = false;
        this.handbrake = false;
        this.nitro = false;
        this.precision = false; // Right Shift (50% steering/acceleration sensitivity)
        this.precision25 = false; // Right Ctrl (25% steering/acceleration sensitivity)

        // Light Controls & Camera View
        this.headlightMode = 1; // 0: OFF, 1: LOW BEAM, 2: HIGH BEAM (default Low Beam on start)
        this.hazards = false;
        this.signalLeft = false;
        this.signalRight = false;
        this.cameraMode = 0; // 0: 3rd Person Chase View, 1: 1st Person Cockpit View, 2: 1st Person Bumper View

        this._onKeyDown = (e) => this._handleKey(e, true);
        this._onKeyUp = (e) => this._handleKey(e, false);

        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);
    }

    _handleKey(e, pressed) {
        switch (e.code) {
            case 'KeyW': case 'ArrowUp':
                this.forward = pressed; break;
            case 'KeyS': case 'ArrowDown':
                this.backward = pressed; break;
            case 'KeyA': case 'ArrowLeft':
                this.left = pressed; break;
            case 'KeyD': case 'ArrowRight':
                this.right = pressed; break;
            case 'Space':
                this.handbrake = pressed; break;
            case 'ShiftLeft':
                this.nitro = pressed; break;
            case 'ShiftRight':
                this.precision = pressed; break;
            case 'ControlRight':
                this.precision25 = pressed; break;
        }

        // Toggle triggers (only on keydown)
        if (pressed && !e.repeat) {
            switch (e.code) {
                case 'KeyC': case 'KeyV':
                    this.cameraMode = (this.cameraMode + 1) % 3;
                    break;
                case 'KeyL': case 'KeyF':
                    this.headlightMode = (this.headlightMode + 1) % 3;
                    break;
                case 'KeyH':
                    this.hazards = !this.hazards;
                    if (this.hazards) {
                        this.signalLeft = false;
                        this.signalRight = false;
                    }
                    break;
                case 'KeyQ':
                    this.signalLeft = !this.signalLeft;
                    if (this.signalLeft) {
                        this.signalRight = false;
                        this.hazards = false;
                    }
                    break;
                case 'KeyE':
                    this.signalRight = !this.signalRight;
                    if (this.signalRight) {
                        this.signalLeft = false;
                        this.hazards = false;
                    }
                    break;
                case 'KeyX':
                    this.dissect = !this.dissect;
                    break;
            }
        }

        // Prevent default browser actions for game keys
        const gameKeys = [
            'KeyW', 'KeyS', 'KeyA', 'KeyD',
            'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
            'Space', 'ShiftLeft', 'ShiftRight', 'ControlRight',
            'KeyC', 'KeyV', 'KeyL', 'KeyF', 'KeyH', 'KeyQ', 'KeyE', 'KeyX',
        ];
        if (gameKeys.includes(e.code)) {
            e.preventDefault();
        }
    }

    /** Clean up event listeners */
    dispose() {
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
    }
}

