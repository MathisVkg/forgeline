// @ts-check
// Order actions with an Undo toast, shared by cards, history and the dialog.
import { changeStatus, removeOrder, restoreOrder } from "../stores/orders.svelte.js";
import { showToast } from "../stores/toast.svelte.js";

/** @typedef {import("../storage/model.js").Order} Order */

/** @param {unknown} err */
function fail(err) {
  showToast(err instanceof Error ? err.message : "That didn't work. Please try again.");
}

/** @param {Order} order */
export async function markCollected(order) {
  try {
    await changeStatus(order.id, "collected");
    showToast("Marked as collected", { actionLabel: "Undo", action: () => changeStatus(order.id, "refining") });
  } catch (err) {
    fail(err);
  }
}

/** @param {Order} order */
export async function cancelOrder(order) {
  try {
    await changeStatus(order.id, "cancelled");
    showToast("Order cancelled", { actionLabel: "Undo", action: () => changeStatus(order.id, "refining") });
  } catch (err) {
    fail(err);
  }
}

/** Moves a collected/cancelled order back to refining. @param {Order} order */
export async function undoStatus(order) {
  try {
    await changeStatus(order.id, "refining");
    showToast("Moved back to active orders");
  } catch (err) {
    fail(err);
  }
}

/** Deletes; Undo writes the exact record back (same id). @param {Order} order */
export async function deleteWithUndo(order) {
  const copy = structuredClone($state.snapshot(order));
  try {
    await removeOrder(order.id);
    showToast("Order deleted", { actionLabel: "Undo", action: () => restoreOrder(copy) });
  } catch (err) {
    fail(err);
  }
}
