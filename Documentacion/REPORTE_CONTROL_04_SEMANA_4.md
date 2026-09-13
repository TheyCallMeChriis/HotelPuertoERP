# Reporte de Control Semanal #04 (Semana 4)
**Práctica Profesional Universitaria**

---

### Datos Generales del Reporte

* **Reporte de control #:** `04`
* **Nombre de la organización:** `Hotel Puerto Limón`
* **Nombre del tutor:** `Andrés Romero Jiménez`
* **Nombre del estudiante:** `Christopher León Salinas`
* **Horas realizadas:**
  * **Semanales:** `20 horas` *(o 40 horas si la jornada es a tiempo completo)*
  * **Acumuladas:** `80 horas` *(o 160 horas)*
* **Fecha del reporte:** `Del 07 de septiembre al 11 de septiembre de 2026`

---

### Descripción de Actividades por Día de Práctica

| Fecha | Descripción de la actividad realizada y objetivo | Porcentaje de avance | Cantidad de horas realizadas |
|---|---|:---:|:---:|
| **Lunes 07/09/2026** | **Objetivo:** Implementación del sistema de autenticación con JWT y políticas de seguridad de contraseñas.<br><br>**Actividades:** Desarrollo del módulo `auth` en el backend. Creación de los servicios para inicio de sesión seguro verificando hashes `bcrypt`, generación de tokens JWT firmados con expiración controlada, y endpoints para consulta del perfil autenticado (`/auth/me`). Configuración de protecciones contra ataques de fuerza bruta y manejo estricto de credenciales inválidas. | 32% | 4 hrs *(u 8)* |
| **Martes 08/09/2026** | **Objetivo:** Middleware de autorización por roles (RBAC) y permisos granulares en endpoints.<br><br>**Actividades:** Implementación del middleware `authorizeRoles` y verificación de permisos asignados a nivel de base de datos. Protección declarativa de rutas administrativas frente a operaciones de cajero o recepcionista. Verificación de permisos para operaciones sensibles como descuentos de caja, anulación de tickets y modificación de listas de precios. | 34% | 4 hrs *(u 8)* |
| **Miércoles 09/09/2026** | **Objetivo:** Desarrollo del módulo transaccional de Cajas y Gestión de Turnos de trabajo.<br><br>**Actividades:** Programación de la lógica de negocio para cajas registradoras físicas: apertura obligatoria de turno con fondo inicial en efectivo, registro de entradas/salidas menores de efectivo durante el turno, cálculo automático de saldos esperados vs. contados al cierre (arqueo de caja) y determinación de sobrantes/faltantes. | 36% | 4 hrs *(u 8)* |
| **Jueves 10/09/2026** | **Objetivo:** Implementación de endpoints CRUD para Catálogos Maestros (Productos, Categorías, Usuarios).<br><br>**Actividades:** Desarrollo de controladores y servicios para la gestión integral de productos y categorías con impuestos configurables (IVA), SKU, código de barras y estado activo/inactivo. Módulo de administración de usuarios para creación, edición y asignación de roles sin exponer hashes de contraseñas en respuestas. | 38% | 4 hrs *(u 8)* |
| **Viernes 11/09/2026** | **Objetivo:** Validación integral de endpoints de catálogo y caja mediante pruebas REST; cierre semanal.<br><br>**Actividades:** Creación de colecciones de pruebas para validar respuestas HTTP, códigos de estado (200, 201, 400, 401, 403, 404) y payloads JSON. Simulación de ciclos completos de caja (apertura -> transacciones -> arqueo -> cierre) asegurando la consistencia contable de las cajas. Reunión de retroalimentación con el tutor empresarial. | 40% | 4 hrs *(u 8)* |

---

### Resumen de Cierre de Semana

* **Actividad(es) por realizar la siguiente semana (Semana 5: del 14 al 18 de septiembre):**
  1. Desarrollo del motor transaccional de Ventas y Facturación rápida (POS).
  2. Implementación de transacciones atómicas Prisma (`$transaction`) para garantizar que la venta registre detalle, descuente inventario y sume a caja en una única operación.
  3. Módulo de Inventario con Kardex inmutable secuencial (entradas, salidas, ajustes y traslados).
  4. Módulo de simulación de integración PMS para cargos directos a habitaciones con tokens de idempotencia.

* **Observaciones (ej cambios de horario, permisos, etc):**
  * Cumplimiento satisfactorio del 40% del proyecto general según cronograma. Los módulos de seguridad RBAC y control de cajas quedaron completamente operativos en backend sin atrasos reportados.

* **Firmas requeridas al final del documento:**
  * **Firma del tutor(a) de la empresa:** Andrés Romero Jiménez
  * **Firma de la persona estudiante:** Christopher León Salinas
