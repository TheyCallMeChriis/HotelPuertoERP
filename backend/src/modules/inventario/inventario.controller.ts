// Inventory endpoints: stock, stock ledger, manual movements, transfers, adjustments and stock levels.
// Every stock change and its ledger entry are written in the same transaction.

import { Response } from 'express';
import { prisma } from '../../utils/prisma';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { registrarAuditoria } from '../../utils/audit';
import { changeStock } from '../../utils/stock-change';
import { nextConsecutive } from '../../utils/transaction-lock';
import { operationError, parseOperation } from '../../utils/operation-validation';
import { adjustmentSchema, ENTRY_TYPES, movementSchema, stockLevelSchema, transferSchema } from './inventory-validation';
import type { Prisma } from '@prisma/client';

// Stock can only move in or out of an active warehouse (GEN-010: inactive records keep history only)
async function assertActiveWarehouse(tx: Prisma.TransactionClient, id: string, rol = 'La bodega') {
  const bodega = await tx.warehouse.findUnique({ where: { id } });
  if (!bodega?.activo) throw operationError(`${rol} no existe o está inactiva`);
  return bodega;
}

// 1. GET STOCK (warehouse filter and minimum stock alert, INV-002, INV-009)
export const getExistencias = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { warehouseId, soloBajoMinimo } = req.query;

  const whereClause: any = {};
  if (warehouseId) {
    whereClause.warehouseId = String(warehouseId);
  }

  const stocks = await prisma.stock.findMany({
    where: whereClause,
    include: {
      product: { include: { categoria: true } },
      warehouse: true,
    },
    orderBy: { product: { nombre: 'asc' } },
  });

  // Flag products whose quantity is at or below the minimum
  const resultado = stocks.map((s) => {
    const cantidad = Number(s.cantidad);
    const min = Number(s.stockMinimo);
    return {
      ...s,
      bajoMinimo: cantidad <= min,
    };
  });

  const filtrados = soloBajoMinimo === 'true' ? resultado.filter((s) => s.bajoMinimo) : resultado;

  res.json({ success: true, data: filtrados });
};

// 2. IMMUTABLE STOCK LEDGER PER PRODUCT (INV-008)
export const getKardexByProducto = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { productId } = req.params;
  const { warehouseId } = req.query;

  const whereClause: any = { productId };
  if (warehouseId) {
    whereClause.warehouseId = String(warehouseId);
  }

  const movimientos = await prisma.inventoryMovement.findMany({
    where: whereClause,
    include: {
      warehouse: true,
      product: true,
      usuario: { select: { nombre: true, username: true } },
    },
    orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
  });

  res.json({ success: true, data: movimientos });
};

// 3. MANUAL INVENTORY MOVEMENT: ENTRY OR EXIT WITH A REASON (INV-003, INV-004, INV-010)
export const registrarMovimientoManual = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { warehouseId, productId, tipo, cantidad, motivo } = parseOperation(movementSchema, req.body);
  if (tipo.startsWith('AJUSTE_') && !req.user?.roles.includes('ADMINISTRADOR')
    && !req.user?.permisos.includes('INVENTARIO:AJUSTE')) {
    throw operationError('Se requiere permiso INVENTARIO:AJUSTE para realizar ajustes', 403);
  }

  const prod = await prisma.product.findUnique({ where: { id: productId } });
  if (!prod?.activo || prod.esServicio) {
    res.status(404).json({ success: false, message: 'Producto no encontrado' });
    return;
  }

  const esEntrada = ENTRY_TYPES.includes(tipo);

  // Atomic transaction: update stock and write the ledger entry
  const mov = await prisma.$transaction(async (tx) => {
    await assertActiveWarehouse(tx, warehouseId);
    const { saldoAnterior, saldoNuevo } = await changeStock(tx, warehouseId, productId,
      esEntrada ? cantidad : cantidad.negated());

    return await tx.inventoryMovement.create({
      data: {
        warehouseId,
        productId,
        tipo,
        cantidad,
        saldoAnterior,
        saldoNuevo,
        costoUnitario: prod.costo,
        documentoReferencia: tipo === 'MERMA' ? 'MERMA' : 'MOV-MANUAL',
        motivo,
        usuarioId: req.user!.id,
      },
      include: { product: true, warehouse: true },
    });
  });

  await registrarAuditoria({
    userId: req.user?.id,
    accion: 'MOVIMIENTO_INVENTARIO',
    entidad: 'InventoryMovement',
    entidadId: mov.id,
    detalle: { warehouseId, productId, tipo, cantidad, saldoAnterior: mov.saldoAnterior, saldoNuevo: mov.saldoNuevo, motivo },
    ip: req.ip,
  });

  res.status(201).json({
    success: true,
    message: 'Movimiento de inventario registrado exitosamente',
    data: mov,
  });
};

