// Sale creation (POS-001 to POS-010, CAJ-002, INV-010, CLI-004, PMS-004).
// Everything runs in one transaction: prices and taxes are recomputed on the server, payments must
// match the total exactly, credit and room charges are validated, and stock is deducted line by line.

import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { AuthenticatedUser } from '../../middleware/auth.middleware';
import { changeStock } from '../../utils/stock-change';
import { lockOperation, nextConsecutive } from '../../utils/transaction-lock';
import {
  checkMoneyRange, idField, moneyField, operationError, optionalText,
  parseOperation, paymentField, quantityField, roundMoney,
} from '../../utils/operation-validation';
import { registrarCargo, validarHuespedHabilitado } from '../../integrations/pms/pms-service';
import { saldoCliente } from '../cxc/cxc-service';

// Request body accepted by POST /api/ventas
const saleSchema = z.object({
  pointOfSaleId: idField,
  customerId: idField.nullish(),
  notas: optionalText,
  items: z.array(z.object({
    productId: idField,
    cantidad: quantityField,
    precioUnitario: moneyField.optional(),
    descuento: moneyField.optional(),
    // POS-004: percentage discount (0-100, up to 2 decimals); the server computes the amount
    descuentoPorcentaje: z.number().min(0).max(100).refine((v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-9, 'Porcentaje con máximo 2 decimales').optional(),
    notas: optionalText,
  })).min(1),
  // POS-006: completing a resumed sale deletes the suspended draft
  suspendedSaleId: idField.nullish(),
  pagos: z.array(z.object({ paymentMethodId: idField, monto: paymentField, referencia: optionalText })).min(1),
  cargoHabitacion: z.object({ roomId: idField, guestId: idField }).nullish(),
});

// Creates a completed sale with its lines, payments, ledger exits and optional PMS charge.
export async function createSale(prisma: PrismaClient, body: unknown, user: AuthenticatedUser) {
  const input = parseOperation(saleSchema, body);
  const canDiscount = user.roles.includes('ADMINISTRADOR') || user.permisos.includes('VENTAS:DESCUENTO');

  return prisma.$transaction(async (tx) => {
    const pos = await tx.pointOfSale.findUnique({
      where: { id: input.pointOfSaleId }, include: { caja: true, bodegaDefecto: true },
    });
    if (!pos?.activo || !pos.caja.activo || !pos.bodegaDefecto.activo) {
      throw operationError('Punto de venta, caja o bodega no disponible');
    }
    await lockOperation(tx, `caja:${pos.cajaId}`);
    const turno = await tx.cashShift.findFirst({ where: { cajaId: pos.cajaId, estado: 'ABIERTA' } });
    if (!turno) throw operationError('La caja está cerrada. Abra un turno antes de vender.');

    const details = [];
    const discountLines: Array<{ producto: string; monto: string; porcentaje: number | null }> = [];
    let subtotal = new Prisma.Decimal(0);
    let impuesto = new Prisma.Decimal(0);
    let descuento = new Prisma.Decimal(0);
    for (const item of input.items) {
      const product = await tx.product.findUnique({ where: { id: item.productId } });
      if (!product?.activo) throw operationError('Producto no disponible');
      checkMoneyRange(product.precioVenta);
      if (product.impuesto.lt(0) || !product.impuesto.isFinite()) throw operationError('Impuesto de producto inválido');
      if (item.precioUnitario && !item.precioUnitario.eq(product.precioVenta)) {
        throw operationError('El precio no coincide con el catálogo. Actualice los productos y use el descuento autorizado.', 409);
      }
      const gross = roundMoney(item.cantidad.mul(product.precioVenta));
      const lineDiscount = item.descuentoPorcentaje !== undefined && item.descuentoPorcentaje > 0
        ? roundMoney(gross.mul(item.descuentoPorcentaje).div(100))
        : item.descuento ?? new Prisma.Decimal(0);
      if (lineDiscount.gt(0) && !canDiscount) throw operationError('No tiene permiso para aplicar descuentos', 403);
      if (lineDiscount.gt(gross)) throw operationError('El descuento no puede superar el importe de la línea');
      const lineSubtotal = gross.minus(lineDiscount);
      checkMoneyRange(lineSubtotal);
      const lineTax = roundMoney(lineSubtotal.mul(product.impuesto).div(100));
      const lineTotal = lineSubtotal.plus(lineTax);
      checkMoneyRange(lineTotal);
      subtotal = subtotal.plus(lineSubtotal);
      impuesto = impuesto.plus(lineTax);
      descuento = descuento.plus(lineDiscount);
      discountLines.push(...(lineDiscount.gt(0) ? [{
        producto: product.codigo, monto: lineDiscount.toFixed(2),
        porcentaje: item.descuentoPorcentaje ?? null,
      }] : []));
      details.push({ product, data: {
        productId: product.id, cantidad: item.cantidad, precioUnitario: product.precioVenta,
        descuento: lineDiscount, subtotal: lineSubtotal, impuesto: lineTax, total: lineTotal, notas: item.notas,
      } });
    }
    const total = subtotal.plus(impuesto);
    for (const amount of [total, subtotal, impuesto, descuento]) checkMoneyRange(amount);

    let paid = new Prisma.Decimal(0);
    let roomAmount = new Prisma.Decimal(0);
    let creditAmount = new Prisma.Decimal(0);
    for (const payment of input.pagos) {
      const method = await tx.paymentMethod.findUnique({ where: { id: payment.paymentMethodId } });
      if (!method?.activo) throw operationError('Forma de pago no disponible');
      paid = paid.plus(payment.monto);
      if (method.codigo === 'CARGO_HABITACION') roomAmount = roomAmount.plus(payment.monto);
      if (method.codigo === 'CREDITO') creditAmount = creditAmount.plus(payment.monto);
    }
    if (!paid.eq(total)) throw operationError(`El pago (${paid.toFixed(2)}) debe coincidir con la venta (${total.toFixed(2)})`);
    if (creditAmount.gt(0) && !input.customerId) throw operationError('Seleccione un cliente autorizado para vender a crédito');
    let fechaVencimiento: Date | null = null;
    if (input.customerId) {
      if (creditAmount.gt(0)) await lockOperation(tx, `credito:${input.customerId}`);
      const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
      if (!customer?.activo) throw operationError('Cliente no disponible');
      if (creditAmount.gt(0)) {
        if (!customer.creditoActivo || customer.limiteCredito.lte(0) || customer.diasCredito <= 0) {
          throw operationError('El cliente no tiene crédito autorizado con límite y plazo válidos');
        }
        fechaVencimiento = new Date(Date.now() + customer.diasCredito * 86_400_000);
        // CLI-004: the used credit is the outstanding balance (credit sales minus applied payments)
        const used = await saldoCliente(tx, customer.id);
        if (used.plus(creditAmount).gt(customer.limiteCredito)) {
          throw operationError('El importe a crédito supera el cupo disponible del cliente');
        }
      }
    }
    if (roomAmount.gt(0)) {
      const charge = input.cargoHabitacion;
      if (!charge) throw operationError('Indique la habitación y el huésped para el cargo');
      // Fail before consuming a sequence number; registrarCargo validates again when sending
      await validarHuespedHabilitado(tx, charge.roomId, charge.guestId);
    }

    if (input.suspendedSaleId) {
      const removed = await tx.suspendedSale.deleteMany({ where: { id: input.suspendedSaleId, pointOfSaleId: pos.id } });
      if (removed.count !== 1) throw operationError('La venta suspendida ya fue retomada o descartada en otro equipo', 409);
    }

    const consecutivo = await nextConsecutive(tx, 'VTA');
    const sale = await tx.sale.create({ data: {
      consecutivo, cashShiftId: turno.id, pointOfSaleId: pos.id, usuarioId: user.id,
      customerId: input.customerId, subtotal, descuento, impuesto, total, estado: 'COMPLETADA', notas: input.notas, fechaVencimiento,
      details: { create: details.map(item => item.data) },
      payments: { create: input.pagos },
    }, include: {
      details: { include: { product: true } }, payments: { include: { paymentMethod: true } },
      customer: { select: { nombre: true, identificacion: true } }, usuario: { select: { nombre: true } }, pointOfSale: { select: { nombre: true } },
    } });

    // Repeated lines are deducted against the updated stock; any shortage
    // also rolls back the document, payments and earlier movements.
    for (const { product, data } of details) {
      if (product.esServicio) continue;
      const balances = await changeStock(tx, pos.bodegaDefectoId, product.id, data.cantidad.negated());
      await tx.inventoryMovement.create({ data: {
        warehouseId: pos.bodegaDefectoId, productId: product.id, tipo: 'SALIDA_VENTA',
        cantidad: data.cantidad, ...balances, costoUnitario: product.costo,
        documentoReferencia: consecutivo, motivo: `Venta POS realizada (#${consecutivo})`, usuarioId: user.id,
      } });
    }
    if (roomAmount.gt(0) && input.cargoHabitacion) {
      // PMS-001: the charge goes through the integration layer; if the PMS does not answer, the charge
      // stays in ERROR with a retry queue entry and the sale is kept (the payment is not lost).
      await registrarCargo(tx, { saleId: sale.id, ...input.cargoHabitacion, monto: roomAmount });
    }
    return { sale, consecutivo, total, posNombre: pos.nombre, itemsCount: details.length, descuento, discountLines };
  });
}
