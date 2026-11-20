// @ts-check
// Display formatting, like the game: "268,400 aUEC". Time is always passed in.

const INTEGER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const SCU = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const DAY_MS = 86_400_000;

/** @param {number} n aUEC */
export function formatAuec(n) {
  const rounded = Math.round(n) || 0; // no "-0"
  return `${INTEGER.format(rounded)} aUEC`;
}

/** @param {number} cScu */
export function formatScu(cScu) {
  return `${SCU.format(cScu / 100)} SCU`;
}

/**
 * "18h 40m", "18h", "2d 3h", "2d", "45m", "< 1m".
 * @param {number} sec
 */
export function formatDuration(sec) {
  if (!(sec >= 60)) return "< 1m";
  const totalMin = Math.floor(sec / 60);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

/**
 * "18h 40m left" (rounded up to the minute) or "Ready".
 * @param {string} endsAtIso
 * @param {number} nowMs
 */
export function formatCountdown(endsAtIso, nowMs) {
  const leftMs = Date.parse(endsAtIso) - nowMs;
  if (!(leftMs > 0)) return "Ready";
  return `${formatDuration(Math.ceil(leftMs / 60_000) * 60)} left`;
}

/**
 * Calendar day number of an instant in a time zone (for Today/Tomorrow).
 * @param {number} ms
 * @param {string | undefined} timeZone
 */
function dayNumber(ms, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(ms);
  const get = (/** @type {string} */ type) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day")) / DAY_MS;
}

/**
 * "Today · 19:22", "Tomorrow · 07:05", otherwise "Sat 21 Nov · 19:22".
 * @param {string} iso
 * @param {number} nowMs
 * @param {string} [timeZone] IANA zone; defaults to the runtime's zone
 */
export function formatEndTime(iso, nowMs, timeZone) {
  const ms = Date.parse(iso);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ms);
  const diff = dayNumber(ms, timeZone) - dayNumber(nowMs, timeZone);
  if (diff === 0) return `Today · ${time}`;
  if (diff === 1) return `Tomorrow · ${time}`;
  const day = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", day: "numeric", month: "short" })
    .format(ms)
    .replace(",", "");
  return `${day} · ${time}`;
}

/**
 * "today", "1 day ago", "3 days ago", "5 weeks ago", "4 months ago".
 * @param {string} iso
 * @param {number} nowMs
 */
export function formatAge(iso, nowMs) {
  const days = Math.floor((nowMs - Date.parse(iso)) / DAY_MS);
  if (!(days >= 1)) return "today";
  /** @param {number} n @param {string} unit */
  const ago = (n, unit) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;
  if (days < 14) return ago(days, "day");
  if (days < 63) return ago(Math.floor(days / 7), "week");
  return ago(Math.floor(days / 30), "month");
}
