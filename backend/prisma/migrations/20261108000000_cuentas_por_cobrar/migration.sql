-- Cuentas por cobrar (CLI-005/006): abonos de clientes y vencimiento de ventas a crédito
ALTER TABLE "ventas" ADD COLUMN "fechaVencimiento" TIMESTAMP(3);

-- Ventas a crédito existentes: vencen según el plazo actual del cliente
UPDATE "ventas" v SET "fechaVencimiento" = v."createdAt" + (c."diasCredito" * INTERVAL '1 day')
FROM "clientes" c
WHERE v."customerId" = c."id"
  AND EXISTS (SELECT 1 FROM "pagos_venta" p JOIN "formas_pago" f ON f."id" = p."paymentMethodId"
              WHERE p."saleId" = v."id" AND f."codigo" = 'CREDITO');

CREATE TABLE "abonos_clientes" (
    "id" TEXT NOT NULL,
    "consecutivo" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "paymentMethodId" TEXT NOT NULL,
    "cashShiftId" TEXT,
    "monto" DECIMAL(12,2) NOT NULL,
    "referencia" TEXT,
    "notas" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'APLICADO',
    "motivoAnulacion" TEXT,
    "usuarioAnulacionId" TEXT,
    "fechaAnulacion" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "abonos_clientes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "aplicaciones_abonos" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    CONSTRAINT "aplicaciones_abonos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "abonos_clientes_consecutivo_key" ON "abonos_clientes"("consecutivo");
CREATE INDEX "abonos_clientes_customerId_idx" ON "abonos_clientes"("customerId");
CREATE INDEX "aplicaciones_abonos_saleId_idx" ON "aplicaciones_abonos"("saleId");

ALTER TABLE "abonos_clientes" ADD CONSTRAINT "abonos_clientes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "abonos_clientes" ADD CONSTRAINT "abonos_clientes_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "abonos_clientes" ADD CONSTRAINT "abonos_clientes_usuarioAnulacionId_fkey" FOREIGN KEY ("usuarioAnulacionId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "abonos_clientes" ADD CONSTRAINT "abonos_clientes_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "formas_pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "abonos_clientes" ADD CONSTRAINT "abonos_clientes_cashShiftId_fkey" FOREIGN KEY ("cashShiftId") REFERENCES "aperturas_caja"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "aplicaciones_abonos" ADD CONSTRAINT "aplicaciones_abonos_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "abonos_clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "aplicaciones_abonos" ADD CONSTRAINT "aplicaciones_abonos_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
