import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { idField, moneyField, operationError, optionalText, parseOperation, paymentField } from '../../utils/operation-validation';
import { lockOperation, lockShift } from '../../utils/transaction-lock';

const openSchema = z.object({ cajaId: idField, montoInicial: moneyField, notas: optionalText });
const movementSchema = z.object({ cashShiftId: idField, tipo: z.enum(['ENTRADA_EXTRAORDINARIA', 'SALIDA_EXTRAORDINARIA']), monto: paymentField, motivo: idField });
const closeSchema = z.object({ cashShiftId: idField, montoContado: moneyField, notas: optionalText });

export async function openCash(prisma: PrismaClient, body: unknown, userId: string) {
  const input = parseOperation(openSchema, body);
  return prisma.$transaction(async tx => {
    await lockOperation(tx, `caja:${input.cajaId}`);
    const register = await tx.cashRegister.findUnique({ where: { id: input.cajaId } });
    if (!register?.activo) throw operationError('Caja no disponible');
    if (await tx.cashShift.findFirst({ where: { cajaId: input.cajaId, estado: 'ABIERTA' } })) {
      throw operationError('Esta caja ya tiene un turno abierto', 409);
    }
    return tx.cashShift.create({ data: { ...input, usuarioId: userId, estado: 'ABIERTA' }, include: { caja: true } });
  });
}

export async function recordCashMovement(prisma: PrismaClient, body: unknown, userId: string) {
  const input = parseOperation(movementSchema, body);
  return prisma.$transaction(async tx => {
    await lockShift(tx, input.cashShiftId);
    return tx.cashMovement.create({ data: { ...input, usuarioId: userId } });
  });
}

export async function closeCash(prisma: PrismaClient, body: unknown) {
  const input = parseOperation(closeSchema, body);
  return prisma.$transaction(async tx => {
    await lockShift(tx, input.cashShiftId);
    const shift = await tx.cashShift.findUniqueOrThrow({ where: { id: input.cashShiftId }, include: {
      movements: true, ventas: { where: { estado: 'COMPLETADA' }, include: { payments: { include: { paymentMethod: true } } } },
    } });
    const totals: Record<string, Prisma.Decimal> = {};
    for (const sale of shift.ventas) for (const payment of sale.payments) {
      const key = payment.paymentMethod.codigo;
      totals[key] = (totals[key] ?? new Prisma.Decimal(0)).plus(payment.monto);
    }
    let entries = new Prisma.Decimal(0);
    let exits = new Prisma.Decimal(0);
    for (const movement of shift.movements) {
      if (movement.tipo === 'ENTRADA_EXTRAORDINARIA') entries = entries.plus(movement.monto);
      else if (movement.tipo === 'SALIDA_EXTRAORDINARIA') exits = exits.plus(movement.monto);
      else throw operationError('El turno contiene un movimiento de tipo desconocido; revise sus datos antes de cerrar');
    }
    const cash = totals.EFECTIVO ?? new Prisma.Decimal(0);
    const expected = shift.montoInicial.plus(cash).plus(entries).minus(exits);
    const difference = input.montoContado.minus(expected);
    if (expected.abs().gte('10000000000') || difference.abs().gte('10000000000')) {
      throw operationError('Los importes del cierre exceden el rango permitido');
    }
    const cierre = await tx.cashShift.update({ where: { id: shift.id }, data: {
      estado: 'CERRADA', fechaCierre: new Date(), montoContado: input.montoContado,
      montoEsperado: expected, diferencia: difference, notas: input.notas ?? shift.notas,
    }, include: { caja: true, usuario: { select: { nombre: true, username: true } } } });
    // Conserva la forma numérica de la respuesta consumida por la interfaz.
    const number = (key: string) => (totals[key] ?? new Prisma.Decimal(0)).toNumber();
    return { cierre, resumen: {
      fondoInicial: shift.montoInicial.toNumber(), totalEfectivoVentas: cash.toNumber(),
      entradasExtra: entries.toNumber(), salidasExtra: exits.toNumber(), montoEsperado: expected.toNumber(),
      montoContado: input.montoContado.toNumber(), diferencia: difference.toNumber(),
      tipoDiferencia: difference.isZero() ? 'CUADRADA' : difference.gt(0) ? 'SOBRANTE' : 'FALTANTE',
      totalesPorMedioPago: { efectivo: cash.toNumber(), tarjeta: number('TARJETA'), sinpe: number('SINPE_MOVIL'), credito: number('CREDITO'), cargoHabitacion: number('CARGO_HABITACION') },
    } };
  });
}
