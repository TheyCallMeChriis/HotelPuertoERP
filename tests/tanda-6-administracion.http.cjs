// Batch 6: user/role administration, master catalogs, manual movements and audit log.
// End-to-end HTTP tests against a running API backed by a TEST database.
//
// Usage (PowerShell), with the API running on a seeded test database:
//   $env:API_URL='http://127.0.0.1:4000/api'; $env:ADMIN_USER='admin'; $env:ADMIN_PASS='...'
//   $env:OPER_USER='cajero1'; $env:OPER_PASS='...'; $env:ALLOW_WRITE_TESTS='1'
//   node --test tests/tanda-6-administracion.http.cjs
//
// Creates records with random suffixes (users, products, warehouses...). Never run against the hotel database.
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');

const API = process.env.API_URL || 'http://127.0.0.1:4000/api';
if (process.env.ALLOW_WRITE_TESTS !== '1') {
  throw new Error('Defina ALLOW_WRITE_TESTS=1 y use una base de prueba: estas pruebas crean registros.');
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(API)) {
  throw new Error('Por seguridad, API_URL debe apuntar a 127.0.0.1 o localhost.');
}
const sfx = randomBytes(3).toString('hex').toUpperCase();
const cedula = () => String(100000000 + Math.floor(Math.random() * 899999999)); // valid 9-digit national ID

async function call(method, path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}
async function login(username, password) {
  const r = await call('POST', '/auth/login', null, { username, password });
  assert.equal(r.status, 200, `login ${username}: ${r.message}`);
  return r.data.token;
}
async function auditHas(token, accion, predicate = () => true) {
  const r = await call('GET', `/auditoria?accion=${accion}`, token);
  assert.equal(r.status, 200, r.message);
  return (r.data || []).some((e) => {
    let d = e.detalle;
    try { d = JSON.parse(e.detalle); } catch { /* text */ }
    return predicate(d, e);
  });
}

let admin; let oper;
test.before(async () => {
  admin = await login(process.env.ADMIN_USER || 'admin', process.env.ADMIN_PASS);
  oper = await login(process.env.OPER_USER || 'cajero1', process.env.OPER_PASS);
});

test('login fallido y logout quedan en bitácora (SEG-003)', async () => {
  const bad = await call('POST', '/auth/login', null, { username: 'admin', password: `incorrecta-${sfx}` });
  assert.equal(bad.status, 401);
  assert.ok(await auditHas(admin, 'LOGIN_FALLIDO', (d) => d?.username === 'admin'));
  const t = await login(process.env.OPER_USER || 'cajero1', process.env.OPER_PASS);
  assert.equal((await call('POST', '/auth/logout', t)).status, 200);
  assert.ok(await auditHas(admin, 'LOGOUT'));
});

test('usuario operativo no accede a administración ni crea productos (SEG-002)', async () => {
  assert.equal((await call('GET', '/admin/usuarios', oper)).status, 403);
  assert.equal((await call('POST', '/admin/roles', oper, { nombre: `X_${sfx}` })).status, 403);
  assert.equal((await call('POST', '/catalogos/productos', oper, { codigo: `NO-${sfx}` })).status, 403);
  assert.equal((await call('PUT', '/catalogos/bodegas/cualquiera', oper, { nombre: 'x' })).status, 403);
});

