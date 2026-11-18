// Initial administrator registration (first run or recovery with SETUP_TOKEN).

import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { timingSafeEqual, createHash } from 'crypto';
import { z } from 'zod';
import { prisma } from '../../utils/prisma';
import { ENV } from '../../config/env';
import { registrarAuditoria } from '../../utils/audit';
import { PASSWORD_MIN } from '../admin/admin.controller';

// Initial administrator registration from the login screen.
// Allowed only in two cases:
//   1. There is no active administrator (fresh installation): no code required.
//   2. SETUP_TOKEN is defined in backend/.env: that code is required (recovery/testing).
// This way nobody can create an administrator from the web on an already configured installation.

const ADMIN_ROLE = 'ADMINISTRADOR';

// Recovery code from backend/.env; ignored when shorter than 12 characters
function setupToken(): string | null {
  const token = process.env.SETUP_TOKEN?.trim();
  return token && token.length >= 12 ? token : null;
}

// Constant-time comparison so the code cannot be guessed by timing
function sameSecret(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

// True when at least one active user holds the active ADMINISTRADOR role
async function hasActiveAdmin(): Promise<boolean> {
  const count = await prisma.user.count({
    where: { activo: true, roles: { some: { role: { nombre: ADMIN_ROLE, activo: true } } } },
  });
  return count > 0;
}

// Tells the login screen whether registration is available and whether it needs the code.
export const getSetupStatus = async (_req: Request, res: Response): Promise<void> => {
  const sinAdmin = !(await hasActiveAdmin());
  res.json({
    success: true,
    data: {
      disponible: sinAdmin || Boolean(setupToken()),
      requiereCodigo: !sinAdmin,
    },
  });
};

// Body of the initial administrator registration
const setupSchema = z.object({
  username: z.string().trim().toLowerCase()
    .regex(/^[a-z0-9._-]{3,40}$/, 'El usuario debe tener de 3 a 40 caracteres: letras, números, punto, guion o guion bajo'),
  nombre: z.string().trim().min(2, 'Indique el nombre completo').max(120),
  email: z.string().trim().toLowerCase().email('Correo electrónico inválido'),
  password: z.string().min(PASSWORD_MIN, `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`).max(128),
  codigo: z.string().optional(),
});

// Creates the administrator and signs them in. Failed code attempts are audited.
export const registrarAdministradorInicial = async (req: Request, res: Response): Promise<void> => {
  const parsed = setupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: parsed.error.issues[0].message });
    return;
  }
  const input = parsed.data;

  const sinAdmin = !(await hasActiveAdmin());
  const token = setupToken();
  if (!sinAdmin) {
    if (!token) {
      res.status(403).json({ success: false, message: 'El registro inicial no está habilitado: ya existe un administrador activo.' });
      return;
    }
    if (!input.codigo || !sameSecret(input.codigo.trim(), token)) {
      await registrarAuditoria({
        accion: 'REGISTRO_ADMIN_RECHAZADO', entidad: 'User', detalle: { username: input.username, motivo: 'CODIGO_INVALIDO' }, ip: req.ip,
      });
      res.status(403).json({ success: false, message: 'El código de instalación no es correcto.' });
      return;
    }
  }

  const rol = await prisma.role.findUnique({ where: { nombre: ADMIN_ROLE } });
  if (!rol || !rol.activo) {
    res.status(409).json({ success: false, message: 'No existe el rol ADMINISTRADOR. Ejecute las migraciones y el seed antes de continuar.' });
    return;
  }

  const existente = await prisma.user.findFirst({ where: { OR: [{ username: input.username }, { email: input.email }] } });
  if (existente) {
    res.status(409).json({ success: false, message: 'Ya existe un usuario con ese nombre de usuario o correo.' });
    return;
  }

  const user = await prisma.user.create({
    data: {
      username: input.username,
      nombre: input.nombre,
      email: input.email,
      passwordHash: await bcrypt.hash(input.password, 10),
      creadoPor: 'registro-inicial', modificadoPor: 'registro-inicial',
      roles: { create: [{ roleId: rol.id }] },
    },
  });

  await registrarAuditoria({
    userId: user.id, accion: 'REGISTRO_ADMIN_INICIAL', entidad: 'User', entidadId: user.id, ip: req.ip,
    detalle: { username: user.username, modo: sinAdmin ? 'INSTALACION_NUEVA' : 'CODIGO_INSTALACION' },
  });

  // Signs in directly with the newly created account
  const permisos = await prisma.permission.findMany();
  const tokenSesion = jwt.sign({ id: user.id, username: user.username }, ENV.JWT_SECRET, { expiresIn: ENV.JWT_EXPIRES_IN });
  res.status(201).json({
    success: true,
    message: 'Administrador registrado',
    data: {
      token: tokenSesion,
      user: {
        id: user.id, username: user.username, nombre: user.nombre, email: user.email,
        roles: [ADMIN_ROLE], permisos: permisos.map((p) => `${p.modulo}:${p.accion}`),
      },
    },
  });
};
