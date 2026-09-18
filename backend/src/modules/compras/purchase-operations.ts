import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { checkMoneyRange, idField, moneyField, operationError, optionalText, parseOperation, quantityField, roundMoney } from '../../utils/operation-validation';
import { lockOperation, nextConsecutive } from '../../utils/transaction-lock';
import { changeStock } from '../../utils/stock-change';

const orderSchema = z.object({
  supplierId: idField, warehouseId: idField, notas: optionalText,
  fechaEsperada: z.string().trim().refine(v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Fecha inválida (AAAA-MM-DD)').nullish(),
  items: z.array(z.object({ productId: idField, cantidadSolicitada: quantityField, precioUnitario: moneyField.optional() })).min(1),
});
const receiptSchema = z.object({
  purchaseOrderId: idField, facturaProveedor: optionalText, notas: optionalText,
  items: z.array(z.object({ productId: idField, cantidadRecibida: quantityField, costoUnitario: moneyField.optional() })).min(1),
});

function uniqueProducts(items: { productId: string }[]) {
  if (new Set(items.map(it => it.productId)).size !== items.length) {
    throw operationError('Indique cada producto en una sola línea');
  }
}

export async function createPurchaseOrder(prisma: PrismaClient, body: unknown, userId: string) {
  const input = parseOperation(orderSchema, body);
  uniqueProducts(input.items);
  return prisma.$transaction(async tx => {
    const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
    const warehouse = await tx.warehouse.findUnique({ where: { id: input.warehouseId } });
    if (!supplier?.activo || !warehouse?.activo) throw operationError('Proveedor o bodega no disponible');
    let subtotal = new Prisma.Decimal(0);
    let impuesto = new Prisma.Decimal(0);
    const details = [];
    for (const item of input.items) {
      const product = await tx.product.findUnique({ where: { id: item.productId } });
      if (!product?.activo || product.esServicio) throw operationError('Producto no disponible para recepción de mercadería');
      const price = item.precioUnitario ?? product.costo;
      checkMoneyRange(price);
      if (product.impuesto.lt(0)) throw operationError('Impuesto de producto inválido');
      const base = roundMoney(item.cantidadSolicitada.mul(price));
      const tax = roundMoney(base.mul(product.impuesto).div(100));
      checkMoneyRange(base.plus(tax));
      subtotal = subtotal.plus(base);
      impuesto = impuesto.plus(tax);
      details.push({ productId: item.productId, cantidadSolicitada: item.cantidadSolicitada, precioUnitario: price, total: base.plus(tax) });
    }
    const total = subtotal.plus(impuesto);
    checkMoneyRange(total);
    return tx.purchaseOrder.create({ data: {
      consecutivo: await nextConsecutive(tx, 'OC'), supplierId: input.supplierId, warehouseId: input.warehouseId,
      usuarioId: userId, fechaEsperada: input.fechaEsperada ? new Date(input.fechaEsperada) : null,
      estado: 'APROBADA', subtotal, impuesto, total, notas: input.notas, details: { create: details },
    }, include: { supplier: true, warehouse: true, details: { include: { product: true } } } });
  });
}

export async function receivePurchase(prisma: PrismaClient, body: unknown, userId: string) {
  const input = parseOperation(receiptSchema, body);
  uniqueProducts(input.items);
  return prisma.$transaction(async tx => {
    await lockOperation(tx, `compra:${input.purchaseOrderId}`);
    const order = await tx.purchaseOrder.findUnique({ where: { id: input.purchaseOrderId }, include: { details: true, warehouse: true } });
    if (!order) throw operationError('Orden de compra no encontrada', 404);
    if (!['APROBADA', 'RECIBIDA_PARCIAL'].includes(order.estado)) throw operationError('La orden no admite recepciones', 409);
    if (!order.warehouse.activo) throw operationError('La bodega no está disponible');
    // Las órdenes antiguas con productos repetidos son ambiguas: no se asignan
    // silenciosamente todas las unidades a la primera línea.
    uniqueProducts(order.details);
    const details = [];
    for (const item of input.items) {
      const detail = order.details.find(d => d.productId === item.productId);
      if (!detail) throw operationError('El producto no pertenece a la orden');
      if (detail.cantidadRecibida.plus(item.cantidadRecibida).gt(detail.cantidadSolicitada)) {
        throw operationError('La cantidad recibida supera el saldo pendiente de la orden');
      }
      const product = await tx.product.findUnique({ where: { id: item.productId } });
      if (!product?.activo || product.esServicio) throw operationError('Producto no disponible para recepción');
      const cost = item.costoUnitario ?? detail.precioUnitario;
      checkMoneyRange(cost);
      details.push({ productId: item.productId, cantidadRecibida: item.cantidadRecibida, costoUnitario: cost });
    }
    const receipt = await tx.purchaseReceipt.create({ data: {
      consecutivo: await nextConsecutive(tx, 'REC'), purchaseOrderId: order.id, warehouseId: order.warehouseId,
      usuarioId: userId, facturaProveedor: input.facturaProveedor, notas: input.notas, details: { create: details },
    }, include: { details: true } });
    for (const item of details) {
      const balances = await changeStock(tx, order.warehouseId, item.productId, item.cantidadRecibida);
      await tx.inventoryMovement.create({ data: {
        warehouseId: order.warehouseId, productId: item.productId, tipo: 'ENTRADA_COMPRA', cantidad: item.cantidadRecibida,
        ...balances, costoUnitario: item.costoUnitario, documentoReferencia: `${order.consecutivo} / ${receipt.consecutivo}`,
        motivo: `Recepción de compra (#${receipt.consecutivo}) - Factura: ${input.facturaProveedor || 'N/A'}`, usuarioId: userId,
      } });
      await tx.purchaseOrderDetail.update({ where: { id: order.details.find(d => d.productId === item.productId)!.id },
        data: { cantidadRecibida: { increment: item.cantidadRecibida } } });
    }
    const updated = await tx.purchaseOrderDetail.findMany({ where: { purchaseOrderId: order.id } });
    await tx.purchaseOrder.update({ where: { id: order.id }, data: {
      estado: updated.every(d => d.cantidadRecibida.eq(d.cantidadSolicitada)) ? 'RECIBIDA_TOTAL' : 'RECIBIDA_PARCIAL',
    } });
    return { receipt, order };
  });
}