test('ciclo de vida de usuarios: crear, editar roles, desactivar, restablecer clave (GEN-002)', async () => {
  const roles = (await call('GET', '/admin/roles', admin)).data;
  const cajero = roles.find((r) => r.nombre === 'CAJERO');
  const bodega = roles.find((r) => r.nombre === 'BODEGA');
  const admRole = roles.find((r) => r.nombre === 'ADMINISTRADOR');
  const username = `prueba.${sfx.toLowerCase()}`;
  const pass1 = `Clave-Inicial-${sfx}`;

  const corta = await call('POST', '/admin/usuarios', admin, { username, nombre: 'Prueba', email: `${username}@test.local`, password: 'corta', roleIds: [cajero.id] });
  assert.equal(corta.status, 400);

  const creado = await call('POST', '/admin/usuarios', admin, { username, nombre: 'Usuario Prueba', email: `${username}@test.local`, password: pass1, roleIds: [cajero.id] });
  assert.equal(creado.status, 201, creado.message);
  const id = creado.data.id;
  assert.equal(JSON.stringify(creado).includes('passwordHash'), false, 'no debe exponer el hash');

  const dup = await call('POST', '/admin/usuarios', admin, { username, nombre: 'Otro', email: `otro.${username}@test.local`, password: pass1, roleIds: [cajero.id] });
  assert.equal(dup.status, 409);

  let t = await login(username, pass1);
  let me = (await call('GET', '/auth/me', t)).data;
  assert.deepEqual(me.roles, ['CAJERO']);

  const editado = await call('PUT', `/admin/usuarios/${id}`, admin, { nombre: 'Usuario Editado', roleIds: [bodega.id] });
  assert.equal(editado.status, 200, editado.message);
  me = (await call('GET', '/auth/me', t)).data;
  assert.deepEqual(me.roles, ['BODEGA'], 'el cambio de rol aplica en la siguiente solicitud');
  assert.ok(await auditHas(admin, 'CAMBIO_ROLES_USUARIO', (d) => d?.username === username));

  const pass2 = `Clave-Nueva-${sfx}`;
  assert.equal((await call('PUT', `/admin/usuarios/${id}/password`, admin, { password: pass2 })).status, 200);
  assert.equal((await call('POST', '/auth/login', null, { username, password: pass1 })).status, 401);
  t = await login(username, pass2);

  const pass3 = `Clave-Propia-${sfx}`;
  assert.equal((await call('PUT', '/auth/password', t, { actual: 'mal', nueva: pass3 })).status, 400);
  assert.equal((await call('PUT', '/auth/password', t, { actual: pass2, nueva: pass3 })).status, 200);

  assert.equal((await call('PUT', `/admin/usuarios/${id}`, admin, { activo: false })).status, 200);
  assert.equal((await call('POST', '/auth/login', null, { username, password: pass3 })).status, 401);
  assert.equal((await call('GET', '/auth/me', t)).status, 401, 'la sesión de un usuario desactivado deja de ser válida');
  assert.ok(await auditHas(admin, 'INACTIVAR_USUARIO'));

  const yo = (await call('GET', '/auth/me', admin)).data;
  const propio = await call('PUT', `/admin/usuarios/${yo.id}`, admin, { activo: false });
  assert.equal(propio.status, 409, 'no puede desactivarse a sí mismo');
  assert.ok(admRole);
});

test('roles y permisos: crear rol, asignar permisos, efecto real en backend (GEN-003)', async () => {
  const nombre = `SUPERVISOR_${sfx}`;
  const rol = await call('POST', '/admin/roles', admin, { nombre, descripcion: 'Rol de prueba' });
  assert.equal(rol.status, 201, rol.message);
  const permisos = (await call('GET', '/admin/permisos', admin)).data;
  const verInv = permisos.find((p) => p.modulo === 'INVENTARIO' && p.accion === 'VER');

  const username = `sup.${sfx.toLowerCase()}`;
  const pass = `Clave-Supervisor-${sfx}`;
  await call('POST', '/admin/usuarios', admin, { username, nombre: 'Supervisor', email: `${username}@test.local`, password: pass, roleIds: [rol.data.id] });
  const t = await login(username, pass);
  assert.equal((await call('GET', '/inventario/existencias', t)).status, 403, 'sin permiso aún');

  const set = await call('PUT', `/admin/roles/${rol.data.id}/permisos`, admin, { permissionIds: [verInv.id] });
  assert.equal(set.status, 200, set.message);
  assert.equal((await call('GET', '/inventario/existencias', t)).status, 200, 'permiso concedido');
  assert.equal((await call('POST', '/inventario/movimiento', t, {})).status, 403, 'solo VER, no CREAR');
  assert.ok(await auditHas(admin, 'CAMBIO_PERMISOS', (d) => d?.rol === nombre && d.agregados.includes('INVENTARIO:VER')));

  const admRole = (await call('GET', '/admin/roles', admin)).data.find((r) => r.nombre === 'ADMINISTRADOR');
  assert.equal((await call('PUT', `/admin/roles/${admRole.id}`, admin, { activo: false })).status, 409);
  assert.equal((await call('PUT', `/admin/roles/${admRole.id}/permisos`, admin, { permissionIds: [] })).status, 409);

  assert.equal((await call('PUT', `/admin/roles/${rol.data.id}`, admin, { activo: false })).status, 200);
  assert.equal((await call('GET', '/inventario/existencias', t)).status, 403, 'rol inactivo deja de otorgar permisos');
});

