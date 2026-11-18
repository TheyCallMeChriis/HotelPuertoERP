// Concurrency helpers built on PostgreSQL transaction-scoped advisory locks.
import { Prisma } from '@prisma/client';
import { operationError } from './operation-validation';

// Advisory lock shared by every API process and released when the transaction ends.
// Resource checks must be done after acquiring it.
export async function lockOperation(tx: Prisma.TransactionClient, resource: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${resource}, 0))::text`;
}

// Locks the cash register of a shift and verifies that the shift is still open.
export async function lockShift(tx: Prisma.TransactionClient, id: string) {
  const shift = await tx.cashShift.findUnique({ where: { id } });
  if (!shift) throw operationError('Turno de caja no encontrado', 404);
  await lockOperation(tx, `caja:${shift.cajaId}`);
  const current = await tx.cashShift.findUniqueOrThrow({ where: { id } });
  if (current.estado !== 'ABIERTA') throw operationError('El turno de caja está cerrado', 409);
  return current;
}

// Document prefix → table that stores its sequence numbers
const documentTables = { VTA: 'ventas', OC: 'ordenes_compra', REC: 'recepciones_compra', TRF: 'traslados_bodega', AJU: 'ajustes_inventario', TF: 'tomas_fisicas', ABO: 'abonos_clientes', SC: 'solicitudes_compra', NC: 'notas_credito' } as const;
// Returns the next gap-free sequence number for a document type, e.g. "VTA-000042".
export async function nextConsecutive(tx: Prisma.TransactionClient, prefix: keyof typeof documentTables) {
  await lockOperation(tx, `consecutivo:${prefix}`);
  // Only identifiers from this fixed list are interpolated; the pattern is a bound parameter.
  const rows = await tx.$queryRaw<{ siguiente: string }[]>(Prisma.sql`
    SELECT (COALESCE(MAX(substring(consecutivo from '[0-9]+$')::numeric), 0) + 1)::text AS siguiente
    FROM ${Prisma.raw(documentTables[prefix])} WHERE consecutivo ~ ${`^${prefix}-[0-9]+$`}
  `);
  return `${prefix}-${rows[0].siguiente.padStart(6, '0')}`;
}
