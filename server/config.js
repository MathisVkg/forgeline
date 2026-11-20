// @ts-check
// Runtime configuration from environment variables, with defaults.
// UEX_TOKEN is intentionally not read here (worker only, Task 3).
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = path.dirname(fileURLToPath(import.meta.url));

/** @param {string} name @param {string} fallback */
function env(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

export const config = Object.freeze({
  port: Number(env("PORT", "3000")),
  host: env("HOST", "0.0.0.0"),
  /** Absolute path; relative values are resolved from the current directory. */
  dataDir: path.resolve(env("DATA_DIR", "./data")),
  /** Absolute path; relative values are resolved from the server folder. */
  webDist: path.resolve(serverDir, env("WEB_DIST", "../web/dist")),
  workerCron: env("WORKER_CRON", "17 3 * * *"),
  tz: env("TZ", Intl.DateTimeFormat().resolvedOptions().timeZone),
});
