// Batch 11: PMS adapter and reconciliation (PMS-001), change author and date (GEN-008),
// individual or company customers with contact and ID validation (CLI-001).
// End-to-end HTTP tests against a running API backed by a TEST database.
//
// Usage (PowerShell):
//   $env:API_URL='http://127.0.0.1:4000/api'; $env:ADMIN_USER='...'; $env:ADMIN_PASS='...'
//   $env:OPER_USER='cajero1'; $env:OPER_PASS='...'; $env:ALLOW_WRITE_TESTS='1'
//   node --test --test-concurrency=1 tests/tanda-11-pms-auditoria-clientes.http.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, randomInt } = require('node:crypto');

const API = process.env.API_URL || 'http://127.0.0.1:4000/api';
if (process.env.ALLOW_WRITE_TESTS !== '1') throw new Error('Defina ALLOW_WRITE_TESTS=1 y use una base de prueba: estas pruebas crean registros.');
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(API)) throw new Error('API_URL debe apuntar a 127.0.0.1 o localhost.');
const sfx = randomBytes(3).toString('hex').toUpperCase();
const digitos = (n) => Array.from({ length: n }, () => randomInt(10)).join('');

async function call(method, path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
}
async function login(u, p) {
  const r = await call('POST', '/auth/login', null, { username: u, password: p });
  assert.equal(r.status, 200, `${u}: ${r.message}`);
  return r.data.token;
}

let admin; let oper; const ADMIN = process.env.ADMIN_USER || 'admin'; const OPER = process.env.OPER_USER || 'cajero1';

test.before(async () => {
  admin = await login(ADMIN, process.env.ADMIN_PASS);
  oper = await login(OPER, process.env.OPER_PASS);
});

test('CLI-001: identificación validada según el tipo (persona física, empresa, DIMEX, pasaporte)', async () => {
  const casos = [
    ['CEDULA_FISICA', `1${digitos(7)}`, 400, 'física con 8 dígitos'],
    ['CEDULA_FISICA', `0${digitos(8)}`, 400, 'física que empieza en 0'],
    ['CEDULA_JURIDICA', `1${digitos(9)}`, 400, 'jurídica que empieza en 1'],
    ['CEDULA_JURIDICA', `3-101-${digitos(6)}`, 201, 'jurídica con guiones'],
    ['DIMEX', digitos(10), 400, 'DIMEX de 10 dígitos'],
    ['DIMEX', `1${digitos(10)}`, 201, 'DIMEX de 11 dígitos'],
    ['PASAPORTE', 'AB1', 400, 'pasaporte demasiado corto'],
    ['PASAPORTE', `P${sfx}9`, 201, 'pasaporte alfanumérico'],
    ['JURIDICA', `3${digitos(9)}`, 400, 'tipo antiguo ya no aceptado'],
  ];
  for (const [tipo, id, esperado, desc] of casos) {
    const r = await call('POST', '/catalogos/clientes', admin, { tipoIdentificacion: tipo, identificacion: id, nombre: `Cliente ${desc} ${sfx}` });
    assert.equal(r.status, esperado, `${desc}: ${r.message}`);
  }
});

test('CLI-001 y GEN-008: empresa con persona de contacto; autor y fecha de creación y modificación', async () => {
  const id = `3${digitos(9)}`;
  const c = await call('POST', '/catalogos/clientes', admin, {
    tipoIdentificacion: 'CEDULA_JURIDICA', identificacion: id, nombre: `Empresa ${sfx} S.A.`, contacto: 'María Rojas', telefono: '2758-0000',
  });
  assert.equal(c.status, 201, c.message);
  assert.equal(c.data.tipoIdentificacion, 'CEDULA_JURIDICA');
  assert.equal(c.data.contacto, 'María Rojas');
  assert.equal(c.data.creadoPor, ADMIN);
  assert.equal(c.data.modificadoPor, ADMIN);
  assert.ok(c.data.createdAt && c.data.updatedAt);

  await new Promise((r) => setTimeout(r, 20));
  const u = await call('PUT', `/catalogos/clientes/${c.data.id}`, admin, { contacto: 'Luis Mora' });
  assert.equal(u.status, 200, u.message);
  assert.equal(u.data.contacto, 'Luis Mora');
  assert.equal(u.data.creadoPor, ADMIN, 'el autor de creación no cambia');
  assert.ok(new Date(u.data.updatedAt) > new Date(u.data.createdAt), 'la fecha de modificación avanza');

  // Switching to an individual with a 10-digit identification is invalid
  const mal = await call('PUT', `/catalogos/clientes/${c.data.id}`, admin, { tipoIdentificacion: 'CEDULA_FISICA' });
  assert.equal(mal.status, 400, 'el cambio de tipo revalida la identificación');

  const lista = (await call('GET', '/catalogos/clientes', admin)).data.find((x) => x.id === c.data.id);
  assert.equal(lista.modificadoPor, ADMIN);
});

