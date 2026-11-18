-- Solicitudes internas de compra con aprobación (COM-002, COM-003)
CREATE TABLE "solicitudes_compra" (
    "id" TEXT NOT NULL,
    "consecutivo" TEXT NOT NULL,
    "solicitanteId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "departamento" TEXT,
    "justificacion" TEXT NOT NULL,
    "prioridad" TEXT NOT NULL DEFAULT 'NORMAL',
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "revisorId" TEXT,
    "fechaRevision" TIMESTAMP(3),
    "comentarioRevision" TEXT,
    "purchaseOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "solicitudes_compra_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "solicitudes_compra_estado_check" CHECK ("estado" IN ('PENDIENTE','APROBADA','RECHAZADA','CONVERTIDA','CANCELADA')),
    CONSTRAINT "solicitudes_compra_prioridad_check" CHECK ("prioridad" IN ('NORMAL','URGENTE'))
);

CREATE TABLE "detalle_solicitudes_compra" (
    "id" TEXT NOT NULL,
    "purchaseRequestId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "notas" TEXT,
    CONSTRAINT "detalle_solicitudes_compra_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "detalle_solicitudes_compra_cantidad_check" CHECK ("cantidad" > 0)
);

CREATE UNIQUE INDEX "solicitudes_compra_consecutivo_key" ON "solicitudes_compra"("consecutivo");
CREATE INDEX "solicitudes_compra_estado_idx" ON "solicitudes_compra"("estado");

ALTER TABLE "solicitudes_compra" ADD CONSTRAINT "solicitudes_compra_solicitanteId_fkey" FOREIGN KEY ("solicitanteId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "solicitudes_compra" ADD CONSTRAINT "solicitudes_compra_revisorId_fkey" FOREIGN KEY ("revisorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "solicitudes_compra" ADD CONSTRAINT "solicitudes_compra_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "bodegas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "solicitudes_compra" ADD CONSTRAINT "solicitudes_compra_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "ordenes_compra"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "detalle_solicitudes_compra" ADD CONSTRAINT "detalle_solicitudes_compra_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "solicitudes_compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "detalle_solicitudes_compra" ADD CONSTRAINT "detalle_solicitudes_compra_productId_fkey" FOREIGN KEY ("productId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
