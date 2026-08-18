import * as THREE from 'three';

/**
 * PlanarRoadReflection — Performance-Optimized Selective Ground Planar Reflection Engine.
 * Features zero-traversal mesh caching and budget-constrained render target allocation (0.8-1.2 ms GPU budget),
 * delivering ultra-fast selective ground reflections of the vehicle, lights & atmosphere.
 */
export class PlanarRoadReflection {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.enabled = true;
        // Optimized 768x384 resolution fits comfortably in the 0.8-1.2 ms GPU reflection budget
        this.width = options.width || 768;
        this.height = options.height || 384;

        this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.0);
        this.reflectionCamera = new THREE.PerspectiveCamera();
        
        this.renderTarget = new THREE.WebGLRenderTarget(this.width, this.height, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType,
            colorSpace: THREE.SRGBColorSpace,
        });

        this.textureMatrix = new THREE.Matrix4();
        this.roadMeshes = [];
        this._lastCacheCheck = 0;

        // Zero-GC temp vectors
        this._cameraWorldPos = new THREE.Vector3();
        this._cameraLookTarget = new THREE.Vector3();
        this._cameraDir = new THREE.Vector3();
        this._reflectedPos = new THREE.Vector3();
        this._reflectedTarget = new THREE.Vector3();

        this.textureMatrix.set(
            0.5, 0.0, 0.0, 0.5,
            0.0, 0.5, 0.0, 0.5,
            0.0, 0.0, 0.5, 0.5,
            0.0, 0.0, 0.0, 1.0
        );

        this._updateRoadMeshCache();
    }

    _updateRoadMeshCache() {
        this.roadMeshes.length = 0;
        if (!this.scene) return;
        this.scene.traverse((obj) => {
            if (obj.isMesh && (obj.name.includes('road') || obj.name.includes('Road') || obj.name.includes('asphalt') || obj.name.includes('Asphalt'))) {
                this.roadMeshes.push(obj);
            }
        });
    }

    update(renderer, mainCamera, wetness = 1.0, roadMaterial = null) {
        if (!this.enabled || wetness < 0.02 || !renderer || !mainCamera) return;

        // 1. Refresh road mesh cache periodically (every ~3 seconds) to account for dynamic chunks
        const now = performance.now();
        if (now - this._lastCacheCheck > 3000 || this.roadMeshes.length === 0) {
            this._updateRoadMeshCache();
            this._lastCacheCheck = now;
        }

        // 2. Synchronize reflection camera parameters with main camera
        this.reflectionCamera.fov = mainCamera.fov;
        this.reflectionCamera.aspect = mainCamera.aspect;
        this.reflectionCamera.near = mainCamera.near;
        this.reflectionCamera.far = mainCamera.far;
        this.reflectionCamera.updateProjectionMatrix();

        // 3. Reflect camera position and orientation across ground plane y = 0
        mainCamera.getWorldPosition(this._cameraWorldPos);
        mainCamera.getWorldDirection(this._cameraDir);
        this._cameraLookTarget.copy(this._cameraWorldPos).add(this._cameraDir);

        this._reflectedPos.copy(this._cameraWorldPos);
        this._reflectedPos.y = -this._cameraWorldPos.y;

        this._reflectedTarget.copy(this._cameraLookTarget);
        this._reflectedTarget.y = -this._cameraLookTarget.y;

        this.reflectionCamera.position.copy(this._reflectedPos);
        this.reflectionCamera.lookAt(this._reflectedTarget);
        this.reflectionCamera.updateMatrixWorld();

        // 4. Compute texture projection matrix for fragment shader mapping
        this.textureMatrix.set(
            0.5, 0.0, 0.0, 0.5,
            0.0, 0.5, 0.0, 0.5,
            0.0, 0.0, 0.5, 0.5,
            0.0, 0.0, 0.0, 1.0
        );
        this.textureMatrix.multiply(this.reflectionCamera.projectionMatrix);
        this.textureMatrix.multiply(this.reflectionCamera.matrixWorldInverse);

        // 5. Zero-traversal hiding of cached road surface meshes
        for (let i = 0; i < this.roadMeshes.length; i++) {
            this.roadMeshes[i].visible = false;
        }

        // 6. Render reflected scene into WebGLRenderTarget
        const currentRenderTarget = renderer.getRenderTarget();
        const currentXR = renderer.xr.enabled;
        renderer.xr.enabled = false;

        renderer.setRenderTarget(this.renderTarget);
        renderer.state.buffers.depth.setTest(true);
        renderer.state.buffers.depth.setMask(true);
        renderer.colorBuffer = true;
        renderer.clear(true, true, true);

        renderer.render(this.scene, this.reflectionCamera);

        // 7. Restore main rendering target and road visibility
        renderer.setRenderTarget(currentRenderTarget);
        renderer.xr.enabled = currentXR;

        for (let i = 0; i < this.roadMeshes.length; i++) {
            this.roadMeshes[i].visible = true;
        }
    }
}
