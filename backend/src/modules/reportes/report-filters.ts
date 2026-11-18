import { Prisma } from '@prisma/client';
import { operationError } from '../../utils/operation-validation';

// Shared report filters.
// "YYYY-MM-DD" dates are read as whole days in the server's local time:
// fechaFin includes that entire day (previously it was cut at UTC midnight and the last day's sales were lost).

export function parseDay(value: unknown, label: string): Date | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const text = String(value).trim();
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const date = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(text);
  const invalid = Number.isNaN(date.getTime())
    || (day && (date.getFullYear() !== Number(day[1]) || date.getMonth() !== Number(day[2]) - 1 || date.getDate() !== Number(day[3])));
  if (invalid) throw operationError(`${label} no es una fecha válida (use AAAA-MM-DD)`);
  return date;
}

// Builds a Prisma date filter from fechaInicio/fechaFin; fechaFin includes the whole day.
export function dateRange(query: Record<string, unknown>): { gte?: Date; lt?: Date } | undefined {
  const inicio = parseDay(query.fechaInicio, 'fechaInicio');
  const finDia = parseDay(query.fechaFin, 'fechaFin');
  if (!inicio && !finDia) return undefined;
  let fin: Date | undefined;
  if (finDia) {
    fin = new Date(finDia);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(query.fechaFin).trim())) fin.setDate(fin.getDate() + 1);
  }
  if (inicio && fin && inicio >= fin) throw operationError('La fecha inicial debe ser anterior o igual a la final');
  return { ...(inicio ? { gte: inicio } : {}), ...(fin ? { lt: fin } : {}) };
}

// Empty query values mean "no filter"
export const optionalId = (value: unknown) => (value === undefined || value === null || value === '' ? undefined : String(value));

export { D } from '../../utils/operation-validation';

// Amounts with 2 decimals and quantities with 3, as numbers for JSON/export
export const money = (v: Prisma.Decimal) => Number(v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2));
export const qty = (v: Prisma.Decimal) => Number(v.toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP).toFixed(3));
