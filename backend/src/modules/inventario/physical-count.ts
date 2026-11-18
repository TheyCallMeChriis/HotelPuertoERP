import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../utils/prisma';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { registrarAuditoria } from '../../utils/audit';
import { changeStock } from '../../utils/stock-change';
import { lockOperation, nextConsecutive } from '../../utils/transaction-lock';
import { D, idField, operationError, optionalText, parseOperation } from '../../utils/operation-validation';

// Physical inventory count (INV-007).
// 1) When the count starts, the system quantity of every stocked product in the warehouse is frozen.
// 2) Counts are recorded (they can be saved across several sessions).
// 3) The system shows the difference counted − system before applying.
// 4) When applied, each difference creates a ledger adjustment tagged with the count's sequence number.
//    The difference is applied to the current stock, so sales or purchases
//    made after the count started are not lost.

// Quantities are handled with 3 decimals
const n3 = (v: Prisma.Decimal) => Number(v.toFixed(3));

const createSchema = z.object({ warehouseId: idField, notas: optionalText, categoriaId: idField.nullish() });
// A counted quantity; null means "not counted"
const countValue = z.union([z.number(), z.string().trim().regex(/^\d+(\.\d{1,3})?$/)]).transform((v) => D(v))
  .refine((v) => v.gte(0) && v.lt(1e9), 'Conteo inválido');
const countsSchema = z.object({
  conteos: z.array(z.object({ productId: idField, cantidadContada: countValue.nullable() })).min(1).max(5000),
});
const applySchema = z.object({ motivo: optionalText });

// Adds system quantity, difference and totals to a count for the UI
function shape(t: any, stocks?: Map<string, Prisma.Decimal>) {
  const lineas = t.details.map((d: any) => {
    const sistema = D(d.cantidadSistema);
    const contada = d.cantidadContada === null ? null : D(d.cantidadContada);
    const diferencia = contada === null ? null : contada.minus(sistema);
    return {
      productId: d.productId,
      codigo: d.product.codigo,
      producto: d.product.nombre,
      categoria: d.product.categoria?.nombre ?? '',
      costo: Number(d.product.costo),
      cantidadSistema: n3(sistema),
      cantidadContada: contada === null ? null : n3(contada),
      diferencia: diferencia === null ? null : n3(diferencia),
      valorDiferencia: diferencia === null ? null : Number(diferencia.times(d.product.costo).toFixed(2)),
      cantidadAjustada: d.cantidadAjustada === null ? null : n3(D(d.cantidadAjustada)),
      existenciaActual: stocks ? n3(stocks.get(d.productId) ?? D()) : undefined,
    };
  });
  const contadas = lineas.filter((l: any) => l.cantidadContada !== null);
  const conDiferencia = contadas.filter((l: any) => l.diferencia !== 0);
  return {
    id: t.id,
    consecutivo: t.consecutivo,
    estado: t.estado,
    notas: t.notas,
    bodega: t.warehouse,
    usuario: t.usuario?.nombre,
    aplicadoPor: t.aplicadoPor?.nombre ?? null,
    fechaInicio: t.fechaInicio,
    fechaAplicacion: t.fechaAplicacion,
    resumen: {
      productos: lineas.length,
      contados: contadas.length,
      pendientes: lineas.length - contadas.length,
      conDiferencia: conDiferencia.length,
      sobrantes: conDiferencia.filter((l: any) => l.diferencia > 0).length,
      faltantes: conDiferencia.filter((l: any) => l.diferencia < 0).length,
      valorDiferencia: Number(conDiferencia.reduce((s: number, l: any) => s + l.valorDiferencia, 0).toFixed(2)),
    },
    lineas,
  };
}

const include = {
  warehouse: { select: { id: true, codigo: true, nombre: true } },
  usuario: { select: { nombre: true } },
  aplicadoPor: { select: { nombre: true } },
  details: { include: { product: { include: { categoria: { select: { nombre: true } } } } }, orderBy: { product: { nombre: 'asc' as const } } },
};

