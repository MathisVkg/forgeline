// @ts-check
// Order model (SPEC §4.1): pure functions only. Time is always passed in
// (nowMs); nothing here reads the clock or touches IndexedDB.
import { MAX_DURATION_SEC, endsAt as computeEndsAt } from "@forgeline/shared";

export const HISTORY_DAYS = 14;
export const TITLE_MAX = 60;
export const MAX_LINES = 20;
export const MIN_DURATION_SEC = 60;
/** Upper bound for capacityPct and quality (terminal values). */
export const MAX_PERCENT_FIELD = 1000;
/** Refined (yield) may be at most this × raw on a line; more means a unit mix-up. */
export const MAX_YIELD_RATIO = 1.3;
export const YIELD_TOO_LARGE = "Yield is larger than the quantity. Check the unit (cSCU or SCU).";
const DAY_MS = 86_400_000;

/** @typedef {"refining" | "collected" | "cancelled"} OrderStatus */
/** @typedef {"estimate" | "manual"} OrderSource */
/** @typedef {{ materialId: string, rawCScu: number, refinedCScu: number | null, quality: number | null }} OrderLine */
/**
 * @typedef {object} EstimateSnapshot
 * @property {string} methodId
 * @property {number} totalRefinedCScu
 * @property {number} costAuec
 * @property {number} durationSec
 * @property {number} revenueAuec
 * @property {number} netAuec
 * @property {number} perHourAuec
 * @property {string} paramsSource "game-quote" | "shared" | "own" | "assumed" ("baseline" in orders saved before v1.5)
 * @property {string | null} pricesGeneratedAt
 */
/**
 * @typedef {object} Order
 * @property {string} id
 * @property {string} title
 * @property {string} stationId
 * @property {string} methodId
 * @property {OrderLine[]} materials
 * @property {number | null} costAuec
 * @property {number | null} capacityPct terminal "current capacity" %, or null
 * @property {number} durationSec
 * @property {string} endsAt
 * @property {OrderStatus} status
 * @property {string | null} collectedAt
 * @property {string | null} cancelledAt
 * @property {OrderSource} source
 * @property {EstimateSnapshot | null} estimate
 * @property {string | null} patch
 * @property {boolean} shared
 * @property {string} createdAt
 * @property {string} updatedAt
 */
/**
 * @typedef {object} OrderInput
 * @property {string} title
 * @property {string} stationId
 * @property {string} methodId
 * @property {{ materialId: string, rawCScu: number, refinedCScu?: number | null, quality?: number | null }[]} materials
 * @property {number} durationSec
 * @property {number | null} [costAuec]
 * @property {number | null} [capacityPct]
 * @property {OrderSource} source
 * @property {EstimateSnapshot | null} [estimate]
 * @property {string | null} [patch]
 * @property {boolean} [shared]
 */
/** @typedef {{ stations: { id: string }[], methods: { id: string }[], materials: { id: string }[] }} StaticDataIds */
/** @typedef {{ ok: boolean, errors: Record<string, string> }} ValidationResult */

export const STATUSES = /** @type {const} */ (["refining", "collected", "cancelled"]);
const SOURCES = /** @type {const} */ (["estimate", "manual"]);
const SNAPSHOT_NUMBERS = /** @type {const} */ ([
  "totalRefinedCScu",
  "costAuec",
  "durationSec",
  "revenueAuec",
  "netAuec",
  "perHourAuec",
]);

export class OrderValidationError extends Error {
  /** @param {Record<string, string>} errors */
  constructor(errors) {
    super(`Invalid order: ${Object.values(errors).join(" ")}`);
    this.name = "OrderValidationError";
    this.errors = errors;
  }
}

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
/** @param {unknown} v */
const isIso = (v) => typeof v === "string" && Number.isFinite(Date.parse(v));
/** @param {unknown} v */
const isUint = (v) => typeof v === "number" && Number.isInteger(v) && v >= 0;

/**
 * Checks user input. Messages are written for display next to form fields.
 * Keys: title, stationId, methodId, materials, `materials.<i>`, durationSec,
 * costAuec, capacityPct, source, patch, shared, estimate.
 * @param {any} input
 * @param {StaticDataIds | null} [staticData] skip id checks when missing (offline)
 * @param {{ legacy?: boolean }} [options] legacy: skip rules added after data
 *   was stored (yield ≤ 1.3 × qty), so loading or importing never drops orders
 * @returns {ValidationResult}
 */
