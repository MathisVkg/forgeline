// @ts-check
// Shared code used by web/ and server/: calculation engine, validation, formatting.

export const APP_NAME = "Forgeline";
export const SPEC_VERSION = 1;

export {
  ASSUMED_ORE,
  ASSUMED_SALVAGE,
  COST_MULT,
  MATERIAL_DEFAULTS,
  METHOD_TIERS,
  UNKNOWN_METHOD_TIER,
  YIELD_MULT,
  materialDefault,
  materialDefaults,
  methodTier,
} from "./game-model.js";
export { BASE_KEYS, calibrateMaterials, median, sampleInterval, solveValue } from "./calibrate.js";
export { scuToCScu, cScuToScu } from "./units.js";
export { MAX_AUEC_INPUT, parseAuec } from "./money.js";
export { estimate } from "./estimate.js";
export { ownSamplesFromOrders } from "./samples.js";
export { MAX_DURATION_SEC, parseDuration, endsAt } from "./duration.js";
export { formatAuec, formatScu, formatDuration, formatCountdown, formatEndTime, formatAge } from "./format.js";
export { QUOTE_LIMITS, validateQuote } from "./validate-quote.js";
