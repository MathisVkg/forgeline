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
├─ Dockerfile
├─ docker-compose.yml
├─ .env.example
├─ README.md
└─ .local/         NOT pushed: tests, fixtures, scratch (git-ignored)
```

Language: JavaScript (ES modules) with JSDoc types. Node 22 LTS.

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
  "methods": [{ "id": "dinyx", "name": "Dinyx Solventation" }],
  "bonuses": [{ "stationId": "arc-l1", "materialId": "titanium", "pct": 5 }]
}
```

- `kind`: `ore` | `gem` | `salvage`.
- IDs are stable slugs. UEX numeric IDs are kept internally by the worker for mapping.
- Feeds every dropdown (station, material, method).

### 3.2 `prices.json` (rebuilt daily)

```json
{
  "generatedAt": "2026-11-20T03:17:00Z",
  "patch": "4.10.2",
  "refined": { "titanium": { "avg": 8900, "best": 9420, "bestTerminal": "Area18 TDD", "samples": 14 } },
  "raw":     { "titanium": { "avg": 3900, "best": 4100, "bestTerminal": "…", "samples": 6 } }
}
```

Average rule, per commodity, from UEX terminal sell prices:
1. Drop prices `<= 0` and reports older than **7 days**.
2. `n >= 5` → trimmed mean (drop lowest 10% and highest 10%). `n < 5` → median. `n = 0` → no price (UI shows `—`).
3. `best` = highest remaining price, with its terminal name.

### 3.3 `aggregates.json` (rebuilt daily, from shared quotes)

```json
{
  "generatedAt": "2026-11-20T03:17:00Z",
  "patch": "4.10.2",
  "methods": {
    "dinyx": {
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
```

No timestamp, no IP, no client identifier. When the worker sees a new patch, it deletes every quote of the previous patch.

---

## 4. Data in the browser

IndexedDB database `forgeline`, schema version 1.

### 4.1 Order

```js
{
  id: "uuid",
  title: "Titanium haul #4",
  stationId: "arc-l1",
  methodId: "dinyx",
  materials: [{ materialId: "titanium", rawCScu: 3200, refinedCScu: 3000 }], // refinedCScu optional
  costAuec: 2640,            // optional
  durationSec: 67200,        // from the terminal timer
  endsAt: "2026-11-21T18:22:00Z",
  status: "refining",        // refining | collected | cancelled
  collectedAt: null,
  cancelledAt: null,
  source: "estimate",        // estimate | manual
  estimate: { /* snapshot of the estimate shown when saved, or null */ },
  patch: "4.10.2",
  shared: false,             // true if the quote was sent anonymously
  createdAt: "…",
  updatedAt: "…"
}
```

- **Ready** is not stored: an order is ready when `status === "refining"` and `now >= endsAt`.
- **History purge:** on each page load, delete orders whose status is `collected` or `cancelled` and whose `collectedAt`/`cancelledAt` is older than **14 days**. Ready-but-not-collected orders are never purged.

### 4.2 Settings

`{ shareByDefault: false, lastSeenPatch: "4.10.2" }`

### 4.3 Backup file

```json
{ "format": "forgeline-backup", "version": 1, "exportedAt": "…", "orders": [ … ] }
```

Import merges by `id`; the copy with the newer `updatedAt` wins. Unknown `version` → refuse with a clear message.

`navigator.storage.persist()` is requested on first save.

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

- **baseline:** shipped defaults (5.4), replaced by UEX refinery data when the worker can map it.
- **shared:** `aggregates.json`, current patch only.
- **own:** the user's saved orders from the current patch that have a full terminal quote.

The UI shows the dominant source: "Baseline", "37 shared quotes" or "Your 4 orders". Before 5 data points exist, it shows "Low confidence".

### 5.4 Baseline defaults (v1, to calibrate)

| Method | yield | cost/SCU | time/SCU |
|---|---|---|---|
| Dinyx Solventation | 0.93 | 60 | very slow |
| Pyrometric Chromalysis | 0.90 | 150 | slow |
| Ferron Exchange | 0.89 | 95 | slow |
| Thermonatic Deposition | 0.82 | 55 | slow |
| Electrostarolysis | 0.82 | 90 | moderate |
| Gaskin Process | 0.80 | 160 | fast |
| Kazen Winnowing | 0.75 | 50 | moderate |
| Cormack Method | 0.72 | 95 | fast |
| XCR Reaction | 0.70 | 165 | fast |

These are starting values only. The relative ordering matches the Star Citizen Wiki ratings; exact numbers are replaced as real quotes arrive.

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
  "methodId": "dinyx",
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

Schedule: once a day, 03:17 server local time (`WORKER_CRON` in `.env`), plus once at container start if `/data` is empty.

1. Fetch the current game version from UEX. If it differs from `meta.current_patch`: delete old-patch quotes, update `meta`.
2. Fetch stations with refineries, commodities (ores, gems, salvage materials), refinery methods and refinery yields (station bonuses). Build `static-data.json`.
3. Fetch commodity sell prices (refined and raw). Build `prices.json`.
4. Recompute `aggregates.json` from SQLite.
5. Write each file atomically (write to `*.tmp`, then rename). If a UEX call fails, keep the previous file and log the error.

UEX API: base `https://api.uexcorp.uk/2.0/`, Bearer token, daily quota far above our usage. Exact endpoint fields are checked in Task 3.

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

- One image (`Dockerfile`, multi-stage: build `web/`, then a Node 22 runtime).
- `docker-compose.yml`: services `app` (port `PORT`, default 8080) and `worker`, same image, different command; shared named volume `forgeline-data` at `/data`.
- `.env`: `UEX_TOKEN`, `PORT`, `TZ`, `WORKER_CRON`.
- Health check: `GET /api/health`.

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
