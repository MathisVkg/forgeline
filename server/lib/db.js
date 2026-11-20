// @ts-check
// SQLite access (better-sqlite3). The worker opens read-write and migrates;
// the app only opens read-only and never creates the file.
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export const DB_FILE = "forgeline.db";

/** Migration n creates schema version n (PRAGMA user_version). */
const MIGRATIONS = [
  // 1: SPEC §3.4 tables + UEX id mapping
  `
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE quotes (
    id INTEGER PRIMARY KEY,
    patch TEXT NOT NULL,
    station_id TEXT NOT NULL,
    method_id TEXT NOT NULL,
    cost_auec INTEGER NOT NULL,
    duration_sec INTEGER NOT NULL,
    total_raw_cscu INTEGER NOT NULL
  );
  CREATE TABLE quote_materials (
    quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    material_id TEXT NOT NULL,
    raw_cscu INTEGER NOT NULL,
    refined_cscu INTEGER NOT NULL
  );
  CREATE INDEX quote_materials_quote ON quote_materials(quote_id);
  CREATE TABLE uex_map (
    kind TEXT NOT NULL,
    slug TEXT NOT NULL,
    uex_id INTEGER NOT NULL,
    PRIMARY KEY (kind, slug),
    UNIQUE (kind, uex_id)
  );
  `,
];

/** @typedef {import("better-sqlite3").Database} Db */

/**
 * Opens (and creates/migrates) the database for writing.
 * @param {string} dataDir
 * @returns {Db}
 */
export function openDb(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, DB_FILE));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

/**
 * Opens the database read-only, or returns null if it does not exist yet.
 * @param {string} dataDir
 * @returns {Db | null}
 */
export function openDbReadOnly(dataDir) {
  const file = path.join(dataDir, DB_FILE);
  if (!existsSync(file)) return null;
  return new Database(file, { readonly: true, fileMustExist: true });
}

/** @param {Db} db */
export function migrate(db) {
  const current = /** @type {number} */ (db.pragma("user_version", { simple: true }));
  for (let version = current + 1; version <= MIGRATIONS.length; version++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[version - 1]);
      db.pragma(`user_version = ${version}`);
    })();
  }
}

/**
 * @param {Db} db
 * @param {string} key
 * @returns {string | null}
 */
export function getMeta(db, key) {
  const row = /** @type {{ value: string | null } | undefined} */ (
    db.prepare("SELECT value FROM meta WHERE key = ?").get(key)
  );
  return row?.value ?? null;
}

/**
 * @param {Db} db
 * @param {string} key
 * @param {string | number | boolean | null} value
 */
export function setMeta(db, key, value) {
  db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    key,
    value === null ? null : String(value),
  );
}
