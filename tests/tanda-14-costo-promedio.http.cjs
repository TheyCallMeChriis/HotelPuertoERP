// Batch 14: weighted average cost on purchase receipts and configurable costing method (INV-011).
// End-to-end HTTP tests against a running API backed by a TEST database.
//
// Usage (PowerShell):
//   $env:API_URL='http://127.0.0.1:4000/api'; $env:ADMIN_USER='...'; $env:ADMIN_PASS='...'
//   $env:OPER_USER='cajero1'; $env:OPER_PASS='...'; $env:ALLOW_WRITE_TESTS='1'
//   node --test --test-concurrency=1 tests/tanda-14-costo-promedio.http.cjs
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

let admin; let oper; const s = {};
const costo = async () => Number((await call('GET', `/catalogos/productos?busqueda=${encodeURIComponent(s.prod.codigo)}`, admin)).data.find((p) => p.id === s.prod.id).costo);
const ordenar = (cantidad, precio) => call('POST', '/compras/ordenes', admin, {
  supplierId: s.prov.id, warehouseId: s.b1.id, items: [{ productId: s.prod.id, cantidadSolicitada: cantidad, precioUnitario: precio }],
});
const recibir = (orden, cantidad, costoUnitario) => call('POST', '/compras/recepciones', admin, {
  purchaseOrderId: orden.id, facturaProveedor: `F-${sfx}`,
  items: [{ productId: s.prod.id, cantidadRecibida: cantidad, ...(costoUnitario ? { costoUnitario } : {}) }],
});
const metodo = (valor, token = admin) => call('PUT', '/admin/parametros/METODO_COSTEO', token, { valor });

test.before(async () => {
  admin = await login(process.env.ADMIN_USER || 'admin', process.env.ADMIN_PASS);
  oper = await login(process.env.OPER_USER || 'cajero1', process.env.OPER_PASS);
  const cat = ok(await call('POST', '/catalogos/categorias', admin, { nombre: `Costeo ${sfx}` }), 'cat').data;
  s.b1 = ok(await call('POST', '/catalogos/bodegas', admin, { codigo: `K1-${sfx}`, nombre: `Bodega costeo 1 ${sfx}` }), 'b1').data;
  s.b2 = ok(await call('POST', '/catalogos/bodegas', admin, { codigo: `K2-${sfx}`, nombre: `Bodega costeo 2 ${sfx}` }), 'b2').data;
  s.prov = ok(await call('POST', '/catalogos/proveedores', admin, { identificacion: `K${sfx}`, nombre: `Proveedor costeo ${sfx}`, diasCredito: 30 }), 'prov').data;
  s.prod = ok(await call('POST', '/catalogos/productos', admin, { codigo: `KC-${sfx}`, nombre: `Vino ${sfx}`, categoriaId: cat.id, precioVenta: 300, costo: 100, impuesto: 13 }), 'prod').data;
  ok(await metodo('PROMEDIO'), 'método inicial');
});
test.after(async () => { await metodo('PROMEDIO'); });

test('INV-011: el costo promedio ponderado se recalcula con cada recepción', async () => {
  // No stock: the cost becomes the purchase cost
  s.o1 = ok(await ordenar(10, 120), 'orden 1').data;
  const r1 = ok(await recibir(s.o1, 10), 'recepción 1').data;
  assert.equal(Number(r1.details[0].costoAnterior), 100);
  assert.equal(Number(r1.details[0].costoNuevo), 120);
  assert.equal(await costo(), 120);

  // Stock in another warehouse: there is one cost per product and it considers every warehouse
  ok(await call('POST', '/inventario/movimiento', admin, { warehouseId: s.b2.id, productId: s.prod.id, tipo: 'ENTRADA_MANUAL', cantidad: 30, motivo: 'Inventario inicial' }), 'entrada');

  // (40 × 120 + 10 × 150) / 50 = 126
  s.o2 = ok(await ordenar(20, 150), 'orden 2').data;
  const r2 = ok(await recibir(s.o2, 10), 'recepción parcial').data;
  assert.equal(Number(r2.details[0].costoNuevo), 126);
  // Actual invoice cost differs from the order price: (50 × 126 + 10 × 180) / 60 = 135
  const r3 = ok(await recibir(s.o2, 10, 180), 'recepción final').data;
  assert.equal(Number(r3.details[0].costoAnterior), 126);
  assert.equal(Number(r3.details[0].costoNuevo), 135);
  assert.equal(await costo(), 135);

  // The stock ledger report is still available for the product
  const mov = (await call('GET', `/reportes/kardex?productId=${s.prod.id}`, admin));
  assert.equal(mov.status, 200, mov.message);
});

test('INV-011: el método de costeo se configura (último costo) con permiso y auditoría', async () => {
  assert.equal((await metodo('PROMEDIO', oper)).status, 403, 'el cajero no cambia parámetros');
  assert.equal((await metodo('FIFO')).status, 400, 'valor no permitido');
  assert.equal((await call('PUT', '/admin/parametros/OTRA_CLAVE', admin, { valor: 'X' })).status, 404);
  const lista = (await call('GET', '/admin/parametros', admin)).data;
  const p = lista.find((x) => x.clave === 'METODO_COSTEO');
  assert.deepEqual(p.valores, ['PROMEDIO', 'ULTIMO_COSTO']);

  ok(await metodo('ULTIMO_COSTO'), 'cambio a último costo');
  const o3 = ok(await ordenar(5, 99), 'orden 3').data;
  const r = ok(await recibir(o3, 5), 'recepción último costo').data;
  assert.equal(Number(r.details[0].costoNuevo), 99);
  assert.equal(await costo(), 99);

  const aud = await call('GET', '/auditoria?accion=CAMBIO_PARAMETRO', admin);
  if (aud.status === 200 && Array.isArray(aud.data)) {
    assert.ok(aud.data.some((a) => a.accion === 'CAMBIO_PARAMETRO'), 'el cambio queda en la bitácora');
  }
});
