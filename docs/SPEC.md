# Forgeline — Specification

Forgeline is a Star Citizen refinery companion:

1. **Estimate** a refinery work order (mining ore, gems, salvage construction materials) for every refining method and see the expected earnings.
2. **Track** refinery orders across stations: a live countdown per order and a popup listing finished orders on each page load.

No account. Orders live in the user's browser. The server stores only public game data and anonymous refinery quotes.

Status: v1 draft, 2026-11-20.

---

## 1. Principles

- **No personal data on the server.** No accounts, no IDs, no IP storage, no title or free text sent to the server.
- **Small, fixed-size server storage.** The server keeps reference data, prices, and anonymous quotes **for the current patch only**.
- **Browser-first.** Orders, history and settings are in IndexedDB. Backup is a JSON export/import.
- **Anything the game accepts as a refinery order can be entered.** Ores, gems and salvage raw construction materials, mixed in one order.
- **English only.** Numbers formatted like the game (`268,400 aUEC`).
- **Estimates are explained.** Every estimate shows where its numbers come from (baseline, shared quotes, your own orders) and how old the prices are.

---

## 2. Architecture

```
 Browser (Svelte SPA)                    Server (Docker)
 ┌──────────────────────┐   GET /data/*.json   ┌─────────────────────────────┐
 │ IndexedDB            │ ◄────────────────── │ app  (Fastify)               │
 │  orders, settings    │                      │  - serves built SPA          │
 │ Calculation engine   │   POST /api/quotes   │  - serves /data/*.json       │
 │ (shared/)            │ ──────────────────► │  - POST /api/quotes          │
 └──────────────────────┘   (opt-in, anon)     └──────────────┬──────────────┘
                                                               │ shared volume /data
                                               ┌──────────────┴──────────────┐
                                               │ worker (Node, daily)         │
                       UEX API 2.0  ◄───────── │  - fetch reference + prices  │
                                               │  - detect patch change       │
                                               │  - recompute aggregates      │
                                               │  - write *.json, SQLite      │
                                               └─────────────────────────────┘
```

Only the worker talks to UEX. The browser never calls UEX.

### 2.1 Repository layout

```
forgeline/
├─ web/            Svelte + Vite single-page app
├─ server/         Fastify app (app.js) and daily job (worker.js)
├─ shared/         Calculation engine, validation, formatting (used by web and server)
├─ docs/           SPEC.md
├─ .github/workflows/image.yml   builds and pushes the Docker image
├─ Dockerfile
├─ docker-compose.yml
├─ .env.example
├─ README.md
└─ .local/         NOT pushed: tests, fixtures, scratch (git-ignored)
```

Language: JavaScript (ES modules) with JSDoc types. Node 22 LTS.

The image is built by GitHub Actions (`image.yml`) on every push to `main` and published as `ghcr.io/mathisvkg/forgeline`. Portainer pulls it; `docker-compose.yml` has no `build:`.

---

## 3. Data on the server

All files live in the Docker volume mounted at `/data`.

### 3.1 `static-data.json` (rebuilt daily)

```json
{
  "generatedAt": "2026-11-20T03:17:00Z",
  "patch": "4.10.2",
  "stations": [{ "id": "arc-l1", "name": "ARC-L1 Wide Forest Station", "short": "ARC-L1", "system": "Stanton" }],
  "materials": [{ "id": "titanium", "name": "Titanium", "kind": "ore", "refinedId": "titanium" }],
  "methods": [{ "id": "dinyx-solventation", "name": "Dinyx Solventation", "uex": { "rating_yield": 3, "rating_cost": 1, "rating_speed": 1 } }],
  "bonuses": [{ "stationId": "arc-l1", "materialId": "titanium", "pct": 5 }]
}
```

- `kind`: `ore` | `gem` | `salvage`. `gem` is kept for later; UEX currently marks no gem as refinable.
- IDs are stable slugs. UEX numeric IDs are kept internally by the worker for mapping (`uex_map`, §3.4). Method ids are full-name slugs (`dinyx-solventation`).
- **Stations:** a station (or city) is listed only with real refinery evidence: a live UEX terminal with `type === "refinery"`, or at least one `refineries_yields` row. The UEX `has_refinery` flag alone is not enough.
- **Materials:** every UEX commodity with `is_refinable`. `name` has no "(Ore)" / "(Raw)" suffix. Salvage materials are Construction Material **Rubble**, **Pebbles** and **Salvage**, all refining into Construction Materials (`refinedId: "construction-materials"`).
- **Methods:** `uex` holds the UEX ratings `rating_yield`, `rating_cost`, `rating_speed` (1–3). UEX gives no numeric yield, cost or time.
- `bonuses.pct` can be negative (penalty); zero bonuses are omitted.
- Feeds every dropdown (station, material, method).

