import type { PrismaClient } from '@prisma/client';

// Permisos mínimos de los perfiles iniciales. No concede descuentos ni
// anulaciones a operadores; los permisos personalizados existentes se conservan.
export const DEFAULT_ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  CAJERO: [
    'VENTAS:VER', 'VENTAS:CREAR',
    'CAJA:VER', 'CAJA:CREAR', 'CAJA:EDITAR',
    'CLIENTES:VER', 'CLIENTES:CREAR',
    'HOTEL_PMS:VER', 'HOTEL_PMS:CREAR',
  ],
  RESTAURANTE_BAR: ['VENTAS:VER', 'VENTAS:CREAR', 'HOTEL_PMS:VER', 'HOTEL_PMS:CREAR'],
  BODEGA: ['INVENTARIO:VER', 'INVENTARIO:CREAR', 'INVENTARIO:AJUSTE'],
  PROVEEDURIA: [
    'COMPRAS:VER', 'COMPRAS:CREAR', 'COMPRAS:EDITAR',
    'PROVEEDORES:VER', 'PROVEEDORES:CREAR',
    'INVENTARIO:VER', 'INVENTARIO:CREAR',
  ],
  CONTABILIDAD: ['REPORTES:VER', 'CAJA:VER', 'COMPRAS:VER', 'VENTAS:VER'],
  AUDITOR: ['REPORTES:VER'],
};

export async function ensureDefaultPermissions(prisma: PrismaClient): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const roles = await tx.role.findMany();
    const permissions = await tx.permission.findMany();
    const roleByName = new Map(roles.map((role) => [role.nombre, role]));
    const permissionByName = new Map(permissions.map((p) => [`${p.modulo}:${p.accion}`, p]));

    // Validar el catálogo antes de escribir: este procedimiento no carga datos
    // de demostración ni crea roles que aún no estén instalados.
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
  });
}
