import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../../utils/prisma';
import { ENV } from '../../config/env';
import { registrarAuditoria } from '../../utils/audit';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';

const loginSchema = z.object({
  username: z.string().min(1, 'El nombre de usuario es requerido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

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
    res.status(401).json({
      success: false,
      message: 'Credenciales inválidas o cuenta desactivada',
    });
    return;
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    res.status(401).json({
      success: false,
      message: 'Credenciales inválidas',
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

  const token = jwt.sign(
    { id: user.id, username: user.username },
    ENV.JWT_SECRET,
    { expiresIn: '8h' }
  );

  // Registrar auditoría de inicio de sesión (SEG-003)
  await registrarAuditoria({
    userId: user.id,
    accion: 'LOGIN',
    entidad: 'User',
    entidadId: user.id,
    detalle: { username: user.username, ip: req.ip },
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
        roles: roleNames,
        permisos: Array.from(permissionSet),
      },
    },
  });
};

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
