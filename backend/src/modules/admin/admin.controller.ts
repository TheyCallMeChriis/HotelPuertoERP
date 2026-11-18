// User, role and permission administration (GEN-002, GEN-003, SEG-003, SEG-004).

import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../utils/prisma';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { autorCreacion, autorModificacion, registrarAuditoria } from '../../utils/audit';
import { operationError, parseOperation } from '../../utils/operation-validation';

/** Minimum password length for every account (also used by setup and password change). */
export const PASSWORD_MIN = 12;
const ADMIN_ROLE = 'ADMINISTRADOR';

const passwordField = z.string().min(PASSWORD_MIN, `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`).max(128);
const usernameField = z.string().trim().toLowerCase()
  .regex(/^[a-z0-9._-]{3,40}$/, 'El usuario debe tener de 3 a 40 caracteres: letras, números, punto, guion o guion bajo');
const nameField = z.string().trim().min(2).max(120);
const emailField = z.string().trim().toLowerCase().email('Correo electrónico inválido');
const roleIdsField = z.array(z.string().trim().min(1)).min(1, 'Asigne al menos un rol');

const createUserSchema = z.object({
  username: usernameField, nombre: nameField, email: emailField, password: passwordField, roleIds: roleIdsField,
});
const updateUserSchema = z.object({
  nombre: nameField.optional(), email: emailField.optional(), activo: z.boolean().optional(), roleIds: roleIdsField.optional(),
});
const resetPasswordSchema = z.object({ password: passwordField });

const roleSchema = z.object({
  nombre: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{3,40}$/, 'Nombre de rol: 3 a 40 caracteres en mayúscula, números o guion bajo'),
  descripcion: z.string().trim().max(250).nullish(),
});
const updateRoleSchema = roleSchema.partial().extend({ activo: z.boolean().optional() });
const rolePermissionsSchema = z.object({ permissionIds: z.array(z.string().trim().min(1)) });

// Fields returned for users; never includes the password hash
const userSelect = {
  id: true, username: true, nombre: true, email: true, activo: true, createdAt: true, updatedAt: true, creadoPor: true, modificadoPor: true,
  roles: { select: { role: { select: { id: true, nombre: true, activo: true } } } },
} as const;

// Flattens the user-role join rows into a plain list of roles
function shapeUser(u: any) {
  return { ...u, roles: u.roles.map((r: any) => r.role) };
}

// Checks that every role exists and is active
async function validateRoleIds(roleIds: string[]) {
  const unique = [...new Set(roleIds)];
  const roles = await prisma.role.findMany({ where: { id: { in: unique } } });
  if (roles.length !== unique.length) throw operationError('Uno o más roles no existen');
  if (roles.some((r) => !r.activo)) throw operationError('No se pueden asignar roles inactivos');
  return roles;
}

// Prevents leaving the system without an active administrator
async function ensureAnotherAdmin(excludeUserId: string) {
  const count = await prisma.user.count({
    where: { id: { not: excludeUserId }, activo: true, roles: { some: { role: { nombre: ADMIN_ROLE, activo: true } } } },
  });
  if (count === 0) throw operationError('Debe existir al menos otro administrador activo', 409);
}

// ================= USERS =================
export const getUsuarios = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { busqueda, estado } = req.query;
  const where: any = {};
  if (estado === 'activos') where.activo = true;
  if (estado === 'inactivos') where.activo = false;
  if (busqueda) {
    const q = String(busqueda).trim();
    where.OR = [
      { username: { contains: q, mode: 'insensitive' } },
      { nombre: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
    ];
  }
  const users = await prisma.user.findMany({ where, select: userSelect, orderBy: { username: 'asc' } });
  res.json({ success: true, data: users.map(shapeUser) });
};

