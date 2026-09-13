# Reporte de Control Semanal #03 (Semana 3)
**Práctica Profesional Universitaria**

---

### Datos Generales del Reporte

* **Reporte de control #:** `03`
* **Nombre de la organización:** `Hotel Puerto Limón`
* **Nombre del tutor:** `Andrés Romero Jiménez`
* **Nombre del estudiante:** `Christopher León Salinas`
* **Horas realizadas:**
  * **Semanales:** `20 horas` *(o 40 horas si la jornada es a tiempo completo)*
  * **Acumuladas:** `60 horas` *(o 120 horas)*
* **Fecha del reporte:** `Del 31 de agosto al 04 de septiembre de 2026`

---

### Descripción de Actividades por Día de Práctica

| Fecha | Descripción de la actividad realizada y objetivo | Porcentaje de avance | Cantidad de horas realizadas |
|---|---|:---:|:---:|
| **Lunes 31/08/2026** | **Objetivo:** Inicialización del repositorio estructurado y configuración del entorno de desarrollo monorepo.<br><br>**Actividades:** Creación del repositorio Git (`HotelPuertoERP`). Configuración de la estructura de carpetas separadas para `backend/` y `frontend/`. Configuración del entorno Node.js, `tsconfig.json`, linters y scripts de inicio en desarrollo (`tsx`, `nodemon`). Definición de variables de entorno seguras (`.env`) para puertos, cadena de conexión a la base de datos y secretos criptográficos. | 22% | 4 hrs *(u 8)* |
| **Martes 01/09/2026** | **Objetivo:** Modelado físico de la base de datos relacional y ejecución de migraciones con Prisma ORM.<br><br>**Actividades:** Redacción formal del archivo `schema.prisma` implementando los 22 modelos relacionales: usuarios, roles, permisos, cajas, turnos, categorías, productos, inventarios, ventas, detalles de venta, pagos, movimientos de caja, auditoría y cargos PMS. Configuración de claves foráneas, índices de búsqueda y tipos `Decimal` para precisión monetaria. Ejecución de la migración inicial en PostgreSQL 16 (`prisma migrate dev --name init`). | 24% | 4 hrs *(u 8)* |
| **Miércoles 02/09/2026** | **Objetivo:** Desarrollo y ejecución del script de sembrado de datos iniciales del sistema (`seed.ts`).<br><br>**Actividades:** Creación del seeder integral con datos iniciales para pruebas y puesta en marcha: roles predeterminados (SuperAdmin, Administrador, Cajero, Inventariador, Recepcionista), usuarios con contraseñas seguras con hash `bcrypt`, categorías de alimentos, bebidas y amenidades, bodegas de stock, métodos de pago autorizados y 10 habitaciones del hotel con datos realistas para simulación PMS. | 26% | 4 hrs *(u 8)* |
| **Jueves 03/09/2026** | **Objetivo:** Formalización de la Ficha de Proyecto y Plan de Actividades de la práctica supervisada.<br><br>**Actividades:** Reunión presencial con el tutor empresarial Don Andrés Romero Jiménez para la revisión final, validación del cronograma de 16 semanas y firma formal de la Ficha de Proyecto oficial y el documento `Plan de Actividades.docx`. Registro del compromiso institucional del proyecto ERP-POS ante la Universidad de Costa Rica (UCR) con un avance general establecido del 28%. | 28% | 4 hrs *(u 8)* |
| **Viernes 04/09/2026** | **Objetivo:** Arquitectura base de la API REST en Express con TypeScript y middlewares globales.<br><br>**Actividades:** Estructuración modular del backend por dominios de negocio (rutas, controladores, servicios y DTOs). Implementación de middlewares transversales para manejo centralizado de excepciones y códigos de error HTTP, registro de peticiones (logger), configuración de CORS para el cliente web y cliente singleton de Prisma (`prismaClient.ts`) con verificación de conexión. Verificación del estado del servidor y cierre de semana. | 30% | 4 hrs *(u 8)* |

---

### Resumen de Cierre de Semana

* **Actividad(es) por realizar la siguiente semana (Semana 4: del 07 al 11 de septiembre):**
  1. Implementación del módulo de autenticación con JSON Web Tokens (JWT) y refresco seguro de credenciales.
  2. Middleware de control de acceso basado en roles (RBAC) y permisos granulares en rutas protegidas.
  3. Desarrollo del módulo de Cajas y Turnos (apertura con fondo inicial, arqueos parciales y cierre de turno).
  4. Endpoints CRUD completos para catálogos maestros: Productos, Categorías y Gestión de Usuarios.

* **Observaciones (ej cambios de horario, permisos, etc):**
  * Semana completada con éxito. Se destaca la formalización y firma del Plan de Actividades oficial el día 03 de septiembre de 2026 con el tutor empresarial, consolidando el calendario de entregas institucionales de la práctica.

* **Firmas requeridas al final del documento:**
  * **Firma del tutor(a) de la empresa:** Andrés Romero Jiménez
  * **Firma de la persona estudiante:** Christopher León Salinas
