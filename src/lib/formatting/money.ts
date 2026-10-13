/**
 * Philippine peso amounts are handled as integer centavos end to end. These
 * helpers only format and parse; every amount that matters is computed by the
 * database from its own rate data.
 */

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 });

/** "₱1,234.50" from 123450 centavos. */
export function formatPhp(centavos: number): string {
  return peso.format(centavos / 100);
}

/**
 * Parses a peso amount typed by a person ("10", "10.5", "1,234.50") into
 * centavos. Returns null for anything that is not a non-negative amount with
 * at most two decimals, so floating point never decides a value.
 */
export function parsePesosToCentavos(input: string): number | null {
  const cleaned = input.trim().replace(/,/g, "");
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  return whole * 100 + fraction;
}

/** "10.50" for a form field from 1050 centavos. */
export function centavosToInput(centavos: number): string {
  return (centavos / 100).toFixed(2);
}

/**
 * Same rule as ve_private.coins_to_centavos: floor(coins * rateCentavos /
 * rateCoins). Used only for the preview shown before the player confirms;
 * BigInt keeps it exact for large values.
 */
export function estimateCentavos(coins: number, rateCoins: number, rateCentavos: number): number {
  if (!Number.isSafeInteger(coins) || coins <= 0 || rateCoins <= 0) return 0;
  return Number((BigInt(coins) * BigInt(rateCentavos)) / BigInt(rateCoins));
}

/** "1,000 VC = ₱10.00". */
export function formatRate(rateCoins: number, rateCentavos: number): string {
  return `${new Intl.NumberFormat("en-US").format(rateCoins)} VC = ${formatPhp(rateCentavos)}`;
}
