// @ts-check
// Estimated value of an order (pure).

/**
 * @typedef {{ auec: number | null, basis: "current" | "estimate" | "none" }} OrderValue
 * @typedef {{ materials: { id: string, refinedId: string | null }[] }} StaticDataLike
 * @typedef {{ refined?: Record<string, { avg: number }> }} PricesLike
 */

/**
 * 1. Every line has refinedCScu and a current refined price → Σ refined × price ("current").
 * 2. Else the estimate snapshot → its revenueAuec ("estimate").
 * 3. Else → { auec: null, basis: "none" }.
 * @param {import("../storage/model.js").Order} order
 * @param {StaticDataLike | null | undefined} staticData
 * @param {PricesLike | null | undefined} prices
 * @returns {OrderValue}
 */
export function orderValue(order, staticData, prices) {
  const refinedOf = new Map((staticData?.materials ?? []).map((m) => [m.id, m.refinedId]));
  const refinedPrices = prices?.refined ?? {};
  let total = 0;
  let complete = order.materials.length > 0;
  for (const line of order.materials) {
    const refinedId = refinedOf.get(line.materialId);
    const price = refinedId && Object.hasOwn(refinedPrices, refinedId) ? refinedPrices[refinedId] : null;
    if (line.refinedCScu == null || !price) {
      complete = false;
      break;
    }
    total += Math.round((line.refinedCScu / 100) * price.avg);
  }
  if (complete) return { auec: total, basis: "current" };
  if (order.estimate && Number.isFinite(order.estimate.revenueAuec)) return { auec: order.estimate.revenueAuec, basis: "estimate" };
  return { auec: null, basis: "none" };
}
