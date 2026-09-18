import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { idField, operationError, parseOperation, paymentField } from '../../utils/operation-validation';
import { lockOperation } from '../../utils/transaction-lock';

const chargeSchema = z.object({
  saleId: idField.nullish(), roomId: idField, guestId: idField, monto: paymentField,
  transaccionUuid: idField.optional(), simularError: z.boolean().optional().default(false),
});
async function validateGuest(tx: Prisma.TransactionClient, roomId: string, guestId: string) {
  const room = await tx.room.findUnique({ where: { id: roomId } });
  const guest = await tx.guest.findUnique({ where: { id: guestId } });
  if (!room?.activo || room.estado !== 'OCUPADA' || !guest || guest.habitacionId !== roomId
    || guest.estado !== 'HOSPEDADO' || guest.checkOut !== null) {
    throw operationError('La habitación y el huésped no están habilitados para recibir el cargo');
  }
}

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
    await validateGuest(tx, input.roomId, input.guestId);
    const response = input.simularError
      ? { code: 'PMS_CONN_TIMEOUT', message: 'Tiempo de espera simulado agotado' }
      : { code: 'PMS_SUCCESS', message: 'Cargo confirmado en el simulador local' };
    const charge = await tx.roomCharge.create({ data: {
      saleId: input.saleId, roomId: input.roomId, guestId: input.guestId, monto: input.monto,
      transaccionUuid: uuid, estadoPMS: input.simularError ? 'ERROR' : 'CONFIRMADO', respuestaPMS: JSON.stringify(response),
    }, include: { room: true, guest: true } });
    if (input.simularError) await tx.pMSIntegrationQueue.create({ data: {
      roomChargeId: charge.id, endpoint: '/api/v1/pms/folio/charge',
      payload: JSON.stringify({ saleId: input.saleId, roomId: input.roomId, guestId: input.guestId, monto: input.monto, transaccionUuid: uuid }),
      intentos: 1, estado: 'FALLIDO', ultimoError: response.message,
    } });
    return { charge, duplicate: false };
  });
}

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
      // Repara colas antiguas que quedaron fallidas después de confirmar el
      // cargo. No representa otro envío ni aumenta el número de reintentos.
      await tx.pMSIntegrationQueue.updateMany({ where: { roomChargeId: id, estado: { in: ['PENDIENTE', 'FALLIDO'] } },
        data: { estado: 'PROCESADO', ultimoError: null } });
      return charge;
    }
    if (!['ERROR', 'PENDIENTE'].includes(charge.estadoPMS)) throw operationError('El estado del cargo no permite reintentos', 409);
    await validateGuest(tx, charge.roomId, charge.guestId);
    const updated = await tx.roomCharge.update({ where: { id }, data: {
      estadoPMS: 'CONFIRMADO', reintentos: { increment: 1 },
      respuestaPMS: JSON.stringify({ code: 'PMS_SUCCESS', message: 'Reintento confirmado en el simulador local' }),
    }, include: { room: true, guest: true } });
    await tx.pMSIntegrationQueue.updateMany({ where: { roomChargeId: id, estado: { in: ['PENDIENTE', 'FALLIDO'] } },
      data: { estado: 'PROCESADO', intentos: { increment: 1 }, ultimoError: null } });
    return updated;
  });
}
