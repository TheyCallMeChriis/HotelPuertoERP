// Demo data seed (npm run prisma:seed): payment methods, roles, permissions, users, warehouses,
// registers, points of sale, products, a sample customer and supplier, and PMS rooms and guests.
// It is idempotent (upserts) and never changes passwords of existing users.

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { ensureDefaultPermissions, PERMISSION_ACTIONS, PERMISSION_MODULES } from '../src/utils/default-permissions';
import dotenv from 'dotenv';
import path from 'path';
import { seedPasswords } from '../src/config/validate-env';

dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const prisma = new PrismaClient();

// Seeds every catalog in dependency order
async function main() {
  const passwords = seedPasswords(process.env);
  console.log('--- INICIANDO SEMBRADO DE DATOS (SEED) ---');

  // 1. REQUIRED PAYMENT METHODS
  const paymentMethods = [
    { codigo: 'EFECTIVO', nombre: 'Efectivo' },
    { codigo: 'TARJETA', nombre: 'Tarjeta de Crédito / Débito' },
    { codigo: 'SINPE_MOVIL', nombre: 'Transferencia / SINPE Móvil' },
    { codigo: 'CREDITO', nombre: 'Crédito de Cliente' },
    { codigo: 'CARGO_HABITACION', nombre: 'Cargo a Habitación (PMS)' },
  ];

  for (const pm of paymentMethods) {
    await prisma.paymentMethod.upsert({
      where: { codigo: pm.codigo },
      update: {},
      create: pm,
    });
  }
  console.log('✅ Formas de pago sembradas');

  // 2. ROLES
  const rolesData = [
    { nombre: 'ADMINISTRADOR', descripcion: 'Control total de configuración, catálogos, usuarios y operaciones' },
    { nombre: 'CAJERO', descripcion: 'Operación de venta, cobros, cargos y apertura/cierre de caja' },
    { nombre: 'RESTAURANTE_BAR', descripcion: 'Registro de comandas, consumos y cargos a habitación' },
    { nombre: 'BODEGA', descripcion: 'Movimientos de inventario, entradas, salidas, traslados y ajustes' },
    { nombre: 'PROVEEDURIA', descripcion: 'Gestión de compras, proveedores y recepciones' },
    { nombre: 'CONTABILIDAD', descripcion: 'Consulta de cierres, ventas y reportes operativos' },
    { nombre: 'AUDITOR', descripcion: 'Auditoría, bitácora y parámetros de control sin operar ventas' },
  ];

  const rolesMap = new Map<string, string>();
  for (const r of rolesData) {
    const role = await prisma.role.upsert({
      where: { nombre: r.nombre },
      update: { descripcion: r.descripcion },
      create: r,
    });
    rolesMap.set(r.nombre, role.id);
  }
  console.log('✅ Roles del sistema sembrados');

  // 3. PERMISSIONS
  const modulos = PERMISSION_MODULES;
  const acciones = PERMISSION_ACTIONS;

  for (const mod of modulos) {
    for (const acc of acciones) {
      await prisma.permission.upsert({
        where: { modulo_accion: { modulo: mod, accion: acc } },
        update: {},
        create: {
          modulo: mod,
          accion: acc,
          descripcion: `Permiso para ${acc} en ${mod}`,
        },
      });

    }
  }
  await ensureDefaultPermissions(prisma);
  console.log('✅ Permisos y matriz RBAC sembrados');

  // 4. INITIAL USERS (passwords stored as secure hashes)
  const passwordSalt = await bcrypt.genSalt(10);
  const defaultAdminPass = await bcrypt.hash(passwords.admin, passwordSalt);
  const defaultOperPass = await bcrypt.hash(passwords.operator, passwordSalt);

  const usuariosData = [
    { username: 'admin', nombre: 'Administrador General', email: 'admin@hotelpuertolimon.com', pass: defaultAdminPass, rol: 'ADMINISTRADOR' },
    { username: 'cajero1', nombre: 'Carlos Recepción (Cajero)', email: 'cajero1@hotelpuertolimon.com', pass: defaultOperPass, rol: 'CAJERO' },
    { username: 'mesero1', nombre: 'Mario Barista', email: 'mesero1@hotelpuertolimon.com', pass: defaultOperPass, rol: 'RESTAURANTE_BAR' },
    { username: 'bodeguero1', nombre: 'Juan Almacén', email: 'bodega1@hotelpuertolimon.com', pass: defaultOperPass, rol: 'BODEGA' },
    { username: 'auditor1', nombre: 'Elena Auditora', email: 'auditor1@hotelpuertolimon.com', pass: defaultOperPass, rol: 'AUDITOR' },
  ];

  for (const u of usuariosData) {
    const user = await prisma.user.upsert({
      where: { username: u.username },
      update: { nombre: u.nombre, email: u.email },
      create: {
        username: u.username,
        nombre: u.nombre,
        email: u.email,
        passwordHash: u.pass,
        activo: true,
      },
    });

    const roleId = rolesMap.get(u.rol);
    if (roleId) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId } },
        update: {},
        create: { userId: user.id, roleId },
      });
    }
  }
  console.log('✅ Usuarios iniciales creados');

  // 5. WAREHOUSES
  const bodegaCentral = await prisma.warehouse.upsert({
    where: { codigo: 'BOD-01' },
    update: {},
    create: { codigo: 'BOD-01', nombre: 'Bodega Central Hotel', ubicacion: 'Piso 1 - Edificio Administrativo' },
  });

  const bodegaBar = await prisma.warehouse.upsert({
    where: { codigo: 'BOD-02' },
    update: {},
    create: { codigo: 'BOD-02', nombre: 'Bodega Restaurante y Bar', ubicacion: 'Área de Restaurante' },
  });
  console.log('✅ Bodegas sembradas');

  // 6. CASH REGISTERS AND POINTS OF SALE
  const cajaPrincipal = await prisma.cashRegister.upsert({
    where: { codigo: 'CAJA-01' },
    update: {},
    create: { codigo: 'CAJA-01', nombre: 'Caja Principal Recepción', ubicacion: 'Lobby Principal' },
  });

  const cajaBar = await prisma.cashRegister.upsert({
    where: { codigo: 'CAJA-02' },
    update: {},
    create: { codigo: 'CAJA-02', nombre: 'Caja Bar y Restaurante', ubicacion: 'Bar Piscina' },
  });

  for (const dep of [
    { codigo: 'RECEPCION', nombre: 'Recepción' },
    { codigo: 'RESTAURANTE', nombre: 'Restaurante' },
    { codigo: 'BAR', nombre: 'Bar' },
    { codigo: 'SOUVENIRS', nombre: 'Souvenirs' },
  ]) {
    await prisma.department.upsert({ where: { codigo: dep.codigo }, update: {}, create: dep });
  }

  await prisma.pointOfSale.upsert({
    where: { codigo: 'POS-01' },
    update: {},
    create: {
      codigo: 'POS-01',
      nombre: 'POS Recepción y Souvenirs',
      departamento: 'RECEPCION',
      cajaId: cajaPrincipal.id,
      bodegaDefectoId: bodegaCentral.id,
    },
  });

  await prisma.pointOfSale.upsert({
    where: { codigo: 'POS-02' },
    update: {},
    create: {
      codigo: 'POS-02',
      nombre: 'POS Bar y Restaurante',
      departamento: 'RESTAURANTE',
      cajaId: cajaBar.id,
      bodegaDefectoId: bodegaBar.id,
    },
  });
  console.log('✅ Cajas y Puntos de Venta configurados');

  // 7. CATEGORIES AND PRODUCTS
  const catBebidas = await prisma.category.upsert({
    where: { nombre: 'Bebidas' },
    update: {},
    create: { nombre: 'Bebidas', descripcion: 'Bebidas frías, calientes y licores' },
  });

  const catAlimentos = await prisma.category.upsert({
    where: { nombre: 'Alimentos' },
    update: {},
    create: { nombre: 'Alimentos', descripcion: 'Platillos y snacks del restaurante' },
  });

  const catSouvenirs = await prisma.category.upsert({
    where: { nombre: 'Souvenirs' },
    update: {},
    create: { nombre: 'Souvenirs', descripcion: 'Artículos de tienda y recuerdos' },
  });

  const productosIniciales = [
    { codigo: 'PRD-001', nombre: 'Agua Mineral Tropical 600ml', categoriaId: catBebidas.id, precioVenta: 1200.0, costo: 450.0, stockInicial: 50 },
    { codigo: 'PRD-002', nombre: 'Cerveza Imperial 350ml', categoriaId: catBebidas.id, precioVenta: 2000.0, costo: 900.0, stockInicial: 75 },
    { codigo: 'PRD-003', nombre: 'Café Chorreado Especial', categoriaId: catBebidas.id, precioVenta: 1500.0, costo: 300.0, stockInicial: 100 },
    { codigo: 'PRD-004', nombre: 'Gallo Pinto con Huevos y Plátano', categoriaId: catAlimentos.id, precioVenta: 4500.0, costo: 1800.0, stockInicial: 30 },
    { codigo: 'PRD-005', nombre: 'Sandwich Caribeño de Pollo', categoriaId: catAlimentos.id, precioVenta: 4000.0, costo: 1600.0, stockInicial: 25 },
    { codigo: 'PRD-006', nombre: 'Camiseta Hotel Puerto Limón', categoriaId: catSouvenirs.id, precioVenta: 9500.0, costo: 4000.0, stockInicial: 20 },
  ];

  for (const p of productosIniciales) {
    const prod = await prisma.product.upsert({
      where: { codigo: p.codigo },
      update: { precioVenta: p.precioVenta, costo: p.costo },
      create: {
        codigo: p.codigo,
        nombre: p.nombre,
        categoriaId: p.categoriaId,
        precioVenta: p.precioVenta,
        costo: p.costo,
        impuesto: 13.0,
      },
    });

    // Create the initial stock in the central warehouse
    await prisma.stock.upsert({
      where: { warehouseId_productId: { warehouseId: bodegaCentral.id, productId: prod.id } },
      update: {},
      create: {
        warehouseId: bodegaCentral.id,
        productId: prod.id,
        cantidad: p.stockInicial,
        stockMinimo: 10,
        stockMaximo: 200,
      },
    });
  }
  console.log('✅ Catálogo de productos y stock inicial cargados');

  // 8. SAMPLE CUSTOMER AND SUPPLIER
  await prisma.customer.upsert({
    where: { identificacion: '3-101-999999' },
    update: {},
    create: {
      tipoIdentificacion: 'CEDULA_JURIDICA',
      identificacion: '3-101-999999',
      nombre: 'Corporación Turística del Caribe S.A.',
      email: 'corporativo@caribe.cr',
      telefono: '2758-0000',
      limiteCredito: 250000.0,
      diasCredito: 30,
      creditoActivo: true,
    },
  });

  await prisma.supplier.upsert({
    where: { identificacion: '3-101-123456' },
    update: {},
    create: {
      identificacion: '3-101-123456',
      nombre: 'Distribuidora de Bebidas y Licores del Atlántico',
      razonSocial: 'Atlántico Distribuciones S.A.',
      email: 'ventas@distatlantico.cr',
      telefono: '2758-1122',
      diasCredito: 15,
    },
  });
  console.log('✅ Clientes y Proveedores sembrados');

  // 9. ROOMS AND GUESTS (FOR THE PMS SIMULATION)
  const hab101 = await prisma.room.upsert({
    where: { numero: '101' },
    update: {},
    create: { numero: '101', tipo: 'SUITE_FRENTE_AL_MAR', estado: 'OCUPADA' },
  });

  const hab102 = await prisma.room.upsert({
    where: { numero: '102' },
    update: {},
    create: { numero: '102', tipo: 'ESTANDAR_KING', estado: 'DISPONIBLE' },
  });

  const hab103 = await prisma.room.upsert({
    where: { numero: '103' },
    update: {},
    create: { numero: '103', tipo: 'BUNGALOW_FAMILIAR', estado: 'OCUPADA' },
  });

  await prisma.guest.upsert({
    where: { identificacion: '1-1111-1111' },
    update: {},
    create: {
      identificacion: '1-1111-1111',
      nombreCompleto: 'Carlos Jiménez Salas',
      habitacionId: hab101.id,
      estado: 'HOSPEDADO',
    },
  });

  await prisma.guest.upsert({
    where: { identificacion: '2-2222-2222' },
    update: {},
    create: {
      identificacion: '2-2222-2222',
      nombreCompleto: 'Laura Alvarado Monge',
      habitacionId: hab103.id,
      estado: 'HOSPEDADO',
    },
  });
  console.log('✅ Habitaciones y Huéspedes para PMS sembrados');

  console.log('🎉 --- SEMBRADO COMPLETADO EXITOSAMENTE ---');
}

main()
  .catch((e) => {
    console.error('Error durante la ejecución del seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
