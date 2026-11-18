-- Notas de crédito (FAC-005) y control de reimpresiones (FAC-006)
ALTER TABLE "ventas" ADD COLUMN "impresiones" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "notas_credito" (
    "id" TEXT NOT NULL,
    "consecutivo" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "impuesto" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "paymentMethodId" TEXT NOT NULL,
    "cashShiftId" TEXT,
    "referencia" TEXT,
    "reintegraInventario" BOOLEAN NOT NULL DEFAULT true,
    "impresiones" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notas_credito_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notas_credito_tipo_check" CHECK ("tipo" IN ('TOTAL','PARCIAL')),
    CONSTRAINT "notas_credito_total_check" CHECK ("total" > 0)
);

CREATE TABLE "detalle_notas_credito" (
    "id" TEXT NOT NULL,
    "creditNoteId" TEXT NOT NULL,
    "saleDetailId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "impuesto" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    CONSTRAINT "detalle_notas_credito_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "detalle_notas_credito_cantidad_check" CHECK ("cantidad" > 0)
);

CREATE UNIQUE INDEX "notas_credito_consecutivo_key" ON "notas_credito"("consecutivo");
CREATE INDEX "notas_credito_saleId_idx" ON "notas_credito"("saleId");

ALTER TABLE "notas_credito" ADD CONSTRAINT "notas_credito_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notas_credito" ADD CONSTRAINT "notas_credito_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notas_credito" ADD CONSTRAINT "notas_credito_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "formas_pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notas_credito" ADD CONSTRAINT "notas_credito_cashShiftId_fkey" FOREIGN KEY ("cashShiftId") REFERENCES "aperturas_caja"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "detalle_notas_credito" ADD CONSTRAINT "detalle_notas_credito_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "notas_credito"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "detalle_notas_credito" ADD CONSTRAINT "detalle_notas_credito_saleDetailId_fkey" FOREIGN KEY ("saleDetailId") REFERENCES "detalle_ventas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "detalle_notas_credito" ADD CONSTRAINT "detalle_notas_credito_productId_fkey" FOREIGN KEY ("productId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
