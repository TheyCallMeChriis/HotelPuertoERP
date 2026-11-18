// Request schemas for manual inventory operations (INV-003 to INV-006, INV-009).

import { z } from 'zod';
import { idField, moneyField, optionalText, quantityField } from '../../utils/operation-validation';

// One product line of a transfer or adjustment
const item = z.object({ productId: idField, cantidad: quantityField });
export const movementSchema = z.object({
  warehouseId: idField, productId: idField,
  // Document types (ENTRADA_COMPRA, SALIDA_VENTA, ENTRADA_DEVOLUCION, TRASLADO_*) are only created by
  // their own flows, so a manual movement can never impersonate a purchase or a sale.
  tipo: z.enum(['ENTRADA_MANUAL', 'SALIDA_MANUAL', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO', 'MERMA']),
  cantidad: quantityField, motivo: z.string().trim().min(1),
});
export const transferSchema = z.object({
  warehouseOrigenId: idField, warehouseDestinoId: idField,
  items: z.array(item).min(1), notas: optionalText,
});
export const adjustmentSchema = z.object({
  warehouseId: idField, tipo: z.enum(['POSITIVO', 'NEGATIVO']), motivo: z.string().trim().min(1),
  items: z.array(item.extend({ costoUnitario: moneyField.optional() })).min(1),
});

// Movement types that increase stock
export const ENTRY_TYPES = ['ENTRADA_MANUAL', 'AJUSTE_POSITIVO'];

// Minimum and maximum stock per product and warehouse (INV-009)
const level = z.union([z.number(), z.string().trim().regex(/^\d+(\.\d+)?$/)]).transform(Number)
  .refine((v) => Number.isFinite(v) && v >= 0 && v < 1e9, 'Indique una cantidad no negativa');
// Minimum and maximum stock for one product in one warehouse
export const stockLevelSchema = z.object({
  warehouseId: idField, productId: idField, stockMinimo: level, stockMaximo: level.optional(),
}).refine((v) => v.stockMaximo === undefined || v.stockMaximo >= v.stockMinimo, 'El máximo no puede ser menor que el mínimo');
