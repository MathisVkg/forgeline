# Forgeline

A Star Citizen refinery companion: estimate refinery work orders for every method, then track your orders across stations with a countdown and a "ready" popup.

- No account. Your orders stay in your browser (export a JSON backup any time).
- Prices and game data are refreshed once a day from [UEX](https://uexcorp.space).
- Optional, anonymous sharing of refinery quotes improves estimates for everyone.

Full design: [docs/SPEC.md](docs/SPEC.md).

> Status: in development.

## Self-hosting

Requirements: Docker with Compose, and a free UEX API token (create an app on https://uexcorp.space/api).

```bash
git clone https://github.com/MathisVkg/forgeline.git
cd forgeline
cp .env.example .env        # then set UEX_TOKEN
docker compose up -d --build
```

The site is served on `http://localhost:8080` (change `PORT` in `.env`).

### Privacy note for hosts

The app stores no IP addresses and disables request logging. If you put a reverse proxy in front (Nginx, Traefik, Caddy…), turn off access logs or mask client IPs for `/api/quotes`.

## Development

Requirements: Node.js 22 or later.

```bash
npm install
npm run dev      # site on Vite's port (http://localhost:5173), API on http://localhost:3000
npm run build    # builds the site to web/dist
npm start        # serves web/dist and the API on http://localhost:3000
```

`npm run check` runs `svelte-check` on `web/` and a syntax check on `server/` and `shared/`.

## Data sources

- [UEX](https://uexcorp.space): game versions, stations, commodities, refinery data and prices (UEX API 2.0).
- [Star Citizen Wiki](https://starcitizen.tools/Refining): refining method ratings used for the initial defaults.

## Disclaimer

Forgeline is an unofficial Star Citizen fan site, not affiliated with the Cloud Imperium group of companies. All content on this site not authored by its host or users are property of their respective owners. Star Citizen®, Roberts Space Industries® and Cloud Imperium® are registered trademarks of Cloud Imperium Rights LLC.
