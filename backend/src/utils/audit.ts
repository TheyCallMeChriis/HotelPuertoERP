import { prisma } from './prisma';

export interface AuditParams {
  userId?: string | null;
  accion: string;
  entidad: string;
  entidadId?: string | null;
  detalle?: Record<string, unknown> | string | null;
  ip?: string | null;
}

export async function registrarAuditoria(params: AuditParams): Promise<void> {
  try {
    const detalleTexto =
      typeof params.detalle === 'object' && params.detalle !== null
        ? JSON.stringify(params.detalle)
        : params.detalle || null;

    await prisma.auditLog.create({
      data: {
        userId: params.userId || null,
        accion: params.accion,
        entidad: params.entidad,
        entidadId: params.entidadId || null,
        detalle: detalleTexto,
        ip: params.ip || null,
      },
    });
  } catch (error) {
    console.error('Error al registrar bitácora de auditoría:', error);
  }
}
