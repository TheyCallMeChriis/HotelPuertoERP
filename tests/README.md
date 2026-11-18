# Verificación de las correcciones

## Tanda 2: ventas, pagos e inventario

Se corrigieron el uso del precio enviado por el cliente, descuentos inválidos, diferencias de centavos en pagos, importe de cargos mixtos a habitación, validación de habitación/huésped en ventas, cantidades inválidas y saldos inconsistentes en ventas, traslados, ajustes y movimientos manuales.

Las salidas de stock usan decremento condicionado al saldo disponible; documento y Kardex se escriben en la misma transacción. Los ajustes que exceden la existencia se rechazan, sin recortar el saldo silenciosamente. La ruta manual también exige permiso de ajuste para los tipos AJUSTE_POSITIVO y AJUSTE_NEGATIVO.

El servidor calcula importes con Decimal y redondea base e impuesto por línea a dos decimales, con mitades hacia arriba. El POS usa aritmética entera para aplicar la misma regla. La modificación de precios desde el payload de venta se rechaza; los descuentos requieren el permiso existente y no pueden superar el importe de la línea.

### Resultado del 18 de septiembre de 2026

- 9 pruebas aisladas aprobadas: 5 de la primera tanda y 4 de la segunda.
- 12 pruebas con PostgreSQL 16 real aprobadas, en una instancia temporal en 127.0.0.1:55439 y base pos_erp_tanda2_test.
- TypeScript de backend y frontend sin errores.
- Compilación de producción del frontend con Vite completada correctamente.
- Se verificó reversión de documentos, pagos y Kardex cuando una venta/traslado falla; cargos PMS parciales; cantidades fraccionarias; validaciones negativas y dos decrementos concurrentes sobre la misma existencia.
- La instancia temporal fue detenida y sus datos descartables eliminados después de la ejecución. No se conectaron estas pruebas a la base del hotel.

Las pruebas de integración llaman los servicios/controladores con PostgreSQL; no representan una prueba completa en navegador ni de todas las rutas HTTP y roles. El ensayo concurrente verifica específicamente el cambio de stock, no el ciclo completo de caja, consecutivos y compras.

### Ejecutar las pruebas aisladas

Desde la raíz, con Node disponible:

```powershell
node --test tests/tanda-1.test.cjs tests/tanda-2.test.cjs
```

### Repetir las pruebas con PostgreSQL temporal

Requiere PostgreSQL instalado. Usar una carpeta temporal nueva, el puerto 55439 y las dependencias ya instaladas del proyecto. Estos comandos no usan el DATABASE_URL del hotel. Los archivos de prueba validan el nombre, host y puerto de destino antes de ejecutarse.

```powershell
$pgBin = 'C:\Users\chris\AppData\Local\Programs\pgsql\bin'
& "$pgBin\initdb.exe" -D "$PWD\tmp\tanda-2-postgres" -U codex_test -A trust --encoding=UTF8 --locale=C
& "$pgBin\pg_ctl.exe" -D "$PWD\tmp\tanda-2-postgres" -l "$PWD\tmp\tanda-2-postgres\server.log" -o '-h 127.0.0.1 -p 55439' -w start
node tests/setup-tanda-2-database.cjs
$env:TEST_DATABASE_URL = 'postgresql://codex_test@127.0.0.1:55439/pos_erp_tanda2_test'
$previousDatabaseUrl = $env:DATABASE_URL
try {
  $env:DATABASE_URL = $env:TEST_DATABASE_URL
  node backend/node_modules/prisma/build/index.js db push --schema backend/prisma/schema.prisma --skip-generate
  node --test tests/tanda-2.integration.cjs
} finally {
  $env:DATABASE_URL = $previousDatabaseUrl
  Remove-Item Env:TEST_DATABASE_URL -ErrorAction SilentlyContinue
  & "$pgBin\pg_ctl.exe" -D "$PWD\tmp\tanda-2-postgres" -m fast -w stop
}
```

La autenticación trust se limita a esta instancia temporal local sin datos del hotel. El servidor debe detenerse al terminar. Los fixtures generan identificadores propios y permiten repetir las pruebas en la misma base de prueba sin limpiar datos anteriores.