// Physical counts, newest first.
export const listarTomas = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const where: any = {};
  if (req.query.warehouseId) where.warehouseId = String(req.query.warehouseId);
  if (req.query.estado) where.estado = String(req.query.estado);
  const tomas = await prisma.physicalCount.findMany({ where, include, orderBy: { fechaInicio: 'desc' }, take: 100 });
  res.json({ success: true, data: tomas.map((t) => { const { lineas, ...rest } = shape(t); return rest; }) });
};

// One physical count with its lines and live differences.
export const obtenerToma = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const toma = await prisma.physicalCount.findUnique({ where: { id: String(req.params.id) }, include });
  if (!toma) throw operationError('Toma física no encontrada', 404);
  const stocks = await prisma.stock.findMany({ where: { warehouseId: toma.warehouseId } });
  res.json({ success: true, data: shape(toma, new Map(stocks.map((s) => [s.productId, s.cantidad]))) });
};

// Starts a count for a warehouse, freezing the system quantity of each stocked product.
export const iniciarToma = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const input = parseOperation(createSchema, req.body);
  const toma = await prisma.$transaction(async (tx) => {
    await lockOperation(tx, `toma:${input.warehouseId}`);
    const bodega = await tx.warehouse.findUnique({ where: { id: input.warehouseId } });
    if (!bodega?.activo) throw operationError('Bodega no disponible');
    const abierta = await tx.physicalCount.findFirst({ where: { warehouseId: bodega.id, estado: 'ABIERTA' } });
    if (abierta) throw operationError(`Ya existe una toma abierta en esta bodega (${abierta.consecutivo})`, 409);

    const productos = await tx.product.findMany({
      where: { activo: true, esServicio: false, ...(input.categoriaId ? { categoriaId: input.categoriaId } : {}) },
      select: { id: true },
    });
    if (productos.length === 0) throw operationError('No hay productos inventariables para contar');
    const stocks = await tx.stock.findMany({ where: { warehouseId: bodega.id } });
    const porProducto = new Map(stocks.map((s) => [s.productId, s.cantidad]));
    const consecutivo = await nextConsecutive(tx, 'TF');
    return tx.physicalCount.create({
      data: {
        consecutivo, warehouseId: bodega.id, notas: input.notas ?? null, usuarioId: req.user!.id,
        details: { create: productos.map((p) => ({ productId: p.id, cantidadSistema: porProducto.get(p.id) ?? 0 })) },
      },
      include,
    });
  });
  await registrarAuditoria({
    userId: req.user?.id, accion: 'TOMA_FISICA_INICIADA', entidad: 'PhysicalCount', entidadId: toma.id, ip: req.ip,
    detalle: { consecutivo: toma.consecutivo, bodega: toma.warehouse.codigo, productos: toma.details.length },
  });
  res.status(201).json({ success: true, message: `Toma ${toma.consecutivo} iniciada`, data: shape(toma) });
};

// Saves counted quantities; can be called several times while the count is open.
export const registrarConteos = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const { conteos } = parseOperation(countsSchema, req.body);
  await prisma.$transaction(async (tx) => {
    const toma = await tx.physicalCount.findUnique({ where: { id } });
    if (!toma) throw operationError('Toma física no encontrada', 404);
    await lockOperation(tx, `toma:${toma.warehouseId}`);
    const actual = await tx.physicalCount.findUniqueOrThrow({ where: { id } });
    if (actual.estado !== 'ABIERTA') throw operationError('La toma ya no está abierta', 409);
    for (const c of conteos) {
      const r = await tx.physicalCountDetail.updateMany({
        where: { physicalCountId: id, productId: c.productId },
        data: { cantidadContada: c.cantidadContada },
      });
      if (r.count !== 1) throw operationError('Un producto no pertenece a esta toma');
    }
  });
  const toma = await prisma.physicalCount.findUniqueOrThrow({ where: { id }, include });
  res.json({ success: true, message: 'Conteos guardados', data: shape(toma) });
};

