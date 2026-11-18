import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { AuthenticatedUser } from '../../middleware/auth.middleware';
import { D, idField, operationError, optionalText, parseOperation, paymentField } from '../../utils/operation-validation';
import { lockOperation, lockShift, nextConsecutive } from '../../utils/transaction-lock';

// Accounts receivable (CLI-004, CLI-005, CLI-006).
// A receivable document is the CREDITO portion of a completed sale. Each customer payment
// is applied to one or more documents; the balance is the credit amount minus payments and credit notes.

type Tx = Prisma.TransactionClient | PrismaClient;
const DIA = 86_400_000;
// Aging buckets used by statements and the aging report
export const TRAMOS = ['CORRIENTE', '1-30', '31-60', '61-90', 'MAS_90'] as const;
export type Tramo = typeof TRAMOS[number];

// Bucket for a number of overdue days (≤ 0 means current)
export function tramo(diasVencido: number): Tramo {
  if (diasVencido <= 0) return 'CORRIENTE';
  if (diasVencido <= 30) return '1-30';
  if (diasVencido <= 60) return '31-60';
  if (diasVencido <= 90) return '61-90';
  return 'MAS_90';
}

// Credit documents of one customer (or all customers) with their balance at the cut-off date
export async function documentosPorCobrar(db: Tx, opts: { customerId?: string; corte?: Date } = {}) {
  const corte = opts.corte ?? new Date();
  const ventas = await db.sale.findMany({
    where: {
      estado: 'COMPLETADA',
      ...(opts.customerId ? { customerId: opts.customerId } : { customerId: { not: null } }),
      payments: { some: { paymentMethod: { codigo: 'CREDITO' } } },
      createdAt: { lte: corte },
    },
    include: {
      customer: { select: { id: true, diasCredito: true } },
      payments: { where: { paymentMethod: { codigo: 'CREDITO' } } },
      abonosAplicados: { where: { payment: { estado: 'APLICADO', createdAt: { lte: corte } } } },
      // FAC-005: credit notes refunded to credit reduce the debt
      notasCredito: { where: { paymentMethod: { codigo: 'CREDITO' }, createdAt: { lte: corte } } },
    },
    orderBy: [{ createdAt: 'asc' }, { consecutivo: 'asc' }],
  });
  return ventas.map((v) => {
    const montoCredito = v.payments.reduce((s, p) => s.plus(p.monto), D());
    const abonado = v.abonosAplicados.reduce((s, a) => s.plus(a.monto), D());
    const notasCredito = v.notasCredito.reduce((s, n) => s.plus(n.total), D());
    const vencimiento = v.fechaVencimiento ?? new Date(v.createdAt.getTime() + (v.customer?.diasCredito ?? 0) * DIA);
    const diasVencido = Math.floor((startOfDay(corte).getTime() - startOfDay(vencimiento).getTime()) / DIA);
    const saldo = montoCredito.minus(abonado).minus(notasCredito);
    return {
      customerId: v.customerId as string,
      saleId: v.id, consecutivo: v.consecutivo, fecha: v.createdAt, vencimiento,
      montoCredito, abonado, notasCredito, saldo, diasVencido, tramo: tramo(diasVencido),
    };
  });
}

// Due dates are compared by calendar day, not by time of day
function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Outstanding balance used to validate the credit limit on credit sales (CLI-004)
export async function saldoCliente(db: Tx, customerId: string) {
  const docs = await documentosPorCobrar(db, { customerId });
  return docs.reduce((s, d) => s.plus(d.saldo), D());
}

const abonoSchema = z.object({
  customerId: idField,
  paymentMethodId: idField,
  monto: paymentField,
  saleId: idField.nullish(), // when omitted, the payment is applied to the oldest documents
  cashShiftId: idField.nullish(),
  referencia: optionalText,
  notas: optionalText,
});