## Tanda 3: compras, caja, anulaciones y coherencia del simulador PMS

Se corrigieron los siguientes flujos existentes, sin agregar módulos nuevos ni modificar bitácoras o informes semanales:

- Compras: validación de proveedor/bodega activos, productos físicos, cantidades positivas, costos y fechas. Los importes se calculan con Decimal; un costo explícito de cero se conserva.
- Recepciones: solo productos de la orden, sin exceder el pendiente ni repetir productos; recepción, cantidades acumuladas, stock y Kardex forman una transacción. Se permite recepción parcial; la interfaz omite los artículos con cero unidades recibidas hoy.
- Caja: apertura única por caja mediante coordinación transaccional; importes y tipos de movimiento validados; cierre calculado con Decimal. Ventas, movimientos, cierre y anulaciones se coordinan por caja para evitar inconsistencias con solicitudes simultáneas.
- Anulaciones: una venta se anula una sola vez y reintegra las cantidades en la bodega registrada en el Kardex original, incluso si cambia la configuración del POS. Los turnos cerrados no admiten anulaciones, pues falta implementar un flujo de devolución posterior al arqueo.
- PMS local: la anulación marca el cargo ANULADO y cancela su cola pendiente/fallida. Un reintento no lo reactiva. El endpoint directo valida habitación, huésped, importe y venta; una misma clave con datos diferentes se rechaza. Cargo y cola se escriben juntos; los reintentos actualizan la cola sin duplicar el cargo. Se exigen los permisos HOTEL_PMS existentes.
- Consecutivos de ventas, órdenes y recepciones: se calculan desde el máximo existente y se protegen con un bloqueo de transacción, en lugar de usar count() + 1. No se modificaron todavía los consecutivos de ajustes y traslados.

### Verificación del 18 de septiembre de 2026

- 18 pruebas nuevas con PostgreSQL real aprobadas, incluidas carreras de recepción, apertura, venta/cierre, movimiento/cierre, anulación/cierre y reintento/anulación.
- Las 12 pruebas PostgreSQL de la tanda 2 y las 9 pruebas aisladas anteriores siguen aprobadas: 39 pruebas distintas en total.
- TypeScript de backend y frontend sin errores.
- Compilación de producción del frontend con Vite completada correctamente.
- La base utilizada continúa llamándose pos_erp_tanda2_test para reutilizar la protección de destino de las pruebas anteriores; en esta ejecución se creó en una instancia temporal nueva, tmp/tanda-3-postgres. No se utilizó la base del hotel.
- La instancia temporal se detuvo y se eliminó su carpeta de datos al terminar.

Para repetir ambas tandas de integración con la instancia temporal del procedimiento anterior, sustituir su comando de pruebas por:

```powershell
node --test --test-concurrency=1 tests/tanda-2.integration.cjs tests/tanda-3.integration.cjs
```

Estas son verificaciones específicas de servicios/controladores y base de datos; las pruebas generales de rutas HTTP, roles y navegación siguen pendientes. Las órdenes antiguas con productos duplicados se rechazan al recibir, porque no se puede determinar de forma segura a qué línea asignar la entrega. Los bloqueos coordinan las operaciones de la API; los scripts que escriben directamente en Prisma no pasan por estas validaciones. La reversión PMS es exclusivamente simulada, sin conexión a un hotel externo.

## Tanda 4: crédito, configuración, inicio portable y migración inicial

