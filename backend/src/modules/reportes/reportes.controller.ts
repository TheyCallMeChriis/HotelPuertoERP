import { Response } from 'express';
import { prisma } from '../../utils/prisma';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';

// 1. DASHBOARD / INDICADORES OPERATIVOS DEL DÍA (REP-008)
export const getDashboardKPIs = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  const hoyInicio = new Date();
  hoyInicio.setHours(0, 0, 0, 0);

  const hoyFin = new Date();
  hoyFin.setHours(23, 59, 59, 999);

  // Ventas de hoy completadas
  const ventasHoy = await prisma.sale.findMany({
    where: {
      estado: 'COMPLETADA',
      createdAt: { gte: hoyInicio, lte: hoyFin },
    },
    include: {
      payments: { include: { paymentMethod: true } },
    },
  });

  const totalVentasMonto = ventasHoy.reduce((acc, v) => acc + Number(v.total), 0);
  const totalTransacciones = ventasHoy.length;
  const ticketPromedio = totalTransacciones > 0 ? totalVentasMonto / totalTransacciones : 0;

  // Cajas abiertas en este momento
  const cajasAbiertas = await prisma.cashShift.count({
    where: { estado: 'ABIERTA' },
  });

  // Alerta de productos bajo mínimo de stock (REP-008, INV-009)
  const stocks = await prisma.stock.findMany({
    include: { product: true, warehouse: true },
  });
  const productosBajoStock = stocks.filter((s) => Number(s.cantidad) <= Number(s.stockMinimo));

  // Ventas por medio de pago hoy
  const mediosPagoMap: Record<string, number> = {};
  for (const v of ventasHoy) {
    for (const p of v.payments) {
      const metodo = p.paymentMethod.nombre;
      mediosPagoMap[metodo] = (mediosPagoMap[metodo] || 0) + Number(p.monto);
    }
  }

  res.json({
    success: true,
    data: {
      ventasHoy: totalVentasMonto,
      transaccionesHoy: totalTransacciones,
      ticketPromedio,
      cajasAbiertas,
      alertasStockBajo: productosBajoStock.length,
      detalleAlertasStock: productosBajoStock.map((s) => ({
        producto: s.product.nombre,
        codigo: s.product.codigo,
        bodega: s.warehouse.nombre,
        disponible: Number(s.cantidad),
        minimo: Number(s.stockMinimo),
      })),
      desgloseMediosPagoHoy: mediosPagoMap,
    },
  });
};

// 2. REPORTE DE VENTAS DETALLADO POR FECHA, POS, USUARIO (REP-001)
export const getReporteVentas = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { fechaInicio, fechaFin, pointOfSaleId, usuarioId } = req.query;

  const whereClause: any = { estado: 'COMPLETADA' };
  if (pointOfSaleId) whereClause.pointOfSaleId = String(pointOfSaleId);
  if (usuarioId) whereClause.usuarioId = String(usuarioId);

  if (fechaInicio && fechaFin) {
    whereClause.createdAt = {
      gte: new Date(String(fechaInicio)),
      lte: new Date(String(fechaFin)),
    };
  }

  const ventas = await prisma.sale.findMany({
    where: whereClause,
    include: {
      pointOfSale: true,
      usuario: { select: { nombre: true, username: true } },
      customer: true,
      payments: { include: { paymentMethod: true } },
      details: { include: { product: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const totalRecaudado = ventas.reduce((sum, v) => sum + Number(v.total), 0);
  const totalSubtotal = ventas.reduce((sum, v) => sum + Number(v.subtotal), 0);
  const totalImpuestos = ventas.reduce((sum, v) => sum + Number(v.impuesto), 0);
  const totalDescuentos = ventas.reduce((sum, v) => sum + Number(v.descuento), 0);

  res.json({
    success: true,
    data: {
      resumen: {
        totalVentas: ventas.length,
        totalRecaudado,
        totalSubtotal,
        totalImpuestos,
        totalDescuentos,
      },
      ventas,
    },
  });
};

// 3. REPORTE DE RECAUDACIÓN POR FORMA DE PAGO (REP-002)
export const getReporteFormasPago = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { fechaInicio, fechaFin } = req.query;

  const whereClause: any = { sale: { estado: 'COMPLETADA' } };
  if (fechaInicio && fechaFin) {
    whereClause.createdAt = {
      gte: new Date(String(fechaInicio)),
      lte: new Date(String(fechaFin)),
    };
  }

  const pagos = await prisma.salePayment.findMany({
    where: whereClause,
    include: {
      paymentMethod: true,
      sale: { select: { consecutivo: true, createdAt: true } },
    },
  });

  const agrupado: Record<string, { codigo: string; nombre: string; total: number; cantidadTransacciones: number }> = {};

  for (const p of pagos) {
    const key = p.paymentMethod.id;
    if (!agrupado[key]) {
      agrupado[key] = {
        codigo: p.paymentMethod.codigo,
        nombre: p.paymentMethod.nombre,
        total: 0,
        cantidadTransacciones: 0,
      };
    }
    agrupado[key].total += Number(p.monto);
    agrupado[key].cantidadTransacciones += 1;
  }

  res.json({
    success: true,
    data: Object.values(agrupado),
  });
};

// 4. REPORTE DE SOBRANTES Y FALTANTES DE CAJA (REP-007)
export const getReporteDiferenciasCaja = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  const cierresConDiferencia = await prisma.cashShift.findMany({
    where: {
      estado: 'CERRADA',
      diferencia: { not: 0 },
    },
    include: {
      caja: true,
      usuario: { select: { nombre: true, username: true } },
    },
    orderBy: { fechaCierre: 'desc' },
  });

  res.json({
    success: true,
    data: cierresConDiferencia.map((c) => ({
      id: c.id,
      caja: c.caja.nombre,
      cajero: c.usuario.nombre,
      fechaApertura: c.fechaApertura,
      fechaCierre: c.fechaCierre,
      montoEsperado: Number(c.montoEsperado),
      montoContado: Number(c.montoContado),
      diferencia: Number(c.diferencia),
      tipo: Number(c.diferencia) > 0 ? 'SOBRANTE' : 'FALTANTE',
      notas: c.notas,
    })),
  });
};
