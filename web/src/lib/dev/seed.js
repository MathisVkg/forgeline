// @ts-check
// DEV ONLY (loaded from main.js when import.meta.env.DEV): window.forgelineSeed()
// creates sample orders to try the Orders screen.
import { applyStatus, createOrderRecord, restoreOrder } from "../storage/index.js";
import { refresh } from "../stores/orders.svelte.js";
import { gameData } from "../stores/gameData.svelte.js";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** @param {string[]} wanted @param {{ id: string }[] | undefined} list */
const pick = (wanted, list) => wanted.map((id, i) => (list?.some((x) => x.id === id) ? id : (list?.[i]?.id ?? id)));

async function forgelineSeed() {
  const now = Date.now();
  const data = gameData.staticData;
  const [arc, levski, hur] = pick(["arc-l1", "levski", "hur-l1"], data?.stations);
  const [dinyx, ferron, cormack] = pick(["dinyx-solventation", "ferron-exchange", "cormack"], data?.methods);
  const [titanium, laranite, quantainium, rubble] = pick(["titanium", "laranite", "quantainium", "construction-material-rubble"], data?.materials);
  const patch = data?.patch ?? null;

  /** @type {[number, any][]} [createdAtMs, input] */
  const plans = [
    [now - 19 * HOUR, { title: "Titanium haul #4", stationId: arc, methodId: dinyx, durationSec: 18 * 3600, costAuec: 2640, materials: [{ materialId: titanium, rawCScu: 3200, refinedCScu: 3125 }, { materialId: laranite, rawCScu: 1200, refinedCScu: 1094 }] }],
    [now, { title: "Quick Quantainium run", stationId: levski, methodId: cormack, durationSec: 120, materials: [{ materialId: quantainium, rawCScu: 800 }] }],
    [now - 2 * HOUR, { title: "Laranite batch", stationId: arc, methodId: ferron, durationSec: 9 * 3600, materials: [{ materialId: laranite, rawCScu: 4600 }] }],
    [now - 30 * MIN, { title: "Salvage rubble", stationId: hur, methodId: dinyx, durationSec: 26 * 3600, costAuec: 1200, materials: [{ materialId: rubble, rawCScu: 2400 }] }],
    [now - 2 * DAY, { title: "Old titanium (collected)", stationId: levski, methodId: dinyx, durationSec: 20 * 3600, materials: [{ materialId: titanium, rawCScu: 1600, refinedCScu: 1550 }] }],
    [now - 22 * DAY, { title: "Abandoned job (cancelled)", stationId: hur, methodId: cormack, durationSec: 4 * 3600, materials: [{ materialId: laranite, rawCScu: 500 }] }],
  ];

  const orders = plans.map(([at, input]) => createOrderRecord({ source: "manual", patch, ...input }, at));
  orders[4] = applyStatus(orders[4], "collected", now - DAY);
  orders[5] = applyStatus(orders[5], "cancelled", now - 20 * DAY);
  for (const order of orders) await restoreOrder(order);
  await refresh();
  console.info(`forgelineSeed: ${orders.length} sample orders added (the cancelled one is purged on next load).`);
  return orders.length;
}

/** @type {any} */ (window).forgelineSeed = forgelineSeed;
