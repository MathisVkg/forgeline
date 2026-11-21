// @ts-check
// Pure calculator logic (testable in Node without Svelte).
import { estimate } from "@forgeline/shared";
import { snapshotFromEstimate } from "../storage/model.js";
import { convertText, formatQuantity, parseQuantity } from "../quantity.js";

export const MAX_CALC_LINES = 20;
export const DRAFT_ROUTE = "#/new?from=estimate";
const SYSTEM_ORDER = ["Stanton", "Pyro", "Nyx"];

/**
 * @typedef {import("../stores/gameData.svelte.js").StaticData} StaticData
 * @typedef {import("../stores/gameData.svelte.js").Prices} Prices
 * @typedef {import("../quantity.js").QuantityUnit} QuantityUnit
 * @typedef {{ key: number, materialId: string, qtyText: string }} CalcLine
 * @typedef {"net" | "perHour"} SortBy
 * @typedef {{ stationId: string, lines: CalcLine[], sortBy: SortBy, selectedMethodId: string | null }} CalcInputs
 * @typedef {CalcLine & { cScu: number | null, error: string | null, blank: boolean }} ParsedLine
 * @typedef {ReturnType<typeof estimate>} EstimateResult
 * @typedef {EstimateResult["methods"][number]} MethodResult
 */

/**
 * @param {number} key
 * @param {string} [materialId]
 * @returns {CalcLine}
 */
export const emptyLine = (key, materialId = "") => ({ key, materialId, qtyText: "" });

/**
 * Parses quantities (in the shared unit) and flags duplicates. A completely
 * blank line (no material, no quantity) is ignored, not an error.
 * @param {CalcLine[]} lines
 * @param {QuantityUnit} [unit]
 * @returns {ParsedLine[]}
 */
export function parseLines(lines, unit = "cscu") {
  const seen = new Set();
  return lines.map((line) => {
    const text = line.qtyText.trim();
    const blank = !line.materialId && !text;
    /** @type {number | null} */
    let cScu = null;
    /** @type {string | null} */
    let error = null;
    if (text) {
      const parsed = parseQuantity(text, unit);
      if (parsed.error) error = parsed.error;
      else if (parsed.value === 0) error = `Enter more than 0 ${unit === "cscu" ? "cSCU" : "SCU"}.`;
      else cScu = parsed.value;
    }
    if (line.materialId && seen.has(line.materialId)) error = "This material is already in another line.";
    if (line.materialId) seen.add(line.materialId);
    return { ...line, cScu: error ? null : cScu, error, blank };
  });
}

/**
 * Material ids used in other lines.
 * @param {CalcLine[]} lines
 * @param {number} key this line
 */
export function usedElsewhere(lines, key) {
  return new Set(lines.filter((l) => l.key !== key && l.materialId).map((l) => l.materialId));
}

/**
 * What goes to sessionStorage: quantities as cSCU (unit-independent), plus
 * the typed text when it doesn't parse.
 * @param {CalcInputs} inputs
 * @param {QuantityUnit} unit unit of the typed text
 */
export function serializeInputs(inputs, unit) {
  return {
    stationId: inputs.stationId,
    lines: inputs.lines.map((l) => {
      const { value, error } = parseQuantity(l.qtyText, unit);
      return error || value === null ? { materialId: l.materialId, cScu: null, text: l.qtyText } : { materialId: l.materialId, cScu: value };
    }),
    sortBy: inputs.sortBy,
    selectedMethodId: inputs.selectedMethodId,
  };
}

/**
 * Restores stored inputs in the current unit, dropping ids that no longer
 * exist in static data. Reads the Task 7 format (scuText) too.
 * @param {unknown} raw
 * @param {StaticData | null} staticData
 * @param {QuantityUnit} [unit]
 * @returns {CalcInputs}
 */