// 4. TRANSFER BETWEEN WAREHOUSES (INV-005)
export const realizarTraslado = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { warehouseOrigenId, warehouseDestinoId, items, notas } = parseOperation(transferSchema, req.body);

  if (warehouseOrigenId === warehouseDestinoId) {
    res.status(400).json({ success: false, message: 'La bodega de origen y destino no pueden ser la misma' });
    return;
  }

  // Atomic transfer transaction
  const traslado = await prisma.$transaction(async (tx) => {
    await assertActiveWarehouse(tx, warehouseOrigenId, 'La bodega de origen');
    await assertActiveWarehouse(tx, warehouseDestinoId, 'La bodega de destino');
    const consecutivo = await nextConsecutive(tx, 'TRF');
    const trf = await tx.warehouseTransfer.create({
      data: {
        consecutivo,
        warehouseOrigenId,
        warehouseDestinoId,
        usuarioId: req.user!.id,
        estado: 'COMPLETADO',
        notas,
        details: {
          create: items.map((it) => ({
            productId: it.productId,
            cantidad: it.cantidad,
          })),
        },
      },
      include: {
        details: { include: { product: true } },
        warehouseOrigen: true,
        warehouseDestino: true,
      },
    });

    for (const it of items) {
      const cant = it.cantidad;
      const prod = await tx.product.findUnique({ where: { id: it.productId } });
      if (!prod?.activo || prod.esServicio) throw operationError('Producto de inventario no disponible');

      // 1. Decrease stock at the origin
      const { saldoAnterior: salOriAnt, saldoNuevo: salOriNue } =
        await changeStock(tx, warehouseOrigenId, it.productId, cant.negated());

      await tx.inventoryMovement.create({
        data: {
          warehouseId: warehouseOrigenId,
          productId: it.productId,
          tipo: 'TRASLADO_SALIDA',
          cantidad: cant,
          saldoAnterior: salOriAnt,
          saldoNuevo: salOriNue,
          costoUnitario: prod.costo,
          documentoReferencia: consecutivo,
          motivo: `Traslado hacia ${trf.warehouseDestino.nombre} (#${consecutivo})`,
          usuarioId: req.user!.id,
        },
      });

      // 2. Increase stock at the destination
      const { saldoAnterior: salDesAnt, saldoNuevo: salDesNue } =
        await changeStock(tx, warehouseDestinoId, it.productId, cant);

      await tx.inventoryMovement.create({
        data: {
          warehouseId: warehouseDestinoId,
          productId: it.productId,
          tipo: 'TRASLADO_ENTRADA',
          cantidad: cant,
          saldoAnterior: salDesAnt,
          saldoNuevo: salDesNue,
          costoUnitario: prod.costo,
          documentoReferencia: consecutivo,
          motivo: `Traslado recibido desde ${trf.warehouseOrigen.nombre} (#${consecutivo})`,
          usuarioId: req.user!.id,
        },
      });
    }

    return trf;
  });

  await registrarAuditoria({
    userId: req.user?.id,
    accion: 'TRASLADO_BODEGA',
    entidad: 'WarehouseTransfer',
    entidadId: traslado.id,
    detalle: { consecutivo: traslado.consecutivo, warehouseOrigenId, warehouseDestinoId, itemsCount: items.length },
    ip: req.ip,
  });

  res.status(201).json({
    success: true,
    message: 'Traslado completado exitosamente',
    data: traslado,
  });
};