// Creates a user with a hashed password and at least one role.
export const createUsuario = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const input = parseOperation(createUserSchema, req.body);
  const roles = await validateRoleIds(input.roleIds);
  const passwordHash = await bcrypt.hash(input.password, 10);

  const user = await prisma.user.create({
    data: {
      ...autorCreacion(req.user),
      username: input.username, nombre: input.nombre, email: input.email, passwordHash,
      roles: { create: roles.map((r) => ({ roleId: r.id })) },
    },
    select: userSelect,
  });

  await registrarAuditoria({
    userId: req.user?.id, accion: 'CREAR_USUARIO', entidad: 'User', entidadId: user.id,
    detalle: { username: user.username, nombre: user.nombre, email: user.email, roles: roles.map((r) => r.nombre) },
    ip: req.ip,
  });
  res.status(201).json({ success: true, message: 'Usuario creado', data: shapeUser(user) });
};

// Updates profile, status and roles. Nobody can deactivate themselves or remove the last active administrator.
export const updateUsuario = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const input = parseOperation(updateUserSchema, req.body);
  const anterior = await prisma.user.findUnique({ where: { id }, select: userSelect });
  if (!anterior) throw operationError('Usuario no encontrado', 404);

  const rolesAntes: string[] = anterior.roles.map((r) => r.role.nombre);
  const nuevosRoles = input.roleIds ? await validateRoleIds(input.roleIds) : null;
  const rolesDespues = nuevosRoles ? nuevosRoles.map((r) => r.nombre) : rolesAntes;

  const pierdeAdmin = rolesAntes.includes(ADMIN_ROLE) && (!rolesDespues.includes(ADMIN_ROLE) || input.activo === false);
  if (id === req.user!.id && (input.activo === false || pierdeAdmin)) {
    throw operationError('No puede desactivar su propia cuenta ni quitarse el rol de administrador', 409);
  }
  if (pierdeAdmin && anterior.activo) await ensureAnotherAdmin(id);

  const user = await prisma.$transaction(async (tx) => {
    if (nuevosRoles) {
      await tx.userRole.deleteMany({ where: { userId: id, roleId: { notIn: nuevosRoles.map((r) => r.id) } } });
      for (const r of nuevosRoles) {
        await tx.userRole.upsert({
          where: { userId_roleId: { userId: id, roleId: r.id } }, update: {}, create: { userId: id, roleId: r.id },
        });
      }
    }
    return tx.user.update({
      where: { id },
      data: { nombre: input.nombre, email: input.email, activo: input.activo, ...autorModificacion(req.user) },
      select: userSelect,
    });
  });

  const despues = shapeUser(user);
  let accion = 'EDITAR_USUARIO';
  if (input.activo === false && anterior.activo) accion = 'INACTIVAR_USUARIO';
  if (input.activo === true && !anterior.activo) accion = 'ACTIVAR_USUARIO';
  await registrarAuditoria({
    userId: req.user?.id, accion, entidad: 'User', entidadId: id,
    detalle: {
      antes: { nombre: anterior.nombre, email: anterior.email, activo: anterior.activo, roles: rolesAntes },
      ahora: { nombre: despues.nombre, email: despues.email, activo: despues.activo, roles: rolesDespues },
    },
    ip: req.ip,
  });
  if (nuevosRoles && rolesAntes.slice().sort().join() !== rolesDespues.slice().sort().join()) {
    await registrarAuditoria({
      userId: req.user?.id, accion: 'CAMBIO_ROLES_USUARIO', entidad: 'User', entidadId: id,
      detalle: { username: anterior.username, antes: rolesAntes, ahora: rolesDespues }, ip: req.ip,
    });
  }
  res.json({ success: true, message: 'Usuario actualizado', data: despues });
};

// Sets a new password for another user (administrative reset).
export const resetPassword = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const { password } = parseOperation(resetPasswordSchema, req.body);
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw operationError('Usuario no encontrado', 404);
  await prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 10), ...autorModificacion(req.user) } });
  await registrarAuditoria({
    userId: req.user?.id, accion: 'RESTABLECER_CONTRASENA', entidad: 'User', entidadId: id,
    detalle: { username: user.username }, ip: req.ip,
  });
  res.json({ success: true, message: 'Contraseña restablecida' });
};

