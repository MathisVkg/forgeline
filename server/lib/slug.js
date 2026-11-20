// @ts-check
// Stable, readable slugs for UEX entities. Once a UEX id has a slug in
// uex_map it keeps it, even if the UEX name changes.

/**
 * "ARC-L1" -> "arc-l1", "Dinyx Solventation" -> "dinyx-solventation".
 * @param {string} text
 */
export function slugify(text) {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Assigns a slug to every item of one kind. Existing mappings are kept;
 * new items get slugify(base), with -2, -3… on collision.
 * Without a db the assignment is done in memory only (tests, dry runs).
 * @param {import("better-sqlite3").Database | null} db
 * @param {string} kind "station" | "material" | "method" | "refined"
 * @param {{ uexId: number, base: string }[]} items
 * @returns {Map<number, string>} uexId -> slug
 */
export function assignSlugs(db, kind, items) {
  /** @type {Map<number, string>} */
  const byId = new Map();
  /** @type {Set<string>} */
  const taken = new Set();

  const run = () => {
    if (db) {
      const rows = /** @type {{ slug: string, uex_id: number }[]} */ (
        db.prepare("SELECT slug, uex_id FROM uex_map WHERE kind = ?").all(kind)
      );
      for (const row of rows) {
        byId.set(row.uex_id, row.slug);
        taken.add(row.slug);
      }
    }
    const insert = db?.prepare("INSERT INTO uex_map (kind, slug, uex_id) VALUES (?, ?, ?)");
    for (const item of items) {
      if (byId.has(item.uexId)) continue;
      const base = slugify(item.base) || `${kind}-${item.uexId}`;
      let slug = base;
      for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
      byId.set(item.uexId, slug);
      taken.add(slug);
      insert?.run(kind, slug, item.uexId);
    }
  };

  if (db) db.transaction(run)();
  else run();
  return byId;
}

/**
 * Reads the whole mapping of one kind: slug -> uexId.
 * @param {import("better-sqlite3").Database} db
 * @param {string} kind
 * @returns {Record<string, number>}
 */
export function loadSlugMap(db, kind) {
  const rows = /** @type {{ slug: string, uex_id: number }[]} */ (
    db.prepare("SELECT slug, uex_id FROM uex_map WHERE kind = ?").all(kind)
  );
  return Object.fromEntries(rows.map((row) => [row.slug, row.uex_id]));
}
