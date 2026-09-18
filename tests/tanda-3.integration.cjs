// Ejecutar solo contra el servidor temporal de pruebas; nunca usa la URL del hotel.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const url = new URL(process.env.TEST_DATABASE_URL || 'http://invalid');
if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' || url.port !== '55439'
  || url.pathname !== '/pos_erp_tanda2_test') throw Error('TEST_DATABASE_URL debe apuntar a la base temporal pos_erp_tanda2_test en 127.0.0.1:55439');
process.env.DATABASE_URL = url.toString();
require('../backend/node_modules/ts-node').register({ project: path.join(__dirname, '../backend/tsconfig.json'), transpileOnly: true });
const { Prisma } = require('../backend/node_modules/@prisma/client');
const { prisma } = require('../backend/src/utils/prisma.ts');
const { createSale } = require('../backend/src/modules/ventas/create-sale.ts');
const { realizarAjuste, realizarTraslado, registrarMovimientoManual } = require('../backend/src/modules/inventario/inventario.controller.ts');
const { changeStock } = require('../backend/src/utils/stock-change.ts');
let user;
let category;
before(async () => {
  user = await prisma.user.create({ data: { username: randomUUID(), nombre: 'Prueba aislada', email: `${randomUUID()}@test.invalid`, passwordHash: 'test-no-login' } });
  category = await prisma.category.create({ data: { nombre: randomUUID() } });
});
after(() => prisma.$disconnect());
const operator = () => ({ id: user.id, username: user.username, nombre: user.nombre, email: user.email, roles: ['CAJERO'], permisos: ['VENTAS:CREAR'] });
async function fixture(quantity = 10, price = 100, tax = 0) {
  const warehouse = await prisma.warehouse.create({ data: { codigo: randomUUID(), nombre: 'Origen' } });
  const destination = await prisma.warehouse.create({ data: { codigo: randomUUID(), nombre: 'Destino' } });
  const register = await prisma.cashRegister.create({ data: { codigo: randomUUID(), nombre: 'Caja prueba' } });
  const pos = await prisma.pointOfSale.create({ data: { codigo: randomUUID(), nombre: 'POS prueba', departamento: 'PRUEBA', cajaId: register.id, bodegaDefectoId: warehouse.id } });
  await prisma.cashShift.create({ data: { cajaId: register.id, usuarioId: user.id, montoInicial: 0 } });
  const product = await prisma.product.create({ data: { codigo: randomUUID(), nombre: 'Producto prueba', categoriaId: category.id, precioVenta: price, impuesto: tax, costo: 1 } });
  await prisma.stock.create({ data: { warehouseId: warehouse.id, productId: product.id, cantidad: quantity } });
  const cash = await prisma.paymentMethod.upsert({ where: { codigo: 'EFECTIVO' }, update: {}, create: { codigo: 'EFECTIVO', nombre: 'Efectivo' } });
  return { warehouse, destination, product, pos, cash, body: { pointOfSaleId: pos.id, items: [{ productId: product.id, cantidad: 1, precioUnitario: price }], pagos: [{ paymentMethodId: cash.id, monto: price }] } };
}
function res() { return { status(code) { this.code = code; return this; }, json(data) { this.data = data; } }; }
async function stock(f, warehouseId = f.warehouse.id) {
  return (await prisma.stock.findUnique({ where: { warehouseId_productId: { warehouseId, productId: f.product.id } } }))?.cantidad.toString() ?? '0';
}
const invalid = error => error.statusCode === 400;
async function noSale(f) {
  assert.equal(await prisma.sale.count({ where: { pointOfSaleId: f.pos.id } }), 0);
  assert.equal(await prisma.inventoryMovement.count({ where: { productId: f.product.id } }), 0);
}

