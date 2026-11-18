-- Administración de catálogos (GEN-004, COM-009)

-- AlterTable
ALTER TABLE "proveedores" ADD COLUMN "condicionesPago" TEXT;

-- CreateTable
CREATE TABLE "departamentos" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departamentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departamentos_codigo_key" ON "departamentos"("codigo");

-- Datos: registrar como departamentos los valores ya usados por los puntos de venta
INSERT INTO "departamentos" ("id", "codigo", "nombre")
SELECT 'dep_' || md5("departamento"), "departamento", initcap(lower(replace("departamento", '_', ' ')))
FROM (SELECT DISTINCT "departamento" FROM "puntos_venta") d
ON CONFLICT ("codigo") DO NOTHING;
