// Batch 13: internal purchase requests and role-based approval flow (COM-002, COM-003).
// End-to-end HTTP tests against a running API backed by a TEST database.
//
// Usage (PowerShell):
//   $env:API_URL='http://127.0.0.1:4000/api'; $env:ADMIN_USER='...'; $env:ADMIN_PASS='...'
//   $env:OPER_USER='cajero1'; $env:OPER_PASS='...'; $env:ALLOW_WRITE_TESTS='1'
//   node --test --test-concurrency=1 tests/tanda-13-solicitudes-compra.http.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');

const API = process.env.API_URL || 'http://127.0.0.1:4000/api';
if (process.env.ALLOW_WRITE_TESTS !== '1') throw new Error('Defina ALLOW_WRITE_TESTS=1 y use una base de prueba: estas pruebas crean registros.');
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(API)) throw new Error('API_URL debe apuntar a 127.0.0.1 o localhost.');
const sfx = randomBytes(3).toString('hex').toUpperCase();
const PASS = 'ClaveSegura2026!';

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

let admin; let oper; const s = {}; const t = {};
const usuario = async (nombre, roleIds) => {
  const username = `${nombre}.${sfx.toLowerCase()}`;
  ok(await call('POST', '/admin/usuarios', admin, { username, nombre: `${nombre} ${sfx}`, email: `${username}@test.local`, password: PASS, roleIds }), nombre);
  return login(username, PASS);
};
const solicitar = (token, extra = {}) => call('POST', '/compras/solicitudes', token, {
  warehouseId: s.bodega.id, departamento: 'Cocina', justificacion: 'Reposición semanal de cocina',
  items: [{ productId: s.p1.id, cantidad: 12 }, { productId: s.p2.id, cantidad: 3.5 }], ...extra,
});

test.before(async () => {
  admin = await login(process.env.ADMIN_USER || 'admin', process.env.ADMIN_PASS);
  oper = await login(process.env.OPER_USER || 'cajero1', process.env.OPER_PASS);
  const cat = ok(await call('POST', '/catalogos/categorias', admin, { nombre: `SC ${sfx}` }), 'cat').data;
  s.bodega = ok(await call('POST', '/catalogos/bodegas', admin, { codigo: `SB-${sfx}`, nombre: `Bodega SC ${sfx}` }), 'bodega').data;
  s.p1 = ok(await call('POST', '/catalogos/productos', admin, { codigo: `S1-${sfx}`, nombre: `Harina ${sfx}`, categoriaId: cat.id, precioVenta: 2000, costo: 800, impuesto: 13 }), 'p1').data;
  s.p2 = ok(await call('POST', '/catalogos/productos', admin, { codigo: `S2-${sfx}`, nombre: `Aceite ${sfx}`, categoriaId: cat.id, precioVenta: 5000, costo: 2000, impuesto: 13 }), 'p2').data;
  s.prov = ok(await call('POST', '/catalogos/proveedores', admin, { identificacion: `S${sfx}`, nombre: `Proveedor SC ${sfx}`, diasCredito: 15 }), 'prov').data;

  const roles = (await call('GET', '/admin/roles', admin)).data;
  const rol = (n) => roles.find((r) => r.nombre === n).id;
  const permisos = (await call('GET', '/admin/permisos', admin)).data;
  const aprobar = permisos.find((p) => p.modulo === 'COMPRAS' && p.accion === 'APROBAR');
  assert.ok(aprobar, 'el catálogo incluye COMPRAS:APROBAR');
  const ver = permisos.find((p) => p.modulo === 'COMPRAS' && p.accion === 'VER');
  const rAprob = ok(await call('POST', '/admin/roles', admin, { nombre: `APROBADOR_${sfx}`, descripcion: 'Aprueba compras' }), 'rol').data;
  ok(await call('PUT', `/admin/roles/${rAprob.id}/permisos`, admin, { permissionIds: [aprobar.id, ver.id] }), 'permisos rol');

  t.bodega = await usuario('bodeguero', [rol('BODEGA')]);
  t.prov = await usuario('proveeduria', [rol('PROVEEDURIA')]);
  t.aprob = await usuario('gerente', [rAprob.id]);
  t.provAprob = await usuario('jefecompras', [rol('PROVEEDURIA'), rAprob.id]);
});

test('COM-002: solicitud con artículos, cantidades y estado; permisos para solicitar', async () => {
  assert.equal((await solicitar(oper)).status, 403, 'el cajero no solicita compras');
  assert.equal((await solicitar(t.bodega, { items: [] })).status, 400);
  assert.equal((await solicitar(t.bodega, { justificacion: 'x' })).status, 400, 'justificación obligatoria');
  assert.equal((await solicitar(t.bodega, { items: [{ productId: s.p1.id, cantidad: 1 }, { productId: s.p1.id, cantidad: 2 }] })).status, 400, 'producto repetido');

  const r = await solicitar(t.bodega, { prioridad: 'URGENTE' });
  assert.equal(r.status, 201, r.message);
  assert.match(r.data.consecutivo, /^SC-\d{6}$/);
  assert.equal(r.data.estado, 'PENDIENTE');
  assert.equal(r.data.prioridad, 'URGENTE');
  assert.equal(r.data.details.length, 2);
  assert.equal(Number(r.data.details.find((d) => d.productId === s.p2.id).cantidad), 3.5);
  s.sol = r.data;

  const propias = (await call('GET', '/compras/solicitudes', t.bodega)).data;
  assert.ok(propias.every((x) => x.solicitante.id === propias[0].solicitante.id), 'bodega solo ve sus solicitudes');
  assert.ok((await call('GET', '/compras/solicitudes?estado=PENDIENTE', t.aprob)).data.some((x) => x.id === s.sol.id), 'el aprobador ve las pendientes');
});

