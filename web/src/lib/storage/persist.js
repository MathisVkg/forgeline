// @ts-check
// Persistent storage request (SPEC §4.3): asked once, on the first saved order.
import { getSettings, updateSettings } from "./settings.js";

/** @returns {StorageManager | null} */
function storageManager() {
  return typeof navigator !== "undefined" && navigator.storage ? navigator.storage : null;
}

/**
 * Calls navigator.storage.persist() once and remembers the answer in
 * settings. Later calls return the stored answer. Never throws.
 * @returns {Promise<boolean>} whether storage is persisted
 */
export async function ensurePersistence() {
  try {
    const settings = await getSettings();
    if (settings.persistRequested) return settings.persisted;
    const storage = storageManager();
    const persisted = typeof storage?.persist === "function" ? await storage.persist() : false;
    await updateSettings({ persistRequested: true, persisted: persisted === true });
    return persisted === true;
  } catch {
    return false;
  }
}

/**
 * Storage status for the Settings page. Never throws.
 * @returns {Promise<{ persisted: boolean, usageBytes: number | null, quotaBytes: number | null }>}
 */
export async function storageInfo() {
  const storage = storageManager();
  let persisted = false;
  try {
    persisted = typeof storage?.persisted === "function" ? await storage.persisted() : (await getSettings()).persisted;
  } catch {
    persisted = false;
  }
  try {
    const estimate = typeof storage?.estimate === "function" ? await storage.estimate() : null;
    return { persisted, usageBytes: estimate?.usage ?? null, quotaBytes: estimate?.quota ?? null };
  } catch {
    return { persisted, usageBytes: null, quotaBytes: null };
  }
}
