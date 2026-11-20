// @ts-check
// Pure calculator logic (testable in Node without Svelte).
import { estimate, scuToCScu } from "@forgeline/shared";
import { snapshotFromEstimate } from "../storage/model.js";

export const MAX_CALC_LINES = 20;
export const DRAFT_ROUTE = "#/new?from=estimate";
const SYSTEM_ORDER = ["Stanton", "Pyro", "Nyx"];

/**
 * @typedef {import("../stores/gameData.svelte.js").StaticData} StaticData
 * @typedef {import("../stores/gameData.svelte.js").Prices} Prices
 * @typedef {{ key: number, materialId: string, scuText: string }} CalcLine
 * @typedef {"net" | "perHour"} SortBy
 * @typedef {{ stationId: string, lines: CalcLine[], sortBy: SortBy, selectedMethodId: string | null }} CalcInputs
 * @typedef {CalcLine & { cScu: number | null, error: string | null, blank: boolean }} ParsedLine
 * @typedef {ReturnType<typeof estimate>} EstimateResult
 * @typedef {EstimateResult["methods"][number]} MethodResult
 */

/**
 * @param {number} key
 * @returns {CalcLine}
 */
export const emptyLine = (key) => ({ key, materialId: "", scuText: "" });

/**
 * Parses quantities and flags duplicates. A completely blank line (no
 * material, no quantity) is ignored, not an error.
 * @param {CalcLine[]} lines
 * @returns {ParsedLine[]}
 */
export function parseLines(lines) {
  const seen = new Set();
  return lines.map((line) => {
    const text = line.scuText.trim();
    const blank = !line.materialId && !text;
    /** @type {number | null} */
    let cScu = null;
    /** @type {string | null} */
    let error = null;
    if (text) {
      try {
        cScu = scuToCScu(text);
        if (cScu === 0) error = "Enter more than 0 SCU.";
      } catch (err) {
        error = err instanceof Error ? `${err.message}.`.replace(/\.\.$/, ".") : "Enter a quantity in SCU.";
      }
    }
    if (line.materialId && seen.has(line.materialId)) error = "This material is already in another line.";
    if (line.materialId) seen.add(line.materialId);
    return { ...line, cScu: error ? null : cScu, error, blank };
  });
}

/**
 * Material ids used in other lines (to disable them in this line's select).
 * @param {CalcLine[]} lines
 * @param {number} key this line
 */
export function usedElsewhere(lines, key) {
  return new Set(lines.filter((l) => l.key !== key && l.materialId).map((l) => l.materialId));
}

/**
 * Restores stored inputs, dropping ids that no longer exist in static data.
 * @param {unknown} raw
 * @param {StaticData | null} staticData
 * @returns {CalcInputs}
 */
export function restoreInputs(raw, staticData) {
  /** @type {any} */
  const s = typeof raw === "object" && raw !== null ? raw : {};
  const stations = new Set(staticData?.stations.map((x) => x.id) ?? []);
  const materials = new Set(staticData?.materials.map((x) => x.id) ?? []);
  const methods = new Set(staticData?.methods.map((x) => x.id) ?? []);
  /** @type {CalcLine[]} */
  const lines = (Array.isArray(s.lines) ? s.lines : [])
    .filter((/** @type {any} */ l) => l && typeof l === "object")
    .map((/** @type {any} */ l, /** @type {number} */ i) => ({
      key: i + 1,
      materialId: typeof l.materialId === "string" && materials.has(l.materialId) ? l.materialId : "",
      scuText: typeof l.scuText === "string" ? l.scuText.slice(0, 20) : "",
    }))
    .filter((/** @type {CalcLine} */ l) => l.materialId || l.scuText)
    .slice(0, MAX_CALC_LINES);
  return {
    stationId: typeof s.stationId === "string" && stations.has(s.stationId) ? s.stationId : "",
    lines: lines.length ? lines : [emptyLine(1)],
    sortBy: s.sortBy === "perHour" ? "perHour" : "net",
    selectedMethodId: typeof s.selectedMethodId === "string" && methods.has(s.selectedMethodId) ? s.selectedMethodId : null,
  };
}

/**
 * Runs the estimate when inputs are valid; otherwise result null + reason.
 * @param {{ stationId: string, parsed: ParsedLine[], staticData: StaticData | null, prices: Prices | null, params: Record<string, any> | null }} input
 * @returns {{ result: EstimateResult | null, reason: string | null }}
 */
export function computeEstimate({ stationId, parsed, staticData, prices, params }) {
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
      params,
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

/**
 * Where the parameters come from, by the most common source across methods.
 * @param {Record<string, { source: string, n: number }> | null} params
 * @param {number} ownCount own samples in the current patch
 * @returns {{ source: "baseline" | "shared" | "own", text: string }}
 */
export function dataSource(params, ownCount) {
  const list = Object.values(params ?? {});
  /** @type {Record<string, number>} */
  const counts = { baseline: 0, shared: 0, own: 0 };
  for (const p of list) counts[p.source] = (counts[p.source] ?? 0) + 1;
  const source = /** @type {"baseline" | "shared" | "own"} */ (
    ["own", "shared", "baseline"].reduce((best, s) => (counts[s] > counts[best] ? s : best), "baseline")
  );
  if (source === "own") return { source, text: `Based on your ${ownCount} order${ownCount === 1 ? "" : "s"}` };
  if (source === "shared") {
    const n = Math.max(0, ...list.filter((p) => p.source === "shared").map((p) => p.n));
    return { source, text: `Based on ${n} shared quote${n === 1 ? "" : "s"}` };
  }
  return { source, text: "Based on baseline estimates" };
}

/** @param {Record<string, { lowConfidence: boolean }> | null} params */
export function allLowConfidence(params) {
  const list = Object.values(params ?? {});
  return list.length > 0 && list.every((p) => p.lowConfidence);
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
