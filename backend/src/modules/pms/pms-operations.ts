// PMS charge operations used by the PMS screen: send a charge with idempotency and retry failed ones.

import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { idField, operationError, parseOperation, paymentField } from '../../utils/operation-validation';
import { lockOperation } from '../../utils/transaction-lock';
import { registrarCargo, reenviarCargo } from '../../integrations/pms/pms-service';

// Body of POST /api/pms/cargo
const chargeSchema = z.object({
  saleId: idField.nullish(), roomId: idField, guestId: idField, monto: paymentField,
  transaccionUuid: idField.optional(), simularError: z.boolean().optional().default(false),
});
// Sends a room charge. Repeating the same idempotency key (or sale) returns the existing charge
// instead of creating a duplicate (PMS-005); a mismatching repeat is rejected.
export async function sendSimulatedCharge(prisma: PrismaClient, body: unknown) {
  const input = parseOperation(chargeSchema, body);
  const uuid = input.transaccionUuid ?? `TX-PMS-${randomUUID()}`;
  return prisma.$transaction(async tx => {
    if (input.saleId) {
      const initial = await tx.sale.findUnique({ where: { id: input.saleId } });
      if (!initial) throw operationError('Venta no encontrada', 404);
      const shift = await tx.cashShift.findUniqueOrThrow({ where: { id: initial.cashShiftId } });
      await lockOperation(tx, `caja:${shift.cajaId}`);
      const sale = await tx.sale.findUniqueOrThrow({ where: { id: initial.id }, include: { payments: { include: { paymentMethod: true } } } });
      if (sale.estado !== 'COMPLETADA') throw operationError('La venta no admite cargos a habitación', 409);
      const amount = sale.payments.filter(p => p.paymentMethod.codigo === 'CARGO_HABITACION').reduce((sum, p) => sum.plus(p.monto), new Prisma.Decimal(0));
      if (!amount.eq(input.monto)) throw operationError('El cargo debe coincidir con el pago a habitación de la venta');
    }
    await lockOperation(tx, `pms-uuid:${uuid}`);
    const byUuid = await tx.roomCharge.findUnique({ where: { transaccionUuid: uuid }, include: { room: true, guest: true } });
    const bySale = input.saleId ? await tx.roomCharge.findUnique({ where: { saleId: input.saleId }, include: { room: true, guest: true } }) : null;
    for (const existing of [byUuid, bySale]) {
      if (existing && (existing.saleId !== (input.saleId ?? null) || existing.roomId !== input.roomId
        || existing.guestId !== input.guestId || !existing.monto.eq(input.monto))) {
        throw operationError('La clave o venta ya está asociada a un cargo diferente', 409);
      }
    }
    const existing = byUuid ?? bySale;
    if (existing) return { charge: existing, duplicate: true };
    // PMS-001: communication is delegated to the configured adapter (PMS_ADAPTER)
    const charge = await registrarCargo(tx, {
      saleId: input.saleId, roomId: input.roomId, guestId: input.guestId, monto: input.monto,
      transaccionUuid: uuid, simularError: input.simularError,
    });
    return { charge, duplicate: false };
  });
}

// Retries an ERROR/PENDIENTE charge with its original key (PMS-007). Cancelled sales cannot be retried.
export async function retrySimulatedCharge(prisma: PrismaClient, id: string) {
  return prisma.$transaction(async tx => {
    const initial = await tx.roomCharge.findUnique({ where: { id }, include: { sale: { include: { cashShift: true } } } });
    if (!initial) throw operationError('Cargo a habitación no encontrado', 404);
    if (initial.sale) await lockOperation(tx, `caja:${initial.sale.cashShift.cajaId}`);
    await lockOperation(tx, `pms-cargo:${id}`);
    const charge = await tx.roomCharge.findUniqueOrThrow({ where: { id }, include: { sale: true, room: true, guest: true } });
    if (charge.estadoPMS === 'ANULADO' || (charge.sale && charge.sale.estado !== 'COMPLETADA')) {
      throw operationError('No se puede reintentar un cargo de una venta anulada', 409);
    }
    if (charge.estadoPMS === 'CONFIRMADO') {
      // Repairs legacy queue entries left as failed after the charge was confirmed.
      // It is not a new submission and does not increase the retry count.
      await tx.pMSIntegrationQueue.updateMany({ where: { roomChargeId: id, estado: { in: ['PENDIENTE', 'FALLIDO'] } },
        data: { estado: 'PROCESADO', ultimoError: null } });
      return { charge, ok: true, message: 'El cargo ya estaba confirmado' };
    }
    if (!['ERROR', 'PENDIENTE'].includes(charge.estadoPMS)) throw operationError('El estado del cargo no permite reintentos', 409);
    return reenviarCargo(tx, charge);
  });
}
