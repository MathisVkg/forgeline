// @ts-check
// Settings repository (SPEC §4.2): one IndexedDB record per key.
import { SETTINGS, req, withTx } from "./db.js";

/**
 * @typedef {object} Settings
 * @property {boolean} shareByDefault
 * @property {string | null} lastSeenPatch
 * @property {boolean} persistRequested
 * @property {boolean} persisted
 * @property {string | null} lastStationId station of the last saved order
 * @property {string | null} lastMethodId method of the last saved order
 * @property {"cscu" | "scu"} quantityUnit unit of the order form quantities
 * @property {string[]} recentStationIds up to 3 recent stations, most recent first
 * @property {"ore" | "salvage" | "gem" | null} lastMaterialKind material group of the last saved order
 */

/** @type {Readonly<Settings>} */
export const DEFAULT_SETTINGS = Object.freeze({
  shareByDefault: false,
  lastSeenPatch: null,
  persistRequested: false,
  persisted: false,
  lastStationId: null,
  lastMethodId: null,
  quantityUnit: "cscu",
  recentStationIds: [],
  lastMaterialKind: null,
});

/** @type {Record<keyof Settings, (v: unknown) => boolean>} */
const CHECKS = {
  shareByDefault: (v) => typeof v === "boolean",
  lastSeenPatch: (v) => v === null || (typeof v === "string" && v.length > 0),
  persistRequested: (v) => typeof v === "boolean",
  persisted: (v) => typeof v === "boolean",
  lastStationId: (v) => v === null || (typeof v === "string" && v.length > 0),
  lastMethodId: (v) => v === null || (typeof v === "string" && v.length > 0),
  quantityUnit: (v) => v === "cscu" || v === "scu",
  recentStationIds: (v) => Array.isArray(v) && v.length <= 3 && v.every((x) => typeof x === "string" && x.length > 0),
  lastMaterialKind: (v) => v === null || v === "ore" || v === "salvage" || v === "gem",
};

/** @returns {Promise<Settings>} defaults merged with stored values */
export async function getSettings() {
  const rows = await withTx(SETTINGS, "readonly", (tx) => req(tx.objectStore(SETTINGS).getAll()));
  /** @type {Settings} */
  const settings = { ...DEFAULT_SETTINGS };
  for (const row of /** @type {{ key: string, value: unknown }[]} */ (rows)) {
    const key = /** @type {keyof Settings} */ (row.key);
    if (Object.hasOwn(CHECKS, key) && CHECKS[key](row.value)) /** @type {any} */ (settings)[key] = row.value;
  }
  return settings;
}

/**
 * Stores the given settings and returns the full, merged settings.
 * @param {Partial<Settings>} changes
 * @returns {Promise<Settings>}
 */
export async function updateSettings(changes) {
  for (const [key, value] of Object.entries(changes)) {
    if (!Object.hasOwn(CHECKS, key)) throw new TypeError(`Unknown setting "${key}"`);
    if (!CHECKS[/** @type {keyof Settings} */ (key)](value)) throw new TypeError(`Invalid value for setting "${key}"`);
  }
  await withTx(SETTINGS, "readwrite", async (tx) => {
    const store = tx.objectStore(SETTINGS);
    for (const [key, value] of Object.entries(changes)) await req(store.put({ key, value }));
  });
  return getSettings();
}
