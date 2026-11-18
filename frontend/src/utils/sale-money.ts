// Exact decimal arithmetic with BigInt: values are scaled to integers so no float rounding occurs.

/** Converts a decimal value to an integer scaled by 10^places, rejecting more decimals than allowed. */
function scaled(value: string | number, places: number): bigint {
  const match = String(value).match(/^(\d+)(?:\.(\d+))?$/);
  if (!match || (match[2]?.length ?? 0) > places) throw new Error('Importe o cantidad inválida');
  return BigInt(match[1]) * (10n ** BigInt(places)) + BigInt((match[2] ?? '').padEnd(places, '0'));
}

/** Integer division rounding half up. */
const roundHalfUp = (numerator: bigint, denominator: bigint) => (numerator + denominator / 2n) / denominator;

/** Amount in integer cents, or NaN when invalid. */
export function toCents(value: string | number): number {
  try {
    const cents = Number(scaled(value, 2));
    return Number.isSafeInteger(cents) ? cents : NaN;
  } catch {
    return NaN;
  }
}

/** Exact sum of money amounts. */
export function sumMoney(values: (number | string)[]): number {
  return values.reduce<number>((total, value) => total + toCents(value), 0) / 100;
}

// Same rule as the server: per-line base rounded to cents, discount
// by amount and tax rounded per line (half up).
export function calculateLine(quantity: number, price: number, taxPercent: number, discount = 0) {
  const gross = roundHalfUp(scaled(quantity, 3) * scaled(price, 2), 1000n);
  const subtotal = gross - scaled(discount, 2);
  if (subtotal < 0n) throw new Error('El descuento supera el importe de la línea');
  const tax = roundHalfUp(subtotal * scaled(taxPercent, 2), 10000n);
  const total = subtotal + tax;
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Importe fuera de rango');
  return { subtotal: Number(subtotal) / 100, impuesto: Number(tax) / 100, total: Number(total) / 100 };
}

// Percentage discount (POS-004): same rule as the server,
// percentage applied to the rounded line base and rounded to cents (half up).
export function percentDiscount(quantity: number, price: number, percent: number): number {
  const gross = roundHalfUp(scaled(quantity, 3) * scaled(price, 2), 1000n);
  return Number(roundHalfUp(gross * scaled(percent, 2), 10000n)) / 100;
}
