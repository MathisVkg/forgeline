// @ts-check
// Fallback salvage raw materials. Only used for entries UEX does not list
// (matched by name, case-insensitive). As of 2026-11 UEX lists all three,
// so this list is normally unused.

/** @type {readonly { id: string, name: string, kind: "salvage", refinedName: string }[]} */
export const MANUAL_MATERIALS = Object.freeze([
  { id: "construction-material-rubble", name: "Construction Material Rubble", kind: "salvage", refinedName: "Construction Materials" },
  { id: "construction-material-pebbles", name: "Construction Material Pebbles", kind: "salvage", refinedName: "Construction Materials" },
  { id: "construction-material-salvage", name: "Construction Material Salvage", kind: "salvage", refinedName: "Construction Materials" },
]);