const { createPurchaseOrder, receivePurchase } = require('../backend/src/modules/compras/purchase-operations.ts');
const { openCash, recordCashMovement, closeCash } = require('../backend/src/modules/caja/cash-operations.ts');
const { cancelSale } = require('../backend/src/modules/ventas/cancel-sale.ts');
const { sendSimulatedCharge, retrySimulatedCharge } = require('../backend/src/modules/pms/pms-operations.ts');
const admin = () => ({ ...operator(), roles: ['ADMINISTRADOR'] });
const conflict = error => error.statusCode === 409;
async function orderFixture(quantity = 5) {
  const f = await fixture();
  const supplier = await prisma.supplier.create({ data: { identificacion: randomUUID(), nombre: 'Proveedor prueba' } });
  const body = { supplierId: supplier.id, warehouseId: f.warehouse.id, items: [{ productId: f.product.id, cantidadSolicitada: quantity, precioUnitario: 0 }] };
  const order = await createPurchaseOrder(prisma, body, user.id);
  return { ...f, supplier, order, orderBody: body, receiptBody: { purchaseOrderId: order.id, items: [{ productId: f.product.id, cantidadRecibida: 2 }] } };
}
async function shiftFor(f) { return prisma.cashShift.findFirstOrThrow({ where: { cajaId: f.pos.cajaId } }); }
async function roomFixture() {
  const room = await prisma.room.create({ data: { numero: randomUUID(), tipo: 'ESTANDAR', estado: 'OCUPADA' } });
  const guest = await prisma.guest.create({ data: { identificacion: randomUUID(), nombreCompleto: 'Prueba PMS', habitacionId: room.id } });
  return { roomId: room.id, guestId: guest.id };
}
function successes(results, count) {
  assert.equal(results.filter(r => r.status === 'fulfilled').length, count);
  for (const r of results.filter(r => r.status === 'rejected')) assert.ok([400, 409].includes(r.reason.statusCode), String(r.reason));
}

test('compras validan cantidades, costos, fechas y duplicados sin documentos parciales', async () => {
  const f = await orderFixture();
  assert.equal(f.order.total.toString(), '0'); // cero explícito no se sustituye por el costo del catálogo
  for (const value of [0, -1, false, 'abc', 1.0001]) {
    await assert.rejects(createPurchaseOrder(prisma, { ...f.orderBody, items: [{ productId: f.product.id, cantidadSolicitada: value }] }, user.id), invalid);
  }
  await assert.rejects(createPurchaseOrder(prisma, { ...f.orderBody, items: [...f.orderBody.items, ...f.orderBody.items] }, user.id), invalid);
  await assert.rejects(createPurchaseOrder(prisma, { ...f.orderBody, fechaEsperada: '2026-02-30' }, user.id), invalid);
  await assert.rejects(createPurchaseOrder(prisma, { ...f.orderBody, items: [{ ...f.orderBody.items[0], precioUnitario: -1 }] }, user.id), invalid);
  await prisma.supplier.update({ where: { id: f.supplier.id }, data: { activo: false } });
  await assert.rejects(createPurchaseOrder(prisma, f.orderBody, user.id), invalid);
  assert.equal(await prisma.purchaseOrder.count({ where: { supplierId: f.supplier.id } }), 1);
});

test('recepción rechaza productos ajenos, excesos, cero y repetidos sin modificar la orden', async () => {
  const f = await orderFixture();
  const other = await fixture();
  for (const items of [
    [{ productId: other.product.id, cantidadRecibida: 1 }],
    [{ productId: f.product.id, cantidadRecibida: 6 }],
    [{ productId: f.product.id, cantidadRecibida: 0 }],
    [...f.receiptBody.items, ...f.receiptBody.items],
    [{ productId: f.product.id, cantidadRecibida: 1, costoUnitario: -1 }],
  ]) await assert.rejects(receivePurchase(prisma, { ...f.receiptBody, items }, user.id), invalid);
  assert.equal(await stock(f), '10');
  assert.equal(await prisma.purchaseReceipt.count({ where: { purchaseOrderId: f.order.id } }), 0);
  assert.equal((await prisma.purchaseOrderDetail.findFirst({ where: { purchaseOrderId: f.order.id } })).cantidadRecibida.toString(), '0');
});

test('recepción parcial y final conserva cantidades fraccionarias y costo cero en documento y Kardex', async () => {
  const f = await orderFixture(2.125);
  const partial = await receivePurchase(prisma, { ...f.receiptBody, items: [{ productId: f.product.id, cantidadRecibida: 1.125 }] }, user.id);
  assert.equal(partial.receipt.details[0].costoUnitario.toString(), '0');
  assert.equal((await prisma.purchaseOrder.findUnique({ where: { id: f.order.id } })).estado, 'RECIBIDA_PARCIAL');
  await receivePurchase(prisma, { ...f.receiptBody, items: [{ productId: f.product.id, cantidadRecibida: 1 }] }, user.id);
  assert.equal((await prisma.purchaseOrder.findUnique({ where: { id: f.order.id } })).estado, 'RECIBIDA_TOTAL');
  assert.equal(await stock(f), '12.125');
  const movements = await prisma.inventoryMovement.findMany({ where: { productId: f.product.id } });
  for (const m of movements) { assert.ok(m.saldoAnterior.plus(m.cantidad).eq(m.saldoNuevo)); assert.equal(m.costoUnitario.toString(), '0'); }
  await assert.rejects(receivePurchase(prisma, f.receiptBody, user.id), conflict);
});

