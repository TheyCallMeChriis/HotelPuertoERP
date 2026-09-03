# Documentación Técnica: Sistema POS-ERP Hotel Puerto Limón

## 1. Arquitectura del Sistema
El sistema implementa una arquitectura desacoplada por capas según los requerimientos no funcionales (RNF-005, Sección 17):
- **Capa de Presentación (Frontend SPA):** Desarrollada con React 18, TypeScript, Vite y Tailwind CSS. Diseñada específicamente para maximizar la velocidad operativa del cajero y personal de restaurante con interfaz táctil y de escritorio estándar (RNF-001, RNF-003, POS-002).
- **Capa de Lógica de Negocio y API REST (Backend):** Desarrollada con Node.js, Express y TypeScript. Centraliza todas las validaciones de negocio, permisos RBAC en el servidor (SEG-002), control de caja activa para ventas (CAJ-002), y bloqueos de existencias negativas (INV-010).
- **Capa de Persistencia (Base de Datos Relacional):** Gestionada a través de Prisma ORM sobre PostgreSQL. Implementa tipos numéricos decimales exactos para montos monetarios (Sección 16), claves foráneas con integridad referencial (SEG-009, RNF-004) y borrado lógico en catálogos con historial (GEN-010).
- **Capa de Integraciones Hotelera (Simulador PMS):** Módulo completamente desacoplado con tokens de transacción UUID únicos para garantizar idempotencia en cargos a habitación y mecanismo de reintento de fallos (PMS-001 a PMS-008).

---

## 2. Matriz de Roles y Control de Acceso (RBAC)
Cada usuario cuenta con una cuenta individual (SEG-001) y sus permisos se evalúan en cada endpoint del backend:

| Rol | Responsabilidad Principal | Módulos Autorizados |
|---|---|---|
| **ADMINISTRADOR** | Control total, configuración de parámetros y auditoría | Todos los módulos |
| **CAJERO** | Apertura/cierre de caja, facturación POS y cobros | VENTAS, CAJA, CLIENTES |
| **RESTAURANTE_BAR** | Comandas, consumos y cargos a habitación | VENTAS, HOTEL_PMS |
| **BODEGA** | Entradas, salidas, traslados y ajustes de stock | INVENTARIO (Kardex) |
| **PROVEEDURIA** | Órdenes de compra, proveedores y recepciones | COMPRAS, INVENTARIO |
| **CONTABILIDAD** | Consultas financieras, arqueos y reportes | REPORTES, CAJA (consultas) |
| **AUDITOR** | Supervisión técnica y bitácora de seguridad | AUDITORIA, REPORTES |

---

## 3. Modelo de Datos y Entidades Principales
Cumple con la totalidad de entidades mínimas de la Sección 16:
- `usuarios`, `roles`, `permisos`, `usuario_roles`, `rol_permisos`
- `bitacora_auditoria` (registro inmutable con timestamp, usuario, acción, entidad e IP)
- `categorias`, `productos`, `clientes`, `proveedores`
- `cajas`, `puntos_venta`, `aperturas_caja`, `movimientos_caja`
- `ventas`, `detalle_ventas`, `formas_pago`, `pagos_venta`
- `bodegas`, `existencias`, `movimientos_inventario` (Kardex secuencial inmutable)
- `traslados_bodega`, `detalle_traslados`, `ajustes_inventario`, `detalle_ajustes`
- `ordenes_compra`, `detalle_ordenes_compra`, `recepciones_compra`, `detalle_recepciones`
- `habitaciones`, `huespedes`, `cargos_habitacion`, `cola_integracion_pms`

---

## 4. Endpoints Principales de la API REST

### Autenticación y Seguridad
* `POST /api/auth/login`: Autenticación con JWT y registro de auditoría.
* `GET /api/auth/me`: Perfil del usuario autenticado con matriz de permisos.

### Catálogos
* `GET /api/catalogos/productos`: Catálogo con filtros y búsqueda por nombre/código/código de barras.
* `POST /api/catalogos/productos`: Creación de productos con categorías e impuestos.
* `GET /api/catalogos/bodegas`: Listado de bodegas activas.
* `GET /api/catalogos/puntos-venta`: Puntos de venta con caja y bodega asignadas.

### Caja y Arqueo
* `GET /api/caja/turno-activo`: Estado y balance actual de la caja.
* `POST /api/caja/apertura`: Apertura de turno con fondo inicial en efectivo (CAJ-001).
* `POST /api/caja/movimiento`: Ingreso o egreso extraordinario con justificación (CAJ-003).
* `POST /api/caja/cierre`: Arqueo con cálculo automático de diferencia (sobrante/faltante) y desglose por forma de pago (CAJ-004, CAJ-005, CAJ-007).
* `GET /api/caja/historico`: Consulta de cierres previos (CAJ-008).

### Punto de Venta (POS)
* `POST /api/ventas`: Registro de venta atómica con rebaja de stock en Kardex, validación de caja abierta y soporte de pagos mixtos.
* `GET /api/ventas`: Historial de ventas con filtros.
* `GET /api/ventas/:id`: Detalle completo y comprobante comercial imprimible.
* `POST /api/ventas/:id/anular`: Anulación controlada con permiso `VENTAS:ANULAR`, motivo obligatorio y reintegro automático a inventario.

### Inventario y Kardex
* `GET /api/inventario/existencias`: Existencias por producto y bodega con alerta de bajo mínimo.
* `GET /api/inventario/kardex/:productId`: Kardex inmutable con fechas, tipos de movimiento, documentos de referencia y saldos.
* `POST /api/inventario/traslado`: Traslado atómico entre bodega origen y destino.
* `POST /api/inventario/ajuste`: Ajuste positivo o negativo con motivo.

### Compras
* `POST /api/compras/ordenes`: Creación de orden de compra a proveedor.
* `POST /api/compras/recepciones`: Recepción total o parcial de mercadería con incremento de stock.

### Integración Hotelera / PMS
* `GET /api/pms/habitaciones`: Habitaciones ocupadas y huéspedes actuales.
* `POST /api/pms/cargo`: Envío de cargo a folio con UUID idempotente para evitar duplicación.
* `POST /api/pms/reintentar/:id`: Reintento de transacciones fallidas sin duplicidad.
* `GET /api/pms/conciliacion`: Conciliación de cobros POS contra folios hoteleros.

### Auditoría y Reportes
* `GET /api/auditoria`: Bitácora inmutable de eventos sensibles con filtros.
* `GET /api/reportes/dashboard`: Indicadores operativos del día (KPIs).
* `GET /api/reportes/ventas`: Reporte de ventas para exportación.
* `GET /api/reportes/formas-pago`: Recaudación agrupada por medio de pago.
* `GET /api/reportes/caja-diferencias`: Historial de diferencias en arqueos.
