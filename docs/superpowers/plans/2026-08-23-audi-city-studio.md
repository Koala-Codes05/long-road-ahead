# Audi City Drive and Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a selectable Audi city-driving experience, plus an Escape-key showroom where the player can inspect and change between the Ferrari and Audi.

**Architecture:** Keep one physics `Vehicle` root and swap only its visible GLTF presentation and vehicle tuning. `World` continues to own the safe procedural road and City facade streaming, while a lazy-loaded avenue asset provides a distinct city-route landmark. A small experience controller in `main.js` coordinates F2 selection, Escape studio state, camera, HUD, and world visibility.

**Tech Stack:** ES modules, Three.js r160 from the import map, GLTFLoader/DRACOLoader, CSS HUD, native browser keyboard input, Playwright smoke testing.

## Global Constraints

- Use ES modules only; keep Three.js on the existing r160 CDN import map.
- Never create materials inside streaming-world loops; reuse shared materials.
- Keep the city roadway and model assets lazy-loaded so the initial drive does not fetch the 65 MB Audi model.
- Preserve the existing procedural road as the movement/boundary source; do not add per-chunk point lights.
- Do not discard unrelated working-tree changes.

---

### Task 1: Add one-shot experience controls and discoverable HUD copy

**Files:**
- Modify: `js/input.js`
- Modify: `index.html`
- Modify: `css/style.css`

**Interfaces:**
- Produces `input.consumeVehicleSwitchRequest(): boolean` and `input.consumeStudioToggleRequest(): boolean`.
- Produces `#experience-badge`, `#studio-overlay`, `#studio-car-name`, and `#studio-status` for the orchestrator.

- [ ] **Step 1: Add edge-triggered input state**

```js
// js/input.js constructor
this.vehicleSwitchRequested = false;
this.studioToggleRequested = false;

// _handleKey(), inside the non-repeating keydown switch
case 'F2': this.vehicleSwitchRequested = true; break;
case 'Escape': this.studioToggleRequested = true; break;

consumeVehicleSwitchRequest() {
    const requested = this.vehicleSwitchRequested;
    this.vehicleSwitchRequested = false;
    return requested;
}

consumeStudioToggleRequest() {
    const requested = this.studioToggleRequested;
    this.studioToggleRequested = false;
    return requested;
}
```

- [ ] **Step 2: Include `F2` and `Escape` in `gameKeys`**

```js
'KeyC', 'KeyV', 'KeyL', 'KeyF', 'KeyH', 'KeyQ', 'KeyE', 'KeyX',
'F2', 'Escape',
```

- [ ] **Step 3: Add status UI that remains readable in both modes**

```html
<div id="experience-badge" aria-live="polite">
    <span id="experience-route">HIGHWAY</span>
    <span id="experience-car">FERRARI 458</span>
</div>
<section id="studio-overlay" aria-live="polite" aria-hidden="true">
    <p class="studio-kicker">PRIVATE COLLECTION</p>
    <h2 id="studio-car-name">FERRARI 458</h2>
    <p id="studio-status">F2 — CHANGE CAR · ESC — DRIVE</p>
</section>
```

- [ ] **Step 4: Style the badge and showroom card without blocking game input**

```css
#experience-badge, #studio-overlay { pointer-events: none; }
#studio-overlay { opacity: 0; transform: translate(-50%, -12px); }
#studio-overlay.is-visible { opacity: 1; transform: translate(-50%, 0); }
```

- [ ] **Step 5: Verify keyboard event capture in a browser**

Run: `python C:/Users/Anakin/.agents/skills/webapp-testing/scripts/with_server.py --help`

Expected: The helper prints its usage, then a browser smoke test can load the page and dispatch `F2` and `Escape` without a default browser action.

### Task 2: Make the Ferrari and Audi selectable vehicle presentations with distinct tuning

**Files:**
- Modify: `js/vehicle.js`
- Modify: `js/accelerating.js`
- Modify: `js/turning.js`

