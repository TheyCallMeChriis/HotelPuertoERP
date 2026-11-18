-- GEN-008: autor y fechas de creación y modificación en registros críticos
-- CLI-001: persona de contacto para clientes empresa y tipo de identificación unificado

ALTER TABLE "usuarios" ADD COLUMN "creadoPor" TEXT, ADD COLUMN "modificadoPor" TEXT;
ALTER TABLE "roles" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "roles" ADD COLUMN "creadoPor" TEXT, ADD COLUMN "modificadoPor" TEXT;
ALTER TABLE "categorias" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "categorias" ADD COLUMN "creadoPor" TEXT, ADD COLUMN "modificadoPor" TEXT;
ALTER TABLE "productos" ADD COLUMN "creadoPor" TEXT, ADD COLUMN "modificadoPor" TEXT;
ALTER TABLE "clientes" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "clientes" ADD COLUMN "creadoPor" TEXT, ADD COLUMN "modificadoPor" TEXT;
ALTER TABLE "proveedores" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "proveedores" ADD COLUMN "creadoPor" TEXT, ADD COLUMN "modificadoPor" TEXT;
ALTER TABLE "bodegas" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "bodegas" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "bodegas" ADD COLUMN "creadoPor" TEXT, ADD COLUMN "modificadoPor" TEXT;
ALTER TABLE "cajas" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "cajas" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "cajas" ADD COLUMN "creadoPor" TEXT, ADD COLUMN "modificadoPor" TEXT;
ALTER TABLE "puntos_venta" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "puntos_venta" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "puntos_venta" ADD COLUMN "creadoPor" TEXT, ADD COLUMN "modificadoPor" TEXT;
ALTER TABLE "departamentos" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "departamentos" ADD COLUMN "creadoPor" TEXT, ADD COLUMN "modificadoPor" TEXT;
ALTER TABLE "clientes" ADD COLUMN "contacto" TEXT;
UPDATE "clientes" SET "tipoIdentificacion" = 'CEDULA_JURIDICA' WHERE "tipoIdentificacion" = 'JURIDICA';
