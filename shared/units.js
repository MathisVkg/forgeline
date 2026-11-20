// @ts-check
// Quantity units: 1 SCU = 100 cSCU. Quantities are stored as integer cSCU.

/**
 * Converts SCU (number or text such as "12.5" or "12,5") to integer cSCU.
 * @param {number | string} value
 * @returns {number}
 * @throws {RangeError} on negative, non-numeric or more than 2 decimals
 */
export function scuToCScu(value) {
  if (typeof value === "string") {
    const text = value.trim().replace(",", ".");
    if (text.startsWith("-")) throw new RangeError("Quantity cannot be negative");
    if (!/^(\d+(\.\d*)?|\.\d+)$/.test(text)) throw new RangeError(`"${value}" is not a quantity in SCU`);
    const decimals = text.includes(".") ? text.split(".")[1].length : 0;
    if (decimals > 2) throw new RangeError("Use at most 2 decimals (0.01 SCU)");
    const [whole, frac = ""] = text.split(".");
    return Number(whole || "0") * 100 + Number(frac.padEnd(2, "0") || "0");
  }
  if (typeof value !== "number" || !Number.isFinite(value)) throw new RangeError("Quantity is not a number");
  if (value < 0) throw new RangeError("Quantity cannot be negative");
  const cScu = Math.round(value * 100);
  if (Math.abs(cScu - value * 100) > 1e-6) throw new RangeError("Use at most 2 decimals (0.01 SCU)");
  return cScu;
}

/**
 * @param {number} cScu
 * @returns {number} SCU
 */
export function cScuToScu(cScu) {
  return cScu / 100;
}