test('dos recepciones simultáneas no exceden el pendiente', async () => {
  const f = await orderFixture(3);
  successes(await Promise.allSettled([receivePurchase(prisma, f.receiptBody, user.id), receivePurchase(prisma, f.receiptBody, user.id)]), 1);
  assert.equal(await stock(f), '12');
  assert.equal(await prisma.purchaseReceipt.count({ where: { purchaseOrderId: f.order.id } }), 1);
  assert.equal((await prisma.purchaseOrderDetail.findFirst({ where: { purchaseOrderId: f.order.id } })).cantidadRecibida.toString(), '2');
});

test('una compra y una venta simultáneas conservan ambas variaciones de stock', async () => {
  const f = await orderFixture(3);
  await Promise.all([receivePurchase(prisma, f.receiptBody, user.id), createSale(prisma, f.body, operator())]);
  assert.equal(await stock(f), '11');
});

test('dos aperturas simultáneas generan un único turno activo', async () => {
  const register = await prisma.cashRegister.create({ data: { codigo: randomUUID(), nombre: 'Caja simultánea' } });
  successes(await Promise.allSettled([1, 2].map(() => openCash(prisma, { cajaId: register.id, montoInicial: 0 }, user.id))), 1);
  assert.equal(await prisma.cashShift.count({ where: { cajaId: register.id, estado: 'ABIERTA' } }), 1);
});

test('caja valida importes y tipos; el cierre usa centavos exactos y no admite reaplicación', async () => {
  const f = await fixture(10, 0.10);
  const shift = await shiftFor(f);
  for (const monto of [-1, false, 0, 1.001]) {
    await assert.rejects(recordCashMovement(prisma, { cashShiftId: shift.id, tipo: 'ENTRADA_EXTRAORDINARIA', monto, motivo: 'Prueba' }, user.id), invalid);
  }
  await assert.rejects(recordCashMovement(prisma, { cashShiftId: shift.id, tipo: 'OTRO', monto: 1, motivo: 'Prueba' }, user.id), invalid);
  await assert.rejects(closeCash(prisma, { cashShiftId: shift.id, montoContado: -1 }), invalid);
  await createSale(prisma, f.body, operator());
  await recordCashMovement(prisma, { cashShiftId: shift.id, tipo: 'ENTRADA_EXTRAORDINARIA', monto: 0.20, motivo: 'Prueba' }, user.id);
  const result = await closeCash(prisma, { cashShiftId: shift.id, montoContado: 0.30 });
  assert.equal(result.resumen.montoEsperado, 0.30);
  assert.equal(result.resumen.diferencia, 0);
  await assert.rejects(closeCash(prisma, { cashShiftId: shift.id, montoContado: 999 }), conflict);
  await assert.rejects(recordCashMovement(prisma, { cashShiftId: shift.id, tipo: 'ENTRADA_EXTRAORDINARIA', monto: 1, motivo: 'Prueba' }, user.id), conflict);
});

test('venta concurrente con cierre queda incluida o se rechaza sin stock ni pagos parciales', async () => {
  const f = await fixture(); const shift = await shiftFor(f);
  const [sale, closed] = await Promise.allSettled([createSale(prisma, f.body, operator()), closeCash(prisma, { cashShiftId: shift.id, montoContado: 0 })]);
  assert.equal(closed.status, 'fulfilled');
  if (sale.status === 'fulfilled') {
    assert.equal(closed.value.resumen.montoEsperado, 100); assert.equal(await stock(f), '9');
  } else {
    assert.equal(sale.reason.statusCode, 400); assert.equal(closed.value.resumen.montoEsperado, 0); assert.equal(await stock(f), '10'); await noSale(f);
  }
});

