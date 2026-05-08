# Out and Back

**Live:** https://outback.q5m.ai — single-page TT split calculator. Auto-deploys on push to `main` (Cloudflare Workers static assets, project `out-and-back`).

A power-based out-and-back time-trial planner. Given your power, equipment, course, and wind, it predicts each leg's speed, the time vs. a flat-and-calm baseline, and the time-loss penalty from asymmetric legs. Going the other direction, calibrate from observed splits to back-solve CdA or wind speed.

## Physics model

```
P·η = ½·ρ·CdA·draft·(v + v_w)²·v + (m_r + m_b)·g·(Crr·cosθ + sinθ)·v
```

Solved for `v` per leg via Newton's method. Wind is decomposed into parallel (head/tail) and crosswind components from a course-heading + wind-from compass; only the parallel piece changes apparent wind. A `Wind factor` knob converts weather-station 10 m wind to cyclist-height (~1–2 m) wind.

`Ideal` time is defined as flat-and-calm (`vhwMs=0, gradePct=0`) at the same average power — the baseline against which the wind/grade penalty is measured.

## Calibration (Compare to actual splits)

Two back-solves from observed leg speeds:

- **Derived CdA** — bisects CdA so predicted average leg speed matches observed
- **Derived wind speed** — bisects windKph so predicted Δv between legs matches observed

CdA targets the magnitude of the average; wind speed targets the asymmetry.

## Run locally

```sh
npm install
npm run dev      # http://localhost:5227 (port derived from project name)
npm run test     # vitest watch mode
npm run test:run # vitest one-shot
npm run build    # production bundle
npm run lint     # eslint
npm run deploy   # vite build + wrangler deploy
```

## Layout

- `src/components/OutAndBackCalculator.jsx` — the full UI, state, and URL-hash sync
- `src/lib/physics.js` — pure power/speed solver and back-solvers (no React, no DOM)
- `src/lib/physics.test.js` — vitest seed coverage for the solvers

## Stack

- React 19 + Vite 8
- Tailwind CSS 3
- lucide-react icons
- Vitest 3 for unit tests
- Geist Sans / Geist Mono (loaded from Google Fonts at runtime)
- Cloudflare Workers static assets, custom domain `outback.q5m.ai`

## Credits

Power model adapted from Gaelen Merritt's [`gmerritt123/ttt_model`](https://github.com/gmerritt123/ttt_model/).
