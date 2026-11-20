// @ts-check
// In-memory draft handed from the calculator to the New order form.
// Not persisted and never put in the URL.

/**
 * @typedef {object} OrderDraft
 * @property {"estimate"} source
 * @property {string} stationId
 * @property {string} methodId
 * @property {{ materialId: string, rawCScu: number }[]} materials
 * @property {import("../storage/model.js").EstimateSnapshot} snapshot
 * @property {string | null} patch
 * @property {number} createdAtMs
 */

class DraftState {
  /** @type {OrderDraft | null} */
  current = $state(null);
}

export const draft = new DraftState();

/** @param {OrderDraft} value */
export function setDraft(value) {
  draft.current = value;
}

export function clearDraft() {
  draft.current = null;
}
