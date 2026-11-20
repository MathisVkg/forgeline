// @ts-check
// Patch handling: quotes are kept for the current patch only (SPEC §1, §3.4).
import { getMeta, setMeta } from "./db.js";

/**
 * Compares the live version with meta.current_patch. On change (or first
 * run) deletes quotes of other patches and stores the new version.
 * @param {import("better-sqlite3").Database} db
 * @param {string} livePatch
 * @param {(message: string) => void} [log]
 * @returns {{ changed: boolean, previous: string | null, deletedQuotes: number }}
 */
export function applyPatch(db, livePatch, log = () => {}) {
  if (!livePatch) throw new Error("live patch version is empty");
  const previous = getMeta(db, "current_patch");
  if (previous === livePatch) return { changed: false, previous, deletedQuotes: 0 };

  const deletedQuotes = db.transaction(() => {
    const { changes } = db.prepare("DELETE FROM quotes WHERE patch <> ?").run(livePatch);
    setMeta(db, "current_patch", livePatch);
    return changes;
  })();
  log(`patch changed: ${previous ?? "(none)"} → ${livePatch} (${deletedQuotes} old quotes deleted)`);
  return { changed: true, previous, deletedQuotes };
}
