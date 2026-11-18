// Authentication endpoints: login, current user, logout and own password change (SEG-001, SEG-003, SEG-005).
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../../utils/prisma';
import { ENV } from '../../config/env';
import { registrarAuditoria } from '../../utils/audit';
import { AuthenticatedRequest, flattenAccess } from '../../middleware/auth.middleware';
import { PASSWORD_MIN } from '../admin/admin.controller';

const loginSchema = z.object({
  username: z.string().min(1, 'El nombre de usuario es requerido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

// Validates credentials and returns a JWT plus the user profile with roles and permissions.
export const login = async (req: Request, res: Response): Promise<void> => {
  const parseResult = loginSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      message: 'Datos de inicio de sesión inválidos',
      errors: parseResult.error.format(),
    });
    return;
  }

  const { username, password } = parseResult.data;

  const user = await prisma.user.findUnique({
    where: { username },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
        },
      },
    },
  });

  if (!user || !user.activo) {
    // SEG-003: record failed attempts without revealing whether the user exists
    await registrarAuditoria({
      userId: user?.id ?? null, accion: 'LOGIN_FALLIDO', entidad: 'User', entidadId: user?.id ?? null,
      detalle: { username, motivo: user ? 'CUENTA_INACTIVA' : 'USUARIO_DESCONOCIDO' }, ip: req.ip,
    });
    res.status(401).json({
      success: false,
      message: 'Credenciales inválidas o cuenta desactivada',
    });
    return;
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    await registrarAuditoria({
      userId: user.id, accion: 'LOGIN_FALLIDO', entidad: 'User', entidadId: user.id,
      detalle: { username, motivo: 'CONTRASENA_INCORRECTA' }, ip: req.ip,
    });
    res.status(401).json({
      success: false,
      message: 'Credenciales inválidas',
    });
    return;
  }

  const access = flattenAccess(user.roles);

  const token = jwt.sign(
    { id: user.id, username: user.username },
    ENV.JWT_SECRET,
    { expiresIn: ENV.JWT_EXPIRES_IN }
  );

  // Record the login in the audit log (SEG-003)
  await registrarAuditoria({
    userId: user.id,
    accion: 'LOGIN',
    entidad: 'User',
    entidadId: user.id,
    detalle: { username: user.username },
    ip: req.ip,
  });

  res.json({
    success: true,
    message: 'Inicio de sesión exitoso',
    data: {
      token,
      user: {
        id: user.id,
        username: user.username,
        nombre: user.nombre,
        email: user.email,
        ...access,
      },
    },
  });
};

// Returns the profile resolved by the auth middleware.
export const getMe = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'No autenticado' });
    return;
  }

  res.json({
    success: true,
    data: req.user,
  });
};

// Logout (SEG-003, SEG-005). The token is stateless; the client discards it.
export const logout = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  await registrarAuditoria({
    userId: req.user?.id, accion: 'LOGOUT', entidad: 'User', entidadId: req.user?.id, ip: req.ip,
  });
  res.json({ success: true, message: 'Sesión cerrada' });
};

const changePasswordSchema = z.object({
  actual: z.string().min(1, 'Indique la contraseña actual'),
  nueva: z.string().min(PASSWORD_MIN, `La nueva contraseña debe tener al menos ${PASSWORD_MIN} caracteres`).max(128),
});

// Change the current user's own password
export const cambiarPassword = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: parsed.error.issues[0].message });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user || !(await bcrypt.compare(parsed.data.actual, user.passwordHash))) {
    res.status(400).json({ success: false, message: 'La contraseña actual no es correcta' });
    return;
  }
  if (parsed.data.actual === parsed.data.nueva) {
    res.status(400).json({ success: false, message: 'La nueva contraseña debe ser diferente' });
    return;
  }
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(parsed.data.nueva, 10) } });
  await registrarAuditoria({
    userId: user.id, accion: 'CAMBIO_CONTRASENA', entidad: 'User', entidadId: user.id, ip: req.ip,
  });
  res.json({ success: true, message: 'Contraseña actualizada' });
};
