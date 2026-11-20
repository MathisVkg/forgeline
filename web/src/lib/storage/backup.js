// @ts-check
// Backup export/import (SPEC §4.3).
import { ORDERS, req, withTx } from "./db.js";
import { migrateOrder } from "./model.js";
import { listOrders } from "./orders.js";
import { notifyOrdersChanged } from "./sync.js";

export const BACKUP_FORMAT = "forgeline-backup";
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

/** @typedef {import("./model.js").Order} Order */
/** @typedef {{ format: string, version: number, exportedAt: string, orders: Order[] }} Backup */
/** @typedef {{ ok: boolean, orders: Order[], skipped: number, errors: string[] }} ParsedBackup */
/** @typedef {{ toWrite: Order[], added: number, updated: number, unchanged: number, skipped: number }} MergeResult */
/** @typedef {{ ok: boolean, added: number, updated: number, unchanged: number, skipped: number, invalid: number, errors: string[] }} ImportResult */

/**
 * @param {Order[]} orders
 * @param {number} nowMs
 * @returns {Backup}
 */
export function buildBackup(orders, nowMs) {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date(nowMs).toISOString(), orders: [...orders] };
}

/** @param {number} nowMs local date YYYY-MM-DD */
export function backupFileName(nowMs) {
  const d = new Date(nowMs);
  const pad = (/** @type {number} */ n) => String(n).padStart(2, "0");
  return `forgeline-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

/**
 * Exports every order and triggers a download in the browser.
 * @param {number} [nowMs]
 * @returns {Promise<{ fileName: string, count: number }>}
 */
export async function downloadBackup(nowMs = Date.now()) {
  const orders = await listOrders();
  const blob = new Blob([JSON.stringify(buildBackup(orders, nowMs), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const fileName = backupFileName(nowMs);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.rel = "noopener";
    document.body.append(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return { fileName, count: orders.length };
}

/** @param {string} text */
function byteLength(text) {
  if (text.length > MAX_BACKUP_BYTES) return text.length; // UTF-8 is never shorter
  return new TextEncoder().encode(text).length;
}

/**
 * Parses and checks a backup file. Invalid orders are skipped and counted.
 * @param {string} text
 * @returns {ParsedBackup}
 */
export function parseBackup(text) {
  /** @param {string} message @returns {ParsedBackup} */
  const fail = (message) => ({ ok: false, orders: [], skipped: 0, errors: [message] });
  if (typeof text !== "string") return fail("This file could not be read.");
  if (byteLength(text) > MAX_BACKUP_BYTES) return fail("This file is too large (over 5 MB) to be a Forgeline backup.");
  /** @type {any} */
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return fail("This file is not valid JSON, so it is not a Forgeline backup.");
  }
  if (typeof data !== "object" || data === null || data.format !== BACKUP_FORMAT)
    return fail("This file is not a Forgeline backup.");
  if (typeof data.version === "number" && data.version > BACKUP_VERSION)
    return fail("This backup was made by a newer version of Forgeline.");
  if (data.version !== BACKUP_VERSION) return fail("This backup version is not supported.");
  if (!Array.isArray(data.orders)) return fail("This backup has no order list.");

  /** @type {Map<string, Order>} */
  const byId = new Map();
  let skipped = 0;
  for (const raw of data.orders) {
    const order = migrateOrder(raw);
    if (!order) {
      skipped++;
      continue;
    }
    const seen = byId.get(order.id);
    if (!seen || order.updatedAt > seen.updatedAt) byId.set(order.id, order);
  }
  const errors = skipped ? [`${skipped} order${skipped === 1 ? " was" : "s were"} invalid and skipped.`] : [];
  return { ok: true, orders: [...byId.values()], skipped, errors };
}

/**
 * Merges imported orders into existing ones by id: the newer updatedAt
 * wins, equal is unchanged, older incoming copies are skipped.
 * @param {Order[]} existing
 * @param {Order[]} incoming
 * @returns {MergeResult}
 */
export function mergeOrders(existing, incoming) {
  const current = new Map(existing.map((o) => [o.id, o]));
  /** @type {MergeResult} */
  const result = { toWrite: [], added: 0, updated: 0, unchanged: 0, skipped: 0 };
  for (const order of incoming) {
    const local = current.get(order.id);
    const diff = local ? Date.parse(order.updatedAt) - Date.parse(local.updatedAt) : 1;
    if (!local) result.added++;
    else if (diff > 0) result.updated++;
    else if (diff === 0) {
      result.unchanged++;
      continue;
    } else {
      result.skipped++;
      continue;
    }
    result.toWrite.push(order);
    current.set(order.id, order);
  }
  return result;
}

/**
 * Reads a backup file, merges it and writes the result in one transaction.
 * @param {Blob} file a File from an <input type="file">
 * @returns {Promise<ImportResult>}
 */
export async function importBackup(file) {
  /** @param {string} message @returns {ImportResult} */
  const fail = (message) => ({ ok: false, added: 0, updated: 0, unchanged: 0, skipped: 0, invalid: 0, errors: [message] });
  if (file.size > MAX_BACKUP_BYTES) return fail("This file is too large (over 5 MB) to be a Forgeline backup.");
  const parsed = parseBackup(await file.text());
  if (!parsed.ok) return fail(parsed.errors[0]);

  const merged = await withTx(ORDERS, "readwrite", async (tx) => {
    const store = tx.objectStore(ORDERS);
    const existing = /** @type {Order[]} */ ((await req(store.getAll())).map(migrateOrder).filter(Boolean));
    const result = mergeOrders(existing, parsed.orders);
    for (const order of result.toWrite) await req(store.put(order));
    return result;
  });
  if (merged.toWrite.length) notifyOrdersChanged();
  return {
    ok: true,
    added: merged.added,
    updated: merged.updated,
    unchanged: merged.unchanged,
    skipped: merged.skipped,
    invalid: parsed.skipped,
    errors: parsed.errors,
  };
}
