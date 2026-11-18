// Batch 7: reports with filters, totals and reconciliation (REP-001 to REP-007, CAJ-008).
// End-to-end HTTP tests against a running API backed by a TEST database.
// Builds its own scenario (new register and POS, sales, a purchase, a closing) and checks that each report
// returns exactly those operations and their totals.
//
// Usage (PowerShell):
//   $env:API_URL='http://127.0.0.1:4000/api'; $env:ADMIN_USER='...'; $env:ADMIN_PASS='...'; $env:ALLOW_WRITE_TESTS='1'
//   node --test --test-concurrency=1 tests/tanda-7-reportes.http.cjs
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
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}
const ok = (r, msg) => { assert.ok(r.status < 300, `${msg}: ${r.status} ${r.message}`); return r; };
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const manana = () => { const d = new Date(); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

let admin; const s = {};

test.before(async () => {
  const r = await call('POST', '/auth/login', null, { username: process.env.ADMIN_USER || 'admin', password: process.env.ADMIN_PASS });
  assert.equal(r.status, 200, r.message);
  admin = r.data.token;

  // Isolated scenario: its own category, 2 products, warehouse, register, department and point of sale
  const cat = ok(await call('POST', '/catalogos/categorias', admin, { nombre: `Rep ${sfx}` }), 'categoría').data;
  s.bodega = ok(await call('POST', '/catalogos/bodegas', admin, { codigo: `RB-${sfx}`, nombre: `Bodega reportes ${sfx}` }), 'bodega').data;
  s.caja = ok(await call('POST', '/catalogos/cajas', admin, { codigo: `RC-${sfx}`, nombre: `Caja reportes ${sfx}` }), 'caja').data;
  await call('POST', '/catalogos/departamentos', admin, { codigo: `RD_${sfx}`, nombre: 'Depto reportes' });
  s.pos = ok(await call('POST', '/catalogos/puntos-venta', admin, { codigo: `RP-${sfx}`, nombre: `POS reportes ${sfx}`, departamento: `RD_${sfx}`, cajaId: s.caja.id, bodegaDefectoId: s.bodega.id }), 'pos').data;
  s.a = ok(await call('POST', '/catalogos/productos', admin, { codigo: `RA-${sfx}`, nombre: `Producto A ${sfx}`, categoriaId: cat.id, precioVenta: 1000, costo: 400, impuesto: 13 }), 'prod A').data;
  s.b = ok(await call('POST', '/catalogos/productos', admin, { codigo: `RBP-${sfx}`, nombre: `Producto B ${sfx}`, categoriaId: cat.id, precioVenta: 5000, costo: 3000, impuesto: 13 }), 'prod B').data;
  const formas = ok(await call('GET', '/catalogos/formas-pago', admin), 'formas').data;
  s.efectivo = formas.find((f) => f.codigo === 'EFECTIVO');
  s.tarjeta = formas.find((f) => f.codigo === 'TARJETA');

  // Purchase: order and receipt with an invoice (inventory entry)
  const prov = ok(await call('POST', '/catalogos/proveedores', admin, { identificacion: `R${sfx}`, nombre: `Proveedor reportes ${sfx}` }), 'prov').data;
  s.prov = prov;
  const orden = ok(await call('POST', '/compras/ordenes', admin, { supplierId: prov.id, warehouseId: s.bodega.id, items: [{ productId: s.a.id, cantidadSolicitada: 50, precioUnitario: 400 }, { productId: s.b.id, cantidadSolicitada: 10, precioUnitario: 3000 }] }), 'orden').data;
  ok(await call('POST', '/compras/recepciones', admin, { purchaseOrderId: orden.id, facturaProveedor: `FAC-${sfx}`, items: [{ productId: s.a.id, cantidadRecibida: 50, costoUnitario: 400 }, { productId: s.b.id, cantidadRecibida: 4, costoUnitario: 3000 }] }), 'recepción');

  // Register: opening, 3 sales (one split payment), closing with a 500 shortage
  const turno = ok(await call('POST', '/caja/apertura', admin, { cajaId: s.caja.id, montoInicial: 10000 }), 'apertura').data;
  s.turno = turno;
  // Sale 1: 3 A = 3000 + 13% = 3390 cash
  ok(await call('POST', '/ventas', admin, { pointOfSaleId: s.pos.id, items: [{ productId: s.a.id, cantidad: 3 }], pagos: [{ paymentMethodId: s.efectivo.id, monto: 3390 }] }), 'venta 1');
  // Sale 2: 1 B = 5650 card
  ok(await call('POST', '/ventas', admin, { pointOfSaleId: s.pos.id, items: [{ productId: s.b.id, cantidad: 1 }], pagos: [{ paymentMethodId: s.tarjeta.id, monto: 5650 }] }), 'venta 2');
  // Sale 3: 2 A + 1 B = 7000 + 910 = 7910 split (4000 cash + 3910 card)
  ok(await call('POST', '/ventas', admin, { pointOfSaleId: s.pos.id, items: [{ productId: s.a.id, cantidad: 2 }, { productId: s.b.id, cantidad: 1 }], pagos: [{ paymentMethodId: s.efectivo.id, monto: 4000 }, { paymentMethodId: s.tarjeta.id, monto: 3910 }] }), 'venta 3');
  // Expected cash: 10000 + 3390 + 4000 = 17390; 16890 counted → shortage 500
  ok(await call('POST', '/caja/cierre', admin, { cashShiftId: turno.id, montoContado: 16890, notas: 'Cierre de prueba' }), 'cierre');
});

test('ventas: filtros por fecha (día final incluido), POS y producto con totales exactos (REP-001)', async () => {
  const r = await call('GET', `/reportes/ventas?pointOfSaleId=${s.pos.id}&fechaInicio=${hoy()}&fechaFin=${hoy()}`, admin);
  assert.equal(r.status, 200, r.message);
  assert.equal(r.data.resumen.totalVentas, 3, 'las ventas de hoy aparecen con fechaFin = hoy');
  assert.equal(r.data.resumen.totalRecaudado, 3390 + 5650 + 7910);
  assert.equal(r.data.resumen.totalImpuestos, 390 + 650 + 910);
  const sumaFilas = r.data.ventas.reduce((acc, v) => acc + v.total, 0);
  assert.equal(sumaFilas, r.data.resumen.totalRecaudado, 'filas y total concilian');

  const prod = await call('GET', `/reportes/ventas?pointOfSaleId=${s.pos.id}&productId=${s.b.id}`, admin);
  assert.equal(prod.data.resumen.totalVentas, 2, 'solo ventas que contienen el producto B');
  assert.equal(prod.data.resumen.cantidadProducto, 2);
  assert.equal(prod.data.resumen.montoProducto, 11300);

  const manana_ = await call('GET', `/reportes/ventas?pointOfSaleId=${s.pos.id}&fechaInicio=${manana()}`, admin);
  assert.equal(manana_.data.resumen.totalVentas, 0);
  assert.equal((await call('GET', '/reportes/ventas?fechaInicio=2026-13-45', admin)).status, 400);
  assert.equal((await call('GET', `/reportes/ventas?fechaInicio=${manana()}&fechaFin=${hoy()}`, admin)).status, 400, 'rango invertido');
});

test('formas de pago concilian con el total de ventas (REP-002)', async () => {
  const r = await call('GET', `/reportes/formas-pago?pointOfSaleId=${s.pos.id}`, admin);
  assert.equal(r.status, 200, r.message);
  const porCodigo = Object.fromEntries(r.data.map((f) => [f.codigo, f]));
  assert.equal(porCodigo.EFECTIVO.total, 7390);
  assert.equal(porCodigo.TARJETA.total, 9560);
  assert.equal(r.resumen.total, 16950);
  assert.equal(r.resumen.transacciones, 4);
});

test('productos más vendidos por cantidad y por monto (REP-003)', async () => {
  const c = await call('GET', `/reportes/productos-vendidos?pointOfSaleId=${s.pos.id}&orden=cantidad`, admin);
  assert.equal(c.status, 200, c.message);
  assert.deepEqual(c.data.map((p) => [p.codigo, p.cantidad]), [[`RA-${sfx}`, 5], [`RBP-${sfx}`, 2]]);
  const m = await call('GET', `/reportes/productos-vendidos?pointOfSaleId=${s.pos.id}&orden=monto`, admin);
  assert.deepEqual(m.data.map((p) => p.codigo), [`RBP-${sfx}`, `RA-${sfx}`]);
  assert.equal(m.data[0].montoVendido, 11300);
  assert.equal(m.data[0].posicion, 1);
});

test('existencias por bodega reflejan compra menos ventas, con valor (REP-004)', async () => {
  const r = await call('GET', `/reportes/existencias?warehouseId=${s.bodega.id}`, admin);
  assert.equal(r.status, 200, r.message);
  const porCodigo = Object.fromEntries(r.data.map((f) => [f.codigo, f]));
  assert.equal(porCodigo[`RA-${sfx}`].existencia, 45, '50 recibidos - 5 vendidos');
  assert.equal(porCodigo[`RBP-${sfx}`].existencia, 2, '4 recibidos - 2 vendidos');
  assert.equal(r.resumen.valorTotal, 45 * 400 + 2 * 3000);
});

test('kardex con entradas, salidas y saldo secuencial (REP-005)', async () => {
  assert.equal((await call('GET', '/reportes/kardex', admin)).status, 400, 'exige producto');
  const r = await call('GET', `/reportes/kardex?productId=${s.a.id}&warehouseId=${s.bodega.id}`, admin);
  assert.equal(r.status, 200, r.message);
  assert.deepEqual(r.data.map((k) => k.saldo), [50, 47, 45]);
  assert.equal(r.resumen.entradas, 50);
  assert.equal(r.resumen.salidas, 5);
});

test('compras recibidas por proveedor y producto (REP-006)', async () => {
  const r = await call('GET', `/reportes/compras?supplierId=${s.prov.id}`, admin);
  assert.equal(r.status, 200, r.message);
  assert.equal(r.data.length, 1);
  assert.equal(r.data[0].factura, `FAC-${sfx}`);
  assert.equal(r.resumen.total, 50 * 400 + 4 * 3000, 'monto recibido, no el ordenado');
  const soloB = await call('GET', `/reportes/compras?supplierId=${s.prov.id}&productId=${s.b.id}`, admin);
  assert.equal(soloB.resumen.total, 12000);
});

test('cierres de caja: desglose por medio, faltante y responsables (REP-007, CAJ-007, CAJ-008)', async () => {
  const r = await call('GET', `/reportes/cierres-caja?cajaId=${s.caja.id}&fechaInicio=${hoy()}&fechaFin=${hoy()}`, admin);
  assert.equal(r.status, 200, r.message);
  assert.equal(r.data.length, 1);
  const c = r.data[0];
  assert.equal(c.efectivo, 7390);
  assert.equal(c.tarjeta, 9560);
  assert.equal(c.esperado, 17390);
  assert.equal(c.contado, 16890);
  assert.equal(c.diferencia, -500);
  assert.equal(c.resultado, 'FALTANTE');
  assert.ok(c.cerradoPor, 'responsable del cierre');
  assert.equal(r.resumen.faltantes, 500);
  const soloDif = await call('GET', `/reportes/caja-diferencias?cajaId=${s.caja.id}`, admin);
  assert.equal(soloDif.data.length, 1, 'ruta anterior sigue funcionando');

  const hist = await call('GET', `/caja/historico?cajaId=${s.caja.id}&fechaInicio=${hoy()}&fechaFin=${hoy()}`, admin);
  assert.equal(hist.data.length, 1, 'histórico de cierres por fecha y caja');
  const histManana = await call('GET', `/caja/historico?cajaId=${s.caja.id}&fechaInicio=${manana()}`, admin);
  assert.equal(histManana.data.length, 0);
});

test('reportes exigen REPORTES:VER (SEG-002)', async () => {
  const roles = (await call('GET', '/admin/roles', admin)).data;
  const bodega = roles.find((x) => x.nombre === 'BODEGA');
  const username = `rep.${sfx.toLowerCase()}`;
  const password = `Clave-Reportes-${sfx}`;
  ok(await call('POST', '/admin/usuarios', admin, { username, nombre: 'Sin reportes', email: `${username}@test.local`, password, roleIds: [bodega.id] }), 'usuario');
  const t = (await call('POST', '/auth/login', null, { username, password })).data.token;
  for (const ruta of ['ventas', 'productos-vendidos', 'compras', 'cierres-caja', 'opciones']) {
    assert.equal((await call('GET', `/reportes/${ruta}`, t)).status, 403, ruta);
  }
});
