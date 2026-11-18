import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { AuthenticatedUser } from '../../middleware/auth.middleware';
import { idField, moneyField, operationError, optionalText, parseOperation, quantityField } from '../../utils/operation-validation';
import { lockOperation, nextConsecutive } from '../../utils/transaction-lock';
import { createPurchaseOrderTx, orderSchema } from './purchase-operations';

// Internal purchase requests (COM-002) with a role-based approval flow (COM-003).
// PENDIENTE -> APROBADA -> CONVERTIDA into a purchase order; also RECHAZADA or CANCELADA.

// Administrators implicitly hold every permission
const puede = (u: AuthenticatedUser, permiso: string) => u.roles.includes('ADMINISTRADOR') || u.permisos.includes(permiso);

// Strict YYYY-MM-DD date
const fecha = z.string().trim()
  .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Fecha inválida (AAAA-MM-DD)');

// Body of a new purchase request
const requestSchema = z.object({
  warehouseId: idField,
  departamento: optionalText,
  justificacion: z.string().trim().min(5, 'Indique la justificación de la solicitud').max(500),
  prioridad: z.enum(['NORMAL', 'URGENTE']).default('NORMAL'),
  items: z.array(z.object({ productId: idField, cantidad: quantityField, notas: optionalText })).min(1, 'Agregue al menos un artículo'),
});
const reviewSchema = z.object({
  decision: z.enum(['APROBAR', 'RECHAZAR']),
  comentario: optionalText,
});
const convertSchema = z.object({
  supplierId: idField,
  fechaEsperada: fecha.nullish(),
  notas: optionalText,
  precios: z.array(z.object({ productId: idField, precioUnitario: moneyField })).optional(),
});

// Relations returned with every request
export const requestInclude = {
  solicitante: { select: { id: true, nombre: true, username: true } },
  revisor: { select: { nombre: true, username: true } },
  warehouse: { select: { id: true, codigo: true, nombre: true } },
  purchaseOrder: { select: { id: true, consecutivo: true, estado: true } },
  details: { include: { product: { select: { id: true, codigo: true, nombre: true, costo: true } } } },
} as const;

// Creates a PENDIENTE request (COMPRAS:CREAR or INVENTARIO:CREAR).
export async function crearSolicitud(prisma: PrismaClient, body: unknown, user: AuthenticatedUser) {
  if (!puede(user, 'COMPRAS:CREAR') && !puede(user, 'INVENTARIO:CREAR')) {
    throw operationError('Se requiere permiso COMPRAS:CREAR o INVENTARIO:CREAR para solicitar compras', 403);
  }
  const input = parseOperation(requestSchema, body);
  if (new Set(input.items.map((i) => i.productId)).size !== input.items.length) throw operationError('Indique cada producto en una sola línea');
  return prisma.$transaction(async (tx) => {
    const bodega = await tx.warehouse.findUnique({ where: { id: input.warehouseId } });
    if (!bodega?.activo) throw operationError('Bodega no disponible');
    for (const it of input.items) {
      const p = await tx.product.findUnique({ where: { id: it.productId } });
      if (!p?.activo || p.esServicio) throw operationError('Producto no disponible para compra');
    }
    return tx.purchaseRequest.create({
      data: {
        consecutivo: await nextConsecutive(tx, 'SC'), solicitanteId: user.id, warehouseId: bodega.id,
        departamento: input.departamento ?? null, justificacion: input.justificacion, prioridad: input.prioridad,
        details: { create: input.items.map((i) => ({ productId: i.productId, cantidad: i.cantidad, notas: i.notas ?? null })) },
      },
      include: requestInclude,
    });
  });
}

