// @ts-check
// Pure helpers for the station / method comboboxes and the material buttons.

const SYSTEM_ORDER = ["Stanton", "Pyro", "Nyx"];
export const MAX_RECENT_STATIONS = 3;

/**
 * @typedef {{ id: string, name: string, short: string, system: string }} StationLike
 * @typedef {{ id: string, name: string, kind: string }} MaterialLike
 * @typedef {{ id: string, name: string, uex?: Record<string, number> }} MethodLike
 * @typedef {object} ComboOption
 * @property {string} id
 * @property {string} label bold part ("MIC-L2", "Dinyx Solventation")
 * @property {string} sub muted part (full station name, method ratings)
 * @property {string} display text shown in the input when selected
 * @property {string} group "" for none ("Stanton", "Pyro", …)
 * @property {string[]} keys normalised search keys, by priority
 */

/**
 * Lower case, without spaces, dashes, dots, parentheses and similar, so
 * "micl2", "mic l2" and "MIC-L2" are equal.
 * @param {string} text
 */
export function normalizeQuery(text) {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s\-–—._·()'’,/]+/g, "");
}

/**
 * Button / chip label of a station: short name without a "(System)" suffix.
 * @param {string} short
 */
export function stationButtonLabel(short) {
  return short.replace(/\s*\([^)]*\)\s*$/, "").trim() || short;
}

/** @param {string} system */
const systemRank = (system) => (SYSTEM_ORDER.includes(system) ? SYSTEM_ORDER.indexOf(system) : SYSTEM_ORDER.length);

/**
 * Station options grouped Stanton / Pyro / Nyx (then others), sorted by
 * short name inside a group. Searchable by short code, full name and system.
 * @param {StationLike[] | undefined} stations
 * @returns {ComboOption[]}
 */
export function stationOptions(stations) {
  return [...(stations ?? [])]
    .sort((a, b) => systemRank(a.system) - systemRank(b.system) || a.system.localeCompare(b.system) || a.short.localeCompare(b.short, "en", { numeric: true }))
    .map((s) => ({
      id: s.id,
      label: s.short,
      sub: s.name === s.short ? "" : s.name,
      display: s.name === s.short ? s.short : `${s.short} · ${s.name}`,
      group: s.system,
      keys: [normalizeQuery(s.short), normalizeQuery(s.name), normalizeQuery(s.system)],
    }));
}

/**
 * Method options (flat), sorted by name, with the rating line.
 * @param {MethodLike[] | undefined} methods
 * @returns {ComboOption[]}
 */
export function methodOptions(methods) {
  return [...(methods ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((m) => ({ id: m.id, label: m.name, sub: methodRatingText(m.uex), display: m.name, group: "", keys: [normalizeQuery(m.name)] }));
}

/**
 * Options matching a query. Empty query: all options in their grouped order.
 * Otherwise best matches first: exact first key, first key starts with,
 * any key starts with, first key contains, any key contains (system, …).
 * @param {ComboOption[]} options
 * @param {string} query
 * @returns {ComboOption[]}
 */
export function filterOptions(options, query) {
  const q = normalizeQuery(query);
  if (!q) return options;
  /** @param {ComboOption} o */
  const rank = (o) => {
    const [first, ...rest] = o.keys;
    if (first === q) return 0;
    if (first.startsWith(q)) return 1;
    if (rest.some((k) => k.startsWith(q))) return 2;
    if (first.includes(q)) return 3;
    if (rest.some((k) => k.includes(q))) return 4;
    return -1;
  };
  return options
    .map((o, i) => ({ o, i, r: rank(o) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.o);
}

/**
 * Consecutive runs of options with the same group (for group headings).
 * @param {ComboOption[]} options
 * @returns {{ group: string, options: ComboOption[] }[]}
 */
export function groupOptions(options) {
  /** @type {{ group: string, options: ComboOption[] }[]} */
  const out = [];
  for (const o of options) {
    const last = out[out.length - 1];
    if (last && last.group === o.group) last.options.push(o);
    else out.push({ group: o.group, options: [o] });
  }
  return out;
}

/**
 * Recent stations, most recent first, deduplicated, at most 3.
 * @param {string[]} recent
 * @param {string} stationId
 */
export function addRecentStation(recent, stationId) {
  if (!stationId) return recent.slice(0, MAX_RECENT_STATIONS);
  return [stationId, ...recent.filter((id) => id !== stationId)].slice(0, MAX_RECENT_STATIONS);
}

/**
 * Recent stations that still exist in static data.
 * @param {string[] | null | undefined} recent
 * @param {StationLike[] | undefined} stations
 * @returns {StationLike[]}
 */
export function knownRecentStations(recent, stations) {
  const byId = new Map((stations ?? []).map((s) => [s.id, s]));
  return (recent ?? []).map((id) => byId.get(id)).filter((s) => s !== undefined).slice(0, MAX_RECENT_STATIONS);
}

/**
 * Materials grouped Ores / Gems (only if any) / Salvage, sorted by name.
 * @param {MaterialLike[] | undefined} materials
 */
export function materialPickerGroups(materials) {
  const all = [...(materials ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  return [
    { label: "Ores", kind: "ore", items: all.filter((m) => m.kind === "ore") },
    { label: "Gems", kind: "gem", items: all.filter((m) => m.kind === "gem") },
    { label: "Salvage", kind: "salvage", items: all.filter((m) => m.kind === "salvage") },
  ].filter((g) => g.items.length > 0);
}

/**
 * The material group shown first: the last saved order's kind, else ores.
 * @param {string | null | undefined} lastKind
 * @param {{ kind: string }[]} groups
 */
export function defaultMaterialKind(lastKind, groups) {
  if (lastKind && groups.some((g) => g.kind === lastKind)) return lastKind;
  return groups.some((g) => g.kind === "ore") ? "ore" : (groups[0]?.kind ?? "ore");
}

/**
 * Selected materials per group kind (for the "Salvage · 1" badge).
 * @param {{ kind: string, items: { id: string }[] }[]} groups
 * @param {string[]} selected
 * @returns {Record<string, number>}
 */
export function selectedCountByKind(groups, selected) {
  const chosen = new Set(selected);
  return Object.fromEntries(groups.map((g) => [g.kind, g.items.filter((m) => chosen.has(m.id)).length]));
}

/**
 * Kind of an order's materials ("ore" / "salvage" / "gem"), or null when mixed or unknown.
 * @param {string[]} materialIds
 * @param {MaterialLike[] | undefined} materials
 */
export function materialKindOf(materialIds, materials) {
  const kinds = new Set(materialIds.map((id) => materials?.find((m) => m.id === id)?.kind));
  return kinds.size === 1 && !kinds.has(undefined) ? /** @type {string} */ ([...kinds][0]) : null;
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
