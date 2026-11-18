// Business parameter endpoints (/api/admin/parametros).

import { Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { prisma } from '../../utils/prisma';
import { registrarAuditoria } from '../../utils/audit';
import { METODOS_COSTEO } from '../../utils/costing';
import { operationError, parseOperation } from '../../utils/operation-validation';

// Business parameters that can be configured without code changes (INV-011, RNF-010).
// Only the keys in this list can be changed, and only to the allowed values.
const EDITABLES: Record<string, { descripcion: string; valores: readonly string[] }> = {
  METODO_COSTEO: {
    descripcion: 'Método para actualizar el costo de los productos al recibir compras',
    valores: METODOS_COSTEO,
  },
};

// Editable parameters with their current value and allowed options.
export const getParametros = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  const guardados = await prisma.systemParameter.findMany({ where: { clave: { in: Object.keys(EDITABLES) } } });
  res.json({
    success: true,
    data: Object.entries(EDITABLES).map(([clave, def]) => {
      const p = guardados.find((g) => g.clave === clave);
      return { clave, valor: p?.valor ?? def.valores[0], descripcion: def.descripcion, valores: def.valores, updatedAt: p?.updatedAt ?? null };
    }),
  });
};

// Changes one parameter to an allowed value and audits the change.
export const updateParametro = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const clave = String(req.params.clave);
  const def = EDITABLES[clave];
  if (!def) throw operationError('Parámetro no configurable', 404);
  const { valor } = parseOperation(z.object({ valor: z.string().trim() }), req.body);
  if (!def.valores.includes(valor)) throw operationError(`Valor no permitido. Opciones: ${def.valores.join(', ')}`);
  const anterior = await prisma.systemParameter.findUnique({ where: { clave } });
  const p = await prisma.systemParameter.upsert({
    where: { clave }, update: { valor }, create: { clave, valor, descripcion: def.descripcion },
  });
  await registrarAuditoria({
    userId: req.user!.id, accion: 'CAMBIO_PARAMETRO', entidad: 'SystemParameter', entidadId: p.id, ip: req.ip,
    detalle: { clave, anterior: anterior?.valor ?? null, nuevo: valor },
  });
  res.json({ success: true, message: `Parámetro ${clave} actualizado`, data: p });
};