**Interfaces:**
- Produces `vehicle.selectNextCar(): Promise<string>` and `vehicle.getActiveCar(): { id, label, route }`.
- `Vehicle` exposes `driveTuning` containing `torqueMultiplier`, `brakeMultiplier`, `gripMultiplier`, `topSpeedKmh`, and `nitroTopSpeedKmh`.
- `AcceleratingSystem` and `TurningSystem` read the active vehicle tuning instead of hard-coded Ferrari-only limits.

- [ ] **Step 1: Define the two car records beside the `Vehicle` constructor**

```js
const CAR_DEFINITIONS = [
    { id: 'ferrari', label: 'FERRARI 458', route: 'highway', asset: 'assets/ferrari.glb', mass: 1420, wheelbase: 2.65, wheelRadius: 0.38, torqueMultiplier: 1.0, brakeMultiplier: 1.0, gripMultiplier: 1.0, topSpeedKmh: 305, nitroTopSpeedKmh: 335 },
    { id: 'audi', label: 'AUDI NOVULARI', route: 'city', asset: 'assets/Cars/audi_novulari.glb', mass: 1580, wheelbase: 2.85, wheelRadius: 0.37, torqueMultiplier: 0.92, brakeMultiplier: 1.08, gripMultiplier: 1.14, topSpeedKmh: 280, nitroTopSpeedKmh: 305 },
];
```

- [ ] **Step 2: Extract the current Ferrari loader into reusable model activation helpers**

```js
async selectNextCar() {
    const nextIndex = (this.activeCarIndex + 1) % CAR_DEFINITIONS.length;
    await this._activateCar(CAR_DEFINITIONS[nextIndex]);
    return this.activeCarId;
}

getActiveCar() {
    return CAR_DEFINITIONS.find((car) => car.id === this.activeCarId);
}
```

Use a `Map` cache keyed by car id. Keep the loaded models attached to `visualBody`, toggle only the active model's `visible` flag, and leave the procedural fallback available if a loader fails.

- [ ] **Step 3: Normalize Audi before attaching it to the vehicle root**

```js
const bounds = new THREE.Box3().setFromObject(model);
const size = bounds.getSize(new THREE.Vector3());
const scale = 4.9 / Math.max(size.x, size.z);
model.scale.multiplyScalar(scale);
model.rotation.y = -Math.PI / 2;
model.updateMatrixWorld(true);
const aligned = new THREE.Box3().setFromObject(model);
const center = aligned.getCenter(new THREE.Vector3());
model.position.x -= center.x;
model.position.z -= center.z;
model.position.y -= aligned.min.y;
```

Disable per-mesh Audi shadow casting to contain the asset's roughly 634K source triangles. Keep its renderer materials intact; do not try to split shared wheel meshes at runtime.

- [ ] **Step 4: Apply the selected car's physical profile before its model becomes active**

```js
this.mass = definition.mass;
this.wheelbase = definition.wheelbase;
this.wheelRadius = definition.wheelRadius;
this.maxSpeed = definition.topSpeedKmh / 3.6;
this.driveTuning = definition;
this.vLong = 0;
this.vLat = 0;
this.yawRate = 0;
```

- [ ] **Step 5: Respect the profile in longitudinal and lateral systems**

```js
// js/accelerating.js
const tuning = this.v.driveTuning;
rawTorque *= tuning?.torqueMultiplier ?? 1;
this.driveForce *= tuning?.brakeMultiplier ?? 1;
const cap = this.isNitro
    ? (tuning?.nitroTopSpeedKmh ?? 335) / 3.6
    : (tuning?.topSpeedKmh ?? 305) / 3.6;

// js/turning.js
const profileGrip = this.v.driveTuning?.gripMultiplier ?? 1;
const maxLatG = baseLatG * profileGrip;
```

- [ ] **Step 6: Verify the fallback, Ferrari, and Audi state transitions**

