// @ts-check
// "Clear all data": deletes every order and setting in this browser.
import { ORDERS, SETTINGS, req, withTx } from "./db.js";
import { notifyOrdersChanged } from "./sync.js";
import { forgelineSessionKeys } from "../settings/logic.js";

/**
 * Empties the orders and settings stores (one transaction) and removes the
 * Forgeline sessionStorage keys. Can't be undone.
 * @returns {Promise<void>}
 */
export async function clearAllData() {
  await withTx([ORDERS, SETTINGS], "readwrite", async (tx) => {
    await req(tx.objectStore(ORDERS).clear());
    await req(tx.objectStore(SETTINGS).clear());
  });
  try {
    if (typeof sessionStorage !== "undefined") {
      const keys = Array.from({ length: sessionStorage.length }, (_, i) => sessionStorage.key(i) ?? "");
      for (const key of forgelineSessionKeys(keys)) sessionStorage.removeItem(key);
    }
  } catch {
    // storage blocked: nothing to clear
  }
  notifyOrdersChanged();
}
