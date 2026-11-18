// Batch 15: credit notes (FAC-005) and receipt reprints (FAC-006).
// End-to-end HTTP tests against a running API backed by a TEST database.
//
// Usage (PowerShell):
//   $env:API_URL='http://127.0.0.1:4000/api'; $env:ADMIN_USER='...'; $env:ADMIN_PASS='...'
//   $env:OPER_USER='cajero1'; $env:OPER_PASS='...'; $env:ALLOW_WRITE_TESTS='1'
//   node --test --test-concurrency=1 tests/tanda-15-notas-credito.http.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, randomInt } = require('node:crypto');

const API = process.env.API_URL || 'http://127.0.0.1:4000/api';
if (process.env.ALLOW_WRITE_TESTS !== '1') throw new Error('Defina ALLOW_WRITE_TESTS=1 y use una base de prueba: estas pruebas crean registros.');
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(API)) throw new Error('API_URL debe apuntar a 127.0.0.1 o localhost.');
const sfx = randomBytes(3).toString('hex').toUpperCase();
const cedula = () => `${randomInt(1, 10)}${Array.from({ length: 8 }, () => randomInt(10)).join('')}`;

async function call(method, path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
}
const ok = (r, msg) => { assert.ok(r.status < 300, `${msg}: ${r.status} ${r.message}`); return r; };
async function login(u, p) {
  const r = await call('POST', '/auth/login', null, { username: u, password: p });
  assert.equal(r.status, 200, `${u}: ${r.message}`);
  return r.data.token;
}

let admin; let oper; const s = {};
const nc = (venta, body, token = admin) => call('POST', `/ventas/${venta.id}/nota-credito`, token, body);
const linea = (venta) => venta.details.find((d) => d.productId === s.prod.id);
const saldoProducto = async () => {
  const k = await call('GET', `/reportes/kardex?productId=${s.prod.id}&warehouseId=${s.bodega.id}`, admin);
  return k.data.at(-1).saldo;
};

test.before(async () => {
  admin = await login(process.env.ADMIN_USER || 'admin', process.env.ADMIN_PASS);
  oper = await login(process.env.OPER_USER || 'cajero1', process.env.OPER_PASS);
  const cat = ok(await call('POST', '/catalogos/categorias', admin, { nombre: `NC ${sfx}` }), 'cat').data;
  s.bodega = ok(await call('POST', '/catalogos/bodegas', admin, { codigo: `NB-${sfx}`, nombre: `Bodega NC ${sfx}` }), 'bodega').data;
  s.caja = ok(await call('POST', '/catalogos/cajas', admin, { codigo: `NJ-${sfx}`, nombre: `Caja NC ${sfx}` }), 'caja').data;
  await call('POST', '/catalogos/departamentos', admin, { codigo: `ND_${sfx}`, nombre: 'Depto NC' });
  s.pos = ok(await call('POST', '/catalogos/puntos-venta', admin, { codigo: `NP-${sfx}`, nombre: `POS NC ${sfx}`, departamento: `ND_${sfx}`, cajaId: s.caja.id, bodegaDefectoId: s.bodega.id }), 'pos').data;
  s.prod = ok(await call('POST', '/catalogos/productos', admin, { codigo: `NC-${sfx}`, nombre: `Camiseta ${sfx}`, categoriaId: cat.id, precioVenta: 1000, costo: 400, impuesto: 13 }), 'prod').data;
  ok(await call('POST', '/inventario/movimiento', admin, { warehouseId: s.bodega.id, productId: s.prod.id, tipo: 'ENTRADA_MANUAL', cantidad: 100, motivo: 'Stock NC' }), 'stock');
  s.cliente = ok(await call('POST', '/catalogos/clientes', admin, {
    tipoIdentificacion: 'CEDULA_FISICA', identificacion: cedula(), nombre: `Cliente NC ${sfx}`, creditoActivo: true, limiteCredito: 50000, diasCredito: 30,
  }), 'cliente').data;
  for (const f of (await call('GET', '/catalogos/formas-pago', admin)).data) s[f.codigo] = f;
  s.t1 = ok(await call('POST', '/caja/apertura', admin, { cajaId: s.caja.id, montoInicial: 10000 }), 'apertura').data;
  s.v1 = ok(await call('POST', '/ventas', admin, {
    pointOfSaleId: s.pos.id, items: [{ productId: s.prod.id, cantidad: 5 }], pagos: [{ paymentMethodId: s.EFECTIVO.id, monto: 5650 }],
  }), 'venta efectivo').data;
});

