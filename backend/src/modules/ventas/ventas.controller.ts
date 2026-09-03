import { Response } from 'express';
import { prisma } from '../../utils/prisma';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { registrarAuditoria } from '../../utils/audit';
import crypto from 'crypto';

// 1. CREAR VENTA (POS-001, POS-002, POS-004, POS-009, POS-010, CAJ-002, INV-010)
export const createVenta = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const {
    pointOfSaleId,
    customerId,
    items, // Array de { productId, cantidad, precioUnitario, descuento, notas }
    pagos, // Array de { paymentMethodId, monto, referencia }
    notas,
    cargoHabitacion, // Opcional { roomId, guestId } si una forma de pago es CARGO_HABITACION
  } = req.body;

  if (!pointOfSaleId || !items || !items.length || !pagos || !pagos.length) {
    res.status(400).json({
      success: false,
      message: 'Punto de venta, al menos un producto y al menos una forma de pago son requeridos',
    });
    return;
  }

  // 1. Validar Punto de Venta y Caja Asociada
  const pos = await prisma.pointOfSale.findUnique({
    where: { id: pointOfSaleId },
    include: { caja: true, bodegaDefecto: true },
  });

  if (!pos || !pos.activo) {
    res.status(400).json({ success: false, message: 'Punto de venta no válido o inactivo' });
    return;
  }

  // 2. Validar que la caja tenga un turno ABIERTO (CAJ-002)
  const turnoActivo = await prisma.cashShift.findFirst({
    where: {
      cajaId: pos.cajaId,
      estado: 'ABIERTA',
    },
  });

  if (!turnoActivo) {
    res.status(400).json({
      success: false,
      message: 'Bloqueado: La caja del punto de venta no se encuentra abierta. Debe abrir la caja para realizar ventas.',
    });
    return;
  }

  // 3. Validar Descuentos y Permisos (POS-004)
  const tieneDescuentos = items.some((item: any) => Number(item.descuento || 0) > 0);
  if (tieneDescuentos) {
    const puedeDescontar =
      req.user?.roles.includes('ADMINISTRADOR') || req.user?.permisos.includes('VENTAS:DESCUENTO');
    if (!puedeDescontar) {
      res.status(403).json({
        success: false,
        message: 'No tiene permiso autorizado para aplicar descuentos en la venta',
      });
      return;
    }
  }

  // 4. Calcular Totales y Validar Stock
  let subtotalVenta = 0;
  let totalImpuestoVenta = 0;
  let totalDescuentoVenta = 0;
  const itemsProcesados: any[] = [];

  for (const item of items) {
    const prod = await prisma.product.findUnique({ where: { id: item.productId } });
    if (!prod || !prod.activo) {
      res.status(400).json({ success: false, message: `Producto no disponible: ${item.productId}` });
      return;
    }

    const cantidad = Number(item.cantidad);
    const precioUnitario = Number(item.precioUnitario || prod.precioVenta);
    const descuento = Number(item.descuento || 0);

    if (cantidad <= 0) {
      res.status(400).json({ success: false, message: 'La cantidad debe ser mayor a 0' });
      return;
    }

    // Si no es servicio, verificar existencia en la bodega por defecto del POS (INV-010)
    if (!prod.esServicio) {
      const stockActual = await prisma.stock.findUnique({
        where: {
          warehouseId_productId: {
            warehouseId: pos.bodegaDefectoId,
            productId: prod.id,
          },
        },
      });

      const existenciaDisponible = stockActual ? Number(stockActual.cantidad) : 0;
      if (existenciaDisponible < cantidad) {
        res.status(400).json({
          success: false,
          message: `Stock insuficiente para '${prod.nombre}'. Disponible: ${existenciaDisponible}, Requerido: ${cantidad}`,
        });
        return;
      }
    }

    const subtotalLinea = cantidad * precioUnitario - descuento;
    const porcentajeIva = Number(prod.impuesto) / 100;
    const impuestoLinea = subtotalLinea * porcentajeIva;
    const totalLinea = subtotalLinea + impuestoLinea;

    subtotalVenta += subtotalLinea;
    totalImpuestoVenta += impuestoLinea;
    totalDescuentoVenta += descuento;

    itemsProcesados.push({
      productId: prod.id,
      nombre: prod.nombre,
      costo: prod.costo,
      esServicio: prod.esServicio,
      cantidad,
      precioUnitario,
      descuento,
      subtotal: subtotalLinea,
      impuesto: impuestoLinea,
      total: totalLinea,
      notas: item.notas || null,
    });
  }

  const totalVenta = subtotalVenta + totalImpuestoVenta;

  // 5. Validar Pagos (POS-010: La suma de pagos debe coincidir exactamente con el total)
  let totalPagado = 0;
  let esPagoHabitacion = false;

  for (const pago of pagos) {
    const montoPago = Number(pago.monto);
    if (montoPago <= 0) {
      res.status(400).json({ success: false, message: 'El monto de pago debe ser mayor a cero' });
      return;
    }
    totalPagado += montoPago;

    const metodo = await prisma.paymentMethod.findUnique({ where: { id: pago.paymentMethodId } });
    if (metodo?.codigo === 'CARGO_HABITACION') {
      esPagoHabitacion = true;
    }
  }

  // Comprobar diferencia (tolerancia centavos por redondeo)
  if (Math.abs(totalPagado - totalVenta) > 0.05) {
    res.status(400).json({
      success: false,
      message: `El total de pagos (${totalPagado.toFixed(2)}) no coincide con el total de la venta (${totalVenta.toFixed(2)})`,
    });
    return;
  }

  // 6. Si es cargo a habitación, validar habitación ocupada (PMS-003)
  if (esPagoHabitacion) {
    if (!cargoHabitacion || !cargoHabitacion.roomId || !cargoHabitacion.guestId) {
      res.status(400).json({
        success: false,
        message: 'Para cargos a habitación se requiere especificar habitación y huésped',
      });
      return;
    }

    const hab = await prisma.room.findUnique({ where: { id: cargoHabitacion.roomId } });
    if (!hab || hab.estado !== 'OCUPADA') {
      res.status(400).json({
        success: false,
        message: 'La habitación indicada no se encuentra ocupada para recibir cargos',
      });
      return;
    }
  }

  // 7. Generar Consecutivo de Venta único (e.g. VTA-000001)
  const countVentas = await prisma.sale.count();
  const consecutivo = `VTA-${String(countVentas + 1).padStart(6, '0')}`;

  // 8. Transacción Atómica: Guardar Venta, Detalles, Pagos, Rebajar Stock y Generar Kardex
  const ventaFinal = await prisma.$transaction(async (tx) => {
    const sale = await tx.sale.create({
      data: {
        consecutivo,
        cashShiftId: turnoActivo.id,
        pointOfSaleId: pos.id,
        usuarioId: req.user!.id,
        customerId: customerId || null,
        subtotal: subtotalVenta,
        descuento: totalDescuentoVenta,
        impuesto: totalImpuestoVenta,
        total: totalVenta,
        estado: 'COMPLETADA',
        notas: notas || null,
        details: {
          create: itemsProcesados.map((it) => ({
            productId: it.productId,
            cantidad: it.cantidad,
            precioUnitario: it.precioUnitario,
            descuento: it.descuento,
            subtotal: it.subtotal,
            impuesto: it.impuesto,
            total: it.total,
            notas: it.notas,
          })),
        },
        payments: {
          create: pagos.map((p: any) => ({
            paymentMethodId: p.paymentMethodId,
            monto: p.monto,
            referencia: p.referencia || null,
          })),
        },
      },
      include: {
        details: { include: { product: true } },
        payments: { include: { paymentMethod: true } },
      },
    });

    // Descontar inventario y registrar Kardex inmutable para productos físicos
    for (const it of itemsProcesados) {
      if (!it.esServicio) {
        const stockActual = await tx.stock.findUnique({
          where: {
            warehouseId_productId: {
              warehouseId: pos.bodegaDefectoId,
              productId: it.productId,
            },
          },
        });

        const saldoAnterior = stockActual ? Number(stockActual.cantidad) : 0;
        const saldoNuevo = saldoAnterior - it.cantidad;

        // Actualizar tabla existencias
        await tx.stock.upsert({
          where: {
            warehouseId_productId: {
              warehouseId: pos.bodegaDefectoId,
              productId: it.productId,
            },
          },
          update: { cantidad: saldoNuevo },
          create: {
            warehouseId: pos.bodegaDefectoId,
            productId: it.productId,
            cantidad: saldoNuevo,
          },
        });

        // Registrar en bitácora inmutable de Kardex (INV-003, INV-008)
        await tx.inventoryMovement.create({
          data: {
            warehouseId: pos.bodegaDefectoId,
            productId: it.productId,
            tipo: 'SALIDA_VENTA',
            cantidad: it.cantidad,
            saldoAnterior,
            saldoNuevo,
            costoUnitario: it.costo,
            documentoReferencia: consecutivo,
            motivo: `Venta POS realizada (#${consecutivo})`,
            usuarioId: req.user!.id,
          },
        });
      }
    }

    // Si incluye cargo a habitación, registrar en la capa de integración PMS con UUID idempotente (PMS-004, PMS-005)
    if (esPagoHabitacion && cargoHabitacion) {
      const transaccionUuid = `TX-PMS-${crypto.randomUUID()}`;
      await tx.roomCharge.create({
        data: {
          saleId: sale.id,
          roomId: cargoHabitacion.roomId,
          guestId: cargoHabitacion.guestId,
          monto: totalVenta,
          transaccionUuid,
          estadoPMS: 'CONFIRMADO', // En simulación local se confirma automáticamente
          respuestaPMS: JSON.stringify({ status: 200, message: 'Cargo procesado con éxito en PMS' }),
        },
      });
    }

    return sale;
  });

  // Registrar Auditoría
  await registrarAuditoria({
    userId: req.user?.id,
    accion: 'CREAR_VENTA',
    entidad: 'Sale',
    entidadId: ventaFinal.id,
    detalle: {
      consecutivo,
      total: totalVenta,
      itemsCount: items.length,
      posNombre: pos.nombre,
    },
    ip: req.ip,
  });

  res.status(201).json({
    success: true,
    message: 'Venta completada exitosamente',
    data: ventaFinal,
  });
};

