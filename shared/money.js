// @ts-check
// Money input: the terminal shows costs like "3455.00 aUEC".

export const MAX_AUEC_INPUT = 1_000_000_000;

/**
 * Parses "3455.00", "3,455", "3455", "3 455", "3455 aUEC" (or a number) into
 * whole aUEC (rounded). Commas are thousands separators when they group
 * three digits ("12,345.50"); a single comma followed by 1–2 digits is a
 * decimal comma ("3455,50").
 * @param {number | string} value
 * @returns {number}
 * @throws {RangeError} user-readable message
 */
export function parseAuec(value) {
  let n;
  if (typeof value === "number") {
    n = value;
  } else if (typeof value === "string") {
    let text = value.trim().replace(/\s*auec$/i, "").replace(/[\s  ]/g, "");
    if (!text) throw new RangeError("Enter an amount in aUEC, for example 3455.00");
    if (text.startsWith("-")) throw new RangeError("The amount cannot be negative");
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) text = text.replace(/,/g, "");
    else if (/^\d+,\d{1,2}$/.test(text)) text = text.replace(",", ".");
    if (!/^(\d+(\.\d*)?|\.\d+)$/.test(text)) throw new RangeError(`"${value.trim()}" is not an amount in aUEC`);
    n = Number(text);
  } else {
    throw new RangeError("Enter an amount in aUEC");
  }
  if (!Number.isFinite(n)) throw new RangeError("Enter an amount in aUEC");
  if (n < 0) throw new RangeError("The amount cannot be negative");
  if (n > MAX_AUEC_INPUT) throw new RangeError("The amount is too large");
  return Math.round(n);
}
