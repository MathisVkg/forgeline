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