### 3.2 `prices.json` (rebuilt daily)

```json
{
  "generatedAt": "2026-11-20T03:17:00Z",
  "patch": "4.10.2",
  "refined": { "titanium": { "avg": 8900, "best": 9420, "bestTerminal": "Area18 TDD", "samples": 14, "updatedAt": "2026-11-20T06:48:55Z" } },
  "raw":     { "titanium": { "avg": 2500, "best": 3098, "bestTerminal": "Ruin Station", "samples": 12, "updatedAt": "2026-10-16T09:55:28Z" } }
}
```

Average rule, per commodity, from UEX terminal sell prices:
1. Drop prices `<= 0` and reports older than **7 days** for refined prices, **60 days** for raw prices (UEX raw reports are rare).
2. `n >= 5` → trimmed mean, dropping `floor(n × 0.1)` prices at each end (so none for n = 5–9). `n < 5` → median. `n = 0` → no price (UI shows `—`).
3. Raw prices only: a sample below **5 %** of the matching refined average (`RAW_MIN_RATIO = 0.05`) is implausible and dropped, when that refined average exists.
4. `best` = highest remaining price, with its terminal name.
5. `updatedAt` = date of the newest sample kept, so the UI can show the age ("price from 12 days ago").

Prices are whole aUEC per SCU.

### 3.3 `aggregates.json` (rebuilt daily, from shared quotes)

The worker writes this file on every run, so it always exists; `methods` may be empty (`{}`) until there are shared quotes. Clients treat empty `methods` like no data.

```json
{
  "generatedAt": "2026-11-20T03:17:00Z",
  "patch": "4.10.2",
  "methods": {
    "dinyx-solventation": {
      "yield":   { "median": 0.93, "n": 37 },
      "costPerScu": { "median": 61, "n": 37 },
      "time":    { "baseSec": 1800, "secPerScu": 1510, "n": 37 }
    }
  }
}
```

### 3.4 SQLite (`/data/forgeline.db`)

```sql
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);          -- current_patch, last_run
CREATE TABLE quotes (
  id INTEGER PRIMARY KEY,
  patch TEXT NOT NULL,
  station_id TEXT NOT NULL,
  method_id TEXT NOT NULL,
  cost_auec INTEGER NOT NULL,
  duration_sec INTEGER NOT NULL,
  total_raw_cscu INTEGER NOT NULL
);
CREATE TABLE quote_materials (
  quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL,
  raw_cscu INTEGER NOT NULL,
  refined_cscu INTEGER NOT NULL
);
CREATE TABLE uex_map (                                         -- stable slugs for UEX ids
  kind TEXT NOT NULL,          -- station | material | refined | method
  slug TEXT NOT NULL,
  uex_id INTEGER NOT NULL,
  PRIMARY KEY (kind, slug),
  UNIQUE (kind, uex_id)
);
```

`uex_map`: once a UEX id has a slug it keeps it, even if UEX renames it; collisions get `-2`, `-3`. `material` maps raw commodities, `refined` the refined commodities used for prices (they often share a name). Stations and cities use separate UEX id spaces, so `station` stores the space station id as is, city ids negative (`-id_city`) and outposts `-(1e6 + id_outpost)`. Schema versions use `PRAGMA user_version`.

No timestamp, no IP, no client identifier. When the worker sees a new patch, it deletes every quote of the previous patch.

---

## 4. Data in the browser

IndexedDB database `forgeline`, schema version 1. Stores: `orders` (keyPath `id`, indexes `status` and `endsAt`) and `settings` (keyPath `key`, one record per setting). Code: `web/src/lib/storage/`. If IndexedDB is unavailable (some private modes), the app shows that orders can't be saved.

### 4.1 Order

```js
{
  id: "uuid",
  title: "Titanium haul #4",
  stationId: "arc-l1",
  methodId: "dinyx-solventation",
  materials: [{ materialId: "titanium", rawCScu: 3200, refinedCScu: 3000 }], // refinedCScu null if unknown
  costAuec: 2640,            // null if unknown
  durationSec: 67200,        // from the terminal timer
  endsAt: "2026-11-21T18:22:00Z",
  status: "refining",        // refining | collected | cancelled
  collectedAt: null,
  cancelledAt: null,
  source: "estimate",        // estimate | manual
  estimate: { methodId, totalRefinedCScu, costAuec, durationSec, revenueAuec, netAuec, perHourAuec, paramsSource, pricesGeneratedAt }, // or null
  patch: "4.10.2",           // null if static data was not loaded
  shared: false,             // true if the quote was sent anonymously
  createdAt: "…",
  updatedAt: "…"
}
```

