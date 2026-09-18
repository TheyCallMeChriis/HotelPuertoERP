const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
require('../backend/node_modules/ts-node').register({ project: path.join(__dirname, '../backend/tsconfig.json'), transpileOnly: true });
const { validateEnvironment, seedPasswords } = require('../backend/src/config/validate-env.ts');
const { parseCustomer } = require('../backend/src/modules/catalogos/customer-validation.ts');
const valid = { JWT_SECRET: 'test-only-secret-with-at-least-32-characters', DATABASE_URL: 'postgresql://test@127.0.0.1/test', JWT_EXPIRES_IN: '2h' };

test('configuración rechaza secretos ausentes y placeholders sin exponer valores', () => {
  for (const JWT_SECRET of [undefined, '', 'corto', 'cambiar_por_un_secreto_seguro_en_produccion']) {
    assert.throws(() => validateEnvironment({ ...valid, JWT_SECRET }), /JWT_SECRET es obligatorio/);
  }
  assert.equal(validateEnvironment(valid).JWT_EXPIRES_IN, 7200);
});
test('configuración valida base, puerto y duración JWT', () => {
  for (const DATABASE_URL of ['', 'http://host/base', 'postgresql://host']) assert.throws(() => validateEnvironment({ ...valid, DATABASE_URL }), /DATABASE_URL/);
  for (const PORT of ['0', '65536', '4000basura', '4.5']) assert.throws(() => validateEnvironment({ ...valid, PORT }), /PORT/);
  for (const JWT_EXPIRES_IN of ['0h', '8', '-1h', 'abc']) assert.throws(() => validateEnvironment({ ...valid, JWT_EXPIRES_IN }), /JWT_EXPIRES_IN/);
});
test('seed exige contraseñas explícitas y diferentes antes de escribir datos', () => {
  assert.throws(() => seedPasswords({}), /SEED_ADMIN_PASSWORD/);
  assert.throws(() => seedPasswords({ SEED_ADMIN_PASSWORD: 'password-de-prueba', SEED_OPERATOR_PASSWORD: 'password-de-prueba' }), /diferentes/);
  assert.equal(seedPasswords({ SEED_ADMIN_PASSWORD: 'admin-solo-prueba', SEED_OPERATOR_PASSWORD: 'operador-solo-prueba' }).admin, 'admin-solo-prueba');
});
test('crear clientes valida condiciones de crédito y exige autorización independiente', () => {
  const user = { roles: ['CAJERO'], permisos: ['CLIENTES:CREAR'] };
  const body = { identificacion: 'test', nombre: 'Prueba' };
  assert.equal(parseCustomer(body, user).creditoActivo, false);
  assert.throws(() => parseCustomer({ ...body, creditoActivo: 'false' }, user), e => e.statusCode === 400);
  for (const extra of [{ creditoActivo: true }, { limiteCredito: 100 }, { diasCredito: 30 }]) {
    assert.throws(() => parseCustomer({ ...body, ...extra }, user), e => e.statusCode === 403);
  }
  const authorized = { ...user, permisos: ['CLIENTES:EDITAR'] };
  assert.throws(() => parseCustomer({ ...body, creditoActivo: true, limiteCredito: 100, diasCredito: 0 }, authorized), e => e.statusCode === 400);
  assert.equal(parseCustomer({ ...body, creditoActivo: true, limiteCredito: 100, diasCredito: 30 }, authorized).limiteCredito.toString(), '100');
});
