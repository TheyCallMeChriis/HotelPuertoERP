function scaled(value: string | number, places: number): bigint {
  const match = String(value).match(/^(\d+)(?:\.(\d+))?$/);
  if (!match || (match[2]?.length ?? 0) > places) throw new Error('Importe o cantidad inválida');
  return BigInt(match[1]) * (10n ** BigInt(places)) + BigInt((match[2] ?? '').padEnd(places, '0'));
}

export function toCents(value: string | number): number {
  try {
    const cents = Number(scaled(value, 2));
    return Number.isSafeInteger(cents) ? cents : NaN;
  } catch {
    return NaN;
  }
}

export function sumMoney(values: (number | string)[]): number {
  return values.reduce<number>((total, value) => total + toCents(value), 0) / 100;
}

// Misma regla que el servidor: base por línea redondeada a centavos, descuento
// por monto e impuesto redondeado por línea (mitades hacia arriba).
export function calculateLine(quantity: number, price: number, taxPercent: number, discount = 0) {
  const round = (numerator: bigint, denominator: bigint) => (numerator + denominator / 2n) / denominator;
  const gross = round(scaled(quantity, 3) * scaled(price, 2), 1000n);
  const subtotal = gross - scaled(discount, 2);
  if (subtotal < 0n) throw new Error('El descuento supera el importe de la línea');
  const tax = round(subtotal * scaled(taxPercent, 2), 10000n);
  const total = subtotal + tax;
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Importe fuera de rango');
  return { subtotal: Number(subtotal) / 100, impuesto: Number(tax) / 100, total: Number(total) / 100 };
}
