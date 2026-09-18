import { Prisma } from '@prisma/client';
import { z } from 'zod';

export function operationError(message: string, statusCode = 400): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

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

export const moneyField = decimalField('Monto', 2, false);
export const paymentField = decimalField('Pago', 2, true);
export const quantityField = decimalField('Cantidad', 3, true);
export const idField = z.string().trim().min(1);
export const optionalText = z.string().trim().nullish();

export function parseOperation<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    throw operationError(`Datos inválidos en ${first.path.join('.') || 'operación'}: ${first.message}`);
  }
  return result.data;
}

export function roundMoney(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function checkMoneyRange(value: Prisma.Decimal): void {
  if (!value.isFinite() || value.lt(0) || value.gte('10000000000')) {
    throw operationError('El importe calculado está fuera del rango permitido');
  }
}
