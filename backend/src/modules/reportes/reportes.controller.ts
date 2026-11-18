// Operating reports (/api/reportes). Every report returns rows plus a summary so the UI can show
// and export exactly the same figures (REP-001 to REP-009).

import { Response } from 'express';
import { prisma } from '../../utils/prisma';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { D, dateRange, money, optionalId, qty } from './report-filters';

// 1. DASHBOARD / TODAY'S OPERATING INDICATORS (REP-008)
export const getDashboardKPIs = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  const hoyInicio = new Date();
  hoyInicio.setHours(0, 0, 0, 0);

  const hoyFin = new Date();
  hoyFin.setHours(23, 59, 59, 999);

  // Today's completed sales
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

  // Cash registers currently open
  const cajasAbiertas = await prisma.cashShift.count({
    where: { estado: 'ABIERTA' },
  });

  // Products below minimum stock (REP-008, INV-009)
  const stocks = await prisma.stock.findMany({
    include: { product: true, warehouse: true },
  });
  const productosBajoStock = stocks.filter((s) => Number(s.cantidad) <= Number(s.stockMinimo));

  // Today's sales by payment method
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

// 2. REPORT FILTER OPTIONS (catalogs visible to Accounting without security permissions)
export const getOpcionesReportes = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  const [puntosVenta, usuarios, cajas, bodegas, proveedores, productos] = await Promise.all([
    prisma.pointOfSale.findMany({ select: { id: true, codigo: true, nombre: true }, orderBy: { nombre: 'asc' } }),
    prisma.user.findMany({ select: { id: true, username: true, nombre: true }, orderBy: { nombre: 'asc' } }),
    prisma.cashRegister.findMany({ select: { id: true, codigo: true, nombre: true }, orderBy: { nombre: 'asc' } }),
    prisma.warehouse.findMany({ select: { id: true, codigo: true, nombre: true }, orderBy: { nombre: 'asc' } }),
    prisma.supplier.findMany({ select: { id: true, identificacion: true, nombre: true }, orderBy: { nombre: 'asc' } }),
    prisma.product.findMany({ select: { id: true, codigo: true, nombre: true, esServicio: true }, orderBy: { nombre: 'asc' } }),
  ]);
  res.json({ success: true, data: { puntosVenta, usuarios, cajas, bodegas, proveedores, productos } });
};