export function restoreInputs(raw, staticData, unit = "cscu") {
  /** @type {any} */
  const s = typeof raw === "object" && raw !== null ? raw : {};
  const stations = new Set(staticData?.stations.map((x) => x.id) ?? []);
  const materials = new Set(staticData?.materials.map((x) => x.id) ?? []);
  const methods = new Set(staticData?.methods.map((x) => x.id) ?? []);
  /** @param {any} l */
  const text = (l) => {
    if (Number.isInteger(l.cScu) && l.cScu >= 0) return formatQuantity(l.cScu, unit);
    if (typeof l.text === "string") return l.text.slice(0, 20);
    if (typeof l.scuText === "string") return convertText(l.scuText.slice(0, 20), "scu", unit);
    return "";
  };
  const seen = new Set();
  /** @type {CalcLine[]} */
  const lines = (Array.isArray(s.lines) ? s.lines : [])
    .filter((/** @type {any} */ l) => l && typeof l === "object" && typeof l.materialId === "string" && materials.has(l.materialId))
    .filter((/** @type {any} */ l) => !seen.has(l.materialId) && seen.add(l.materialId))
    .slice(0, MAX_CALC_LINES)
    .map((/** @type {any} */ l, /** @type {number} */ i) => ({ key: i + 1, materialId: l.materialId, qtyText: text(l) }));
  return {
    stationId: typeof s.stationId === "string" && stations.has(s.stationId) ? s.stationId : "",
    lines,
    sortBy: s.sortBy === "perHour" ? "perHour" : "net",
    selectedMethodId: typeof s.selectedMethodId === "string" && methods.has(s.selectedMethodId) ? s.selectedMethodId : null,
  };
}

/**
 * Runs the estimate when inputs are valid; otherwise result null + reason.
 * @param {{ stationId: string, parsed: ParsedLine[], staticData: StaticData | null, prices: Prices | null, materialParams: Record<string, any> | null }} input
 * @returns {{ result: EstimateResult | null, reason: string | null }}
 */
