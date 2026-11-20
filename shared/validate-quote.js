// @ts-check
// Validation of an anonymous quote (SPEC §6.2). Pure; used by POST /api/quotes.

export const QUOTE_LIMITS = Object.freeze({
  minLines: 1,
  maxLines: 20,
  minRawCScu: 1,
  maxRawCScu: 1_000_000,
  minRatio: 0.3,
  maxRatio: 1.3,
  maxCostAuec: 10_000_000,
  minDurationSec: 60,
  maxDurationSec: 259_200,
});

const FIELDS = ["patch", "stationId", "methodId", "materials", "costAuec", "durationSec"];
const LINE_FIELDS = ["materialId", "rawCScu", "refinedCScu"];

/**
 * @typedef {{ materialId: string, rawCScu: number, refinedCScu: number }} QuoteLine
 * @typedef {{ patch: string, stationId: string, methodId: string, materials: QuoteLine[], costAuec: number, durationSec: number }} Quote
 * @typedef {{ ok: true, value: Quote } | { ok: false, status: 400 | 409, errors: string[] }} QuoteResult
 */

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * @param {unknown} body parsed JSON body
 * @param {{ stations: { id: string }[], methods: { id: string }[], materials: { id: string }[] }} staticData
 * @param {string} currentPatch
 * @returns {QuoteResult}
 */
export function validateQuote(body, staticData, currentPatch) {
  if (!isObject(body)) return { ok: false, status: 400, errors: ["body must be a JSON object"] };

  /** @type {string[]} */
  const errors = [];
  for (const key of Object.keys(body)) if (!FIELDS.includes(key)) errors.push(`unknown field "${key}"`);
  for (const key of FIELDS) if (!(key in body)) errors.push(`missing field "${key}"`);

  /**
   * @param {string} name
   * @param {unknown} v
   * @param {number} min
   * @param {number} max
   */
  const int = (name, v, min, max) => {
    if (typeof v !== "number" || !Number.isInteger(v)) errors.push(`${name} must be an integer`);
    else if (v < min || v > max) errors.push(`${name} must be between ${min} and ${max}`);
  };
  /** @param {string} name @param {unknown} v @param {{ id: string }[]} list */
  const known = (name, v, list) => {
    if (typeof v !== "string" || !v) errors.push(`${name} must be a non-empty string`);
    else if (!list.some((x) => x.id === v)) errors.push(`unknown ${name} "${v}"`);
  };

  let patchMismatch = false;
  if ("patch" in body) {
    if (typeof body.patch !== "string" || !body.patch) errors.push("patch must be a non-empty string");
    else if (body.patch !== currentPatch) patchMismatch = true;
  }
  if ("stationId" in body) known("stationId", body.stationId, staticData.stations);
  if ("methodId" in body) known("methodId", body.methodId, staticData.methods);
  if ("costAuec" in body) int("costAuec", body.costAuec, 0, QUOTE_LIMITS.maxCostAuec);
  if ("durationSec" in body) int("durationSec", body.durationSec, QUOTE_LIMITS.minDurationSec, QUOTE_LIMITS.maxDurationSec);

  /** @type {QuoteLine[]} */
  const lines = [];
  if ("materials" in body) {
    const materials = body.materials;
    if (!Array.isArray(materials)) errors.push("materials must be an array");
    else if (materials.length < QUOTE_LIMITS.minLines || materials.length > QUOTE_LIMITS.maxLines)
      errors.push(`materials must have ${QUOTE_LIMITS.minLines} to ${QUOTE_LIMITS.maxLines} lines`);
    else {
      const seen = new Set();
      materials.forEach((line, i) => {
        const at = `materials[${i}]`;
        if (!isObject(line)) return void errors.push(`${at} must be an object`);
        const before = errors.length;
        for (const key of Object.keys(line)) if (!LINE_FIELDS.includes(key)) errors.push(`${at}: unknown field "${key}"`);
        for (const key of LINE_FIELDS) if (!(key in line)) errors.push(`${at}: missing field "${key}"`);
        if ("materialId" in line) {
          known(`${at}.materialId`, line.materialId, staticData.materials);
          if (seen.has(line.materialId)) errors.push(`${at}: duplicate material "${line.materialId}"`);
          seen.add(line.materialId);
        }
        if ("rawCScu" in line) int(`${at}.rawCScu`, line.rawCScu, QUOTE_LIMITS.minRawCScu, QUOTE_LIMITS.maxRawCScu);
        if ("refinedCScu" in line) int(`${at}.refinedCScu`, line.refinedCScu, 0, Number.MAX_SAFE_INTEGER);
        if (errors.length > before) return;
        const raw = /** @type {number} */ (line.rawCScu);
        const refined = /** @type {number} */ (line.refinedCScu);
        const ratio = refined / raw;
        if (ratio < QUOTE_LIMITS.minRatio || ratio > QUOTE_LIMITS.maxRatio)
          return void errors.push(`${at}: refined / raw must be between ${QUOTE_LIMITS.minRatio} and ${QUOTE_LIMITS.maxRatio}`);
        lines.push({ materialId: /** @type {string} */ (line.materialId), rawCScu: raw, refinedCScu: refined });
      });
    }
  }

  if (errors.length) {
    if (patchMismatch) errors.unshift(`patch "${body.patch}" is not the current patch "${currentPatch}"`);
    return { ok: false, status: 400, errors };
  }
  if (patchMismatch) {
    return { ok: false, status: 409, errors: [`patch "${body.patch}" is not the current patch "${currentPatch}"`] };
  }
  return {
    ok: true,
    value: {
      patch: /** @type {string} */ (body.patch),
      stationId: /** @type {string} */ (body.stationId),
      methodId: /** @type {string} */ (body.methodId),
      materials: lines,
      costAuec: /** @type {number} */ (body.costAuec),
      durationSec: /** @type {number} */ (body.durationSec),
    },
  };
}
