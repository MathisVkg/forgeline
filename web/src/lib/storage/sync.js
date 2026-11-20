// @ts-check
// Cross-tab sync: every write posts { type: "orders-changed" } on
// BroadcastChannel("forgeline"). Messages from this tab are ignored by
// onOrdersChanged (the writer already refreshes itself).

export const CHANNEL_NAME = "forgeline";
const TAB_ID = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random());

/** @type {BroadcastChannel | null | undefined} */
let sender;

/** @returns {BroadcastChannel | null} */
function openChannel() {
  if (typeof BroadcastChannel !== "function") return null;
  const channel = new BroadcastChannel(CHANNEL_NAME);
  // Node (tests) keeps the process alive for an open channel.
  /** @type {any} */ (channel).unref?.();
  return channel;
}

/** Tells other tabs that orders changed. Never throws. */
export function notifyOrdersChanged() {
  try {
    if (sender === undefined) sender = openChannel();
    sender?.postMessage({ type: "orders-changed", tab: TAB_ID });
  } catch {
    // sync is best effort
  }
}

/**
 * Calls `callback` when another tab changes orders.
 * @param {() => void} callback
 * @returns {() => void} unsubscribe
 */
export function onOrdersChanged(callback) {
  const channel = openChannel();
  if (!channel) return () => {};
  /** @param {MessageEvent} event */
  const handler = (event) => {
    if (event.data?.type === "orders-changed" && event.data.tab !== TAB_ID) callback();
  };
  channel.addEventListener("message", handler);
  return () => {
    channel.removeEventListener("message", handler);
    channel.close();
  };
}

/** Closes the shared sender channel (tests). */
export function closeSync() {
  sender?.close();
  sender = undefined;
}