test('productos y categorías: validación, unicidad, cambio de precio auditado, inactivación (GEN-005, GEN-010)', async () => {
  const cat = await call('POST', '/catalogos/categorias', admin, { nombre: `Categoría ${sfx}` });
  assert.equal(cat.status, 201, cat.message);
  const base = { codigo: `PRB-${sfx}`, nombre: 'Producto prueba', categoriaId: cat.data.id, precioVenta: 1500, costo: 800, impuesto: 13, codigoBarras: `750${sfx}` };

  assert.equal((await call('POST', '/catalogos/productos', admin, { ...base, precioVenta: -5 })).status, 400);
  assert.equal((await call('POST', '/catalogos/productos', admin, { ...base, impuesto: 150 })).status, 400);
  const p = await call('POST', '/catalogos/productos', admin, base);
  assert.equal(p.status, 201, p.message);
  assert.equal((await call('POST', '/catalogos/productos', admin, { ...base, codigoBarras: null })).status, 409, 'código duplicado');
  assert.equal((await call('POST', '/catalogos/productos', admin, { ...base, codigo: `PRB2-${sfx}` })).status, 409, 'código de barras duplicado');

  const busq = await call('GET', `/catalogos/productos?busqueda=750${sfx}`, oper);
  assert.equal(busq.data.length, 1, 'búsqueda por código de barras (GEN-006)');

  const upd = await call('PUT', `/catalogos/productos/${p.data.id}`, admin, { precioVenta: 1750.5 });
  assert.equal(upd.status, 200, upd.message);
  assert.equal(Number(upd.data.precioVenta), 1750.5);
  assert.equal(upd.data.codigoBarras, `750${sfx}`, 'la edición parcial conserva los demás campos');
  assert.ok(await auditHas(admin, 'CAMBIO_PRECIO', (d) => d?.codigo === base.codigo));

  assert.equal((await call('PUT', `/catalogos/categorias/${cat.data.id}`, admin, { activo: false })).status, 409, 'categoría con productos activos');
  assert.equal((await call('PUT', `/catalogos/productos/${p.data.id}`, admin, { activo: false })).status, 200);
  const activos = (await call('GET', `/catalogos/productos?busqueda=PRB-${sfx}`, oper)).data;
  assert.equal(activos.length, 0, 'inactivos no aparecen en la operación');
  const todos = (await call('GET', `/catalogos/productos?busqueda=PRB-${sfx}&todos=true`, admin)).data;
  assert.equal(todos.length, 1, 'se conserva el registro');
  assert.equal((await call('PUT', `/catalogos/categorias/${cat.data.id}`, admin, { activo: false })).status, 200);
});

test('bodegas, cajas, departamentos y puntos de venta con reglas de integridad (GEN-004, INV-001)', async () => {
  const bod = await call('POST', '/catalogos/bodegas', admin, { codigo: `BOD-${sfx}`, nombre: 'Bodega prueba' });
  assert.equal(bod.status, 201, bod.message);
  const caja = await call('POST', '/catalogos/cajas', admin, { codigo: `CJ-${sfx}`, nombre: 'Caja prueba' });
  assert.equal(caja.status, 201, caja.message);
  const dep = await call('POST', '/catalogos/departamentos', admin, { codigo: `DEP_${sfx}`, nombre: 'Departamento prueba' });
  assert.equal(dep.status, 201, dep.message);

  const malo = await call('POST', '/catalogos/puntos-venta', admin, { codigo: `PV-${sfx}`, nombre: 'POS', departamento: 'NO_EXISTE', cajaId: caja.data.id, bodegaDefectoId: bod.data.id });
  assert.equal(malo.status, 400);
  const pos = await call('POST', '/catalogos/puntos-venta', admin, { codigo: `PV-${sfx}`, nombre: 'POS prueba', departamento: `DEP_${sfx}`, cajaId: caja.data.id, bodegaDefectoId: bod.data.id });
  assert.equal(pos.status, 201, pos.message);

  assert.equal((await call('PUT', `/catalogos/cajas/${caja.data.id}`, admin, { activo: false })).status, 409, 'caja usada por POS activo');
  assert.equal((await call('PUT', `/catalogos/departamentos/${dep.data.id}`, admin, { activo: false })).status, 409);
  assert.equal((await call('PUT', `/catalogos/bodegas/${bod.data.id}`, admin, { activo: false })).status, 409, 'bodega por defecto de POS');
  assert.equal((await call('PUT', `/catalogos/puntos-venta/${pos.data.id}`, admin, { activo: false })).status, 200);
  assert.equal((await call('PUT', `/catalogos/cajas/${caja.data.id}`, admin, { activo: false })).status, 200);
  assert.ok(await auditHas(admin, 'INACTIVAR_CAJA'));
});

