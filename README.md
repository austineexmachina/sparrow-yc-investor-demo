# Sparrow Love Edit — Original Frontend Deployment

**Public Cloudflare URL:** https://sparrow-love-edit-web.austinechibueze905.workers.dev/

This repository deploys a snapshot of the **actual frontend HTML, CSS and JavaScript** from the private Sparrow Love Edit repository, not a custom investor landing page.

Source snapshot: `austineexmachina/sparrow-love-edit`, commit `ff7325930f355141f62c0ef78d595d63d62ae76d`. UI files were copied from `static/` with their existing layout and relative assets. Navigation links to the retired Cartoon Studio were removed. Other source files were not changed in the private repository.

## Original routes retained

| URL | Original frontend source |
| --- | --- |
| `/`, `/studio` | `static/index.html` |
| `/film` | `static/film.html` |
| `/ecosystem` | `static/ecosystem.html` |
| `/ecosystem/book` | `static/booking.html` |
| `/flight-travels`, `/ecosystem/flights` | `static/aviation.html` |
| `/ecosystem/map` | `static/home-map.html` |
| `/template` | Temporary redirect to existing Vercel Next.js Template Editor |
| `/cartoon` | HTTP 410 — retired |
| `/api/*` | HTTP 503 until real backend is deployed |

## Important current limitations

- **This is not the complete working Sparrow backend.** Cloudflare Free Workers do not run the existing Python FastAPI Docker container with FFmpeg and Blender. No authentication, OTP, user storage, streaming, AI video rendering, or booking processing is claimed as functional here.
- The original `ecosystem.js`, `ecosystem-social.css`, and `live-map.html` files could not be copied through the available publishing connector. The corresponding UI functions remain incomplete; no replacement/demo logic was fabricated.
- Large original map data files (`airports.csv` and the full Natural Earth GeoJSON) are not included in this public static package.
- The Template Editor has **not moved from Vercel**. The existing Vercel deployment remains active as a redirect target until a genuine Cloudflare port is available.
- GitHub Pages is not the deployment target for this multi-route Worker; use the Cloudflare URL above.
- No live user journeys or workflows have been tested in this release, as requested.

The private backend source, secrets, datasets, private uploads, and developer worktrees remain outside this public repo.
