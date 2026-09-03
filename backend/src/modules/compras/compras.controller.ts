import { Response } from 'express';
import { prisma } from '../../utils/prisma';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { registrarAuditoria } from '../../utils/audit';

// 1. CREAR ORDEN DE COMPRA (COM-004)
export const createOrdenCompra = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { supplierId, warehouseId, fechaEsperada, items, notas } = req.body;

  if (!supplierId || !warehouseId || !items || !items.length) {
    res.status(400).json({ success: false, message: 'Proveedor, bodega y al menos un producto son obligatorios' });
    return;
  }

  let subtotal = 0;
  let totalImpuesto = 0;
  const itemsProcesados: any[] = [];

  for (const it of items) {
    const prod = await prisma.product.findUnique({ where: { id: it.productId } });
    if (!prod) {
      res.status(400).json({ success: false, message: `Producto no encontrado: ${it.productId}` });
      return;
    }

    const cantidad = Number(it.cantidadSolicitada);
    const precio = Number(it.precioUnitario || prod.costo);
    const sub = cantidad * precio;
    const imp = sub * (Number(prod.impuesto) / 100);

    subtotal += sub;
    totalImpuesto += imp;

    itemsProcesados.push({
      productId: it.productId,
      cantidadSolicitada: cantidad,
      precioUnitario: precio,
      total: sub + imp,
    });
  }

  const total = subtotal + totalImpuesto;
  const countOrdenes = await prisma.purchaseOrder.count();
  const consecutivo = `OC-${String(countOrdenes + 1).padStart(6, '0')}`;

  const orden = await prisma.purchaseOrder.create({
    data: {
      consecutivo,
      supplierId,
      warehouseId,
      usuarioId: req.user!.id,
      fechaEsperada: fechaEsperada ? new Date(fechaEsperada) : null,
      estado: 'APROBADA',
      subtotal,
      impuesto: totalImpuesto,
      total,
      notas,
      details: {
        create: itemsProcesados,
      },
    },
    include: {
      supplier: true,
      warehouse: true,
      details: { include: { product: true } },
    },
  });

  await registrarAuditoria({
    userId: req.user?.id,
    accion: 'CREAR_ORDEN_COMPRA',
    entidad: 'PurchaseOrder',
    entidadId: orden.id,
    detalle: { consecutivo, supplierId, total, itemsCount: items.length },
    ip: req.ip,
  });

  res.status(201).json({
    success: true,
    message: 'Orden de compra creada exitosamente',
    data: orden,
  });
};

// 2. LISTAR ORDENES DE COMPRA (COM-008)
export const getOrdenesCompra = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { supplierId, estado } = req.query;
  const whereClause: any = {};
  if (supplierId) whereClause.supplierId = String(supplierId);
  if (estado) whereClause.estado = String(estado);

  const ordenes = await prisma.purchaseOrder.findMany({
    where: whereClause,
    include: {
      supplier: true,
      warehouse: true,
      usuario: { select: { nombre: true, username: true } },
      details: { include: { product: true } },
      receipts: { include: { details: true } },
    },
    orderBy: { fechaEmision: 'desc' },
  });

  res.json({ success: true, data: ordenes });
};