test('anulación simultánea devuelve una sola vez en la bodega original aunque cambie el POS', async () => {
  const f = await fixture(); const { sale } = await createSale(prisma, f.body, operator());
  await prisma.pointOfSale.update({ where: { id: f.pos.id }, data: { bodegaDefectoId: f.destination.id } });
  await prisma.product.update({ where: { id: f.product.id }, data: { esServicio: true } });
  await assert.rejects(cancelSale(prisma, sale.id, { motivo: 'Prueba' }, operator()), e => e.statusCode === 403);
  await assert.rejects(cancelSale(prisma, sale.id, { motivo: '  ' }, admin()), invalid);
  successes(await Promise.allSettled([1, 2].map(() => cancelSale(prisma, sale.id, { motivo: 'Prueba' }, admin()))), 1);
  assert.equal(await stock(f), '10'); assert.equal(await stock(f, f.destination.id), '0');
  assert.equal(await prisma.inventoryMovement.count({ where: { productId: f.product.id, tipo: 'AJUSTE_POSITIVO' } }), 1);
});

test('anulación de turno cerrado se rechaza sin alterar el arqueo o inventario', async () => {
  const f = await fixture(); const { sale } = await createSale(prisma, f.body, operator()); const shift = await shiftFor(f);
  await closeCash(prisma, { cashShiftId: shift.id, montoContado: 100 });
  await assert.rejects(cancelSale(prisma, sale.id, { motivo: 'Prueba' }, admin()), conflict);
  assert.equal(await stock(f), '9');
  assert.equal((await prisma.sale.findUnique({ where: { id: sale.id } })).estado, 'COMPLETADA');
});

test('PMS valida huésped, monto y venta; UUID concurrente crea un solo cargo y una sola cola', async () => {
  const room = await roomFixture(); const other = await roomFixture();
  const body = { ...room, monto: 40, transaccionUuid: randomUUID(), simularError: true };
  await assert.rejects(sendSimulatedCharge(prisma, { ...body, guestId: other.guestId }), invalid);
  await assert.rejects(sendSimulatedCharge(prisma, { ...body, monto: -1 }), invalid);
  await assert.rejects(sendSimulatedCharge(prisma, { ...body, saleId: 'inexistente' }), e => e.statusCode === 404);
  const results = await Promise.all([sendSimulatedCharge(prisma, body), sendSimulatedCharge(prisma, body)]);
  assert.equal(results[0].charge.id, results[1].charge.id);
  assert.equal(results.filter(r => r.duplicate).length, 1);
  const id = results[0].charge.id;
  assert.equal(await prisma.pMSIntegrationQueue.count({ where: { roomChargeId: id } }), 1);
  await assert.rejects(sendSimulatedCharge(prisma, { ...body, monto: 41 }), conflict);
  await Promise.all([retrySimulatedCharge(prisma, id), retrySimulatedCharge(prisma, id)]);
  assert.equal((await prisma.roomCharge.findUnique({ where: { id } })).reintentos, 1);
  const queue = await prisma.pMSIntegrationQueue.findFirst({ where: { roomChargeId: id } });
  assert.equal(queue.estado, 'PROCESADO'); assert.equal(queue.intentos, 2); assert.equal(queue.ultimoError, null);
});

test('anular venta cancela cargo mixto y cola; reintentar no lo puede reactivar', async () => {
  const f = await fixture(); const room = await roomFixture();
  const method = await prisma.paymentMethod.upsert({ where: { codigo: 'CARGO_HABITACION' }, update: {}, create: { codigo: 'CARGO_HABITACION', nombre: 'Habitación' } });
  const { sale } = await createSale(prisma, { ...f.body, pagos: [{ paymentMethodId: f.cash.id, monto: 60 }, { paymentMethodId: method.id, monto: 40 }], cargoHabitacion: room }, operator());
  const charge = await prisma.roomCharge.findUnique({ where: { saleId: sale.id } });
  assert.equal((await sendSimulatedCharge(prisma, { saleId: sale.id, ...room, monto: 40 })).duplicate, true);
  await assert.rejects(sendSimulatedCharge(prisma, { saleId: sale.id, ...room, monto: 100 }), invalid);
  await prisma.roomCharge.update({ where: { id: charge.id }, data: { estadoPMS: 'ERROR' } });
  await prisma.pMSIntegrationQueue.create({ data: { roomChargeId: charge.id, endpoint: 'test', payload: '{}', estado: 'FALLIDO', intentos: 1 } });
  await cancelSale(prisma, sale.id, { motivo: 'Prueba' }, admin());
  await assert.rejects(retrySimulatedCharge(prisma, charge.id), conflict);
  await assert.rejects(sendSimulatedCharge(prisma, { saleId: sale.id, ...room, monto: 40 }), conflict);
  assert.equal((await prisma.roomCharge.findUnique({ where: { id: charge.id } })).estadoPMS, 'ANULADO');
  assert.equal((await prisma.pMSIntegrationQueue.findFirst({ where: { roomChargeId: charge.id } })).estado, 'CANCELADO');
  assert.equal(await stock(f), '10');
});

