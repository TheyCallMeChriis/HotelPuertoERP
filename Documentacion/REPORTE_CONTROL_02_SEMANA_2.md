# Reporte de Control Semanal #02 (Semana 2)
**Práctica Profesional Universitaria**

---

### Datos Generales del Reporte

* **Reporte de control #:** `02`
* **Nombre de la organización:** `Hotel Puerto Limón`
* **Nombre del tutor:** `Andrés Romero Jiménez`
* **Nombre del estudiante:** `Christopher León Salinas`
* **Horas realizadas:**
  * **Semanales:** `20 horas` *(o 40 horas si tu jornada es de 8 horas diarias)*
  * **Acumuladas:** `40 horas` *(o 80 horas)*
* **Fecha del reporte:** `Del 24 de agosto al 28 de agosto de 2026` *(Cuarta semana de agosto)*

---

### Descripción de Actividades por Día de Práctica

| Fecha | Descripción de la actividad realizada y objetivo | Porcentaje de avance | Cantidad de horas realizadas |
|---|---|:---:|:---:|
| **Lunes 24/08/2026** | **Objetivo:** Delimitación del alcance definitivo del MVP y priorización de módulos con el tutor empresarial.<br><br>**Actividades:** Sesión de trabajo con Andrés Romero Jiménez para definir los límites del proyecto. Acuerdo sobre los módulos prioritarios a desarrollar en la primera versión: Autenticación con roles (RBAC), Catálogos maestros, Punto de Venta (POS) con cobros rápidos, Control de Cajas/Arqueos, Inventario con Kardex inmutable y Simulador de cargos PMS. Se establecen los criterios de éxito y casos de uso críticos para la operación hotelera. | 12% | 4 hrs *(u 8)* |
| **Martes 25/08/2026** | **Objetivo:** Especificación formal de requerimientos funcionales y reglas de negocio del hotel.<br><br>**Actividades:** Redacción y estructuración de la matriz de requerimientos funcionales: reglas de apertura de caja con fondo inicial obligatorio, bloqueo de ventas si no hay turno abierto, soporte para pagos mixtos (efectivo + tarjeta), reglas de anulación con autorización y justificación, y mecanismo de imputación de cargos a habitaciones con tokens de idempotencia para evitar cobros duplicados. | 14% | 4 hrs *(u 8)* |
| **Miércoles 26/08/2026** | **Objetivo:** Definición de requerimientos no funcionales, seguridad y justificación del stack tecnológico.<br><br>**Actividades:** Análisis de viabilidad técnica y redacción de la justificación arquitectónica. Selección de Node.js + Express (TypeScript) para la API REST, React 18 + Vite + Tailwind CSS para una interfaz de usuario ágil y táctil, y PostgreSQL 16 con Prisma ORM para garantizar integridad referencial y tipos monetarios decimales exactos. Definición de políticas de seguridad: cifrado de contraseñas con bcrypt y autenticación mediante JWT. | 16% | 4 hrs *(u 8)* |
| **Jueves 27/08/2026** | **Objetivo:** Diseño conceptual del modelo entidad-relación y definición de reglas de datos.<br><br>**Actividades:** Elaboración del diagrama preliminar Entidad-Relación (ER). Diseño de las entidades para Usuarios, Roles, Permisos, Cajas, Puntos de Venta, Catálogo de Productos y Bodegas. Establecimiento de reglas de negocio en la base de datos: borrado lógico mediante banderas activas para conservar trazabilidad histórica y prohibición de números flotantes binarios en montos de dinero. | 18% | 4 hrs *(u 8)* |
| **Viernes 28/08/2026** | **Objetivo:** Diseño lógico de las tablas de ventas, Kardex e integración hotelera; revisión de cierre semanal.<br><br>**Actividades:** Extensión del modelo relacional para incluir las entidades de Ventas, Formas de Pago, Movimientos de Caja, Movimientos de Inventario (Kardex secuencial inmutable con saldos anteriores y nuevos), Órdenes de Compra y Cargos PMS. Presentación del borrador del modelo relacional al tutor empresarial para validación. Reunión de cierre de semana para aprobar la arquitectura propuesta. | 20% | 4 hrs *(u 8)* |

---

### Resumen de Cierre de Semana

* **Actividad(es) por realizar la siguiente semana (Semana 3: del 31 de agosto al 4 de septiembre):**
  1. Configuración definitiva del entorno de desarrollo local (Node.js, Git, PostgreSQL 16 y Prisma ORM).
  2. Escritura del esquema formal `schema.prisma` con las 22 tablas y aplicación de migraciones a la base de datos.
  3. Desarrollo del script de sembrado inicial (`seed.ts`) con roles, permisos RBAC, catálogo base y habitaciones de prueba.
  4. Elaboración de la Ficha de Proyecto oficial / Plan de Actividades para firma institucional.

* **Observaciones (ej cambios de horario, permisos, etc):**
  * Cumplimiento satisfactorio de la semana dedicada a la especificación de requerimientos y diseño del modelo relacional. Se valida con el tutor empresarial que el alcance planteado cubre las necesidades críticas del Hotel Puerto Limón sin contratiempos de horario.

* **Firmas requeridas al final del documento:**
  * **Firma del tutor(a) de la empresa:** Andrés Romero Jiménez
  * **Firma de la persona estudiante:** Christopher León Salinas
