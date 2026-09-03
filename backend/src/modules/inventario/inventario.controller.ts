import { Response } from 'express';
import { prisma } from '../../utils/prisma';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { registrarAuditoria } from '../../utils/audit';

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
  const { warehouseId, productId, tipo, cantidad, motivo } = req.body;

  if (!warehouseId || !productId || !tipo || !cantidad || !motivo) {
    res.status(400).json({ success: false, message: 'Bodega, producto, tipo, cantidad y motivo son obligatorios' });
    return;
  }

  const cantNum = Number(cantidad);
  if (cantNum <= 0) {
    res.status(400).json({ success: false, message: 'La cantidad debe ser mayor a cero' });
    return;
  }

  const prod = await prisma.product.findUnique({ where: { id: productId } });
  if (!prod) {
    res.status(404).json({ success: false, message: 'Producto no encontrado' });
    return;
  }

  // Obtener stock actual
  const stockActual = await prisma.stock.findUnique({
    where: { warehouseId_productId: { warehouseId, productId } },
  });

  const saldoAnterior = stockActual ? Number(stockActual.cantidad) : 0;
  let saldoNuevo = saldoAnterior;

  const esEntrada = ['ENTRADA_COMPRA', 'AJUSTE_POSITIVO'].includes(tipo);
  const esSalida = ['SALIDA_VENTA', 'AJUSTE_NEGATIVO', 'MERMA'].includes(tipo);

  if (!esEntrada && !esSalida) {
    res.status(400).json({ success: false, message: 'Tipo de movimiento no válido' });
    return;
  }

  if (esEntrada) {
    saldoNuevo = saldoAnterior + cantNum;
  } else {
    if (saldoAnterior < cantNum) {
      res.status(400).json({
        success: false,
        message: `Existencia insuficiente. Disponible: ${saldoAnterior}, Cantidad a rebajar: ${cantNum}`,
      });
      return;
    }
    saldoNuevo = saldoAnterior - cantNum;
  }

  // Transacción atómica: actualizar existencia y registrar Kardex
  const mov = await prisma.$transaction(async (tx) => {
    await tx.stock.upsert({
      where: { warehouseId_productId: { warehouseId, productId } },
      update: { cantidad: saldoNuevo },
      create: {
        warehouseId,
        productId,
        cantidad: saldoNuevo,
      },
    });

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
    detalle: { warehouseId, productId, tipo, cantidad: cantNum, saldoAnterior, saldoNuevo, motivo },
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
  const { warehouseOrigenId, warehouseDestinoId, items, notas } = req.body;

  if (!warehouseOrigenId || !warehouseDestinoId || !items || !items.length) {
    res.status(400).json({ success: false, message: 'Bodega origen, bodega destino y al menos un producto son requeridos' });
    return;
  }

  if (warehouseOrigenId === warehouseDestinoId) {
    res.status(400).json({ success: false, message: 'La bodega de origen y destino no pueden ser la misma' });
    return;
  }

  const countTraslados = await prisma.warehouseTransfer.count();
  const consecutivo = `TRF-${String(countTraslados + 1).padStart(6, '0')}`;

  // Validar disponibilidad de stock en origen
  for (const it of items) {
    const stockOrigen = await prisma.stock.findUnique({
      where: { warehouseId_productId: { warehouseId: warehouseOrigenId, productId: it.productId } },
    });

    const cant = Number(it.cantidad);
    const disponible = stockOrigen ? Number(stockOrigen.cantidad) : 0;
    if (disponible < cant) {
      res.status(400).json({
        success: false,
        message: `Stock insuficiente en bodega origen para el producto ${it.productId}. Disponible: ${disponible}, Solicitado: ${cant}`,
      });
      return;
    }
  }

  // Transacción atómica de traslado
  const traslado = await prisma.$transaction(async (tx) => {
    const trf = await tx.warehouseTransfer.create({
      data: {
        consecutivo,
        warehouseOrigenId,
        warehouseDestinoId,
        usuarioId: req.user!.id,
        estado: 'COMPLETADO',
        notas,
        details: {
          create: items.map((it: any) => ({
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
      const cant = Number(it.cantidad);
      const prod = await tx.product.findUnique({ where: { id: it.productId } });

      // 1. Rebajar en Origen
      const stockOri = await tx.stock.findUnique({
        where: { warehouseId_productId: { warehouseId: warehouseOrigenId, productId: it.productId } },
      });
      const salOriAnt = stockOri ? Number(stockOri.cantidad) : 0;
      const salOriNue = salOriAnt - cant;

      await tx.stock.update({
        where: { warehouseId_productId: { warehouseId: warehouseOrigenId, productId: it.productId } },
        data: { cantidad: salOriNue },
      });

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
      const stockDes = await tx.stock.findUnique({
        where: { warehouseId_productId: { warehouseId: warehouseDestinoId, productId: it.productId } },
      });
      const salDesAnt = stockDes ? Number(stockDes.cantidad) : 0;
      const salDesNue = salDesAnt + cant;

      await tx.stock.upsert({
        where: { warehouseId_productId: { warehouseId: warehouseDestinoId, productId: it.productId } },
        update: { cantidad: salDesNue },
        create: {
          warehouseId: warehouseDestinoId,
          productId: it.productId,
          cantidad: salDesNue,
        },
      });

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
    detalle: { consecutivo, warehouseOrigenId, warehouseDestinoId, itemsCount: items.length },
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
  const { warehouseId, tipo, motivo, items } = req.body;

  if (!warehouseId || !tipo || !motivo || !items || !items.length) {
    res.status(400).json({ success: false, message: 'Bodega, tipo (POSITIVO/NEGATIVO), motivo e items son requeridos' });
    return;
  }

  const countAjustes = await prisma.inventoryAdjustment.count();
  const consecutivo = `AJU-${String(countAjustes + 1).padStart(6, '0')}`;

  const ajuste = await prisma.$transaction(async (tx) => {
    const aju = await tx.inventoryAdjustment.create({
      data: {
        consecutivo,
        warehouseId,
        tipo,
        motivo,
        usuarioId: req.user!.id,
        details: {
          create: items.map((it: any) => ({
            productId: it.productId,
            cantidad: it.cantidad,
            costoUnitario: it.costoUnitario || 0,
          })),
        },
      },
      include: { details: true },
    });

    for (const it of items) {
      const cant = Number(it.cantidad);
      const stockAct = await tx.stock.findUnique({
        where: { warehouseId_productId: { warehouseId, productId: it.productId } },
      });

      const salAnt = stockAct ? Number(stockAct.cantidad) : 0;
      const salNue = tipo === 'POSITIVO' ? salAnt + cant : Math.max(0, salAnt - cant);

      await tx.stock.upsert({
        where: { warehouseId_productId: { warehouseId, productId: it.productId } },
        update: { cantidad: salNue },
        create: {
          warehouseId,
          productId: it.productId,
          cantidad: salNue,
        },
      });

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
    detalle: { consecutivo, warehouseId, tipo, motivo },
    ip: req.ip,
  });

  res.status(201).json({
    success: true,
    message: 'Ajuste de inventario aplicado exitosamente',
    data: ajuste,
  });
};
