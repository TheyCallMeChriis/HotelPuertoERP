import { Response } from 'express';
import { prisma } from '../../utils/prisma';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { registrarAuditoria } from '../../utils/audit';
import { createSale } from './create-sale';
import { cancelSale } from './cancel-sale';

// 1. CREAR VENTA (POS-001, POS-002, POS-004, POS-009, POS-010, CAJ-002, INV-010)
export const createVenta = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { sale: ventaFinal, consecutivo, total: totalVenta, posNombre, itemsCount } =
    await createSale(prisma, req.body, req.user!);

  // Registrar Auditoría
  await registrarAuditoria({
    userId: req.user?.id,
    accion: 'CREAR_VENTA',
    entidad: 'Sale',
    entidadId: ventaFinal.id,
    detalle: {
      consecutivo,
      total: totalVenta,
      itemsCount,
      posNombre,
    },
    ip: req.ip,
  });

  res.status(201).json({
    success: true,
    message: 'Venta completada exitosamente',
    data: ventaFinal,
  });
};

// 2. LISTAR VENTAS (con filtros por fecha, POS y estado)
export const getVentas = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { fechaInicio, fechaFin, pointOfSaleId, estado, busqueda } = req.query;

  const whereClause: any = {};

  if (estado) whereClause.estado = String(estado);
  if (pointOfSaleId) whereClause.pointOfSaleId = String(pointOfSaleId);

  if (fechaInicio && fechaFin) {
    whereClause.createdAt = {
      gte: new Date(String(fechaInicio)),
      lte: new Date(String(fechaFin)),
    };
  }

  if (busqueda) {
    whereClause.consecutivo = { contains: String(busqueda).trim(), mode: 'insensitive' };
  }

  const ventas = await prisma.sale.findMany({
    where: whereClause,
    include: {
      usuario: { select: { nombre: true, username: true } },
      customer: true,
      pointOfSale: true,
      details: { include: { product: true } },
      payments: { include: { paymentMethod: true } },
      cargoHabitacion: { include: { room: true, guest: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  res.json({ success: true, data: ventas });
};

// 3. CONSULTAR DETALLE DE VENTA / COMPROBANTE (FAC-001, FAC-002, POS-008)
export const getVentaById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);

  const venta = await prisma.sale.findUnique({
    where: { id },
    include: {
      usuario: { select: { id: true, nombre: true, username: true } },
      customer: true,
      pointOfSale: { include: { caja: true } },
      details: { include: { product: true } },
      payments: { include: { paymentMethod: true } },
      cargoHabitacion: { include: { room: true, guest: true } },
    },
  });

  if (!venta) {
    res.status(404).json({ success: false, message: 'Venta no encontrada' });
    return;
  }

  res.json({ success: true, data: venta });
};

// 4. ANULAR VENTA CON AUTORIZACIÓN Y MOTIVO (POS-007, SEG-004)
export const anularVenta = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const ventaAnulada = await cancelSale(prisma, id, req.body, req.user!);
  const venta = ventaAnulada;
  const motivo = ventaAnulada.motivoAnulacion;

  await registrarAuditoria({
    userId: req.user?.id,
    accion: 'ANULAR_VENTA',
    entidad: 'Sale',
    entidadId: id,
    detalle: {
      consecutivo: venta.consecutivo,
      motivo,
      usuarioAnulador: req.user?.username,
      totalRevertido: venta.total,
    },
    ip: req.ip,
  });

  res.json({
    success: true,
    message: 'Venta anulada y existencias reintegradas exitosamente',
    data: ventaAnulada,
  });
};
