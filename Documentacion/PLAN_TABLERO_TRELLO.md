# HotelPuertoERP — Práctica profesional

Contenido preparado para crear el tablero y registrar retrospectivamente el trabajo del proyecto. Este archivo no acredita que las tarjetas ya estén publicadas en Trello.

## Organización del tablero

Listas: **Por hacer**, **En curso**, **Por validar** y **Realizado**.

Etiquetas por tema: Análisis, Backend, Frontend, Base de datos, Seguridad, Correcciones, Pruebas y Documentación. Las semanas pueden añadirse como etiquetas cuando se confirme la distribución de las actividades.

Cada tarjeta debe incluir objetivo, trabajo realizado, evidencia y pendiente de validación, cuando corresponda. Realizado significa que se completó la actividad descrita; no significa que el módulo entero cumple todos los requerimientos. Las pruebas generales se gestionan en tarjetas separadas.

No asignar vencimientos históricos para simular que las tarjetas existían antes. Registrar la semana real en la descripción cuando esté confirmada. Las fechas de las bitácoras no coinciden siempre con la evidencia del repositorio: varias correcciones constan el 18/09/2026, aunque la propuesta de Semana 6 las distribuye entre el 21 y el 25. Confirmar esa distribución antes de publicarla como cronología definitiva.

## Realizado

### 01 — Revisar los requerimientos y diagnosticar el avance inicial
- Trabajo: contrastar los requisitos con el código y distinguir cumplimiento completo, parcial y pendiente.
- Evidencia: `docs/auditoria/ANALISIS_CUMPLIMIENTO.md` y `MATRIZ_REQUISITOS.json`.
- Límite: diagnóstico histórico; no constituye una medición actual del porcentaje de avance.

### 02 — Definir y documentar la arquitectura del proyecto
- Trabajo: organizar API Express/TypeScript, interfaz React/Vite y persistencia PostgreSQL/Prisma.
- Evidencia: `README.md`, `backend/package.json`, `frontend/package.json`.

### 03 — Organizar el repositorio y sus exclusiones
- Trabajo: mantener la estructura del proyecto en Git y excluir dependencias, configuración privada y archivos temporales.
- Evidencia: historial Git y `.gitignore`.
- Límite: verificar la publicación de cambios locales por separado; un commit local no demuestra un push.

### 04 — Construir el modelo de datos y los datos de demostración
- Trabajo: definir entidades y relaciones, siete roles y datos iniciales para el entorno local.
- Evidencia: `backend/prisma/schema.prisma` y `seed.ts`.
- Alcance: el esquema actual contiene 34 modelos; huéspedes y habitaciones son datos del simulador.

### 05 — Implementar autenticación y controles de acceso iniciales
- Trabajo: inicio de sesión con JWT, verificación bcrypt y autorización por rol y permiso.
- Evidencia: `backend/src/modules/auth`, `backend/src/middleware/auth.middleware.ts`, `frontend/src/context/AuthContext.tsx`.
- Pendiente separado: prueba general de todos los perfiles.

### 06 — Implementar la interfaz y la navegación principal
- Trabajo: pantallas de login, caja, POS, inventario, compras, PMS local, reportes y auditoría.
- Evidencia: `frontend/src/App.tsx`, `frontend/src/pages`, `frontend/src/components/Navbar.tsx`.
- Alcance: implementación inicial; la existencia de pantallas no sustituye pruebas de usuario.

### 07 — Implementar apertura, movimientos y cierre de caja
- Trabajo: fondo inicial, ingresos y egresos, efectivo esperado, monto contado y diferencia de arqueo.
- Evidencia: `backend/src/modules/caja` y `frontend/src/pages/Caja.tsx`.

### 08 — Implementar ventas y pagos mixtos
- Trabajo: registro de ventas asociado a un turno, detalle de productos y combinación de medios de pago.
- Evidencia: `backend/src/modules/ventas` y `frontend/src/pages/POS.tsx`.

### 09 — Implementar anulación de ventas e historial de movimientos
- Trabajo: anulación con permiso y motivo, conservación del registro y reintegro de existencias.
- Evidencia: `backend/src/modules/ventas/cancel-sale.ts`.
- Límite: no incluye devoluciones de ventas de turnos cerrados.

### 10 — Implementar inventario, traslados y ajustes
- Trabajo: consultar existencias por bodega y registrar movimientos de Kardex, traslados y ajustes justificados.
- Evidencia: `backend/src/modules/inventario` y `frontend/src/pages/Inventario.tsx`.

