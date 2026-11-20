// @ts-check
// Game data shared by every screen: static-data.json, prices.json and
// aggregates.json from /data/, loaded once. Screens must cope with null.

/**
 * @typedef {{ id: string, name: string, short: string, system: string }} Station
 * @typedef {{ id: string, name: string, kind: string, refinedId: string | null }} Material
 * @typedef {{ id: string, name: string, uex?: Record<string, number> }} Method
 * @typedef {{ generatedAt: string, patch: string | null, stations: Station[], materials: Material[], methods: Method[], bonuses: { stationId: string, materialId: string, pct: number }[] }} StaticData
 * @typedef {{ avg: number, best: number, bestTerminal: string, samples: number, updatedAt: string }} PriceStat
 * @typedef {{ generatedAt: string, patch: string | null, refined: Record<string, PriceStat>, raw: Record<string, PriceStat> }} Prices
 * @typedef {{ generatedAt?: string, patch?: string, methods?: Record<string, any> }} Aggregates
 */

export const NO_STATIC_DATA = "Game data isn't available yet. The server refreshes it once a day.";

class GameData {
  /** @type {StaticData | null} */
  staticData = $state(null);
  /** @type {Prices | null} */
  prices = $state(null);
  /** @type {Aggregates | null} */
  aggregates = $state(null);
  loading = $state(false);
  /** True once a load attempt finished (with or without data). */
  loaded = $state(false);
  /** @type {string | null} */
  error = $state(null);

  #stations = $derived(new Map((this.staticData?.stations ?? []).map((s) => [s.id, s])));
  #materials = $derived(new Map((this.staticData?.materials ?? []).map((m) => [m.id, m])));
  #methods = $derived(new Map((this.staticData?.methods ?? []).map((m) => [m.id, m])));

  /** @param {string} id */
  stationName(id) {
    return this.#stations.get(id)?.name ?? id;
  }
  /** @param {string} id */
  stationShort(id) {
    return this.#stations.get(id)?.short ?? id;
  }
  /** @param {string} id */
  materialName(id) {
    return this.#materials.get(id)?.name ?? id;
  }
  /** @param {string} id */
  methodName(id) {
    return this.#methods.get(id)?.name ?? id;
  }
  /**
   * Current refined price of a raw material (via its refinedId), or null.
   * @param {string} materialId
   * @returns {PriceStat | null}
   */
  refinedPrice(materialId) {
    const refinedId = this.#materials.get(materialId)?.refinedId;
    return (refinedId && this.prices?.refined?.[refinedId]) || null;
  }
}

export const gameData = new GameData();

/**
 * @param {string} url
 * @returns {Promise<any | null>} parsed JSON, or null on 404
 */
async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

/** @type {Promise<void> | null} */
let initPromise = null;

/**
 * Loads the three files in parallel, once. Safe to call twice.
 * @returns {Promise<void>}
 */
export function init() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    gameData.loading = true;
    const [staticData, prices, aggregates] = await Promise.allSettled([
      fetchJson("/data/static-data.json"),
      fetchJson("/data/prices.json"),
      fetchJson("/data/aggregates.json"),
    ]);
    /** @param {PromiseSettledResult<any>} r */
    const value = (r) => (r.status === "fulfilled" ? r.value : null);
    gameData.staticData = value(staticData);
    gameData.prices = value(prices);
    gameData.aggregates = value(aggregates);
    gameData.error = gameData.staticData ? null : NO_STATIC_DATA;
    gameData.loading = false;
    gameData.loaded = true;
    if (!gameData.staticData) initPromise = null; // allow a retry later
  })();
  return initPromise;
}
