// @ts-check
// Pure helpers for the button pickers (station, material, method).

const SYSTEM_ORDER = ["Stanton", "Pyro", "Nyx"];

/**
 * @typedef {{ id: string, name: string, short: string, system: string }} StationLike
 * @typedef {{ id: string, name: string, kind: string }} MaterialLike
 * @typedef {{ id: string, name: string, uex?: Record<string, number> }} MethodLike
 */

/**
 * Button label of a station: its short name without a "(System)" suffix,
 * since stations are grouped by system ("Pyro Gateway (Stanton)" → "Pyro Gateway").
 * @param {string} short
 */
export function stationButtonLabel(short) {
  return short.replace(/\s*\([^)]*\)\s*$/, "").trim() || short;
}

/**
 * Second (smaller) line of a station button: the full name minus the short
 * name ("ARC-L1 Wide Forest Station" → "Wide Forest Station"), or "".
 * @param {StationLike} s
 */
export function stationSubLabel(s) {
  if (s.name === s.short) return "";
  if (s.name.startsWith(s.short)) return s.name.slice(s.short.length).trim();
  return s.name;
}

/**
 * Stations grouped Stanton / Pyro / Nyx (then others), sorted by label.
 * @param {StationLike[] | undefined} stations
 * @returns {{ system: string, stations: (StationLike & { label: string, sub: string })[] }[]}
 */
export function stationPickerGroups(stations) {
  /** @type {Map<string, (StationLike & { label: string, sub: string })[]>} */
  const groups = new Map();
  for (const s of stations ?? []) {
    const list = groups.get(s.system) ?? [];
    list.push({ ...s, label: stationButtonLabel(s.short), sub: stationSubLabel(s) });
    groups.set(s.system, list);
  }
  const rank = (/** @type {string} */ sys) => (SYSTEM_ORDER.includes(sys) ? SYSTEM_ORDER.indexOf(sys) : SYSTEM_ORDER.length);
  return [...groups]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([system, list]) => ({ system, stations: list.sort((a, b) => a.label.localeCompare(b.label, "en", { numeric: true })) }));
}

/**
 * Materials grouped Ores / Gems (only if any) / Salvage, sorted by name,
 * filtered by a case-insensitive search.
 * @param {MaterialLike[] | undefined} materials
 * @param {string} [query]
 */
export function materialPickerGroups(materials, query = "") {
  const q = query.trim().toLowerCase();
  const all = (materials ?? [])
    .filter((m) => !q || m.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [
    { label: "Ores", kind: "ore", items: all.filter((m) => m.kind === "ore") },
    { label: "Gems", kind: "gem", items: all.filter((m) => m.kind === "gem") },
    { label: "Salvage", kind: "salvage", items: all.filter((m) => m.kind === "salvage") },
  ].filter((g) => g.items.length > 0);
}

/**
 * Station bonus shown on a material button: "+6%" (bonus) / "−3%" (penalty), null when 0.
 * @param {number} pct
 * @returns {{ text: string, tone: "bonus" | "penalty" } | null}
 */
export function bonusLabel(pct) {
  if (!pct) return null;
  return pct > 0 ? { text: `+${pct}%`, tone: "bonus" } : { text: `−${Math.abs(pct)}%`, tone: "penalty" };
}

/**
 * Bonus % per material at a station.
 * @param {{ stationId: string, materialId: string, pct: number }[] | undefined} bonuses
 * @param {string} stationId
 * @returns {Map<string, number>}
 */
export function bonusesAt(bonuses, stationId) {
  return new Map((bonuses ?? []).filter((b) => b.stationId === stationId).map((b) => [b.materialId, b.pct]));
}

/**
 * Selecting a material appends a line (selection order); selecting it again
 * removes its line. At most `max` lines.
 * @template {{ materialId: string }} L
 * @param {L[]} lines
 * @param {string} materialId
 * @param {(materialId: string) => L} makeLine
 * @param {number} max
 * @returns {L[]}
 */
export function toggleMaterialLine(lines, materialId, makeLine, max) {
  if (lines.some((l) => l.materialId === materialId)) return lines.filter((l) => l.materialId !== materialId);
  if (lines.length >= max) return lines;
  return [...lines, makeLine(materialId)];
}

const RATING_WORDS = {
  rating_yield: ["Low yield", "Medium yield", "High yield"],
  rating_cost: ["Low cost", "Medium cost", "High cost"],
  rating_speed: ["Slow", "Medium speed", "Fast"],
};

/**
 * "High yield · Low cost · Slow" from the UEX 1–3 ratings.
 * @param {Record<string, number> | undefined} uex
 */
export function methodRatingText(uex) {
  if (!uex) return "";
  return /** @type {(keyof typeof RATING_WORDS)[]} */ (["rating_yield", "rating_cost", "rating_speed"])
    .map((key) => {
      const r = uex[key];
      return Number.isInteger(r) && r >= 1 && r <= 3 ? RATING_WORDS[key][r - 1] : null;
    })
    .filter(Boolean)
    .join(" · ");
}
