// Run only against the temporary test server; it never uses the hotel database URL.
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

const { cancelSale } = require('../backend/src/modules/ventas/cancel-sale.ts');
const { createCliente } = require('../backend/src/modules/catalogos/catalogos.controller.ts');
const admin = () => ({ ...operator(), roles: ['ADMINISTRADOR'] });
async function creditCustomer(limit = 150) {
  return prisma.customer.create({ data: { identificacion: randomUUID(), nombre: 'Cliente prueba', creditoActivo: true, limiteCredito: limit, diasCredito: 30 } });
}
async function creditBody(f, customerId, amount = 100) {
  const method = await prisma.paymentMethod.upsert({ where: { codigo: 'CREDITO' }, update: {}, create: { codigo: 'CREDITO', nombre: 'Crédito' } });
  return { ...f.body, customerId, pagos: [{ paymentMethodId: method.id, monto: amount }, ...(amount < 100 ? [{ paymentMethodId: f.cash.id, monto: 100 - amount }] : [])] };
}

test('venta a crédito rechaza cliente ausente, inactivo, no autorizado o sin plazo', async () => {
  const f = await fixture(); const customer = await creditCustomer();
  const body = await creditBody(f, customer.id);
  await assert.rejects(createSale(prisma, { ...body, customerId: undefined }, operator()), invalid);
  for (const change of [{ activo: false }, { activo: true, creditoActivo: false }, { creditoActivo: true, diasCredito: 0 }, { diasCredito: 30, limiteCredito: 0 }]) {
    await prisma.customer.update({ where: { id: customer.id }, data: change });
    await assert.rejects(createSale(prisma, body, operator()), invalid);
  }
  await noSale(f); assert.equal(await stock(f), '10');
});

test('pago mixto solo consume su parte a crédito y la anulación libera ese cupo', async () => {
  const f = await fixture(); const customer = await creditCustomer(60);
  const body = await creditBody(f, customer.id, 60);
  const { sale } = await createSale(prisma, body, operator());
  await assert.rejects(createSale(prisma, await creditBody(f, customer.id, 1), operator()), invalid);
  await cancelSale(prisma, sale.id, { motivo: 'Prueba' }, admin());
  await createSale(prisma, body, operator());
  assert.equal(await stock(f), '9');
});

test('dos cajas simultáneas no sobrepasan el cupo del mismo cliente', async () => {
  const a = await fixture(); const b = await fixture(); const customer = await creditCustomer(150);
  const results = await Promise.allSettled([
    createSale(prisma, await creditBody(a, customer.id), operator()),
    createSale(prisma, await creditBody(b, customer.id), operator()),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.statusCode, 400);
  const sum = await prisma.salePayment.aggregate({ where: { sale: { customerId: customer.id }, paymentMethod: { codigo: 'CREDITO' } }, _sum: { monto: true } });
  assert.equal(sum._sum.monto.toString(), '100');
});

test('cajero no puede crear un cliente con cupo; administrador sí', async () => {
  const body = { identificacion: String(100000000 + Math.floor(Math.random() * 899999999)), nombre: 'Prueba', creditoActivo: true, limiteCredito: 100, diasCredito: 30 };
  await assert.rejects(createCliente({ body, user: operator() }, res()), e => e.statusCode === 403);
  assert.equal(await prisma.customer.count({ where: { identificacion: body.identificacion } }), 0);
  const response = res(); await createCliente({ body, user: admin() }, response);
  assert.equal(response.code, 201); assert.equal(response.data.data.creditoActivo, true);
});

test('traslados simultáneos generan consecutivos distintos y conservan stock', async () => {
  const f = await fixture();
  const body = { warehouseOrigenId: f.warehouse.id, warehouseDestinoId: f.destination.id, items: [{ productId: f.product.id, cantidad: 1 }] };
  const a = res(); const b = res();
  await Promise.all([realizarTraslado({ body, user: operator() }, a), realizarTraslado({ body, user: operator() }, b)]);
  assert.notEqual(a.data.data.consecutivo, b.data.data.consecutivo);
  assert.equal(await stock(f), '8'); assert.equal(await stock(f, f.destination.id), '2');
});

test('ajustes simultáneos generan consecutivos distintos y acumulan ambos cambios', async () => {
  const f = await fixture();
  const body = { warehouseId: f.warehouse.id, tipo: 'POSITIVO', motivo: 'Prueba', items: [{ productId: f.product.id, cantidad: 1 }] };
  const a = res(); const b = res();
  await Promise.all([realizarAjuste({ body, user: admin() }, a), realizarAjuste({ body, user: admin() }, b)]);
  assert.notEqual(a.data.data.consecutivo, b.data.data.consecutivo);
  assert.equal(await stock(f), '12');
});