// Approves or rejects a PENDIENTE request (COMPRAS:APROBAR); rejection needs a reason.
export async function revisarSolicitud(prisma: PrismaClient, id: string, body: unknown, user: AuthenticatedUser) {
  if (!puede(user, 'COMPRAS:APROBAR')) throw operationError('Se requiere permiso COMPRAS:APROBAR para aprobar o rechazar solicitudes', 403);
  const input = parseOperation(reviewSchema, body);
  if (input.decision === 'RECHAZAR' && !input.comentario) throw operationError('Indique el motivo del rechazo');
  return prisma.$transaction(async (tx) => {
    await lockOperation(tx, `solicitud:${id}`);
    const sol = await tx.purchaseRequest.findUnique({ where: { id } });
    if (!sol) throw operationError('Solicitud no encontrada', 404);
    if (sol.estado !== 'PENDIENTE') throw operationError(`La solicitud está ${sol.estado} y ya no puede revisarse`, 409);
    // Segregation of duties: requesters cannot approve their own request (except the administrator)
    if (sol.solicitanteId === user.id && !user.roles.includes('ADMINISTRADOR')) {
      throw operationError('No puede aprobar o rechazar su propia solicitud', 403);
    }
    return tx.purchaseRequest.update({
      where: { id },
      data: {
        estado: input.decision === 'APROBAR' ? 'APROBADA' : 'RECHAZADA',
        revisorId: user.id, fechaRevision: new Date(), comentarioRevision: input.comentario ?? null,
      },
      include: requestInclude,
    });
  });
}

// Cancels a request; allowed to its requester or an approver.
export async function cancelarSolicitud(prisma: PrismaClient, id: string, body: unknown, user: AuthenticatedUser) {
  const { motivo } = parseOperation(z.object({ motivo: z.string().trim().min(3, 'Indique el motivo').max(300) }), body);
  return prisma.$transaction(async (tx) => {
    await lockOperation(tx, `solicitud:${id}`);
    const sol = await tx.purchaseRequest.findUnique({ where: { id } });
    if (!sol) throw operationError('Solicitud no encontrada', 404);
    if (sol.solicitanteId !== user.id && !puede(user, 'COMPRAS:APROBAR')) throw operationError('Solo el solicitante o un aprobador puede cancelarla', 403);
    if (!['PENDIENTE', 'APROBADA'].includes(sol.estado)) throw operationError(`La solicitud está ${sol.estado} y no puede cancelarse`, 409);
    return tx.purchaseRequest.update({
      where: { id },
      data: { estado: 'CANCELADA', comentarioRevision: motivo, revisorId: sol.revisorId ?? user.id, fechaRevision: sol.fechaRevision ?? new Date() },
      include: requestInclude,
    });
  });
}

// Generates the purchase order from an approved request
export async function convertirSolicitud(prisma: PrismaClient, id: string, body: unknown, user: AuthenticatedUser) {
  if (!puede(user, 'COMPRAS:CREAR')) throw operationError('Se requiere permiso COMPRAS:CREAR para generar órdenes de compra', 403);
  const input = parseOperation(convertSchema, body);
  return prisma.$transaction(async (tx) => {
    await lockOperation(tx, `solicitud:${id}`);
    const sol = await tx.purchaseRequest.findUnique({ where: { id }, include: { details: true } });
    if (!sol) throw operationError('Solicitud no encontrada', 404);
    if (sol.estado !== 'APROBADA') throw operationError('Solo una solicitud aprobada puede convertirse en orden de compra', 409);
    const precio = new Map((input.precios ?? []).map((p) => [p.productId, p.precioUnitario]));
    const orderInput = parseOperation(orderSchema, {
      supplierId: input.supplierId, warehouseId: sol.warehouseId, fechaEsperada: input.fechaEsperada ?? null,
      notas: [`Solicitud ${sol.consecutivo}`, input.notas].filter(Boolean).join(' · '),
      items: sol.details.map((d) => ({
        productId: d.productId, cantidadSolicitada: d.cantidad.toString(),
        ...(precio.has(d.productId) ? { precioUnitario: (precio.get(d.productId) as Prisma.Decimal).toString() } : {}),
      })),
    });
    const orden = await createPurchaseOrderTx(tx, orderInput, user.id);
    const solicitud = await tx.purchaseRequest.update({
      where: { id }, data: { estado: 'CONVERTIDA', purchaseOrderId: orden.id }, include: requestInclude,
    });
    return { solicitud, orden };
  });
}

// Lists requests, optionally by status.
export async function listarSolicitudes(prisma: PrismaClient, query: Record<string, unknown>, user: AuthenticatedUser) {
  const where: Prisma.PurchaseRequestWhereInput = {};
  if (typeof query.estado === 'string' && query.estado) where.estado = query.estado;
  // Users who do not manage purchasing only see their own requests
  if (!puede(user, 'COMPRAS:VER') && !puede(user, 'COMPRAS:APROBAR')) where.solicitanteId = user.id;
  return prisma.purchaseRequest.findMany({ where, include: requestInclude, orderBy: { createdAt: 'desc' }, take: 300 });
}