Run: `node --check js/vehicle.js; node --check js/accelerating.js; node --check js/turning.js`

Expected: every command exits with code 0.

### Task 3: Add the city-road asset as a lazy alternate driving environment

**Files:**
- Modify: `js/world.js`

**Interfaces:**
- Produces `world.setRoute(route: 'highway' | 'city'): Promise<void>`.
- Keeps `world.update(carPos)` and the existing `getRoadPoint()` / `getRoadWidth()` contracts unchanged.

- [ ] **Step 1: Add a persistent asset route group and GLTF loader**

```js
this.route = 'highway';
this.routeAssets = new THREE.Group();
this.routeAssets.name = 'city-road-assets';
this.routeAssets.visible = false;
this.scene.add(this.routeAssets);
this.cityRoadLoad = null;
```

- [ ] **Step 2: Lazy-load and ground the avenue asset once**

```js
this.cityRoadLoad = new Promise((resolve, reject) => {
    new GLTFLoader().load('assets/Enviroment/Roads/road__avenue__street.glb', (gltf) => {
        const avenue = gltf.scene;
        avenue.scale.setScalar(0.06);
        avenue.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(avenue);
        avenue.position.y -= box.min.y;
        avenue.position.z = -50;
        avenue.traverse((node) => { if (node.isMesh) { node.receiveShadow = true; node.castShadow = false; } });
        this.routeAssets.add(avenue);
        resolve();
    }, undefined, reject);
});
```

- [ ] **Step 3: Change only visual route layers, not the procedural movement contract**

```js
async setRoute(route) {
    this.route = route;
    if (route === 'city') await this._ensureCityRoad();
    this.routeAssets.visible = route === 'city';
    for (const group of this.generatedChunks.values()) group.visible = route !== 'city';
}
```

This preserves the proven road-centreline boundary and current City facade asset streaming for physics, while the static avenue becomes the city driving scene. `update()` still streams chunks to avoid an expensive re-generation when the player switches back.

- [ ] **Step 4: Verify route toggling preserves the world map**

Run: `node --check js/world.js`

Expected: exit code 0; opening the app then selecting each car must show one visible route layer at a time.

### Task 4: Add Escape-key studio mode with a centered swappable car

**Files:**
- Modify: `js/main.js`
- Modify: `js/vehicle.js`

**Interfaces:**
- Consumes the input requests from Task 1, `vehicle.selectNextCar()`, `vehicle.getActiveCar()`, and `world.setRoute()`.
- Produces a `studioMode` state that pauses driving updates while retaining the render loop.

- [ ] **Step 1: Add a lazy studio loader and a showroom lighting group in `main.js`**

```js
const studioGroup = new THREE.Group();
studioGroup.visible = false;
scene.add(studioGroup);
let studioLoad = null;

function ensureStudio() {
    if (studioLoad) return studioLoad;
    studioLoad = new Promise((resolve, reject) => new GLTFLoader().load(
        'assets/Enviroment/Presets/studio_v1_for_car.glb',
        (gltf) => { studioGroup.add(gltf.scene); resolve(); }, undefined, reject
    ));
    return studioLoad;
}
```

- [ ] **Step 2: Save and restore drive state at the mode boundary**

```js
const driveSnapshot = { position: new THREE.Vector3(), heading: 0 };

async function setStudioMode(nextStudioMode) {
    if (nextStudioMode) {
        driveSnapshot.position.copy(vehicle.mesh.position);
        driveSnapshot.heading = vehicle.heading;
        await ensureStudio();
        world.setVisible(false);
        vehicle.resetMotion();
        vehicle.mesh.position.set(0, 0, 0);
    } else {
        world.setVisible(true);
        vehicle.mesh.position.copy(driveSnapshot.position);
        vehicle.heading = driveSnapshot.heading;
    }
}
```

