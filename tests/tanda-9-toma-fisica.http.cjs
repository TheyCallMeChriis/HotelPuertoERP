// Batch 9: physical inventory count (INV-007).
// End-to-end HTTP tests against a running API backed by a TEST database.
//
// Usage (PowerShell), same variables as batches 6 to 8:
//   node --test --test-concurrency=1 tests/tanda-9-toma-fisica.http.cjs
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
const existencia = async (t, bodega, codigo) =>
  (await call('GET', `/reportes/existencias?warehouseId=${bodega}`, t)).data.find((f) => f.codigo === codigo)?.existencia ?? 0;

let admin; const s = {};

test.before(async () => {
  admin = await login(process.env.ADMIN_USER || 'admin', process.env.ADMIN_PASS);
  // Dedicated category so the count only includes this test's products
  s.cat = ok(await call('POST', '/catalogos/categorias', admin, { nombre: `Toma ${sfx}` }), 'cat').data;
  s.bodega = ok(await call('POST', '/catalogos/bodegas', admin, { codigo: `TB-${sfx}`, nombre: `Bodega toma ${sfx}` }), 'bodega').data;
  s.a = ok(await call('POST', '/catalogos/productos', admin, { codigo: `TA-${sfx}`, nombre: `Arroz ${sfx}`, categoriaId: s.cat.id, precioVenta: 1500, costo: 1000 }), 'a').data;
  s.b = ok(await call('POST', '/catalogos/productos', admin, { codigo: `TBB-${sfx}`, nombre: `Frijol ${sfx}`, categoriaId: s.cat.id, precioVenta: 1500, costo: 800 }), 'b').data;
  s.c = ok(await call('POST', '/catalogos/productos', admin, { codigo: `TC-${sfx}`, nombre: `Azúcar ${sfx}`, categoriaId: s.cat.id, precioVenta: 1500, costo: 500 }), 'c').data;
  for (const [p, q] of [[s.a, 10], [s.b, 5], [s.c, 8]]) {
    ok(await call('POST', '/inventario/movimiento', admin, { warehouseId: s.bodega.id, productId: p.id, tipo: 'ENTRADA_MANUAL', cantidad: q, motivo: 'Inicial' }), 'entrada');
  }
});

test('iniciar congela la existencia; solo una toma abierta por bodega', async () => {
  const t = await call('POST', '/inventario/tomas', admin, { warehouseId: s.bodega.id, categoriaId: s.cat.id });
  assert.equal(t.status, 201, t.message);
  assert.match(t.data.consecutivo, /^TF-\d{6}$/);
  s.toma = t.data;
  const porCodigo = Object.fromEntries(t.data.lineas.map((l) => [l.codigo, l]));
  assert.equal(porCodigo[`TA-${sfx}`].cantidadSistema, 10);
  assert.equal(porCodigo[`TBB-${sfx}`].cantidadSistema, 5);
  assert.equal(t.data.resumen.pendientes, 3);
  assert.equal((await call('POST', '/inventario/tomas', admin, { warehouseId: s.bodega.id })).status, 409);
});

test('conteos calculan diferencias antes de aplicar, sin tocar existencias', async () => {
  // Rice: 8 (2 missing) · Beans: 7 (2 extra) · Sugar: not counted
  const r = await call('PUT', `/inventario/tomas/${s.toma.id}/conteos`, admin, {
    conteos: [{ productId: s.a.id, cantidadContada: 8 }, { productId: s.b.id, cantidadContada: '7' }],
  });
  assert.equal(r.status, 200, r.message);
  const porCodigo = Object.fromEntries(r.data.lineas.map((l) => [l.codigo, l]));
  assert.equal(porCodigo[`TA-${sfx}`].diferencia, -2);
  assert.equal(porCodigo[`TBB-${sfx}`].diferencia, 2);
  assert.equal(porCodigo[`TC-${sfx}`].diferencia, null);
  assert.equal(r.data.resumen.valorDiferencia, -2 * 1000 + 2 * 800);
  assert.equal(await existencia(admin, s.bodega.id, `TA-${sfx}`), 10, 'contar no modifica la existencia');
  assert.equal((await call('PUT', `/inventario/tomas/${s.toma.id}/conteos`, admin, { conteos: [{ productId: s.a.id, cantidadContada: -1 }] })).status, 400);
});

