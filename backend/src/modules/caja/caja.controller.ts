import { Response } from 'express';
import { prisma } from '../../utils/prisma';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { registrarAuditoria } from '../../utils/audit';

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
  const { cajaId, montoInicial, notas } = req.body;

  if (!cajaId || montoInicial === undefined) {
    res.status(400).json({ success: false, message: 'Caja y monto inicial son obligatorios' });
    return;
  }

  // Verificar si la caja ya está abierta
  const abierta = await prisma.cashShift.findFirst({
    where: {
      cajaId,
      estado: 'ABIERTA',
    },
  });

  if (abierta) {
    res.status(400).json({
      success: false,
      message: 'Esta caja ya se encuentra abierta en un turno activo',
      data: abierta,
    });
    return;
  }

  const turno = await prisma.cashShift.create({
    data: {
      cajaId,
      usuarioId: req.user!.id,
      montoInicial,
      estado: 'ABIERTA',
      notas,
    },
    include: { caja: true },
  });

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
  const { cashShiftId, tipo, monto, motivo } = req.body;

  if (!cashShiftId || !tipo || monto === undefined || !motivo) {
    res.status(400).json({ success: false, message: 'Turno, tipo (ENTRADA/SALIDA), monto y motivo son obligatorios' });
    return;
  }

  const turno = await prisma.cashShift.findUnique({ where: { id: cashShiftId } });
  if (!turno || turno.estado !== 'ABIERTA') {
    res.status(400).json({ success: false, message: 'El turno de caja no está abierto o no existe' });
    return;
  }

  const movimiento = await prisma.cashMovement.create({
    data: {
      cashShiftId,
      usuarioId: req.user!.id,
      tipo, // 'ENTRADA_EXTRAORDINARIA' o 'SALIDA_EXTRAORDINARIA'
      monto,
      motivo,
    },
  });

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
  const { cashShiftId, montoContado, notas } = req.body;

  if (!cashShiftId || montoContado === undefined) {
    res.status(400).json({ success: false, message: 'Turno de caja y monto contado son obligatorios' });
    return;
  }

  const turno = await prisma.cashShift.findUnique({
    where: { id: cashShiftId },
    include: {
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
  });

  if (!turno) {
    res.status(404).json({ success: false, message: 'Turno de caja no encontrado' });
    return;
  }

  if (turno.estado === 'CERRADA') {
    res.status(400).json({ success: false, message: 'Este turno de caja ya ha sido cerrado previamente' });
    return;
  }

  // Calcular ventas en efectivo
  let totalEfectivoVentas = 0;
  let totalTarjeta = 0;
  let totalSinpe = 0;
  let totalCredito = 0;
  let totalCargoHabitacion = 0;

  for (const v of turno.ventas) {
    for (const p of v.payments) {
      const m = Number(p.monto);
      if (p.paymentMethod.codigo === 'EFECTIVO') totalEfectivoVentas += m;
      else if (p.paymentMethod.codigo === 'TARJETA') totalTarjeta += m;
      else if (p.paymentMethod.codigo === 'SINPE_MOVIL') totalSinpe += m;
      else if (p.paymentMethod.codigo === 'CREDITO') totalCredito += m;
      else if (p.paymentMethod.codigo === 'CARGO_HABITACION') totalCargoHabitacion += m;
    }
  }

  // Calcular movimientos extraordinarios de efectivo
  let entradasExtra = 0;
  let salidasExtra = 0;
  for (const m of turno.movements) {
    if (m.tipo === 'ENTRADA_EXTRAORDINARIA') entradasExtra += Number(m.monto);
    if (m.tipo === 'SALIDA_EXTRAORDINARIA') salidasExtra += Number(m.monto);
  }

  // Saldo esperado en efectivo en caja:
  // Fondo inicial + Ventas en efectivo + Entradas extraordinarias - Salidas extraordinarias
  const fondoInicial = Number(turno.montoInicial);
  const montoEsperadoEfectivo = fondoInicial + totalEfectivoVentas + entradasExtra - salidasExtra;
  const contado = Number(montoContado);
  const diferencia = contado - montoEsperadoEfectivo; // Positivo: Sobrante, Negativo: Faltante

  const turnoCerrado = await prisma.cashShift.update({
    where: { id: cashShiftId },
    data: {
      fechaCierre: new Date(),
      montoContado: contado,
      montoEsperado: montoEsperadoEfectivo,
      diferencia: diferencia,
      estado: 'CERRADA',
      notas: notas || null,
    },
    include: { caja: true, usuario: { select: { nombre: true, username: true } } },
  });

  await registrarAuditoria({
    userId: req.user?.id,
    accion: 'CIERRE_CAJA',
    entidad: 'CashShift',
    entidadId: cashShiftId,
    detalle: {
      fondoInicial,
      totalEfectivoVentas,
      entradasExtra,
      salidasExtra,
      montoEsperado: montoEsperadoEfectivo,
      montoContado: contado,
      diferencia,
      desgloseOtrosMedios: {
        tarjeta: totalTarjeta,
        sinpe: totalSinpe,
        credito: totalCredito,
        cargoHabitacion: totalCargoHabitacion,
      },
    },
    ip: req.ip,
  });

  res.json({
    success: true,
    message: 'Caja cerrada exitosamente',
    data: {
      cierre: turnoCerrado,
      resumen: {
        fondoInicial,
        totalEfectivoVentas,
        entradasExtra,
        salidasExtra,
        montoEsperado: montoEsperadoEfectivo,
        montoContado: contado,
        diferencia,
        tipoDiferencia: diferencia === 0 ? 'CUADRADA' : diferencia > 0 ? 'SOBRANTE' : 'FALTANTE',
        totalesPorMedioPago: {
          efectivo: totalEfectivoVentas,
          tarjeta: totalTarjeta,
          sinpe: totalSinpe,
          credito: totalCredito,
          cargoHabitacion: totalCargoHabitacion,
        },
      },
    },
  });
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
