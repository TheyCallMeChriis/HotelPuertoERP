const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
require('../backend/node_modules/ts-node').register({ project: path.join(__dirname, '../backend/tsconfig.json'), transpileOnly: true });
const { quantityField, moneyField } = require('../backend/src/utils/operation-validation.ts');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('../backend/node_modules/typescript');
const moneyPath = path.join(__dirname, '../frontend/src/utils/sale-money.ts');
const moneyModule = new Module(moneyPath, module);
moneyModule._compile(ts.transpileModule(fs.readFileSync(moneyPath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, moneyPath);
const { calculateLine, sumMoney, toCents } = moneyModule.exports;
const { Prisma } = require('../backend/node_modules/@prisma/client');

test('validación numérica rechaza tipos, signos, precisión y rangos inválidos', () => {
  for (const value of [undefined, null, true, false, [], {}, '', ' ', 'abc', 'Infinity', Infinity, NaN, -1, '-1', 0, 0.0001, 1e9]) {
    assert.equal(quantityField.safeParse(value).success, false, String(value));
  }
  for (const value of [0.001, -0.01, 1e10, 'abc', false]) assert.equal(moneyField.safeParse(value).success, false);
  assert.equal(quantityField.parse('0.001').toString(), '0.001');
  assert.equal(moneyField.parse(0).toString(), '0');
  assert.equal(moneyField.parse('123.45').toString(), '123.45');
});

test('POS suma centavos y conserva pagos parciales sin tolerancia', () => {
  assert.equal(sumMoney([0.1, 0.2]), 0.3);
  assert.equal(sumMoney([99.96, 0.04]), 100);
  assert.notEqual(toCents(99.96), toCents(100));
  assert.ok(Number.isNaN(toCents(1.001)));
  assert.ok(Number.isNaN(toCents(-1)));
});

test('redondeo del POS coincide con aritmética Decimal por línea', () => {
  for (const quantity of [1, 3, 0.5, 0.001, 1.235]) {
    for (const price of [0.01, 0.1, 0.29, 1.15, 19.99, 99.99]) {
      for (const tax of [0, 1, 4, 13, 13.25]) {
        const gross = new Prisma.Decimal(quantity).mul(price).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        const expectedTax = gross.mul(tax).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        assert.deepEqual(calculateLine(quantity, price, tax), {
          subtotal: gross.toNumber(), impuesto: expectedTax.toNumber(), total: gross.plus(expectedTax).toNumber(),
        });
      }
    }
  }
});

test('descuentos negativos, excesivos o fraccionarios se rechazan en POS', () => {
  for (const discount of [-1, 11, 0.001, NaN]) assert.throws(() => calculateLine(1, 10, 13, discount));
  assert.deepEqual(calculateLine(2, 10, 13, 5), { subtotal: 15, impuesto: 1.95, total: 16.95 });
});
