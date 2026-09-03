import { Response } from 'express';
import { prisma } from '../../utils/prisma';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';

export const getBitacoraAuditoria = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { accion, entidad, fechaInicio, fechaFin, usuarioId } = req.query;

  const whereClause: any = {};
  if (accion) whereClause.accion = String(accion);
  if (entidad) whereClause.entidad = String(entidad);
  if (usuarioId) whereClause.userId = String(usuarioId);

  if (fechaInicio && fechaFin) {
    whereClause.fecha = {
      gte: new Date(String(fechaInicio)),
      lte: new Date(String(fechaFin)),
    };
  }

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