test('clientes y proveedores: edición, crédito validado, condiciones de pago (GEN-007, CLI-002, COM-009)', async () => {
  const cli = await call('POST', '/catalogos/clientes', admin, { tipoIdentificacion: 'CEDULA_FISICA', identificacion: cedula(), nombre: 'Cliente prueba' });
  assert.equal(cli.status, 201, cli.message);
  assert.equal((await call('PUT', `/catalogos/clientes/${cli.data.id}`, admin, { creditoActivo: true })).status, 400, 'crédito sin límite ni plazo');
  const cred = await call('PUT', `/catalogos/clientes/${cli.data.id}`, admin, { creditoActivo: true, limiteCredito: 50000, diasCredito: 30, telefono: '8888-0000' });
  assert.equal(cred.status, 200, cred.message);
  assert.equal(cred.data.nombre, 'Cliente prueba');
  assert.ok(await auditHas(admin, 'CAMBIO_CONDICIONES_CREDITO'));
  assert.equal((await call('PUT', `/catalogos/clientes/${cli.data.id}`, oper, { nombre: 'x' })).status, 403, 'cajero sin CLIENTES:EDITAR');

  const prov = await call('POST', '/catalogos/proveedores', admin, { identificacion: `3101${sfx}`, nombre: 'Proveedor prueba', diasCredito: 15, condicionesPago: 'Crédito 15 días' });
  assert.equal(prov.status, 201, prov.message);
  const pu = await call('PUT', `/catalogos/proveedores/${prov.data.id}`, admin, { condicionesPago: 'Contado' });
  assert.equal(pu.data.condicionesPago, 'Contado');
  assert.equal(pu.data.diasCredito, 15);
});

test('entradas, salidas y mermas manuales generan Kardex; mínimos configurables (INV-003, INV-004, INV-009)', async () => {
  const cats = (await call('GET', '/catalogos/categorias', admin)).data;
  const p = (await call('POST', '/catalogos/productos', admin, { codigo: `INV-${sfx}`, nombre: 'Insumo prueba', categoriaId: cats[0].id, precioVenta: 100, costo: 50 })).data;
  const bod = (await call('POST', '/catalogos/bodegas', admin, { codigo: `BI-${sfx}`, nombre: 'Bodega inventario prueba' })).data;

  const sinMotivo = await call('POST', '/inventario/movimiento', admin, { warehouseId: bod.id, productId: p.id, tipo: 'ENTRADA_MANUAL', cantidad: 10, motivo: '' });
  assert.equal(sinMotivo.status, 400);
  const e = await call('POST', '/inventario/movimiento', admin, { warehouseId: bod.id, productId: p.id, tipo: 'ENTRADA_MANUAL', cantidad: 10, motivo: 'Entrada de prueba' });
  assert.equal(e.status, 201, e.message);
  assert.equal(Number(e.data.saldoNuevo), 10);
  const s = await call('POST', '/inventario/movimiento', admin, { warehouseId: bod.id, productId: p.id, tipo: 'SALIDA_MANUAL', cantidad: 3, motivo: 'Consumo interno' });
  assert.equal(Number(s.data.saldoNuevo), 7);
  const m = await call('POST', '/inventario/movimiento', admin, { warehouseId: bod.id, productId: p.id, tipo: 'MERMA', cantidad: 2, motivo: 'Vencido' });
  assert.equal(Number(m.data.saldoNuevo), 5);
  const exceso = await call('POST', '/inventario/movimiento', admin, { warehouseId: bod.id, productId: p.id, tipo: 'SALIDA_MANUAL', cantidad: 50, motivo: 'Exceso' });
  assert.ok(exceso.status >= 400, 'no permite existencias negativas (INV-010)');

  const kardex = (await call('GET', `/inventario/kardex/${p.id}?warehouseId=${bod.id}`, admin)).data;
  assert.deepEqual(kardex.map((k) => k.tipo), ['ENTRADA_MANUAL', 'SALIDA_MANUAL', 'MERMA']);
  assert.deepEqual(kardex.map((k) => Number(k.saldoNuevo)), [10, 7, 5]);

  assert.equal((await call('PUT', '/inventario/niveles', admin, { warehouseId: bod.id, productId: p.id, stockMinimo: 8, stockMaximo: 2 })).status, 400);
  assert.equal((await call('PUT', '/inventario/niveles', admin, { warehouseId: bod.id, productId: p.id, stockMinimo: 8, stockMaximo: 100 })).status, 200);
  const bajos = (await call('GET', `/inventario/existencias?warehouseId=${bod.id}&soloBajoMinimo=true`, admin)).data;
  assert.equal(bajos.length, 1, 'alerta de stock bajo');
  assert.equal(Number(bajos[0].cantidad), 5, 'configurar mínimos no altera la existencia');
  assert.equal((await call('PUT', `/catalogos/bodegas/${bod.id}`, admin, { activo: false })).status, 409, 'bodega con existencia');
});
