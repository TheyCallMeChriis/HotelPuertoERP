import { Response } from 'express';
import { prisma } from '../../utils/prisma';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { registrarAuditoria } from '../../utils/audit';
import crypto from 'crypto';

// 1. LISTAR HABITACIONES Y HUÉSPEDES PARA RECEPCIÓN DE CARGOS (PMS-002, PMS-003)
export const getHabitacionesOcupadas = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  const habitaciones = await prisma.room.findMany({
    where: {
      activo: true,
      estado: 'OCUPADA',
    },
    include: {
      guests: {
        where: { estado: 'HOSPEDADO' },
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
  const { saleId, roomId, guestId, monto, transaccionUuid, simularError } = req.body;

  if (!saleId || !roomId || !guestId || !monto) {
    res.status(400).json({ success: false, message: 'Venta, habitación, huésped y monto son obligatorios' });
    return;
  }

  // Idempotencia: Si ya existe un cargo con este UUID, se devuelve el registro existente sin duplicar (PMS-005)
  const uuid = transaccionUuid || `TX-PMS-${crypto.randomUUID()}`;
  const cargoExistente = await prisma.roomCharge.findUnique({
    where: { transaccionUuid: uuid },
    include: { room: true, guest: true },
  });

  if (cargoExistente) {
    res.json({
      success: true,
      message: 'Operación idempotente: Cargo previamente registrado',
      data: cargoExistente,
      esDuplicadoEvitado: true,
    });
    return;
  }

  // Simulación de respuesta del PMS (éxito o error controlado para pruebas)
  const estadoPMS = simularError ? 'ERROR' : 'CONFIRMADO';
  const respuesta = simularError
    ? { code: 'PMS_CONN_TIMEOUT', message: 'Tiempo de espera agotado al comunicar con el PMS del hotel' }
    : { code: 'PMS_SUCCESS', message: 'Cargo imputado correctamente a la cuenta del huésped', folioId: `FOL-${Date.now()}` };

  const nuevoCargo = await prisma.roomCharge.create({
    data: {
      saleId,
      roomId,
      guestId,
      monto,
      transaccionUuid: uuid,
      estadoPMS,
      reintentos: 0,
      respuestaPMS: JSON.stringify(respuesta),
    },
    include: { room: true, guest: true },
  });

  // Si falló, registrar en cola para reintento (PMS-006, PMS-007)
  if (simularError) {
    await prisma.pMSIntegrationQueue.create({
      data: {
        roomChargeId: nuevoCargo.id,
        endpoint: '/api/v1/pms/folio/charge',
        payload: JSON.stringify({ saleId, roomId, guestId, monto, transaccionUuid: uuid }),
        intentos: 1,
        estado: 'FALLIDO',
        ultimoError: respuesta.message,
      },
    });
  }

  await registrarAuditoria({
    userId: req.user?.id,
    accion: 'CARGO_PMS_ENVIADO',
    entidad: 'RoomCharge',
    entidadId: nuevoCargo.id,
    detalle: { transaccionUuid: uuid, monto, estadoPMS },
    ip: req.ip,
  });

  res.status(simularError ? 502 : 201).json({
    success: !simularError,
    message: simularError ? 'Fallo en la comunicación con el PMS' : 'Cargo a habitación enviado exitosamente',
    data: nuevoCargo,
  });
};

// 3. REINTENTAR CARGO FALLIDO SIN DUPLICAR DATOS (PMS-007)
export const reintentarCargoPMS = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);

  const cargo = await prisma.roomCharge.findUnique({
    where: { id },
    include: { room: true, guest: true },
  });

  if (!cargo) {
    res.status(404).json({ success: false, message: 'Cargo a habitación no encontrado' });
    return;
  }

  // Al reintentar, se actualiza el mismo registro manteniendo su transaccionUuid
  const reintentosActuales = cargo.reintentos + 1;
  const respuestaSimulada = {
    code: 'PMS_SUCCESS',
    message: 'Reintento exitoso: Cargo aplicado al folio del huésped tras reintento',
    folioId: `FOL-REINTENTO-${Date.now()}`,
  };

  const cargoActualizado = await prisma.roomCharge.update({
    where: { id },
    data: {
      estadoPMS: 'CONFIRMADO',
      reintentos: reintentosActuales,
      respuestaPMS: JSON.stringify(respuestaSimulada),
    },
    include: { room: true, guest: true },
  });

  await registrarAuditoria({
    userId: req.user?.id,
    accion: 'REINTENTO_CARGO_PMS',
    entidad: 'RoomCharge',
    entidadId: id,
    detalle: { transaccionUuid: cargo.transaccionUuid, reintentos: reintentosActuales, nuevoEstado: 'CONFIRMADO' },
    ip: req.ip,
  });

  res.json({
    success: true,
    message: 'Reintento de cargo ejecutado exitosamente sin duplicar la transacción',
    data: cargoActualizado,
  });
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
    pendientes: cargos.filter((c) => c.estadoPMS === 'PENDIENTE').length,
    montoTotalConfirmado: cargos
      .filter((c) => c.estadoPMS === 'CONFIRMADO')
      .reduce((sum, c) => sum + Number(c.monto), 0),
  };

  res.json({
    success: true,
    data: {
      resumen,
      cargos,
    },
  });
};
