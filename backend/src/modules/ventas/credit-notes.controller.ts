import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { prisma } from '../../utils/prisma';
import { registrarAuditoria } from '../../utils/audit';
import { operationError } from '../../utils/operation-validation';
import { createCreditNote, creditNoteInclude } from './credit-notes';

// Credit notes (FAC-005) and receipt reprints that never duplicate the transaction (FAC-006)

// Issues a credit note on a sale.
export const postNotaCredito = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const nc = await createCreditNote(prisma, String(req.params.id), req.body, req.user!);
  await registrarAuditoria({
    userId: req.user!.id, accion: 'NOTA_CREDITO', entidad: 'CreditNote', entidadId: nc.id, ip: req.ip,
    detalle: { consecutivo: nc.consecutivo, venta: nc.sale.consecutivo, tipo: nc.tipo, total: nc.total, reintegro: nc.paymentMethod.codigo, motivo: nc.motivo },
  });
  res.status(201).json({ success: true, message: `Nota de crédito ${nc.consecutivo} emitida sobre la venta ${nc.sale.consecutivo}`, data: nc });
};

// Credit notes, optionally filtered by sale.
export const getNotasCredito = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const where = req.query.saleId ? { saleId: String(req.query.saleId) } : {};
  const data = await prisma.creditNote.findMany({ where, include: creditNoteInclude, orderBy: { createdAt: 'desc' }, take: 300 });
  res.json({ success: true, data });
};

// Reprint: creates no new document; it only records the copy and marks it as such
export const postReimpresionVenta = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const existe = await prisma.sale.findUnique({ where: { id }, select: { id: true } });
  if (!existe) throw operationError('Venta no encontrada', 404);
  const venta = await prisma.sale.update({
    where: { id }, data: { impresiones: { increment: 1 } },
    include: {
      usuario: { select: { id: true, nombre: true, username: true } }, customer: true,
      pointOfSale: { include: { caja: true } }, details: { include: { product: true } },
      payments: { include: { paymentMethod: true } }, cargoHabitacion: { include: { room: true, guest: true } },
      notasCredito: { select: { consecutivo: true, total: true, tipo: true, createdAt: true } },
    },
  });
  await registrarAuditoria({
    userId: req.user!.id, accion: 'REIMPRESION_COMPROBANTE', entidad: 'Sale', entidadId: venta.id, ip: req.ip,
    detalle: { consecutivo: venta.consecutivo, copia: venta.impresiones - 1 },
  });
  res.json({ success: true, data: { ...venta, copia: venta.impresiones - 1 } });
};

// Reprints a credit note as a numbered copy.
export const postReimpresionNota = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const existe = await prisma.creditNote.findUnique({ where: { id }, select: { id: true } });
  if (!existe) throw operationError('Nota de crédito no encontrada', 404);
  const nc = await prisma.creditNote.update({ where: { id }, data: { impresiones: { increment: 1 } }, include: creditNoteInclude });
  await registrarAuditoria({
    userId: req.user!.id, accion: 'REIMPRESION_COMPROBANTE', entidad: 'CreditNote', entidadId: nc.id, ip: req.ip,
    detalle: { consecutivo: nc.consecutivo, copia: nc.impresiones - 1 },
  });
  res.json({ success: true, data: { ...nc, copia: nc.impresiones - 1 } });
};
