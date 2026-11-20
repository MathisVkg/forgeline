// @ts-check
// Hand-maintained material rules for the static-data builder.

/**
 * UEX commodities included even though UEX marks them not live
 * (is_available_live = 0). Matched by name, case-insensitive.
 * Construction Pieces: refinable at refinery terminals in 4.10.3 (owner's
 * in-game screenshots), but listed as not live by UEX.
 * @type {readonly string[]}
 */
export const FORCE_INCLUDE = Object.freeze(["Construction Pieces"]);

/**
 * Refined commodity for raw materials UEX doesn't link (id_parent 0 and no
 * name match). Raw name -> refined name, case-insensitive.
 * @type {Readonly<Record<string, string>>}
 */
export const REFINED_OVERRIDES = Object.freeze({
  "construction pieces": "Construction Materials",
});

/**
 * Fallback salvage raw materials, only used for entries UEX does not list
 * at all (matched by name). As of 2026-11 UEX lists all four, so this list is
 * normally unused.
 * @type {readonly { id: string, name: string, kind: "salvage", refinedName: string }[]}
 */
export const MANUAL_MATERIALS = Object.freeze([
  { id: "construction-material-rubble", name: "Construction Material Rubble", kind: "salvage", refinedName: "Construction Materials" },
  { id: "construction-material-pebbles", name: "Construction Material Pebbles", kind: "salvage", refinedName: "Construction Materials" },
  { id: "construction-material-salvage", name: "Construction Material Salvage", kind: "salvage", refinedName: "Construction Materials" },
  { id: "construction-pieces", name: "Construction Pieces", kind: "salvage", refinedName: "Construction Materials" },
]);