// Applies the count: each difference becomes a ledger adjustment on the current stock.
export const aplicarToma = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const { motivo } = parseOperation(applySchema, req.body);
  const resultado = await prisma.$transaction(async (tx) => {
    const base = await tx.physicalCount.findUnique({ where: { id } });
    if (!base) throw operationError('Toma física no encontrada', 404);
    await lockOperation(tx, `toma:${base.warehouseId}`);
    const toma = await tx.physicalCount.findUniqueOrThrow({ where: { id }, include: { details: { include: { product: true } } } });
    if (toma.estado !== 'ABIERTA') throw operationError('La toma ya fue aplicada o anulada', 409);
    const contadas = toma.details.filter((d) => d.cantidadContada !== null);
    if (contadas.length === 0) throw operationError('Registre al menos un conteo antes de aplicar');

    const ajustes: Array<{ producto: string; diferencia: string }> = [];
    for (const d of contadas) {
      const diferencia = D(d.cantidadContada!).minus(d.cantidadSistema);
      await tx.physicalCountDetail.update({ where: { id: d.id }, data: { cantidadAjustada: diferencia } });
      if (diferencia.isZero()) continue;
      const balances = await changeStock(tx, toma.warehouseId, d.productId, diferencia).catch((e: any) => {
        if (!e?.statusCode) throw e;
        throw operationError(`No se puede aplicar el faltante de ${d.product.codigo}: la existencia actual es menor a la diferencia contada`, 409);
      });
      await tx.inventoryMovement.create({
        data: {
          warehouseId: toma.warehouseId, productId: d.productId,
          tipo: diferencia.gt(0) ? 'AJUSTE_POSITIVO' : 'AJUSTE_NEGATIVO',
          cantidad: diferencia.abs(), ...balances, costoUnitario: d.product.costo,
          documentoReferencia: toma.consecutivo,
          motivo: `Toma física ${toma.consecutivo}${motivo ? `: ${motivo}` : ''}`,
          usuarioId: req.user!.id,
        },
      });
      ajustes.push({ producto: d.product.codigo, diferencia: diferencia.toFixed(3) });
    }
    await tx.physicalCount.update({
      where: { id }, data: { estado: 'APLICADA', aplicadoPorId: req.user!.id, fechaAplicacion: new Date() },
    });
    return { consecutivo: toma.consecutivo, contados: contadas.length, ajustes };
  });
  await registrarAuditoria({
    userId: req.user?.id, accion: 'TOMA_FISICA_APLICADA', entidad: 'PhysicalCount', entidadId: id, ip: req.ip,
    detalle: { ...resultado, motivo: motivo ?? null },
  });
  const toma = await prisma.physicalCount.findUniqueOrThrow({ where: { id }, include });
  res.json({ success: true, message: `Toma ${resultado.consecutivo} aplicada: ${resultado.ajustes.length} ajuste(s)`, data: shape(toma) });
};

// Voids an open count without touching stock.
export const anularToma = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const motivo = typeof req.body?.motivo === 'string' ? req.body.motivo.trim() : '';
  if (!motivo) throw operationError('Indique el motivo de la anulación');
  const toma = await prisma.physicalCount.findUnique({ where: { id } });
  if (!toma) throw operationError('Toma física no encontrada', 404);
  const r = await prisma.physicalCount.updateMany({ where: { id, estado: 'ABIERTA' }, data: { estado: 'ANULADA' } });
  if (r.count !== 1) throw operationError('Solo se puede anular una toma abierta', 409);
  await registrarAuditoria({
    userId: req.user?.id, accion: 'TOMA_FISICA_ANULADA', entidad: 'PhysicalCount', entidadId: id, ip: req.ip,
    detalle: { consecutivo: toma.consecutivo, motivo },
  });
  res.json({ success: true, message: `Toma ${toma.consecutivo} anulada` });
};
