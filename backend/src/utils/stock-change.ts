import { Prisma } from '@prisma/client';
import { operationError } from './operation-validation';

// Debe ejecutarse dentro de la misma transacción que el documento y su Kardex.
// El decremento condicionado comprueba y modifica el saldo en una única escritura.
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
    // La escritura mantiene el bloqueo de esta fila hasta terminar la transacción.
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