Implement `World.setVisible(visible)` so it toggles the route assets and all currently generated chunk groups, and add `Vehicle.resetMotion()` to zero longitudinal/lateral velocity and accelerations.

- [ ] **Step 3: Use a dedicated orbit camera while in the studio**

```js
function updateStudioCamera(dt) {
    const orbit = performance.now() * 0.00012;
    camera.position.set(Math.sin(orbit) * 7.2, 2.6, Math.cos(orbit) * 7.2);
    camera.lookAt(vehicle.mesh.position.x, 0.85, vehicle.mesh.position.z);
    camera.fov = THREE.MathUtils.lerp(camera.fov, 48, 1 - Math.exp(-dt * 6));
    camera.updateProjectionMatrix();
}
```

- [ ] **Step 4: Dispatch F2 and Escape before the normal vehicle update**

```js
if (input.consumeStudioToggleRequest()) void setStudioMode(!studioMode);
if (input.consumeVehicleSwitchRequest()) void switchExperienceCar();

if (!studioMode) {
    vehicle.update(dt, input, weather);
    world.update(vehicle.mesh.position);
    updateCamera(dt);
} else {
    vehicle.updateShowroom(dt);
    updateStudioCamera(dt);
}
```

`switchExperienceCar()` must select the next vehicle, sync the HUD, and set the matching `'highway'` or `'city'` world route only while driving. In studio, it changes just the centered car.

- [ ] **Step 5: Verify the full control path with the real browser**

Run: `python C:/Users/Anakin/.agents/skills/webapp-testing/scripts/with_server.py --server "npm run dev" --port 3000 -- python <temporary-playwright-smoke-script>.py`

Expected: the script loads the game, confirms zero fatal console errors, enters studio with `Escape`, changes the visible car name with `F2`, returns to drive with `Escape`, and sees the matching route badge.

### Task 5: Review the feature against the performance and UX constraints

**Files:**
- Modify: `last_summary.md`

**Interfaces:**
- Produces a concise persisted handoff documenting the new car/route/studio controls and any known asset constraints.

- [ ] **Step 1: Run syntax validation for every changed module**

Run: `node --check js/input.js; node --check js/vehicle.js; node --check js/accelerating.js; node --check js/turning.js; node --check js/world.js; node --check js/main.js`

Expected: all commands exit with code 0.

- [ ] **Step 2: Run the Playwright interaction smoke test at a desktop viewport**

Run: `python C:/Users/Anakin/.agents/skills/webapp-testing/scripts/with_server.py --server "npm run dev" --port 3000 -- python <temporary-playwright-smoke-script>.py`

Expected: no page errors; F2 cycles Ferrari/Audi and the highway/city label; Escape opens and closes the studio; the studio card reads the active vehicle.

- [ ] **Step 3: Inspect draw calls after every route and car has loaded**

Run: use the existing renderer debug hook or browser console to record `renderer.info.render.calls` after the Audi and avenue load.

Expected: report the actual result rather than assuming the 65 MB source Audi meets the 200-draw-call target.

- [ ] **Step 4: Replace `last_summary.md` with the actual implementation and verification result**

```markdown
# Session Summary

- Added F2 vehicle/route selection and Escape showroom controls.
- Added the lazy Audi Novulari and city avenue assets.
- Documented the final browser smoke-test result and the Audi source-model performance limitation.
```

## Self-Review

- Spec coverage: Task 2 adds the requested Audi and a distinctly grippier, lower-top-speed driving profile. Task 3 uses the road asset with the existing City facade system. Task 4 loads the studio asset, centers the active car, and exposes F2 switching plus Escape entry/exit.
- Placeholder scan: all implementation files, selectors, interfaces, and commands are named; the temporary browser script is intentionally ephemeral because the project has no test runner dependency.
- Type consistency: `InputManager` produces both consume methods; `Vehicle` produces selection/profile APIs; `World` produces route/visibility APIs; `main.js` is the only coordinator.

