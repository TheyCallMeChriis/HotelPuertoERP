import { Prisma } from '@prisma/client';
import { lockOperation } from './transaction-lock';

// Inventory costing (INV-011). The method is configured in parametros_sistema.METODO_COSTEO:
//   PROMEDIO      cost = (stock × current cost + received quantity × purchase cost) / (stock + quantity)
//   ULTIMO_COSTO  cost = cost of the latest purchase
// Stock includes every warehouse because each product has a single cost.

export const METODOS_COSTEO = ['PROMEDIO', 'ULTIMO_COSTO'] as const;
export type MetodoCosteo = typeof METODOS_COSTEO[number];

// Configured costing method; falls back to PROMEDIO when missing or invalid
export async function metodoCosteo(tx: Prisma.TransactionClient): Promise<MetodoCosteo> {
  const p = await tx.systemParameter.findUnique({ where: { clave: 'METODO_COSTEO' } });
  return (METODOS_COSTEO as readonly string[]).includes(p?.valor ?? '') ? (p!.valor as MetodoCosteo) : 'PROMEDIO';
}

// Pure cost calculation, rounded to cents
export function calcularCosto(metodo: MetodoCosteo, existencia: Prisma.Decimal, costoActual: Prisma.Decimal, cantidad: Prisma.Decimal, costoCompra: Prisma.Decimal) {
  if (metodo === 'ULTIMO_COSTO' || existencia.lte(0)) return costoCompra.toDecimalPlaces(2);
  return existencia.mul(costoActual).plus(cantidad.mul(costoCompra)).div(existencia.plus(cantidad)).toDecimalPlaces(2);
}

// Must be called inside the receipt transaction and BEFORE the received quantity is added to stock.
export async function actualizarCostoPorCompra(
  tx: Prisma.TransactionClient, productId: string, cantidad: Prisma.Decimal, costoCompra: Prisma.Decimal, metodo: MetodoCosteo,
) {
  // Serializes concurrent receipts of the same product across different orders
  await lockOperation(tx, `costo:${productId}`);
  const product = await tx.product.findUniqueOrThrow({ where: { id: productId } });
  const agg = await tx.stock.aggregate({ where: { productId }, _sum: { cantidad: true } });
  const existencia = agg._sum.cantidad ?? new Prisma.Decimal(0);
  const costoNuevo = calcularCosto(metodo, existencia, product.costo, cantidad, costoCompra);
  if (!costoNuevo.eq(product.costo)) await tx.product.update({ where: { id: productId }, data: { costo: costoNuevo } });
  return { costoAnterior: product.costo, costoNuevo, existenciaAnterior: existencia };
}
