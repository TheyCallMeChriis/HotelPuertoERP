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

test('precio arbitrario y descuentos no autorizados rechazan la venta', async () => {
  const f = await fixture();
  await assert.rejects(createSale(prisma, { ...f.body, items: [{ productId: f.product.id, cantidad: 1, precioUnitario: 1 }], pagos: [{ paymentMethodId: f.cash.id, monto: 1 }] }, operator()), e => e.statusCode === 409);
  await assert.rejects(createSale(prisma, { ...f.body, items: [{ productId: f.product.id, cantidad: 1, descuento: 1 }] }, operator()), e => e.statusCode === 403);
  await noSale(f);
  assert.equal(await stock(f), '10');
});

test('venta con precio de catálogo y descuento autorizado conserva importes', async () => {
  const f = await fixture();
  const result = await createSale(prisma, { ...f.body, items: [{ productId: f.product.id, cantidad: 1, descuento: 5 }], pagos: [{ paymentMethodId: f.cash.id, monto: 95 }] }, { ...operator(), permisos: ['VENTAS:DESCUENTO'] });
  assert.equal(result.sale.total.toString(), '95');
  assert.equal(result.sale.details[0].precioUnitario.toString(), '100');
  assert.equal(await stock(f), '9');
});

test('líneas repetidas insuficientes revierten venta, pagos y Kardex en PostgreSQL', async () => {
  const f = await fixture(5);
  await assert.rejects(createSale(prisma, { ...f.body, items: [{ productId: f.product.id, cantidad: 4 }, { productId: f.product.id, cantidad: 4 }], pagos: [{ paymentMethodId: f.cash.id, monto: 800 }] }, operator()), invalid);
  await noSale(f);
  assert.equal(await prisma.salePayment.count({ where: { sale: { pointOfSaleId: f.pos.id } } }), 0);
  assert.equal(await stock(f), '5');
});

test('líneas repetidas con saldo suficiente generan saldos secuenciales', async () => {
  const f = await fixture(5);
  await createSale(prisma, { ...f.body, items: [{ productId: f.product.id, cantidad: 2 }, { productId: f.product.id, cantidad: 3 }], pagos: [{ paymentMethodId: f.cash.id, monto: 500 }] }, operator());
  assert.equal(await stock(f), '0');
  const movements = await prisma.inventoryMovement.findMany({ where: { productId: f.product.id } });
  assert.equal(movements.length, 2);
  for (const m of movements) assert.ok(m.saldoAnterior.minus(m.cantidad).eq(m.saldoNuevo));
});

test('pago mixto 60 efectivo y 40 habitación solo carga 40 al PMS', async () => {
  const f = await fixture();
  const method = await prisma.paymentMethod.upsert({ where: { codigo: 'CARGO_HABITACION' }, update: {}, create: { codigo: 'CARGO_HABITACION', nombre: 'Habitación' } });
  const room = await prisma.room.create({ data: { numero: randomUUID(), tipo: 'ESTANDAR', estado: 'OCUPADA' } });
  const guest = await prisma.guest.create({ data: { identificacion: randomUUID(), nombreCompleto: 'Prueba', habitacionId: room.id } });
  const body = { ...f.body, pagos: [{ paymentMethodId: f.cash.id, monto: 60 }, { paymentMethodId: method.id, monto: 40 }], cargoHabitacion: { roomId: room.id, guestId: guest.id } };
  const result = await createSale(prisma, body, operator());
  assert.equal((await prisma.roomCharge.findUnique({ where: { saleId: result.sale.id } })).monto.toString(), '40');
  const other = await prisma.room.create({ data: { numero: randomUUID(), tipo: 'ESTANDAR', estado: 'OCUPADA' } });
  await assert.rejects(createSale(prisma, { ...body, cargoHabitacion: { roomId: other.id, guestId: guest.id } }, operator()), invalid);
  await prisma.room.update({ where: { id: room.id }, data: { estado: 'DISPONIBLE' } });
  await assert.rejects(createSale(prisma, body, operator()), invalid);
});

test('pagos exigen centavos exactos y formas activas', async () => {
  const f = await fixture();
  for (const value of [99.96, 100.01, 100.001, 0, -100, false]) {
    await assert.rejects(createSale(prisma, { ...f.body, pagos: [{ paymentMethodId: f.cash.id, monto: value }] }, operator()), invalid);
  }
  const inactive = await prisma.paymentMethod.create({ data: { codigo: randomUUID(), nombre: 'Inactivo', activo: false } });
  await assert.rejects(createSale(prisma, { ...f.body, pagos: [{ paymentMethodId: inactive.id, monto: 100 }] }, operator()), invalid);
  await noSale(f);
});

