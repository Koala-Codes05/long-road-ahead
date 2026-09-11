# SOVEETA CATIN BEALALIM — Driver Character

> "Eyes on the road, racer."

Soveeta is the playable driver character of Long Road Ahead, built from the
concept images supplied for this sprint and re-rendered as fully
**photorealistic key art**.

## Design

| Element | Detail |
|---|---|
| Headgear | White porcelain-shell helmet rig with signature cat-ear antenna fins |
| Suit | Gloss black tech bodysuit with matte-white ceramic armor plates, fine mechanical seams |
| Lower | Black pleated armor skirt, crimson-red thigh-high stockings, white armored heel boots with brass ring joints |
| Weapon | Katana, carried low at her side |
| Persona | Ex-Kaido-Works test pilot; outlaw street-racer; "NEKO-01" |

## Assets

| File | Used for |
|---|---|
| `assets/character/soveeta_portrait.png` | HUD driver chip avatar, loading driver card |
| `assets/character/soveeta_full.png` | Driver dossier full-body art, in-world hero billboard |
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
