// @ts-check
// Builds prices.json (SPEC §3.2) from UEX terminal sell prices.

export const PRICE_RESOURCES = /** @type {const} */ (["commodities_prices_all", "commodities_raw_prices_all"]);

/** Reports older than this are ignored (SPEC §3.2). */
export const MAX_AGE_SEC = 7 * 24 * 3600;

/**
 * @typedef {{ price: number, date: number, terminal: string }} PriceEntry date in Unix seconds
 * @typedef {{ avg: number, best: number, bestTerminal: string, samples: number }} PriceStat
 * @typedef {{ generatedAt: string, patch: string | null, refined: Record<string, PriceStat>, raw: Record<string, PriceStat> }} Prices
 */

/**
 * Pure averaging rule:
 * drop prices <= 0 and reports older than maxAgeSec; n >= 5 -> mean without the
 * lowest and highest 10 % (count rounded down); n < 5 -> median; n = 0 -> null.
 * @param {PriceEntry[]} entries
 * @param {Date | number} now Date or Unix milliseconds
 * @param {number} [maxAgeSec]
 * @returns {PriceStat | null}
 */
export function averagePrices(entries, now, maxAgeSec = MAX_AGE_SEC) {
  const nowSec = (now instanceof Date ? now.getTime() : now) / 1000;
  const kept = entries.filter(
    (e) => Number.isFinite(e.price) && e.price > 0 && Number.isFinite(e.date) && nowSec - e.date <= maxAgeSec,
  );
  const n = kept.length;
  if (n === 0) return null;

  const prices = kept.map((e) => e.price).sort((a, b) => a - b);
  let avg;
  if (n >= 5) {
    const drop = Math.floor(n * 0.1);
    const middle = prices.slice(drop, n - drop);
    avg = middle.reduce((sum, p) => sum + p, 0) / middle.length;
  } else {
    const mid = Math.floor(n / 2);
    avg = n % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
  }

  const best = kept.reduce((a, b) => (b.price > a.price || (b.price === a.price && b.terminal < a.terminal) ? b : a));
  return { avg: Math.round(avg), best: Math.round(best.price), bestTerminal: best.terminal, samples: n };
}

/**
 * @param {{ commodities_prices_all: any[], commodities_raw_prices_all: any[] }} uex
 * @param {import("./build-static.js").StaticData} staticData
 * @param {Date} now
 * @param {import("./build-static.js").PriceIndex} index slug -> UEX commodity id
 * @returns {Prices}
 */
export function buildPrices(uex, staticData, now, index) {
  const refined = priceTable(
    uex.commodities_prices_all,
    [...new Set(staticData.materials.map((m) => m.refinedId).filter((id) => id !== null))],
    index.refined,
    now,
  );
  const raw = priceTable(
    uex.commodities_raw_prices_all,
    staticData.materials.map((m) => m.id),
    index.materials,
    now,
  );
  return { generatedAt: now.toISOString(), patch: staticData.patch, refined, raw };
}

/**
 * @param {any[]} rows UEX price rows
 * @param {(string | null)[]} slugs
 * @param {Record<string, number>} slugToUex
 * @param {Date} now
 */
function priceTable(rows, slugs, slugToUex, now) {
  /** @type {Map<number, PriceEntry[]>} */
  const byCommodity = new Map();
  for (const row of rows) {
    const list = byCommodity.get(row.id_commodity) ?? [];
    list.push({ price: Number(row.price_sell), date: Number(row.date_modified), terminal: String(row.terminal_name ?? "") });
    byCommodity.set(row.id_commodity, list);
  }
  /** @type {Record<string, PriceStat>} */
  const table = {};
  for (const slug of [...slugs].sort()) {
    if (!slug) continue;
    const uexId = slugToUex[slug];
    const stat = uexId === undefined ? null : averagePrices(byCommodity.get(uexId) ?? [], now);
    if (stat) table[slug] = stat;
  }
  return table;
}