- Crédito: exige cliente activo con crédito autorizado, límite y plazo positivos. Solo la parte pagada con CREDITO consume cupo. Las ventas simultáneas del mismo cliente se coordinan para no exceder el límite; anular libera el cupo. Crear condiciones de crédito requiere CLIENTES:EDITAR o administrador, además del permiso de creación de clientes de la ruta.
- El saldo disponible se calcula a partir de los pagos CREDITO en ventas completadas. No se agregaron cobranzas ni cuentas por cobrar; no existe todavía registro de abonos o liquidación de esas deudas.
- Ajustes y traslados usan consecutivos calculados desde el máximo existente y protegidos dentro de la transacción.
- JWT: se eliminó el secreto de respaldo, se validan las variables al iniciar y la duración configurada se utiliza al emitir el token. El secreto local existente pasó la validación y no se cambió.
- Docker requiere contraseña por entorno. El seed exige contraseñas explícitas diferentes y valida antes de escribir; su ejecución ahora termina sin quedarse observando archivos. No se rotaron contraseñas de usuarios ni de la base existente.
- Los lanzadores usan la ubicación del proyecto, con opciones de PostgreSQL externo, Docker o instalación local configurable. Inician procesos ocultos con logs y verifican disponibilidad de API/frontend. CheckOnly valida configuración y dependencias sin iniciar servidores.
- Se agregó una migración inicial versionada, instrucciones de adopción para bases existentes y un README principal con instalación, estructura y límites reales.

### Verificación del 18 de septiembre de 2026

- 13 pruebas aisladas y 36 con PostgreSQL aprobadas: 49 pruebas distintas. La tanda 4 agregó 4 aisladas y 6 de integración.
- La migración inicial se aplicó con migrate deploy en una base temporal vacía; migrate diff confirmó que no hay diferencias con el esquema Prisma.
- El seed se ejecutó correctamente con contraseñas aleatorias descartables en esa base temporal.
- TypeScript de backend y frontend sin errores. El lanzador pasó el análisis sintáctico de PowerShell y CheckOnly desde otra carpeta.
- Compilación de producción del frontend con Vite completada correctamente.
- Se comprobó que la instancia temporal ya no estaba activa y se eliminó su carpeta de datos.
- El arranque completo de los lanzadores y Docker quedan para las pruebas generales; Docker no está disponible en este entorno. La comprobación CheckOnly no acredita conexión a la base.

Comandos de pruebas desde la raíz:

```powershell
node --test tests/tanda-1.test.cjs tests/tanda-2.test.cjs tests/tanda-4.test.cjs
# Solo después de preparar la base temporal protegida y TEST_DATABASE_URL:
node --test --test-concurrency=1 tests/tanda-2.integration.cjs tests/tanda-3.integration.cjs tests/tanda-4.integration.cjs
```

Para verificar la migración en una instancia temporal nueva, usar el procedimiento de preparación anterior, pero sustituir db push por migrate deploy conservando el DATABASE_URL temporal y la comprobación del código de salida. En esta ejecución se usó tmp/tanda-4-postgres y la base pos_erp_tanda2_test, sin acceder a la base del hotel.

## Tanda 5: correcciones de la instalación local

El 18 de septiembre de 2026 se completaron las siguientes operaciones sobre la base configurada del proyecto:

- Se inició PostgreSQL local, que estaba detenido. No se reinicializó la carpeta de datos.
- Se creó un respaldo lógico en tmp/backups/2026-09-18T21-58-00-221Z/database.dump y un manifiesto con SHA-256 y cantidades de registros.
- El respaldo se restauró en otra instancia, puerto 55439: las 34 tablas y sus cantidades de registros coincidieron. La instancia de comprobación se detuvo al finalizar.
- Se sincronizaron los permisos iniciales: 82 asignaciones verificadas. Se conservaron los usuarios y roles existentes.
- migrate diff no detectó diferencias; se registró la migración inicial como aplicada y migrate status confirmó el esquema al día, sin recrear tablas ni borrar operaciones.
- Se detectó que PostgreSQL admitía conexiones locales sin contraseña mediante trust. Se sustituyeron las seis reglas por scram-sha-256, se configuró una contraseña aleatoria y se actualizó backend/.env. Una conexión con contraseña incorrecta fue rechazada y la nueva credencial permitió conectarse.
- Se reemplazaron las claves de demostración de admin, cajero1, mesero1, bodeguero1 y auditor1 por claves diferentes. Se comprobó cada hash nuevo. Se renovó JWT; es necesario reiniciar la API para cargar ese secreto y volver a iniciar sesión.
- Las claves y las copias previas de configuración quedaron fuera del proyecto en LOCALAPPDATA/HotelPuertoERP/recovery, con herencia de permisos deshabilitada y acceso concedido al usuario de Windows. No se imprimieron contraseñas en los resultados de herramientas ni se incluyeron en Git.
- La comprobación final confirmó que las cantidades de registros de negocio y de bitácora se conservaron. Solo cambiaron las asignaciones de permisos, los hashes de las cinco cuentas y el historial de migraciones, además de la configuración local.

