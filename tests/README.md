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
