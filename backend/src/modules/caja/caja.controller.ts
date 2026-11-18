// Cash register endpoints (/api/caja). Business rules live in cash-operations.ts.

import { Response } from 'express';
import { prisma } from '../../utils/prisma';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { registrarAuditoria } from '../../utils/audit';
import { openCash, recordCashMovement, closeCash } from './cash-operations';
import { dateRange } from '../reportes/report-filters';

// 1. GET THE CURRENT OPEN CASH SHIFT (CAJ-002)
export const getTurnoActivo = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { cajaId } = req.query;

  const whereClause: any = {
    estado: 'ABIERTA',
  };

  if (cajaId) {
    whereClause.cajaId = String(cajaId);
  } else {
    // When no register is given, look for the register opened by this user
    whereClause.usuarioId = req.user?.id;
  }

  const turno = await prisma.cashShift.findFirst({
    where: whereClause,
    include: {
      caja: true,
      usuario: { select: { id: true, nombre: true, username: true } },
      movements: true,
      abonos: { where: { estado: 'APLICADO' }, include: { paymentMethod: true } },
      ventas: {
        where: { estado: 'COMPLETADA' },
        include: {
          payments: {
            include: { paymentMethod: true },
          },
        },
      },
    },
    orderBy: { fechaApertura: 'desc' },
  });

  res.json({
    success: true,
    data: turno || null,
  });
};

// 2. OPEN A CASH REGISTER (CAJ-001)
export const abrirCaja = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const turno = await openCash(prisma, req.body, req.user!.id);
  const { cajaId, montoInicial } = turno;

  await registrarAuditoria({
    userId: req.user?.id,
    accion: 'APERTURA_CAJA',
    entidad: 'CashShift',
    entidadId: turno.id,
    detalle: { cajaId, montoInicial, cajaNombre: turno.caja.nombre },
    ip: req.ip,
  });

  res.status(201).json({
    success: true,
    message: 'Caja abierta exitosamente',
    data: turno,
  });
};

// 3. RECORD AN EXTRAORDINARY CASH MOVEMENT (CAJ-003)
export const registrarMovimiento = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const movimiento = await recordCashMovement(prisma, req.body, req.user!.id);
  const { cashShiftId, tipo, monto, motivo } = movimiento;

  await registrarAuditoria({
    userId: req.user?.id,
    accion: tipo === 'ENTRADA_EXTRAORDINARIA' ? 'ENTRADA_CAJA' : 'SALIDA_CAJA',
    entidad: 'CashMovement',
    entidadId: movimiento.id,
    detalle: { cashShiftId, tipo, monto, motivo },
    ip: req.ip,
  });

  res.status(201).json({
    success: true,
    message: 'Movimiento de caja registrado exitosamente',
    data: movimiento,
  });
};

// 4. CLOSE THE REGISTER AND RECONCILE CASH (CAJ-004, CAJ-005, CAJ-006, CAJ-007)
export const cerrarCaja = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const result = await closeCash(prisma, req.body);
  await registrarAuditoria({
    userId: req.user?.id, accion: 'CIERRE_CAJA', entidad: 'CashShift', entidadId: result.cierre.id,
    detalle: result.resumen, ip: req.ip,
  });
  res.json({ success: true, message: 'Caja cerrada exitosamente', data: result });
};

// 5. HISTORY OF OPENINGS AND CLOSINGS (CAJ-008)
export const getHistoricoCierres = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { cajaId, estado } = req.query;
  const whereClause: any = {};
  if (cajaId) whereClause.cajaId = String(cajaId);
  if (estado === 'ABIERTA' || estado === 'CERRADA') whereClause.estado = estado;
  const rango = dateRange(req.query); // CAJ-008: filter by opening date
  if (rango) whereClause.fechaApertura = rango;

  const turnos = await prisma.cashShift.findMany({
    where: whereClause,
    include: {
      caja: true,
      usuario: { select: { nombre: true, username: true } },
    },
    orderBy: { fechaApertura: 'desc' },
    take: rango ? 500 : 50,
  });

  res.json({ success: true, data: turnos });
};
