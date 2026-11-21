// @ts-check
// Quantity input shared by the order form and the calculator. Stored values
// are always cSCU; the user types cSCU (as on the terminal) or SCU.
import { scuToCScu } from "@forgeline/shared";

/** @typedef {"cscu" | "scu"} QuantityUnit */

/**
 * Quantity text -> cSCU. cSCU mode takes whole numbers like the terminal
 * ("43200", "43,200"); SCU mode takes "432", "12.5" or "12,5".
 * @param {string} text
 * @param {QuantityUnit} unit
 * @returns {{ value: number | null, error: string | null }}
 */
export function parseQuantity(text, unit) {
  const t = text.trim().replace(/[\s  ]/g, "");
  if (!t) return { value: null, error: null };
  if (unit === "cscu") {
    const digits = /^\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, "") : t;
    if (!/^\d+$/.test(digits)) return { value: null, error: "Enter whole cSCU as on the terminal, like 43200 (or switch to SCU)." };
    return { value: Number(digits), error: null };
  }
  try {
    return { value: scuToCScu(t), error: null };
  } catch (err) {
    return { value: null, error: `${err instanceof Error ? err.message : "Enter a quantity in SCU"}.` };
  }
}

/**
 * @param {number} cScu
 * @param {QuantityUnit} unit
 */
export function formatQuantity(cScu, unit) {
  return unit === "cscu" ? String(cScu) : String(cScu / 100);
}

/**
 * Re-expresses typed text in another unit; unparseable text is kept as is.
 * @param {string} text
 * @param {QuantityUnit} from
 * @param {QuantityUnit} to
 */
export function convertText(text, from, to) {
  if (from === to) return text;
  const { value, error } = parseQuantity(text, from);
  return value === null || error ? text : formatQuantity(value, to);
}
