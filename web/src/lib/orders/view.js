// @ts-check
// Pure helpers for the Orders screen: station filter, chips, summary,
// output, materials line, ready dialog decision and tab title.
import { isReady } from "../storage/model.js";
import { orderValue } from "./value.js";

/** @typedef {import("../storage/model.js").Order} Order */

/**
 * @param {Order[]} orders
 * @param {string | null} stationId null = all stations
 */
export function filterByStation(orders, stationId) {
  return stationId ? orders.filter((o) => o.stationId === stationId) : orders;
}

/**
 * One chip per station that has active (refining) orders, sorted by label.
 * @param {Order[]} activeOrders
 * @param {number} nowMs
 * @param {(id: string) => string} shortName
 * @returns {{ stationId: string, short: string, active: number, ready: boolean, label: string }[]}
 */
export function stationChips(activeOrders, nowMs, shortName) {
  /** @type {Map<string, { active: number, ready: boolean }>} */
  const by = new Map();
  for (const o of activeOrders) {
    if (o.status !== "refining") continue;
    const c = by.get(o.stationId) ?? { active: 0, ready: false };
    c.active++;
    if (isReady(o, nowMs)) c.ready = true;
    by.set(o.stationId, c);
  }
  return [...by]
    .map(([stationId, c]) => {
      const short = shortName(stationId);
      return { stationId, short, active: c.active, ready: c.ready, label: `${short} · ${c.active}` };
    })
    .sort((a, b) => a.short.localeCompare(b.short));
}

/**
 * Summary tiles over active orders.
 * @param {Order[]} activeOrders
 * @param {number} nowMs
 * @param {import("./value.js").StaticDataLike | null | undefined} staticData
 * @param {import("./value.js").PricesLike | null | undefined} prices
 * @returns {{ ready: number, refining: number, valueAuec: number | null, valueEstimated: boolean }}
 */
export function summarize(activeOrders, nowMs, staticData, prices) {
  let ready = 0;
  let refining = 0;
  /** @type {number | null} */
  let valueAuec = null;
  let valueEstimated = false;
  for (const o of activeOrders) {
    if (o.status !== "refining") continue;
    if (isReady(o, nowMs)) ready++;
    else refining++;
    const v = orderValue(o, staticData, prices);
    if (v.auec !== null) {
      valueAuec = (valueAuec ?? 0) + v.auec;
      if (v.basis === "estimate") valueEstimated = true;
    }
  }
  return { ready, refining, valueAuec, valueEstimated };
}

/**
 * Total output: refined when every line has refinedCScu, else the estimate's
 * refined total, else raw.
 * @param {Order} order
 * @returns {{ cScu: number, kind: "refined" | "estimate" | "raw" }}
 */
export function orderOutput(order) {
  if (order.materials.every((l) => l.refinedCScu != null))
    return { cScu: order.materials.reduce((s, l) => s + /** @type {number} */ (l.refinedCScu), 0), kind: "refined" };
  if (order.estimate) return { cScu: order.estimate.totalRefinedCScu, kind: "estimate" };
  return { cScu: order.materials.reduce((s, l) => s + l.rawCScu, 0), kind: "raw" };
}

/**
 * "Titanium 32 SCU · Laranite 12 SCU" (raw quantities).
 * @param {Order} order
 * @param {(id: string) => string} materialName
 * @param {(cScu: number) => string} formatScu
 */
export function materialsLine(order, materialName, formatScu) {
  return order.materials.map((l) => `${materialName(l.materialId)} ${formatScu(l.rawCScu)}`).join(" · ");
}

/**
 * Whether the ready dialog should open now. It opens at most once per page
 * load, after both stores finished loading, when ready orders exist.
 * @param {{ storesReady: boolean, readyCount: number, decided: boolean }} state
 * @returns {"open" | "skip" | "wait"} wait = decide later; skip = never this load
 */
export function readyDialogDecision({ storesReady, readyCount, decided }) {
  if (decided) return "skip";
  if (!storesReady) return "wait";
  return readyCount > 0 ? "open" : "skip";
}

/**
 * @param {number} readyCount
 * @param {string} appName
 */
export function tabTitle(readyCount, appName) {
  return readyCount > 0 ? `(${readyCount}) ${appName}` : appName;
}
