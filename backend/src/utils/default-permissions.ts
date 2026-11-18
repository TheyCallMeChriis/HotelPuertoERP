import type { PrismaClient } from '@prisma/client';

// Minimum permissions for the initial profiles. Operators get no discount or
// cancellation permissions; existing custom permissions are preserved.
// Full permission catalog (module × action). Created when missing, without touching custom assignments.
export const PERMISSION_MODULES = [
  'VENTAS', 'CAJA', 'INVENTARIO', 'COMPRAS', 'CLIENTES', 'PROVEEDORES', 'REPORTES', 'SEGURIDAD', 'HOTEL_PMS', 'CATALOGOS',
] as const;
// APROBAR: approve or reject purchase requests (COM-003)
export const PERMISSION_ACTIONS = ['VER', 'CREAR', 'EDITAR', 'ANULAR', 'DESCUENTO', 'AJUSTE', 'APROBAR'] as const;

export const DEFAULT_ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  CAJERO: [
    'VENTAS:VER', 'VENTAS:CREAR',
    'CAJA:VER', 'CAJA:CREAR', 'CAJA:EDITAR',
    'CLIENTES:VER', 'CLIENTES:CREAR',
    'HOTEL_PMS:VER', 'HOTEL_PMS:CREAR',
  ],
  RESTAURANTE_BAR: ['VENTAS:VER', 'VENTAS:CREAR', 'HOTEL_PMS:VER', 'HOTEL_PMS:CREAR'],
  BODEGA: ['INVENTARIO:VER', 'INVENTARIO:CREAR', 'INVENTARIO:EDITAR', 'INVENTARIO:AJUSTE', 'CATALOGOS:VER'],
  PROVEEDURIA: [
    'COMPRAS:VER', 'COMPRAS:CREAR', 'COMPRAS:EDITAR',
    'PROVEEDORES:VER', 'PROVEEDORES:CREAR', 'PROVEEDORES:EDITAR',
    'INVENTARIO:VER', 'INVENTARIO:CREAR', 'CATALOGOS:VER',
  ],
  CONTABILIDAD: ['REPORTES:VER', 'CAJA:VER', 'COMPRAS:VER', 'VENTAS:VER', 'CATALOGOS:VER', 'CLIENTES:VER', 'PROVEEDORES:VER'],
  AUDITOR: ['REPORTES:VER', 'SEGURIDAD:VER'],
};

// Registers any missing permissions (module × action), for example CATALOGOS when upgrading
// an existing installation. It does not assign permissions to roles or change existing ones.
export async function ensurePermissionCatalog(prisma: PrismaClient): Promise<number> {
  let created = 0;
  for (const modulo of PERMISSION_MODULES) {
    for (const accion of PERMISSION_ACTIONS) {
      const exists = await prisma.permission.findUnique({ where: { modulo_accion: { modulo, accion } } });
      if (exists) continue;
      await prisma.permission.create({ data: { modulo, accion, descripcion: `Permiso para ${accion} en ${modulo}` } });
      created++;
    }
  }
  return created;
}

// Grants every permission to ADMINISTRADOR and the minimum set to each initial role. Idempotent.
export async function ensureDefaultPermissions(prisma: PrismaClient): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const roles = await tx.role.findMany();
    const permissions = await tx.permission.findMany();
    const roleByName = new Map(roles.map((role) => [role.nombre, role]));
    const permissionByName = new Map(permissions.map((p) => [`${p.modulo}:${p.accion}`, p]));

    // Validate the catalog before writing: this procedure loads no demo data
    // and does not create roles that are not installed yet.
    for (const name of ['ADMINISTRADOR', ...Object.keys(DEFAULT_ROLE_PERMISSIONS)]) {
      if (!roleByName.has(name)) throw new Error(`Falta el rol inicial ${name}`);
    }
    for (const required of Object.values(DEFAULT_ROLE_PERMISSIONS).flat()) {
      if (!permissionByName.has(required)) throw new Error(`Falta el permiso inicial ${required}`);
    }

    let processed = 0;
    for (const role of roles) {
      const required = role.nombre === 'ADMINISTRADOR'
        ? [...permissionByName.keys()]
        : DEFAULT_ROLE_PERMISSIONS[role.nombre] ?? [];
      for (const name of required) {
        const permissionId = permissionByName.get(name)!.id;
        await tx.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId } },
          update: {},
          create: { roleId: role.id, permissionId },
        });
        processed++;
      }
    }
    return processed;
  }, { timeout: 60000 });
}
