-- Toma de inventario físico (INV-007)

-- CreateTable
CREATE TABLE "tomas_fisicas" (
    "id" TEXT NOT NULL,
    "consecutivo" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'ABIERTA',
    "notas" TEXT,
    "usuarioId" TEXT NOT NULL,
    "aplicadoPorId" TEXT,
    "fechaInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaAplicacion" TIMESTAMP(3),

    CONSTRAINT "tomas_fisicas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalle_tomas_fisicas" (
    "id" TEXT NOT NULL,
    "physicalCountId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "cantidadSistema" DECIMAL(12,3) NOT NULL,
    "cantidadContada" DECIMAL(12,3),
    "cantidadAjustada" DECIMAL(12,3),

    CONSTRAINT "detalle_tomas_fisicas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tomas_fisicas_consecutivo_key" ON "tomas_fisicas"("consecutivo");

-- CreateIndex
CREATE INDEX "tomas_fisicas_warehouseId_estado_idx" ON "tomas_fisicas"("warehouseId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "detalle_tomas_fisicas_physicalCountId_productId_key" ON "detalle_tomas_fisicas"("physicalCountId", "productId");

-- AddForeignKey
ALTER TABLE "tomas_fisicas" ADD CONSTRAINT "tomas_fisicas_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "bodegas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tomas_fisicas" ADD CONSTRAINT "tomas_fisicas_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tomas_fisicas" ADD CONSTRAINT "tomas_fisicas_aplicadoPorId_fkey" FOREIGN KEY ("aplicadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_tomas_fisicas" ADD CONSTRAINT "detalle_tomas_fisicas_physicalCountId_fkey" FOREIGN KEY ("physicalCountId") REFERENCES "tomas_fisicas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_tomas_fisicas" ADD CONSTRAINT "detalle_tomas_fisicas_productId_fkey" FOREIGN KEY ("productId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
