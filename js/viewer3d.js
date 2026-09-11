import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ================================================================
   SoveetaViewer3D — dossier turntable for the 3D SOVEETA model.

   Hot-swap hook: it tries MODEL_CANDIDATES in order and loads the
   first that exists. Drop an AAA-grade "soveeta_3d_aaa.glb" into
   assets/character/ (e.g. generated via Meshy/Tripo on your machine)
   and the game picks it up with zero code changes.
   ================================================================ */
const MODEL_CANDIDATES = [
    'assets/character/soveeta_3d_aaa.glb',   // future AAA upgrade drop-in
    'assets/character/soveeta_3d.glb',       // procedural Combat Rig v1
];

export class SoveetaViewer3D {
    constructor(canvas) {
        this.canvas = canvas;
        this.active = false;
        this.loaded = false;
        this._raf = 0;
        this._yaw = 0.6;
        this._pitch = 0.12;
        this._dist = 2.35;
        this._targetYaw = this._yaw;
        this._dragging = false;
        this._idleSpin = true;
    }

    async start() {
        if (!this.active) {
            this.active = true;
            if (!this.loaded) {
                this._buildScene();
                await this._loadModel();
                this.loaded = true;
            }
            this._loop();
        }
    }

    stop() {
        this.active = false;
        cancelAnimationFrame(this._raf);
    }

    _buildScene() {
        const renderer = new THREE.WebGLRenderer({
            canvas: this.canvas, antialias: true, alpha: true,
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        this.renderer = renderer;

        this.scene = new THREE.Scene();
        this.scene.background = null;

        // Procedural studio environment for premium metal/porcelain response
        const pmrem = new THREE.PMREMGenerator(renderer);
        this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        pmrem.dispose();

        this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 20);
        this.camera.position.set(0, 1.2, this._dist);

        // Neon-world accent lights (match game palette)
        const key = new THREE.DirectionalLight(0xfff2e0, 2.2);
        key.position.set(2.5, 3.2, 2.0);
        this.scene.add(key);
        const rimCyan = new THREE.DirectionalLight(0x37c8ff, 1.6);
        rimCyan.position.set(-2.5, 2.0, -2.5);
        this.scene.add(rimCyan);
        const rimPink = new THREE.DirectionalLight(0xff2d95, 1.2);
        rimPink.position.set(2.0, 1.0, -2.4);
        this.scene.add(rimPink);
        this.scene.add(new THREE.AmbientLight(0x223344, 0.7));

        // Turntable disc
        const discGeo = new THREE.CylinderGeometry(0.62, 0.66, 0.035, 48);
        const discMat = new THREE.MeshStandardMaterial({
            color: 0x10131c, metalness: 0.85, roughness: 0.3,
        });
        this.disc = new THREE.Mesh(discGeo, discMat);
        this.disc.position.y = -0.018;
        this.scene.add(this.disc);
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.64, 0.008, 8, 64),
            new THREE.MeshStandardMaterial({
                color: 0x37c8ff, emissive: 0x37c8ff, emissiveIntensity: 2.4,
            })
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.001;
        this.scene.add(ring);

        // Turntable root for user drag + idle spin
        this.root = new THREE.Group();
        this.scene.add(this.root);

        this.loader = document.createElement('div');
        this.loader.className = 'v3d-loading';
        this.loader.textContent = 'ASSEMBLING SOVEETA…';
        this.canvas.parentElement.appendChild(this.loader);

        this._bindInput();
        this._resizeObs = new ResizeObserver(() => this._resize());
        this._resizeObs.observe(this.canvas.parentElement);
        this._resize();
    }

    async _pickModelUrl() {
        for (const url of MODEL_CANDIDATES) {
            try {
                const r = await fetch(url, { method: 'HEAD' });
                if (r.ok) return url;
            } catch (e) { /* try next */ }
        }
        return null;
    }

    async _loadModel() {
        const url = await this._pickModelUrl();
        if (!url) {
            this.loader.textContent = 'MODEL MISSING';
            return;
        }
        const gltf = await new Promise((res, rej) =>
            new GLTFLoader().load(url, res, undefined, rej));
        this.model = gltf.scene;

        // Normalize: center on disc, stand at y=0, face camera
        const box = new THREE.Box3().setFromObject(this.model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const scale = 1.62 / Math.max(size.y, 0.0001); // ~1.62m tall in view frame
        this.model.scale.setScalar(scale);
        this.model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
        this.root.add(this.model);
        this.loader.style.display = 'none';
    }

    _bindInput() {
        const el = this.canvas;
        let px = 0, py = 0, idleTimer = 0;
        const wake = () => { this._idleSpin = false; clearTimeout(idleTimer); };
        const sleep = () => { idleTimer = setTimeout(() => (this._idleSpin = true), 2400); };

        el.addEventListener('pointerdown', (e) => {
            this._dragging = true; px = e.clientX; py = e.clientY;
            el.setPointerCapture(e.pointerId); wake();
        });
        el.addEventListener('pointermove', (e) => {
            if (!this._dragging) return;
            this._targetYaw += (e.clientX - px) * 0.011;
            this._pitch = THREE.MathUtils.clamp(this._pitch + (e.clientY - py) * 0.006, -0.1, 0.55);
            px = e.clientX; py = e.clientY;
        });
        const end = () => { this._dragging = false; sleep(); };
        el.addEventListener('pointerup', end);
        el.addEventListener('pointercancel', end);
        el.addEventListener('wheel', (e) => {
            e.preventDefault();
            this._dist = THREE.MathUtils.clamp(this._dist + e.deltaY * 0.0016, 1.2, 3.6);
            wake(); sleep();
        }, { passive: false });
    }

    _resize() {
        const p = this.canvas.parentElement;
        const w = p.clientWidth || 300, h = p.clientHeight || 380;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }

    _loop() {
        if (!this.active) return;
        this._raf = requestAnimationFrame(() => this._loop());
        if (this._idleSpin) this._targetYaw += 0.0055;
        this._yaw += (this._targetYaw - this._yaw) * 0.12;
        this.root.rotation.y = this._yaw;
        this.disc.rotation.y = this._yaw * 0.35;
        const camH = 1.05 + this._pitch * 1.1;
        this.camera.position.set(0, camH, this._dist);
        this.camera.lookAt(0, 0.82, 0);
        this.renderer.render(this.scene, this.camera);
    }

    dispose() {
        this.stop();
        this._resizeObs?.disconnect();
        this.renderer?.dispose();
    }
}
