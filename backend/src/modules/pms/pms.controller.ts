// PMS endpoints (/api/pms): occupied rooms, charges, retries and reconciliation.

import { Response } from 'express';
import { prisma } from '../../utils/prisma';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { dateRange } from '../reportes/report-filters';
import { getPmsAdapter } from '../../integrations/pms';
import { registrarAuditoria } from '../../utils/audit';
import { sendSimulatedCharge, retrySimulatedCharge } from './pms-operations';
import { Prisma } from '@prisma/client';

// 1. LIST ROOMS AND GUESTS THAT CAN RECEIVE CHARGES (PMS-002, PMS-003)
export const getHabitacionesOcupadas = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  const habitaciones = await prisma.room.findMany({
    where: {
      activo: true,
      estado: 'OCUPADA',
    },
    include: {
      guests: {
        where: { estado: 'HOSPEDADO', checkOut: null },
        orderBy: { checkIn: 'desc' },
        take: 1,
      },
    },
    orderBy: { numero: 'asc' },
  });

  const formateadas = habitaciones.map((h) => ({
    id: h.id,
    numero: h.numero,
    tipo: h.tipo,
    estado: h.estado,
    huesped: h.guests[0] || null,
  }));

  res.json({ success: true, data: formateadas });
};

// 2. SEND A CHARGE TO THE PMS WITH IDEMPOTENCY (PMS-004, PMS-005, PMS-006)
export const enviarCargoPMS = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { charge, duplicate } = await sendSimulatedCharge(prisma, req.body);
  if (!duplicate) await registrarAuditoria({
    userId: req.user?.id, accion: 'CARGO_PMS_ENVIADO', entidad: 'RoomCharge', entidadId: charge.id,
    detalle: { transaccionUuid: charge.transaccionUuid, monto: charge.monto, estadoPMS: charge.estadoPMS }, ip: req.ip,
  });
  const failed = charge.estadoPMS === 'ERROR';
  res.status(failed ? 502 : duplicate ? 200 : 201).json({
    success: !failed, message: failed ? 'Fallo simulado de comunicación con el PMS' : duplicate ? 'Cargo previamente registrado' : 'Cargo confirmado en el simulador local',
    data: charge, esDuplicadoEvitado: duplicate,
  });
};

// 3. RETRY A FAILED CHARGE WITHOUT DUPLICATING DATA (PMS-007)
export const reintentarCargoPMS = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);

  const { charge: cargo, ok, message } = await retrySimulatedCharge(prisma, id);
  await registrarAuditoria({
    userId: req.user?.id, accion: 'REINTENTO_CARGO_PMS', entidad: 'RoomCharge', entidadId: id,
    detalle: { transaccionUuid: cargo.transaccionUuid, reintentos: cargo.reintentos, nuevoEstado: cargo.estadoPMS, confirmado: ok }, ip: req.ip,
  });
  res.status(ok ? 200 : 502).json({
    success: ok,
    message: ok ? 'Cargo confirmado en el PMS sin duplicar la transacción' : `El PMS no confirmó el cargo: ${message}`,
    data: cargo,
  });
};

// 4. RECONCILIATION REPORT BETWEEN SALES AND THE PMS INTEGRATION (PMS-008)
// Matches sales charged to a room against the charges sent to the PMS and lists
// differences (sale without charge, different amounts, cancellation not reflected) and pending items.
export const getConciliacionPMS = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const rango = dateRange(req.query);
  const cargos = await prisma.roomCharge.findMany({
    where: rango ? { createdAt: rango } : {},
    include: {
      sale: {
        include: {
          usuario: { select: { nombre: true, username: true } },
          pointOfSale: true,
        },
      },
      room: true,
      guest: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  // Sales paid with "room charge" in the period
  const ventasHab = await prisma.sale.findMany({
    where: { ...(rango ? { createdAt: rango } : {}), payments: { some: { paymentMethod: { codigo: 'CARGO_HABITACION' } } } },
    include: { payments: { include: { paymentMethod: true } }, cargoHabitacion: true, pointOfSale: { select: { nombre: true } } },
  });

  const diferencias: Array<{ tipo: string; detalle: string; venta: string | null; transaccionUuid: string | null; montoVenta: number | null; montoCargo: number | null }> = [];
  for (const v of ventasHab) {
    const montoVenta = v.payments.filter((p) => p.paymentMethod.codigo === 'CARGO_HABITACION').reduce((acc, p) => acc.plus(p.monto), new Prisma.Decimal(0));
    const c = v.cargoHabitacion;
    if (v.estado === 'COMPLETADA' && !c) {
      diferencias.push({ tipo: 'VENTA_SIN_CARGO', detalle: 'Venta cobrada a habitación sin cargo registrado en el PMS', venta: v.consecutivo, transaccionUuid: null, montoVenta: montoVenta.toNumber(), montoCargo: null });
    } else if (c && !new Prisma.Decimal(c.monto).eq(montoVenta)) {
      diferencias.push({ tipo: 'MONTO_DIFERENTE', detalle: 'El monto del cargo no coincide con el pago a habitación', venta: v.consecutivo, transaccionUuid: c.transaccionUuid, montoVenta: montoVenta.toNumber(), montoCargo: Number(c.monto) });
    } else if (c && v.estado === 'ANULADA' && c.estadoPMS !== 'ANULADO') {
      diferencias.push({ tipo: 'ANULACION_NO_REFLEJADA', detalle: 'La venta fue anulada pero el cargo sigue activo en el PMS', venta: v.consecutivo, transaccionUuid: c.transaccionUuid, montoVenta: montoVenta.toNumber(), montoCargo: Number(c.monto) });
    }
  }
  const pendientes = cargos
    .filter((c) => c.estadoPMS === 'ERROR' || c.estadoPMS === 'PENDIENTE')
    .map((c) => ({ id: c.id, transaccionUuid: c.transaccionUuid, estado: c.estadoPMS, habitacion: c.room.numero, huesped: c.guest.nombreCompleto, monto: Number(c.monto), venta: c.sale?.consecutivo ?? null, fecha: c.createdAt }));

  const resumen = {
    totalCargos: cargos.length,
    confirmados: cargos.filter((c) => c.estadoPMS === 'CONFIRMADO').length,
    fallidos: cargos.filter((c) => c.estadoPMS === 'ERROR').length,
    anulados: cargos.filter((c) => c.estadoPMS === 'ANULADO').length,
    pendientes: cargos.filter((c) => c.estadoPMS === 'PENDIENTE').length,
    montoTotalConfirmado: cargos
      .filter((c) => c.estadoPMS === 'CONFIRMADO')
      .reduce((sum, c) => sum.plus(c.monto), new Prisma.Decimal(0)).toNumber(),
    ventasCobradasAHabitacion: ventasHab.filter((v) => v.estado === 'COMPLETADA').length,
    diferencias: diferencias.length,
    operacionesPendientes: pendientes.length,
    adaptador: getPmsAdapter().nombre,
  };

  res.json({
    success: true,
    data: {
      resumen,
      diferencias,
      pendientes,
      cargos,
    },
  });
};
