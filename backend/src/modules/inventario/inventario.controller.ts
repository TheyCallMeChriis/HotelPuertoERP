import { Response } from 'express';
import { prisma } from '../../utils/prisma';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { registrarAuditoria } from '../../utils/audit';
import { changeStock } from '../../utils/stock-change';
import { nextConsecutive } from '../../utils/transaction-lock';
import { operationError, parseOperation } from '../../utils/operation-validation';
import { adjustmentSchema, movementSchema, transferSchema } from './inventory-validation';

// 1. OBTENER EXISTENCIAS (con filtro de bodega y alerta de stock mínimo INV-002, INV-009)
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

  // Mapear con bandera de alerta si cantidad <= stockMinimo
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

// 2. KARDEX INMUTABLE POR PRODUCTO (INV-008)
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
    orderBy: { fecha: 'asc' },
  });

  res.json({ success: true, data: movimientos });
};

// 3. MOVIMIENTO MANUAL DE INVENTARIO: ENTRADA O SALIDA CON MOTIVO (INV-003, INV-004, INV-010)
export const registrarMovimientoManual = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { warehouseId, productId, tipo, cantidad, motivo } = parseOperation(movementSchema, req.body);
  const cantNum = cantidad;
  if (tipo.startsWith('AJUSTE_') && !req.user?.roles.includes('ADMINISTRADOR')
    && !req.user?.permisos.includes('INVENTARIO:AJUSTE')) {
    throw operationError('Se requiere permiso INVENTARIO:AJUSTE para realizar ajustes', 403);
  }

  const prod = await prisma.product.findUnique({ where: { id: productId } });
  if (!prod?.activo || prod.esServicio) {
    res.status(404).json({ success: false, message: 'Producto no encontrado' });
    return;
  }

  const esEntrada = ['ENTRADA_COMPRA', 'AJUSTE_POSITIVO'].includes(tipo);

  // Transacción atómica: actualizar existencia y registrar Kardex
  const mov = await prisma.$transaction(async (tx) => {
    const { saldoAnterior, saldoNuevo } = await changeStock(tx, warehouseId, productId,
      esEntrada ? cantidad : cantidad.negated());

    return await tx.inventoryMovement.create({
      data: {
        warehouseId,
        productId,
        tipo,
        cantidad: cantNum,
        saldoAnterior,
        saldoNuevo,
        costoUnitario: prod.costo,
        documentoReferencia: 'MOV-MANUAL',
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
    detalle: { warehouseId, productId, tipo, cantidad: cantNum, saldoAnterior: mov.saldoAnterior, saldoNuevo: mov.saldoNuevo, motivo },
    ip: req.ip,
  });

  res.status(201).json({
    success: true,
    message: 'Movimiento de inventario registrado exitosamente',
    data: mov,
  });
};

// 4. TRASLADO ENTRE BODEGAS (INV-005)
export const realizarTraslado = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { warehouseOrigenId, warehouseDestinoId, items, notas } = parseOperation(transferSchema, req.body);

  if (warehouseOrigenId === warehouseDestinoId) {
    res.status(400).json({ success: false, message: 'La bodega de origen y destino no pueden ser la misma' });
    return;
  }


  // Transacción atómica de traslado
  const traslado = await prisma.$transaction(async (tx) => {
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

      // 1. Rebajar en Origen
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
          costoUnitario: prod?.costo || 0,
          documentoReferencia: consecutivo,
          motivo: `Traslado hacia ${trf.warehouseDestino.nombre} (#${consecutivo})`,
          usuarioId: req.user!.id,
        },
      });

      // 2. Incrementar en Destino
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
          costoUnitario: prod?.costo || 0,
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

// 5. AJUSTE DE INVENTARIO (INV-006)
export const realizarAjuste = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { warehouseId, tipo, motivo, items } = parseOperation(adjustmentSchema, req.body);


  const ajuste = await prisma.$transaction(async (tx) => {
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
