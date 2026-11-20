// @ts-check
// Minimal hash router: #/orders, #/calculator, #/new, #/settings.
// A query after the route is kept: #/new?edit=<id> -> route "new", query.edit.

/** @typedef {"orders" | "calculator" | "new" | "settings"} Route */

/** @type {readonly Route[]} */
export const ROUTES = ["orders", "calculator", "new", "settings"];

/** @type {Route} */
export const DEFAULT_ROUTE = "orders";

/**
 * @param {string} hash
 * @returns {Route}
 */
export function parseHash(hash) {
  const name = hash.replace(/^#\/?/, "").split(/[/?]/)[0];
  return ROUTES.find((route) => route === name) ?? DEFAULT_ROUTE;
}

/**
 * @param {string} hash
 * @returns {Record<string, string>}
 */
export function parseQuery(hash) {
  const at = hash.indexOf("?");
  return at === -1 ? {} : Object.fromEntries(new URLSearchParams(hash.slice(at + 1)));
}

export const router = $state({ route: parseHash(location.hash), query: parseQuery(location.hash) });

function sync() {
  router.route = parseHash(location.hash);
  router.query = parseQuery(location.hash);
  const name = location.hash.replace(/^#\/?/, "").split(/[/?]/)[0];
  // Unknown or missing route: normalise to the default, dropping the query.
  if (name !== router.route) history.replaceState(null, "", `#/${router.route}`);
}

window.addEventListener("hashchange", sync);
sync();
