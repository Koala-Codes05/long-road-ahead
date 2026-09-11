# Photo Mode & Tiled Super-Resolution Renderer

Toggle: **P** (or the 📷 PHOTO badge). Exit: **P** or **ESC**.

## Overview

Photo mode freezes the entire simulation — car physics, rain volume, tire
spray, smoke and windshield droplets — while handing you a free cinematic
camera. Because the frame never changes, the super-resolution renderer can
capture it in pieces and stitch a perfect final image.

## Camera controls

| Input | Action |
|---|---|
| Left-drag | Orbit around the car |
| Mouse wheel | Dolly in/out (2.4–24 m) |
| `Q` / `E` | Lower / raise camera height |
| `R` | Reset to the default behind-car framing |
| `ENTER` | Capture (current selection: viewport or super-res) |

## Grade controls

- **Exposure** — multiplies the weather preset's tone-mapping exposure
- **Field of view** — 20–100°
- **Bloom** — post glow strength
- **Film grain** — 35mm grain intensity (frozen during capture so tiles match)
- **Filters** — NEON (cool + saturated), GOLDEN (warm), NOIRE (B&W), VHS (hot + grainy), NONE

## Render modes

### RENDER (viewport)
Captures the scene at the current canvas resolution through the full
post-processing chain (bloom, grade, grain, rain refraction) and downloads it.

### SUPER-RES RENDER (tiled 2K / 4K / 8K / 16K)
1. The output size is derived from the current camera aspect ratio
   (e.g. 4K on a 16:9 window = 3840×2160; 16K = 15360×8640).
2. The frame is sliced into ≤ 2048 px tiles. For each tile the engine:
   - resizes renderer + composer to the tile,
   - points the camera sub-frustum at it (`camera.setViewOffset`),
   - renders the complete composer chain,
   - reads pixels out and pastes the tile into the giant canvas.
3. The finished canvas is encoded as PNG or JPEG and downloaded.
4. Thumbnails are kept in the session gallery (bottom-left).

16K ≈ 530 MB of RGBA canvas — the game asks for confirmation and can take
~10 s; a cancel button is available in the progress modal.

## Why tiled?

WebGL backbuffer and canvas sizes are limited (commonly 4096–16384 px) and a
single-pass 16K render would exhaust GPU memory. Tile-by-tile rendering keeps
peak memory under ~20 MB regardless of the final resolution, works with any
GPU, and every post effect (bloom, planar wet-road reflections, rain glass)
is preserved exactly because each tile runs the real composer.
