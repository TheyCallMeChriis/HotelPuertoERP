import { Prisma } from '@prisma/client';
import { operationError } from './operation-validation';

// Bloqueo compartido por todos los procesos de la API y liberado al terminar
// la transacción. Las comprobaciones del recurso deben hacerse después de tomarlo.
export async function lockOperation(tx: Prisma.TransactionClient, resource: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${resource}, 0))::text`;
}

export async function lockShift(tx: Prisma.TransactionClient, id: string) {
  const shift = await tx.cashShift.findUnique({ where: { id } });
  if (!shift) throw operationError('Turno de caja no encontrado', 404);
  await lockOperation(tx, `caja:${shift.cajaId}`);
  const current = await tx.cashShift.findUniqueOrThrow({ where: { id } });
  if (current.estado !== 'ABIERTA') throw operationError('El turno de caja está cerrado', 409);
  return current;
}

const documentTables = { VTA: 'ventas', OC: 'ordenes_compra', REC: 'recepciones_compra', TRF: 'traslados_bodega', AJU: 'ajustes_inventario' } as const;
export async function nextConsecutive(tx: Prisma.TransactionClient, prefix: keyof typeof documentTables) {
  await lockOperation(tx, `consecutivo:${prefix}`);
  // Solo se interpolan identificadores de esta lista fija; el patrón es un parámetro.
  const rows = await tx.$queryRaw<{ siguiente: string }[]>(Prisma.sql`
    SELECT (COALESCE(MAX(substring(consecutivo from '[0-9]+$')::numeric), 0) + 1)::text AS siguiente
    FROM ${Prisma.raw(documentTables[prefix])} WHERE consecutivo ~ ${`^${prefix}-[0-9]+$`}
  `);
  return `${prefix}-${rows[0].siguiente.padStart(6, '0')}`;
}
