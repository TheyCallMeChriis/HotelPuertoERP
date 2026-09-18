import { Response } from 'express';
import { prisma } from '../../utils/prisma';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { registrarAuditoria } from '../../utils/audit';
import { openCash, recordCashMovement, closeCash } from './cash-operations';

// 1. OBTENER TURNO DE CAJA ABIERTO ACTUAL (CAJ-002)
export const getTurnoActivo = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { cajaId } = req.query;

  const whereClause: any = {
    estado: 'ABIERTA',
  };

  if (cajaId) {
    whereClause.cajaId = String(cajaId);
  } else {
    // Si no se especifica caja, busca la caja abierta por este usuario
    whereClause.usuarioId = req.user?.id;
  }

  const turno = await prisma.cashShift.findFirst({
    where: whereClause,
    include: {
      caja: true,
      usuario: { select: { id: true, nombre: true, username: true } },
      movements: true,
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

// 2. APERTURA DE CAJA (CAJ-001)
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

// 3. REGISTRAR MOVIMIENTO EXTRAORDINARIO (CAJ-003)
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

// 4. CIERRE DE CAJA Y ARQUEO (CAJ-004, CAJ-005, CAJ-006, CAJ-007)
export const cerrarCaja = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const result = await closeCash(prisma, req.body);
  await registrarAuditoria({
    userId: req.user?.id, accion: 'CIERRE_CAJA', entidad: 'CashShift', entidadId: result.cierre.id,
    detalle: result.resumen, ip: req.ip,
  });
  res.json({ success: true, message: 'Caja cerrada exitosamente', data: result });
};

// 5. HISTORICO DE APERTURAS Y CIERRES (CAJ-008)
export const getHistoricoCierres = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { cajaId } = req.query;
  const whereClause: any = {};
  if (cajaId) whereClause.cajaId = String(cajaId);

  const turnos = await prisma.cashShift.findMany({
    where: whereClause,
    include: {
      caja: true,
      usuario: { select: { nombre: true, username: true } },
    },
    orderBy: { fechaApertura: 'desc' },
    take: 50,
  });

  res.json({ success: true, data: turnos });
};