// ================= ROLES AND PERMISSIONS =================
export const getRoles = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  const roles = await prisma.role.findMany({
    include: {
      permissions: { include: { permission: true } },
      _count: { select: { users: true } },
    },
    orderBy: { nombre: 'asc' },
  });
  res.json({
    success: true,
    data: roles.map((r) => ({
      id: r.id, nombre: r.nombre, descripcion: r.descripcion, activo: r.activo, createdAt: r.createdAt,
      updatedAt: r.updatedAt, creadoPor: r.creadoPor, modificadoPor: r.modificadoPor,
      usuarios: r._count.users,
      permisos: r.permissions.map((p) => p.permission),
    })),
  });
};

// Full permission catalog (module × action) used by the permission matrix.
export const getPermisos = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  const permisos = await prisma.permission.findMany({ orderBy: [{ modulo: 'asc' }, { accion: 'asc' }] });
  res.json({ success: true, data: permisos });
};

// Creates an empty role; permissions are assigned separately.
export const createRol = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const input = parseOperation(roleSchema, req.body);
  const rol = await prisma.role.create({ data: { nombre: input.nombre, descripcion: input.descripcion ?? null, ...autorCreacion(req.user) } });
  await registrarAuditoria({
    userId: req.user?.id, accion: 'CREAR_ROL', entidad: 'Role', entidadId: rol.id, detalle: input, ip: req.ip,
  });
  res.status(201).json({ success: true, message: 'Rol creado', data: rol });
};

// Renames, describes or (de)activates a role. ADMINISTRADOR cannot be renamed or deactivated.
export const updateRol = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const input = parseOperation(updateRoleSchema, req.body);
  const anterior = await prisma.role.findUnique({ where: { id } });
  if (!anterior) throw operationError('Rol no encontrado', 404);
  if (anterior.nombre === ADMIN_ROLE && ((input.nombre && input.nombre !== ADMIN_ROLE) || input.activo === false)) {
    throw operationError('El rol ADMINISTRADOR no puede renombrarse ni desactivarse', 409);
  }
  const rol = await prisma.role.update({
    where: { id },
    data: { nombre: input.nombre, descripcion: input.descripcion, activo: input.activo, ...autorModificacion(req.user) },
  });
  await registrarAuditoria({
    userId: req.user?.id, accion: input.activo === false && anterior.activo ? 'INACTIVAR_ROL' : 'EDITAR_ROL',
    entidad: 'Role', entidadId: id,
    detalle: {
      antes: { nombre: anterior.nombre, descripcion: anterior.descripcion, activo: anterior.activo },
      ahora: { nombre: rol.nombre, descripcion: rol.descripcion, activo: rol.activo },
    },
    ip: req.ip,
  });
  res.json({ success: true, message: 'Rol actualizado', data: rol });
};

// Replaces the permission set of a role and logs what was added and removed.
export const setPermisosRol = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const { permissionIds } = parseOperation(rolePermissionsSchema, req.body);
  const rol = await prisma.role.findUnique({ where: { id }, include: { permissions: { include: { permission: true } } } });
  if (!rol) throw operationError('Rol no encontrado', 404);
  if (rol.nombre === ADMIN_ROLE) {
    throw operationError('El administrador tiene acceso total; sus permisos no se editan', 409);
  }
  const unique = [...new Set(permissionIds)];
  const permisos = await prisma.permission.findMany({ where: { id: { in: unique } } });
  if (permisos.length !== unique.length) throw operationError('Uno o más permisos no existen');

  const label = (p: { modulo: string; accion: string }) => `${p.modulo}:${p.accion}`;
  const antes = rol.permissions.map((rp) => label(rp.permission));
  const despues = permisos.map(label);

  await prisma.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId: id, permissionId: { notIn: unique } } });
    for (const permissionId of unique) {
      await tx.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: id, permissionId } }, update: {}, create: { roleId: id, permissionId },
      });
    }
    await tx.role.update({ where: { id }, data: autorModificacion(req.user) });
  });

  await registrarAuditoria({
    userId: req.user?.id, accion: 'CAMBIO_PERMISOS', entidad: 'Role', entidadId: id,
    detalle: {
      rol: rol.nombre,
      agregados: despues.filter((p) => !antes.includes(p)),
      removidos: antes.filter((p) => !despues.includes(p)),
    },
    ip: req.ip,
  });
  res.json({ success: true, message: 'Permisos actualizados', data: { rol: rol.nombre, permisos: despues } });
};
