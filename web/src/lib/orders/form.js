// @ts-check
// New/edit order form logic (pure): text inputs as typed at the refinery
// terminal -> order input for the storage layer, and back.
import { parseAuec, parseDuration } from "@forgeline/shared";
import { convertText, formatQuantity, parseQuantity } from "../quantity.js";
import { MAX_LINES, MAX_PERCENT_FIELD, TITLE_MAX, validateOrderInput } from "../storage/model.js";

/**
 * @typedef {"cscu" | "scu"} QuantityUnit
 * @typedef {{ key: number, materialId: string, qtyText: string, yieldText: string, qualityText: string }} FormLine
 * @typedef {object} FormValues
 * @property {string} stationId
 * @property {string} methodId
 * @property {FormLine[]} lines
 * @property {QuantityUnit} unit
 * @property {string} costText
 * @property {string} timeText
 * @property {string} title
 * @property {string} capacityText
 * @typedef {"manual" | "estimate" | "edit"} FormMode
 * @typedef {import("../stores/draft.svelte.js").OrderDraft} OrderDraft
 * @typedef {import("../storage/model.js").Order} Order
 * @typedef {import("../storage/model.js").OrderInput} OrderInput
 * @typedef {{ stations: { id: string, short?: string }[], methods: { id: string }[], materials: { id: string, name?: string }[], patch?: string | null }} FormStaticData
 * @typedef {{ lastStationId: string | null, lastMethodId: string | null, quantityUnit: QuantityUnit }} FormSettings
 */

export const MAX_FORM_LINES = MAX_LINES;

/** @param {number} key @returns {FormLine} */
export const emptyFormLine = (key) => ({ key, materialId: "", qtyText: "", yieldText: "", qualityText: "" });

/** @param {FormLine} l */
const isBlankLine = (l) => !l.materialId && !l.qtyText.trim() && !l.yieldText.trim() && !l.qualityText.trim();

/**
 * Element id of the input behind an error key (to focus the first error).
 * @param {string} key
 */
export function fieldId(key) {
  // Lines come from the material picker, so a line's "material" error focuses its quantity.
  const line = /^materials\.(\d+)\.(material|qty|yield|quality)$/.exec(key);
  if (line) return `f-${line[2] === "material" ? "qty" : line[2]}-${line[1]}`;
  /** @type {Record<string, string>} */
  const ids = { stationId: "f-station", methodId: "f-method", materials: "f-materials", costAuec: "f-cost", durationSec: "f-time", title: "f-title", capacityPct: "f-capacity" };
  return ids[key] ?? "f-station";
}

/**
 * Error keys in the order fields appear on screen.
 * @param {Record<string, string>} errors
 * @param {number} lineCount
 */
export function orderedErrorKeys(errors, lineCount) {
  const order = ["stationId", "methodId", "materials"];
  for (let i = 0; i < lineCount; i++) for (const f of ["material", "qty", "yield", "quality"]) order.push(`materials.${i}.${f}`);
  order.push("costAuec", "durationSec", "title", "capacityPct");
  return order.filter((k) => errors[k]);
}

export { parseQuantity, formatQuantity } from "../quantity.js";

/**
 * Re-expresses typed quantities in another unit (unparseable text is kept).
 * @param {FormLine[]} lines
 * @param {QuantityUnit} from
 * @param {QuantityUnit} to
 * @returns {FormLine[]}
 */
export function convertLines(lines, from, to) {
  if (from === to) return lines;
  return lines.map((l) => ({ ...l, qtyText: convertText(l.qtyText, from, to), yieldText: convertText(l.yieldText, from, to) }));
}

/**
 * "<first material>[ +N] · <station short>", e.g. "Titanium +1 · ARC-L1".
 * @param {string[]} materialIds non-empty ids in form order
 * @param {string} stationId
 * @param {(id: string) => string} materialName
 * @param {(id: string) => string} stationShort
 */
export function generateTitle(materialIds, stationId, materialName, stationShort) {
  if (materialIds.length === 0) return "";
  const extra = materialIds.length > 1 ? ` +${materialIds.length - 1}` : "";
  const station = stationId ? ` · ${stationShort(stationId)}` : "";
  const title = `${materialName(materialIds[0])}${extra}${station}`;
  return title.length > TITLE_MAX ? title.slice(0, TITLE_MAX).trimEnd() : title;
}

