import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { operationError } from '../../utils/operation-validation';
import { getPmsAdapter, RespuestaPMS } from './index';

// PMS integration service (PMS-001). Holds the shared rules (guest eligibility,
// charge registration, retry queue, reversal) and delegates communication to the adapter.

type Tx = Prisma.TransactionClient;

// Ensures the room is occupied and the guest is checked in to it (PMS-003).
export async function validarHuespedHabilitado(tx: Tx, roomId: string, guestId: string) {
  const room = await tx.room.findUnique({ where: { id: roomId } });
  const guest = await tx.guest.findUnique({ where: { id: guestId } });
  if (!room?.activo || room.estado !== 'OCUPADA' || !guest || guest.habitacionId !== roomId
    || guest.estado !== 'HOSPEDADO' || guest.checkOut !== null) {
    throw operationError('La habitación y el huésped no están habilitados para recibir el cargo');
  }
  return { room, guest };
}

// Serializes the PMS answer stored on the charge for later reconciliation.
function respuestaJSON(r: RespuestaPMS, adaptador: string) {
  return JSON.stringify({ code: r.code, message: r.message, referenciaExterna: r.referenciaExterna ?? null, adaptador });
}

// Sends a new charge and records it; if the PMS does not answer, it stays in ERROR with a FALLIDO queue entry.
export async function registrarCargo(tx: Tx, datos: {
  saleId?: string | null; roomId: string; guestId: string; monto: Prisma.Decimal; transaccionUuid?: string; simularError?: boolean;
}) {
  const { room } = await validarHuespedHabilitado(tx, datos.roomId, datos.guestId);
  const adapter = getPmsAdapter();
  const transaccionUuid = datos.transaccionUuid ?? `TX-PMS-${randomUUID()}`;
  const respuesta = await adapter.enviarCargo({
    transaccionUuid, habitacion: room.numero, huespedId: datos.guestId, monto: datos.monto.toFixed(2),
    saleId: datos.saleId ?? null, simularError: datos.simularError,
  });
  const charge = await tx.roomCharge.create({
    data: {
      saleId: datos.saleId ?? null, roomId: datos.roomId, guestId: datos.guestId, monto: datos.monto, transaccionUuid,
      estadoPMS: respuesta.ok ? 'CONFIRMADO' : 'ERROR', respuestaPMS: respuestaJSON(respuesta, adapter.nombre),
    },
    include: { room: true, guest: true },
  });
  if (!respuesta.ok) {
    await tx.pMSIntegrationQueue.create({
      data: {
        roomChargeId: charge.id, endpoint: adapter.endpointCargo,
        payload: JSON.stringify({ saleId: datos.saleId ?? null, roomId: datos.roomId, guestId: datos.guestId, monto: datos.monto, transaccionUuid }),
        intentos: 1, estado: 'FALLIDO', ultimoError: respuesta.message,
      },
    });
  }
  return charge;
}

// Re-sends an ERROR/PENDIENTE charge using the same idempotency key
export async function reenviarCargo(tx: Tx, charge: { id: string; roomId: string; guestId: string; monto: Prisma.Decimal; transaccionUuid: string; saleId: string | null }) {
  const { room } = await validarHuespedHabilitado(tx, charge.roomId, charge.guestId);
  const adapter = getPmsAdapter();
  const respuesta = await adapter.enviarCargo({
    transaccionUuid: charge.transaccionUuid, habitacion: room.numero, huespedId: charge.guestId, monto: charge.monto.toFixed(2), saleId: charge.saleId,
  });
  if (!respuesta.ok) {
    // The failed attempt is recorded; the charge stays in ERROR so it can be retried again
    await tx.pMSIntegrationQueue.updateMany({
      where: { roomChargeId: charge.id, estado: { in: ['PENDIENTE', 'FALLIDO'] } },
      data: { intentos: { increment: 1 }, ultimoError: respuesta.message },
    });
    const sinCambio = await tx.roomCharge.findUniqueOrThrow({ where: { id: charge.id }, include: { room: true, guest: true } });
    return { charge: sinCambio, ok: false, message: respuesta.message };
  }
  const updated = await tx.roomCharge.update({
    where: { id: charge.id },
    data: { estadoPMS: 'CONFIRMADO', reintentos: { increment: 1 }, respuestaPMS: respuestaJSON(respuesta, adapter.nombre) },
    include: { room: true, guest: true },
  });
  await tx.pMSIntegrationQueue.updateMany({
    where: { roomChargeId: charge.id, estado: { in: ['PENDIENTE', 'FALLIDO'] } },
    data: { estado: 'PROCESADO', intentos: { increment: 1 }, ultimoError: null },
  });
  return { charge: updated, ok: true, message: respuesta.message };
}

// Reverses the charge of a cancelled sale and cancels any pending retries
export async function revertirCargo(tx: Tx, charge: { id: string; transaccionUuid: string }, motivo: string) {
  const adapter = getPmsAdapter();
  const respuesta = await adapter.revertirCargo({ transaccionUuid: charge.transaccionUuid, motivo });
  await tx.roomCharge.update({
    where: { id: charge.id },
    data: { estadoPMS: 'ANULADO', respuestaPMS: JSON.stringify({ ...JSON.parse(respuestaJSON(respuesta, adapter.nombre)), motivo }) },
  });
  await tx.pMSIntegrationQueue.updateMany({
    where: { roomChargeId: charge.id, estado: { in: ['PENDIENTE', 'FALLIDO'] } },
    data: { estado: 'CANCELADO', ultimoError: 'Venta anulada; no reenviar el cargo' },
  });
}
