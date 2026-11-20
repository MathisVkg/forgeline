// @ts-check
// Refinery estimate for every method (SPEC §5.2). Pure: no I/O, no clock.
import { baselineFor } from "./baseline.js";

/**
 * @typedef {import("./baseline.js").MethodParams & { source?: string, n?: number, lowConfidence?: boolean, missingBaseline?: boolean }} EstimateParams
 * @typedef {{ id: string, name?: string }} IdName
 * @typedef {{ stations: IdName[], materials: { id: string, name?: string, kind?: string, refinedId: string | null }[], methods: IdName[], bonuses: { stationId: string, materialId: string, pct: number }[] }} StaticDataLike
 * @typedef {{ avg: number, updatedAt?: string }} PriceLike
 * @typedef {{ refined?: Record<string, PriceLike>, raw?: Record<string, PriceLike> }} PricesLike
 *
 * @typedef {object} EstimateLine
 * @property {string} materialId
 * @property {number} rawCScu
 * @property {number} bonusPct
 * @property {number} refinedCScu
 * @property {number | null} revenueAuec null when the refined price is missing
 *
 * @typedef {object} MethodEstimate
 * @property {string} methodId
 * @property {string} name
 * @property {EstimateParams} params
 * @property {EstimateLine[]} lines
 * @property {number} totalRawCScu
 * @property {number} totalRefinedCScu
 * @property {number} costAuec
 * @property {number} durationSec
 * @property {number} revenueAuec
 * @property {number} netAuec
 * @property {number} perHourAuec
 * @property {string[]} missingPrices
 *
 * @typedef {object} Estimate
 * @property {string} stationId
 * @property {{ materialId: string, rawCScu: number }[]} materials merged input
 * @property {number} totalRawCScu
 * @property {MethodEstimate[]} methods
 * @property {{ totalAuec: number, missingPrices: string[], oldestUpdatedAt: string | null }} sellRaw
 * @property {string | null} bestNet
 * @property {string | null} bestPerHour
 */

/**
 * @param {{ stationId: string, materials: { materialId: string, rawCScu: number }[], staticData: StaticDataLike, prices?: PricesLike | null, params?: Record<string, EstimateParams> | null, methodIds?: string[] }} input
 * @returns {Estimate}
 */
export function estimate({ stationId, materials, staticData, prices, params, methodIds }) {
  if (!staticData.stations.some((s) => s.id === stationId)) throw new TypeError(`Unknown station "${stationId}"`);
  if (!Array.isArray(materials) || materials.length === 0) throw new TypeError("Add at least one material");

  const materialById = new Map(staticData.materials.map((m) => [m.id, m]));
  /** @type {Map<string, number>} */
  const merged = new Map();
  for (const line of materials) {
    if (!materialById.has(line.materialId)) throw new TypeError(`Unknown material "${line.materialId}"`);
    if (!Number.isInteger(line.rawCScu) || line.rawCScu < 0)
      throw new TypeError(`Quantity for "${line.materialId}" must be a whole, non-negative number of cSCU`);
    merged.set(line.materialId, (merged.get(line.materialId) ?? 0) + line.rawCScu);
  }
  const lines = [...merged].map(([materialId, rawCScu]) => ({ materialId, rawCScu }));
  const totalRawCScu = lines.reduce((sum, l) => sum + l.rawCScu, 0);
  if (totalRawCScu === 0) throw new TypeError("Total quantity must be more than 0 SCU");
  const totalRawScu = totalRawCScu / 100;

  const methodsById = new Map(staticData.methods.map((m) => [m.id, m]));
  const ids = methodIds ?? staticData.methods.map((m) => m.id);
  for (const id of ids) if (!methodsById.has(id)) throw new TypeError(`Unknown method "${id}"`);
  const fallback = baselineFor(ids);

  /** @type {Map<string, number>} */
  const bonusByMaterial = new Map();
  for (const b of staticData.bonuses) if (b.stationId === stationId) bonusByMaterial.set(b.materialId, b.pct);

  const refinedPrices = prices?.refined ?? {};
  /** @param {string} materialId */
  const refinedPrice = (materialId) => {
    const refinedId = materialById.get(materialId)?.refinedId;
    return refinedId && Object.hasOwn(refinedPrices, refinedId) ? refinedPrices[refinedId] : null;
  };
  const missingRefined = lines.filter((l) => !refinedPrice(l.materialId)).map((l) => l.materialId);

  /** @type {MethodEstimate[]} */
  const results = ids.map((methodId) => {
    const p = params && Object.hasOwn(params, methodId) ? params[methodId] : fallback[methodId];
    /** @type {EstimateLine[]} */
    const out = lines.map((l) => {
      const bonusPct = bonusByMaterial.get(l.materialId) ?? 0;
      const refinedCScu = Math.round(l.rawCScu * p.yield * (1 + bonusPct / 100));
      const price = refinedPrice(l.materialId);
      return {
        materialId: l.materialId,
        rawCScu: l.rawCScu,
        bonusPct,
        refinedCScu,
        revenueAuec: price ? Math.round((refinedCScu / 100) * price.avg) : null,
      };
    });
    const costAuec = Math.round(totalRawScu * p.costPerScu);
    const durationSec = Math.round(p.baseSec + totalRawScu * p.secPerScu);
    const revenueAuec = out.reduce((sum, l) => sum + (l.revenueAuec ?? 0), 0);
    const netAuec = revenueAuec - costAuec;
    return {
      methodId,
      name: /** @type {IdName} */ (methodsById.get(methodId)).name ?? methodId,
      params: { ...p },
      lines: out,
      totalRawCScu,
      totalRefinedCScu: out.reduce((sum, l) => sum + l.refinedCScu, 0),
      costAuec,
      durationSec,
      revenueAuec,
      netAuec,
      perHourAuec: durationSec > 0 ? Math.round(netAuec / (durationSec / 3600)) : 0,
      missingPrices: [...missingRefined],
    };
  });

  const hasRevenue = missingRefined.length < lines.length;
  /** @param {(m: MethodEstimate) => number} score */
  const best = (score) => {
    if (!hasRevenue || results.length === 0) return null;
    return results.reduce((a, b) => (score(b) > score(a) || (score(b) === score(a) && b.durationSec < a.durationSec) ? b : a))
      .methodId;
  };

  return {
    stationId,
    materials: lines,
    totalRawCScu,
    methods: results,
    sellRaw: sellRaw(lines, prices?.raw ?? {}),
    bestNet: best((m) => m.netAuec),
    bestPerHour: best((m) => m.perHourAuec),
  };
}

/**
 * @param {{ materialId: string, rawCScu: number }[]} lines
 * @param {Record<string, PriceLike>} rawPrices
 */
function sellRaw(lines, rawPrices) {
  let totalAuec = 0;
  /** @type {string[]} */
  const missingPrices = [];
  /** @type {string | null} */
  let oldestUpdatedAt = null;
  for (const l of lines) {
    const price = Object.hasOwn(rawPrices, l.materialId) ? rawPrices[l.materialId] : null;
    if (!price) {
      missingPrices.push(l.materialId);
      continue;
    }
    totalAuec += Math.round((l.rawCScu / 100) * price.avg);
    if (price.updatedAt && (oldestUpdatedAt === null || price.updatedAt < oldestUpdatedAt)) oldestUpdatedAt = price.updatedAt;
  }
  return { totalAuec, missingPrices, oldestUpdatedAt };
}