/**
 * Seconds as the terminal writes them: "43h 12m", "54m" (exact to the minute,
 * no days), so the edit form shows what the work order list shows.
 * @param {number} sec
 */
export function terminalDuration(sec) {
  const totalMin = Math.round(sec / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * @param {FormStaticData | null} staticData
 * @param {"stations" | "methods"} list
 * @param {string | null | undefined} id
 */
const known = (staticData, list, id) => (id && staticData?.[list].some((x) => x.id === id) ? id : "");

/**
 * Empty form ("Started in game"): last used station and method.
 * @param {FormSettings} settings
 * @param {FormStaticData | null} staticData
 * @returns {FormValues}
 */
export function emptyValues(settings, staticData) {
  return {
    stationId: known(staticData, "stations", settings.lastStationId),
    methodId: known(staticData, "methods", settings.lastMethodId),
    // lines are added by the material picker
    lines: [],
    unit: settings.quantityUnit,
    costText: "",
    timeText: "",
    title: "",
    capacityText: "",
  };
}

/**
 * Form prefilled from a calculator draft (station, method, quantities).
 * @param {OrderDraft} draft
 * @param {FormSettings} settings
 * @param {FormStaticData | null} staticData
 * @returns {FormValues}
 */
export function valuesFromDraft(draft, settings, staticData) {
  const unit = settings.quantityUnit;
  return {
    ...emptyValues(settings, staticData),
    stationId: known(staticData, "stations", draft.stationId) || draft.stationId,
    methodId: known(staticData, "methods", draft.methodId) || draft.methodId,
    lines: draft.materials.map((m, i) => ({ ...emptyFormLine(i + 1), materialId: m.materialId, qtyText: formatQuantity(m.rawCScu, unit) })),
  };
}

/**
 * Form for editing an order. The time field shows the current time left
 * (read-only until the user chooses to change it).
 * @param {Order} order
 * @param {QuantityUnit} unit
 * @param {number} nowMs
 * @returns {FormValues}
 */
export function valuesForEdit(order, unit, nowMs) {
  const leftSec = Math.ceil((Date.parse(order.endsAt) - nowMs) / 60_000) * 60;
  return {
    stationId: order.stationId,
    methodId: order.methodId,
    lines: order.materials.map((m, i) => ({
      key: i + 1,
      materialId: m.materialId,
      qtyText: formatQuantity(m.rawCScu, unit),
      yieldText: m.refinedCScu == null ? "" : formatQuantity(m.refinedCScu, unit),
      qualityText: m.quality == null ? "" : String(m.quality),
    })),
    unit,
    costText: order.costAuec == null ? "" : String(order.costAuec),
    timeText: leftSec > 0 ? terminalDuration(leftSec) : "",
    title: order.title,
    capacityText: order.capacityPct == null ? "" : String(order.capacityPct),
  };
}

/**
 * @param {string} text
 * @param {string} label
 * @returns {{ value: number | null, error: string | null }}
 */
function parseSmallInt(text, label) {
  const t = text.trim().replace(/\s*%$/, "");
  if (!t) return { value: null, error: null };
  if (!/^\d+$/.test(t) || Number(t) > MAX_PERCENT_FIELD) return { value: null, error: `${label} must be a whole number from 0 to ${MAX_PERCENT_FIELD}.` };
  return { value: Number(t), error: null };
}

/**
 * Which form field a model line error belongs to.
 * @param {string} message
 */
function lineErrorField(message) {
  if (/^yield|refined/i.test(message)) return "yield";
  if (/quantity/i.test(message)) return "qty";
  if (/quality/i.test(message)) return "quality";
  return "material";
}

/**
 * Turns form values into an order input (new) or changes (edit), with
 * error messages keyed by form field.
 * @param {FormValues} values
 * @param {{ mode: FormMode, staticData: FormStaticData | null, draft?: OrderDraft | null, changeTime?: boolean, materialName: (id: string) => string, stationShort: (id: string) => string }} ctx
 * @returns {{ ok: boolean, errors: Record<string, string>, input: OrderInput | null, changes: Partial<OrderInput> | null, title: string }}
 */
export function buildOrderInput(values, ctx) {
  /** @type {Record<string, string>} */
  const errors = {};
  const unitLabel = values.unit === "cscu" ? "1 cSCU" : "0.01 SCU";

  // Lines: completely blank lines are ignored; keep the on-screen index for errors.
  const used = values.lines.map((line, index) => ({ line, index })).filter(({ line }) => !isBlankLine(line));
  /** @type {{ materialId: string, rawCScu: number, refinedCScu: number | null, quality: number | null }[]} */
  const materials = [];
  for (const { line, index } of used) {
    const at = `materials.${index}`;
    if (!line.materialId) errors[`${at}.material`] = "Choose a material.";
    const qty = parseQuantity(line.qtyText, values.unit);
    if (qty.error) errors[`${at}.qty`] = qty.error;
    else if (qty.value === null) errors[`${at}.qty`] = "Enter the QTY from the terminal.";
    else if (qty.value < 1) errors[`${at}.qty`] = `Enter a quantity of at least ${unitLabel}.`;
    const yld = parseQuantity(line.yieldText, values.unit);
    if (yld.error) errors[`${at}.yield`] = yld.error;
    const quality = parseSmallInt(line.qualityText, "Quality");
    if (quality.error) errors[`${at}.quality`] = quality.error;
    materials.push({ materialId: line.materialId, rawCScu: qty.value ?? 0, refinedCScu: yld.error ? null : yld.value, quality: quality.value });
  }
  if (used.length === 0) errors.materials = "Add at least one material.";

  /** @type {number | null} */
  let costAuec = null;
  if (values.costText.trim()) {
    try {
      costAuec = parseAuec(values.costText);
    } catch (err) {
      errors.costAuec = `${err instanceof Error ? err.message : "Enter an amount in aUEC"}.`;
    }
  }

  const timeEditable = ctx.mode !== "edit" || ctx.changeTime === true;
  /** @type {number | undefined} */
  let durationSec;
  if (timeEditable) {
    try {
      durationSec = parseDuration(values.timeText);
    } catch (err) {
      errors.durationSec = `${err instanceof Error ? err.message : "Enter the time left"}.`.replace(/\.\.$/, ".");
    }
  }

  const capacity = parseSmallInt(values.capacityText, "Capacity");
  if (capacity.error) errors.capacityPct = capacity.error;

  const title =
    values.title.trim() ||
    generateTitle(
      materials.map((m) => m.materialId).filter(Boolean),
      values.stationId,
      ctx.materialName,
      ctx.stationShort,
    );

  const source = ctx.mode === "estimate" ? "estimate" : "manual";
  /** @type {OrderInput} */
  const input = {
    title,
    stationId: values.stationId,
    methodId: values.methodId,
    materials,
    // edit without a time change: placeholder so validation passes; not part of the changes
    durationSec: durationSec ?? 60,
    costAuec,
    capacityPct: capacity.value,
    source,
    estimate: ctx.mode === "estimate" ? (ctx.draft?.snapshot ?? null) : null,
    patch: ctx.mode === "estimate" ? (ctx.draft?.patch ?? ctx.staticData?.patch ?? null) : (ctx.staticData?.patch ?? null),
    shared: false,
  };

  // Model rules (ids exist, duplicates, limits) for anything not already flagged.
  const model = validateOrderInput(input, ctx.staticData);
  for (const [key, message] of Object.entries(model.errors)) {
    const line = /^materials\.(\d+)$/.exec(key);
    if (line) {
      const index = used[Number(line[1])]?.index ?? 0;
      const target = `materials.${index}.${lineErrorField(message)}`;
      if (!Object.keys(errors).some((k) => k.startsWith(`materials.${index}.`))) errors[target] = message;
    } else if (key === "durationSec") {
      if (timeEditable && !errors.durationSec) errors.durationSec = message;
    } else if (key === "title") {
      errors.title = values.title.trim() ? message : "Enter a title, or pick a material so one can be generated.";
    } else if (!errors[key] && !(key === "materials" && errors.materials)) {
      errors[key] = message;
    }
  }

  const ok = Object.keys(errors).length === 0;
  if (!ok) return { ok, errors, input: null, changes: null, title };

  /** @type {Partial<OrderInput>} */
  const changes = {
    title,
    stationId: input.stationId,
    methodId: input.methodId,
    materials: input.materials,
    costAuec: input.costAuec,
    capacityPct: input.capacityPct,
  };
  if (timeEditable) changes.durationSec = durationSec;
  return { ok, errors, input, changes, title };
}