export function validateOrderInput(input, staticData, options = {}) {
  /** @type {Record<string, string>} */
  const errors = {};
  if (!isObject(input)) return { ok: false, errors: { form: "Order data is missing." } };
  /** @param {{ id: string }[] | undefined} list @param {unknown} id */
  const exists = (list, id) => !list || list.some((x) => x.id === id);

  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) errors.title = "Enter a title.";
  else if (title.length > TITLE_MAX) errors.title = `Keep the title under ${TITLE_MAX + 1} characters.`;

  if (typeof input.stationId !== "string" || !input.stationId) errors.stationId = "Choose a station.";
  else if (!exists(staticData?.stations, input.stationId)) errors.stationId = "This station is not in the current game data.";

  if (typeof input.methodId !== "string" || !input.methodId) errors.methodId = "Choose a refining method.";
  else if (!exists(staticData?.methods, input.methodId)) errors.methodId = "This method is not in the current game data.";

  const lines = input.materials;
  if (!Array.isArray(lines) || lines.length === 0) errors.materials = "Add at least one material.";
  else if (lines.length > MAX_LINES) errors.materials = `Use at most ${MAX_LINES} material lines.`;
  else {
    const seen = new Set();
    lines.forEach((line, i) => {
      const key = `materials.${i}`;
      if (!isObject(line)) return void (errors[key] = "This material line is incomplete.");
      if (typeof line.materialId !== "string" || !line.materialId) errors[key] = "Choose a material.";
      else if (!exists(staticData?.materials, line.materialId)) errors[key] = "This material is not in the current game data.";
      else if (seen.has(line.materialId)) errors[key] = "This material is already in the order. Add the quantities together.";
      else if (!Number.isInteger(line.rawCScu) || line.rawCScu < 1) errors[key] = "Enter a quantity of at least 0.01 SCU.";
      else if (line.refinedCScu != null && !isUint(line.refinedCScu)) errors[key] = "Refined quantity must be 0 SCU or more.";
      else if (!options.legacy && line.refinedCScu != null && line.refinedCScu > MAX_YIELD_RATIO * line.rawCScu) errors[key] = YIELD_TOO_LARGE;
      else if (line.quality != null && !(isUint(line.quality) && line.quality <= MAX_PERCENT_FIELD))
        errors[key] = `Quality must be a whole number from 0 to ${MAX_PERCENT_FIELD}.`;
      seen.add(line.materialId);
    });
  }

  if (!Number.isInteger(input.durationSec)) errors.durationSec = "Enter the time left, for example 18h 40m.";
  else if (input.durationSec < MIN_DURATION_SEC) errors.durationSec = "Time left must be at least 1 minute.";
  else if (input.durationSec > MAX_DURATION_SEC) errors.durationSec = "Time left cannot be more than 7 days.";

  if (input.costAuec != null && !isUint(input.costAuec)) errors.costAuec = "Cost must be a whole number of aUEC, 0 or more.";
  if (input.capacityPct != null && !(isUint(input.capacityPct) && input.capacityPct <= MAX_PERCENT_FIELD))
    errors.capacityPct = `Capacity must be a whole number from 0 to ${MAX_PERCENT_FIELD} %.`;
  if (!SOURCES.includes(input.source)) errors.source = "Unknown order source.";
  if (input.patch != null && (typeof input.patch !== "string" || !input.patch)) errors.patch = "Unknown game version.";
  if (input.shared != null && typeof input.shared !== "boolean") errors.shared = "Sharing must be on or off.";
  if (input.estimate != null && !normaliseSnapshot(input.estimate)) errors.estimate = "The saved estimate is invalid.";

  return { ok: Object.keys(errors).length === 0, errors };
}

/**
 * Builds a complete, valid order record. Throws OrderValidationError.
 * @param {OrderInput} input
 * @param {number} nowMs
 * @param {{ staticData?: StaticDataIds | null, id?: string }} [options]
 * @returns {Order}
 */
