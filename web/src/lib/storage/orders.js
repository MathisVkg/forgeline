// @ts-check
// Orders repository: IndexedDB I/O around the pure model. `nowMs` defaults
// to Date.now() only here. Every write notifies other tabs.
import { ORDERS, req, withTx } from "./db.js";
import { applyChanges, applyStatus, createOrderRecord, migrateOrder, shouldPurge } from "./model.js";
import { ensurePersistence } from "./persist.js";
import { notifyOrdersChanged } from "./sync.js";

/** @typedef {import("./model.js").Order} Order */
/** @typedef {import("./model.js").OrderInput} OrderInput */
/** @typedef {import("./model.js").OrderStatus} OrderStatus */
/** @typedef {{ staticData?: import("./model.js").StaticDataIds | null }} Options */

export class OrderNotFoundError extends Error {
  /** @param {string} id */
  constructor(id) {
    super("This order no longer exists. It may have been deleted in another tab.");
    this.name = "OrderNotFoundError";
    this.id = id;
  }
}

/**
 * All stored orders (unsorted). Records that fail migration are left out.
 * @returns {Promise<Order[]>}
 */
export async function listOrders() {
  const rows = await withTx(ORDERS, "readonly", (tx) => req(tx.objectStore(ORDERS).getAll()));
  return /** @type {Order[]} */ (rows.map(migrateOrder).filter(Boolean));
}

/**
 * @param {string} id
 * @returns {Promise<Order | null>}
 */
export async function getOrder(id) {
  const row = await withTx(ORDERS, "readonly", (tx) => req(tx.objectStore(ORDERS).get(id)));
  return row === undefined ? null : migrateOrder(row);
}

/**
 * Validates, creates and stores a new order. Throws OrderValidationError.
 * The first successful save also requests persistent storage.
 * @param {OrderInput} input
 * @param {number} [nowMs]
 * @param {Options} [options]
 * @returns {Promise<Order>}
 */
export async function saveNewOrder(input, nowMs = Date.now(), options = {}) {
  const order = createOrderRecord(input, nowMs, { staticData: options.staticData });
  await withTx(ORDERS, "readwrite", (tx) => req(tx.objectStore(ORDERS).add(order)));
  notifyOrdersChanged();
  await ensurePersistence();
  return order;
}

/**
 * Reads, changes and writes one order in a single transaction.
 * @param {string} id
 * @param {(order: Order) => Order} change
 * @returns {Promise<Order>}
 */
async function modify(id, change) {
  const updated = await withTx(ORDERS, "readwrite", async (tx) => {
    const store = tx.objectStore(ORDERS);
    const current = migrateOrder(await req(store.get(id)));
    if (!current) throw new OrderNotFoundError(id);
    const next = change(current);
    await req(store.put(next));
    return next;
  });
  notifyOrdersChanged();
  return updated;
}

/**
 * Edits an order. Re-validates; `endsAt` is recomputed from nowMs only if
 * `durationSec` is in `changes`. Status changes go through setStatus.
 * @param {string} id
 * @param {Partial<OrderInput>} changes
 * @param {number} [nowMs]
 * @param {Options} [options]
 * @returns {Promise<Order>}
 */
export function updateOrder(id, changes, nowMs = Date.now(), options = {}) {
  return modify(id, (order) => applyChanges(order, changes, nowMs, { staticData: options.staticData }));
}

/**
 * refining → collected | cancelled, or undo back to refining.
 * @param {string} id
 * @param {OrderStatus} status
 * @param {number} [nowMs]
 * @returns {Promise<Order>}
 */
export function setStatus(id, status, nowMs = Date.now()) {
  return modify(id, (order) => applyStatus(order, status, nowMs));
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteOrder(id) {
  await withTx(ORDERS, "readwrite", (tx) => req(tx.objectStore(ORDERS).delete(id)));
  notifyOrdersChanged();
}

/**
 * Deletes collected/cancelled orders older than 14 days.
 * @param {number} [nowMs]
 * @returns {Promise<number>} number deleted
 */
export async function purgeHistory(nowMs = Date.now()) {
  const deleted = await withTx(ORDERS, "readwrite", async (tx) => {
    const store = tx.objectStore(ORDERS);
    const rows = await req(store.getAll());
    let count = 0;
    for (const row of rows) {
      const order = migrateOrder(row);
      if (order && shouldPurge(order, nowMs)) {
        await req(store.delete(order.id));
        count++;
      }
    }
    return count;
  });
  if (deleted > 0) notifyOrdersChanged();
  return deleted;
}