// Records a customer payment and applies it to the requested document or to the oldest ones.
// Overpayment is rejected; cash requires an open shift so it is included in the cash count.
export async function registrarAbono(prisma: PrismaClient, body: unknown, user: AuthenticatedUser) {
  const input = parseOperation(abonoSchema, body);
  return prisma.$transaction(async (tx) => {
    await lockOperation(tx, `credito:${input.customerId}`);
    const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
    if (!customer) throw operationError('Cliente no encontrado', 404);
    const method = await tx.paymentMethod.findUnique({ where: { id: input.paymentMethodId } });
    if (!method?.activo) throw operationError('Forma de pago no disponible');
    if (['CREDITO', 'CARGO_HABITACION'].includes(method.codigo)) throw operationError('Un abono no puede pagarse a crédito ni con cargo a habitación');
    if (method.codigo === 'EFECTIVO' && !input.cashShiftId) throw operationError('Los abonos en efectivo requieren un turno de caja abierto');
    if (input.cashShiftId) await lockShift(tx, input.cashShiftId);

    const docs = (await documentosPorCobrar(tx, { customerId: customer.id })).filter((d) => d.saldo.gt(0));
    const saldoTotal = docs.reduce((s, d) => s.plus(d.saldo), D());
    if (saldoTotal.lte(0)) throw operationError('El cliente no tiene saldo pendiente');

    let destino = docs;
    if (input.saleId) {
      destino = docs.filter((d) => d.saleId === input.saleId);
      if (destino.length === 0) throw operationError('El documento indicado no pertenece al cliente o no tiene saldo pendiente');
      if (input.monto.gt(destino[0].saldo)) throw operationError(`El abono supera el saldo del documento (${destino[0].saldo.toFixed(2)})`);
    } else if (input.monto.gt(saldoTotal)) {
      throw operationError(`El abono supera el saldo pendiente del cliente (${saldoTotal.toFixed(2)})`);
    }

    // Apply to the oldest documents first
    let restante = input.monto;
    const aplicaciones: Array<{ saleId: string; monto: Prisma.Decimal; consecutivo: string }> = [];
    for (const d of destino) {
      if (restante.lte(0)) break;
      const parte = Prisma.Decimal.min(restante, d.saldo);
      aplicaciones.push({ saleId: d.saleId, monto: parte, consecutivo: d.consecutivo });
      restante = restante.minus(parte);
    }

    const consecutivo = await nextConsecutive(tx, 'ABO');
    const abono = await tx.customerPayment.create({
      data: {
        consecutivo, customerId: customer.id, usuarioId: user.id, paymentMethodId: method.id,
        cashShiftId: input.cashShiftId ?? null, monto: input.monto,
        referencia: input.referencia ?? null, notas: input.notas ?? null,
        aplicaciones: { create: aplicaciones.map((a) => ({ saleId: a.saleId, monto: a.monto })) },
      },
      include: abonoInclude,
    });
    return { abono, saldoAnterior: saldoTotal, saldoNuevo: saldoTotal.minus(input.monto), documentos: aplicaciones.map((a) => a.consecutivo) };
  });
}

// Voids a payment (CLIENTES:ANULAR), restoring the balance; its shift must still be open.
export async function anularAbono(prisma: PrismaClient, id: string, body: unknown, user: AuthenticatedUser) {
  const { motivo } = parseOperation(z.object({ motivo: idField }), body);
  if (!user.roles.includes('ADMINISTRADOR') && !user.permisos.includes('CLIENTES:ANULAR')) {
    throw operationError('Se requiere permiso CLIENTES:ANULAR', 403);
  }
  return prisma.$transaction(async (tx) => {
    const inicial = await tx.customerPayment.findUnique({ where: { id } });
    if (!inicial) throw operationError('Abono no encontrado', 404);
    await lockOperation(tx, `credito:${inicial.customerId}`);
    // Cash from an already closed shift cannot change the issued closing
    if (inicial.cashShiftId) await lockShift(tx, inicial.cashShiftId);
    const abono = await tx.customerPayment.findUniqueOrThrow({ where: { id } });
    if (abono.estado !== 'APLICADO') throw operationError('El abono ya fue anulado', 409);
    return tx.customerPayment.update({
      where: { id },
      data: { estado: 'ANULADO', motivoAnulacion: motivo, usuarioAnulacionId: user.id, fechaAnulacion: new Date() },
      include: abonoInclude,
    });
  });
}

// Relations returned with every customer payment
export const abonoInclude = {
  paymentMethod: { select: { codigo: true, nombre: true } },
  usuario: { select: { nombre: true, username: true } },
  usuarioAnulacion: { select: { nombre: true } },
  aplicaciones: { include: { sale: { select: { consecutivo: true } } } },
} as const;

// Sums outstanding balances per aging bucket
export function resumirTramos(docs: Array<{ saldo: Prisma.Decimal; tramo: Tramo }>) {
  const t: Record<Tramo, Prisma.Decimal> = { CORRIENTE: D(), '1-30': D(), '31-60': D(), '61-90': D(), MAS_90: D() };
  for (const d of docs) if (d.saldo.gt(0)) t[d.tramo] = t[d.tramo].plus(d.saldo);
  return t;
}
