-- Ventas suspendidas del POS (POS-006)

-- CreateTable
CREATE TABLE "ventas_suspendidas" (
    "id" TEXT NOT NULL,
    "pointOfSaleId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "customerId" TEXT,
    "etiqueta" TEXT NOT NULL,
    "notas" TEXT,
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ventas_suspendidas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ventas_suspendidas_pointOfSaleId_idx" ON "ventas_suspendidas"("pointOfSaleId");

-- AddForeignKey
ALTER TABLE "ventas_suspendidas" ADD CONSTRAINT "ventas_suspendidas_pointOfSaleId_fkey" FOREIGN KEY ("pointOfSaleId") REFERENCES "puntos_venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas_suspendidas" ADD CONSTRAINT "ventas_suspendidas_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas_suspendidas" ADD CONSTRAINT "ventas_suspendidas_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
