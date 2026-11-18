import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { AuthenticatedUser } from '../../middleware/auth.middleware';
import { D, idField, operationError, optionalText, parseOperation, quantityField, roundMoney } from '../../utils/operation-validation';
import { lockOperation, lockShift, nextConsecutive } from '../../utils/transaction-lock';
import { changeStock } from '../../utils/stock-change';

// Credit note (FAC-005): full or partial reversal of a sale through its own document,
// linked to the original sale, authorized (VENTAS:ANULAR) and audited.
// Unlike a cancellation, it also works for sales from already closed shifts: the money
// leaves the open shift that is indicated and the issued closing does not change.


// Request body of POST /api/ventas/:id/nota-credito
const schema = z.object({
  motivo: z.string().trim().min(5, 'Indique el motivo de la nota de crédito').max(300),
  total: z.boolean().optional(), // true = return everything still pending on the sale
  items: z.array(z.object({ saleDetailId: idField, cantidad: quantityField })).optional(),
  paymentMethodId: idField,
  cashShiftId: idField.nullish(),
  referencia: optionalText,
  reintegrarInventario: z.boolean().default(true),
});

// Relations returned with every credit note
export const creditNoteInclude = {
  sale: { select: { id: true, consecutivo: true, createdAt: true, total: true, customer: { select: { nombre: true, identificacion: true } } } },
  usuario: { select: { nombre: true, username: true } },
  paymentMethod: { select: { codigo: true, nombre: true } },
  details: { include: { product: { select: { codigo: true, nombre: true } } } },
} as const;

