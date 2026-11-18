-- Costo promedio ponderado al recibir compras (INV-011)
ALTER TABLE "detalle_recepciones" ADD COLUMN "costoAnterior" DECIMAL(12,2);
ALTER TABLE "detalle_recepciones" ADD COLUMN "costoNuevo" DECIMAL(12,2);

-- Método de costeo configurable: PROMEDIO (ponderado) o ULTIMO_COSTO
INSERT INTO "parametros_sistema" ("id", "clave", "valor", "descripcion", "updatedAt")
VALUES ('param_metodo_costeo', 'METODO_COSTEO', 'PROMEDIO', 'Método para actualizar el costo de los productos al recibir compras: PROMEDIO o ULTIMO_COSTO', CURRENT_TIMESTAMP)
ON CONFLICT ("clave") DO NOTHING;
