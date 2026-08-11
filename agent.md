# 🏎️ LONG ROAD AHEAD — Agent Development Blueprint

> Full 6-month roadmap, architecture notes, free asset sources, shader/material references, and AI agent context for building an NFS-inspired open-world web racing game.

---

## 📋 Table of Contents

1. [Vision & Inspiration](#-vision--inspiration)
2. [Phase Roadmap (6 Months)](#-phase-roadmap-6-months)
3. [Architecture Overview](#-architecture-overview)
4. [Free Asset Sources](#-free-asset-sources)
5. [Shader & Material Resources](#-shader--material-resources)
6. [Technical Deep-Dives](#-technical-deep-dives)
7. [Performance Budget](#-performance-budget)
8. [Known Limitations (Prototype)](#-known-limitations-prototype)
9. [Agent Context & Rules](#-agent-context--rules)

---

## 🎯 Vision & Inspiration

### Reference Games
| Game | Year | Inspiration |
|------|------|-------------|
| **NFS: Most Wanted** | 2005 | Police chases, open-world city, pursuit breakers |
| **NFS: Most Wanted** | 2012 | Burnout-style driving, car discovery, open world |
| **NFS: Unbound** | 2022 | Cel-shaded FX, graffiti art style, stylised effects |
| **NFS: Heat** | 2019 | Day/night cycle, cop heat levels, neon nights |

### Design Pillars
1. **Speed Sensation** — Dynamic FOV, motion blur, speed lines, camera shake
2. **Night City Atmosphere** — Neon lights, wet roads, volumetric fog
3. **Procedural Infinity** — Never run out of road, always new scenery
4. **Accessible Fun** — Arcade physics first, simulation optional later

---

## 🗺️ Phase Roadmap (6 Months)

### Phase 1: Foundation (Weeks 1-2) ✅ COMPLETE
- [x] Three.js scene with WebGL2 renderer
- [x] Procedural car model (box geometry)
- [x] Arcade vehicle physics (accel, brake, steer, drift, nitro)
- [x] Chunk-based infinite road generation
- [x] Procedural building placement with window textures
- [x] Street lights with emissive bulbs + light pool
- [x] Neon accent strips on building facades
- [x] Chase camera with dynamic FOV + distance
- [x] Bloom post-processing (UnrealBloomPass)
- [x] HUD: speedometer, tachometer, gear display
- [x] Night atmosphere (fog, sky shader, moonlight)
- [x] Underglow effect on car
- [x] Loading screen with animated progress bar

### Phase 2: Assets & Visuals (Weeks 3-5)
- [ ] Import glTF car model(s) from Sketchfab/OpenGameArt
- [ ] Road texture with PBR (normal, roughness, AO maps) from Poly Haven
- [ ] Building textures — procedural + downloaded PBR facades
- [ ] Environment map for car reflections (HDRI from Poly Haven)
- [ ] Tree/vegetation models along road edges
- [ ] Traffic cones, barriers, signs as road decoration
- [ ] Particle system: exhaust smoke, tire sparks, dust
- [ ] Improved car model with LOD variants
- [ ] Skybox with stars / city glow on horizon

### Phase 3: World Complexity (Weeks 6-9)
- [ ] Curved roads (spline-based road generation)
- [ ] Intersections and T-junctions
- [ ] Multiple road types (highway, city street, alley)
- [ ] Terrain variation (hills, bridges, tunnels)
- [ ] Road surface variation (wet, dry, gravel patches)
- [ ] Proper UV mapping for road curves
- [ ] Building type variety (shops, gas stations, apartments, skyscrapers)
- [ ] Signage and billboards (procedural textures)
- [ ] Day/night cycle with time-of-day lighting
- [ ] Weather system (rain particles, wet road reflections)

### Phase 4: Traffic & AI (Weeks 10-14)
- [ ] NPC traffic vehicles (lane following)
- [ ] Traffic light system at intersections
- [ ] Simple traffic AI — lane changes, stops, turns
- [ ] Police cars with pursuit AI state machine
- [ ] Police scanner radio audio
- [ ] Pursuit heat levels (escalation system)
- [ ] Pursuit breakers (destructible objects)
- [ ] Collision detection (OBB / SAT)
- [ ] Collision response (bounce, spin-out, damage model)
- [ ] NPC car models (multiple types)

### Phase 5: Gameplay Loop (Weeks 15-20)
- [ ] Race mode: checkpoint-to-checkpoint timed runs
- [ ] Free roam with collectibles / speed cameras
- [ ] Car garage: select different cars
- [ ] Car customisation: color, parts, decals
- [ ] Leaderboard (local storage or server-based)
- [ ] Mini-map with road overlay
- [ ] Audio engine: engine sounds, ambient city, music
- [ ] Touch controls for mobile
- [ ] Gamepad support (Gamepad API)
- [ ] Save/load game state

### Phase 6: Polish & Performance (Weeks 21-24)
- [ ] LOD system for buildings and cars
- [ ] Instanced mesh rendering for repeated geometry
- [ ] Texture atlasing for buildings
- [ ] Occlusion culling
- [ ] Web Workers for physics/AI computation
- [ ] WebGPU renderer option (future-proofing)
- [ ] FXAA / SMAA anti-aliasing options
- [ ] Motion blur post-processing
- [ ] Screen-space reflections (SSR)
- [ ] Analytics / telemetry for performance tuning

---

## 🏗️ Architecture Overview

```
┌──────────────────────────────────────────────┐
│                  GAME LOOP                    │
│  requestAnimationFrame → update → render      │
├──────────┬──────────┬──────────┬──────────────┤
│  INPUT   │ PHYSICS  │  WORLD   │   CAMERA     │
│ Keyboard │ Vehicle  │ ChunkMgr │ Chase/Follow │
│ Gamepad  │ Collider │ LOD Mgr  │ Cinematic    │
│ Touch    │ Traffic  │ Assets   │ Shake/FX     │
├──────────┴──────────┴──────────┴──────────────┤
│              THREE.JS SCENE GRAPH              │
├───────────────────────────────────────────────┤
│           RENDERER + POST-PROCESSING           │
│  WebGL2 / WebGPU  │  Bloom  │  MotionBlur     │
│  ACES ToneMap     │  FXAA   │  Vignette       │
├───────────────────────────────────────────────┤
│                HTML/CSS HUD                    │
│  Speed │ RPM │ Gear │ Minimap │ Notifications  │
└───────────────────────────────────────────────┘
```

### Key Design Patterns
- **Entity-Component-System (ECS)**: Future refactor target — decouple data from behaviour
- **Chunk Streaming**: Only N chunks around the player exist in the scene graph
- **Light Pool**: Limited PointLights that reposition around the car
- **Material Sharing**: One material instance per visual type, reused across chunks
- **Canvas Textures**: Building window grids generated on `<canvas>` at startup

---

## 📦 Free Asset Sources

### 3D Models (glTF / OBJ / FBX)

| Source | URL | Best For |
|--------|-----|----------|
| **Sketchfab** | https://sketchfab.com/search?q=car&type=models&licenses=322a749bcfa841b29dff1571c4e29ea7 | Cars, buildings (CC-BY licensed) |
| **OpenGameArt** | https://opengameart.org/art-search-advanced?keys=car+vehicle | Low-poly game-ready vehicles |
| **Kenney** | https://kenney.nl/assets?q=3d | Free CC0 game assets (cars, roads, buildings) |
| **Quaternius** | https://quaternius.com/packs/ | Free low-poly vehicle/city packs |
| **Turbosquid (Free)** | https://www.turbosquid.com/Search/3D-Models/free/car | Limited free models |
| **CGTrader (Free)** | https://www.cgtrader.com/free-3d-models/car | Community free models |
| **Poly Pizza** | https://poly.pizza/ | Google Poly archive, CC-BY |
| **KayKit** | https://kaylousberg.itch.io/ | Free game-ready 3D packs |

### Textures & Materials (PBR)

| Source | URL | Best For |
|--------|-----|----------|
| **Poly Haven** | https://polyhaven.com/textures | PBR textures (road, concrete, metal) — CC0 |
| **Poly Haven HDRIs** | https://polyhaven.com/hdris | Environment maps for reflections — CC0 |
| **ambientCG** | https://ambientcg.com/ | PBR materials (asphalt, brick, metal) — CC0 |
| **3D Textures** | https://3dtextures.me/ | Seamless PBR textures — CC0 |
| **Texture.Ninja** | https://texture.ninja/ | Photo-based textures |
| **FreePBR** | https://freepbr.com/ | PBR material sets |

### Audio

| Source | URL | Best For |
|--------|-----|----------|
| **Freesound** | https://freesound.org/ | Engine sounds, ambient, SFX |
| **OpenGameArt Audio** | https://opengameart.org/art-search-advanced?type=audio | Game music and SFX |
| **Mixkit** | https://mixkit.co/free-sound-effects/ | Free SFX library |
| **ZapSplat** | https://www.zapsplat.com/ | Large SFX library (requires account) |

---

## 🎨 Shader & Material Resources

### Blender → WebGL Shader Conversion

Blender uses a **node-based BSDF** system. Here's how to convert to Three.js:

| Blender Node | Three.js Equivalent |
|-------------|---------------------|
| Principled BSDF | `MeshStandardMaterial` or `MeshPhysicalMaterial` |
| Base Color | `material.color` / `material.map` |
| Metallic | `material.metalness` / `material.metalnessMap` |
| Roughness | `material.roughness` / `material.roughnessMap` |
| Normal Map | `material.normalMap` |
| Emission | `material.emissive` / `material.emissiveMap` |
| Transmission | `MeshPhysicalMaterial.transmission` |
| Clearcoat | `MeshPhysicalMaterial.clearcoat` |

### Shader Reference Sites

| Resource | URL | What |
|----------|-----|------|
| **Shadertoy** | https://www.shadertoy.com/ | GLSL shader gallery (rain, fire, neon, etc.) |
| **The Book of Shaders** | https://thebookofshaders.com/ | Learn GLSL from scratch |
| **Three.js Shader Examples** | https://threejs.org/examples/?q=shader | Official Three.js shader demos |
| **GLSL Sandbox** | http://glslsandbox.com/ | Live GLSL editor |
| **Blender Shader Community** | https://blenderartists.org/c/materials-and-textures | Node setups to study |

### Key Shaders to Implement

1. **Wet Road Reflection** — Screen-space planar reflections or cube map
2. **Cel-Shading (NFS Unbound style)** — Custom `ShaderMaterial` with edge detection
3. **Speed Lines** — Radial lines from screen centre, opacity based on speed
4. **Rain Drops** — Particle system + normal-map puddle shader
5. **Neon Glow** — Emissive materials + UnrealBloomPass (already working)
6. **Volumetric Fog** — Raymarching in fragment shader or Three.js VolumetricFog
7. **Heat Distortion** — Post-process refraction shader for exhaust/fire

---

## ⚡ Performance Budget

### Target: 60 FPS on mid-range GPU (GTX 1060 / RX 580 level)

| Metric | Budget |
|--------|--------|
| Draw calls | < 200 per frame |
| Triangles | < 500K visible |
| Texture memory | < 256 MB |
| JS heap | < 150 MB |
| Frame time | < 16.6 ms |
| Point lights | Max 12 active (light pool) |
| Shadow maps | 1 directional + 2 spot (car headlights) |

### Optimisation Strategies

1. **Geometry instancing** for repeated objects (street lights, traffic cones)
2. **LOD** — 3 levels per building type (near/mid/far)
3. **Frustum culling** — Three.js handles this automatically
4. **Chunk disposal** — Proper `.dispose()` on removed geometry/materials
5. **Texture atlas** — Combine building textures into one large atlas
6. **Deferred rendering** — Consider for Phase 6 if light count grows
7. **Web Workers** — Offload physics/AI to worker threads

---

## ⚠️ Known Limitations (Prototype)

| Limitation | Impact | Fix Phase |
|-----------|--------|-----------|
| No collision detection | Car clips through buildings | Phase 4 |
| Straight roads only | No curves, intersections | Phase 3 |
| Procedural car model (boxes) | Not realistic looking | Phase 2 |
| No traffic / AI | Empty city | Phase 4 |
| No audio | Silent experience | Phase 5 |
| No mobile/gamepad support | Desktop keyboard only | Phase 5 |
| Unseeded random world | Different each time, can't go back | Phase 3 |
| Single material per building | Limited variety | Phase 2 |
| No weather effects | Static night scene | Phase 3 |
| Shadow popping | Directional shadow map follows car crudely | Phase 6 |

---

## 🤖 Agent Context & Rules

### For AI Coding Agents Working on This Project

1. **Always module-based**: Use ES Modules (`import/export`). No CommonJS, no global scripts.
2. **Three.js r160**: Import from CDN via import map. Do NOT install Three.js via npm.
3. **Material reuse**: Never create materials inside loops. Pre-create and reference.
4. **Geometry disposal**: When removing a chunk, traverse and `.dispose()` all geometries.
5. **Light pool**: Never add PointLights in chunk generation. Use the light pool in `World`.
6. **Coordinate system**: Y is up. Default forward is -Z. Car heading is radians around Y.
7. **Performance**: Keep draw calls under 200. Profile with `renderer.info`.
8. **File structure**:
   - `js/main.js` — Scene, renderer, camera, game loop (orchestrator)
   - `js/vehicle.js` — Car model + physics (one class)
   - `js/world.js` — All procedural generation (one class)
   - `js/input.js` — Input abstraction
   - Future files: `js/traffic.js`, `js/audio.js`, `js/weather.js`, `js/ui.js`
9. **CSS HUD**: The HUD is HTML/CSS overlaid on the canvas. It uses `pointer-events: none`.
10. **Camera**: Chase cam with lerp smoothing. FOV scales from 60° to 80° with speed.

### Asset Integration Workflow

```
1. Download .glb/.gltf from source
2. Optimise in Blender if needed (reduce polycount, bake textures)
3. Export as compressed .glb (Draco compression if available)
4. Place in /assets/models/ directory
5. Load with GLTFLoader in the relevant module
6. Create LOD variants at 100%, 50%, 25% polycount
7. Register in asset manifest for preloading
```

### Key Three.js Patterns Used

```javascript
// Material sharing (correct)
const mat = new MeshStandardMaterial({...});
meshes.forEach(m => m.material = mat);

// Light pool (correct)
const lights = Array.from({length: 10}, () => new PointLight(...));
function updateLights(carPos) {
    lights.forEach((l, i) => l.position.set(...));
}

// Chunk streaming (correct)
const chunks = new Map();
function update(carZ) {
    const idx = Math.floor(-carZ / CHUNK_SIZE);
    // generate ahead, remove behind
}
```

---

## 📊 Milestones & Checkpoints

| Week | Milestone | Deliverable |
|------|-----------|-------------|
| 2 | ✅ **Prototype** | Driveable car + infinite city + HUD |
| 5 | **Alpha 1** | Real car models + PBR textures + particles |
| 9 | **Alpha 2** | Curved roads + intersections + weather |
| 14 | **Beta 1** | Traffic + police + collisions |
| 20 | **Beta 2** | Race mode + garage + audio + mobile |
| 24 | **Release** | Polish + performance + WebGPU option |

---

*Last updated: 2026-08-11*
*Prototype version: 0.1.0*