test('COM-003: aprobar o rechazar requiere el rol correspondiente', async () => {
  const revisar = (tk, id, body) => call('POST', `/compras/solicitudes/${id}/revision`, tk, body);
  assert.equal((await revisar(t.bodega, s.sol.id, { decision: 'APROBAR' })).status, 403, 'bodega no aprueba');
  assert.equal((await revisar(t.prov, s.sol.id, { decision: 'APROBAR' })).status, 403, 'proveeduría sin APROBAR no aprueba');
  assert.equal((await call('POST', `/compras/solicitudes/${s.sol.id}/convertir`, t.prov, { supplierId: s.prov.id })).status, 409, 'no se convierte sin aprobar');

  const a = await revisar(t.aprob, s.sol.id, { decision: 'APROBAR', comentario: 'Autorizado' });
  assert.equal(a.status, 200, a.message);
  assert.equal(a.data.estado, 'APROBADA');
  assert.ok(a.data.revisor && a.data.fechaRevision, 'queda quién y cuándo aprobó');
  assert.equal((await revisar(t.aprob, s.sol.id, { decision: 'RECHAZAR', comentario: 'tarde' })).status, 409, 'ya fue revisada');

  const otra = ok(await solicitar(t.bodega), 'segunda').data;
  assert.equal((await revisar(t.aprob, otra.id, { decision: 'RECHAZAR' })).status, 400, 'rechazo sin motivo');
  const rech = await revisar(t.aprob, otra.id, { decision: 'RECHAZAR', comentario: 'Hay existencias suficientes' });
  assert.equal(rech.data.estado, 'RECHAZADA');
  assert.equal((await call('POST', `/compras/solicitudes/${otra.id}/convertir`, t.prov, { supplierId: s.prov.id })).status, 409);

  // Segregation: requesters cannot approve their own request
  const propia = ok(await solicitar(t.provAprob), 'propia').data;
  assert.equal((await revisar(t.provAprob, propia.id, { decision: 'APROBAR' })).status, 403);
  // Cancellation by the requester
  assert.equal((await call('POST', `/compras/solicitudes/${propia.id}/cancelar`, t.bodega, { motivo: 'No es mía' })).status, 403);
  const canc = await call('POST', `/compras/solicitudes/${propia.id}/cancelar`, t.provAprob, { motivo: 'Ya no se necesita' });
  assert.equal(canc.data.estado, 'CANCELADA');
});

test('COM-002/004: la solicitud aprobada genera una orden de compra vinculada', async () => {
  assert.equal((await call('POST', `/compras/solicitudes/${s.sol.id}/convertir`, t.aprob, { supplierId: s.prov.id })).status, 403, 'el aprobador sin COMPRAS:CREAR no genera órdenes');
  const c = await call('POST', `/compras/solicitudes/${s.sol.id}/convertir`, t.prov, {
    supplierId: s.prov.id, fechaEsperada: '2026-12-01', precios: [{ productId: s.p1.id, precioUnitario: 750 }],
  });
  assert.equal(c.status, 201, c.message);
  const { orden, solicitud } = c.data;
  assert.equal(solicitud.estado, 'CONVERTIDA');
  assert.equal(solicitud.purchaseOrder.consecutivo, orden.consecutivo);
  assert.equal(orden.warehouseId, s.bodega.id);
  assert.match(orden.notas, new RegExp(s.sol.consecutivo));
  const d1 = orden.details.find((d) => d.productId === s.p1.id);
  const d2 = orden.details.find((d) => d.productId === s.p2.id);
  assert.equal(Number(d1.precioUnitario), 750, 'precio negociado');
  assert.equal(Number(d2.precioUnitario), 2000, 'sin precio usa el costo del producto');
  // 12×750 + 3.5×2000 = 16000 + 13 % = 18080
  assert.equal(Number(orden.total), 18080);
  assert.equal((await call('POST', `/compras/solicitudes/${s.sol.id}/convertir`, t.prov, { supplierId: s.prov.id })).status, 409, 'no se convierte dos veces');
  assert.equal((await call('POST', `/compras/solicitudes/${s.sol.id}/cancelar`, t.prov, { motivo: 'tarde' })).status, 403);

  // The order follows the normal receipt flow
  const rec = await call('POST', '/compras/recepciones', t.prov, {
    purchaseOrderId: orden.id, facturaProveedor: `F-${sfx}`,
    items: [{ productId: s.p1.id, cantidadRecibida: 12 }, { productId: s.p2.id, cantidadRecibida: 3.5 }],
  });
  assert.ok(rec.status < 300, rec.message);
});