// 3. SALES REPORT BY DATE, POINT OF SALE, USER AND PRODUCT (REP-001)
export const getReporteVentas = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const rango = dateRange(req.query);
  const pointOfSaleId = optionalId(req.query.pointOfSaleId);
  const usuarioId = optionalId(req.query.usuarioId);
  const productId = optionalId(req.query.productId);

  const where: any = { estado: 'COMPLETADA' };
  if (rango) where.createdAt = rango;
  if (pointOfSaleId) where.pointOfSaleId = pointOfSaleId;
  if (usuarioId) where.usuarioId = usuarioId;
  if (productId) where.details = { some: { productId } };

  const ventas = await prisma.sale.findMany({
    where,
    include: {
      pointOfSale: { select: { nombre: true } },
      usuario: { select: { nombre: true, username: true } },
      customer: { select: { nombre: true } },
      payments: { include: { paymentMethod: { select: { nombre: true, codigo: true } } } },
      details: productId ? { where: { productId } } : false,
    },
    orderBy: { createdAt: 'desc' },
  });

  const t = { subtotal: D(), descuento: D(), impuesto: D(), total: D(), cantidadProducto: D(), montoProducto: D() };
  const filas = ventas.map((v) => {
    t.subtotal = t.subtotal.plus(v.subtotal);
    t.descuento = t.descuento.plus(v.descuento);
    t.impuesto = t.impuesto.plus(v.impuesto);
    t.total = t.total.plus(v.total);
    const lineas = (v as any).details as Array<{ cantidad: any; total: any }> | undefined;
    const cantProd = (lineas ?? []).reduce((s, d) => s.plus(d.cantidad), D());
    const montoProd = (lineas ?? []).reduce((s, d) => s.plus(d.total), D());
    t.cantidadProducto = t.cantidadProducto.plus(cantProd);
    t.montoProducto = t.montoProducto.plus(montoProd);
    return {
      id: v.id,
      consecutivo: v.consecutivo,
      fecha: v.createdAt,
      puntoVenta: v.pointOfSale.nombre,
      usuario: v.usuario.nombre,
      cliente: v.customer?.nombre ?? 'Cliente general',
      mediosPago: v.payments.map((p) => `${p.paymentMethod.nombre}: ₡${money(D(p.monto)).toLocaleString('es-CR', { minimumFractionDigits: 2 })}`).join(' | '),
      subtotal: money(D(v.subtotal)),
      descuento: money(D(v.descuento)),
      impuesto: money(D(v.impuesto)),
      total: money(D(v.total)),
      ...(productId ? { cantidadProducto: qty(cantProd), montoProducto: money(montoProd) } : {}),
    };
  });

  const ncWhere: any = {};
  if (rango) ncWhere.createdAt = rango;
  if (pointOfSaleId || usuarioId) ncWhere.sale = { ...(pointOfSaleId ? { pointOfSaleId } : {}), ...(usuarioId ? { usuarioId } : {}) };
  const notas = productId
    ? (await prisma.creditNoteDetail.aggregate({ where: { productId, creditNote: ncWhere }, _sum: { total: true } }))._sum.total ?? D()
    : (await prisma.creditNote.aggregate({ where: ncWhere, _sum: { total: true } }))._sum.total ?? D();

  res.json({
    success: true,
    data: {
      resumen: {
        totalVentas: filas.length,
        totalSubtotal: money(t.subtotal),
        totalDescuentos: money(t.descuento),
        totalImpuestos: money(t.impuesto),
        totalRecaudado: money(t.total),
        ticketPromedio: filas.length ? money(t.total.div(filas.length)) : 0,
        // FAC-005: refunds in the period (by credit note date) and net sales
        totalNotasCredito: money(notas),
        ventaNeta: money(t.total.minus(notas)),
        ...(productId ? { cantidadProducto: qty(t.cantidadProducto), montoProducto: money(t.montoProducto) } : {}),
      },
      ventas: filas,
    },
  });
};

// 4. COLLECTIONS BY PAYMENT METHOD (REP-002). Filtered by sale date to reconcile with closings.
export const getReporteFormasPago = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const rango = dateRange(req.query);
  const pointOfSaleId = optionalId(req.query.pointOfSaleId);
  const saleWhere: any = { estado: 'COMPLETADA' };
  if (rango) saleWhere.createdAt = rango;
  if (pointOfSaleId) saleWhere.pointOfSaleId = pointOfSaleId;

  const pagos = await prisma.salePayment.findMany({
    where: { sale: saleWhere },
    include: { paymentMethod: true },
  });

  const agrupado = new Map<string, { codigo: string; nombre: string; total: any; cantidadTransacciones: number }>();
  let total = D();
  for (const p of pagos) {
    const g = agrupado.get(p.paymentMethodId) ?? { codigo: p.paymentMethod.codigo, nombre: p.paymentMethod.nombre, total: D(), cantidadTransacciones: 0 };
    g.total = g.total.plus(p.monto);
    g.cantidadTransacciones += 1;
    agrupado.set(p.paymentMethodId, g);
    total = total.plus(p.monto);
  }
  const filas = [...agrupado.values()]
    .map((g) => ({ ...g, total: money(g.total), porcentaje: total.gt(0) ? Number(g.total.div(total).times(100).toFixed(1)) : 0 }))
    .sort((a, b) => b.total - a.total);

  res.json({ success: true, data: filas, resumen: { total: money(total), transacciones: pagos.length } });
};

