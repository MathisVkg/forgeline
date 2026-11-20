// @ts-check
// Reactive orders store (Svelte 5 runes) used by the screens (Tasks 6–8).
import {
  deleteOrder,
  importBackup,
  isReady,
  listOrders,
  onOrdersChanged,
  purgeHistory,
  restoreOrder as restoreOrderRecord,
  saveNewOrder,
  setStatus,
  sortOrders,
  updateOrder,
} from "../storage/index.js";

/** @typedef {import("../storage/model.js").Order} Order */
/** @typedef {import("../storage/model.js").OrderInput} OrderInput */
/** @typedef {import("../storage/model.js").OrderStatus} OrderStatus */
/** @typedef {{ staticData?: import("../storage/model.js").StaticDataIds | null }} Options */

const TICK_MS = 60_000;

class OrdersState {
  /** @type {Order[]} */
  #raw = $state([]);
  loading = $state(false);
  /** True once init() finished a load attempt (success or error). */
  loaded = $state(false);
  /** @type {string | null} user-readable error (e.g. storage blocked) */
  error = $state(null);
  /** Shared clock, updated every 60 s and when the tab becomes visible. */
  nowMs = $state(Date.now());

  /** All orders: ready, then refining by end time, then history. */
  orders = $derived(sortOrders(this.#raw, this.nowMs));
  readyOrders = $derived(this.orders.filter((o) => isReady(o, this.nowMs)));
  /** Refining orders, ready ones included. */
  activeOrders = $derived(this.orders.filter((o) => o.status === "refining"));
  historyOrders = $derived(this.orders.filter((o) => o.status !== "refining"));
  /** @type {Record<string, { active: number, ready: number }>} active orders per station */
  countsByStation = $derived(
    this.activeOrders.reduce((acc, o) => {
      const c = (acc[o.stationId] ??= { active: 0, ready: 0 });
      c.active++;
      if (isReady(o, this.nowMs)) c.ready++;
      return acc;
    }, /** @type {Record<string, { active: number, ready: number }>} */ ({})),
  );

  /** @param {Order[]} orders */
  setOrders(orders) {
    this.#raw = orders;
  }
}

export const ordersState = new OrdersState();

/** @type {Promise<void> | null} */
let initPromise = null;
/** @type {ReturnType<typeof setInterval> | null} */
let timer = null;

function tick() {
  ordersState.nowMs = Date.now();
}

function startClock() {
  if (timer !== null) return;
  timer = setInterval(tick, TICK_MS);
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") tick();
    });
  }
}

/** @param {unknown} err */
function message(err) {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Opens the DB, purges old history, loads orders, follows other tabs and
 * starts the shared clock. Safe to call more than once.
 * @returns {Promise<void>}
 */
export function init() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    ordersState.loading = true;
    try {
      await purgeHistory();
      ordersState.setOrders(await listOrders());
      ordersState.error = null;
      onOrdersChanged(() => void refresh());
    } catch (err) {
      ordersState.error = message(err);
      initPromise = null; // allow a retry
    } finally {
      ordersState.loading = false;
      ordersState.loaded = true;
      tick();
      startClock();
    }
  })();
  return initPromise;
}

/** Reloads orders from IndexedDB. */
export async function refresh() {
  try {
    ordersState.setOrders(await listOrders());
    ordersState.error = null;
  } catch (err) {
    ordersState.error = message(err);
  }
  tick();
}

/**
 * Runs a write, then refreshes. Errors (validation, not found) are rethrown
 * for the form or button that called it.
 * @template T
 * @param {() => Promise<T>} action
 * @returns {Promise<T>}
 */
async function write(action) {
  const result = await action();
  await refresh();
  return result;
}

/** @param {OrderInput} input @param {Options} [options] */
export const saveOrder = (input, options) => write(() => saveNewOrder(input, Date.now(), options));
/** @param {string} id @param {Partial<OrderInput>} changes @param {Options} [options] */
export const editOrder = (id, changes, options) => write(() => updateOrder(id, changes, Date.now(), options));
/** @param {string} id @param {OrderStatus} status */
export const changeStatus = (id, status) => write(() => setStatus(id, status, Date.now()));
/** @param {string} id */
export const removeOrder = (id) => write(() => deleteOrder(id));
/** Writes an exact record back (Undo after delete). @param {Order} order */
export const restoreOrder = (order) => write(() => restoreOrderRecord(order));
/** @param {Blob} file */
export const importFromFile = (file) => write(() => importBackup(file));
