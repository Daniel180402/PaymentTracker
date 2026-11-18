// Helpers for working with money stored as integer cents, formatted it-IT / EUR.

const eur = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const plain = new Intl.NumberFormat("it-IT", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format integer cents as "1.234,56 €". */
export function formatEur(cents: number): string {
  return eur.format(cents / 100);
}

/** Format with an explicit sign, e.g. "+1.234,56 €" / "−12,00 €". */
export function formatSignedEur(cents: number): string {
  const sign = cents > 0 ? "+" : cents < 0 ? "−" : "";
  return `${sign}${eur.format(Math.abs(cents) / 100)}`;
}

/** Format integer cents without the currency symbol, e.g. "1.234,56". */
export function formatPlain(cents: number): string {
  return plain.format(cents / 100);
}

/**
 * Parse a free-text euro amount into integer cents.
 * Accepts "1234,56", "1.234,56", "1234.56", "12", "-5,5". Returns null if empty
 * or unparseable.
 */
export function parseEur(input: string): number | null {
  if (input == null) return null;
  let s = String(input).trim();
  if (s === "") return null;
  s = s.replace(/[€\s]/g, "").replace(/−/g, "-");

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // assume "." is thousands separator, "," is the decimal separator
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    s = s.replace(",", ".");
  }
  // strip any remaining non-numeric (e.g. stray thousands dots already handled)
  if (!/^-?\d*\.?\d*$/.test(s)) return null;
  const value = parseFloat(s);
  if (Number.isNaN(value)) return null;
  return Math.round(value * 100);
}