// 5. TOP-SELLING PRODUCTS BY QUANTITY OR AMOUNT (REP-003)
export const getProductosMasVendidos = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const rango = dateRange(req.query);
  const pointOfSaleId = optionalId(req.query.pointOfSaleId);
  const orden = req.query.orden === 'monto' ? 'monto' : 'cantidad';
  const limite = Math.min(Math.max(Number(req.query.limite) || 20, 1), 500);

  const saleWhere: any = { estado: 'COMPLETADA' };
  if (rango) saleWhere.createdAt = rango;
  if (pointOfSaleId) saleWhere.pointOfSaleId = pointOfSaleId;

  const grupos = await prisma.saleDetail.groupBy({
    by: ['productId'],
    where: { sale: saleWhere },
    _sum: { cantidad: true, total: true, subtotal: true },
    _count: { saleId: true },
  });
  const productos = await prisma.product.findMany({
    where: { id: { in: grupos.map((g) => g.productId) } },
    include: { categoria: { select: { nombre: true } } },
  });
  const porId = new Map(productos.map((p) => [p.id, p]));
  const totalMonto = grupos.reduce((s, g) => s.plus(g._sum.total ?? 0), D());

  const filas = grupos
    .map((g) => {
      const p = porId.get(g.productId);
      const cantidad = D(g._sum.cantidad ?? 0);
      const monto = D(g._sum.total ?? 0);
      const costo = D(p?.costo ?? 0).times(cantidad);
      return {
        productId: g.productId,
        codigo: p?.codigo ?? '',
        producto: p?.nombre ?? '(producto eliminado)',
        categoria: p?.categoria.nombre ?? '',
        cantidad: qty(cantidad),
        lineas: g._count.saleId,
        montoVendido: money(monto),
        costoEstimado: money(costo),
        margenEstimado: money(D(g._sum.subtotal ?? 0).minus(costo)),
        participacion: totalMonto.gt(0) ? Number(monto.div(totalMonto).times(100).toFixed(1)) : 0,
      };
    })
    .sort((a, b) => (orden === 'monto' ? b.montoVendido - a.montoVendido : b.cantidad - a.cantidad) || a.producto.localeCompare(b.producto))
    .slice(0, limite)
    .map((f, i) => ({ posicion: i + 1, ...f }));

  res.json({ success: true, data: filas, resumen: { orden, productosConVentas: grupos.length, montoTotal: money(totalMonto) } });
};

// 6. CURRENT STOCK PER WAREHOUSE (REP-004), computed at query time
export const getReporteExistencias = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const warehouseId = optionalId(req.query.warehouseId);
  const soloBajoMinimo = req.query.soloBajoMinimo === 'true';
  const stocks = await prisma.stock.findMany({
    where: { ...(warehouseId ? { warehouseId } : {}), product: { esServicio: false } },
    include: { product: { include: { categoria: { select: { nombre: true } } } }, warehouse: { select: { nombre: true, codigo: true } } },
    orderBy: [{ warehouse: { nombre: 'asc' } }, { product: { nombre: 'asc' } }],
  });
  let valorTotal = D();
  const filas = stocks
    .map((s) => {
      const valor = D(s.cantidad).times(s.product.costo);
      return {
        bodega: s.warehouse.nombre,
        codigo: s.product.codigo,
        producto: s.product.nombre,
        categoria: s.product.categoria.nombre,
        existencia: qty(D(s.cantidad)),
        minimo: qty(D(s.stockMinimo)),
        costoUnitario: money(D(s.product.costo)),
        valorInventario: money(valor),
        estado: D(s.cantidad).lte(s.stockMinimo) ? 'BAJO MÍNIMO' : 'ÓPTIMO',
        activo: s.product.activo,
        _valor: valor,
      };
    })
    .filter((f) => !soloBajoMinimo || f.estado === 'BAJO MÍNIMO')
    .map(({ _valor, ...f }) => {
      valorTotal = valorTotal.plus(_valor);
      return f;
    });
  res.json({
    success: true,
    data: filas,
    resumen: { articulos: filas.length, bajoMinimo: filas.filter((f) => f.estado === 'BAJO MÍNIMO').length, valorTotal: money(valorTotal), fechaConsulta: new Date() },
  });
};

