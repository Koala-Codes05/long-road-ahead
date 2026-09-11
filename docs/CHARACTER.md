# SOVEETA CATIN BEALALIM — Driver Character

> "Eyes on the road, racer."

Soveeta is the playable driver character of Long Road Ahead, built from the
concept images supplied for this sprint and re-rendered as fully
**photorealistic key art**.

## Design — Wardrobe (switch in the driver dossier, TAB)

| Outfit | Detail | Source reference |
|---|---|---|
| 🦾 **COMBAT RIG** (default) | White porcelain-shell cat-ear helmet rig, gloss black tech bodysuit with ceramic armor plates, pleated armor skirt, crimson thigh-high stockings, armored heel boots with brass joints, katana | Cat-ear armor concept art |
| 🧶 **STREET KNIT** | White chunky rib-knit cropped sweater (gold half-zip, bishop sleeves, harness straps with gold buckles), glossy black latex bodysuit with white V accents, glossy heeled boots, black satin bow ponytail | Outfit reference image |

The choice persists via `localStorage` and swaps her HUD chip avatar,
dossier art and loading driver card instantly. Her in-world hero billboard
stays in the COMBAT RIG.

Photoreal identity (both outfits): the photorealism face reference — natural
skin, dark brown ponytail, dark eyes, calm confidence.

## Assets

| File | Used for |
|---|---|
| `assets/character/soveeta_portrait.png` | HUD avatar / loading card (Combat Rig) |
| `assets/character/soveeta_full.png` | Dossier art (Combat Rig), in-world hero billboard |
| `assets/character/soveeta_street_portrait.png` | HUD avatar / loading card (Street Knit) |
| `assets/character/soveeta_street_full.png` | Dossier art (Street Knit) |
| `assets/character/soveeta_garage.jpg` | Loading screen backdrop, dossier blurred backdrop |
| `assets/Sounds/soveeta/*.wav` | Her voice line bank (effort / laugh / attack) |

> Source: six reference images supplied with the sprint brief (cat-ear armored
> concept art, a photorealism face reference, and four NFS-2015-style night
> racing mood shots). The photoreal key art above was generated from them.

## Systems (`js/character.js`)

- **HUD chip** — portrait + name, top-left; click opens the dossier
- **Quips** — contextual one-liners reacting to nitro, drifts, stunts, garage swaps, weather changes and photo captures
- **Driver dossier** (TAB) — full-body art, bio, stats; her best drift chain updates live as you set records
- **Voice** — `playVoice(bank)` picks a random line from the matching bank with per-bank cooldowns:
  - `nitro` → Effort lines on NOS engagement
  - `laugh` → Burnouts, donuts, big chains, garage changes
  - `best` → Long celebration on records and photo saves
  - `attack` → Hard-turn yells
- **In-world presence** — the NightRunners hero billboard (every 5th highway board) shows her key art

## Roadmap hooks

- The dossier's `BEST CHAIN` stat persists per session; wire to `localStorage` for permanence.
- Voice banks are simple URL lists — drop localized lines into `assets/Sounds/soveeta/` and extend `VOICE_BANKS`.
