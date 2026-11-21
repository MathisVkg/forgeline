// @ts-check
// The user's own orders as per-material samples for calibrateMaterials (SPEC §5.3). Pure.

/**
 * @typedef {{ materialId: string, rawCScu: number, refinedCScu?: number | null }} SampleLine
 * @typedef {{ stationId: string, methodId: string, patch: string | null, costAuec: number | null, capacityPct?: number | null, durationSec: number, materials: SampleLine[] }} SampleOrder
 * @typedef {{ stations: { id: string }[], methods: { id: string }[], materials: { id: string }[], bonuses: { stationId: string, materialId: string, pct: number }[] }} SampleStaticData
 * @typedef {import("./calibrate.js").MaterialSample} MaterialSample
 */

/**
 * Orders with a terminal quote (patch, known station and method, refined
 * quantity on every line) become one sample per material line. Cost and
 * duration are kept only for single-material orders: they can't be split
 * between materials, so a mixed order informs yield only.
 * Samples from other patches are dropped later by calibrateMaterials.
 * @param {SampleOrder[]} orders
 * @param {SampleStaticData | null | undefined} staticData
 * @returns {MaterialSample[]}
 */
export function ownSamplesFromOrders(orders, staticData) {
  if (!staticData) return [];
  const stations = new Set(staticData.stations.map((s) => s.id));
  const methods = new Set(staticData.methods.map((m) => m.id));
  const materials = new Set(staticData.materials.map((m) => m.id));
  const bonus = new Map(staticData.bonuses.map((b) => [`${b.stationId}|${b.materialId}`, b.pct]));

  /** @type {MaterialSample[]} */
  const samples = [];
  for (const order of orders) {
    if (typeof order.patch !== "string" || !order.patch) continue;
    if (!stations.has(order.stationId) || !methods.has(order.methodId)) continue;
    if (!order.materials.length || order.materials.some((l) => !Number.isInteger(l.refinedCScu) || !materials.has(l.materialId))) continue;
    const ids = new Set(order.materials.map((l) => l.materialId));
    const single = ids.size === 1;
    const costOk = Number.isInteger(order.costAuec);
    const timeOk = Number.isInteger(order.durationSec) && order.durationSec > 0;

    /** @type {Map<string, { raw: number, refined: number }>} */
    const byMaterial = new Map();
    for (const line of order.materials) {
      const t = byMaterial.get(line.materialId) ?? { raw: 0, refined: 0 };
      t.raw += line.rawCScu;
      t.refined += /** @type {number} */ (line.refinedCScu);
      byMaterial.set(line.materialId, t);
    }
    for (const [materialId, t] of byMaterial) {
      if (t.raw <= 0) continue;
      samples.push({
        materialId,
        methodId: order.methodId,
        patch: order.patch,
        bonusPct: bonus.get(`${order.stationId}|${materialId}`) ?? 0,
        capacityPct: Number.isInteger(order.capacityPct) ? /** @type {number} */ (order.capacityPct) : null,
        rawCScu: t.raw,
        refinedCScu: t.refined,
        single,
        costAuec: single && costOk ? order.costAuec : null,
        durationSec: single && timeOk ? order.durationSec : null,
      });
    }
  }
  return samples;
}
