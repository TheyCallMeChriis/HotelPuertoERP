// Atomic stock updates.
import { Prisma } from '@prisma/client';
import { operationError } from './operation-validation';

// Must run inside the same transaction as the document and its ledger entry.
// The conditional decrement checks and updates the balance in a single write.
export async function changeStock(
  tx: Prisma.TransactionClient,
  warehouseId: string,
  productId: string,
  change: Prisma.Decimal,
) {
  if (!change.isFinite() || change.isZero() || change.decimalPlaces() > 3) {
    throw operationError('La cantidad del movimiento no es válida');
  }
  const where = { warehouseId_productId: { warehouseId, productId } };
  let saldoNuevo: Prisma.Decimal;
  if (change.lt(0)) {
    const result = await tx.stock.updateMany({
      where: { warehouseId, productId, cantidad: { gte: change.negated() } },
      data: { cantidad: { decrement: change.negated() } },
    });
    if (result.count !== 1) throw operationError('Existencias insuficientes. La operación no se ha aplicado.');
    // The write keeps this row locked until the transaction ends.
    const stock = await tx.stock.findUniqueOrThrow({ where });
    saldoNuevo = stock.cantidad;
  } else {
    const stock = await tx.stock.upsert({
      where,
      update: { cantidad: { increment: change } },
      create: { warehouseId, productId, cantidad: change },
    });
    saldoNuevo = stock.cantidad;
  }
  return { saldoAnterior: saldoNuevo.minus(change), saldoNuevo };
}