export function createOrderRecord(input, nowMs, options = {}) {
  const result = validateOrderInput(input, options.staticData);
  if (!result.ok) throw new OrderValidationError(result.errors);
  const now = new Date(nowMs).toISOString();
  return {
    id: options.id ?? crypto.randomUUID(),
    ...normaliseFields(input),
    endsAt: computeEndsAt(nowMs, input.durationSec),
    status: "refining",
    collectedAt: null,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * The user-editable part of an order, normalised (trimmed title, nulls).
 * @param {OrderInput} input
 */
function normaliseFields(input) {
  return {
    title: input.title.trim(),
    stationId: input.stationId,
    methodId: input.methodId,
    materials: input.materials.map((l) => ({
      materialId: l.materialId,
      rawCScu: l.rawCScu,
      refinedCScu: l.refinedCScu ?? null,
      quality: l.quality ?? null,
    })),
    costAuec: input.costAuec ?? null,
    capacityPct: input.capacityPct ?? null,
    durationSec: input.durationSec,
    source: input.source,
    estimate: input.estimate == null ? null : normaliseSnapshot(input.estimate),
    patch: input.patch ?? null,
    shared: input.shared ?? false,
  };
}

/** Fields `applyChanges` accepts. */
export const EDITABLE_FIELDS = /** @type {const} */ ([
  "title",
  "stationId",
  "methodId",
  "materials",
  "costAuec",
  "capacityPct",
  "durationSec",
  "source",
  "estimate",
  "patch",
  "shared",
]);

/**
 * Returns the order with `changes` applied (pure). Re-validates. `endsAt` is
 * recomputed from nowMs only when `durationSec` is part of the changes.
 * @param {Order} order
 * @param {Partial<OrderInput>} changes
 * @param {number} nowMs
 * @param {{ staticData?: StaticDataIds | null }} [options]
 * @returns {Order}
 */
export function applyChanges(order, changes, nowMs, options = {}) {
  if (!isObject(changes)) throw new TypeError("changes must be an object");
  for (const key of Object.keys(changes))
    if (!EDITABLE_FIELDS.includes(/** @type {any} */ (key))) throw new TypeError(`"${key}" cannot be changed here`);
  /** @type {OrderInput} */
  const merged = { ...order, ...changes };
  const result = validateOrderInput(merged, options.staticData);
  if (!result.ok) throw new OrderValidationError(result.errors);
  return {
    ...order,
    ...normaliseFields(merged),
    endsAt: "durationSec" in changes ? computeEndsAt(nowMs, merged.durationSec) : order.endsAt,
    updatedAt: new Date(nowMs).toISOString(),
  };
}

/**
 * Status rules: refining → collected | cancelled, and collected | cancelled
 * → refining (undo). Anything else throws.
 * @param {Order} order
 * @param {OrderStatus} status
 * @param {number} nowMs
 * @returns {Order}
 */
export function applyStatus(order, status, nowMs) {
  if (!canTransition(order.status, status))
    throw new Error(`Cannot change an order from "${order.status}" to "${status}"`);
  const now = new Date(nowMs).toISOString();
  return {
    ...order,
    status,
    collectedAt: status === "collected" ? now : null,
    cancelledAt: status === "cancelled" ? now : null,
    updatedAt: now,
  };
}

/**
 * @param {string} from
 * @param {string} to
 */
export function canTransition(from, to) {
  if (from === "refining") return to === "collected" || to === "cancelled";
  if (from === "collected" || from === "cancelled") return to === "refining";
  return false;
}

/** @param {Order} order @param {number} nowMs */
export function isReady(order, nowMs) {
  return order.status === "refining" && nowMs >= Date.parse(order.endsAt);
}

/**
 * Share of the time elapsed from createdAt to endsAt, clamped to 0–1.
 * @param {Order} order
 * @param {number} nowMs
 */
export function progress(order, nowMs) {
  const start = Date.parse(order.createdAt);
  const end = Date.parse(order.endsAt);
  if (!(end > start)) return 1;
  return Math.min(1, Math.max(0, (nowMs - start) / (end - start)));
}

/**
 * When the order last changed status (or was updated), in ms.
 * @param {Order} order
 */
function lastChangeMs(order) {
  const at = order.status === "collected" ? order.collectedAt : order.status === "cancelled" ? order.cancelledAt : null;
  return Date.parse(at ?? order.updatedAt);
}

/**
 * Collected or cancelled for more than HISTORY_DAYS. Ready orders are never purged.
 * @param {Order} order
 * @param {number} nowMs
 */
export function shouldPurge(order, nowMs) {
  if (order.status !== "collected" && order.status !== "cancelled") return false;
  return nowMs - lastChangeMs(order) > HISTORY_DAYS * DAY_MS;
}

/**
 * Ready first (oldest endsAt first), then refining by endsAt, then
 * collected/cancelled by most recent change. Returns a new array.
 * @param {Order[]} orders
 * @param {number} nowMs
 */
export function sortOrders(orders, nowMs) {
  /** @param {Order} o */
  const group = (o) => (isReady(o, nowMs) ? 0 : o.status === "refining" ? 1 : 2);
  return [...orders].sort((a, b) => {
    const ga = group(a);
    const gb = group(b);
    if (ga !== gb) return ga - gb;
    if (ga < 2) return Date.parse(a.endsAt) - Date.parse(b.endsAt) || a.id.localeCompare(b.id);
    return lastChangeMs(b) - lastChangeMs(a) || a.id.localeCompare(b.id);
  });
}

/**
 * Small snapshot of one method of an estimate() result, stored with the order.
 * @param {ReturnType<typeof import("@forgeline/shared").estimate>} result
 * @param {string} methodId
 * @param {string | null} pricesGeneratedAt prices.json generatedAt
 * @returns {EstimateSnapshot}
 */
export function snapshotFromEstimate(result, methodId, pricesGeneratedAt) {
  const m = result.methods.find((x) => x.methodId === methodId);
  if (!m) throw new TypeError(`The estimate has no method "${methodId}"`);
  return {
    methodId,
    totalRefinedCScu: m.totalRefinedCScu,
    costAuec: m.costAuec,
    durationSec: m.durationSec,
    revenueAuec: m.revenueAuec,
    netAuec: m.netAuec,
    perHourAuec: m.perHourAuec,
    paramsSource: m.params.source ?? "assumed",
    pricesGeneratedAt: pricesGeneratedAt ?? null,
  };
}

/**
 * @param {unknown} raw
 * @returns {EstimateSnapshot | null}
 */
function normaliseSnapshot(raw) {
  if (!isObject(raw) || typeof raw.methodId !== "string") return null;
  for (const key of SNAPSHOT_NUMBERS) if (typeof raw[key] !== "number" || !Number.isFinite(raw[key])) return null;
  return {
    methodId: raw.methodId,
    totalRefinedCScu: raw.totalRefinedCScu,
    costAuec: raw.costAuec,
    durationSec: raw.durationSec,
    revenueAuec: raw.revenueAuec,
    netAuec: raw.netAuec,
    perHourAuec: raw.perHourAuec,
    paramsSource: typeof raw.paramsSource === "string" ? raw.paramsSource : "baseline",
    pricesGeneratedAt: isIso(raw.pricesGeneratedAt) ? raw.pricesGeneratedAt : null,
  };
}

/**
 * Turns stored or imported data into a valid current-version order, or null.
 * Missing optional fields get defaults; unknown fields are dropped; an
 * invalid estimate snapshot is dropped rather than rejecting the order.
 * @param {unknown} raw
 * @returns {Order | null}
 */
export function migrateOrder(raw) {
  if (!isObject(raw)) return null;
  if (typeof raw.id !== "string" || !raw.id) return null;
  if (!STATUSES.includes(raw.status) || !isIso(raw.endsAt) || !isIso(raw.createdAt)) return null;
  const updatedAt = isIso(raw.updatedAt) ? raw.updatedAt : raw.createdAt;

  /** @type {any} */
  const input = {
    title: raw.title,
    stationId: raw.stationId,
    methodId: raw.methodId,
    materials: Array.isArray(raw.materials)
      ? raw.materials.map((/** @type {any} */ l) =>
          isObject(l) ? { materialId: l.materialId, rawCScu: l.rawCScu, refinedCScu: l.refinedCScu ?? null, quality: l.quality ?? null } : l,
        )
      : raw.materials,
    durationSec: raw.durationSec,
    costAuec: raw.costAuec ?? null,
    capacityPct: raw.capacityPct ?? null,
    source: SOURCES.includes(raw.source) ? raw.source : "manual",
    estimate: raw.estimate == null ? null : normaliseSnapshot(raw.estimate),
    patch: typeof raw.patch === "string" && raw.patch ? raw.patch : null,
    shared: raw.shared === true,
  };
  if (!validateOrderInput(input, null, { legacy: true }).ok) return null;

  const status = /** @type {OrderStatus} */ (raw.status);
  return {
    id: raw.id,
    ...normaliseFields(input),
    endsAt: raw.endsAt,
    status,
    collectedAt: status === "collected" ? (isIso(raw.collectedAt) ? raw.collectedAt : updatedAt) : null,
    cancelledAt: status === "cancelled" ? (isIso(raw.cancelledAt) ? raw.cancelledAt : updatedAt) : null,
    createdAt: raw.createdAt,
    updatedAt,
  };
}
