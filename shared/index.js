// @ts-check
// Shared code used by web/ and server/: calculation engine, validation, formatting.

export const APP_NAME = "Forgeline";
export const SPEC_VERSION = 1;

export { BASELINE, BASELINE_MEDIAN, PARAM_KEYS, baselineFor, median } from "./baseline.js";
export { scuToCScu, cScuToScu } from "./units.js";
export { estimate } from "./estimate.js";
export { BLEND_K, LOW_CONFIDENCE_BELOW, blendParams } from "./blend.js";
export { MAX_DURATION_SEC, parseDuration, endsAt } from "./duration.js";
export { formatAuec, formatScu, formatDuration, formatCountdown, formatEndTime, formatAge } from "./format.js";
export { QUOTE_LIMITS, validateQuote } from "./validate-quote.js";