test('GEN-008: catálogos, usuarios y roles registran quién los creó y modificó', async () => {
  const bod = await call('POST', '/catalogos/bodegas', admin, { codigo: `AU-${sfx}`, nombre: `Bodega auditoría ${sfx}` });
  assert.equal(bod.status, 201, bod.message);
  assert.equal(bod.data.creadoPor, ADMIN);
  const bod2 = await call('PUT', `/catalogos/bodegas/${bod.data.id}`, admin, { nombre: `Bodega auditoría ${sfx} (editada)` });
  assert.equal(bod2.data.modificadoPor, ADMIN);

  const rol = await call('POST', '/admin/roles', admin, { nombre: `ROL_AUD_${sfx}`, descripcion: 'Prueba de autoría' });
  assert.equal(rol.status, 201, rol.message);
  const roles = (await call('GET', '/admin/roles', admin)).data;
  const r = roles.find((x) => x.id === rol.data.id);
  assert.equal(r.creadoPor, ADMIN);
  assert.ok(r.createdAt && r.updatedAt);

  const cajero = roles.find((x) => x.nombre === 'CAJERO');
  const username = `aud.${sfx.toLowerCase()}`;
  const usr = await call('POST', '/admin/usuarios', admin, { username, nombre: 'Usuario autoría', email: `${username}@test.local`, password: 'ClaveSegura2026!', roleIds: [cajero.id] });
  assert.equal(usr.status, 201, usr.message);
  assert.equal(usr.data.creadoPor, ADMIN);
  const usrs = (await call('GET', '/admin/usuarios', admin)).data;
  assert.equal(usrs.find((x) => x.id === usr.data.id).modificadoPor, ADMIN);
  // Deactivated so no test accounts remain active
  await call('PUT', `/admin/usuarios/${usr.data.id}`, admin, { activo: false });
});

test('PMS-001: cargos pasan por el adaptador configurado y la conciliación muestra pendientes', async () => {
  const habs = (await call('GET', '/pms/habitaciones', oper)).data.filter((h) => h.huesped);
  assert.ok(habs.length > 0, 'el seed incluye habitaciones ocupadas');
  const hab = habs[0];

  const okCargo = await call('POST', '/pms/cargo', oper, { roomId: hab.id, guestId: hab.huesped.id, monto: 1500, transaccionUuid: `TX-T11-OK-${sfx}` });
  assert.ok(okCargo.status < 300, okCargo.message);
  assert.equal(okCargo.data.estadoPMS, 'CONFIRMADO');

  const uuid = `TX-T11-ERR-${sfx}`;
  const fallo = await call('POST', '/pms/cargo', oper, { roomId: hab.id, guestId: hab.huesped.id, monto: 2500, transaccionUuid: uuid, simularError: true });
  assert.equal(fallo.status, 502);
  assert.equal(fallo.data.estadoPMS, 'ERROR');

  let conc = (await call('GET', '/pms/conciliacion', admin)).data;
  assert.equal(conc.resumen.adaptador, 'simulado', 'adaptador elegido por PMS_ADAPTER');
  assert.ok(Array.isArray(conc.diferencias), 'la conciliación reporta diferencias');
  assert.ok(conc.pendientes.some((p) => p.transaccionUuid === uuid), 'el cargo fallido aparece como pendiente');
  assert.ok(conc.resumen.operacionesPendientes >= 1);

  const re = await call('POST', `/pms/reintentar/${fallo.data.id}`, oper);
  assert.equal(re.status, 200, re.message);
  assert.equal(re.data.estadoPMS, 'CONFIRMADO');
  const otra = await call('POST', `/pms/reintentar/${fallo.data.id}`, oper);
  assert.equal(otra.status, 200, 'reintentar un cargo ya confirmado no falla ni duplica');

  conc = (await call('GET', '/pms/conciliacion', admin)).data;
  assert.ok(!conc.pendientes.some((p) => p.transaccionUuid === uuid), 'ya no queda pendiente');

  const hoy = new Date().toISOString().slice(0, 10);
  const filtrada = await call('GET', `/pms/conciliacion?fechaInicio=${hoy}&fechaFin=${hoy}`, admin);
  assert.equal(filtrada.status, 200, filtrada.message);
  const malas = await call('GET', '/pms/conciliacion?fechaInicio=2026-13-45', admin);
  assert.equal(malas.status, 400, 'fechas imposibles se rechazan');
});
