// Sale cancellation (POS-007, SEG-004): restores stock, reverses the PMS charge and keeps the sale
// as ANULADA with author, date and reason. Only possible while the original shift is still open.

import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { AuthenticatedUser } from '../../middleware/auth.middleware';
import { idField, operationError, parseOperation } from '../../utils/operation-validation';
import { lockOperation, lockShift } from '../../utils/transaction-lock';
import { changeStock } from '../../utils/stock-change';
import { revertirCargo } from '../../integrations/pms/pms-service';

// Cancels a completed sale. Requires VENTAS:ANULAR and is blocked when the sale has customer
// payments or credit notes, because those documents must be reversed first.
export async function cancelSale(prisma: PrismaClient, id: string, body: unknown, user: AuthenticatedUser) {
  const { motivo } = parseOperation(z.object({ motivo: idField }), body);
  if (!user.roles.includes('ADMINISTRADOR') && !user.permisos.includes('VENTAS:ANULAR')) {
    throw operationError('Se requiere permiso VENTAS:ANULAR', 403);
  }
  return prisma.$transaction(async tx => {
    const initial = await tx.sale.findUnique({ where: { id } });
    if (!initial) throw operationError('Venta no encontrada', 404);
    // An issued closing is immutable. Returns after the shift was closed
    // are handled with a credit note (FAC-005), not with a cancellation.
    await lockShift(tx, initial.cashShiftId);
    if (initial.customerId) await lockOperation(tx, `credito:${initial.customerId}`);
    const sale = await tx.sale.findUniqueOrThrow({ where: { id }, include: { cargoHabitacion: true } });
    if (sale.estado !== 'COMPLETADA') throw operationError('Solo se puede anular una venta completada', 409);
    const abonos = await tx.customerPaymentApplication.count({ where: { saleId: sale.id, payment: { estado: 'APLICADO' } } });
    if (abonos > 0) throw operationError('La venta tiene abonos aplicados; anule primero los abonos en Cuentas por cobrar', 409);
    const notas = await tx.creditNote.count({ where: { saleId: sale.id } });
    if (notas > 0) throw operationError('La venta tiene notas de crédito; las devoluciones adicionales se hacen con otra nota de crédito', 409);
    const movements = await tx.inventoryMovement.findMany({ where: { documentoReferencia: sale.consecutivo, tipo: 'SALIDA_VENTA' }, orderBy: [{ warehouseId: 'asc' }, { productId: 'asc' }, { id: 'asc' }] });
    // The ledger keeps the original warehouse and quantity, even if the catalog
    // or the point of sale changed after the sale.
    for (const movement of movements) {
      const balances = await changeStock(tx, movement.warehouseId, movement.productId, movement.cantidad);
      await tx.inventoryMovement.create({ data: {
        warehouseId: movement.warehouseId, productId: movement.productId, tipo: 'AJUSTE_POSITIVO',
        cantidad: movement.cantidad, ...balances, costoUnitario: movement.costoUnitario,
        documentoReferencia: sale.consecutivo, motivo: `Reintegro por anulación de venta (#${sale.consecutivo}): ${motivo}`, usuarioId: user.id,
      } });
    }
    if (sale.cargoHabitacion) {
      await revertirCargo(tx, sale.cargoHabitacion, motivo);
    }
    return tx.sale.update({ where: { id }, data: {
      estado: 'ANULADA', motivoAnulacion: motivo, usuarioAnulacionId: user.id, fechaAnulacion: new Date(),
    } });
  });
}
