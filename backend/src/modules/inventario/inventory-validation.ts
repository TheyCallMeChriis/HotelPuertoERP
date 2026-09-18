import { z } from 'zod';
import { idField, moneyField, optionalText, quantityField } from '../../utils/operation-validation';

const item = z.object({ productId: idField, cantidad: quantityField });
export const movementSchema = z.object({
  warehouseId: idField, productId: idField,
  tipo: z.enum(['ENTRADA_COMPRA', 'AJUSTE_POSITIVO', 'SALIDA_VENTA', 'AJUSTE_NEGATIVO', 'MERMA']),
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
