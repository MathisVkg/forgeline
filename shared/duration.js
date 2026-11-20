// @ts-check
// Timer input (SPEC §5.6): the time left shown by the refinery terminal.

export const MAX_DURATION_SEC = 7 * 24 * 3600;

// "18h40" = 18 h 40 min: bare minutes after h only at the very end.
const UNITS = /^(?:(\d+)d)?(?:(\d+)h(\d+(?=$))?)?(?:(\d+)m)?(?:(\d+)s)?$/;
const CLOCK = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/;

/**
 * Parses "18h 40m", "18h40", "18h", "40m", "1d 2h 5m", "18:40" (h:mm),
 * "1:02:05" (h:mm:ss) or "45s" into seconds.
 * @param {string} text
 * @returns {number} seconds, 1 to 7 days
 * @throws {RangeError} with a message that can be shown to the user
 */
export function parseDuration(text) {
  const input = String(text ?? "").trim().toLowerCase();
  if (!input) throw new RangeError("Enter the time left, for example 18h 40m");
  if (input.startsWith("-")) throw new RangeError("Time left cannot be negative");

  let seconds;
  const clock = CLOCK.exec(input.replace(/\s+/g, ""));
  if (clock) {
    const [, h, m, s] = clock;
    if (Number(m) >= 60) throw new RangeError("Minutes must be below 60 in h:mm");
    if (s !== undefined && Number(s) >= 60) throw new RangeError("Seconds must be below 60 in h:mm:ss");
    seconds = Number(h) * 3600 + Number(m) * 60 + Number(s ?? 0);
  } else {
    // Drop spaces next to unit letters only, so "18 h 40 m" works but
    // "18h40 5m" does not silently become "18h405m".
    const compact = input.replace(/\s*([dhms])\s*/g, "$1");
    const units = UNITS.exec(compact);
    if (!units || units.slice(1).every((part) => part === undefined))
      throw new RangeError(`Could not read "${String(text).trim()}". Use a form like 18h 40m, 1d 2h or 18:40`);
    const [, d, h, hm, m, s] = units;
    if (hm !== undefined && Number(hm) >= 60) throw new RangeError("Minutes must be below 60 in 18h40");
    seconds = Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(hm ?? m ?? 0) * 60 + Number(s ?? 0);
  }

  if (seconds <= 0) throw new RangeError("Time left must be more than 0");
  if (seconds > MAX_DURATION_SEC) throw new RangeError("Time left cannot be more than 7 days");
  return seconds;
}

/**
 * @param {number} nowMs Unix milliseconds
 * @param {number} durationSec
 * @returns {string} ISO end time
 */
export function endsAt(nowMs, durationSec) {
  return new Date(nowMs + durationSec * 1000).toISOString();
}