test('aplicar ajusta solo diferencias, respeta movimientos posteriores y deja Kardex', async () => {
  // Movement made after the count started: it must not be lost
  ok(await call('POST', '/inventario/movimiento', admin, { warehouseId: s.bodega.id, productId: s.a.id, tipo: 'SALIDA_MANUAL', cantidad: 1, motivo: 'Consumo durante la toma' }), 'salida');
  const r = await call('POST', `/inventario/tomas/${s.toma.id}/aplicar`, admin, { motivo: 'Cierre de mes' });
  assert.equal(r.status, 200, r.message);
  assert.equal(r.data.estado, 'APLICADA');
  assert.equal(await existencia(admin, s.bodega.id, `TA-${sfx}`), 7, '10 - 1 (posterior) - 2 (faltante)');
  assert.equal(await existencia(admin, s.bodega.id, `TBB-${sfx}`), 7, '5 + 2 (sobrante)');
  assert.equal(await existencia(admin, s.bodega.id, `TC-${sfx}`), 8, 'no contado: sin cambios');

  const kardex = (await call('GET', `/reportes/kardex?productId=${s.a.id}&warehouseId=${s.bodega.id}`, admin)).data;
  const ajuste = kardex.find((k) => k.documento === s.toma.consecutivo);
  assert.equal(ajuste.tipo, 'AJUSTE_NEGATIVO');
  assert.equal(ajuste.salida, 2);
  assert.match(ajuste.motivo, /Cierre de mes/);

  assert.equal((await call('POST', `/inventario/tomas/${s.toma.id}/aplicar`, admin, {})).status, 409, 'no se aplica dos veces');
  assert.equal((await call('PUT', `/inventario/tomas/${s.toma.id}/conteos`, admin, { conteos: [{ productId: s.c.id, cantidadContada: 1 }] })).status, 409);
  const bit = await call('GET', '/auditoria?accion=TOMA_FISICA_APLICADA', admin);
  assert.ok(bit.data.some((e) => e.entidadId === s.toma.id));
});

test('anular exige motivo y no modifica existencias; aplicar exige INVENTARIO:AJUSTE', async () => {
  const t = ok(await call('POST', '/inventario/tomas', admin, { warehouseId: s.bodega.id, categoriaId: s.cat.id }), 'toma 2').data;
  ok(await call('PUT', `/inventario/tomas/${t.id}/conteos`, admin, { conteos: [{ productId: s.c.id, cantidadContada: 0 }] }), 'conteo');

  const roles = (await call('GET', '/admin/roles', admin)).data;
  const proveeduria = roles.find((x) => x.nombre === 'PROVEEDURIA'); // INVENTARIO:CREAR without AJUSTE
  const username = `toma.${sfx.toLowerCase()}`;
  const password = `Clave-Toma-${sfx}-2026`;
  ok(await call('POST', '/admin/usuarios', admin, { username, nombre: 'Contador', email: `${username}@test.local`, password, roleIds: [proveeduria.id] }), 'usuario');
  const contador = await login(username, password);
  assert.equal((await call('PUT', `/inventario/tomas/${t.id}/conteos`, contador, { conteos: [{ productId: s.c.id, cantidadContada: 1 }] })).status, 200, 'puede contar');
  assert.equal((await call('POST', `/inventario/tomas/${t.id}/aplicar`, contador, {})).status, 403, 'no puede aplicar');

  assert.equal((await call('POST', `/inventario/tomas/${t.id}/anular`, admin, {})).status, 400);
  assert.equal((await call('POST', `/inventario/tomas/${t.id}/anular`, admin, { motivo: 'Conteo repetido' })).status, 200);
  assert.equal(await existencia(admin, s.bodega.id, `TC-${sfx}`), 8);
  const lista = (await call('GET', `/inventario/tomas?warehouseId=${s.bodega.id}`, admin)).data;
  assert.deepEqual(lista.map((x) => x.estado).sort(), ['ANULADA', 'APLICADA']);
});
