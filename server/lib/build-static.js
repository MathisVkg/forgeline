// @ts-check
// Builds static-data.json (SPEC §3.1) from UEX resources.
import { assignSlugs } from "./slug.js";
import { MANUAL_MATERIALS } from "./manual-materials.js";

/** UEX resources needed by buildStatic (game_versions is fetched by the patch step). */
export const STATIC_RESOURCES = /** @type {const} */ ([
  "space_stations",
  "terminals",
  "commodities",
  "refineries_methods",
  "refineries_yields",
]);

/**
 * @typedef {{ id: string, name: string, short: string, system: string }} Station
 * @typedef {{ id: string, name: string, kind: "ore" | "gem" | "salvage", refinedId: string | null }} Material
 * @typedef {{ id: string, name: string, uex: Record<string, number> }} Method
 * @typedef {{ stationId: string, materialId: string, pct: number }} Bonus
 * @typedef {{ generatedAt: string, patch: string | null, stations: Station[], materials: Material[], methods: Method[], bonuses: Bonus[] }} StaticData
 * @typedef {{ materials: Record<string, number>, refined: Record<string, number> }} PriceIndex slug -> UEX commodity id
 * @typedef {{ id: string, name: string, kind: string, source: string, refinedId: string | null, refinedSource: string | null }} MaterialInfo
 */

/**
 * UEX has stations and cities in separate id spaces; uex_map needs one
 * integer per station: space station id as is, city -id, outpost -(1e6 + id).
 * @param {{ id_space_station?: number, id_city?: number, id_outpost?: number }} row
 * @returns {number | null}
 */
export function locationKey(row) {
  if (row.id_space_station) return row.id_space_station;
  if (row.id_city) return -row.id_city;
  if (row.id_outpost) return -(1_000_000 + row.id_outpost);
  return null;
}

/** "Titanium (Ore)" -> "Titanium" @param {string} name */
export function baseName(name) {
  return name.replace(/\s*\((ore|raw)\)\s*$/i, "").trim();
}

/**
 * @param {{ game_versions?: any, space_stations: any[], terminals: any[], commodities: any[], refineries_methods: any[], refineries_yields: any[] }} uex
 * @param {{ db?: import("better-sqlite3").Database | null, now?: Date, patch?: string | null }} [options]
 * @returns {{ data: StaticData, index: PriceIndex, info: { materials: MaterialInfo[], skippedBonuses: number } }}
 */