### 11 — Implementar compras y recepciones parciales
- Trabajo: órdenes de compra, recepción de mercadería y actualización de existencias y Kardex.
- Evidencia: `backend/src/modules/compras` y `frontend/src/pages/Compras.tsx`.

### 12 — Implementar el simulador local de PMS
- Trabajo: cargos a habitación, identificación de transacciones y cola de reintentos con fallos simulados.
- Evidencia: `backend/src/modules/pms` y `frontend/src/pages/PMS.tsx`.
- Límite: no existe una conexión real con un sistema hotelero externo.

### 13 — Implementar reportes operativos y exportación CSV
- Trabajo: indicadores de ventas, filtros operativos, recaudación y diferencias de arqueo.
- Evidencia: `backend/src/modules/reportes` y `frontend/src/pages/Reportes.tsx`.
- Límite: CSV que puede abrirse en Excel, no exportación nativa XLSX.

### 14 — Implementar registros de auditoría
- Trabajo: conservar eventos sensibles con usuario, fecha y datos de la operación.
- Evidencia: `backend/src/utils/audit.ts` y `backend/src/modules/auditoria`.
- Límite: no afirmar inmutabilidad absoluta frente a modificaciones privilegiadas de la base de datos.

### 15 — Corregir filtros de consultas y permisos iniciales
- Trabajo: ajustar parámetros de consulta y sincronizar las asignaciones iniciales de permisos.
- Evidencia: `frontend/src/api/client.ts`, `backend/src/utils/default-permissions.ts`, `backend/src/scripts/sync-default-permissions.ts` y `tests/tanda-1.test.cjs`.

### 16 — Corregir cálculos monetarios y validación de pagos
- Trabajo: usar precios del servidor, controlar descuentos, redondeos y coincidencia entre pagos y total.
- Evidencia: `backend/src/modules/ventas/create-sale.ts`, `frontend/src/utils/sale-money.ts`, pruebas de tanda 2.

### 17 — Corregir saldos y operaciones simultáneas de inventario
- Trabajo: impedir salidas superiores a la existencia y conservar documento, stock y Kardex dentro de la misma transacción.
- Evidencia: `backend/src/utils/stock-change.ts`, `transaction-lock.ts`, pruebas de integración de tandas 2 a 4.

### 18 — Reforzar validaciones de compras y recepciones
- Trabajo: validar proveedor, bodega, productos, cantidades y costos; impedir recepciones superiores al pendiente.
- Evidencia: `backend/src/modules/compras/purchase-operations.ts` y pruebas de tanda 3.

### 19 — Corregir concurrencia de caja y anulaciones repetidas
- Trabajo: coordinar operaciones por caja, evitar anulaciones duplicadas y devolver stock a la bodega original.
- Evidencia: `backend/src/modules/caja/cash-operations.ts`, `backend/src/modules/ventas/cancel-sale.ts` y pruebas de tanda 3.

### 20 — Corregir cargos y reintentos del PMS local
- Trabajo: validar habitación y huésped, conservar el importe parcial de pagos mixtos y evitar reactivar cargos anulados.
- Evidencia: `backend/src/modules/pms/pms-operations.ts` y pruebas de tandas 2 y 3.

### 21 — Corregir consecutivos y límites de crédito
- Trabajo: coordinar consecutivos y comprobar autorización, límite y plazo de crédito, incluso con ventas simultáneas.
- Evidencia: `backend/src/utils/transaction-lock.ts`, `backend/src/modules/catalogos/customer-validation.ts` y pruebas de tanda 4.
- Límite: no incluye cobranzas ni abonos.

### 22 — Retirar secretos predeterminados y validar configuración
- Trabajo: exigir configuración de JWT y credenciales propias, proteger variables de entorno y corregir la autenticación local.
- Evidencia: `backend/src/config/validate-env.ts`, archivos de ejemplo de entorno y registro de comprobaciones en `tests/README.md`.
- No adjuntar contraseñas, archivos .env ni material de recuperación al tablero.

### 23 — Incorporar migraciones versionadas de Prisma
- Trabajo: añadir la migración base y documentar su adopción sobre una base existente sin recrear datos.
- Evidencia: `backend/prisma/migrations/20260918000000_initial/migration.sql` y `docs/operacion/MIGRACIONES.md`.
- Fecha respaldada por documentación: 18/09/2026; la creación inicial utilizaba db push.

### 24 — Verificar respaldo y restauración de la base local
- Trabajo: generar un respaldo y comprobar su restauración en otra instancia, comparando tablas y cantidades de registros.
- Evidencia: registro de la tanda 5 en `tests/README.md`.
- No adjuntar el respaldo con datos al tablero.

