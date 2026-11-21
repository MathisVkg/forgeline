// @ts-check
// The game's refinery model (SPEC §5): every method sits on fixed tiers, and
// every material has three base values. Observed on the owner's terminal
// quotes (patch 4.10.3, .local/fixtures/ingame-quotes-2026-11-20.json):
//
//   refined  = round(raw × maxYield(m) × YIELD_MULT[yieldTier] × (1 + bonus/100))
//   cost     = floor(Σ rawScu × costPerScu(m) × COST_MULT[costTier])
//   duration = round(Σ rawScu × timePerScu(m) × timeMult)
//
// The numbers live here as data: a new quote changes numbers, not code.

/** @typedef {"high" | "moderate" | "low"} YieldTier */
/** @typedef {"low" | "moderate" | "high"} CostTier */
/**
 * @typedef {object} MethodTier
 * @property {YieldTier} yieldTier
 * @property {CostTier} costTier
 * @property {number} timeMult duration multiple of the material's time base
 * @property {string} terminalText the in-game description
 */
/**
 * @typedef {object} MaterialBase
 * @property {number} maxYield refined / raw at the "high" yield tier, before station bonus
 * @property {number} costPerScu aUEC per raw SCU at cost tier "low" (×1)
 * @property {number} timePerScu seconds per raw SCU at time ×1
 * @property {"game-quote" | "assumed"} source
 * @property {number | null} [capacityPct] refinery capacity when the quote was taken
 * @property {string | null} [patch]
 */

export const YIELD_MULT = Object.freeze({ high: 1, moderate: 0.85, low: 0.7 });
export const COST_MULT = Object.freeze({ low: 1, moderate: 2, high: 6 });

/** Method tiers as shown by the refinery terminal (source of truth over UEX ratings). */
export const METHOD_TIERS = Object.freeze(
  /** @type {Record<string, Readonly<MethodTier>>} */ ({
    "xcr-reaction": Object.freeze({ yieldTier: "low", costTier: "high", timeMult: 1, terminalText: "Low yield · High cost · Fastest" }),
    cormack: Object.freeze({ yieldTier: "low", costTier: "moderate", timeMult: 2, terminalText: "Low yield · Moderate cost · Very fast" }),
    "gaskin-process": Object.freeze({ yieldTier: "moderate", costTier: "high", timeMult: 4, terminalText: "Moderate yield · High cost · Fast" }),
    "kazen-winnowing": Object.freeze({ yieldTier: "low", costTier: "low", timeMult: 6, terminalText: "Low yield · Low cost · Slightly slow" }),
    electrostarolysis: Object.freeze({ yieldTier: "moderate", costTier: "moderate", timeMult: 8, terminalText: "Moderate yield · Moderate cost · Moderate speed" }),
    "pyrometric-chromalysis": Object.freeze({ yieldTier: "high", costTier: "high", timeMult: 16, terminalText: "High yield · High cost · Slightly fast" }),
    "thermonatic-deposition": Object.freeze({ yieldTier: "moderate", costTier: "low", timeMult: 24, terminalText: "Moderate yield · Low cost · Slow" }),
    "ferron-exchange": Object.freeze({ yieldTier: "high", costTier: "moderate", timeMult: 32, terminalText: "High yield · Moderate cost · Very slow" }),
    "dinyx-solventation": Object.freeze({ yieldTier: "high", costTier: "low", timeMult: 96, terminalText: "High yield · Low cost · Slowest" }),
  }),
);

/** Fallback for a method the model doesn't know yet (flagged unknownMethod). */
export const UNKNOWN_METHOD_TIER = Object.freeze({ yieldTier: "moderate", costTier: "moderate", timeMult: 8, terminalText: "" });

/**
 * Tiers of a method; unknown methods get moderate / moderate / ×8.
 * @param {string} methodId
 * @returns {MethodTier & { unknownMethod: boolean }}
 */
export function methodTier(methodId) {
  const known = Object.hasOwn(METHOD_TIERS, methodId) ? METHOD_TIERS[methodId] : null;
  return { ...(known ?? UNKNOWN_METHOD_TIER), unknownMethod: !known };
}

/**
 * Construction Pieces, fitted on all 9 terminal quotes (432 SCU at MIC-L2,
 * capacity 336 %, 4.10.3): yield 20 / 17 / 14 % exact; time ×1 = 27 min →
 * 3.75 s per SCU exact; cost floor(432 × c × 1|2|6) = 3455 / 6911 / 20735 holds
 * for c in [7.99961, 8.00000) → midpoint 7.99981 (cost is rounded down).
 * @type {Readonly<MaterialBase>}
 */
export const CONSTRUCTION_PIECES_BASE = Object.freeze({
  maxYield: 0.2,
  costPerScu: 7.99981,
  timePerScu: 3.75,
  source: "game-quote",
  capacityPct: 336,
  patch: "4.10.3",
});

/**
 * Base values per material. Only Construction Pieces is measured; the rest
 * are placeholders until terminal quotes arrive (source "assumed", shown "est.").
 * @type {Readonly<Record<string, Readonly<MaterialBase>>>}
 */
export const MATERIAL_DEFAULTS = Object.freeze({
  "construction-pieces": CONSTRUCTION_PIECES_BASE,
});

/** Placeholder for salvage materials without a quote: same as Construction Pieces. */
export const ASSUMED_SALVAGE = Object.freeze({ ...CONSTRUCTION_PIECES_BASE, source: "assumed", capacityPct: null, patch: null });
/** Placeholder for ores and gems without a quote. */
export const ASSUMED_ORE = Object.freeze({ maxYield: 0.9, costPerScu: 8, timePerScu: 3.75, source: "assumed", capacityPct: null, patch: null });

/**
 * Default base values of one material.
 * @param {{ id: string, kind?: string }} material
 * @returns {MaterialBase}
 */
export function materialDefault(material) {
  if (Object.hasOwn(MATERIAL_DEFAULTS, material.id)) return { ...MATERIAL_DEFAULTS[material.id] };
  return { ...(material.kind === "salvage" ? ASSUMED_SALVAGE : ASSUMED_ORE) };
}

/**
 * Default base values for every material, by id.
 * @param {{ id: string, kind?: string }[]} materials
 * @returns {Record<string, MaterialBase>}
 */
export function materialDefaults(materials) {
  return Object.fromEntries(materials.map((m) => [m.id, materialDefault(m)]));
}

/** Rounding rules found on the fixture. */
export const roundRefined = Math.round;
/** Cost: rounded down (only floor reproduces all three cost tiers). @param {number} x */
export const roundCost = (x) => Math.floor(x + 1e-9);
export const roundDuration = Math.round;
