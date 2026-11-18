// Sales endpoints (/api/ventas). Business rules live in create-sale.ts and cancel-sale.ts.

import { Response } from 'express';
import { prisma } from '../../utils/prisma';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { registrarAuditoria } from '../../utils/audit';
import { createSale } from './create-sale';
import { cancelSale } from './cancel-sale';
import { dateRange } from '../reportes/report-filters';

// 1. CREATE A SALE (POS-001, POS-002, POS-004, POS-009, POS-010, CAJ-002, INV-010)
export const createVenta = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { sale: ventaFinal, consecutivo, total: totalVenta, posNombre, itemsCount, descuento, discountLines } =
    await createSale(prisma, req.body, req.user!);

  // SEG-004: each discount is logged as its own event with author and per-line detail
  if (descuento.gt(0)) {
    await registrarAuditoria({
      userId: req.user?.id, accion: 'DESCUENTO_APLICADO', entidad: 'Sale', entidadId: ventaFinal.id, ip: req.ip,
      detalle: { consecutivo, descuentoTotal: descuento.toFixed(2), lineas: discountLines },
    });
  }

  // Write the audit entry
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

// 2. LIST SALES (filters by date, point of sale and status)
export const getVentas = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { pointOfSaleId, estado, busqueda } = req.query;

  const whereClause: any = {};

  if (estado) whereClause.estado = String(estado);
  if (pointOfSaleId) whereClause.pointOfSaleId = String(pointOfSaleId);

  // Whole local days, either bound optional (same rule as the reports)
  const rango = dateRange(req.query);
  if (rango) whereClause.createdAt = rango;

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
      // Sales with credit notes can no longer be cancelled; the POS hides that action
      _count: { select: { notasCredito: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  res.json({ success: true, data: ventas });
};

// 3. GET SALE DETAIL / RECEIPT (FAC-001, FAC-002, POS-008)
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
      notasCredito: { include: { details: true, paymentMethod: true }, orderBy: { createdAt: 'asc' } },
    },
  });

  if (!venta) {
    res.status(404).json({ success: false, message: 'Venta no encontrada' });
    return;
  }

  res.json({ success: true, data: venta });
};

// 4. CANCEL A SALE WITH AUTHORIZATION AND REASON (POS-007, SEG-004)
export const anularVenta = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const venta = await cancelSale(prisma, id, req.body, req.user!);

  await registrarAuditoria({
    userId: req.user?.id,
    accion: 'ANULAR_VENTA',
    entidad: 'Sale',
    entidadId: id,
    detalle: {
      consecutivo: venta.consecutivo,
      motivo: venta.motivoAnulacion,
      usuarioAnulador: req.user?.username,
      totalRevertido: venta.total,
    },
    ip: req.ip,
  });

  res.json({
    success: true,
    message: 'Venta anulada y existencias reintegradas exitosamente',
    data: venta,
  });
};
