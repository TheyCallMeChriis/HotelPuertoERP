// Centralized error handling (RNF-007, SEG-010).
import { Request, Response, NextFunction } from 'express';
import { ENV } from '../config/env';

export interface AppError extends Error {
  statusCode?: number;
  details?: unknown;
  code?: string;
  meta?: { target?: unknown };
}

// Maps known Prisma errors to controlled responses (SEG-010)
function prismaStatus(err: AppError): { status: number; message: string } | null {
  switch (err.code) {
    case 'P2002': {
      const target = Array.isArray(err.meta?.target) ? (err.meta!.target as string[]).join(', ') : 'valor único';
      return { status: 409, message: `Ya existe un registro con el mismo ${target}` };
    }
    case 'P2003':
      return { status: 409, message: 'La operación hace referencia a un registro inexistente o con historial asociado' };
    case 'P2025':
      return { status: 404, message: 'Registro no encontrado' };
    default:
      return null;
  }
}

// Final Express error handler: logs full technical detail on the server and returns a safe message.
export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  // Express only treats a middleware as an error handler when it declares four parameters
  _next: NextFunction
): void => {
  const known = prismaStatus(err);
  const statusCode = known?.status ?? err.statusCode ?? 500;
  const message = known?.message ?? err.message ?? 'Error interno del servidor';

  // Log the error with technical detail for support and diagnosis
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [ERROR] ${req.method} ${req.originalUrl}:`, {
    message: err.message,
    code: err.code,
    stack: err.stack,
    details: err.details,
  });

  // Client response without leaking credentials or sensitive stack traces
  res.status(statusCode).json({
    success: false,
    message: statusCode === 500 && ENV.NODE_ENV === 'production'
      ? 'Ocurrió un error en el servidor. Contacte a soporte técnico.'
      : message,
    details: statusCode === 500 ? null : err.details || null,
  });
};