// 5. INVENTORY ADJUSTMENT (INV-006)
export const realizarAjuste = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { warehouseId, tipo, motivo, items } = parseOperation(adjustmentSchema, req.body);

  const ajuste = await prisma.$transaction(async (tx) => {
    await assertActiveWarehouse(tx, warehouseId);
    const consecutivo = await nextConsecutive(tx, 'AJU');
    const aju = await tx.inventoryAdjustment.create({
      data: {
        consecutivo,
        warehouseId,
        tipo,
        motivo,
        usuarioId: req.user!.id,
        details: {
          create: items.map((it) => ({
            productId: it.productId,
            cantidad: it.cantidad,
            costoUnitario: it.costoUnitario || 0,
          })),
        },
      },
      include: { details: true },
    });

    for (const it of items) {
      const cant = it.cantidad;
      const prod = await tx.product.findUnique({ where: { id: it.productId } });
      if (!prod?.activo || prod.esServicio) throw operationError('Producto de inventario no disponible');
      const { saldoAnterior: salAnt, saldoNuevo: salNue } = await changeStock(tx, warehouseId,
        it.productId, tipo === 'POSITIVO' ? cant : cant.negated());

      await tx.inventoryMovement.create({
        data: {
          warehouseId,
          productId: it.productId,
          tipo: tipo === 'POSITIVO' ? 'AJUSTE_POSITIVO' : 'AJUSTE_NEGATIVO',
          cantidad: cant,
          saldoAnterior: salAnt,
          saldoNuevo: salNue,
          costoUnitario: it.costoUnitario || 0,
          documentoReferencia: consecutivo,
          motivo: `Ajuste de inventario (#${consecutivo}): ${motivo}`,
          usuarioId: req.user!.id,
        },
      });
    }

    return aju;
  });

  await registrarAuditoria({
    userId: req.user?.id,
    accion: 'AJUSTE_INVENTARIO',
    entidad: 'InventoryAdjustment',
    entidadId: ajuste.id,
    detalle: { consecutivo: ajuste.consecutivo, warehouseId, tipo, motivo },
    ip: req.ip,
  });

  res.status(201).json({
    success: true,
    message: 'Ajuste de inventario aplicado exitosamente',
    data: ajuste,
  });
};

// 6. CONFIGURE MINIMUM/MAXIMUM STOCK (INV-009). Does not change the quantity.
export const configurarNivelesStock = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const input = parseOperation(stockLevelSchema, req.body);
  const [bodega, producto] = await Promise.all([
    prisma.warehouse.findUnique({ where: { id: input.warehouseId } }),
    prisma.product.findUnique({ where: { id: input.productId } }),
  ]);
  if (!bodega?.activo) throw operationError('La bodega no existe o está inactiva');
  if (!producto || producto.esServicio) throw operationError('Producto no encontrado o es un servicio');

  const anterior = await prisma.stock.findUnique({
    where: { warehouseId_productId: { warehouseId: input.warehouseId, productId: input.productId } },
  });
  const stock = await prisma.stock.upsert({
    where: { warehouseId_productId: { warehouseId: input.warehouseId, productId: input.productId } },
    update: { stockMinimo: input.stockMinimo, stockMaximo: input.stockMaximo },
    create: {
      warehouseId: input.warehouseId, productId: input.productId,
      stockMinimo: input.stockMinimo, stockMaximo: input.stockMaximo ?? 1000,
    },
  });
  await registrarAuditoria({
    userId: req.user?.id, accion: 'CONFIGURAR_MINIMOS', entidad: 'Stock', entidadId: stock.id, ip: req.ip,
    detalle: {
      producto: producto.codigo, bodega: bodega.codigo,
      antes: anterior ? { minimo: anterior.stockMinimo, maximo: anterior.stockMaximo } : null,
      ahora: { minimo: stock.stockMinimo, maximo: stock.stockMaximo },
    },
  });
  res.json({ success: true, message: 'Niveles de existencia actualizados', data: stock });
};