### 25 — Corregir el inicio local y revisar la detención del proyecto
- Trabajo: ajustar los lanzadores, eliminar dependencias de rutas fijas y corregir la comprobación del frontend local.
- Evidencia: `start_servers.ps1`, `start_servers.bat`, `README.md` y revisión registrada en esta conversación.
- Límite: una comprobación de arranque no demuestra que todos los flujos funcionen.

### 26 — Corregir el cero persistente en los campos numéricos
- Trabajo: permitir vaciar el campo durante la edición y distinguir un valor vacío de un cero válido.
- Evidencia: `frontend/src/utils/number-input.ts` y campos numéricos de Caja, POS, Compras, Inventario y PMS.

### 27 — Ejecutar comprobaciones específicas de las correcciones
- Trabajo: ejecutar pruebas aisladas, pruebas con PostgreSQL temporal y comprobaciones de compilación durante las tandas.
- Evidencia: `tests/README.md` y archivos de pruebas de tandas 1 a 4.
- Resultado histórico documentado: 49 pruebas específicas. No equivale a una ronda general de API e interfaz ni a un porcentaje de cumplimiento.

### 28 — Corregir el contenido técnico de las bitácoras 1 a 5
- Trabajo: alinear Word y Markdown, aclarar el alcance del PMS y de las pruebas, corregir referencias a migraciones y revisar el formato.
- Evidencia: reportes numerados 1 a 5 en `Documentacion`.
- Pendiente separado: confirmar horas, porcentajes y cronología antes de entregar.

### 29 — Preparar el documento de la Semana 6
- Trabajo: crear la bitácora del 21 al 25 de septiembre con la plantilla institucional y las actividades propuestas por el estudiante y el asistente.
- Evidencia: `Documentacion/Reporte de control #6 - Semana 6.docx`.
- Pendiente separado: validar distribución real por día, horas y porcentajes.

## Por validar

### 30 — Confirmar horas, porcentajes y cronología de las bitácoras
- Revisar las diferencias entre jornadas de 20 y 40 horas semanales.
- Confirmar si el avance corresponde a cada actividad o al proyecto completo.
- Confirmar el relato de Semana 1 y la distribución real de las correcciones de Semana 6.
- Cierre: documentos aprobados por el estudiante con datos consistentes; no inventar firmas ni aprobaciones del tutor.

### 31 — Conciliar la documentación de entrega con la evidencia
- Revisar el primer informe, los manuales y la lista de verificación, que todavía contienen afirmaciones antiguas de cumplimiento total.
- Cierre: cada afirmación de cumplimiento tiene evidencia y los pendientes quedan explícitos.

## Por hacer

### 32 — Ejecutar pruebas generales de API e interfaz
- Probar perfiles y permisos, apertura/cierre de caja, ventas y pagos, anulaciones, inventario, compras, PMS local y reportes.
- Registrar entrada, resultado esperado, resultado obtenido y evidencia; corregir incidencias y repetir los casos afectados.
- Usar datos de prueba y conservar los datos existentes.

### 33 — Verificar conciliación entre operaciones y reportes
- Comparar ventas, recaudación, efectivo esperado, arqueos y movimientos de inventario con los reportes y CSV.
- Cierre: resultados documentados con un conjunto de operaciones reproducible.

### 34 — Actualizar la matriz de cumplimiento después de las pruebas
- Revaluar cada requisito con evidencia de los flujos completos.
- Cierre: estados completo, parcial o pendiente y estimación de avance con método explícito.

### 35 — Definir el alcance de la conexión con un PMS externo
- Confirmar con el tutor si la práctica exige una conexión real, el proveedor y las condiciones de acceso a un entorno de pruebas.
- Estado: pendiente de definición; el simulador no satisface automáticamente esta tarea.

### 36 — Planificar las funcionalidades adicionales pendientes
- Revisar con el tutor cobranzas y abonos, cuentas por cobrar y devoluciones de ventas de turnos cerrados.
- Cierre: alcance y semana acordados. Crear tarjetas de implementación separadas cuando se prioricen.

## En curso

Inicialmente vacía. Mover aquí únicamente las actividades que se estén trabajando realmente. La carga retrospectiva del tablero no significa que todas las tareas deban ejecutarse en la semana actual.

## Guía breve de Trello

Crear el tablero, añadir las cuatro listas y crear una tarjeta por actividad con su descripción y evidencias. Documentación oficial: [Crear un tablero](https://support.atlassian.com/trello/docs/creating-a-new-board/) y [Añadir tarjetas](https://support.atlassian.com/trello/docs/adding-cards/).