Se agregaron scripts explícitos de respaldo y corrección local en scripts/. El de corrección exige un respaldo verificado y no debe ejecutarse de nuevo para rotaciones rutinarias. Estas comprobaciones de respaldo, autenticación y configuración son específicas de la corrección; no son las pruebas generales de la aplicación. Las 49 pruebas de tandas anteriores conservan su resultado histórico; no se repitieron como una ronda general.

## Pendientes después de la tanda 5

- Flujo de devolución de ventas de turnos cerrados (funcionalidad adicional, no implementada en estas correcciones).
- Conexión con un PMS externo y reversión confirmada por ese sistema; la implementación actual es un simulador local.
- Cobranzas, abonos y cuentas por cobrar; la autorización y el límite de crédito existentes ya se validan.
- Reiniciar la API e iniciar sesión con las credenciales actualizadas antes de las pruebas generales. No se levantó la interfaz para realizar esas pruebas durante esta tanda.
- Pruebas generales al terminar las correcciones.
- Bitácoras, informes semanales y demás tareas del análisis original.

El informe de auditoría inicial se conserva como diagnóstico del estado anterior; esta tanda no declara resueltos todos sus hallazgos ni recalcula el porcentaje global de avance.

## Tanda 6: administración, catálogos maestros e inventario manual (5 de noviembre de 2026)

Funcionalidad nueva:

- Administración de seguridad (`/api/admin`, pantalla «Usuarios»): crear, editar, activar/desactivar usuarios, restablecer contraseñas y asignar roles; crear y editar roles y su matriz de permisos por módulo y acción. No se puede desactivar la propia cuenta, quitar el último administrador activo ni editar o desactivar el rol ADMINISTRADOR (GEN-002, GEN-003).
- Bitácora ampliada: inicio de sesión fallido, cierre de sesión, cambio de contraseña, altas/cambios/inactivaciones de usuarios, cambios de roles y permisos, cambios de precio, condiciones de crédito, catálogos y niveles de existencia (SEG-003, SEG-004).
- Catálogos maestros (pantalla «Catálogos»): productos, categorías, clientes, proveedores, bodegas, cajas, departamentos y puntos de venta con alta, edición e inactivación validadas. No hay borrado físico; las inactivaciones se bloquean cuando romperían operaciones (bodega con existencias o usada por un POS, caja con turno abierto, categoría con productos activos, etc.) (GEN-004, GEN-005, GEN-007, GEN-010, CLI-002, COM-001, COM-009, INV-001).
- Nuevo módulo de permisos `CATALOGOS`. Crear o editar productos ya no depende de `VENTAS:CREAR`, que tenía el cajero.
- Inventario: entradas, salidas y mermas manuales con motivo desde la interfaz, y configuración de mínimos y máximos por bodega (INV-003, INV-004, INV-009, REC-005).
- Sesión expirada: la interfaz vuelve al inicio de sesión. Cada usuario puede cambiar su contraseña.
- Migración `20261105000000_administracion_catalogos`: tabla `departamentos` (cargada con los departamentos ya usados por los puntos de venta) y columna `condicionesPago` en proveedores.

### Actualizar una instalación existente

Con respaldo previo verificado:

```powershell
npm --prefix backend run prisma:generate
npm --prefix backend run prisma:deploy
npm --prefix backend run permissions:sync
```

`permissions:sync` registra los permisos `CATALOGOS:*` que falten y completa los permisos iniciales de los perfiles, sin quitar asignaciones personalizadas.

### Verificación