// Issues a credit note for the requested lines (or everything still pending), refunds the money,
// returns stock to the original warehouse and leaves the original sale untouched.
export async function createCreditNote(prisma: PrismaClient, saleId: string, body: unknown, user: AuthenticatedUser) {
  if (!user.roles.includes('ADMINISTRADOR') && !user.permisos.includes('VENTAS:ANULAR')) {
    throw operationError('Se requiere permiso VENTAS:ANULAR para emitir notas de crédito', 403);
  }
  const input = parseOperation(schema, body);
  if (!input.total && !input.items?.length) throw operationError('Indique las líneas a devolver o marque devolución total');
  if (input.items && new Set(input.items.map((i) => i.saleDetailId)).size !== input.items.length) {
    throw operationError('Indique cada línea una sola vez');
  }

  return prisma.$transaction(async (tx) => {
    await lockOperation(tx, `venta:${saleId}`);
    const inicial = await tx.sale.findUnique({ where: { id: saleId } });
    if (!inicial) throw operationError('Venta no encontrada', 404);
    if (inicial.customerId) await lockOperation(tx, `credito:${inicial.customerId}`);
    const sale = await tx.sale.findUniqueOrThrow({
      where: { id: saleId },
      include: {
        details: { include: { product: true } },
        payments: { include: { paymentMethod: true } },
        notasCredito: { include: { details: true, paymentMethod: true } },
        abonosAplicados: { where: { payment: { estado: 'APLICADO' } } },
      },
    });
    if (sale.estado !== 'COMPLETADA') throw operationError('Solo se emiten notas de crédito sobre ventas completadas', 409);
    if (sale.payments.some((p) => p.paymentMethod.codigo === 'CARGO_HABITACION')) {
      throw operationError('La venta se cargó a una habitación: use la anulación, que revierte el cargo en el PMS', 409);
    }

    // Quantities and amounts already returned per line
    const devuelto = new Map<string, { cantidad: Prisma.Decimal; subtotal: Prisma.Decimal; impuesto: Prisma.Decimal; total: Prisma.Decimal }>();
    for (const nc of sale.notasCredito) for (const d of nc.details) {
      const prev = devuelto.get(d.saleDetailId) ?? { cantidad: D(), subtotal: D(), impuesto: D(), total: D() };
      devuelto.set(d.saleDetailId, {
        cantidad: prev.cantidad.plus(d.cantidad), subtotal: prev.subtotal.plus(d.subtotal),
        impuesto: prev.impuesto.plus(d.impuesto), total: prev.total.plus(d.total),
      });
    }
    const pendiente = (detId: string) => {
      const det = sale.details.find((d) => d.id === detId)!;
      return det.cantidad.minus(devuelto.get(detId)?.cantidad ?? D());
    };

    const solicitadas = input.total
      ? sale.details.filter((d) => pendiente(d.id).gt(0)).map((d) => ({ saleDetailId: d.id, cantidad: pendiente(d.id) }))
      : input.items!.map((i) => ({ saleDetailId: i.saleDetailId, cantidad: D(i.cantidad.toString()) }));
    if (solicitadas.length === 0) throw operationError('La venta ya fue devuelta en su totalidad', 409);

    const lineas = solicitadas.map((it) => {
      const det = sale.details.find((d) => d.id === it.saleDetailId);
      if (!det) throw operationError('La línea indicada no pertenece a la venta');
      const resta = pendiente(det.id);
      if (it.cantidad.gt(resta)) throw operationError(`Solo quedan ${resta.toString()} unidades por devolver de ${det.product.nombre}`);
      const prev = devuelto.get(det.id);
      // The last return of a line takes the exact remainder so no cents are lost to rounding
      const completa = it.cantidad.eq(resta);
      const prop = (campo: 'subtotal' | 'impuesto' | 'total') => completa
        ? det[campo].minus(prev?.[campo] ?? D())
        : roundMoney(det[campo].mul(it.cantidad).div(det.cantidad));
      return { det, cantidad: D(it.cantidad.toString()), subtotal: D(prop('subtotal').toString()), impuesto: D(prop('impuesto').toString()), total: D(prop('total').toString()) };
    });
    const total = lineas.reduce((s, l) => s.plus(l.total), D());
    if (total.lte(0)) throw operationError('El monto de la nota de crédito debe ser mayor que cero');

    // The refund may only use a payment method used in the sale, up to the amount paid with it
    const metodo = sale.payments.find((p) => p.paymentMethodId === input.paymentMethodId)?.paymentMethod;
    if (!metodo) throw operationError('El reintegro debe hacerse con una forma de pago utilizada en la venta');
    const pagado = sale.payments.filter((p) => p.paymentMethodId === metodo.id).reduce((s, p) => s.plus(p.monto), D());
    const yaReintegrado = sale.notasCredito.filter((n) => n.paymentMethodId === metodo.id).reduce((s, n) => s.plus(n.total), D());
    const disponible = pagado.minus(yaReintegrado);
    if (total.gt(disponible)) throw operationError(`El reintegro por ${metodo.nombre} no puede superar ₡${disponible.toFixed(2)}`);
    if (metodo.codigo === 'CREDITO') {
      // A credit refund reduces the debt: it cannot exceed the document's outstanding balance
      const abonado = sale.abonosAplicados.reduce((s, a) => s.plus(a.monto), D());
      const saldo = disponible.minus(abonado);
      if (total.gt(saldo)) throw operationError(`El documento solo tiene ₡${saldo.toFixed(2)} pendientes; devuelva el resto por otra forma de pago`);
    }

    const consecutivo = await nextConsecutive(tx, 'NC');
    if (metodo.codigo === 'EFECTIVO') {
      if (!input.cashShiftId) throw operationError('El reintegro en efectivo requiere un turno de caja abierto');
      await lockShift(tx, input.cashShiftId);
      await tx.cashMovement.create({ data: {
        cashShiftId: input.cashShiftId, usuarioId: user.id, tipo: 'SALIDA_EXTRAORDINARIA', monto: total,
        motivo: `Reintegro nota de crédito ${consecutivo} (venta ${sale.consecutivo})`,
      } });
    }

    if (input.reintegrarInventario) {
      const salidas = await tx.inventoryMovement.findMany({ where: { documentoReferencia: sale.consecutivo, tipo: 'SALIDA_VENTA' } });
      for (const l of [...lineas].sort((a, b) => a.det.productId.localeCompare(b.det.productId))) {
        const salida = salidas.find((m) => m.productId === l.det.productId);
        if (!salida || l.det.product.esServicio) continue; // services carry no stock
        const balances = await changeStock(tx, salida.warehouseId, l.det.productId, l.cantidad);
        await tx.inventoryMovement.create({ data: {
          warehouseId: salida.warehouseId, productId: l.det.productId, tipo: 'ENTRADA_DEVOLUCION', cantidad: l.cantidad,
          ...balances, costoUnitario: salida.costoUnitario, documentoReferencia: `${sale.consecutivo} / ${consecutivo}`,
          motivo: `Devolución por nota de crédito ${consecutivo}: ${input.motivo}`, usuarioId: user.id,
        } });
      }
    }

    const quedaPendiente = sale.details.some((d) => {
      const l = lineas.find((x) => x.det.id === d.id);
      return pendiente(d.id).minus(l?.cantidad ?? D()).gt(0);
    });
    return tx.creditNote.create({
      data: {
        consecutivo, saleId: sale.id, usuarioId: user.id, tipo: quedaPendiente ? 'PARCIAL' : 'TOTAL', motivo: input.motivo,
        subtotal: lineas.reduce((s, l) => s.plus(l.subtotal), D()), impuesto: lineas.reduce((s, l) => s.plus(l.impuesto), D()), total,
        paymentMethodId: metodo.id, cashShiftId: metodo.codigo === 'EFECTIVO' ? input.cashShiftId : null,
        referencia: input.referencia ?? null, reintegraInventario: input.reintegrarInventario,
        details: { create: lineas.map((l) => ({
          saleDetailId: l.det.id, productId: l.det.productId, cantidad: l.cantidad, subtotal: l.subtotal, impuesto: l.impuesto, total: l.total,
        })) },
      },
      include: creditNoteInclude,
    });
  });
}
