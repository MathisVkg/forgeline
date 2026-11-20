// @ts-check
// Provisional baseline parameters per refinery method (SPEC §5.4).
// Calibrated by shared and own quotes (see blend.js).

/**
 * @typedef {object} MethodParams
 * @property {number} yield refined / raw ratio before station bonus
 * @property {number} costPerScu aUEC per raw SCU
 * @property {number} baseSec fixed part of the duration, seconds
 * @property {number} secPerScu seconds per raw SCU
 */

/** @type {Readonly<Record<string, Readonly<MethodParams>>>} */
export const BASELINE = Object.freeze({
  "dinyx-solventation": Object.freeze({ yield: 0.93, costPerScu: 60, baseSec: 300, secPerScu: 1500 }),
  "pyrometric-chromalysis": Object.freeze({ yield: 0.9, costPerScu: 150, baseSec: 300, secPerScu: 860 }),
  "ferron-exchange": Object.freeze({ yield: 0.89, costPerScu: 95, baseSec: 300, secPerScu: 780 }),
  "thermonatic-deposition": Object.freeze({ yield: 0.82, costPerScu: 55, baseSec: 300, secPerScu: 740 }),
  electrostarolysis: Object.freeze({ yield: 0.82, costPerScu: 90, baseSec: 300, secPerScu: 490 }),
  "kazen-winnowing": Object.freeze({ yield: 0.75, costPerScu: 50, baseSec: 300, secPerScu: 450 }),
  "gaskin-process": Object.freeze({ yield: 0.8, costPerScu: 160, baseSec: 300, secPerScu: 280 }),
  cormack: Object.freeze({ yield: 0.72, costPerScu: 95, baseSec: 300, secPerScu: 200 }),
  "xcr-reaction": Object.freeze({ yield: 0.7, costPerScu: 165, baseSec: 300, secPerScu: 180 }),
});

/** @type {readonly (keyof MethodParams)[]} */
export const PARAM_KEYS = Object.freeze(["yield", "costPerScu", "baseSec", "secPerScu"]);

/**
 * Median of a list of numbers (mean of the two middle values for even n).
 * @param {number[]} values non-empty
 */
export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Per-parameter median of the baseline table, used for unknown methods. */
export const BASELINE_MEDIAN = Object.freeze(
  /** @type {MethodParams} */ (
    Object.fromEntries(PARAM_KEYS.map((key) => [key, median(Object.values(BASELINE).map((p) => p[key]))]))
  ),
);

/**
 * Baseline parameters for the given method ids. A method without a
 * baseline entry gets the table median and `missingBaseline: true`.
 * @param {string[]} methodIds
 * @returns {Record<string, MethodParams & { missingBaseline: boolean }>}
 */
export function baselineFor(methodIds) {
  return Object.fromEntries(
    methodIds.map((id) => {
      const known = Object.hasOwn(BASELINE, id) ? BASELINE[id] : null;
      return [id, { ...(known ?? BASELINE_MEDIAN), missingBaseline: !known }];
    }),
  );
}