- TypeScript de backend y frontend sin errores; compilación de producción de Vite correcta.
- 13 pruebas aisladas aprobadas (tandas 1, 2 y 4). El fixture de la tanda 1 incluye ahora el módulo `CATALOGOS`.
- `tests/tanda-6-administracion.http.cjs`: 8 pruebas HTTP de extremo a extremo aprobadas contra la API y PostgreSQL 16 con las migraciones aplicadas. Cubren permisos en backend, ciclo de vida de usuarios, efecto real de los permisos, unicidad, auditoría, reglas de inactivación, crédito y Kardex de movimientos manuales.
- Limitación: en el entorno de desarrollo donde se escribió esta tanda no se pudo descargar el motor nativo de Prisma, así que se usó el motor WASM. Por diferencias de ese motor con los decimales, las 36 pruebas de integración de las tandas 2 a 4 deben repetirse en la PC del proyecto. Esta tanda no modificó ventas, caja, compras ni PMS.

Para ejecutar las pruebas HTTP, con la API iniciada sobre una base de **prueba** sembrada:

```powershell
$env:API_URL='http://127.0.0.1:4000/api'; $env:ADMIN_USER='admin'; $env:ADMIN_PASS='<clave>'
$env:OPER_USER='cajero1'; $env:OPER_PASS='<clave>'; $env:ALLOW_WRITE_TESTS='1'
node --test --test-concurrency=1 tests/tanda-6-administracion.http.cjs
```

## Tanda 7: reportes con filtros, totales y exportación (5 de noviembre de 2026)

Pantalla «Reportes» reorganizada en siete reportes, cada uno con sus filtros, tarjetas de resumen, fila de totales y exportación:

| Reporte | Filtros | Requisitos |
| --- | --- | --- |
| Ventas | fechas, punto de venta, usuario, producto | REP-001 |
| Formas de pago | fechas, punto de venta | REP-002 |
| Más vendidos | fechas, punto de venta, orden por cantidad o monto | REP-003 |
| Existencias | bodega, solo bajo mínimo; incluye valor del inventario | REP-004 |
| Kardex | producto (obligatorio), bodega, fechas | REP-005 |
| Compras | fechas, proveedor, producto; basado en recepciones con factura | REP-006, COM-008 |
| Cierres de caja | fechas, caja, solo con diferencia; desglose por medio, quién abrió y quién cerró | REP-007, CAJ-007, CAJ-008 |

- Exportación a **PDF**, **Excel (.xlsx)** y **CSV** con las mismas columnas, filas, totales y la descripción de filtros, fecha y usuario que generó el archivo (GEN-009, REP-009). El CSV usa `;` y BOM UTF-8 para abrir bien en Excel en español.
- Corrección: la fecha final de los reportes excluía todo ese día porque se interpretaba como medianoche UTC. Ahora «hasta» incluye el día completo en la hora local; fechas imposibles o rangos invertidos se rechazan con 400.
- Formas de pago se filtra por la fecha de la venta (no del registro del pago) para conciliar con los cierres.
- `GET /api/caja/historico` acepta `fechaInicio`, `fechaFin` y `estado` (CAJ-008).
- Nuevas dependencias del frontend: `jspdf`, `jspdf-autotable` y `write-excel-file` (versiones fijas). `iniciar.bat` las instala automáticamente si faltan.

### Verificación

- `tests/tanda-7-reportes.http.cjs`: 8 pruebas HTTP aprobadas. Crea un escenario propio (compra con factura, tres ventas incluida una mixta, cierre con faltante de ₡500) y comprueba que cada reporte devuelva exactamente esos importes, que filas y totales concilien, y que los reportes exijan `REPORTES:VER`.
- Tanda 6 (8 pruebas HTTP) y las 13 aisladas siguen aprobadas.
- Se descargaron desde el navegador los tres formatos y se verificó su contenido: PDF con encabezado, filtros y totales; Excel con números y fechas como valores reales; CSV con totales.

```powershell
node --test --test-concurrency=1 tests/tanda-7-reportes.http.cjs
```
(con las mismas variables de entorno que la tanda 6)

## Tanda 8: POS — descuento por porcentaje, observaciones y ventas suspendidas (5 de noviembre de 2026)

