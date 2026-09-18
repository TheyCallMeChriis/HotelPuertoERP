import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { AuthenticatedUser } from '../../middleware/auth.middleware';
import { idField, operationError, parseOperation } from '../../utils/operation-validation';
import { lockOperation, lockShift } from '../../utils/transaction-lock';
import { changeStock } from '../../utils/stock-change';

export async function cancelSale(prisma: PrismaClient, id: string, body: unknown, user: AuthenticatedUser) {
  const { motivo } = parseOperation(z.object({ motivo: idField }), body);
  if (!user.roles.includes('ADMINISTRADOR') && !user.permisos.includes('VENTAS:ANULAR')) {
    throw operationError('Se requiere permiso VENTAS:ANULAR', 403);
  }
  return prisma.$transaction(async tx => {
    const initial = await tx.sale.findUnique({ where: { id } });
    if (!initial) throw operationError('Venta no encontrada', 404);
    // Un cierre ya emitido es inmutable. La devolución posterior a un cierre
    // requiere un flujo compensatorio, todavía no implementado.
    await lockShift(tx, initial.cashShiftId);
    if (initial.customerId) await lockOperation(tx, `credito:${initial.customerId}`);
    const sale = await tx.sale.findUniqueOrThrow({ where: { id }, include: { cargoHabitacion: true } });
    if (sale.estado !== 'COMPLETADA') throw operationError('Solo se puede anular una venta completada', 409);
    const movements = await tx.inventoryMovement.findMany({ where: { documentoReferencia: sale.consecutivo, tipo: 'SALIDA_VENTA' }, orderBy: [{ warehouseId: 'asc' }, { productId: 'asc' }, { id: 'asc' }] });
    // El Kardex conserva la bodega y cantidad originales, incluso si el catálogo
    // o el punto de venta se modificaron después de vender.
    for (const movement of movements) {
      const balances = await changeStock(tx, movement.warehouseId, movement.productId, movement.cantidad);
      await tx.inventoryMovement.create({ data: {
        warehouseId: movement.warehouseId, productId: movement.productId, tipo: 'AJUSTE_POSITIVO',
        cantidad: movement.cantidad, ...balances, costoUnitario: movement.costoUnitario,
        documentoReferencia: sale.consecutivo, motivo: `Reintegro por anulación de venta (#${sale.consecutivo}): ${motivo}`, usuarioId: user.id,
      } });
    }
    if (sale.cargoHabitacion) {
      await tx.roomCharge.update({ where: { id: sale.cargoHabitacion.id }, data: {
        estadoPMS: 'ANULADO', respuestaPMS: JSON.stringify({ code: 'PMS_SIMULATED_REVERSAL', message: 'Cargo anulado en el simulador local', motivo }),
      } });
      await tx.pMSIntegrationQueue.updateMany({ where: { roomChargeId: sale.cargoHabitacion.id, estado: { in: ['PENDIENTE', 'FALLIDO'] } },
        data: { estado: 'CANCELADO', ultimoError: 'Venta anulada; no reenviar el cargo' } });
    }
    return tx.sale.update({ where: { id }, data: {
      estado: 'ANULADA', motivoAnulacion: motivo, usuarioAnulacionId: user.id, fechaAnulacion: new Date(),
    } });
  });
}
