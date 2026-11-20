// @ts-check
// Daily worker (SPEC §7): fetches UEX data and writes static-data.json and
// prices.json to DATA_DIR. Usage:
//   node server/worker.js          start, run if needed, then follow WORKER_CRON
//   node server/worker.js --once   run the daily job once and exit 0/1
// Local runs: node --env-file=.env server/worker.js --once
import { existsSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import cron from "node-cron";
import { APP_NAME } from "@forgeline/shared";
import { config } from "./config.js";
import { getMeta, openDb, setMeta } from "./lib/db.js";
import { stats, uexGet } from "./lib/uex.js";
import { applyPatch } from "./lib/patch.js";
import { STATIC_RESOURCES, buildStatic } from "./lib/build-static.js";
import { PRICE_RESOURCES, buildPrices } from "./lib/build-prices.js";
import { loadSlugMap } from "./lib/slug.js";

export const STATIC_FILE = "static-data.json";
export const PRICES_FILE = "prices.json";
export const AGGREGATES_FILE = "aggregates.json";
const DAY_MS = 24 * 3600 * 1000;

/** @param {string} message */
function log(message) {
  console.log(`${new Date().toISOString()} [${APP_NAME} worker] ${message}`);
}

/** @param {unknown} err */
function errorText(err) {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Writes JSON atomically: <file>.tmp then rename.
 * @param {string} file
 * @param {unknown} value
 */
async function writeJsonAtomic(file, value) {
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(value), "utf8");
  await rename(tmp, file);
}

/** @param {readonly string[]} resources */
async function fetchAll(resources) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const resource of resources) out[resource] = await uexGet(resource);
  return out;
}

let running = false;

/**
 * Runs patch -> static data -> prices. Each step logs one line; a failed
 * step keeps the previous file and the job continues when possible.
 * @param {{ dataDir?: string }} [options]
 * @returns {Promise<boolean>} true when every step succeeded
 */
export async function runDailyJob(options = {}) {
  if (running) {
    log("daily job already running, skipped");
    return false;
  }
  running = true;
  const dataDir = options.dataDir ?? config.dataDir;
  const db = openDb(dataDir);
  const requestsBefore = stats.requests;
  const jobStart = Date.now();
  let ok = true;

  try {
    // 1. patch
    /** @type {string | null} */
    let patch = getMeta(db, "current_patch");
    let t0 = Date.now();
    try {
      const versions = await uexGet("game_versions");
      const live = typeof versions?.live === "string" ? versions.live : "";
      const result = applyPatch(db, live, log);
      patch = live;
      log(`step patch: live ${live}${result.changed ? "" : " (unchanged)"} (${Date.now() - t0} ms)`);
    } catch (err) {
      ok = false;
      log(`step patch FAILED: ${errorText(err)}; keeping patch ${patch ?? "(none)"}`);
    }

    // 2. static data
    /** @type {import("./lib/build-static.js").StaticData | null} */
    let staticData = null;
    /** @type {import("./lib/build-static.js").PriceIndex | null} */
    let index = null;
    t0 = Date.now();
    try {
      const uex = await fetchAll(STATIC_RESOURCES);
      const built = buildStatic(/** @type {any} */ (uex), { db, patch, now: new Date() });
      await writeJsonAtomic(path.join(dataDir, STATIC_FILE), built.data);
      staticData = built.data;
      index = built.index;
      const d = built.data;
      log(
        `step static: ${d.stations.length} stations, ${d.materials.length} materials, ${d.methods.length} methods, ` +
          `${d.bonuses.length} bonuses (${Date.now() - t0} ms)`,
      );
    } catch (err) {
      ok = false;
      log(`step static FAILED: ${errorText(err)}; keeping previous ${STATIC_FILE}`);
      try {
        staticData = JSON.parse(await readFile(path.join(dataDir, STATIC_FILE), "utf8"));
        index = { materials: loadSlugMap(db, "material"), refined: loadSlugMap(db, "refined") };
      } catch {
        staticData = null;
      }
    }

    // 3. prices (needs static data, fresh or previous)
    t0 = Date.now();
    if (!staticData || !index) {
      ok = false;
      log(`step prices SKIPPED: no ${STATIC_FILE} available`);
    } else {
      try {
        const uex = await fetchAll(PRICE_RESOURCES);
        const prices = buildPrices(/** @type {any} */ (uex), staticData, new Date(), index);
        await writeJsonAtomic(path.join(dataDir, PRICES_FILE), prices);
        log(
          `step prices: ${Object.keys(prices.refined).length} refined, ${Object.keys(prices.raw).length} raw priced ` +
            `(${Date.now() - t0} ms)`,
        );
      } catch (err) {
        ok = false;
        log(`step prices FAILED: ${errorText(err)}; keeping previous ${PRICES_FILE}`);
      }
    }

    // 4. aggregates: always written so the file exists; methods stay empty
    // until shared quotes are fitted (Task 9).
    t0 = Date.now();
    try {
      await writeJsonAtomic(path.join(dataDir, AGGREGATES_FILE), { generatedAt: new Date().toISOString(), patch, methods: {} });
      log(`step aggregates: 0 methods (no shared quotes yet) (${Date.now() - t0} ms)`);
    } catch (err) {
      ok = false;
      log(`step aggregates FAILED: ${errorText(err)}`);
    }
  } finally {
    setMeta(db, "last_run", new Date().toISOString());
    setMeta(db, "last_run_ok", ok);
    db.close();
    running = false;
  }
  log(`daily job ${ok ? "done" : "finished with errors"}: ${stats.requests - requestsBefore} UEX requests (${Date.now() - jobStart} ms)`);
  return ok;
}

/**
 * True when a data file is missing or the last run is older than 24 h.
 * @param {string} dataDir
 */
function shouldRunAtStart(dataDir) {
  if (![STATIC_FILE, PRICES_FILE].every((f) => existsSync(path.join(dataDir, f)))) return "data files missing";
  const db = openDb(dataDir);
  try {
    const lastRun = getMeta(db, "last_run");
    if (!lastRun) return "no previous run";
    const age = Date.now() - Date.parse(lastRun);
    return !(age < DAY_MS) ? "last run older than 24 h" : null;
  } finally {
    db.close();
  }
}

async function main() {
  if (process.argv.includes("--once")) {
    const ok = await runDailyJob();
    process.exit(ok ? 0 : 1);
  }

  if (!cron.validate(config.workerCron)) {
    log(`invalid WORKER_CRON "${config.workerCron}"`);
    process.exit(1);
  }
  log(`worker started, schedule ${config.workerCron} (${config.tz})`);

  const task = cron.schedule(
    config.workerCron,
    async () => {
      await runDailyJob().catch((err) => log(`daily job crashed: ${errorText(err)}`));
    },
    { timezone: config.tz, noOverlap: true },
  );

  const reason = shouldRunAtStart(config.dataDir);
  if (reason) {
    log(`running now: ${reason}`);
    await runDailyJob().catch((err) => log(`daily job crashed: ${errorText(err)}`));
  } else {
    log("data is fresh, waiting for the schedule");
  }

  /** @param {NodeJS.Signals} signal */
  const shutdown = (signal) => {
    log(`${signal} received, stopping`);
    task.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (runDirectly) {
  main().catch((err) => {
    log(`fatal: ${errorText(err)}`);
    process.exit(1);
  });
}
