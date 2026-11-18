// Batch 8: POS — percentage discount, notes and suspended sales (POS-004, POS-005, POS-006, SEG-004).
// End-to-end HTTP tests against a running API backed by a TEST database.
//
// Usage (PowerShell):
//   $env:API_URL='http://127.0.0.1:4000/api'; $env:ADMIN_USER='...'; $env:ADMIN_PASS='...'
//   $env:OPER_USER='cajero1'; $env:OPER_PASS='...'; $env:ALLOW_WRITE_TESTS='1'
//   node --test --test-concurrency=1 tests/tanda-8-pos.http.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');

const API = process.env.API_URL || 'http://127.0.0.1:4000/api';
if (process.env.ALLOW_WRITE_TESTS !== '1') throw new Error('Defina ALLOW_WRITE_TESTS=1 y use una base de prueba: estas pruebas crean registros.');
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(API)) throw new Error('API_URL debe apuntar a 127.0.0.1 o localhost.');
const sfx = randomBytes(3).toString('hex').toUpperCase();

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
async function stock(token, warehouseId, productId) {
  const r = await call('GET', `/reportes/existencias?warehouseId=${warehouseId}`, token);
  return r.data.find((f) => f.productId === productId || f.codigo === productId)?.existencia;
}

let admin; let oper; const s = {};

test.before(async () => {
  admin = await login(process.env.ADMIN_USER || 'admin', process.env.ADMIN_PASS);
  oper = await login(process.env.OPER_USER || 'cajero1', process.env.OPER_PASS);
  const cat = ok(await call('POST', '/catalogos/categorias', admin, { nombre: `POS ${sfx}` }), 'cat').data;
  s.bodega = ok(await call('POST', '/catalogos/bodegas', admin, { codigo: `PB-${sfx}`, nombre: `Bodega POS ${sfx}` }), 'bodega').data;
  s.caja = ok(await call('POST', '/catalogos/cajas', admin, { codigo: `PC-${sfx}`, nombre: `Caja POS ${sfx}` }), 'caja').data;
  await call('POST', '/catalogos/departamentos', admin, { codigo: `PD_${sfx}`, nombre: 'Depto POS' });
  s.pos = ok(await call('POST', '/catalogos/puntos-venta', admin, { codigo: `PP-${sfx}`, nombre: `POS ${sfx}`, departamento: `PD_${sfx}`, cajaId: s.caja.id, bodegaDefectoId: s.bodega.id }), 'pos').data;
  s.prod = ok(await call('POST', '/catalogos/productos', admin, { codigo: `PX-${sfx}`, nombre: `Plato ${sfx}`, categoriaId: cat.id, precioVenta: 3333.33, costo: 1000, impuesto: 13 }), 'prod').data;
  ok(await call('POST', '/inventario/movimiento', admin, { warehouseId: s.bodega.id, productId: s.prod.id, tipo: 'ENTRADA_MANUAL', cantidad: 20, motivo: 'Stock de prueba' }), 'stock');
  s.efectivo = (await call('GET', '/catalogos/formas-pago', admin)).data.find((f) => f.codigo === 'EFECTIVO');
  s.turno = ok(await call('POST', '/caja/apertura', admin, { cajaId: s.caja.id, montoInicial: 0 }), 'apertura').data;
});

test('descuento por porcentaje calculado en el servidor y auditado (POS-004, SEG-004)', async () => {
  // 3 x 3333.33 = 9999.99; 12.5% = 1249.99875 -> 1250.00; base 8749.99; VAT 13% = 1137.4987 -> 1137.50; total 9887.49
  const venta = await call('POST', '/ventas', admin, {
    pointOfSaleId: s.pos.id,
    items: [{ productId: s.prod.id, cantidad: 3, descuentoPorcentaje: 12.5, notas: 'Sin cebolla' }],
    pagos: [{ paymentMethodId: s.efectivo.id, monto: 9887.49 }],
    notas: 'Mesa 4 - cumpleaños',
  });
  assert.equal(venta.status, 201, venta.message);
  assert.equal(Number(venta.data.descuento), 1250);
  assert.equal(Number(venta.data.total), 9887.49);
  assert.equal(venta.data.details[0].notas, 'Sin cebolla', 'observación por línea guardada (POS-005)');
  assert.equal(venta.data.notas, 'Mesa 4 - cumpleaños', 'observación de la venta guardada (POS-005)');

  const consulta = await call('GET', `/ventas/${venta.data.id}`, admin);
  assert.equal(consulta.data.details[0].notas, 'Sin cebolla', 'visible al consultar o reimprimir');

  const bit = await call('GET', '/auditoria?accion=DESCUENTO_APLICADO', admin);
  const ev = bit.data.find((e) => e.entidadId === venta.data.id);
  assert.ok(ev, 'evento de descuento con autor');
  assert.equal(JSON.parse(ev.detalle).lineas[0].porcentaje, 12.5);

  const fuera = await call('POST', '/ventas', admin, {
    pointOfSaleId: s.pos.id, items: [{ productId: s.prod.id, cantidad: 1, descuentoPorcentaje: 101 }], pagos: [{ paymentMethodId: s.efectivo.id, monto: 1 }],
  });
  assert.equal(fuera.status, 400, 'porcentaje mayor a 100');
});