// 7. STOCK LEDGER PER PRODUCT WITH RUNNING BALANCE (REP-005)
export const getReporteKardex = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const productId = optionalId(req.query.productId);
  if (!productId) {
    res.status(400).json({ success: false, message: 'Seleccione un producto' });
    return;
  }
  const warehouseId = optionalId(req.query.warehouseId);
  const rango = dateRange(req.query);
  const movimientos = await prisma.inventoryMovement.findMany({
    where: { productId, ...(warehouseId ? { warehouseId } : {}), ...(rango ? { fecha: rango } : {}) },
    include: { warehouse: { select: { nombre: true } }, usuario: { select: { nombre: true } } },
    orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
  });
  let entradas = D();
  let salidas = D();
  const filas = movimientos.map((m) => {
    // Direction comes from the stored balances, so new movement types never need a lookup list
    const entrada = D(m.saldoNuevo).gt(m.saldoAnterior);
    if (entrada) entradas = entradas.plus(m.cantidad);
    else salidas = salidas.plus(m.cantidad);
    return {
      fecha: m.fecha,
      bodega: m.warehouse.nombre,
      tipo: m.tipo,
      documento: m.documentoReferencia ?? '',
      entrada: entrada ? qty(D(m.cantidad)) : 0,
      salida: entrada ? 0 : qty(D(m.cantidad)),
      saldo: qty(D(m.saldoNuevo)),
      usuario: m.usuario.nombre,
      motivo: m.motivo ?? '',
    };
  });
  res.json({ success: true, data: filas, resumen: { movimientos: filas.length, entradas: qty(entradas), salidas: qty(salidas) } });
};

// 8. RECEIVED PURCHASES BY SUPPLIER AND PERIOD (REP-006, COM-008). Based on receipt documents.
export const getReporteCompras = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const rango = dateRange(req.query);
  const supplierId = optionalId(req.query.supplierId);
  const productId = optionalId(req.query.productId);
  const where: any = {};
  if (rango) where.fechaRecepcion = rango;
  if (supplierId) where.purchaseOrder = { supplierId };
  if (productId) where.details = { some: { productId } };

  const recepciones = await prisma.purchaseReceipt.findMany({
    where,
    include: {
      purchaseOrder: { select: { consecutivo: true, supplier: { select: { nombre: true } } } },
      warehouse: { select: { nombre: true } },
      usuario: { select: { nombre: true } },
      details: { include: { product: { select: { codigo: true, nombre: true } } } },
    },
    orderBy: { fechaRecepcion: 'desc' },
  });

  let total = D();
  const porProveedor = new Map<string, { proveedor: string; recepciones: number; total: any }>();
  const filas = recepciones.map((r) => {
    const lineas = productId ? r.details.filter((d) => d.productId === productId) : r.details;
    const monto = lineas.reduce((s, d) => s.plus(D(d.cantidadRecibida).times(d.costoUnitario)), D());
    total = total.plus(monto);
    const prov = r.purchaseOrder.supplier.nombre;
    const g = porProveedor.get(prov) ?? { proveedor: prov, recepciones: 0, total: D() };
    g.recepciones += 1;
    g.total = g.total.plus(monto);
    porProveedor.set(prov, g);
    return {
      fecha: r.fechaRecepcion,
      recepcion: r.consecutivo,
      ordenCompra: r.purchaseOrder.consecutivo,
      proveedor: prov,
      factura: r.facturaProveedor ?? '',
      bodega: r.warehouse.nombre,
      recibidoPor: r.usuario.nombre,
      articulos: lineas.map((d) => `${d.product.codigo} x${qty(D(d.cantidadRecibida))}`).join(', '),
      montoRecibido: money(monto),
    };
  });

  res.json({
    success: true,
    data: filas,
    resumen: {
      recepciones: filas.length,
      total: money(total),
      porProveedor: [...porProveedor.values()].map((g) => ({ ...g, total: money(g.total) })).sort((a, b) => b.total - a.total),
    },
  });
};