// 3. REGISTRAR RECEPCIÓN DE MERCADERÍA (TOTAL O PARCIAL) (COM-005, COM-006, COM-007)
export const registrarRecepcion = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { purchaseOrderId, facturaProveedor, items, notas } = req.body;
  // items: Array de { productId, cantidadRecibida, costoUnitario }

  if (!purchaseOrderId || !items || !items.length) {
    res.status(400).json({ success: false, message: 'Orden de compra e ítems recibidos son requeridos' });
    return;
  }

  const orden = await prisma.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    include: { details: true, warehouse: true },
  });

  if (!orden) {
    res.status(404).json({ success: false, message: 'Orden de compra no encontrada' });
    return;
  }

  if (['RECIBIDA_TOTAL', 'CANCELADA'].includes(orden.estado)) {
    res.status(400).json({ success: false, message: `La orden ya se encuentra en estado ${orden.estado}` });
    return;
  }

  const countRec = await prisma.purchaseReceipt.count();
  const consecutivo = `REC-${String(countRec + 1).padStart(6, '0')}`;

  const recepcion = await prisma.$transaction(async (tx) => {
    // 1. Crear documento de recepción vinculando la factura del proveedor (COM-007)
    const rec = await tx.purchaseReceipt.create({
      data: {
        consecutivo,
        purchaseOrderId: orden.id,
        facturaProveedor: facturaProveedor || null,
        warehouseId: orden.warehouseId,
        usuarioId: req.user!.id,
        notas,
        details: {
          create: items.map((it: any) => ({
            productId: it.productId,
            cantidadRecibida: it.cantidadRecibida,
            costoUnitario: it.costoUnitario || 0,
          })),
        },
      },
      include: { details: true },
    });

    // 2. Incrementar stock en la bodega y registrar Kardex de entrada (INV-003, COM-005)
    for (const it of items) {
      const cant = Number(it.cantidadRecibida);
      if (cant <= 0) continue;

      const prod = await tx.product.findUnique({ where: { id: it.productId } });
      const stockAct = await tx.stock.findUnique({
        where: { warehouseId_productId: { warehouseId: orden.warehouseId, productId: it.productId } },
      });

      const salAnt = stockAct ? Number(stockAct.cantidad) : 0;
      const salNue = salAnt + cant;

      await tx.stock.upsert({
        where: { warehouseId_productId: { warehouseId: orden.warehouseId, productId: it.productId } },
        update: { cantidad: salNue },
        create: {
          warehouseId: orden.warehouseId,
          productId: it.productId,
          cantidad: salNue,
        },
      });

      // Movimiento inmutable de entrada en Kardex
      await tx.inventoryMovement.create({
        data: {
          warehouseId: orden.warehouseId,
          productId: it.productId,
          tipo: 'ENTRADA_COMPRA',
          cantidad: cant,
          saldoAnterior: salAnt,
          saldoNuevo: salNue,
          costoUnitario: it.costoUnitario || prod?.costo || 0,
          documentoReferencia: `${orden.consecutivo} / ${consecutivo}`,
          motivo: `Recepción de compra (#${consecutivo}) - Factura: ${facturaProveedor || 'N/A'}`,
          usuarioId: req.user!.id,
        },
      });

      // Actualizar cantidad acumulada recibida en la orden
      const detOrden = orden.details.find((d) => d.productId === it.productId);
      if (detOrden) {
        const acumulado = Number(detOrden.cantidadRecibida) + cant;
        await tx.purchaseOrderDetail.update({
          where: { id: detOrden.id },
          data: { cantidadRecibida: acumulado },
        });
      }
    }

    // 3. Evaluar si la orden fue recibida total o parcialmente (COM-006)
    const detallesActualizados = await tx.purchaseOrderDetail.findMany({
      where: { purchaseOrderId: orden.id },
    });

    const todoRecibido = detallesActualizados.every(
      (d) => Number(d.cantidadRecibida) >= Number(d.cantidadSolicitada)
    );

    const nuevoEstado = todoRecibido ? 'RECIBIDA_TOTAL' : 'RECIBIDA_PARCIAL';
    await tx.purchaseOrder.update({
      where: { id: orden.id },
      data: { estado: nuevoEstado },
    });

    return rec;
  });

  await registrarAuditoria({
    userId: req.user?.id,
    accion: 'RECEPCION_COMPRA',
    entidad: 'PurchaseReceipt',
    entidadId: recepcion.id,
    detalle: { consecutivo, ordenConsecutivo: orden.consecutivo, facturaProveedor, itemsCount: items.length },
    ip: req.ip,
  });

  res.status(201).json({
    success: true,
    message: 'Recepción registrada e inventario actualizado con éxito',
    data: recepcion,
  });
};
