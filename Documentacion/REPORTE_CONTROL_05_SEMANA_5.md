# Reporte de Control Semanal #05 (Semana 5)
**Práctica Profesional Universitaria**

---

### Datos Generales del Reporte

* **Reporte de control #:** `05`
* **Nombre de la organización:** `Hotel Puerto Limón`
* **Nombre del tutor:** `Andrés Romero Jiménez`
* **Nombre del estudiante:** `Christopher León Salinas`
* **Horas realizadas:**
  * **Semanales:** `20 horas` *(o 40 horas si la jornada es a tiempo completo)*
  * **Acumuladas:** `100 horas` *(o 200 horas)*
* **Fecha del reporte:** `Del 14 de septiembre al 18 de septiembre de 2026`

---

### Descripción de Actividades por Día de Práctica

| Fecha | Descripción de la actividad realizada y objetivo | Porcentaje de avance | Cantidad de horas realizadas |
|---|---|:---:|:---:|
| **Lunes 14/09/2026** | **Objetivo:** Motor transaccional de Ventas con persistencia atómica en Prisma ORM.<br><br>**Actividades:** Desarrollo del controlador y servicio de ventas en el backend. Implementación del flujo de creación de ventas dentro de una transacción atómica (`prisma.$transaction`): generación de correlativo secuencial de ticket, inserción de líneas de venta con cálculo exacto de subtotal, IVA y total, y asociación al turno de caja activo del cajero. | 42% | 4 hrs *(u 8)* |
| **Martes 15/09/2026** | **Objetivo:** Módulo de liquidación de pagos múltiples y registro de cobros en caja.<br><br>**Actividades:** Programación de la lógica para recepción de pagos multiformato (Efectivo, Tarjeta de Crédito/Débito, Transferencia SINPE Móvil y Cargo a Habitación). Validación estricta para asegurar que la suma de los montos pagados coincida exactamente con el total del ticket. Registro automático de los cobros en efectivo en el arqueo del turno de caja. | 44% | 4 hrs *(u 8)* |
| **Miércoles 16/09/2026** | **Objetivo:** Módulo de Control de Inventario y Kardex inmutable secuencial.<br><br>**Actividades:** Implementación del sistema de Kardex permanente: por cada producto facturado se descuenta automáticamente el stock en bodega y se genera un registro inmutable con saldo anterior, cantidad descontada y saldo resultante. Endpoints para ajustes manuales de stock justificados (mermas, vencimientos) y recepción de órdenes de compra con incremento de stock. | 46% | 4 hrs *(u 8)* |
| **Jueves 17/09/2026** | **Objetivo:** Integración y simulación de cargos hoteleros PMS con control de idempotencia.<br><br>**Actividades:** Desarrollo del módulo `pms` para permitir a huéspedes cargar consumos del restaurante o tienda a su cuenta de habitación. Implementación de validación de folio/habitación ocupada y mecanismo de idempotencia mediante token único para evitar duplicidad de cargos ante reintentos de red. Manejo de códigos de respuesta simulada (éxito, folio no existe, timeout de red). | 48% | 4 hrs *(u 8)* |
| **Viernes 18/09/2026** | **Objetivo:** Pruebas integradas de estrés del ciclo completo POS-Inventario-PMS y cierre del 50% del proyecto.<br><br>**Actividades:** Pruebas de estrés y concurrencia simulando ventas continuas, verificación de que el stock nunca sea negativo, validación de anulación de tickets con reversión de inventario y salida de caja, y comprobación de balances de arqueo exactos al centavo. Demostración práctica de los flujos transaccionales al tutor empresarial Don Andrés Romero Jiménez. | 50% | 4 hrs *(u 8)* |

---

### Resumen de Cierre de Semana

* **Actividad(es) por realizar la siguiente semana (Semana 6: del 21 al 25 de septiembre):**
  1. Configuración de la interfaz de usuario en Frontend (React 18 + Vite + Tailwind CSS + Lucide Icons).
  2. Implementación del estado global de autenticación (Zustand / Context API) y protección de rutas en el cliente web.
  3. Diseño y construcción de la interfaz visual del Punto de Venta (POS) con catálogo visual de productos y cesta de compra táctil.
  4. Conexión de Axios con interceptores para envío automático de token JWT a la API.

* **Observaciones (ej cambios de horario, permisos, etc):**
  * Se alcanza con total éxito el hito del 50% del proyecto (100 horas acumuladas). La capa de servicios backend, base de datos relacional y lógica transaccional de ventas, inventario y PMS queda 100% implementada y probada.

* **Firmas requeridas al final del documento:**
  * **Firma del tutor(a) de la empresa:** Andrés Romero Jiménez
  * **Firma de la persona estudiante:** Christopher León Salinas
