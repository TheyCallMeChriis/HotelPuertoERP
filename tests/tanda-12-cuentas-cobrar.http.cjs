// Batch 12: accounts receivable — credit limit, partial payments, balance, statement,
// aging and cash count (CLI-004, CLI-005, CLI-006).
// End-to-end HTTP tests against a running API backed by a TEST database.
//
// Usage (PowerShell):
//   $env:API_URL='http://127.0.0.1:4000/api'; $env:ADMIN_USER='...'; $env:ADMIN_PASS='...'
//   $env:OPER_USER='cajero1'; $env:OPER_PASS='...'; $env:ALLOW_WRITE_TESTS='1'
//   node --test --test-concurrency=1 tests/tanda-12-cuentas-cobrar.http.cjs
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
const dia = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

let admin; let oper; const s = {};
const vender = (monto, token = admin) => call('POST', '/ventas', token, {
  pointOfSaleId: s.pos.id, customerId: s.cliente.id,
  items: [{ productId: s.prod.id, cantidad: monto / 1000 }],
  pagos: [{ paymentMethodId: s.credito.id, monto }],
});
const abonar = (body, token = oper) => call('POST', '/cxc/abonos', token, { customerId: s.cliente.id, ...body });
const estado = (q = '') => call('GET', `/cxc/clientes/${s.cliente.id}/estado-cuenta${q}`, admin);

test.before(async () => {
  admin = await login(process.env.ADMIN_USER || 'admin', process.env.ADMIN_PASS);
  oper = await login(process.env.OPER_USER || 'cajero1', process.env.OPER_PASS);
  const cat = ok(await call('POST', '/catalogos/categorias', admin, { nombre: `CxC ${sfx}` }), 'cat').data;
  s.bodega = ok(await call('POST', '/catalogos/bodegas', admin, { codigo: `CB-${sfx}`, nombre: `Bodega CxC ${sfx}` }), 'bodega').data;
  s.caja = ok(await call('POST', '/catalogos/cajas', admin, { codigo: `CC-${sfx}`, nombre: `Caja CxC ${sfx}` }), 'caja').data;
  await call('POST', '/catalogos/departamentos', admin, { codigo: `CD_${sfx}`, nombre: 'Depto CxC' });
  s.pos = ok(await call('POST', '/catalogos/puntos-venta', admin, { codigo: `CP-${sfx}`, nombre: `POS CxC ${sfx}`, departamento: `CD_${sfx}`, cajaId: s.caja.id, bodegaDefectoId: s.bodega.id }), 'pos').data;
  s.prod = ok(await call('POST', '/catalogos/productos', admin, { codigo: `CX-${sfx}`, nombre: `Servicio ${sfx}`, categoriaId: cat.id, precioVenta: 1000, costo: 100, impuesto: 0 }), 'prod').data;
  ok(await call('POST', '/inventario/movimiento', admin, { warehouseId: s.bodega.id, productId: s.prod.id, tipo: 'ENTRADA_MANUAL', cantidad: 500, motivo: 'Stock CxC' }), 'stock');
  s.cliente = ok(await call('POST', '/catalogos/clientes', admin, {
    tipoIdentificacion: 'CEDULA_FISICA', identificacion: cedula(), nombre: `Cliente crédito ${sfx}`,
    creditoActivo: true, limiteCredito: 50000, diasCredito: 30,
  }), 'cliente').data;
  const formas = (await call('GET', '/catalogos/formas-pago', admin)).data;
  for (const f of formas) s[f.codigo] = f;
  s.credito = s.CREDITO;
  s.turno = ok(await call('POST', '/caja/apertura', admin, { cajaId: s.caja.id, montoInicial: 5000 }), 'apertura').data;
});

test('CLI-004: el cupo se valida contra el saldo pendiente', async () => {
  s.A = ok(await vender(20000), 'venta A').data;
  s.B = ok(await vender(15000), 'venta B').data;
  const excede = await vender(20000);
  assert.equal(excede.status, 400, 'saldo 35000 + 20000 supera el límite de 50000');
  const cuentas = (await call('GET', '/cxc/clientes', admin)).data.find((c) => c.id === s.cliente.id);
  assert.equal(cuentas.saldo, 35000);
  assert.equal(cuentas.disponible, 15000);
  assert.equal(cuentas.documentosPendientes, 2);
});

test('CLI-005: abonos parciales reducen el saldo y quedan en el historial', async () => {
  const sinTurno = await abonar({ paymentMethodId: s.EFECTIVO.id, monto: 10000 });
  assert.equal(sinTurno.status, 400, 'efectivo sin turno de caja');
  const aCredito = await abonar({ paymentMethodId: s.credito.id, monto: 1000 });
  assert.equal(aCredito.status, 400, 'no se abona a crédito');

  const a1 = await abonar({ paymentMethodId: s.EFECTIVO.id, monto: 10000, cashShiftId: s.turno.id });
  assert.equal(a1.status, 201, a1.message);
  assert.match(a1.data.consecutivo, /^ABO-\d{6}$/);
  assert.equal(a1.data.saldoAnterior, 35000);
  assert.equal(a1.data.saldoNuevo, 25000);
  assert.deepEqual(a1.data.documentos, [s.A.consecutivo], 'se aplica al documento más antiguo');
  s.abono1 = a1.data;

  const a2 = await abonar({ paymentMethodId: s.SINPE_MOVIL.id, monto: 12000, saleId: s.B.id, referencia: `SINPE-${sfx}` });
  assert.equal(a2.status, 201, a2.message);
  const excedeDoc = await abonar({ paymentMethodId: s.SINPE_MOVIL.id, monto: 5000, saleId: s.B.id });
  assert.equal(excedeDoc.status, 400, 'el documento B solo debe 3000');
  const excedeTotal = await abonar({ paymentMethodId: s.SINPE_MOVIL.id, monto: 99999 });
  assert.equal(excedeTotal.status, 400, 'no se acepta saldo a favor');

  s.C = ok(await vender(20000), 'venta C tras liberar cupo').data;

  const e = (await estado()).data;
  assert.equal(e.resumen.saldo, 33000, '10000 (A) + 3000 (B) + 20000 (C)');
  assert.equal(e.resumen.totalAbonado, 22000);
  assert.equal(e.abonos.length, 2);
  const docA = e.documentos.find((d) => d.consecutivo === s.A.consecutivo);
  assert.equal(docA.abonado, 10000);
  assert.equal(docA.saldo, 10000);
  assert.equal(docA.estado, 'AL_DIA');
});