- Every field is always present; unknown optional values are `null`. `title` is 1–60 characters, 1–20 material lines without duplicates, `durationSec` 60 s – 7 days.
- `estimate` is a small snapshot of the chosen method only, not the whole `estimate()` result.
- `endsAt = createdAt + durationSec` when saved; editing `durationSec` recomputes `endsAt` from the edit time.
- **Status:** `refining → collected` (sets `collectedAt`), `refining → cancelled` (sets `cancelledAt`), and undo `collected | cancelled → refining` (clears both). Other transitions are refused.
- **Ready** is not stored: an order is ready when `status === "refining"` and `now >= endsAt`.
- **Order list:** ready first (oldest `endsAt` first), then refining by `endsAt`, then history by most recent change.
- **History purge:** on each page load, delete orders whose status is `collected` or `cancelled` and whose `collectedAt`/`cancelledAt` is older than **14 days**. Ready-but-not-collected orders are never purged.

### 4.2 Settings

`{ shareByDefault: false, lastSeenPatch: "4.10.2", persistRequested: false, persisted: false }` (defaults; `lastSeenPatch` starts as `null`).

### 4.3 Backup file

```json
{ "format": "forgeline-backup", "version": 1, "exportedAt": "…", "orders": [ … ] }
```

File name `forgeline-backup-YYYY-MM-DD.json`. Import merges by `id`; the copy with the newer `updatedAt` wins, equal → unchanged. Files over 5 MB, invalid JSON, another `format` or an unknown (newer) `version` are refused with a clear message. Invalid orders are skipped and counted.

`navigator.storage.persist()` is requested once, on the first saved order; the result is kept in settings.

Tabs stay in sync through `BroadcastChannel("forgeline")`: every write posts `{ type: "orders-changed" }`.

---

## 5. Calculation engine (`shared/`)

Quantities are integers in **cSCU** (1/100 SCU). Money in whole aUEC. Time in seconds.

### 5.1 Parameters per method

For each method `m`:
- `y[m]` yield ratio
- `c[m]` cost per raw SCU (aUEC)
- `T0[m]` base time (s), `k[m]` seconds per raw SCU

Station bonus `b[s, i]` in percent for station `s` and material `i` (0 if none).

### 5.2 Formulas

```
refined_i  = round(raw_i × y[m] × (1 + b[s,i] / 100))
cost       = round(totalRawScu × c[m])
time       = T0[m] + totalRawScu × k[m]
revenue    = Σ refined_i/100 × price.refined[i].avg
net        = revenue − cost
perHour    = net / (time / 3600)
sellRaw    = Σ raw_i/100 × price.raw[i].avg
```

The calculator computes this for all methods. It tags **Best net** and **Best per hour**, and shows **Sell raw** as a comparison. Materials with no price are listed but excluded from revenue, with a warning.

Open questions, answered by data in later tasks: the game's rounding rule, and whether cost or time depend on the material. If quotes show a material effect, add a per-material factor.

### 5.3 Where parameters come from (blending)

Each parameter `p` combines three sources:

```
p = (K × baseline + n_shared × median_shared + 2 × n_own × median_own) / (K + n_shared + 2 × n_own)
K = 5
```

- **baseline:** shipped defaults (5.4). UEX only provides 1–3 ratings, so the baseline is the provisional table in §5.4, corrected by real quotes.
- **shared:** `aggregates.json`, current patch only.
- **own:** the user's saved orders from the current patch that have a full terminal quote.

The UI shows the dominant source: "Baseline", "37 shared quotes" or "Your 4 orders". Before 5 data points exist, it shows "Low confidence".

### 5.4 Baseline defaults (provisional, calibrated by quotes)

| Method id | yield | cost/SCU (aUEC) | base time (s) | s per SCU |
|---|---|---|---|---|
| dinyx-solventation | 0.93 | 60 | 300 | 1500 |
| pyrometric-chromalysis | 0.90 | 150 | 300 | 860 |
| ferron-exchange | 0.89 | 95 | 300 | 780 |
| thermonatic-deposition | 0.82 | 55 | 300 | 740 |
| electrostarolysis | 0.82 | 90 | 300 | 490 |
| kazen-winnowing | 0.75 | 50 | 300 | 450 |
| gaskin-process | 0.80 | 160 | 300 | 280 |
| cormack | 0.72 | 95 | 300 | 200 |
| xcr-reaction | 0.70 | 165 | 300 | 180 |