- **Descuento por monto o porcentaje (POS-004):** botón «Desc./Nota» en cada línea del carrito. El porcentaje se envía como `descuentoPorcentaje` y el servidor calcula el monto con la misma regla de redondeo que la interfaz; si cambia la cantidad, el descuento porcentual se recalcula. Requiere `VENTAS:DESCUENTO`. Cada venta con descuento registra el evento `DESCUENTO_APLICADO` con autor y detalle por línea (SEG-004).
- **Observaciones (POS-005):** por línea («Sin hielo») y por venta. Se guardan y aparecen en el comprobante y en su reimpresión, junto con cliente, punto de venta y descuentos (FAC-002).
- **Ventas suspendidas (POS-006):** botón «Suspender» guarda la orden con una referencia (mesa, habitación o nombre) sin consecutivo, pagos, caja ni inventario. «Suspendidas» lista las del punto de venta para retomarlas (con precios actuales) o descartarlas con motivo auditado. Al cobrar una venta retomada se elimina el borrador en la misma transacción; un segundo cobro del mismo borrador se rechaza con 409.
- Migración `20261105010000_ventas_suspendidas` (tabla `ventas_suspendidas`). `iniciar.bat` la aplica automáticamente.
- Corrección visual: con descuento, el subtotal del carrito y del comprobante se muestra antes del descuento.

### Verificación

- `tests/tanda-8-pos.http.cjs`: 4 pruebas HTTP aprobadas (cálculo y auditoría del porcentaje, rechazo sin permiso, suspender sin afectar caja ni inventario, cobro único, descarte auditado y permisos).
- Recorrido completo en el navegador: descuento del 10 %, observación, suspender, retomar, cobrar y comprobante, sin errores en consola.
- Tandas 6 y 7 y las 13 pruebas aisladas siguen aprobadas.

## Tanda 9: toma de inventario físico (5 de noviembre de 2026)

Pestaña **Inventario → Toma física** (INV-007):

1. **Iniciar:** congela la existencia del sistema de cada producto inventariable activo de la bodega (opcionalmente de una categoría) con consecutivo `TF-000001`. Solo puede haber una toma abierta por bodega.
2. **Contar:** se digitan los conteos (pueden guardarse en varias sesiones); la pantalla calcula en vivo la diferencia y su valor al costo, con filtros «Sin contar» y «Con diferencia». Botón «Hoja de conteo PDF» para contar en papel.
3. **Aplicar:** requiere `INVENTARIO:AJUSTE`. Cada diferencia de los productos contados genera un `AJUSTE_POSITIVO` o `AJUSTE_NEGATIVO` en el Kardex con el consecutivo de la toma. Los no contados no se modifican. La diferencia se aplica sobre la existencia actual, por lo que las ventas o movimientos ocurridos durante la toma no se pierden; si un faltante dejaría la existencia negativa, se rechaza todo.
4. **Anular:** con motivo obligatorio, sin modificar existencias. Inicio, aplicación y anulación quedan en la bitácora.

- Migración `20261105020000_toma_fisica` (tablas `tomas_fisicas` y `detalle_tomas_fisicas`).
- `tests/tanda-9-toma-fisica.http.cjs`: 4 pruebas HTTP aprobadas (congelamiento, una toma abierta por bodega, diferencias sin tocar existencias, ajuste correcto con movimiento posterior, Kardex, doble aplicación rechazada, permisos de contar y aplicar, anulación).

## Verificación integral del 5 de noviembre de 2026 (tanda 10)

Instalación limpia en PostgreSQL 16: base nueva, las 4 migraciones y el seed, sin errores (60 permisos, 96 asignaciones, 7 roles). Se consultaron los 38 modelos con sus 287 columnas para confirmar que las migraciones coinciden con `schema.prisma`.