export function computeEstimate({ stationId, parsed, staticData, prices, materialParams }) {
  if (!staticData) return { result: null, reason: "Game data isn't available yet." };
  const lines = parsed.filter((l) => !l.blank);
  if (!stationId && lines.length === 0) return { result: null, reason: "Pick a station and add at least one material." };
  if (!stationId) return { result: null, reason: "Pick a station." };
  if (lines.length === 0) return { result: null, reason: "Add at least one material." };
  if (lines.some((l) => l.error)) return { result: null, reason: "Fix the highlighted quantities." };
  if (lines.some((l) => !l.materialId)) return { result: null, reason: "Choose a material for every line." };
  if (lines.some((l) => l.cScu === null)) return { result: null, reason: "Enter a quantity for every material." };
  try {
    const result = estimate({
      stationId,
      materials: lines.map((l) => ({ materialId: l.materialId, rawCScu: /** @type {number} */ (l.cScu) })),
      staticData,
      prices,
      materialParams,
    });
    return { result, reason: null };
  } catch (err) {
    return { result: null, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Methods sorted by net or per hour (descending); ties go to the faster one.
 * @param {EstimateResult} result
 * @param {SortBy} sortBy
 * @returns {MethodResult[]}
 */
export function sortMethods(result, sortBy) {
  const key = sortBy === "perHour" ? "perHourAuec" : "netAuec";
  return [...result.methods].sort((a, b) => b[key] - a[key] || a.durationSec - b.durationSec || a.methodId.localeCompare(b.methodId));
}

/**
 * The selected method if it is in the result, else best net, else the first.
 * @param {EstimateResult | null} result
 * @param {string | null} selected
 */
export function effectiveSelection(result, selected) {
  if (!result) return null;
  if (selected && result.methods.some((m) => m.methodId === selected)) return selected;
  return result.bestNet ?? result.methods[0]?.methodId ?? null;
}

/**
 * @param {StaticData | null} staticData
 * @param {string} stationId
 * @param {string} materialId
 */
export function bonusFor(staticData, stationId, materialId) {
  if (!staticData || !stationId || !materialId) return 0;
  return staticData.bonuses.find((b) => b.stationId === stationId && b.materialId === materialId)?.pct ?? 0;
}

/**
 * Stations grouped by system: Stanton, Pyro, Nyx, then others; by short name inside.
 * @param {StaticData | null} staticData
 */
export function groupStations(staticData) {
  /** @type {Map<string, StaticData["stations"]>} */
  const groups = new Map();
  for (const s of staticData?.stations ?? []) {
    const list = groups.get(s.system) ?? [];
    list.push(s);
    groups.set(s.system, list);
  }
  const rank = (/** @type {string} */ sys) => (SYSTEM_ORDER.includes(sys) ? SYSTEM_ORDER.indexOf(sys) : SYSTEM_ORDER.length);
  return [...groups]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([system, stations]) => ({ system, stations: [...stations].sort((a, b) => a.short.localeCompare(b.short)) }));
}

/** @param {{ short: string, name: string }} s */
export const stationLabel = (s) => (s.short && s.short !== s.name ? `${s.short} · ${s.name}` : s.name);

/**
 * Materials grouped as Ores, Gems (only if any), Salvage; by name inside.
 * @param {StaticData | null} staticData
 */
export function groupMaterials(staticData) {
  const all = [...(staticData?.materials ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  return [
    { label: "Ores", items: all.filter((m) => m.kind === "ore") },
    { label: "Gems", items: all.filter((m) => m.kind === "gem") },
    { label: "Salvage", items: all.filter((m) => m.kind === "salvage") },
  ].filter((g) => g.items.length > 0);
}

/** Words for each calibration source (SPEC §5.3). */
export const SOURCE_WORDS = Object.freeze({ "game-quote": "game quote", shared: "shared quotes", own: "your orders", assumed: "assumed (est.)" });

/**
 * Where the base values of each material in the load come from, e.g.
 * "Construction Pieces: game quote · Titanium: assumed (est.)".
 * @param {Record<string, { source: string, n: number }> | null} materialParams
 * @param {string[]} materialIds the load (duplicates and blanks ignored)
 * @param {StaticData | null} staticData
 * @returns {{ text: string, assumed: boolean, items: { materialId: string, name: string, source: string }[] }}
 */
export function sourceLine(materialParams, materialIds, staticData) {
  const ids = [...new Set(materialIds.filter(Boolean))];
  const items = ids.map((materialId) => {
    const p = materialParams?.[materialId];
    const name = staticData?.materials.find((m) => m.id === materialId)?.name ?? materialId;
    return { materialId, name, source: p?.source ?? "assumed", n: p?.n ?? 0 };
  });
  /** @param {{ source: string, n: number }} i */
  const words = (i) => {
    const w = /** @type {Record<string, string>} */ (SOURCE_WORDS)[i.source] ?? i.source;
    return (i.source === "own" || i.source === "shared") && i.n > 0 ? `${w} (${i.n})` : w;
  };
  return {
    text: items.map((i) => `${i.name}: ${words(i)}`).join(" · "),
    assumed: items.some((i) => i.source === "assumed"),
    items: items.map(({ materialId, name, source }) => ({ materialId, name, source })),
  };
}

/**
 * Oldest refined-price date among the materials in the load (the most
 * conservative age to show), or null.
 * @param {EstimateResult | null} result
 * @param {StaticData | null} staticData
 * @param {Prices | null} prices
 */
export function refinedPricesDate(result, staticData, prices) {
  if (!result || !staticData || !prices) return null;
  /** @type {string | null} */
  let oldest = null;
  for (const line of result.materials) {
    const refinedId = staticData.materials.find((m) => m.id === line.materialId)?.refinedId;
    const at = refinedId ? prices.refined[refinedId]?.updatedAt : undefined;
    if (at && (oldest === null || at < oldest)) oldest = at;
  }
  return oldest;
}

/**
 * Draft handed to the New order form (no order data in the URL).
 * @param {EstimateResult} result
 * @param {string} methodId
 * @param {Prices | null} prices
 * @param {string | null} patch
 * @param {number} nowMs
 */
export function buildDraft(result, methodId, prices, patch, nowMs) {
  return {
    source: /** @type {const} */ ("estimate"),
    stationId: result.stationId,
    methodId,
    materials: result.materials.map((m) => ({ materialId: m.materialId, rawCScu: m.rawCScu })),
    snapshot: snapshotFromEstimate(result, methodId, prices?.generatedAt ?? null),
    patch,
    createdAtMs: nowMs,
  };
}
