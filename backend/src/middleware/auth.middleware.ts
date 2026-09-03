import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env';
import { prisma } from '../utils/prisma';

export interface AuthenticatedUser {
  id: string;
  username: string;
  nombre: string;
  email: string;
  roles: string[];
  permisos: string[]; // Formato "MODULO:ACCION", ej. "VENTAS:CREAR", "VENTAS:ANULAR"
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    res.status(401).json({
      success: false,
      message: 'Acceso no autorizado: Token no proporcionado',
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, ENV.JWT_SECRET) as { id: string };

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user || !user.activo) {
      res.status(401).json({
        success: false,
        message: 'Sesión inválida o usuario inactivo',
      });
      return;
    }

    const roleNames: string[] = [];
    const permissionSet = new Set<string>();

    for (const ur of user.roles) {
      if (ur.role.activo) {
        roleNames.push(ur.role.nombre);
        for (const rp of ur.role.permissions) {
          permissionSet.add(`${rp.permission.modulo}:${rp.permission.accion}`);
        }
      }
    }

    req.user = {
      id: user.id,
      username: user.username,
      nombre: user.nombre,
      email: user.email,
      roles: roleNames,
      permisos: Array.from(permissionSet),
    };

    next();
  } catch (error) {
    res.status(403).json({
      success: false,
      message: 'Token inválido o sesión expirada',
    });
  }
};

export const requireRole = (allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      return;
    }

    const hasRole = req.user.roles.some((role) => allowedRoles.includes(role));
    if (!hasRole) {
      res.status(403).json({
        success: false,
        message: 'Acceso denegado: No cuenta con el rol requerido',
        requiredRoles: allowedRoles,
      });
      return;
    }

    next();
  };
};

export const requirePermission = (modulo: string, accion: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      return;
    }

    // Administrador tiene acceso total a todos los módulos y acciones
    if (req.user.roles.includes('ADMINISTRADOR')) {
      return next();
    }

    const required = `${modulo}:${accion}`;
    const hasPerm = req.user.permisos.includes(required);

    if (!hasPerm) {
      res.status(403).json({
        success: false,
        message: `Acceso denegado: Permiso requerido [${required}]`,
      });
      return;
    }

    next();
  };
};
