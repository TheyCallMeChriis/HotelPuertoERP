import { Response } from 'express';
import { prisma } from '../../utils/prisma';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { registrarAuditoria } from '../../utils/audit';
import { sendSimulatedCharge, retrySimulatedCharge } from './pms-operations';
import { Prisma } from '@prisma/client';

// 1. LISTAR HABITACIONES Y HUÉSPEDES PARA RECEPCIÓN DE CARGOS (PMS-002, PMS-003)
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

// 2. SIMULADOR DE ENVO DE CARGO A PMS CON IDEMPOTENCIA (PMS-004, PMS-005, PMS-006)
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

// 3. REINTENTAR CARGO FALLIDO SIN DUPLICAR DATOS (PMS-007)
export const reintentarCargoPMS = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);

  const cargo = await retrySimulatedCharge(prisma, id);
  await registrarAuditoria({
    userId: req.user?.id, accion: 'REINTENTO_CARGO_PMS', entidad: 'RoomCharge', entidadId: id,
    detalle: { transaccionUuid: cargo.transaccionUuid, reintentos: cargo.reintentos, nuevoEstado: cargo.estadoPMS }, ip: req.ip,
  });
  res.json({ success: true, message: 'Cargo confirmado en el simulador local sin duplicar la transacción', data: cargo });
};

// 4. REPORTE DE CONCILIACIÓN ENTRE VENTAS E INTEGRACIÓN PMS (PMS-008)
export const getConciliacionPMS = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  const cargos = await prisma.roomCharge.findMany({
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

  const resumen = {
    totalCargos: cargos.length,
    confirmados: cargos.filter((c) => c.estadoPMS === 'CONFIRMADO').length,
    fallidos: cargos.filter((c) => c.estadoPMS === 'ERROR').length,
    anulados: cargos.filter((c) => c.estadoPMS === 'ANULADO').length,
    pendientes: cargos.filter((c) => c.estadoPMS === 'PENDIENTE').length,
    montoTotalConfirmado: cargos
      .filter((c) => c.estadoPMS === 'CONFIRMADO')
      .reduce((sum, c) => sum.plus(c.monto), new Prisma.Decimal(0)).toNumber(),
  };

  res.json({
    success: true,
    data: {
      resumen,
      cargos,
    },
  });
};
