// @ts-check
// Pure helpers for the Settings page, the backup reminder and the About line.
import { isReady } from "../storage/model.js";
import { mergeOrders, parseBackup } from "../storage/backup.js";

export const BACKUP_REMINDER_MIN_ORDERS = 3;
export const BACKUP_REMINDER_DAYS = 14;
const DAY_MS = 86_400_000;

/** @typedef {import("../storage/model.js").Order} Order */

/**
 * What an import would do, before writing anything.
 * @param {string} text file content
 * @param {Order[]} existing orders in this browser
 * @returns {{ ok: true, total: number, added: number, updated: number, unchanged: number, older: number, invalid: number }
 *   | { ok: false, error: string }}
 */
export function importPreview(text, existing) {
  const parsed = parseBackup(text);
  if (!parsed.ok) return { ok: false, error: parsed.errors[0] ?? "This file can't be imported." };
  const merged = mergeOrders(existing, parsed.orders);
  return {
    ok: true,
    total: parsed.orders.length + parsed.skipped,
    added: merged.added,
    updated: merged.updated,
    unchanged: merged.unchanged,
    older: merged.skipped,
    invalid: parsed.skipped,
  };
}

/**
 * "12 orders in file: 3 new, 1 updated, 8 unchanged, 0 older than yours, 0 invalid"
 * @param {{ total: number, added: number, updated: number, unchanged: number, older: number, invalid: number }} p
 */
export function previewText(p) {
  return `${p.total} order${p.total === 1 ? "" : "s"} in file: ${p.added} new, ${p.updated} updated, ${p.unchanged} unchanged, ${p.older} older than yours, ${p.invalid} invalid`;
}

/**
 * Counts for "N orders (A refining, R ready, H in history)".
 * @param {Order[]} orders
 * @param {number} nowMs
 */
export function orderSummary(orders, nowMs) {
  let refining = 0;
  let ready = 0;
  let history = 0;
  for (const o of orders) {
    if (o.status !== "refining") history++;
    else if (isReady(o, nowMs)) ready++;
    else refining++;
  }
  return { total: orders.length, refining, ready, history };
}

/**
 * The backup reminder shows when there are ≥ 3 orders, no backup in the last
 * 14 days, and it wasn't dismissed in the last 14 days.
 * @param {{ orderCount: number, lastBackupAt: string | null, dismissedAt: string | null, nowMs: number }} input
 */
export function shouldShowBackupReminder({ orderCount, lastBackupAt, dismissedAt, nowMs }) {
  if (orderCount < BACKUP_REMINDER_MIN_ORDERS) return false;
  const recent = (/** @type {string | null} */ iso) => iso !== null && Number.isFinite(Date.parse(iso)) && nowMs - Date.parse(iso) < BACKUP_REMINDER_DAYS * DAY_MS;
  return !recent(lastBackupAt) && !recent(dismissedAt);
}

/**
 * "Forgeline 0.1.0 · abc1234" (or "· dev" for a local build).
 * @param {string} appName
 * @param {string} version
 * @param {string | undefined | null} sha full or short commit sha
 */
export function versionString(appName, version, sha) {
  const short = sha && /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7).toLowerCase() : "dev";
  return `${appName} ${version} · ${short}`;
}

/**
 * Number of shared quotes behind aggregates.json (sum over methods), or 0.
 * @param {{ methods?: Record<string, { yield?: { n?: number } }> } | null | undefined} aggregates
 */
export function sharedQuoteCount(aggregates) {
  return Object.values(aggregates?.methods ?? {}).reduce((sum, m) => sum + (m.yield?.n ?? 0), 0);
}

/**
 * sessionStorage keys that belong to Forgeline ("forgeline.*").
 * @param {Iterable<string>} keys
 */
export function forgelineSessionKeys(keys) {
  return [...keys].filter((k) => k.startsWith("forgeline."));
}
