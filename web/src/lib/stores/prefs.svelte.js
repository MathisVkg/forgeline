// @ts-check
// Preferences shared live between screens (backed by IndexedDB settings):
// the quantity unit (calculator and order form use the same one), recent
// stations (chips next to the station combobox) and the last material kind.
import { addRecentStation } from "../pickers.js";
import { getSettings, updateSettings } from "../storage/settings.js";

/** @typedef {import("../quantity.js").QuantityUnit} QuantityUnit */
/** @typedef {"ore" | "salvage" | "gem"} MaterialKind */

class Prefs {
  /** @type {QuantityUnit} */
  quantityUnit = $state("cscu");
  /** @type {string[]} */
  recentStationIds = $state([]);
  /** @type {MaterialKind | null} */
  lastMaterialKind = $state(null);
  /** @type {string | null} */
  lastBackupAt = $state(null);
  /** @type {string | null} */
  backupReminderDismissedAt = $state(null);
  loaded = $state(false);
}

export const prefs = new Prefs();

/** @type {Promise<void> | null} */
let initPromise = null;

/** Loads preferences once (defaults if storage is blocked). */
export function initPrefs() {
  initPromise ??= getSettings()
    .then((s) => {
      prefs.quantityUnit = s.quantityUnit;
      prefs.recentStationIds = s.recentStationIds;
      prefs.lastMaterialKind = s.lastMaterialKind;
      prefs.lastBackupAt = s.lastBackupAt;
      prefs.backupReminderDismissedAt = s.backupReminderDismissedAt;
    })
    .catch(() => {})
    .finally(() => {
      prefs.loaded = true;
    });
  return initPromise;
}

/** @param {QuantityUnit} unit */
export function setQuantityUnit(unit) {
  if (prefs.quantityUnit === unit) return;
  prefs.quantityUnit = unit;
  updateSettings({ quantityUnit: unit }).catch(() => {});
}

/** Puts a station first in the recent list (max 3). @param {string} stationId */
export function pushRecentStation(stationId) {
  if (!stationId || prefs.recentStationIds[0] === stationId) return;
  prefs.recentStationIds = addRecentStation($state.snapshot(prefs.recentStationIds), stationId);
  updateSettings({ recentStationIds: $state.snapshot(prefs.recentStationIds) }).catch(() => {});
}

/** @param {string | null} kind */
export function setLastMaterialKind(kind) {
  if (kind !== "ore" && kind !== "salvage" && kind !== "gem") return;
  if (prefs.lastMaterialKind === kind) return;
  prefs.lastMaterialKind = kind;
  updateSettings({ lastMaterialKind: kind }).catch(() => {});
}

/** Records a backup export (hides the backup reminder). @param {number} [nowMs] */
export function markBackupDone(nowMs = Date.now()) {
  prefs.lastBackupAt = new Date(nowMs).toISOString();
  updateSettings({ lastBackupAt: prefs.lastBackupAt }).catch(() => {});
}

/** Hides the backup reminder for 14 days. @param {number} [nowMs] */
export function dismissBackupReminder(nowMs = Date.now()) {
  prefs.backupReminderDismissedAt = new Date(nowMs).toISOString();
  updateSettings({ backupReminderDismissedAt: prefs.backupReminderDismissedAt }).catch(() => {});
}

/** Forgets the last station and method (form defaults, "Last" chip). */
export async function clearLastStation() {
  prefs.recentStationIds = [];
  await updateSettings({ recentStationIds: [], lastStationId: null, lastMethodId: null }).catch(() => {});
}

/** Back to defaults after "Clear all data" (storage is already empty). */
export function resetPrefs() {
  prefs.quantityUnit = "cscu";
  prefs.recentStationIds = [];
  prefs.lastMaterialKind = null;
  prefs.lastBackupAt = null;
  prefs.backupReminderDismissedAt = null;
}
