# 🏎️ Long Road Ahead

> An open-world procedural racing game inspired by *Need for Speed*, built entirely with web technologies.

![Status](https://img.shields.io/badge/status-prototype-orange)
![Engine](https://img.shields.io/badge/engine-Three.js%20r160-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## 🎮 Play

```bash
npm run dev
```

Open **http://localhost:3000** in your browser (Chrome/Edge/Firefox recommended).

> **Note:** ES Modules require a local server — opening `index.html` directly won't work.

---

## 🕹️ Controls

| Key | Action |
|-----|--------|
| `W` / `↑` | Accelerate |
| `S` / `↓` | Brake / Reverse |
| `A` / `←` | Steer Left |
| `D` / `→` | Steer Right |
| `Space` | Handbrake (Drift) |
| `Shift` | Nitro Boost |
| `P` | **Photo Mode** — free camera + tiled 2K/4K/8K/16K super-resolution capture |
| `TAB` | **Driver dossier** — meet Soveeta |
| `T` | **Garage** — switch engine profile (458 V8 / MK-IV 2JZ / V10 RS) |
| `B` | **NFS garage paint** — Rosso Corsa / Midnight Purple / Electric Blue / Ghost Black / Solar Flare / Kaido Mint |
| `G` | **Handling mood** — Grip (Driveclub hardcore) / Balanced (NFS Heat) / Drift (NFS 2015) |
| `ESC` | **Pause menu** — resume / settings / controls, live stats |
| `R` | Rain FX mode |
| `C` / `V` | Camera view cycle |
| `L` | Headlights | `H` | Hazards | `Q`/`E` | Signals |

---

## ✨ Features

- 🦊 **Soveeta Catin BealaLim** — photorealistic driver character: HUD chip, live quips, voice lines, dossier (TAB) with wardrobe switcher (Combat Rig ⇄ Street Knit) and an **orbitable 3D model turntable** (procedural GLB; drop in `soveeta_3d_aaa.glb` to hot-swap a AAA model), in-world hero billboard
- 📷 **Photo Mode** — frozen-time camera suite with LUT filters and a **tiled super-resolution renderer** (2K/4K/8K/16K PNG/JPEG exports + session gallery)
- 🌃 **Infinite procedural road** — chunk-based streaming highway, technical section, mountain passes, city loop
- 🏙️ **Night city atmosphere** — emissive storefronts & skyscrapers, neon sign atlas, NFS-style billboards, green-lit gas station
- 🌧️ **Modular weather engine** — Driveclub-style windshield droplets, auto wipers, 3D rain volume, road impact splashes, planar wet-road reflections, animated rain ripples
- 🔊 **Multi-vehicle audio** — per-car pitch/RPM/exhaust profiles (458 V8 scream · 2JZ twin-turbo growl · V10 wail)
- 🏆 **Feedback loop** — drift-chain fame scoring, stunt popups (burnout/donut/hard-turn), score multipliers, smoke & squeal rewards
- 🚗 **Arcade car physics** — Pacejka-inspired drift model, drifting donuts, burnouts, nitro
- 🌟 **Photoreal post stack** — half-res Unreal Bloom, PCFSoft 2K shadows, cinematic grade, fisheye nitro cam, 35 mm grain

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Renderer** | [Three.js r160](https://threejs.org) (WebGL2) |
| **Post-fx** | UnrealBloomPass + ACES tone mapping |
| **Physics** | Custom arcade vehicle model |
| **Shaders** | GLSL sky dome gradient |
| **Fonts** | [Orbitron](https://fonts.google.com/specimen/Orbitron) + [Rajdhani](https://fonts.google.com/specimen/Rajdhani) |
| **Serving** | [serve](https://github.com/vercel/serve) (zero-config static server) |

---

## 📁 Project Structure

```
Long Road ahead/
├── index.html          # Entry point, HUD, import map
├── package.json        # Dev server script
├── css/
│   └── style.css       # HUD styling, loading screen, effects
├── js/
│   ├── main.js         # Scene, renderer, camera, game loop
│   ├── vehicle.js      # Car model + arcade physics
│   ├── world.js        # Procedural world generation
│   └── input.js        # Keyboard input manager
├── README.md           # This file
└── agent.md            # Full development roadmap & sources
```

---

## 🗺️ Roadmap

See **[agent.md](./agent.md)** for the full 6-month development plan with phases, milestones, asset sources, and technical deep-dives.

---

## 📄 License

MIT — Free to use, modify, and distribute.
