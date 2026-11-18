// Batch 10: the 10 mandatory demonstration scenarios (section 19 of the requirements document).
// Each test reproduces one scenario end to end over HTTP, with an administrator and a cashier user.
// Scenario 9 (backup and restore) is demonstrated with scripts/backup-database.cjs; here we verify
// that the health endpoint and data integrity hold after the other scenarios.
//
// Usage (PowerShell), with the API running on a seeded TEST database:
//   $env:API_URL='http://127.0.0.1:4000/api'; $env:ADMIN_USER='admin'; $env:ADMIN_PASS='...'
//   $env:OPER_USER='cajero1'; $env:OPER_PASS='...'; $env:ALLOW_WRITE_TESTS='1'
//   node --test --test-concurrency=1 tests/tanda-10-escenarios-demo.http.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');

const API = process.env.API_URL || 'http://127.0.0.1:4000/api';
if (process.env.ALLOW_WRITE_TESTS !== '1') throw new Error('Defina ALLOW_WRITE_TESTS=1 y use una base de prueba: estas pruebas crean registros.');
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(API)) throw new Error('API_URL debe apuntar a 127.0.0.1 o localhost.');
const sfx = randomBytes(3).toString('hex').toUpperCase();

async function call(method, path, token, body, rawToken) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token || rawToken ? { Authorization: rawToken ?? `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ...json, body: json, status: res.status };
}
const ok = (r, msg) => { assert.ok(r.status < 300, `${msg}: ${r.status} ${r.message}`); return r; };
async function login(u, p) {
  const r = await call('POST', '/auth/login', null, { username: u, password: p });
  assert.equal(r.status, 200, `${u}: ${r.message}`);
  return r.data.token;
}
const existencia = async (t, bodega, codigo) =>
  (await call('GET', `/reportes/existencias?warehouseId=${bodega}`, t)).data.find((f) => f.codigo === codigo)?.existencia ?? 0;

let admin; let cajero; const s = {};

test.before(async () => {
  admin = await login(process.env.ADMIN_USER || 'admin', process.env.ADMIN_PASS);
  cajero = await login(process.env.OPER_USER || 'cajero1', process.env.OPER_PASS);
  const cat = ok(await call('POST', '/catalogos/categorias', admin, { nombre: `Demo ${sfx}` }), 'categoría').data;
  s.central = ok(await call('POST', '/catalogos/bodegas', admin, { codigo: `DC-${sfx}`, nombre: `Central demo ${sfx}` }), 'bodega central').data;
  s.bar = ok(await call('POST', '/catalogos/bodegas', admin, { codigo: `DB-${sfx}`, nombre: `Bar demo ${sfx}` }), 'bodega bar').data;
  s.caja = ok(await call('POST', '/catalogos/cajas', admin, { codigo: `DJ-${sfx}`, nombre: `Caja demo ${sfx}` }), 'caja').data;
  await call('POST', '/catalogos/departamentos', admin, { codigo: `DD_${sfx}`, nombre: 'Restaurante demo' });
  s.pos = ok(await call('POST', '/catalogos/puntos-venta', admin, { codigo: `DP-${sfx}`, nombre: `POS demo ${sfx}`, departamento: `DD_${sfx}`, cajaId: s.caja.id, bodegaDefectoId: s.central.id }), 'pos').data;
  s.cafe = ok(await call('POST', '/catalogos/productos', admin, { codigo: `CAF-${sfx}`, nombre: `Café ${sfx}`, categoriaId: cat.id, precioVenta: 1500, costo: 400, impuesto: 13 }), 'café').data;
  s.jugo = ok(await call('POST', '/catalogos/productos', admin, { codigo: `JUG-${sfx}`, nombre: `Jugo ${sfx}`, categoriaId: cat.id, precioVenta: 2000, costo: 700, impuesto: 13 }), 'jugo').data;
  s.tour = ok(await call('POST', '/catalogos/productos', admin, { codigo: `TOU-${sfx}`, nombre: `Tour ${sfx}`, categoriaId: cat.id, precioVenta: 10000, impuesto: 13, esServicio: true }), 'servicio').data;
  s.prov = ok(await call('POST', '/catalogos/proveedores', admin, { identificacion: `D${sfx}`, nombre: `Distribuidora demo ${sfx}`, diasCredito: 30 }), 'proveedor').data;
  const formas = (await call('GET', '/catalogos/formas-pago', admin)).data;
  s.fp = Object.fromEntries(formas.map((f) => [f.codigo, f]));
});

test('Escenario 5 · Compra: orden, recepción parcial y actualización de inventario', async () => {
  const orden = ok(await call('POST', '/compras/ordenes', admin, {
    supplierId: s.prov.id, warehouseId: s.central.id,
    items: [{ productId: s.cafe.id, cantidadSolicitada: 40, precioUnitario: 400 }, { productId: s.jugo.id, cantidadSolicitada: 30, precioUnitario: 700 }],
  }), 'orden').data;
  const rec = await call('POST', '/compras/recepciones', admin, {
    purchaseOrderId: orden.id, facturaProveedor: `F-${sfx}`,
    items: [{ productId: s.cafe.id, cantidadRecibida: 25 }, { productId: s.jugo.id, cantidadRecibida: 30 }],
  });
  assert.equal(rec.status, 201, rec.message);
  assert.equal(await existencia(admin, s.central.id, `CAF-${sfx}`), 25, 'recibe solo lo entregado');
  assert.equal(await existencia(admin, s.central.id, `JUG-${sfx}`), 30);
  const ordenes = (await call('GET', `/compras/ordenes?supplierId=${s.prov.id}`, admin)).data;
  assert.equal(ordenes.find((o) => o.id === orden.id).estado, 'RECIBIDA_PARCIAL', 'faltan 15 cafés por recibir');
  const exceso = await call('POST', '/compras/recepciones', admin, { purchaseOrderId: orden.id, items: [{ productId: s.cafe.id, cantidadRecibida: 16 }] });
  assert.ok(exceso.status >= 400, 'no permite recibir más de lo pendiente');
  s.orden = orden;
});

test('Escenario 4 · Inventario: entrada, traslado y salida con Kardex y saldo final', async () => {
  ok(await call('POST', '/inventario/movimiento', admin, { warehouseId: s.central.id, productId: s.cafe.id, tipo: 'ENTRADA_MANUAL', cantidad: 5, motivo: 'Donación de proveedor' }), 'entrada');
  ok(await call('POST', '/inventario/traslado', admin, { warehouseOrigenId: s.central.id, warehouseDestinoId: s.bar.id, items: [{ productId: s.cafe.id, cantidad: 10 }], notas: 'Abastecer bar' }), 'traslado');
  ok(await call('POST', '/inventario/movimiento', admin, { warehouseId: s.bar.id, productId: s.cafe.id, tipo: 'SALIDA_MANUAL', cantidad: 2, motivo: 'Consumo de personal' }), 'salida');
  assert.equal(await existencia(admin, s.central.id, `CAF-${sfx}`), 20, '25 + 5 - 10');
  assert.equal(await existencia(admin, s.bar.id, `CAF-${sfx}`), 8, '10 - 2');
  const kCentral = (await call('GET', `/reportes/kardex?productId=${s.cafe.id}&warehouseId=${s.central.id}`, admin)).data;
  assert.deepEqual(kCentral.map((k) => k.saldo), [25, 30, 20]);
  const kBar = (await call('GET', `/reportes/kardex?productId=${s.cafe.id}&warehouseId=${s.bar.id}`, admin)).data;
  assert.deepEqual(kBar.map((k) => [k.tipo, k.saldo]), [['TRASLADO_ENTRADA', 10], ['SALIDA_MANUAL', 8]]);
});

test('Escenario 1 · Venta completa: abrir caja, varios productos, forma de pago y comprobante', async () => {
  const sinCaja = await call('POST', '/ventas', cajero, { pointOfSaleId: s.pos.id, items: [{ productId: s.cafe.id, cantidad: 1 }], pagos: [{ paymentMethodId: s.fp.EFECTIVO.id, monto: 1695 }] });
  assert.equal(sinCaja.status, 400, 'CAJ-002: sin caja abierta no se vende');
  s.turno = ok(await call('POST', '/caja/apertura', cajero, { cajaId: s.caja.id, montoInicial: 20000 }), 'apertura').data;
  // 2 coffees (3000) + 1 juice (2000) + 1 tour (10000) = 15000 + 13% = 16950
  const v = await call('POST', '/ventas', cajero, {
    pointOfSaleId: s.pos.id,
    items: [{ productId: s.cafe.id, cantidad: 2 }, { productId: s.jugo.id, cantidad: 1 }, { productId: s.tour.id, cantidad: 1 }],
    pagos: [{ paymentMethodId: s.fp.EFECTIVO.id, monto: 16950 }],
  });
  assert.equal(v.status, 201, v.message);
  assert.match(v.data.consecutivo, /^VTA-\d{6}$/);
  const comp = (await call('GET', `/ventas/${v.data.id}`, cajero)).data;
  assert.equal(comp.details.length, 3);
  assert.equal(Number(comp.total), 16950);
  assert.equal(comp.usuario.username, process.env.OPER_USER || 'cajero1');
  assert.equal(await existencia(admin, s.central.id, `CAF-${sfx}`), 18, 'descuenta inventario; el servicio no');
  s.venta1 = v.data;
});

test('Escenario 2 · Pago mixto: dos formas de pago que suman el total', async () => {
  // 3 juices = 6000 + 780 = 6780 → 4000 card + 2780 cash
  const v = await call('POST', '/ventas', cajero, {
    pointOfSaleId: s.pos.id, items: [{ productId: s.jugo.id, cantidad: 3 }],
    pagos: [{ paymentMethodId: s.fp.TARJETA.id, monto: 4000, referencia: 'VOUCHER-123' }, { paymentMethodId: s.fp.EFECTIVO.id, monto: 2780 }],
  });
  assert.equal(v.status, 201, v.message);
  assert.deepEqual(v.data.payments.map((p) => Number(p.monto)).sort((a, b) => a - b), [2780, 4000]);
  const mal = await call('POST', '/ventas', cajero, {
    pointOfSaleId: s.pos.id, items: [{ productId: s.jugo.id, cantidad: 1 }],
    pagos: [{ paymentMethodId: s.fp.TARJETA.id, monto: 1000 }, { paymentMethodId: s.fp.EFECTIVO.id, monto: 1000 }],
  });
  assert.equal(mal.status, 400, 'la suma de pagos debe coincidir');
  s.venta2 = v.data;
});

test('Escenario 3 · Anulación controlada: sin permiso, luego con usuario autorizado y motivo', async () => {
  const sinPermiso = await call('POST', `/ventas/${s.venta1.id}/anular`, cajero, { motivo: 'Cliente desistió' });
  assert.equal(sinPermiso.status, 403, 'el cajero no tiene VENTAS:ANULAR');
  assert.equal((await call('POST', `/ventas/${s.venta1.id}/anular`, admin, {})).status, 400, 'motivo obligatorio');
  const r = await call('POST', `/ventas/${s.venta1.id}/anular`, admin, { motivo: `Cobro duplicado demo ${sfx}` });
  assert.equal(r.status, 200, r.message);
  assert.equal((await call('GET', `/ventas/${s.venta1.id}`, admin)).data.estado, 'ANULADA');
  assert.equal(await existencia(admin, s.central.id, `CAF-${sfx}`), 20, 'revierte el inventario');
  assert.equal((await call('POST', `/ventas/${s.venta1.id}/anular`, admin, { motivo: 'otra vez' })).status, 409, 'no se anula dos veces');
});

test('Escenario 10 · Integración PMS simulada: error y reintento sin duplicar', async () => {
  const habs = (await call('GET', '/pms/habitaciones', cajero)).data.filter((h) => h.huesped);
  assert.ok(habs.length > 0, 'el seed incluye habitaciones ocupadas');
  const hab = habs[0];
  const uuid = `TX-DEMO-${sfx}`;
  const body = { roomId: hab.id, guestId: hab.huesped.id, monto: 5000, transaccionUuid: uuid, simularError: true };
  const fallo = await call('POST', '/pms/cargo', cajero, body);
  assert.equal(fallo.status, 502, 'el simulador responde como falla de comunicación');
  const cargo = fallo.data;
  assert.equal(cargo.estadoPMS, 'ERROR');
  const repetido = await call('POST', '/pms/cargo', cajero, body);
  assert.equal(repetido.data.id, cargo.id, 'misma transacción = mismo cargo (idempotencia)');
  const re = await call('POST', `/pms/reintentar/${cargo.id}`, cajero);
  assert.equal(re.status, 200, re.message);
  assert.equal(re.data.estadoPMS, 'CONFIRMADO');
  assert.equal(re.data.id, cargo.id, 'el reintento actualiza el mismo registro');
  const conc = (await call('GET', '/pms/conciliacion', cajero)).data;
  const lista = conc.cargos ?? conc.data ?? conc;
  assert.equal((Array.isArray(lista) ? lista : []).filter((c) => c.transaccionUuid === uuid).length, 1, 'sin duplicados en conciliación');
});

test('Escenario 6 · Cierre de caja: efectivo contado, diferencia y cierre inmodificable', async () => {
  // Expected cash: 20000 float + 16950 (cancelled: not counted) + 2780 = 22780; 22700 counted → shortage 80
  const c = await call('POST', '/caja/cierre', cajero, { cashShiftId: s.turno.id, montoContado: 22700, notas: 'Cierre demo' });
  assert.equal(c.status, 200, c.message);
  const r = (await call('GET', `/reportes/cierres-caja?cajaId=${s.caja.id}`, admin)).data[0];
  assert.equal(r.esperado, 22780);
  assert.equal(r.diferencia, -80);
  assert.equal(r.resultado, 'FALTANTE');
  assert.equal(r.tarjeta, 4000);
  assert.equal((await call('POST', '/caja/cierre', cajero, { cashShiftId: s.turno.id, montoContado: 0 })).status, 409, 'no se modifica un cierre');
  const despues = await call('POST', '/ventas', cajero, { pointOfSaleId: s.pos.id, items: [{ productId: s.jugo.id, cantidad: 1 }], pagos: [{ paymentMethodId: s.fp.EFECTIVO.id, monto: 2260 }] });
  assert.equal(despues.status, 400, 'con la caja cerrada no se vende');
});

test('Escenario 7 · Seguridad: usuario restringido no accede a funciones administrativas', async () => {
  for (const [m, ruta, body] of [
    ['GET', '/admin/usuarios'], ['POST', '/admin/roles', { nombre: 'X_ROL' }], ['GET', '/auditoria'],
    ['POST', '/catalogos/productos', { codigo: 'X' }], ['POST', '/inventario/ajuste', {}], ['POST', '/compras/ordenes', {}],
    ['PUT', `/catalogos/bodegas/${s.central.id}`, { activo: false }],
  ]) {
    assert.equal((await call(m, ruta, cajero, body)).status, 403, `${m} ${ruta}`);
  }
  assert.equal((await call('GET', '/admin/usuarios')).status, 401, 'sin sesión');
  assert.ok([401, 403].includes((await call('GET', '/admin/usuarios', null, undefined, 'Bearer token-falso')).status), 'token inválido');
  const yo = (await call('GET', '/auth/me', cajero)).data;
  assert.equal(yo.roles.includes('ADMINISTRADOR'), false);
});

test('Escenario 8 · Auditoría: localizar en bitácora la anulación de la demostración', async () => {
  const r = await call('GET', '/auditoria?accion=ANULAR_VENTA', admin);
  assert.equal(r.status, 200, r.message);
  const ev = r.data.find((e) => e.entidadId === s.venta1.id);
  assert.ok(ev, 'la anulación está en la bitácora');
  assert.match(String(ev.detalle), new RegExp(`Cobro duplicado demo ${sfx}`), 'con el motivo');
  assert.ok(ev.user?.nombre || ev.usuario?.nombre || ev.userId, 'con el usuario');
  const cierre = await call('GET', '/auditoria?accion=CIERRE_CAJA', admin);
  assert.ok(cierre.data.some((e) => e.entidadId === s.turno.id), 'el cierre también');
});

test('Escenario 9 (parcial) · Integridad tras la demostración', async () => {
  // Backup and restore are demonstrated with scripts/backup-database.cjs and pg_restore (see tests/README.md).
  assert.equal((await call('GET', '/health')).status, 200);
  const ventas = (await call('GET', `/reportes/ventas?pointOfSaleId=${s.pos.id}`, admin)).data;
  assert.equal(ventas.resumen.totalVentas, 1, 'solo la venta mixta sigue completada');
  assert.equal(ventas.resumen.totalRecaudado, 6780);
});
