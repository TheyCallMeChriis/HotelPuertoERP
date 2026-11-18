// Validation primitives shared by every business operation: typed errors with an HTTP status,
// exact decimal fields (never floating point) and money helpers.
import { Prisma } from '@prisma/client';
import { z } from 'zod';

// Creates an Error carrying the HTTP status that the error middleware will return.
export function operationError(message: string, statusCode = 400): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

// Zod field that accepts a number or numeric string and yields a Prisma.Decimal with at most `places`
// decimals, rejecting negatives (or zero when `positive`) and values outside the column range.
function decimalField(label: string, places: number, positive: boolean) {
  return z.union([z.number(), z.string().trim().regex(/^\d+(\.\d+)?$/)])
    .refine((value) => {
      try {
        const amount = new Prisma.Decimal(value);
        return amount.isFinite() && (positive ? amount.gt(0) : amount.gte(0))
          && amount.decimalPlaces() <= places && amount.lt(new Prisma.Decimal(10).pow(12 - places));
      } catch {
        return false;
      }
    }, `${label}: indique un número ${positive ? 'positivo' : 'no negativo'} de hasta ${places} decimales y dentro del rango permitido`)
    .transform((value) => new Prisma.Decimal(value));
}

// Reusable field definitions for request bodies
export const moneyField = decimalField('Monto', 2, false);
export const paymentField = decimalField('Pago', 2, true);
export const quantityField = decimalField('Cantidad', 3, true);
export const idField = z.string().trim().min(1);
export const optionalText = z.string().trim().nullish();

// Parses a request body and converts the first validation issue into a 400 error.
export function parseOperation<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    throw operationError(`Datos inválidos en ${first.path.join('.') || 'operación'}: ${first.message}`);
  }
  return result.data;
}

/** Shorthand to build exact decimals; defaults to zero. */
export const D = (v: Prisma.Decimal.Value = 0) => new Prisma.Decimal(v);

// Rounds to cents using half-up, the rule used for every price and tax calculation.
export function roundMoney(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

// Guards computed totals against negative values or overflow of DECIMAL(12,2).
export function checkMoneyRange(value: Prisma.Decimal): void {
  if (!value.isFinite() || value.lt(0) || value.gte('10000000000')) {
    throw operationError('El importe calculado está fuera del rango permitido');
  }
}