test('venta redondea impuestos por línea y conserva el total pagado', async () => {
  const f = await fixture(10, 0.29, 13);
  const sale = await createSale(prisma, { ...f.body, items: [{ productId: f.product.id, cantidad: 3 }], pagos: [{ paymentMethodId: f.cash.id, monto: 0.98 }] }, operator());
  assert.equal(sale.sale.subtotal.toString(), '0.87');
  assert.equal(sale.sale.impuesto.toString(), '0.11');
  assert.equal(sale.sale.total.toString(), '0.98');
});

test('ajuste negativo excesivo se revierte; ajuste válido cuadra exactamente', async () => {
  const f = await fixture(5);
  const body = { warehouseId: f.warehouse.id, tipo: 'NEGATIVO', motivo: 'Prueba', items: [{ productId: f.product.id, cantidad: 10 }] };
  await assert.rejects(realizarAjuste({ body, user: operator() }, res()), invalid);
  assert.equal(await stock(f), '5');
  assert.equal(await prisma.inventoryAdjustment.count({ where: { warehouseId: f.warehouse.id } }), 0);
  assert.equal(await prisma.inventoryMovement.count({ where: { productId: f.product.id } }), 0);
  await realizarAjuste({ body: { ...body, items: [{ productId: f.product.id, cantidad: 1.125 }] }, user: operator() }, res());
  assert.equal(await stock(f), '3.875');
  const m = await prisma.inventoryMovement.findFirst({ where: { productId: f.product.id } });
  assert.ok(m.saldoAnterior.minus(m.cantidad).eq(m.saldoNuevo));
});

test('tipos y cantidades inválidos de inventario se rechazan antes de escribir', async () => {
  const f = await fixture();
  for (const value of [0, -1, 'abc', false, 0.0001]) {
    await assert.rejects(realizarTraslado({ body: { warehouseOrigenId: f.warehouse.id, warehouseDestinoId: f.destination.id, items: [{ productId: f.product.id, cantidad: value }] }, user: operator() }, res()), invalid);
  }
  await assert.rejects(realizarAjuste({ body: { warehouseId: f.warehouse.id, tipo: 'OTRO', motivo: 'Prueba', items: [{ productId: f.product.id, cantidad: 1 }] }, user: operator() }, res()), invalid);
  assert.equal(await stock(f), '10');
});

test('traslado repetido insuficiente revierte ambas bodegas y documento', async () => {
  const f = await fixture(5);
  const body = { warehouseOrigenId: f.warehouse.id, warehouseDestinoId: f.destination.id, items: [{ productId: f.product.id, cantidad: 4 }, { productId: f.product.id, cantidad: 4 }] };
  await assert.rejects(realizarTraslado({ body, user: operator() }, res()), invalid);
  assert.equal(await stock(f), '5');
  assert.equal(await stock(f, f.destination.id), '0');
  assert.equal(await prisma.warehouseTransfer.count({ where: { warehouseOrigenId: f.warehouse.id } }), 0);
  assert.equal(await prisma.inventoryMovement.count({ where: { productId: f.product.id } }), 0);
  await realizarTraslado({ body: { ...body, items: [{ productId: f.product.id, cantidad: 2 }] }, user: operator() }, res());
  assert.equal(await stock(f), '3');
  assert.equal(await stock(f, f.destination.id), '2');
});

test('ruta manual exige permiso de ajuste y conserva saldos de entrada/salida', async () => {
  const f = await fixture(5);
  const body = { warehouseId: f.warehouse.id, productId: f.product.id, tipo: 'AJUSTE_NEGATIVO', cantidad: 1, motivo: 'Prueba' };
  await assert.rejects(registrarMovimientoManual({ body, user: operator() }, res()), e => e.statusCode === 403);
  await registrarMovimientoManual({ body, user: { ...operator(), permisos: ['INVENTARIO:AJUSTE'] } }, res());
  await registrarMovimientoManual({ body: { ...body, tipo: 'ENTRADA_COMPRA', cantidad: 0.125 }, user: operator() }, res());
  assert.equal(await stock(f), '4.125');
});

test('dos descuentos concurrentes del mismo stock no crean negativos', async () => {
  const f = await fixture(5);
  const changes = await Promise.allSettled([1, 2].map(() => prisma.$transaction(tx => changeStock(tx, f.warehouse.id, f.product.id, new Prisma.Decimal(-4)))));
  assert.equal(changes.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(changes.filter(r => r.status === 'rejected').length, 1);
  assert.equal(await stock(f), '1');
});