// 9. CASH CLOSINGS, OVERAGES AND SHORTAGES WITH RESPONSIBLE USERS (REP-007, CAJ-007, CAJ-008)
export const getReporteCierresCaja = (req: AuthenticatedRequest, res: Response) =>
  reporteCierres(req, res, req.query.soloDiferencias === 'true');

// Shared implementation of the cash closing report; optionally only closings with a difference.
async function reporteCierres(req: AuthenticatedRequest, res: Response, soloDiferencias: boolean): Promise<void> {
  const rango = dateRange(req.query);
  const cajaId = optionalId(req.query.cajaId);
  const where: any = { estado: 'CERRADA' };
  if (rango) where.fechaCierre = rango;
  if (cajaId) where.cajaId = cajaId;
  if (soloDiferencias) where.diferencia = { not: 0 };

  const cierres = await prisma.cashShift.findMany({
    where,
    include: {
      caja: { select: { nombre: true } },
      usuario: { select: { nombre: true } },
      ventas: { where: { estado: 'COMPLETADA' }, select: { payments: { select: { monto: true, paymentMethod: { select: { codigo: true } } } } } },
      abonos: { where: { estado: 'APLICADO' }, select: { monto: true, paymentMethod: { select: { codigo: true } } } },
    },
    orderBy: { fechaCierre: 'desc' },
  });

  // Who recorded the closing (may differ from who opened the shift)
  const bitacora = await prisma.auditLog.findMany({
    where: { accion: 'CIERRE_CAJA', entidadId: { in: cierres.map((c) => c.id) } },
    include: { user: { select: { nombre: true } } },
  });
  const cerradoPor = new Map(bitacora.map((b) => [b.entidadId, b.user?.nombre ?? '']));

  let sobrantes = D();
  let faltantes = D();
  const filas = cierres.map((c) => {
    const medios: Record<string, any> = {};
    for (const v of c.ventas) for (const p of v.payments) medios[p.paymentMethod.codigo] = (medios[p.paymentMethod.codigo] ?? D()).plus(p.monto);
    const dif = D(c.diferencia ?? 0);
    if (dif.gt(0)) sobrantes = sobrantes.plus(dif);
    if (dif.lt(0)) faltantes = faltantes.plus(dif.abs());
    const m = (k: string) => money(medios[k] ?? D());
    return {
      caja: c.caja.nombre,
      abiertoPor: c.usuario.nombre,
      cerradoPor: cerradoPor.get(c.id) || c.usuario.nombre,
      fechaApertura: c.fechaApertura,
      fechaCierre: c.fechaCierre,
      fondoInicial: money(D(c.montoInicial)),
      efectivo: m('EFECTIVO'),
      tarjeta: m('TARJETA'),
      transferencia: m('SINPE_MOVIL'),
      credito: m('CREDITO'),
      cargoHabitacion: m('CARGO_HABITACION'),
      abonosEfectivo: money(c.abonos.filter((a) => a.paymentMethod.codigo === 'EFECTIVO').reduce((s, a) => s.plus(a.monto), D())),
      esperado: money(D(c.montoEsperado ?? 0)),
      contado: money(D(c.montoContado ?? 0)),
      diferencia: money(dif),
      resultado: dif.gt(0) ? 'SOBRANTE' : dif.lt(0) ? 'FALTANTE' : 'CUADRADO',
      notas: c.notas ?? '',
    };
  });

  res.json({
    success: true,
    data: filas,
    resumen: { cierres: filas.length, conDiferencia: filas.filter((f) => f.resultado !== 'CUADRADO').length, sobrantes: money(sobrantes), faltantes: money(faltantes) },
  });
}

// Backward-compatible route: only closings with a difference
export const getReporteDiferenciasCaja = (req: AuthenticatedRequest, res: Response) => reporteCierres(req, res, true);