// 2. LISTAR VENTAS (con filtros por fecha, POS y estado)
export const getVentas = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { fechaInicio, fechaFin, pointOfSaleId, estado, busqueda } = req.query;

  const whereClause: any = {};

  if (estado) whereClause.estado = String(estado);
  if (pointOfSaleId) whereClause.pointOfSaleId = String(pointOfSaleId);

  if (fechaInicio && fechaFin) {
    whereClause.createdAt = {
      gte: new Date(String(fechaInicio)),
      lte: new Date(String(fechaFin)),
    };
  }

  if (busqueda) {
    whereClause.consecutivo = { contains: String(busqueda).trim(), mode: 'insensitive' };
  }

  const ventas = await prisma.sale.findMany({
    where: whereClause,
    include: {
      usuario: { select: { nombre: true, username: true } },
      customer: true,
      pointOfSale: true,
      details: { include: { product: true } },
      payments: { include: { paymentMethod: true } },
      cargoHabitacion: { include: { room: true, guest: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  res.json({ success: true, data: ventas });
};

// 3. CONSULTAR DETALLE DE VENTA / COMPROBANTE (FAC-001, FAC-002, POS-008)
export const getVentaById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);

  const venta = await prisma.sale.findUnique({
    where: { id },
    include: {
      usuario: { select: { id: true, nombre: true, username: true } },
      customer: true,
      pointOfSale: { include: { caja: true } },
      details: { include: { product: true } },
      payments: { include: { paymentMethod: true } },
      cargoHabitacion: { include: { room: true, guest: true } },
    },
  });

  if (!venta) {
    res.status(404).json({ success: false, message: 'Venta no encontrada' });
    return;
  }

  res.json({ success: true, data: venta });
};

// 4. ANULAR VENTA CON AUTORIZACIÓN Y MOTIVO (POS-007, SEG-004)
export const anularVenta = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const { motivo } = req.body;

  if (!motivo || !String(motivo).trim()) {
    res.status(400).json({ success: false, message: 'El motivo de anulación es estrictamente obligatorio' });
    return;
  }

  // Verificar permiso de anulación
  const puedeAnular =
    req.user?.roles.includes('ADMINISTRADOR') || req.user?.permisos.includes('VENTAS:ANULAR');

  if (!puedeAnular) {
    res.status(403).json({
      success: false,
      message: 'Acceso denegado: Se requiere autorización con permiso [VENTAS:ANULAR] para anular ventas',
    });
    return;
  }

  const venta = await prisma.sale.findUnique({
    where: { id },
    include: {
      details: { include: { product: true } },
      pointOfSale: true,
    },
  });

  if (!venta) {
    res.status(404).json({ success: false, message: 'Venta no encontrada' });
    return;
  }

  if (venta.estado === 'ANULADA') {
    res.status(400).json({ success: false, message: 'La venta ya se encuentra anulada' });
    return;
  }

  // Transacción atómica: Marcar anulada y reintegrar el inventario al kardex
  const ventaAnulada = await prisma.$transaction(async (tx) => {
    const actualizada = await tx.sale.update({
      where: { id },
      data: {
        estado: 'ANULADA',
        motivoAnulacion: motivo,
        usuarioAnulacionId: req.user!.id,
        fechaAnulacion: new Date(),
      },
    });

    // Reintegrar productos físicos al inventario
    for (const det of venta.details) {
      if (!det.product.esServicio) {
        const stockActual = await tx.stock.findUnique({
          where: {
            warehouseId_productId: {
              warehouseId: venta.pointOfSale.bodegaDefectoId,
              productId: det.productId,
            },
          },
        });

        const saldoAnterior = stockActual ? Number(stockActual.cantidad) : 0;
        const saldoNuevo = saldoAnterior + Number(det.cantidad);

        await tx.stock.upsert({
          where: {
            warehouseId_productId: {
              warehouseId: venta.pointOfSale.bodegaDefectoId,
              productId: det.productId,
            },
          },
          update: { cantidad: saldoNuevo },
          create: {
            warehouseId: venta.pointOfSale.bodegaDefectoId,
            productId: det.productId,
            cantidad: saldoNuevo,
          },
        });

        // Registrar movimiento compensatorio de reingreso por anulación en Kardex
        await tx.inventoryMovement.create({
          data: {
            warehouseId: venta.pointOfSale.bodegaDefectoId,
            productId: det.productId,
            tipo: 'AJUSTE_POSITIVO',
            cantidad: det.cantidad,
            saldoAnterior,
            saldoNuevo,
            costoUnitario: det.product.costo,
            documentoReferencia: venta.consecutivo,
            motivo: `Reintegro por anulación de venta (#${venta.consecutivo}): ${motivo}`,
            usuarioId: req.user!.id,
          },
        });
      }
    }

    return actualizada;
  });

  await registrarAuditoria({
    userId: req.user?.id,
    accion: 'ANULAR_VENTA',
    entidad: 'Sale',
    entidadId: id,
    detalle: {
      consecutivo: venta.consecutivo,
      motivo,
      usuarioAnulador: req.user?.username,
      totalRevertido: venta.total,
    },
    ip: req.ip,
  });

  res.json({
    success: true,
    message: 'Venta anulada y existencias reintegradas exitosamente',
    data: ventaAnulada,
  });
};
