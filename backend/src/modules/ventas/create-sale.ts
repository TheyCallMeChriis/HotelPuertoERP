import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import type { AuthenticatedUser } from '../../middleware/auth.middleware';
import { changeStock } from '../../utils/stock-change';
import { lockOperation, nextConsecutive } from '../../utils/transaction-lock';
import {
  checkMoneyRange, idField, moneyField, operationError, optionalText,
  parseOperation, paymentField, quantityField, roundMoney,
} from '../../utils/operation-validation';

const saleSchema = z.object({
  pointOfSaleId: idField,
  customerId: idField.nullish(),
  notas: optionalText,
  items: z.array(z.object({
    productId: idField,
    cantidad: quantityField,
    precioUnitario: moneyField.optional(),
    descuento: moneyField.optional(),
    notas: optionalText,
  })).min(1),
  pagos: z.array(z.object({ paymentMethodId: idField, monto: paymentField, referencia: optionalText })).min(1),
  cargoHabitacion: z.object({ roomId: idField, guestId: idField }).nullish(),
});

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
      const lineDiscount = item.descuento ?? new Prisma.Decimal(0);
      if (lineDiscount.gt(0) && !canDiscount) throw operationError('No tiene permiso para aplicar descuentos', 403);
      const gross = roundMoney(item.cantidad.mul(product.precioVenta));
      if (lineDiscount.gt(gross)) throw operationError('El descuento no puede superar el importe de la línea');
      const lineSubtotal = gross.minus(lineDiscount);
      checkMoneyRange(lineSubtotal);
      const lineTax = roundMoney(lineSubtotal.mul(product.impuesto).div(100));
      const lineTotal = lineSubtotal.plus(lineTax);
      checkMoneyRange(lineTotal);
      subtotal = subtotal.plus(lineSubtotal);
      impuesto = impuesto.plus(lineTax);
      descuento = descuento.plus(lineDiscount);
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
    if (input.customerId) {
      if (creditAmount.gt(0)) await lockOperation(tx, `credito:${input.customerId}`);
      const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
      if (!customer?.activo) throw operationError('Cliente no disponible');
      if (creditAmount.gt(0)) {
        if (!customer.creditoActivo || customer.limiteCredito.lte(0) || customer.diasCredito <= 0) {
          throw operationError('El cliente no tiene crédito autorizado con límite y plazo válidos');
        }
        // Hasta implementar cobranzas, los pagos CREDITO de ventas completadas
        // consumen cupo; no se interpreta un pago a crédito como deuda cobrada.
        const used = await tx.salePayment.aggregate({ where: {
          sale: { customerId: customer.id, estado: 'COMPLETADA' }, paymentMethod: { codigo: 'CREDITO' },
        }, _sum: { monto: true } });
        if ((used._sum.monto ?? new Prisma.Decimal(0)).plus(creditAmount).gt(customer.limiteCredito)) {
          throw operationError('El importe a crédito supera el cupo disponible del cliente');
        }
      }
    }
    if (roomAmount.gt(0)) {
      const charge = input.cargoHabitacion;
      if (!charge) throw operationError('Indique la habitación y el huésped para el cargo');
      const room = await tx.room.findUnique({ where: { id: charge.roomId } });
      const guest = await tx.guest.findUnique({ where: { id: charge.guestId } });
      if (!room?.activo || room.estado !== 'OCUPADA' || !guest || guest.estado !== 'HOSPEDADO'
        || guest.habitacionId !== room.id || guest.checkOut !== null) {
        throw operationError('La habitación y el huésped no están habilitados para recibir el cargo');
      }
    }

    const consecutivo = await nextConsecutive(tx, 'VTA');
    const sale = await tx.sale.create({ data: {
      consecutivo, cashShiftId: turno.id, pointOfSaleId: pos.id, usuarioId: user.id,
      customerId: input.customerId, subtotal, descuento, impuesto, total, estado: 'COMPLETADA', notas: input.notas,
      details: { create: details.map(item => item.data) },
      payments: { create: input.pagos },
    }, include: { details: { include: { product: true } }, payments: { include: { paymentMethod: true } } } });

    // Las líneas repetidas se descuentan contra el saldo actualizado; cualquier
    // insuficiencia revierte también documento, pagos y movimientos anteriores.
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
      await tx.roomCharge.create({ data: {
        saleId: sale.id, ...input.cargoHabitacion, monto: roomAmount,
        transaccionUuid: `TX-PMS-${randomUUID()}`, estadoPMS: 'CONFIRMADO',
        respuestaPMS: JSON.stringify({ status: 200, message: 'Cargo procesado con éxito en PMS' }),
      } });
    }
    return { sale, consecutivo, total, posNombre: pos.nombre, itemsCount: details.length };
  });
}
