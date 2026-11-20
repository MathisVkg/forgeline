// @ts-check
// Minimal hash router: #/orders, #/calculator, #/new, #/settings.

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

export const router = $state({ route: parseHash(location.hash) });

function sync() {
  router.route = parseHash(location.hash);
  const canonical = `#/${router.route}`;
  if (location.hash !== canonical) history.replaceState(null, "", canonical);
}

window.addEventListener("hashchange", sync);
sync();
