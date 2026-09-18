import { Response } from 'express';
import { prisma } from '../../utils/prisma';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { registrarAuditoria } from '../../utils/audit';
import { createPurchaseOrder, receivePurchase } from './purchase-operations';

// 1. CREAR ORDEN DE COMPRA (COM-004)
export const createOrdenCompra = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const orden = await createPurchaseOrder(prisma, req.body, req.user!.id);
  const { consecutivo, supplierId, total } = orden;
  const items = orden.details;

  await registrarAuditoria({
    userId: req.user?.id,
    accion: 'CREAR_ORDEN_COMPRA',
    entidad: 'PurchaseOrder',
    entidadId: orden.id,
    detalle: { consecutivo, supplierId, total, itemsCount: items.length },
    ip: req.ip,
  });

  res.status(201).json({
    success: true,
    message: 'Orden de compra creada exitosamente',
    data: orden,
  });
};

// 2. LISTAR ORDENES DE COMPRA (COM-008)
export const getOrdenesCompra = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { supplierId, estado } = req.query;
  const whereClause: any = {};
  if (supplierId) whereClause.supplierId = String(supplierId);
  if (estado) whereClause.estado = String(estado);

  const ordenes = await prisma.purchaseOrder.findMany({
    where: whereClause,
    include: {
      supplier: true,
      warehouse: true,
      usuario: { select: { nombre: true, username: true } },
      details: { include: { product: true } },
      receipts: { include: { details: true } },
    },
    orderBy: { fechaEmision: 'desc' },
  });

  res.json({ success: true, data: ordenes });
};

// 3. REGISTRAR RECEPCIÓN DE MERCADERÍA (TOTAL O PARCIAL) (COM-005, COM-006, COM-007)
export const registrarRecepcion = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { receipt: recepcion, order: orden } = await receivePurchase(prisma, req.body, req.user!.id);
  const { consecutivo, facturaProveedor } = recepcion;
  const items = recepcion.details;

  await registrarAuditoria({
    userId: req.user?.id,
    accion: 'RECEPCION_COMPRA',
    entidad: 'PurchaseReceipt',
    entidadId: recepcion.id,
    detalle: { consecutivo, ordenConsecutivo: orden.consecutivo, facturaProveedor, itemsCount: items.length },
    ip: req.ip,
  });

  res.status(201).json({
    success: true,
    message: 'Recepción registrada e inventario actualizado con éxito',
    data: recepcion,
  });
};