| Prueba | Resultado |
| --- | --- |
| Aisladas (tandas 1, 2 y 4) | 14/14 |
| Integración con PostgreSQL (tandas 2, 3 y 4) | 36/36 |
| HTTP tanda 6 · administración y catálogos | 8/8 |
| HTTP tanda 7 · reportes | 8/8 |
| HTTP tanda 8 · POS | 4/4 |
| HTTP tanda 9 · toma física | 4/4 |
| HTTP tanda 10 · **10 escenarios obligatorios de la sección 19** | 10/10 |
| HTTP tanda 11 · adaptador PMS, autoría de registros y clientes persona/empresa | 4/4 |
| HTTP tanda 12 · cuentas por cobrar | 5/5 |
| HTTP tanda 13 · solicitudes de compra y aprobación | 3/3 |
| HTTP tanda 14 · costo promedio y método de costeo | 2/2 |
| HTTP tanda 15 · notas de crédito y reimpresión | 4/4 |
| Respaldo `pg_dump` y restauración `pg_restore` en otra base | 38 tablas con conteos idénticos |
| Recorrido en navegador de todas las pantallas con los 7 roles | sin errores de consola ni llamadas rechazadas |

`tests/tanda-10-escenarios-demo.http.cjs` reproduce: venta completa, pago mixto, anulación controlada, inventario (entrada, traslado y salida con Kardex), compra con recepción parcial, cierre de caja con diferencia, seguridad, auditoría, integración PMS simulada con error y reintento, e integridad final. El escenario de respaldo se demuestra con `scripts/backup-database.cjs`.

Tiempos de respuesta medidos (20 repeticiones, motor de Prisma más lento que el de producción): login ~100 ms, búsqueda de productos ~15 ms, registrar venta ~55 ms, existencias, reportes y dashboard < 35 ms (RNF-002).

Correcciones derivadas del recorrido por roles:

- La pantalla POS se montaba un instante para perfiles sin acceso y generaba un 403; ahora solo se monta una pantalla permitida.
- El POS se muestra solo con `VENTAS:CREAR`; Contabilidad consulta ventas en Reportes.
- Caja oculta «Abrir turno» y «Movimiento extraordinario» sin `CAJA:CREAR` y «Cierre» sin `CAJA:EDITAR`.
- El selector de cajas ya no muestra paréntesis vacíos cuando no hay ubicación.

Pendiente fuera de este entorno: probar las funciones críticas en dos navegadores (Chrome y Edge) en la PC del proyecto (RNF-001).

## Tanda 11 · PMS-001, GEN-008 y CLI-001

```powershell
node --test --test-concurrency=1 tests/tanda-11-pms-auditoria-clientes.http.cjs
```

Requiere aplicar la migración `20261107000000_auditoria_registros_clientes` (la hace `iniciar.bat` con `prisma migrate deploy`).

- **PMS-001:** la comunicación con el PMS pasa por `backend/src/integrations/pms/`. El adaptador se elige con `PMS_ADAPTER` en `backend/.env` (por defecto `simulado`). Para conectar el PMS real solo hay que escribir un adaptador nuevo con `enviarCargo` y `revertirCargo` y registrarlo en `index.ts`. La conciliación muestra ventas cobradas a habitación sin cargo, montos distintos, anulaciones no reflejadas y operaciones pendientes, con filtro `fechaInicio`/`fechaFin`.
- **GEN-008:** usuarios, roles, categorías, productos, clientes, proveedores, bodegas, cajas, puntos de venta y departamentos guardan `createdAt`, `updatedAt`, `creadoPor` y `modificadoPor`. Se muestran al editar el registro.
- **CLI-001:** el cliente es persona (cédula física, DIMEX, pasaporte) o empresa (cédula jurídica, con persona de contacto). La identificación se valida según el tipo: física 9 dígitos, jurídica 10 dígitos que empiezan en 2-5, DIMEX 11-12 dígitos y pasaporte 6-20 caracteres; se ignoran guiones y espacios. Los registros antiguos con tipo `JURIDICA` se convierten a `CEDULA_JURIDICA` en la migración.

## Tanda 12 · Cuentas por cobrar (CLI-004, CLI-005, CLI-006)

```powershell
node --test --test-concurrency=1 tests/tanda-12-cuentas-cobrar.http.cjs
```

Requiere la migración `20261108000000_cuentas_por_cobrar`. Pantalla: pestaña **Cobros** (permiso `CLIENTES:VER`; registrar abonos `CLIENTES:CREAR`; anular `CLIENTES:ANULAR`).

