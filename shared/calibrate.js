// @ts-check
// Per-material calibration (SPEC §5.3). Each terminal quote is back-solved
// through the tier model into the material's three base values:
//
//   maxYield   = refined / (raw × YIELD_MULT × (1 + bonus/100))
//   costPerScu = cost / (rawScu × COST_MULT)        (single-material quotes only)
//   timePerScu = duration / (rawScu × timeMult)     (single-material quotes only)
//
// Priority per value: own quotes, else shared aggregates, else the default.
// No weighting: the game is deterministic, so a real quote replaces a guess.
import { COST_MULT, YIELD_MULT, methodTier } from "./game-model.js";

/**
 * @typedef {import("./game-model.js").MaterialBase} MaterialBase
 * @typedef {"game-quote" | "shared" | "own" | "assumed"} ParamSource
 * @typedef {{ median: number, n: number }} MedianStat
 * @typedef {{ maxYield?: MedianStat, costPerScu?: MedianStat, timePerScu?: MedianStat }} AggregateMaterial
 * @typedef {{ patch?: string, materials?: Record<string, AggregateMaterial> }} Aggregates SPEC §3.3
 *
 * @typedef {object} MaterialSample one order line with a terminal quote
 * @property {string} materialId
 * @property {string} methodId
 * @property {string} patch
 * @property {number} bonusPct station bonus for this material
 * @property {number | null} capacityPct
 * @property {number} rawCScu
 * @property {number} refinedCScu
 * @property {boolean} single true when the order holds only this material
 * @property {number | null} costAuec order cost (single-material orders only)
 * @property {number | null} durationSec order duration (single-material orders only)
 *
 * @typedef {object} CalibratedMaterial
 * @property {number} maxYield
 * @property {number} costPerScu
 * @property {number} timePerScu
 * @property {ParamSource} source "assumed" when any of the three values is still a guess
 * @property {{ maxYield: ParamSource, costPerScu: ParamSource, timePerScu: ParamSource }} sources
 * @property {number} n quotes behind the values used (0 for defaults)
 * @property {boolean} lowConfidence true when source is "assumed"
 */

/** @typedef {"maxYield" | "costPerScu" | "timePerScu"} BaseKey */
/** @type {readonly BaseKey[]} */
export const BASE_KEYS = Object.freeze(["maxYield", "costPerScu", "timePerScu"]);

/**
 * Median (mean of the two middle values for even n).
 * @param {number[]} values non-empty
 */
export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * The value interval each sample allows, given how the terminal rounds:
 * yield and time to nearest, cost down. Returns null when the sample can't
 * inform this value (multi-material cost/time, zero quantities).
 * @param {MaterialSample} s
 * @param {BaseKey} key
 * @returns {[number, number] | null} [low, high)
 */
export function sampleInterval(s, key) {
  const tier = methodTier(s.methodId);
  const rawScu = s.rawCScu / 100;
  if (rawScu <= 0) return null;
  if (key === "maxYield") {
    const d = s.rawCScu * YIELD_MULT[tier.yieldTier] * (1 + s.bonusPct / 100);
    return d > 0 ? [(s.refinedCScu - 0.5) / d, (s.refinedCScu + 0.5) / d] : null;
  }
  if (!s.single) return null;
  if (key === "costPerScu") {
    if (s.costAuec == null) return null;
    const d = rawScu * COST_MULT[tier.costTier];
    return [s.costAuec / d, (s.costAuec + 1) / d];
  }
  if (s.durationSec == null) return null;
  const d = rawScu * tier.timeMult;
  return [(s.durationSec - 0.5) / d, (s.durationSec + 0.5) / d];
}

/**
 * Back-solves one value from samples: the midpoint of the interval every
 * sample allows (exact reproduction of all of them); when the samples don't
 * agree (typo, other capacity), the median of their midpoints.
 * @param {MaterialSample[]} samples
 * @param {BaseKey} key
 * @returns {{ value: number, n: number } | null}
 */
export function solveValue(samples, key) {
  const intervals = /** @type {[number, number][]} */ (samples.map((s) => sampleInterval(s, key)).filter(Boolean));
  if (intervals.length === 0) return null;
  const low = Math.max(...intervals.map((i) => i[0]));
  const high = Math.min(...intervals.map((i) => i[1]));
  const value = low < high ? (low + high) / 2 : median(intervals.map((i) => (i[0] + i[1]) / 2));
  return { value, n: intervals.length };
}

/**
 * Calibrated base values for every material in `defaults`.
 * @param {{ defaults: Record<string, MaterialBase>, aggregates?: Aggregates | null, ownSamples?: MaterialSample[] | null, patch: string | null }} input
 * @returns {Record<string, CalibratedMaterial>}
 */
export function calibrateMaterials({ defaults, aggregates, ownSamples, patch }) {
  const shared = aggregates && patch && aggregates.patch === patch ? (aggregates.materials ?? {}) : {};
  const own = (ownSamples ?? []).filter((s) => patch && s.patch === patch);

  /** @type {Record<string, CalibratedMaterial>} */
  const out = {};
  for (const [materialId, base] of Object.entries(defaults)) {
    const mine = own.filter((s) => s.materialId === materialId);
    const agg = Object.hasOwn(shared, materialId) ? shared[materialId] : null;
    const values = /** @type {Record<BaseKey, number>} */ ({});
    const sources = /** @type {Record<BaseKey, ParamSource>} */ ({});
    let n = 0;
    for (const key of BASE_KEYS) {
      const o = solveValue(mine, key);
      const s = agg?.[key];
      if (o) {
        values[key] = o.value;
        sources[key] = "own";
        n = Math.max(n, o.n);
      } else if (s && s.n > 0 && Number.isFinite(s.median) && s.median > 0) {
        values[key] = s.median;
        sources[key] = "shared";
        n = Math.max(n, s.n);
      } else {
        values[key] = base[key];
        sources[key] = base.source;
      }
    }
    const list = Object.values(sources);
    /** @type {ParamSource} */
    const source = list.includes("assumed") ? "assumed" : list.includes("own") ? "own" : list.includes("shared") ? "shared" : "game-quote";
    out[materialId] = { ...values, source, sources, n, lowConfidence: source === "assumed" };
  }
  return out;
}