These are provisional starting values (`shared/baseline.js`). The relative ordering matches the Star Citizen Wiki ratings; the numbers are replaced by shared and own quotes through blending (5.3). A method in `static-data.json` without a baseline row gets the per-column median of this table and is flagged `missingBaseline`.

### 5.5 Nightly fit (worker)

From current-patch quotes, per method:
- yield sample per material line = `refined / (raw × (1 + bonus/100))` → median.
- cost sample = `cost / totalRawScu` → median.
- time: least-squares line `time = T0 + k × totalRawScu`. It needs `n >= 5` and at least 2 different sizes; otherwise `T0 = 0`, `k = median(time / totalRawScu)`.

### 5.6 Timer input

The user types the terminal's remaining time. Accepted: `18h 40m`, `18h40`, `18:40` (h:m), `1d 2h 5m`, `40m`. `endsAt = now + duration`. Display: main countdown `18h 40m left`, updated every minute, and local end time `Sat 21 Nov · 19:22` underneath.

---

## 6. Anonymous quote sharing

Opt-in per order (checkbox, off by default; the default can be changed in settings). It is only offered when the order has a full terminal quote (refined SCU per material, cost, time).

### 6.1 `POST /api/quotes`

```json
{
  "patch": "4.10.2",
  "stationId": "arc-l1",
  "methodId": "dinyx-solventation",
  "materials": [{ "materialId": "titanium", "rawCScu": 3200, "refinedCScu": 3000 }],
  "costAuec": 2640,
  "durationSec": 67200
}
```

Responses: `204` stored, `400` invalid, `409` wrong patch, `429` rate limited. Body limit 4 KB.

### 6.2 Validation

- `patch` equals the server's current patch.
- `stationId`, `methodId`, every `materialId` exist in `static-data.json`.
- 1–20 material lines, no duplicate material.
- `rawCScu` 1–1,000,000 per line; `refinedCScu >= 0`.
- Per line, `refined / raw` between 0.3 and 1.3.
- `costAuec` 0–10,000,000. `durationSec` 60–259,200 (1 min–72 h).
- Unknown fields are rejected.

### 6.3 Anti-abuse without storing anything

- In-memory rate limit: 30 requests per hour per IP. Never written to disk.
- Fastify request logging disabled. **Reverse proxy access logs must be off or IP-masked for `/api/quotes`** (documented in README).
- Medians, not means, so a few fake quotes cannot move estimates.

---

## 7. Daily worker

Schedule: once a day, 03:17 server local time (`WORKER_CRON`), plus once at container start if a data file is missing or the last run is older than 24 h. Runs never overlap. `node server/worker.js --once` runs the job once and exits 0/1.

1. Fetch the current game version from UEX. If it differs from `meta.current_patch`: delete old-patch quotes, update `meta`.
2. Fetch stations with refineries, commodities (ores, gems, salvage materials), refinery methods and refinery yields (station bonuses). Build `static-data.json`.
3. Fetch commodity sell prices (refined and raw). Build `prices.json`.
4. Recompute `aggregates.json` from SQLite.
5. Write each file atomically (write to `*.tmp`, then rename). If a UEX call fails, keep the previous file and log the error.

UEX API: base `https://api.uexcorp.uk/2.0/`, Bearer token (`UEX_TOKEN`, worker only, never logged), daily quota far above our usage. 8 requests per run. 15 s timeout, 2 retries (1 s, 4 s) on network errors and 5xx, none on 4xx.

| Resource | Fields used | Meaning |
|---|---|---|
| `game_versions` | `data.live` | Live patch (`data` is an object) |
| `space_stations` | `id`, `name`, `nickname`, `star_system_name`, `is_available_live` | Station name, short code, system |
| `terminals` | `type === "refinery"`, `is_available_live`, `id_space_station` / `id_city` / `id_outpost`, `city_name`, `star_system_name` | Refinery locations (`is_refinery` is unreliable, not used) |
| `commodities` | `id`, `name`, `kind`, `id_parent`, `is_refinable`, `is_refined`, `is_harvestable`, `is_available_live` | Raw materials (`is_refinable`); raw → refined via `id_parent` (either direction), else same name without suffix; `kind === "Scrap"` → salvage |
| `refineries_methods` | `id`, `name`, `rating_yield`, `rating_cost`, `rating_speed` | Methods and 1–3 ratings |
| `refineries_yields` | `id_commodity` (raw), `id_space_station` / `id_city`, `value` | Station bonus in % |
| `commodities_prices_all` | `id_commodity`, `price_sell`, `date_modified`, `terminal_name` | Refined sell prices |
| `commodities_raw_prices_all` | `id_commodity`, `price_sell`, `date_modified`, `terminal_name` | Raw sell prices |

