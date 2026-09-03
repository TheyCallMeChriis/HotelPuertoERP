# Manual de Usuario: Sistema POS-ERP Hotel Puerto Limón

Guía operativa para los perfiles y roles del sistema (Entregable 09, Sección 03).

---

## 1. Credenciales y Cuentas de Acceso (Demostración)

| Rol | Usuario | Contraseña | Enfoque Operativo |
|---|---|---|---|
| **Administrador** | `admin` | `AdminPassword2026!` | Acceso irrestricto a todos los módulos y auditoría |
| **Cajero / Recepción** | `cajero1` | `Hotel2026!` | Ventas POS, arqueo y apertura/cierre de caja |
| **Restaurante / Bar** | `mesero1` | `Hotel2026!` | Comandas rápidas y cargos directos a habitación |
| **Bodega** | `bodeguero1` | `Hotel2026!` | Existencias, Kardex, traslados y ajustes |
| **Auditor / TI** | `auditor1` | `Hotel2026!` | Bitácora de seguridad y verificación técnica |

---

## 2. Flujo Operativo del Cajero (Ventas y Caja)

### Paso 1: Apertura de Turno de Caja (CAJ-001)
1. Inicie sesión con el usuario de cajero.
2. Ingrese a la pestaña **Caja & Arqueo**.
3. Seleccione la caja asignada (ej. `Caja Principal Recepción`).
4. Presione el botón **"Abrir Turno de Caja"**.
5. Digite el monto del fondo inicial en efectivo (ej. ₡25,000) y presione confirmar.

### Paso 2: Realizar Ventas en el POS (POS-001 a POS-010)
1. Ingrese a la pestaña **POS / Ventas**.
2. Verifique la etiqueta verde superior: `Caja Abierta`.
3. Seleccione productos haciendo clic en su tarjeta del catálogo o filtre por nombre/categoría.
4. Ajuste cantidades usando los botones `+` y `-`.
5. Si el cliente solicita descuento y usted cuenta con permiso autorizado, presione `Desc.` e ingrese el monto.
6. Presione **"Cobrar Orden"**.
7. Seleccione el medio de pago:
   * **Efectivo:** Digite el monto entregado.
   * **Tarjeta / SINPE Móvil:** Registre el número de comprobante o referencia.
   * **Pago Mixto:** Presione *"Agregar otra forma de pago"* para combinar (ej. parte en efectivo y parte con tarjeta).
   * **Cargo a Habitación:** Seleccione la habitación ocupada del huésped.
8. Presione **"Confirmar e Imprimir"**: El sistema emitirá el comprobante comercial y rebajará automáticamente el inventario en el Kardex.

### Paso 3: Cierre de Turno y Arqueo de Caja (CAJ-004, CAJ-005, CAJ-007)
1. Al terminar su turno, diríjase a **Caja & Arqueo**.
2. Presione **"Cierre de Caja y Arqueo"**.
3. Cuente el efectivo físico en gaveta e ingrese el monto contado.
4. El sistema calculará en tiempo real si la caja está cuadrada o si existe sobrante o faltante.
5. Confirme el cierre: Se generará el resumen consolidado por todos los medios de pago recibidos.

---

## 3. Flujo Operativo de Bodega e Inventario (INV-001 a INV-012)

### Consulta de Existencias y Kardex:
1. Ingrese a **Inventario & Kardex**.
2. Seleccione la bodega a consultar (ej. `Bodega Central`).
3. Los productos con existencias inferiores al stock mínimo aparecerán resaltados con la advertencia `⚠️ BAJO STOCK`.
4. Haga clic en **"Ver Kardex"** en cualquier producto para visualizar la trazabilidad inmutable de todas sus entradas, salidas, ventas y traslados con saldos secuenciales.

### Traslado entre Bodegas:
1. Presione **"Traslado entre Bodegas"**.
2. Seleccione la bodega destino, el producto y la cantidad.
3. El sistema rebajará el saldo en la bodega origen e incrementará el saldo en la bodega destino bajo un consecutivo único vinculante (INV-005).

---

## 4. Flujo de Compras y Recepción de Mercadería (COM-001 a COM-007)

1. Ingrese a **Compras**.
2. Presione **"Nueva Orden de Compra"**, elija el proveedor, bodega y cantidades.
3. Al recibir la mercadería en bodega, localice la orden y presione **"Recibir Mercadería"**.
4. Ingrese el número de factura del proveedor y confirme las cantidades recibidas (admite entregas parciales o totales).
5. El inventario se incrementará inmediatamente con costo y fecha en el Kardex.

---

## 5. Simulación de Integración Hotelera (PMS)

1. Ingrese a **Simulador PMS**.
2. Puede observar las habitaciones en estado `OCUPADA` y sus huéspedes titulares.
3. Envíe un cargo de prueba. Puede activar la casilla *"Simular Fallo de Conexión PMS"* para evaluar el manejo de errores.
4. En caso de error de red, el sistema encola el registro y permite presionar **"Reintentar"**, garantizando que el huésped nunca reciba cargos duplicados gracias a su identificador de transacción único e idempotente (PMS-005, PMS-007).