test('ventas en cajas distintas reciben consecutivos únicos bajo concurrencia', async () => {
  const a = await fixture(); const b = await fixture();
  const results = await Promise.all([createSale(prisma, a.body, operator()), createSale(prisma, b.body, operator())]);
  assert.notEqual(results[0].consecutivo, results[1].consecutivo);
});

test('órdenes simultáneas reciben consecutivos distintos', async () => {
  const f = await orderFixture();
  const results = await Promise.all([createPurchaseOrder(prisma, f.orderBody, user.id), createPurchaseOrder(prisma, f.orderBody, user.id)]);
  assert.notEqual(results[0].consecutivo, results[1].consecutivo);
});

test('un cargo ya confirmado corrige una cola antigua sin volver a enviarse', async () => {
  const room = await roomFixture();
  const { charge } = await sendSimulatedCharge(prisma, { ...room, monto: 1 });
  await prisma.pMSIntegrationQueue.create({ data: { roomChargeId: charge.id, endpoint: 'test', payload: '{}', estado: 'FALLIDO', intentos: 2, ultimoError: 'Error antiguo' } });
  await retrySimulatedCharge(prisma, charge.id);
  const queue = await prisma.pMSIntegrationQueue.findFirst({ where: { roomChargeId: charge.id } });
  assert.equal(queue.estado, 'PROCESADO'); assert.equal(queue.intentos, 2); assert.equal(queue.ultimoError, null);
  assert.equal((await prisma.roomCharge.findUnique({ where: { id: charge.id } })).reintentos, 0);
});

test('movimiento simultáneo con cierre queda incluido o rechazado íntegramente', async () => {
  const f = await fixture(); const shift = await shiftFor(f);
  const [movement, closed] = await Promise.allSettled([
    recordCashMovement(prisma, { cashShiftId: shift.id, tipo: 'ENTRADA_EXTRAORDINARIA', monto: 10, motivo: 'Prueba' }, user.id),
    closeCash(prisma, { cashShiftId: shift.id, montoContado: 0 }),
  ]);
  assert.equal(closed.status, 'fulfilled');
  assert.equal(closed.value.resumen.montoEsperado, movement.status === 'fulfilled' ? 10 : 0);
  if (movement.status === 'rejected') assert.ok(conflict(movement.reason));
});

test('anulación simultánea con cierre mantiene coherentes arqueo, venta y existencias', async () => {
  const f = await fixture(); const { sale } = await createSale(prisma, f.body, operator()); const shift = await shiftFor(f);
  const [cancelled, closed] = await Promise.allSettled([
    cancelSale(prisma, sale.id, { motivo: 'Prueba' }, admin()), closeCash(prisma, { cashShiftId: shift.id, montoContado: 0 }),
  ]);
  assert.equal(closed.status, 'fulfilled');
  const wasCancelled = cancelled.status === 'fulfilled';
  assert.equal(closed.value.resumen.montoEsperado, wasCancelled ? 0 : 100);
  assert.equal(await stock(f), wasCancelled ? '10' : '9');
  if (!wasCancelled) assert.ok(conflict(cancelled.reason));
});

test('reintento simultáneo con anulación nunca deja confirmado el cargo anulado', async () => {
  const f = await fixture(); const room = await roomFixture();
  const method = await prisma.paymentMethod.findUniqueOrThrow({ where: { codigo: 'CARGO_HABITACION' } });
  const { sale } = await createSale(prisma, { ...f.body, pagos: [{ paymentMethodId: method.id, monto: 100 }], cargoHabitacion: room }, operator());
  const charge = await prisma.roomCharge.update({ where: { saleId: sale.id }, data: { estadoPMS: 'ERROR' } });
  const [retried, cancelled] = await Promise.allSettled([
    retrySimulatedCharge(prisma, charge.id), cancelSale(prisma, sale.id, { motivo: 'Prueba' }, admin()),
  ]);
  assert.equal(cancelled.status, 'fulfilled');
  if (retried.status === 'rejected') assert.ok(conflict(retried.reason));
  assert.equal((await prisma.roomCharge.findUnique({ where: { id: charge.id } })).estadoPMS, 'ANULADO');
});

