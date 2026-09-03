import { Request, Response, NextFunction } from 'express';
import { ENV } from '../config/env';

export interface AppError extends Error {
  statusCode?: number;
  details?: unknown;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Error interno del servidor';

  // Registrar error con detalle técnico para soporte/diagnóstico
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [ERROR] ${req.method} ${req.originalUrl}:`, {
    message: err.message,
    stack: err.stack,
    details: err.details,
  });

  // Respuesta al cliente sin filtrar credenciales ni trazas técnicas sensibles
  res.status(statusCode).json({
    success: false,
    message: statusCode === 500 && ENV.NODE_ENV === 'production' 
      ? 'Ocurrió un error en el servidor. Contacte a soporte técnico.'
      : message,
    details: err.details || null,
  });
};
