// @ts-check
// One toast at a time, with an optional action (e.g. Undo). Auto-hides.

export const TOAST_MS = 8000;

/** @typedef {{ id: number, message: string, actionLabel: string | null, action: (() => unknown) | null }} Toast */

class ToastState {
  /** @type {Toast | null} */
  current = $state(null);
}

export const toast = new ToastState();

/** @type {ReturnType<typeof setTimeout> | null} */
let timer = null;
let nextId = 1;

/**
 * Shows a toast, replacing any current one.
 * @param {string} message
 * @param {{ actionLabel?: string, action?: () => unknown, durationMs?: number }} [options]
 */
export function showToast(message, options = {}) {
  if (timer) clearTimeout(timer);
  const id = nextId++;
  toast.current = { id, message, actionLabel: options.actionLabel ?? null, action: options.action ?? null };
  timer = setTimeout(() => {
    if (toast.current?.id === id) toast.current = null;
  }, options.durationMs ?? TOAST_MS);
}

export function dismissToast() {
  if (timer) clearTimeout(timer);
  timer = null;
  toast.current = null;
}

/** Runs the toast action once, then hides the toast. */
export async function runToastAction() {
  const action = toast.current?.action;
  dismissToast();
  if (action) {
    try {
      await action();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "That didn't work. Please try again.");
    }
  }
}
