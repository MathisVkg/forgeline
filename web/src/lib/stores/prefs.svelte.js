// @ts-check
// Preferences shared live between screens (backed by IndexedDB settings).
// quantityUnit: the calculator and the order form use the same unit.
import { getSettings, updateSettings } from "../storage/settings.js";

/** @typedef {import("../quantity.js").QuantityUnit} QuantityUnit */

class Prefs {
  /** @type {QuantityUnit} */
  quantityUnit = $state("cscu");
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
