// Read-only access to the audit log (SEG-003).

import { Response } from 'express';
import { prisma } from '../../utils/prisma';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { dateRange } from '../reportes/report-filters';

// Latest 200 audit entries, filtered by action, entity, user and date range.
export const getBitacoraAuditoria = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { accion, entidad, usuarioId } = req.query;

  const whereClause: any = {};
  if (accion) whereClause.accion = String(accion);
  if (entidad) whereClause.entidad = String(entidad);
  if (usuarioId) whereClause.userId = String(usuarioId);

  // Same date semantics as the reports: whole local days, either bound optional, invalid dates → 400
  const rango = dateRange(req.query);
  if (rango) whereClause.fecha = rango;

  const registros = await prisma.auditLog.findMany({
    where: whereClause,
    include: {
      user: {
        select: { id: true, nombre: true, username: true },
      },
    },
    orderBy: { fecha: 'desc' },
    take: 200,
  });

  res.json({
    success: true,
    data: registros,
  });
};
