# Weather Engine Architecture (consolidated)

Single engine: `js/weather/WeatherSystem.js` (the legacy `js/weather.js`
monolith was removed in this sprint).

## Ownership split

| Concern | Owner |
|---|---|
| Scene background, fog color/density, sky dome uniforms, light rig, renderer exposure | `main.js → applyWeatherEnvironment(type)` |
| Rain particles, windshield droplets, wipers, wet-road optics, planar reflections, splash/ripple effects, tire mist/spray/tracks, volumetric fog sprites, lightning | `js/weather/WeatherSystem.js` |

This split was chosen deliberately: the atmosphere of this game is driven by
a custom sky-dome shader + lens-flare/moon rig that lives in `main.js`, so
`applyWeatherEnvironment` stays the single authority for *lighting*, while
the modular engine owns every *weather material and particle* behavior.

## Subsystems (all live)

| Module | Responsibility |
|---|---|
| `windshield/WindshieldPass.js` | GLSL screen-space glass refraction pass; brightness-shine map; resize plumbing |
| `windshield/WiperController.js` | 2D physics droplets (Lucas Bebber engine), auto wiper arcs in cockpit view, body clearcoat wetness |
| `particles/RainVolume3D.js` | Midground 3D rain needles, camera-velocity streaking |
| `particles/FarRainPoints.js` | Distant rain sheets |
| `particles/RoadImpactSplashes.js` | 1,500 instanced splash/ripple quads where drops strike asphalt |
| `particles/TireMist.js` | Wet tire-track ribbons, water displacement spray, wheel mist plume, **dry burnout smoke** (incl. `spawnManeuverBurst` stunt reward) |
| `materials/WetRoadManager.js` | Dry→wet roughness/metalness/env interpolation, animated dual-layer rain-ripple normals, puddle depth, emissive lane sheen |
| `materials/PlanarRoadReflection.js` | Half-res mirrored-world reflection projected onto the wet road |
| `materials/VolumetricClouds.js` | Rolling cloud dome layer |
| `lighting/LightningSystem.js` | Storm lightning flash scheduler (drives `uLightningFlash`) |
| `lighting/RainLighting.js` | Headlight/beam rain illumination |
| `lighting/VolumetricAtmosphericFog.js` | Ground mist cards + warm road-light scattering |

## Presets

`0 STORM` · `1 DRIZZLE` · `2 CLOUDY DAY` · `3 CLEAR` — selected from the HUD
weather bar or the `weather.setWeather(type)` API.

## Rain FX modes (R key)

`HYBRID (OLD + NEW)` · `CLASSIC GLASS` · `DRIVECLUB 3D` — change droplet
density/size/trails per camera mode.

## WebGL recovery

When the renderer context is rebuilt, `main.js` calls
`weather.reattachComposer(newComposer)` which re-registers the windshield
pass — no manual pass juggling.
