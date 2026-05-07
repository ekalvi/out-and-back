# Out and Back

**Live:** https://outback.q5m.io — single-page TT split calculator. Auto-deploys on push to `main` (Cloudflare Workers static assets, project `out-and-back`).

Out-and-back time trial split tool: predict the asymmetric-wind penalty from a base speed + Δv, or work backwards from observed leg speeds to the implied no-wind speed and time loss.

The math: average speed across the two legs is the harmonic mean `2·v₁·v₂ / (v₁+v₂)`, so wind always costs you time vs. the no-wind ideal — and the penalty is quadratic in Δv.

## Run locally

```sh
npm install
npm run dev      # http://localhost:5227 (port derived from project name)
npm run build    # production bundle
npm run deploy   # vite build + wrangler deploy
```

## Stack

- React 19 + Vite 8
- Tailwind CSS 3
- lucide-react icons
- Geist Sans / Geist Mono (loaded from Google Fonts at runtime)
- Cloudflare Workers static assets, custom domain `outback.q5m.io`
