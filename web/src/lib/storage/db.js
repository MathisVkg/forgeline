// @ts-check
// IndexedDB access (plain API, no dependency). Database "forgeline" (SPEC §4).

export const DB_NAME = "forgeline";
export const DB_VERSION = 1;
export const ORDERS = "orders";
export const SETTINGS = "settings";

export class StorageUnavailableError extends Error {
  /** @param {unknown} [cause] */
  constructor(cause) {
    super("Your browser blocks local storage, so orders can't be saved. Try a normal window.", { cause });
    this.name = "StorageUnavailableError";
  }
}

/** @type {Promise<IDBDatabase> | null} */
let dbPromise = null;

/**
 * Schema upgrades. Each case falls through to the next, so a user on any
 * old version gets every later step.
 * @param {IDBDatabase} db
 * @param {number} oldVersion
 */
export function upgrade(db, oldVersion) {
  switch (oldVersion) {
    case 0: {
      const orders = db.createObjectStore(ORDERS, { keyPath: "id" });
      orders.createIndex("status", "status");
      orders.createIndex("endsAt", "endsAt");
      db.createObjectStore(SETTINGS, { keyPath: "key" });
    }
    // falls through
    // case 1: future version 2 changes go here
    default:
      break;
  }
}

/**
 * Opens (once) and returns the database.
 * @returns {Promise<IDBDatabase>}
 * @throws {StorageUnavailableError}
 */
export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    /** @type {IDBOpenDBRequest} */
    let request;
    try {
      if (typeof indexedDB === "undefined" || !indexedDB) throw new Error("indexedDB is not available");
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(new StorageUnavailableError(err));
      return;
    }
    request.onupgradeneeded = (event) => upgrade(request.result, event.oldVersion);
    request.onsuccess = () => {
      const db = request.result;
      // Another tab opened a newer version: close so it can upgrade.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => reject(new StorageUnavailableError(request.error));
    request.onblocked = () => reject(new StorageUnavailableError(new Error("database upgrade blocked by another tab")));
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

/** Closes the database (tests, or before deleting it). */
export async function closeDb() {
  const pending = dbPromise;
  dbPromise = null;
  if (pending) (await pending.catch(() => null))?.close();
}

/**
 * @template T
 * @param {IDBRequest<T>} request
 * @returns {Promise<T>}
 */
export function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Runs `fn` inside one transaction and resolves with its result once the
 * transaction has committed. Only await IndexedDB requests inside `fn`.
 * @template T
 * @param {string | string[]} stores
 * @param {IDBTransactionMode} mode
 * @param {(tx: IDBTransaction) => Promise<T> | T} fn
 * @returns {Promise<T>}
 */
export async function withTx(stores, mode, fn) {
  const db = await openDb();
  const tx = db.transaction(stores, mode);
  const done = new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));
  });
  /** @type {T} */
  let result;
  try {
    result = await fn(tx);
  } catch (err) {
    try {
      tx.abort();
    } catch {
      // already finished
    }
    await done.catch(() => {});
    throw err;
  }
  await done;
  return result;
}