`refineries_capacities` exists but is not used.

---

## 8. User interface

Style: industrial. Dark gunmetal (`#121417` background, `#1E2126` panels, `#2E3238` borders), hazard amber accent `#F2A900`, teal `#4FD1C5` for ready, condensed headings (Barlow Condensed), Barlow body, JetBrains Mono for numbers. Hazard stripe at the top. Reference mock-up: "SC Refinery Tracker – UI concept" design canvas.

Screens:
1. **Orders**: summary (ready, refining, estimated value), station filter, order cards with progress bar, countdown and end time. Actions: mark collected, cancel, edit, delete.
2. **Calculator**: station, material lines (dropdown and raw SCU), table of 9 methods (yield, cost, time, net, per hour, tags), sell-raw comparison, data-source line, "Save as order".
3. **New order**: "From estimate" (prefilled) or "Already started". Title, station, method, materials, time left, cost, refined SCU, computed "Ready at", share checkbox.
4. **Ready popup**: on page load, lists ready orders not yet collected. "Collected" per order, "Remind me later" (hides until next load).
5. **Settings / backup**: export, import, share-by-default, clear all data.

Every page works on a phone width.

Footer on every page:
> Forgeline is an unofficial Star Citizen fan site, not affiliated with the Cloud Imperium group of companies. All content on this site not authored by its host or users are property of their respective owners. Game data and prices provided by [UEX](https://uexcorp.space). Privacy: no account, no personal data; your orders stay in your browser.

---

## 9. Deployment

- One image (`Dockerfile`, multi-stage: build `web/`, then a Node 22 runtime), built by GitHub Actions on every push to `main` and published to GHCR as `ghcr.io/mathisvkg/forgeline:latest` and `:<commit sha>`.
- Deployed as a **Portainer stack from the Git repository** (compose path `docker-compose.yml`). Portainer pulls the image; the compose file has no `build:` and no `env_file:`.
- `docker-compose.yml`: services `app` (host port `PORT`, default 8080, container port 3000) and `worker`, same image, different command; shared named volume `forgeline-data` at `/data`.
- Stack environment variables: `UEX_TOKEN` (worker only), `PORT`, `TZ`, `WORKER_CRON`, optional `IMAGE_TAG` (default `latest`). Plain `docker compose` users can put them in `.env` for substitution.
- Health check: `GET /api/health` → `status`, `patch`, `lastRun`, `dataFiles`.

---

## 10. Development rules

- Only files the website needs are pushed. Tests, fixtures and temporary files stay in `.local/` (git-ignored).
- Claude does not commit, push or create branches. Everything is on `main`; the owner commits.
- Background checks are fine. Anything that opens a window or controls the owner's PC needs approval first and lasts 5 minutes at most.
- Work is split into tasks; each task ends with a report.

---

## 11. Implementation plan

| # | Task | Output |
|---|---|---|
| 1 | Spec and repo basics | `docs/SPEC.md`, `README.md`, `.gitignore`, `.env.example` |
| 2 | Project scaffold | `web/` Svelte+Vite, `server/` Fastify, `shared/`, Dockerfile, docker-compose, health route |
| 3 | Worker: UEX data | Endpoint mapping, `static-data.json`, `prices.json`, patch detection |
| 4 | Calculation engine | `shared/` formulas, blending, timer parsing, formatting + tests in `.local/` |
| 5 | Browser storage | IndexedDB layer, purge, backup export/import |
| 6 | Orders screen + ready popup | Dashboard, countdowns, status actions |
| 7 | Calculator screen | Inputs, method table, save as order |
| 8 | New order screen | Both modes, validation, share checkbox |
| 9 | Anonymous quotes | `POST /api/quotes`, SQLite, nightly fit, `aggregates.json` |
| 10 | Settings, footer, polish | Settings page, legal footer, phone layout, README deploy guide |

## 12. Sources

- UEX API 2.0 — https://uexcorp.space/api
- Star Citizen Wiki, Refining — https://starcitizen.tools/Refining
- RSI, Alpha 4.3.2 structural salvage notes (raw construction materials refine at refinery decks)

---

## Changelog

- 2026-11-20 — v1.1: aligned with Task 3 findings
- 2026-11-20 — v1.2: raw price plausibility filter, browser storage details
