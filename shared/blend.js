// @ts-check
// Parameter blending (SPEC §5.3):
//   p = (K × baseline + nShared × shared + 2 × nOwn × own) / (K + nShared + 2 × nOwn), K = 5
import { PARAM_KEYS, median } from "./baseline.js";

export const BLEND_K = 5;
export const LOW_CONFIDENCE_BELOW = 5;

/**
 * @typedef {import("./baseline.js").MethodParams} MethodParams
 * @typedef {{ median: number, n: number }} MedianStat
 * @typedef {{ yield?: MedianStat, costPerScu?: MedianStat, time?: { baseSec: number, secPerScu: number, n: number } }} AggregateMethod
 * @typedef {{ patch?: string, methods?: Record<string, AggregateMethod> }} Aggregates SPEC §3.3
 * @typedef {{ methodId: string, patch: string, yield: number, costPerScu: number, durationSec: number, totalRawScu: number }} OwnSample
 * @typedef {MethodParams & { source: "baseline" | "shared" | "own", n: number, lowConfidence: boolean }} BlendedParams
 */

/**
 * Blends baseline, shared aggregates and the user's own samples.
 * Own samples count double. Own data does not observe the fixed base time,
 * so `baseSec` only blends baseline and shared; own time samples are turned
 * into seconds per SCU with the shared fit's baseSec (or the baseline's).
 * @param {{ baseline: Record<string, MethodParams>, aggregates?: Aggregates | null, ownSamples?: OwnSample[] | null, patch: string }} input
 * @returns {Record<string, BlendedParams>}
 */
export function blendParams({ baseline, aggregates, ownSamples, patch }) {
  const shared = aggregates && aggregates.patch === patch ? (aggregates.methods ?? {}) : {};
  const own = (ownSamples ?? []).filter((s) => s.patch === patch);

  /** @type {Record<string, BlendedParams>} */
  const out = {};
  for (const [methodId, base] of Object.entries(baseline)) {
    const agg = Object.hasOwn(shared, methodId) ? shared[methodId] : null;
    const samples = own.filter((s) => s.methodId === methodId);

    /** @type {Record<keyof MethodParams, { value: number, n: number } | null>} */
    const sharedStat = {
      yield: agg?.yield ? { value: agg.yield.median, n: agg.yield.n } : null,
      costPerScu: agg?.costPerScu ? { value: agg.costPerScu.median, n: agg.costPerScu.n } : null,
      baseSec: agg?.time ? { value: agg.time.baseSec, n: agg.time.n } : null,
      secPerScu: agg?.time ? { value: agg.time.secPerScu, n: agg.time.n } : null,
    };
    const refBaseSec = sharedStat.baseSec && sharedStat.baseSec.n > 0 ? sharedStat.baseSec.value : base.baseSec;

    /** @param {number[]} values */
    const ownStat = (values) => {
      const finite = values.filter(Number.isFinite);
      return finite.length ? { value: median(finite), n: finite.length } : null;
    };
    /** @type {Record<keyof MethodParams, { value: number, n: number } | null>} */
    const ownStats = {
      yield: ownStat(samples.map((s) => s.yield)),
      costPerScu: ownStat(samples.map((s) => s.costPerScu)),
      baseSec: null,
      secPerScu: ownStat(samples.filter((s) => s.totalRawScu > 0).map((s) => (s.durationSec - refBaseSec) / s.totalRawScu)),
    };

    const params = /** @type {MethodParams} */ ({});
    let nShared = 0;
    let nOwn = 0;
    for (const key of PARAM_KEYS) {
      const s = sharedStat[key];
      const o = ownStats[key];
      const ns = s && Number.isFinite(s.value) ? s.n : 0;
      const no = o ? o.n : 0;
      params[key] =
        (BLEND_K * base[key] + ns * (s?.value ?? 0) + 2 * no * (o?.value ?? 0)) / (BLEND_K + ns + 2 * no);
      nShared = Math.max(nShared, ns);
      nOwn = Math.max(nOwn, no);
    }

    const weights = { own: 2 * nOwn, shared: nShared, baseline: BLEND_K };
    /** @type {"own" | "shared" | "baseline"} */
    const source = weights.own > 0 && weights.own >= weights.shared && weights.own >= weights.baseline
      ? "own"
      : weights.shared > 0 && weights.shared >= weights.baseline
        ? "shared"
        : "baseline";
    const n = nShared + nOwn;
    out[methodId] = { ...params, source, n, lowConfidence: n < LOW_CONFIDENCE_BELOW };
  }
  return out;
}