test('usuario sin VENTAS:DESCUENTO no puede descontar por porcentaje (POS-004)', async () => {
  const r = await call('POST', '/ventas', oper, {
    pointOfSaleId: s.pos.id, items: [{ productId: s.prod.id, cantidad: 1, descuentoPorcentaje: 10 }], pagos: [{ paymentMethodId: s.efectivo.id, monto: 3389.99 }],
  });
  assert.equal(r.status, 403);
});

test('venta suspendida conserva el detalle sin afectar caja ni inventario; se retoma una sola vez (POS-006)', async () => {
  const antesStock = await stock(admin, s.bodega.id, `PX-${sfx}`);
  const antesTurno = (await call('GET', `/caja/turno-activo?cajaId=${s.caja.id}`, admin)).data;
  const antesVentas = antesTurno.ventas.length;

  const sus = await call('POST', '/ventas/suspendidas', oper, {
    pointOfSaleId: s.pos.id, etiqueta: 'Mesa 7', notas: 'Esperan postre',
    items: [{ productId: s.prod.id, cantidad: 2, notas: 'Bien cocido' }],
  });
  assert.equal(sus.status, 201, sus.message);
  assert.equal((await call('POST', '/ventas/suspendidas', oper, { pointOfSaleId: s.pos.id, etiqueta: '', items: [] })).status, 400);

  const lista = (await call('GET', `/ventas/suspendidas?pointOfSaleId=${s.pos.id}`, oper)).data;
  const guardada = lista.find((x) => x.id === sus.data.id);
  assert.equal(guardada.etiqueta, 'Mesa 7');
  assert.equal(guardada.items[0].notas, 'Bien cocido');
  assert.equal(Number(guardada.items[0].cantidad), 2);

  assert.equal(await stock(admin, s.bodega.id, `PX-${sfx}`), antesStock, 'suspender no mueve inventario');
  assert.equal((await call('GET', `/caja/turno-activo?cajaId=${s.caja.id}`, admin)).data.ventas.length, antesVentas, 'suspender no afecta caja');

  // Resume and pay: 2 x 3333.33 = 6666.66 + 866.67 = 7533.33
  const cobro = await call('POST', '/ventas', oper, {
    pointOfSaleId: s.pos.id, suspendedSaleId: sus.data.id,
    items: [{ productId: s.prod.id, cantidad: 2, notas: 'Bien cocido' }], pagos: [{ paymentMethodId: s.efectivo.id, monto: 7533.33 }],
  });
  assert.equal(cobro.status, 201, cobro.message);
  assert.equal(await stock(admin, s.bodega.id, `PX-${sfx}`), antesStock - 2, 'al cobrar sí descuenta inventario');
  const despues = (await call('GET', `/ventas/suspendidas?pointOfSaleId=${s.pos.id}`, oper)).data;
  assert.equal(despues.some((x) => x.id === sus.data.id), false, 'se elimina de suspendidas al cobrar');

  const doble = await call('POST', '/ventas', oper, {
    pointOfSaleId: s.pos.id, suspendedSaleId: sus.data.id,
    items: [{ productId: s.prod.id, cantidad: 2 }], pagos: [{ paymentMethodId: s.efectivo.id, monto: 7533.33 }],
  });
  assert.equal(doble.status, 409, 'no se puede cobrar dos veces la misma suspendida');
  assert.equal(await stock(admin, s.bodega.id, `PX-${sfx}`), antesStock - 2, 'el segundo intento no deja rastro');
});

test('descartar una suspendida queda auditado con motivo; permisos (POS-006, SEG-002)', async () => {
  const sus = ok(await call('POST', '/ventas/suspendidas', oper, { pointOfSaleId: s.pos.id, etiqueta: 'Hab 12', items: [{ productId: s.prod.id, cantidad: 1 }] }), 'susp');
  const del = await call('DELETE', `/ventas/suspendidas/${sus.data.id}`, oper, { motivo: 'Cliente se retiró' });
  assert.equal(del.status, 200, del.message);
  assert.equal((await call('DELETE', `/ventas/suspendidas/${sus.data.id}`, oper, {})).status, 404);
  const bit = await call('GET', '/auditoria?accion=DESCARTAR_VENTA_SUSPENDIDA', admin);
  const ev = bit.data.find((e) => e.entidadId === sus.data.id);
  assert.equal(JSON.parse(ev.detalle).motivo, 'Cliente se retiró');

  const roles = (await call('GET', '/admin/roles', admin)).data;
  const bodega = roles.find((x) => x.nombre === 'BODEGA');
  const username = `pos.${sfx.toLowerCase()}`;
  const password = `Clave-Pos-${sfx}-2026`;
  ok(await call('POST', '/admin/usuarios', admin, { username, nombre: 'Sin ventas', email: `${username}@test.local`, password, roleIds: [bodega.id] }), 'usuario');
  const t = await login(username, password);
  assert.equal((await call('POST', '/ventas/suspendidas', t, { pointOfSaleId: s.pos.id, etiqueta: 'X', items: [{ productId: s.prod.id, cantidad: 1 }] })).status, 403);
  assert.equal((await call('GET', `/ventas/suspendidas?pointOfSaleId=${s.pos.id}`, t)).status, 403);
});
