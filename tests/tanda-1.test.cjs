const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../backend/node_modules/typescript');
const root = path.resolve(__dirname, '..');

function load(file, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, URLSearchParams, ...globals }, { filename: file });
  return exports;
}

test('consultas sin filtros no envían undefined, null, vacío ni un ? suelto', async () => {
  const urls = [];
  const { api } = load('frontend/src/api/client.ts', {
    localStorage: { getItem: () => null },
    fetch: async (url) => { urls.push(url); return { ok: true, json: async () => ({ success: true }) }; },
  });
  await api.catalogos.getProductos({ busqueda: undefined, categoriaId: '' });
  await api.ventas.getVentas({ fechaInicio: null, fechaFin: undefined });
  await api.inventario.getExistencias();
  await api.compras.getOrdenes({ supplierId: undefined });
  await api.reportes.getVentas({ fechaInicio: undefined, fechaFin: undefined });
  await api.reportes.getFormasPago({ fechaInicio: '', fechaFin: null });
  assert.deepEqual(urls, ['/api/catalogos/productos', '/api/ventas', '/api/inventario/existencias', '/api/compras/ordenes', '/api/reportes/ventas', '/api/reportes/formas-pago']);
});

test('filtros conservan false, cero, fechas, tildes y caracteres especiales', async () => {
  const urls = [];
  const { api } = load('frontend/src/api/client.ts', {
    localStorage: { getItem: () => null },
    fetch: async (url) => { urls.push(url); return { ok: true, json: async () => ({ success: true }) }; },
  });
  await api.inventario.getExistencias({ warehouseId: 'bodega & bar', soloBajoMinimo: false });
  await api.catalogos.getProductos({ busqueda: 'café + té', categoriaId: undefined });
  await api.reportes.getVentas({ fechaInicio: '2026-09-01', fechaFin: '2026-09-17', offset: 0 });
  assert.equal(new URL(urls[0], 'http://test').searchParams.get('soloBajoMinimo'), 'false');
  assert.equal(new URL(urls[0], 'http://test').searchParams.get('warehouseId'), 'bodega & bar');
  assert.equal(new URL(urls[1], 'http://test').searchParams.get('busqueda'), 'café + té');
  const dates = new URL(urls[2], 'http://test').searchParams;
  assert.equal(dates.get('fechaInicio'), '2026-09-01');
  assert.equal(dates.get('fechaFin'), '2026-09-17');
  assert.equal(dates.get('offset'), '0');
});

const { ensureDefaultPermissions } = load('backend/src/utils/default-permissions.ts');
function database() {
  const roles = ['ADMINISTRADOR', 'CAJERO', 'RESTAURANTE_BAR', 'BODEGA', 'PROVEEDURIA', 'CONTABILIDAD', 'AUDITOR', 'PERSONALIZADO'].map(nombre => ({ id: nombre, nombre }));
  const modules = ['VENTAS', 'CAJA', 'INVENTARIO', 'COMPRAS', 'CLIENTES', 'PROVEEDORES', 'REPORTES', 'SEGURIDAD', 'HOTEL_PMS'];
  const permissions = modules.flatMap(modulo => ['VER', 'CREAR', 'EDITAR', 'ANULAR', 'DESCUENTO', 'AJUSTE'].map(accion => ({ id: `${modulo}:${accion}`, modulo, accion })));
  const assignments = new Set(['PERSONALIZADO:VENTAS:VER', 'CAJERO:REPORTES:VER']);
  const tx = {
    role: { findMany: async () => roles },
    permission: { findMany: async () => permissions },
    rolePermission: { upsert: async ({ create }) => assignments.add(`${create.roleId}:${create.permissionId}`) },
  };
  return { roles, permissions, assignments, prisma: { $transaction: async fn => fn(tx) } };
}

test('permisos iniciales completan perfiles y conservan asignaciones existentes al repetir', async () => {
  const db = database();
  await ensureDefaultPermissions(db.prisma);
  for (const permission of ['CAJERO:CAJA:EDITAR', 'RESTAURANTE_BAR:VENTAS:CREAR', 'PROVEEDURIA:COMPRAS:EDITAR', 'CONTABILIDAD:REPORTES:VER', 'AUDITOR:REPORTES:VER', 'BODEGA:INVENTARIO:AJUSTE']) {
    assert.ok(db.assignments.has(permission), permission);
  }
  for (const role of ['CAJERO', 'RESTAURANTE_BAR', 'PROVEEDURIA', 'BODEGA', 'CONTABILIDAD', 'AUDITOR']) {
    assert.equal(db.assignments.has(`${role}:VENTAS:ANULAR`), false);
    assert.equal(db.assignments.has(`${role}:VENTAS:DESCUENTO`), false);
  }
  assert.ok(db.assignments.has('PERSONALIZADO:VENTAS:VER'));
  assert.ok(db.assignments.has('CAJERO:REPORTES:VER'));
  const first = [...db.assignments].sort();
  await ensureDefaultPermissions(db.prisma);
  assert.deepEqual([...db.assignments].sort(), first);
});

test('catálogo incompleto aborta sin escribir asignaciones', async () => {
  const db = database();
  db.permissions.splice(db.permissions.findIndex(p => p.id === 'CAJA:EDITAR'), 1);
  const before = [...db.assignments];
  await assert.rejects(ensureDefaultPermissions(db.prisma), /Falta el permiso inicial CAJA:EDITAR/);
  assert.deepEqual([...db.assignments], before);
});

test('middleware permite cierre al cajero y rechaza permisos sensibles no concedidos', async () => {
  const db = database();
  await ensureDefaultPermissions(db.prisma);
  const { requirePermission } = load('backend/src/middleware/auth.middleware.ts', {
    require: () => ({}),
  });
  const user = { roles: ['CAJERO'], permisos: [...db.assignments].filter(p => p.startsWith('CAJERO:')).map(p => p.slice('CAJERO:'.length)) };
  let allowed = false;
  const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  requirePermission('CAJA', 'EDITAR')({ user }, response, () => { allowed = true; });
  assert.equal(allowed, true);
  allowed = false;
  requirePermission('VENTAS', 'ANULAR')({ user }, response, () => { allowed = true; });
  assert.equal(allowed, false);
  assert.equal(response.code, 403);
});