- El cupo de crédito se valida contra el saldo pendiente (ventas a crédito menos abonos).
- Cada abono (consecutivo `ABO-`) se aplica al documento indicado o a los más antiguos, no admite saldo a favor y queda en el historial. Los abonos en efectivo exigen un turno de caja abierto y se suman al arqueo y al reporte de cierres.
- Un abono anulado restituye el saldo; una venta con abonos no se puede anular hasta anular sus abonos.
- Estado de cuenta y antigüedad de saldos (corriente, 1-30, 31-60, 61-90, más de 90 días) con fecha de corte y exportación a PDF y Excel.

## Tanda 13 · Solicitudes de compra y aprobación (COM-002, COM-003)

```powershell
node --test --test-concurrency=1 tests/tanda-13-solicitudes-compra.http.cjs
```

Requiere la migración `20261110000000_solicitudes_compra` y ejecutar `npm run permissions:sync` (lo hace `iniciar.bat`), que agrega la acción **APROBAR** al catálogo de permisos. Por defecto solo el ADMINISTRADOR la tiene; asígnela desde Usuarios → Roles al rol que deba aprobar compras.

- Solicita quien tiene `COMPRAS:CREAR` o `INVENTARIO:CREAR` (proveeduría o bodega): bodega destino, departamento, justificación, prioridad, artículos y cantidades. Consecutivo `SC-`.
- Aprueba o rechaza quien tiene `COMPRAS:APROBAR`; el rechazo exige motivo y nadie aprueba su propia solicitud (salvo el administrador).
- Proveeduría (`COMPRAS:CREAR`) convierte la solicitud aprobada en orden de compra eligiendo proveedor y precios; la orden queda vinculada y sigue el flujo normal de recepción.
- Estados: PENDIENTE → APROBADA → CONVERTIDA, o RECHAZADA / CANCELADA. Cada cambio queda en la bitácora de auditoría.

## Tanda 14 · Costo promedio (INV-011)

```powershell
node --test --test-concurrency=1 tests/tanda-14-costo-promedio.http.cjs
```

Requiere la migración `20261110010000_costo_promedio`, que crea el parámetro `METODO_COSTEO` con valor `PROMEDIO`.

- Al recibir una compra, el costo del producto se recalcula: (existencia de todas las bodegas × costo actual + cantidad recibida × costo de compra) ÷ (existencia + cantidad). Sin existencias, el costo es el de la compra.
- Cada línea de la recepción guarda el costo anterior y el nuevo, y la bitácora registra el cambio.
- En **Usuarios → Parámetros** se puede cambiar a **último costo de compra**. El cambio requiere `SEGURIDAD:EDITAR`, queda auditado y aplica a las recepciones siguientes.
- Las recepciones simultáneas del mismo producto se serializan para que el promedio no se calcule con datos desactualizados.

## Tanda 15 · Notas de crédito y reimpresión (FAC-005, FAC-006)

```powershell
node --test --test-concurrency=1 tests/tanda-15-notas-credito.http.cjs
```

Requiere la migración `20261110020000_notas_credito`. En el POS → **Historial de ventas**: botón **Nota de crédito** (permiso `VENTAS:ANULAR`) y **Ver recibo → Reimprimir (copia)**.

- La nota de crédito (consecutivo `NC-`) devuelve toda la venta o parte de sus líneas. No modifica la venta original: queda vinculada a ella y en la bitácora con motivo y usuario.
- El reintegro se hace solo por una forma de pago usada en la venta y hasta lo pagado por ella. En efectivo sale del turno abierto que se indique (sirve para ventas de turnos ya cerrados sin alterar ese cierre); a crédito rebaja el saldo del cliente, sin superar lo pendiente.
- Reintegra la mercadería al inventario (movimiento `ENTRADA_DEVOLUCION` en el kardex), salvo que se indique lo contrario.
- La última devolución de una línea toma el remanente exacto para que no se pierdan céntimos por redondeo.
- Una venta con nota de crédito ya no se anula; las ventas cargadas a habitación se revierten con la anulación, que revierte el cargo en el PMS.
- El reporte de ventas muestra el total de notas de crédito del período y la venta neta.
- Reimprimir no crea otra venta: incrementa el contador de impresiones, marca el comprobante como **COPIA N** y queda auditado.
