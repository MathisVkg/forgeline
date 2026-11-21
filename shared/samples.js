// @ts-check
// The user's own orders as samples for blendParams (SPEC §5.3). Pure.

/**
 * @typedef {{ materialId: string, rawCScu: number, refinedCScu: number | null }} SampleLine
 * @typedef {{ stationId: string, methodId: string, patch: string | null, costAuec: number | null, durationSec: number, materials: SampleLine[] }} SampleOrder
 * @typedef {{ stations: { id: string }[], methods: { id: string }[], materials: { id: string, kind: string }[], bonuses: { stationId: string, materialId: string, pct: number }[] }} SampleStaticData
 * @typedef {import("./blend.js").OwnSample & { kind: string }} KindedSample
 */

/**
 * Orders with a full terminal quote (patch, known station and method, cost,
 * duration, refined quantity on every line, materials of one kind) become one
 * sample each: yield = totalRefined / Σ(raw × (1 + bonus/100)),
 * costPerScu = cost / raw SCU, kind = "ore" | "salvage" | "gem".
 * Orders mixing kinds are skipped: salvage (14–20 % yield) and ores
 * (70–93 %) follow different models and must not be blended.
 * @param {SampleOrder[]} orders
 * @param {SampleStaticData | null | undefined} staticData
 * @returns {KindedSample[]}
 */
export function ownSamplesFromOrders(orders, staticData) {
  if (!staticData) return [];
  const stations = new Set(staticData.stations.map((s) => s.id));
  const methods = new Set(staticData.methods.map((m) => m.id));
  const kinds = new Map(staticData.materials.map((m) => [m.id, m.kind]));
  const bonus = new Map(staticData.bonuses.map((b) => [`${b.stationId}|${b.materialId}`, b.pct]));

  /** @type {KindedSample[]} */
  const samples = [];
  for (const order of orders) {
    if (typeof order.patch !== "string" || !order.patch) continue;
    if (!stations.has(order.stationId) || !methods.has(order.methodId)) continue;
    if (!Number.isInteger(order.costAuec) || !Number.isInteger(order.durationSec) || order.durationSec <= 0) continue;
    if (!order.materials.length || order.materials.some((l) => !Number.isInteger(l.refinedCScu))) continue;
    const orderKinds = new Set(order.materials.map((l) => kinds.get(l.materialId)));
    if (orderKinds.size !== 1 || orderKinds.has(undefined)) continue;

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
      kind: /** @type {string} */ ([...orderKinds][0]),
      yield: totalRefined / expected,
      costPerScu: /** @type {number} */ (order.costAuec) / totalRawScu,
      durationSec: order.durationSec,
      totalRawScu,
    });
  }
  return samples;
}

/**
 * Own samples that apply to a load: only those of the load's material kind.
 * A load mixing kinds uses none (baseline / shared only).
 * @template {{ kind: string }} S
 * @param {S[]} samples
 * @param {string[]} materialIds the load
 * @param {{ materials: { id: string, kind: string }[] } | null | undefined} staticData
 * @returns {{ samples: S[], kind: string | null, mixed: boolean }}
 */
export function samplesForLoad(samples, materialIds, staticData) {
  const kinds = new Set(materialIds.map((id) => staticData?.materials.find((m) => m.id === id)?.kind).filter(Boolean));
  if (kinds.size === 0) return { samples: [], kind: null, mixed: false };
  if (kinds.size > 1) return { samples: [], kind: null, mixed: true };
  const kind = /** @type {string} */ ([...kinds][0]);
  return { samples: samples.filter((s) => s.kind === kind), kind, mixed: false };
}