test('CLI-006: estado de cuenta con vencimientos y antigüedad de saldos', async () => {
  const hoy = (await estado()).data;
  assert.equal(hoy.resumen.vencido, 0);
  assert.equal(hoy.resumen.tramos.CORRIENTE, 33000);
  const venc = new Date(hoy.documentos[0].vencimiento);
  const esperado = new Date(); esperado.setDate(esperado.getDate() + 30);
  assert.ok(Math.abs(venc - esperado) < 2 * 86_400_000, 'vence según el plazo de 30 días');

  const futuro = (await estado(`?fechaCorte=${dia(45)}`)).data;
  assert.equal(futuro.resumen.vencido, 33000);
  assert.equal(futuro.resumen.tramos['1-30'], 33000, '45 días después de vender = 15 días vencido');
  assert.ok(futuro.documentos.filter((d) => d.saldo > 0).every((d) => d.estado === 'VENCIDO'));

  const lejano = (await estado(`?fechaCorte=${dia(130)}`)).data;
  assert.equal(lejano.resumen.tramos.MAS_90, 33000);

  const ant = await call('GET', `/cxc/antiguedad?fechaCorte=${dia(45)}`, admin);
  assert.equal(ant.status, 200, ant.message);
  const fila = ant.data.find((f) => f.customerId === s.cliente.id);
  assert.equal(fila.total, 33000);
  assert.equal(fila['1-30'], 33000);
  assert.equal((await call('GET', '/cxc/antiguedad?fechaCorte=2026-02-30', admin)).status, 400, 'fecha imposible');
});

test('Anulación de abonos con permiso y protección de ventas con abonos', async () => {
  const anularVenta = await call('POST', `/ventas/${s.A.id}/anular`, admin, { motivo: 'Prueba' });
  assert.equal(anularVenta.status, 409, 'la venta A tiene un abono aplicado');

  const sinPermiso = await call('POST', `/cxc/abonos/${s.abono1.id}/anular`, oper, { motivo: 'Error de digitación' });
  assert.equal(sinPermiso.status, 403);
  const anulado = await call('POST', `/cxc/abonos/${s.abono1.id}/anular`, admin, { motivo: 'Error de digitación' });
  assert.equal(anulado.status, 200, anulado.message);
  assert.equal(anulado.data.estado, 'ANULADO');
  assert.equal((await call('POST', `/cxc/abonos/${s.abono1.id}/anular`, admin, { motivo: 'otra vez' })).status, 409);
  assert.equal((await estado()).data.resumen.saldo, 43000, 'el saldo se restituye');

  ok(await call('POST', `/ventas/${s.A.id}/anular`, admin, { motivo: 'Venta de prueba' }), 'anular venta A sin abonos');
  const e = (await estado()).data;
  assert.equal(e.resumen.saldo, 23000, 'la venta anulada deja de cobrarse');
  assert.ok(!e.documentos.some((d) => d.consecutivo === s.A.consecutivo));
  assert.equal(e.abonos.find((a) => a.id === s.abono1.id).estado, 'ANULADO', 'el historial conserva el abono anulado');
});

test('Arqueo: el efectivo de los abonos se suma al cierre de caja', async () => {
  ok(await abonar({ paymentMethodId: s.EFECTIVO.id, monto: 2000, cashShiftId: s.turno.id }), 'abono efectivo');
  const turno = (await call('GET', `/caja/turno-activo?cajaId=${s.caja.id}`, admin)).data;
  assert.equal(turno.abonos.filter((a) => a.paymentMethod.codigo === 'EFECTIVO').reduce((t, a) => t + Number(a.monto), 0), 2000);
  // Float 5000 + payment 2000 (the 10000 one was voided); the sales were on credit
  const cierre = await call('POST', '/caja/cierre', admin, { cashShiftId: s.turno.id, montoContado: 7000 });
  assert.equal(cierre.status, 200, cierre.message);
  assert.equal(cierre.data.resumen.abonosEfectivo, 2000);
  assert.equal(cierre.data.resumen.montoEsperado, 7000);
  assert.equal(cierre.data.resumen.tipoDiferencia, 'CUADRADA');
  const rep = (await call('GET', `/reportes/cierres-caja?cajaId=${s.caja.id}`, admin)).data[0];
  assert.equal(rep.abonosEfectivo, 2000);

  const cerrado = await abonar({ paymentMethodId: s.EFECTIVO.id, monto: 1000, cashShiftId: s.turno.id });
  assert.equal(cerrado.status, 409, 'no se registran abonos en un turno cerrado');
});
