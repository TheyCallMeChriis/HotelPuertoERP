import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../utils/prisma';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { registrarAuditoria } from '../../utils/audit';
import { idField, operationError, optionalText, parseOperation, quantityField } from '../../utils/operation-validation';

// Suspended sales (POS-006). They store the cart so it can be resumed later:
// they generate no sequence number, payments, cash movements or inventory movements.

// Draft cart stored as JSON; prices and discounts are recomputed when the sale is completed
const suspendSchema = z.object({
  pointOfSaleId: idField,
  etiqueta: z.string().trim().min(1, 'Indique una referencia, por ejemplo mesa o nombre').max(80),
  customerId: idField.nullish(),
  notas: optionalText,
  items: z.array(z.object({
    productId: idField,
    cantidad: quantityField,
    descuento: z.number().min(0).optional(),
    descuentoPorcentaje: z.number().min(0).max(100).optional(),
    notas: optionalText,
  })).min(1, 'La venta suspendida debe tener al menos un artículo').max(200),
});

// Suspended sales, optionally for one point of sale, oldest first.
export const getVentasSuspendidas = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const pointOfSaleId = req.query.pointOfSaleId ? String(req.query.pointOfSaleId) : undefined;
  const suspendidas = await prisma.suspendedSale.findMany({
    where: pointOfSaleId ? { pointOfSaleId } : {},
    include: { usuario: { select: { nombre: true } }, customer: { select: { id: true, nombre: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ success: true, data: suspendidas });
};

// Stores the current cart under a label (e.g. table or guest name).
export const suspenderVenta = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const input = parseOperation(suspendSchema, req.body);
  const pos = await prisma.pointOfSale.findUnique({ where: { id: input.pointOfSaleId } });
  if (!pos?.activo) throw operationError('Punto de venta no disponible');
  const ids = [...new Set(input.items.map((i) => i.productId))];
  const productos = await prisma.product.count({ where: { id: { in: ids }, activo: true } });
  if (productos !== ids.length) throw operationError('Uno o más productos no están disponibles');
  if (input.customerId) {
    const cliente = await prisma.customer.findUnique({ where: { id: input.customerId } });
    if (!cliente?.activo) throw operationError('Cliente no disponible');
  }

  const suspendida = await prisma.suspendedSale.create({
    data: {
      pointOfSaleId: pos.id,
      usuarioId: req.user!.id,
      customerId: input.customerId ?? null,
      etiqueta: input.etiqueta,
      notas: input.notas ?? null,
      items: input.items.map((i) => ({
        productId: i.productId, cantidad: i.cantidad.toString(), descuento: i.descuento ?? 0,
        descuentoPorcentaje: i.descuentoPorcentaje ?? null, notas: i.notas ?? null,
      })),
    },
    include: { usuario: { select: { nombre: true } }, customer: { select: { id: true, nombre: true } } },
  });
  await registrarAuditoria({
    userId: req.user?.id, accion: 'SUSPENDER_VENTA', entidad: 'SuspendedSale', entidadId: suspendida.id, ip: req.ip,
    detalle: { etiqueta: suspendida.etiqueta, puntoVenta: pos.codigo, articulos: input.items.length },
  });
  res.status(201).json({ success: true, message: 'Venta suspendida', data: suspendida });
};

// Deletes a suspended sale; its content is kept in the audit log.
export const descartarVentaSuspendida = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const motivo = typeof req.body?.motivo === 'string' ? req.body.motivo.trim() : '';
  const suspendida = await prisma.suspendedSale.findUnique({ where: { id } });
  if (!suspendida) throw operationError('La venta suspendida ya no existe', 404);
  await prisma.suspendedSale.delete({ where: { id } });
  await registrarAuditoria({
    userId: req.user?.id, accion: 'DESCARTAR_VENTA_SUSPENDIDA', entidad: 'SuspendedSale', entidadId: id, ip: req.ip,
    detalle: { etiqueta: suspendida.etiqueta, creadaPor: suspendida.usuarioId, items: suspendida.items, motivo: motivo || null },
  });
  res.json({ success: true, message: 'Venta suspendida descartada' });
};
