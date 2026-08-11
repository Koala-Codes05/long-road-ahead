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

---

## ✨ Prototype Features

- 🌃 **Infinite procedural city** — Chunk-based streaming, generates as you drive
- 🏗️ **Dynamic buildings** — Canvas-texture windows, neon accents, rooftop lights
- 🚗 **Arcade car physics** — Acceleration, braking, drift (handbrake), nitro
- 🎥 **Chase camera** — Smooth follow with speed-responsive FOV & distance
- 💡 **Dynamic lighting** — Point-light pool, headlights, street lamps, underglow
- 🌟 **Post-processing** — Unreal Bloom, ACES Filmic tone mapping
- 🌙 **Night atmosphere** — Sky gradient shader, exponential fog
- 📊 **HUD** — Speedometer, tachometer, gear indicator

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
