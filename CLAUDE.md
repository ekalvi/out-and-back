# Notes for Claude working in this repo

## Project shape

Single-page TT split calculator. The UI is one big component (`src/components/OutAndBackCalculator.jsx`) that owns all state, URL-hash sync, presets, and rendering. Pure physics lives in `src/lib/physics.js` and is independently testable via `src/lib/physics.test.js` (vitest).

## Physics module — what lives there

`src/lib/physics.js` exports the solvers used by the UI. None of them touch React or the DOM:

- `solveSpeedFromPower(...)` — Newton's-method root for `P·η = ½·ρ·CdA·draft·(v + v_w)²·v + (m_r + m_b)·g·(Crr·cosθ + sinθ)·v`
- `findPowerForAvg(...)` — bisects the free leg's power so the harmonic-mean **avg power** equals a target
- `findPowerBackForAvgSpeed(...)` — bisects the back-leg power so the time-weighted **avg speed** (`2·vOut·vBack/(vOut+vBack)`) equals a target
- `bisectPowerForAbsDeltaV(...)` — finds an out/back power pair that produces a target leg-to-leg Δv while holding avg speed
- `optimizePowerSplit(...)` — golden-section search for the out/back split that minimizes total time at fixed avg power
- `impliedCdAFromSplits(...)` — back-solves CdA so predicted **average** speed matches observed
- `impliedWindSpeedFromSplits(...)` — back-solves windKph so predicted **Δv** matches observed

Most of these accept a `physics` bag (`{ cda, mass, crr, lossDtPct, rho, draft }`) plus per-call leg-specific args (`vhwOutMs`, `vhwBackMs`, `gradeOut`, `gradeBack`, …).

## Known issue: solver clamp trap

`solveSpeedFromPower` clamps Newton's negative-update proposals to `0.05`. With strong tailwind + significant downhill (e.g., `power=120, vhwMs=-1/3.6, gradePct=-5.8`), both `f(0.05)` and `f'(0.05)` are negative, so the iteration re-clamps and gets stuck at `0.05` even though a real positive root (~18.5 m/s) exists. There's a regression-marker test pinning this behavior in `physics.test.js`. A proper fix would replace the bare clamp with a fallback (bisection bracketed by a known sign change, or a damped step).

## Two averages, two constraints

The UI distinguishes **average power** (harmonic-mean weighted by time) from **average speed** (harmonic mean of leg speeds). They're not interchangeable. When wiring new actions:

- "Optimize split" preserves **avg power** — only out/back power values move.
- "Δv slider" preserves **avg speed** — out/back power values move so the time-weighted speed average stays put.

Don't substitute one for the other.

## State + URL

State is one big set of `useState` hooks at the top of the component. `STATE_KEYS` maps each long key (`distance`) to a 2-letter short key (`di`) for the URL hash. `encodeStateToHash`/`decodeStateFromHash` handle round-trips; the hash is rewritten via `history.replaceState` on every change. There's no router. Presets are stored in `localStorage` under `outback:presets`.

`DEFAULTS` (right above the component) is the canonical defaults object. Reset-to-defaults reads from it; the `useState` initializers also do. If you add a new state field, update both the `useState` line and `DEFAULTS`, and add a row to `STATE_KEYS` so it survives URL share/preset save.

## UI conventions

- Tailwind for styling — no CSS modules, no styled-components.
- `lucide-react` for icons.
- "Sparkles" glyph is reserved for solver-backed actions (Optimize, Use derived CdA, Use derived wind speed).
- Color-coded leg bar (`legBackground`) maps parallel head/tailwind to a red/green tint; reds = headwind, greens = tailwind. The U-turn icon centered above the bar marks the turnaround.

## Workflow

```sh
npm run dev       # Vite, http://localhost:5227
npm run test      # vitest watch
npm run test:run  # vitest one-shot (use this in CI / pre-commit)
npm run build     # production bundle
npm run lint
npm run deploy    # vite build && wrangler deploy
```

Fixed dev port (5227) is so URL-hash share links work consistently across sessions.
