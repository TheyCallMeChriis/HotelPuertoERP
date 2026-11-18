// Purchasing endpoints (/api/compras): purchase orders, goods receipts and internal requests.

import { Response } from 'express';
import { prisma } from '../../utils/prisma';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { registrarAuditoria } from '../../utils/audit';
import { createPurchaseOrder, receivePurchase } from './purchase-operations';
import { cancelarSolicitud, convertirSolicitud, crearSolicitud, listarSolicitudes, revisarSolicitud } from './purchase-requests';

// 1. CREATE A PURCHASE ORDER (COM-004)
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

// 2. LIST PURCHASE ORDERS (COM-008)
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

// 3. RECORD A GOODS RECEIPT (FULL OR PARTIAL) (COM-005, COM-006, COM-007)
export const registrarRecepcion = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { receipt: recepcion, order: orden } = await receivePurchase(prisma, req.body, req.user!.id);
  const { consecutivo, facturaProveedor } = recepcion;
  const items = recepcion.details;

  await registrarAuditoria({
    userId: req.user?.id,
    accion: 'RECEPCION_COMPRA',
    entidad: 'PurchaseReceipt',
    entidadId: recepcion.id,
    detalle: {
      consecutivo, ordenConsecutivo: orden.consecutivo, facturaProveedor, itemsCount: items.length,
      // INV-011: cost change of every received product
      costos: items.map((i) => ({ productId: i.productId, anterior: i.costoAnterior, nuevo: i.costoNuevo })),
    },
    ip: req.ip,
  });

  res.status(201).json({
    success: true,
    message: 'Recepción registrada e inventario actualizado con éxito',
    data: recepcion,
  });
};

// ── Internal purchase requests (COM-002, COM-003) ──

// Purchase requests visible to the user.
export const getSolicitudes = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  res.json({ success: true, data: await listarSolicitudes(prisma, req.query as Record<string, unknown>, req.user!) });
};

// Creates a purchase request.
export const postSolicitud = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const sol = await crearSolicitud(prisma, req.body, req.user!);
  await registrarAuditoria({
    userId: req.user!.id, accion: 'SOLICITUD_COMPRA', entidad: 'PurchaseRequest', entidadId: sol.id, ip: req.ip,
    detalle: { consecutivo: sol.consecutivo, prioridad: sol.prioridad, items: sol.details.length },
  });
  res.status(201).json({ success: true, message: `Solicitud ${sol.consecutivo} registrada; queda pendiente de aprobación`, data: sol });
};

// Approves or rejects a request.
export const postRevisionSolicitud = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const sol = await revisarSolicitud(prisma, String(req.params.id), req.body, req.user!);
  await registrarAuditoria({
    userId: req.user!.id, accion: sol.estado === 'APROBADA' ? 'APROBACION_SOLICITUD_COMPRA' : 'RECHAZO_SOLICITUD_COMPRA',
    entidad: 'PurchaseRequest', entidadId: sol.id, ip: req.ip, detalle: { consecutivo: sol.consecutivo, comentario: sol.comentarioRevision },
  });
  res.json({ success: true, message: `Solicitud ${sol.consecutivo} ${sol.estado === 'APROBADA' ? 'aprobada' : 'rechazada'}`, data: sol });
};

// Cancels a pending or approved request.
export const postCancelarSolicitud = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const sol = await cancelarSolicitud(prisma, String(req.params.id), req.body, req.user!);
  await registrarAuditoria({
    userId: req.user!.id, accion: 'CANCELACION_SOLICITUD_COMPRA', entidad: 'PurchaseRequest', entidadId: sol.id, ip: req.ip,
    detalle: { consecutivo: sol.consecutivo, motivo: sol.comentarioRevision },
  });
  res.json({ success: true, message: `Solicitud ${sol.consecutivo} cancelada`, data: sol });
};

// Turns an approved request into a purchase order.
export const postConvertirSolicitud = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { solicitud, orden } = await convertirSolicitud(prisma, String(req.params.id), req.body, req.user!);
  await registrarAuditoria({
    userId: req.user!.id, accion: 'CONVERSION_SOLICITUD_COMPRA', entidad: 'PurchaseRequest', entidadId: solicitud.id, ip: req.ip,
    detalle: { solicitud: solicitud.consecutivo, orden: orden.consecutivo, total: orden.total },
  });
  res.status(201).json({ success: true, message: `Orden ${orden.consecutivo} generada desde la solicitud ${solicitud.consecutivo}`, data: { solicitud, orden } });
};
