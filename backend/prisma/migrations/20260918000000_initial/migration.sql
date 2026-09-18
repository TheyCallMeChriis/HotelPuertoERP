-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permisos" (
    "id" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "descripcion" TEXT,

    CONSTRAINT "permisos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_roles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "usuario_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rol_permisos" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "rol_permisos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bitacora_auditoria" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT,
    "detalle" TEXT,
    "ip" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bitacora_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productos" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "categoriaId" TEXT NOT NULL,
    "precioVenta" DECIMAL(12,2) NOT NULL,
    "costo" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "impuesto" DECIMAL(5,2) NOT NULL DEFAULT 13.00,
    "codigoBarras" TEXT,
    "esServicio" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "productos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "tipoIdentificacion" TEXT NOT NULL DEFAULT 'CEDULA_FISICA',
    "identificacion" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT,
    "telefono" TEXT,
    "direccion" TEXT,
    "limiteCredito" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "diasCredito" INTEGER NOT NULL DEFAULT 0,
    "creditoActivo" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cajas" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "ubicacion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "cajas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "puntos_venta" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "departamento" TEXT NOT NULL,
    "cajaId" TEXT NOT NULL,
    "bodegaDefectoId" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "puntos_venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aperturas_caja" (
    "id" TEXT NOT NULL,
    "cajaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "fechaApertura" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "montoInicial" DECIMAL(12,2) NOT NULL,
    "fechaCierre" TIMESTAMP(3),
    "montoContado" DECIMAL(12,2),
    "montoEsperado" DECIMAL(12,2),
    "diferencia" DECIMAL(12,2),
    "estado" TEXT NOT NULL DEFAULT 'ABIERTA',
    "notas" TEXT,

    CONSTRAINT "aperturas_caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_caja" (
    "id" TEXT NOT NULL,
    "cashShiftId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "motivo" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formas_pago" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "formas_pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventas" (
    "id" TEXT NOT NULL,
    "consecutivo" TEXT NOT NULL,
    "cashShiftId" TEXT NOT NULL,
    "pointOfSaleId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "customerId" TEXT,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "descuento" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "impuesto" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'COMPLETADA',
    "motivoAnulacion" TEXT,
    "usuarioAnulacionId" TEXT,
    "fechaAnulacion" TIMESTAMP(3),
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ventas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalle_ventas" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "precioUnitario" DECIMAL(12,2) NOT NULL,
    "descuento" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "impuesto" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "notas" TEXT,

    CONSTRAINT "detalle_ventas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagos_venta" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "paymentMethodId" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "referencia" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bodegas" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "ubicacion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "bodegas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "existencias" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL DEFAULT 0.000,
    "stockMinimo" DECIMAL(12,3) NOT NULL DEFAULT 0.000,
    "stockMaximo" DECIMAL(12,3) NOT NULL DEFAULT 1000.000,

    CONSTRAINT "existencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_inventario" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "saldoAnterior" DECIMAL(12,3) NOT NULL,
    "saldoNuevo" DECIMAL(12,3) NOT NULL,
    "costoUnitario" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "documentoReferencia" TEXT,
    "motivo" TEXT,
    "usuarioId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traslados_bodega" (
    "id" TEXT NOT NULL,
    "consecutivo" TEXT NOT NULL,
    "warehouseOrigenId" TEXT NOT NULL,
    "warehouseDestinoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'COMPLETADO',
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "traslados_bodega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalle_traslados" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "detalle_traslados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ajustes_inventario" (
    "id" TEXT NOT NULL,
    "consecutivo" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "aprobadorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ajustes_inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalle_ajustes" (
    "id" TEXT NOT NULL,
    "adjustmentId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "costoUnitario" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "detalle_ajustes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedores" (
    "id" TEXT NOT NULL,
    "identificacion" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "razonSocial" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "direccion" TEXT,
    "diasCredito" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordenes_compra" (
    "id" TEXT NOT NULL,
    "consecutivo" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "fechaEmision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEsperada" TIMESTAMP(3),
    "estado" TEXT NOT NULL DEFAULT 'APROBADA',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "impuesto" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ordenes_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalle_ordenes_compra" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "cantidadSolicitada" DECIMAL(12,3) NOT NULL,
    "cantidadRecibida" DECIMAL(12,3) NOT NULL DEFAULT 0.000,
    "precioUnitario" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "detalle_ordenes_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recepciones_compra" (
    "id" TEXT NOT NULL,
    "consecutivo" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "facturaProveedor" TEXT,
    "warehouseId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "fechaRecepcion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notas" TEXT,

    CONSTRAINT "recepciones_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalle_recepciones" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "cantidadRecibida" DECIMAL(12,3) NOT NULL,
    "costoUnitario" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "detalle_recepciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "habitaciones" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'DISPONIBLE',
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "habitaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "huespedes" (
    "id" TEXT NOT NULL,
    "identificacion" TEXT NOT NULL,
    "nombreCompleto" TEXT NOT NULL,
    "habitacionId" TEXT NOT NULL,
    "checkIn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkOut" TIMESTAMP(3),
    "estado" TEXT NOT NULL DEFAULT 'HOSPEDADO',

    CONSTRAINT "huespedes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cargos_habitacion" (
    "id" TEXT NOT NULL,
    "saleId" TEXT,
    "roomId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "transaccionUuid" TEXT NOT NULL,
    "estadoPMS" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "reintentos" INTEGER NOT NULL DEFAULT 0,
    "respuestaPMS" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cargos_habitacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cola_integracion_pms" (
    "id" TEXT NOT NULL,
    "roomChargeId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "ultimoError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cola_integracion_pms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parametros_sistema" (
    "id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "descripcion" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parametros_sistema_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_username_key" ON "usuarios"("username");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_nombre_key" ON "roles"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "permisos_modulo_accion_key" ON "permisos"("modulo", "accion");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_roles_userId_roleId_key" ON "usuario_roles"("userId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "rol_permisos_roleId_permissionId_key" ON "rol_permisos"("roleId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_nombre_key" ON "categorias"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "productos_codigo_key" ON "productos"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_identificacion_key" ON "clientes"("identificacion");

-- CreateIndex
CREATE UNIQUE INDEX "cajas_codigo_key" ON "cajas"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "puntos_venta_codigo_key" ON "puntos_venta"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "formas_pago_codigo_key" ON "formas_pago"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "ventas_consecutivo_key" ON "ventas"("consecutivo");

-- CreateIndex
CREATE UNIQUE INDEX "bodegas_codigo_key" ON "bodegas"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "existencias_warehouseId_productId_key" ON "existencias"("warehouseId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "traslados_bodega_consecutivo_key" ON "traslados_bodega"("consecutivo");

-- CreateIndex
CREATE UNIQUE INDEX "ajustes_inventario_consecutivo_key" ON "ajustes_inventario"("consecutivo");

-- CreateIndex
CREATE UNIQUE INDEX "proveedores_identificacion_key" ON "proveedores"("identificacion");

-- CreateIndex
CREATE UNIQUE INDEX "ordenes_compra_consecutivo_key" ON "ordenes_compra"("consecutivo");

-- CreateIndex
CREATE UNIQUE INDEX "recepciones_compra_consecutivo_key" ON "recepciones_compra"("consecutivo");

-- CreateIndex
CREATE UNIQUE INDEX "habitaciones_numero_key" ON "habitaciones"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "huespedes_identificacion_key" ON "huespedes"("identificacion");

-- CreateIndex
CREATE UNIQUE INDEX "cargos_habitacion_saleId_key" ON "cargos_habitacion"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "cargos_habitacion_transaccionUuid_key" ON "cargos_habitacion"("transaccionUuid");

-- CreateIndex
CREATE UNIQUE INDEX "parametros_sistema_clave_key" ON "parametros_sistema"("clave");

-- AddForeignKey
ALTER TABLE "usuario_roles" ADD CONSTRAINT "usuario_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_roles" ADD CONSTRAINT "usuario_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol_permisos" ADD CONSTRAINT "rol_permisos_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol_permisos" ADD CONSTRAINT "rol_permisos_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permisos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitacora_auditoria" ADD CONSTRAINT "bitacora_auditoria_userId_fkey" FOREIGN KEY ("userId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puntos_venta" ADD CONSTRAINT "puntos_venta_cajaId_fkey" FOREIGN KEY ("cajaId") REFERENCES "cajas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puntos_venta" ADD CONSTRAINT "puntos_venta_bodegaDefectoId_fkey" FOREIGN KEY ("bodegaDefectoId") REFERENCES "bodegas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aperturas_caja" ADD CONSTRAINT "aperturas_caja_cajaId_fkey" FOREIGN KEY ("cajaId") REFERENCES "cajas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aperturas_caja" ADD CONSTRAINT "aperturas_caja_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_caja" ADD CONSTRAINT "movimientos_caja_cashShiftId_fkey" FOREIGN KEY ("cashShiftId") REFERENCES "aperturas_caja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_caja" ADD CONSTRAINT "movimientos_caja_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cashShiftId_fkey" FOREIGN KEY ("cashShiftId") REFERENCES "aperturas_caja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_pointOfSaleId_fkey" FOREIGN KEY ("pointOfSaleId") REFERENCES "puntos_venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_usuarioAnulacionId_fkey" FOREIGN KEY ("usuarioAnulacionId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_ventas" ADD CONSTRAINT "detalle_ventas_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "ventas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_ventas" ADD CONSTRAINT "detalle_ventas_productId_fkey" FOREIGN KEY ("productId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_venta" ADD CONSTRAINT "pagos_venta_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "ventas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_venta" ADD CONSTRAINT "pagos_venta_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "formas_pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "existencias" ADD CONSTRAINT "existencias_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "bodegas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "existencias" ADD CONSTRAINT "existencias_productId_fkey" FOREIGN KEY ("productId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "bodegas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_productId_fkey" FOREIGN KEY ("productId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traslados_bodega" ADD CONSTRAINT "traslados_bodega_warehouseOrigenId_fkey" FOREIGN KEY ("warehouseOrigenId") REFERENCES "bodegas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traslados_bodega" ADD CONSTRAINT "traslados_bodega_warehouseDestinoId_fkey" FOREIGN KEY ("warehouseDestinoId") REFERENCES "bodegas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traslados_bodega" ADD CONSTRAINT "traslados_bodega_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_traslados" ADD CONSTRAINT "detalle_traslados_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "traslados_bodega"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_traslados" ADD CONSTRAINT "detalle_traslados_productId_fkey" FOREIGN KEY ("productId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajustes_inventario" ADD CONSTRAINT "ajustes_inventario_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "bodegas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajustes_inventario" ADD CONSTRAINT "ajustes_inventario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajustes_inventario" ADD CONSTRAINT "ajustes_inventario_aprobadorId_fkey" FOREIGN KEY ("aprobadorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_ajustes" ADD CONSTRAINT "detalle_ajustes_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "ajustes_inventario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_ajustes" ADD CONSTRAINT "detalle_ajustes_productId_fkey" FOREIGN KEY ("productId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "bodegas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_ordenes_compra" ADD CONSTRAINT "detalle_ordenes_compra_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "ordenes_compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_ordenes_compra" ADD CONSTRAINT "detalle_ordenes_compra_productId_fkey" FOREIGN KEY ("productId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepciones_compra" ADD CONSTRAINT "recepciones_compra_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "ordenes_compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepciones_compra" ADD CONSTRAINT "recepciones_compra_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "bodegas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepciones_compra" ADD CONSTRAINT "recepciones_compra_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_recepciones" ADD CONSTRAINT "detalle_recepciones_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "recepciones_compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_recepciones" ADD CONSTRAINT "detalle_recepciones_productId_fkey" FOREIGN KEY ("productId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "huespedes" ADD CONSTRAINT "huespedes_habitacionId_fkey" FOREIGN KEY ("habitacionId") REFERENCES "habitaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargos_habitacion" ADD CONSTRAINT "cargos_habitacion_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "ventas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargos_habitacion" ADD CONSTRAINT "cargos_habitacion_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "habitaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargos_habitacion" ADD CONSTRAINT "cargos_habitacion_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "huespedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cola_integracion_pms" ADD CONSTRAINT "cola_integracion_pms_roomChargeId_fkey" FOREIGN KEY ("roomChargeId") REFERENCES "cargos_habitacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