export function buildStatic(uex, options = {}) {
  const db = options.db ?? null;
  const now = options.now ?? new Date();
  const patch = options.patch ?? uex.game_versions?.live ?? null;
  const live = (/** @type {any} */ row) => row.is_available_live === 1 && row.is_visible !== 0;

  // --- stations: refinery terminals + stations flagged has_refinery + yield locations
  /** @type {Map<number, { name: string, short: string, system: string }>} */
  const locations = new Map();
  const stationsById = new Map(uex.space_stations.map((s) => [s.id, s]));
  /** @param {any} row */
  const addLocation = (row) => {
    const key = locationKey(row);
    if (key === null || locations.has(key)) return;
    if (key > 0) {
      const st = stationsById.get(key);
      const name = st?.name ?? row.space_station_name;
      if (!name || (st && !live(st))) return;
      locations.set(key, {
        name,
        short: st?.nickname || name,
        system: st?.star_system_name ?? row.star_system_name ?? "",
      });
    } else {
      const name = row.city_name ?? row.outpost_name;
      if (!name) return;
      locations.set(key, { name, short: name, system: row.star_system_name ?? "" });
    }
  };
  for (const t of uex.terminals) if (t.type === "refinery" && live(t)) addLocation(t);
  for (const s of uex.space_stations) if (s.has_refinery === 1 && live(s)) addLocation({ ...s, id_space_station: s.id });
  for (const y of uex.refineries_yields) addLocation(y);

  const stationSlugs = assignSlugs(
    db,
    "station",
    [...locations].map(([uexId, loc]) => ({ uexId, base: loc.short })),
  );
  /** @type {Station[]} */
  const stations = [...locations]
    .map(([uexId, loc]) => ({ id: /** @type {string} */ (stationSlugs.get(uexId)), name: loc.name, short: loc.short, system: loc.system }))
    .sort((a, b) => a.system.localeCompare(b.system) || a.name.localeCompare(b.name));

  // --- materials: refinable commodities (+ manual fallback)
  const commodities = uex.commodities;
  const byId = new Map(commodities.map((c) => [c.id, c]));
  /** @param {any} raw @returns {any | null} */
  const refinedOf = (raw) => {
    const parent = raw.id_parent && raw.id_parent !== raw.id ? byId.get(raw.id_parent) : null;
    if (parent) return parent;
    const child = commodities.find((c) => c.id_parent === raw.id && c.id !== raw.id && c.is_refined === 1);
    if (child) return child;
    const base = baseName(raw.name).toLowerCase();
    return commodities.find((c) => c.id !== raw.id && c.name.toLowerCase() === base) ?? null;
  };
  /** @param {any} c @returns {"ore" | "gem" | "salvage"} */
  const kindOf = (c) => (c.kind === "Scrap" ? "salvage" : c.is_harvestable === 1 ? "gem" : "ore");

  const rawList = commodities.filter((c) => c.is_refinable === 1 && live(c));
  const refinedList = [...new Map(rawList.map(refinedOf).filter(Boolean).map((c) => [c.id, c])).values()];
  for (const manual of MANUAL_MATERIALS) {
    const refined = commodities.find((c) => c.name.toLowerCase() === manual.refinedName.toLowerCase());
    if (refined && !refinedList.includes(refined)) refinedList.push(refined);
  }

  const materialSlugs = assignSlugs(db, "material", rawList.map((c) => ({ uexId: c.id, base: baseName(c.name) })));
  const refinedSlugs = assignSlugs(db, "refined", refinedList.map((c) => ({ uexId: c.id, base: c.name })));

  /** @type {PriceIndex} */
  const index = { materials: {}, refined: {} };
  /** @type {MaterialInfo[]} */
  const infos = [];
  /** @type {Material[]} */
  const materials = rawList.map((c) => {
    const id = /** @type {string} */ (materialSlugs.get(c.id));
    const refined = refinedOf(c);
    const refinedId = refined ? /** @type {string} */ (refinedSlugs.get(refined.id)) : null;
    index.materials[id] = c.id;
    if (refined && refinedId) index.refined[refinedId] = refined.id;
    const material = { id, name: baseName(c.name), kind: kindOf(c), refinedId };
    infos.push({ ...material, source: `UEX ${c.id} "${c.name}"`, refinedSource: refined ? `UEX ${refined.id} "${refined.name}"` : null });
    return material;
  });

  const knownNames = new Set(rawList.map((c) => c.name.toLowerCase()));
  for (const manual of MANUAL_MATERIALS) {
    if (knownNames.has(manual.name.toLowerCase()) || materials.some((m) => m.id === manual.id)) continue;
    const refined = commodities.find((c) => c.name.toLowerCase() === manual.refinedName.toLowerCase());
    const refinedId = refined ? /** @type {string} */ (refinedSlugs.get(refined.id)) : null;
    if (refined && refinedId) index.refined[refinedId] = refined.id;
    const material = { id: manual.id, name: manual.name, kind: manual.kind, refinedId };
    materials.push(material);
    infos.push({ ...material, source: "manual", refinedSource: refined ? `UEX ${refined.id} "${refined.name}"` : null });
  }
  const kindOrder = { ore: 0, gem: 1, salvage: 2 };
  materials.sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.name.localeCompare(b.name));

  // --- methods: every numeric UEX field except ids and dates goes into `uex`
  const methodSlugs = assignSlugs(db, "method", uex.refineries_methods.map((m) => ({ uexId: m.id, base: m.name })));
  /** @type {Method[]} */
  const methods = uex.refineries_methods
    .map((m) => ({
      id: /** @type {string} */ (methodSlugs.get(m.id)),
      name: m.name,
      uex: Object.fromEntries(
        Object.entries(m).filter(([k, v]) => typeof v === "number" && k !== "id" && !k.startsWith("id_") && !k.startsWith("date_")),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // --- bonuses: refineries_yields, non-zero values only
  let skippedBonuses = 0;
  /** @type {Bonus[]} */
  const bonuses = [];
  for (const y of uex.refineries_yields) {
    const key = locationKey(y);
    const stationId = key === null ? undefined : stationSlugs.get(key);
    const materialId = materialSlugs.get(y.id_commodity);
    if (!y.value) continue;
    if (!stationId || !materialId || !rawList.some((c) => c.id === y.id_commodity)) {
      skippedBonuses++;
      continue;
    }
    bonuses.push({ stationId, materialId, pct: Number(y.value) });
  }
  bonuses.sort((a, b) => a.stationId.localeCompare(b.stationId) || a.materialId.localeCompare(b.materialId));

  return {
    data: { generatedAt: now.toISOString(), patch, stations, materials, methods, bonuses },
    index,
    info: { materials: infos, skippedBonuses },
  };
}
