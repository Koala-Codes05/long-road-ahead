# Long Road Ahead — Improvement Sprint (Sep 2026)

This document maps every requested improvement to what was actually done in this branch.

## Headline features

### 1. Playable character — SOVEETA CATIN BEALALIM
Built from the provided reference images (white porcelain tech-armor, cat-ear
headgear, ponytail, black bodysuit, crimson stockings, katana) and the
photorealism face reference, regenerated as fully **photorealistic** key art:

- `assets/character/soveeta_full.png` — full-body key art (profile dossier art)
- `assets/character/soveeta_portrait.png` — HUD avatar / loading card
- `assets/character/soveeta_garage.jpg` — loading screen & dossier backdrop

She is wired into the game (`js/character.js`):
- Loading screen driver card + garage backdrop
- HUD driver chip (top-left) with **live quips** reacting to gameplay
- Full **driver profile dossier** (TAB key or click her chip)
- **Voice lines** from the female voice pack (`assets/Sounds/soveeta/`):
  - NOS engagement → effort shouts
  - Burnouts / donuts / big drift chains → laughs
  - Hard turns → attack yells
  - New record / photo saved → celebration lines
- Her hero art appears **in-world** on highway billboards (every 5th board)

### 2. Photorealistic graphics pass
- Renderer pixel ratio cap raised `1.25 → 2.0` (full-res HiDPI rendering)
- Shadow filtering switched to `PCFSoftShadowMap`, moon shadow map `1024 → 2048`
- Bloom buffer upgraded `0.25x → 0.5x` (tighter neon/headlight/wet bloom), radius `0.40 → 0.55`
- The full modular wet-road stack is now live: planar road reflections, animated
  rain-ripple normals, puddle depth animation, dry→wet material interpolation
- New neon city look (pink/cyan/amber glow) bracketing the NFS-2015 reference shots

### 3. Dedicated Photo Mode + tiled super-resolution render
`js/photoMode.js`, toggle with **P**, or the 📷 PHOTO HUD badge (ESC exits).

- Free cinematic orbit camera (drag rotate, wheel zoom, Q/E height, R reset)
- The whole simulation freezes (rain, spray, smoke) so every tile stitches perfectly
- Live grade controls: exposure, FOV, bloom, film grain + LUT filters
  (NONE / NEON / GOLDEN / NOIRE / VHS)
- **RENDER** — instant capture of the current viewport (PNG/JPEG)
- **SUPER-RES RENDER** — renders the frozen frame **tile by tile** via
  `camera.setViewOffset` + `readPixels` at **2K / 4K / 8K / 16K**, stitches
  everything into one giant canvas and exports a download. Works on any GPU —
  the window never has to exist at that size. Progress modal shows per-tile
  progress with ETA and a cancel button. Session gallery keeps thumbnails.

## Requested improvement checklist

| Area | Status | Detail |
|---|---|---|
| Asset & memory weight | ✅ Done | Deleted ~700 MB unreferenced: `F1-75Cl.glb` (47 MB), `car.glb` (32 MB), brackeys VFX bundle (71 MB), NOX sound packs (~260 MB), duplicate road textures (1k + root 4K set), unused HDRI `.tres`/`.usdc`/tonemapped JPGs, `assets/City/*.fbx`, `assets/Textures`, `assets/weather`. Remaining assets = 109 MB, every file referenced by code. (The `kb3d_neocity`/`cyberpunk_car`/`procedural_city_6`/`drift_race_track` assets named in the request no longer existed in this branch.) |
| Road streaming / infinite world | ✅ Done + verified | `world.js` already streams merged-geometry chunks around the car (4 ahead / 2 behind) — the "224 avenue clones / 4.8 km cap" belonged to an older branch. City roadside content now streams inside the same chunk system (`js/roadside.js`) and is disposed with the chunk, so the road is truly infinite. |
| City atmosphere | ✅ Done | `js/roadside.js` (new `RoadsideGenerator`): deterministic storefronts + skyscrapers with emissive lit windows flank the whole city section, neon sign plates (RACE ZONE / TUNING SHOP / GARAGE / ARCADE…), a green-lit gas station with price board once per city block, plus NFS-style ad billboards and the SOVEETA hero poster on the highway. |
| Weather consolidation | ✅ Done | `main.js` now imports `js/weather/WeatherSystem.js` (the modular engine). The legacy `js/weather.js` monolith is **deleted**. Duplicate scene-lighting/fog logic removed from the modular `setWeather` (main.js `applyWeatherEnvironment` is the single authority). Now live and previously disconnected: `RoadImpactSplashes`, `WiperController`, `WetRoadManager` + planar puddle reflections, `VolumetricAtmosphericFog`, `LightningSystem`, `TireMist` (wet tracks/spray/mist/dry smoke). Composer re-attach handled via `weather.reattachComposer()`. |
| Audio multi-vehicle support | ✅ Done | New `js/vehicleProfiles.js` registry. Three profiles: **Ferrari 458 Italia** (NA V8 scream), **Kaido MK-IV "2JZ"** (deep twin-turbo I6 growl + high turbo whistle), **Raven V10 RS** (high-rev wail). Each defines its own pitch/RPM curve, filter sweep, exhaust sub-bass frequencies, tire-squeal bandpass centers and nitro timbre. Switch with **T** or the 🏎 garage badge; samples hot-swap live. |
| Gameplay feedback loop | ✅ Done | `js/feedback.js`: `driftingSystem.driftScore` chains are bound to `#dc-score` fame counter; chains bank when you stop sliding (live chain counter `#dc-chain`); burnout/donut/hard-turn detection triggers center-screen score flashes, popup banners, fame bonuses with multipliers, **extra tire smoke** (`TireMist.spawnManeuverBurst`) and **louder squeal** (`audioEngine.squealBoost`); Soveeta voices react. |
| Repository hygiene | ✅ Done | `backups/`, `rain_system_backup/`, `temp_pan`, `temp_rainexplain.md` removed; docs formalized under `docs/` (this file, PHOTO_MODE, CHARACTER, WEATHER). |

## Controls (updated)

| Key | Action |
|---|---|
| `P` | Photo Mode (tiled 2K–16K super-res capture) |
| `TAB` | Driver dossier (Soveeta) |
| `T` | Garage — cycle vehicle audio profile |
| `R` | Rain FX mode |
| `C`/`V` | Camera views |
| `Space` | Handbrake drift |
| `L-SHIFT` | Nitro |
