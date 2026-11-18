// Authentication and authorization middleware (SEG-001, SEG-002).
// The JWT only identifies the user; roles and permissions are reloaded from the database on every
// request, so deactivating a user or changing a role takes effect immediately.
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
  permisos: string[]; // Format "MODULE:ACTION", e.g. "VENTAS:CREAR", "VENTAS:ANULAR"
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/**
 * Flattens a user's active roles into role names and "MODULE:ACTION" permission strings.
 * Inactive roles grant nothing. Shared by the auth middleware and the login endpoint.
 */
export function flattenAccess(roles: Array<{ role: { nombre: string; activo: boolean; permissions: Array<{ permission: { modulo: string; accion: string } }> } }>) {
  const roleNames: string[] = [];
  const permissionSet = new Set<string>();
  for (const ur of roles) {
    if (!ur.role.activo) continue;
    roleNames.push(ur.role.nombre);
    for (const rp of ur.role.permissions) permissionSet.add(`${rp.permission.modulo}:${rp.permission.accion}`);
  }
  return { roles: roleNames, permisos: Array.from(permissionSet) };
}

// Verifies the Bearer token and attaches the user with their current roles and permissions.
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

    req.user = { id: user.id, username: user.username, nombre: user.nombre, email: user.email, ...flattenAccess(user.roles) };

    next();
  } catch {
    // Expired or tampered tokens are an authentication failure (401), not a permission failure (403)
    res.status(401).json({
      success: false,
      message: 'Token inválido o sesión expirada',
    });
  }
};

// Allows the request only when the user has one of the given roles.
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

// Allows the request when the user has the "MODULE:ACTION" permission (administrators always pass).
export const requirePermission = (modulo: string, accion: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      return;
    }

    // The administrator role has full access to every module and action
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