test('FAC-005: nota de crédito parcial autorizada, con reintegro de efectivo e inventario', async () => {
  const det = linea(s.v1);
  assert.equal((await nc(s.v1, { motivo: 'Talla equivocada', items: [{ saleDetailId: det.id, cantidad: 2 }], paymentMethodId: s.EFECTIVO.id, cashShiftId: s.t1.id }, oper)).status, 403, 'el cajero no emite notas de crédito');
  assert.equal((await nc(s.v1, { motivo: 'x', total: true, paymentMethodId: s.EFECTIVO.id, cashShiftId: s.t1.id })).status, 400, 'motivo obligatorio');
  assert.equal((await nc(s.v1, { motivo: 'Talla equivocada', items: [{ saleDetailId: det.id, cantidad: 2 }], paymentMethodId: s.EFECTIVO.id })).status, 400, 'efectivo sin turno');
  assert.equal((await nc(s.v1, { motivo: 'Talla equivocada', items: [{ saleDetailId: det.id, cantidad: 2 }], paymentMethodId: s.TARJETA.id })).status, 400, 'forma de pago no usada en la venta');

  const antes = await saldoProducto();
  const r = await nc(s.v1, { motivo: 'Talla equivocada', items: [{ saleDetailId: det.id, cantidad: 2 }], paymentMethodId: s.EFECTIVO.id, cashShiftId: s.t1.id });
  assert.equal(r.status, 201, r.message);
  assert.match(r.data.consecutivo, /^NC-\d{6}$/);
  assert.equal(r.data.tipo, 'PARCIAL');
  assert.equal(Number(r.data.total), 2260);
  assert.equal(Number(r.data.impuesto), 260);
  assert.equal(r.data.sale.consecutivo, s.v1.consecutivo, 'vinculada a la venta original');
  assert.equal(await saldoProducto(), antes + 2, 'el inventario se reintegra');
  s.nc1 = r.data;

  assert.equal((await nc(s.v1, { motivo: 'Exceso de devolución', items: [{ saleDetailId: det.id, cantidad: 4 }], paymentMethodId: s.EFECTIVO.id, cashShiftId: s.t1.id })).status, 400, 'solo quedan 3');
  assert.equal((await call('POST', `/ventas/${s.v1.id}/anular`, admin, { motivo: 'Prueba' })).status, 409, 'no se anula una venta con nota de crédito');

  const venta = (await call('GET', `/ventas/${s.v1.id}`, admin)).data;
  assert.equal(venta.estado, 'COMPLETADA', 'la venta original no se modifica');
  assert.equal(venta.notasCredito.length, 1);

  // Float 10000 + sale 5650 − refund 2260
  const cierre = await call('POST', '/caja/cierre', admin, { cashShiftId: s.t1.id, montoContado: 13390 });
  assert.equal(cierre.status, 200, cierre.message);
  assert.equal(cierre.data.resumen.tipoDiferencia, 'CUADRADA');
});

test('FAC-005: devolución total de una venta de un turno ya cerrado', async () => {
  const datos = { motivo: 'Cliente devuelve el resto', total: true, paymentMethodId: s.EFECTIVO.id, cashShiftId: s.t1.id };
  assert.equal((await nc(s.v1, datos)).status, 409, 'el efectivo no puede salir de un turno cerrado');
  s.t2 = ok(await call('POST', '/caja/apertura', admin, { cajaId: s.caja.id, montoInicial: 10000 }), 'apertura 2').data;
  const r = await nc(s.v1, { ...datos, cashShiftId: s.t2.id });
  assert.equal(r.status, 201, r.message);
  assert.equal(r.data.tipo, 'TOTAL');
  assert.equal(Number(r.data.total), 3390, 'remanente exacto: 5650 − 2260');
  assert.equal((await nc(s.v1, { ...datos, cashShiftId: s.t2.id })).status, 409, 'ya devuelta en su totalidad');
  const t2 = (await call('GET', `/caja/turno-activo?cajaId=${s.caja.id}`, admin)).data;
  assert.equal(t2.movements.filter((m) => m.tipo === 'SALIDA_EXTRAORDINARIA').reduce((t, m) => t + Number(m.monto), 0), 3390);
});

test('FAC-005: el reintegro a crédito rebaja el saldo del cliente', async () => {
  const v2 = ok(await call('POST', '/ventas', admin, {
    pointOfSaleId: s.pos.id, customerId: s.cliente.id, items: [{ productId: s.prod.id, cantidad: 10 }], pagos: [{ paymentMethodId: s.CREDITO.id, monto: 11300 }],
  }), 'venta crédito').data;
  ok(await call('POST', '/cxc/abonos', admin, { customerId: s.cliente.id, paymentMethodId: s.SINPE_MOVIL.id, monto: 5000 }), 'abono');
  const det = linea(v2);
  const exceso = await nc(v2, { motivo: 'Devolución completa', total: true, paymentMethodId: s.CREDITO.id });
  assert.equal(exceso.status, 400, 'a crédito no se devuelve más que el saldo pendiente (6300)');
  const r = await nc(v2, { motivo: 'Devolución parcial', items: [{ saleDetailId: det.id, cantidad: 5 }], paymentMethodId: s.CREDITO.id });
  assert.equal(r.status, 201, r.message);
  const e = (await call('GET', `/cxc/clientes/${s.cliente.id}/estado-cuenta`, admin)).data;
  const doc = e.documentos.find((d) => d.consecutivo === v2.consecutivo);
  assert.equal(doc.notasCredito, 5650);
  assert.equal(doc.saldo, 650, '11300 − 5000 abonado − 5650 devuelto');
});

test('FAC-006: la reimpresión no duplica la transacción y se marca como copia', async () => {
  const r1 = await call('POST', `/ventas/${s.v1.id}/reimpresion`, oper);
  assert.equal(r1.status, 200, r1.message);
  assert.equal(r1.data.copia, 1);
  assert.equal(r1.data.consecutivo, s.v1.consecutivo);
  assert.equal(r1.data.notasCredito.length, 2, 'la copia muestra las notas de crédito aplicadas');
  assert.equal((await call('POST', `/ventas/${s.v1.id}/reimpresion`, oper)).data.copia, 2);
  const n = await call('POST', `/ventas/notas-credito/${s.nc1.id}/reimpresion`, oper);
  assert.equal(n.data.copia, 1);
  assert.equal(n.data.consecutivo, s.nc1.consecutivo);

  const rep = (await call('GET', `/reportes/ventas?pointOfSaleId=${s.pos.id}`, admin)).data.resumen;
  assert.equal(rep.totalVentas, 2, 'reimprimir no crea ventas');
  assert.equal(rep.totalNotasCredito, 2260 + 3390 + 5650);
  assert.equal(rep.ventaNeta, rep.totalRecaudado - 11300);
  const lista = (await call('GET', `/ventas/notas-credito?saleId=${s.v1.id}`, admin)).data;
  assert.equal(lista.length, 2);
});
