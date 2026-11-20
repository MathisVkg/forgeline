// @ts-check
// The user's own orders as samples for blendParams (SPEC §5.3). Pure.

/**
 * @typedef {{ materialId: string, rawCScu: number, refinedCScu: number | null }} SampleLine
 * @typedef {{ stationId: string, methodId: string, patch: string | null, costAuec: number | null, durationSec: number, materials: SampleLine[] }} SampleOrder
 * @typedef {{ stations: { id: string }[], methods: { id: string }[], bonuses: { stationId: string, materialId: string, pct: number }[] }} SampleStaticData
 * @typedef {import("./blend.js").OwnSample} OwnSample
 */

/**
 * Orders with a full terminal quote (patch, known station and method, cost,
 * duration, refined quantity on every line) become one sample each:
 * yield = totalRefined / Σ(raw × (1 + bonus/100)), costPerScu = cost / raw SCU.
 * @param {SampleOrder[]} orders
 * @param {SampleStaticData | null | undefined} staticData
 * @returns {OwnSample[]}
 */
export function ownSamplesFromOrders(orders, staticData) {
  if (!staticData) return [];
  const stations = new Set(staticData.stations.map((s) => s.id));
  const methods = new Set(staticData.methods.map((m) => m.id));
  const bonus = new Map(staticData.bonuses.map((b) => [`${b.stationId}|${b.materialId}`, b.pct]));

  /** @type {OwnSample[]} */
  const samples = [];
  for (const order of orders) {
    if (typeof order.patch !== "string" || !order.patch) continue;
    if (!stations.has(order.stationId) || !methods.has(order.methodId)) continue;
    if (!Number.isInteger(order.costAuec) || !Number.isInteger(order.durationSec) || order.durationSec <= 0) continue;
    if (!order.materials.length || order.materials.some((l) => !Number.isInteger(l.refinedCScu))) continue;

    let totalRaw = 0;
    let totalRefined = 0;
    let expected = 0;
    for (const line of order.materials) {
      const pct = bonus.get(`${order.stationId}|${line.materialId}`) ?? 0;
      totalRaw += line.rawCScu;
      totalRefined += /** @type {number} */ (line.refinedCScu);
      expected += line.rawCScu * (1 + pct / 100);
    }
    if (totalRaw <= 0 || expected <= 0) continue;
    const totalRawScu = totalRaw / 100;
    samples.push({
      methodId: order.methodId,
      patch: order.patch,
      yield: totalRefined / expected,
      costPerScu: /** @type {number} */ (order.costAuec) / totalRawScu,
      durationSec: order.durationSec,
      totalRawScu,
    });
  }
  return samples;
}
