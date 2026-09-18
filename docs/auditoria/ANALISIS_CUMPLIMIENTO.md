# Auditoría de avance — Hotel Puerto Limón

Referencia: [Requerimientos práctica U.pdf](<C:/Users/chris/OneDrive/Escritorio/Proyecto/Requerimientos práctica U.pdf>), versión 1.0, agosto de 2026, 22 páginas. Código examinado: HEAD `36e6381`, 7 commits. Evaluación del estado disponible en esta sesión; no constituye aprobación académica ni auditoría de producción.

## Resultado

**Avance técnico estimado del listado completo: 47.0 %, redondeado a 47 %.**

**Avance de los 64 requisitos de prioridad alta: 54.3 %, redondeado a 54 %.**

Como comunicación general, es defendible decir «alrededor de la mitad del proyecto, con el núcleo implementado parcialmente y pendientes importantes de validación, administración e integridad». No es defendible afirmar que el MVP esté terminado al 100 %.

La segunda cifra es un indicador del núcleo prioritario, NO un porcentaje exacto del MVP aprobado. El PDF no identifica individualmente cada requisito perteneciente al MVP y condiciona algunas funciones a necesidades/accesos del hotel. El listado completo incluye recetas, crédito y otras funciones de etapas posteriores; no deben confundirse con obligaciones inmediatas de entrega.

Si se excluyen solamente los cuatro requisitos expresamente condicionales POS-011, POS-012, INV-012 y FAC-004, la estimación del resto sube a **48.2 %**. No se excluyeron de forma arbitraria otros requisitos para inflar la cifra. La integración productiva con Hacienda, bancos o datáfonos no se exige como MVP. La interfaz preparada para facturación electrónica sí aparece en el alcance y está pendiente.

## Método reproducible

- Se identificaron 106 IDs únicos: 64 de prioridad alta, 38 media y 4 baja. Se comprobó automáticamente que la matriz contiene exactamente los IDs del PDF.
- Peso por prioridad: alta = 3, media = 2, baja = 1. Peso total = 272.
- Puntuación técnica: 0 = sin flujo operativo del criterio; 25 = base mínima o defecto que invalida el criterio principal; 50 = implementación parcial; 75 = flujo principal presente con limitaciones; 100 = implementación del criterio encontrada sin brecha específica en la revisión.
- Fórmula: suma(puntuación técnica × peso) / suma(pesos). Los puntajes son juicio técnico documentado, no horas trabajadas ni proporción de archivos.
- Distribución: 4 requisitos con 100; 28 con 75; 32 con 50; 22 con 25; 20 con 0.
- Un 100 en esta matriz NO certifica aceptación funcional. Según la sección 19 del PDF, aceptación exige demostración reproducible, integridad, permisos y evidencia. No se dispone de una campaña completa de aceptación ejecutada sobre este estado del proyecto.
- No se usaron los porcentajes de los informes semanales ni las casillas marcadas como prueba de funcionamiento. Un mismo defecto puede afectar varios criterios distintos; eso se refleja en sus filas, sin restar otra penalización global adicional.

## Alcance y comprobaciones ejecutadas

Lectura del PDF completo, inspección del esquema y seed, rutas y controladores de los nueve módulos, cliente API, contexto de autenticación, navegación, pantallas operativas, configuración, scripts, documentación Markdown y script de escenarios. Se renderizaron las páginas de tablas de requisitos y aceptación para comprobar su estructura. Se inventariaron los documentos Word, pero no se autenticaron firmas, reuniones ni aprobaciones mencionadas en ellos.

| Comprobación | Resultado | Qué demuestra |
|---|---|---|
| TypeScript backend, tsc --noEmit | Sin errores | Coherencia de tipos del código incluido en tsconfig |
| TypeScript frontend, tsc --noEmit | Sin errores | Coherencia de tipos de la interfaz |
| Vite build de producción | Correcto; 1603 módulos transformados | Generación del paquete frontend; no demuestra flujos correctos |
| Prisma validate | Esquema válido | Sintaxis y relaciones del esquema; no inspecciona datos reales |
| Git | 7 commits, HEAD 36e6381 | Existe control de versiones real |
| Reproducciones aisladas de defectos | 8 de 8 reprodujeron el problema buscado | Ejecutan código original con persistencia en memoria, no PostgreSQL |
| Pruebas completas API + PostgreSQL + navegador | No ejecutadas | Pendientes para aceptación |
| Dos navegadores, carga concurrente y restauración | No ejecutadas | No hay certificación de estos criterios |

El primer intento de Vite encontró una restricción del sandbox; el reintento autorizado fuera de ese entorno terminó correctamente. No es un defecto de compilación del proyecto. No se modificaron archivos funcionales ni datos del hotel y no se ejecutó el seed ni el script original de escenarios, que escribe en la base configurada. Se generaron únicamente informe y evidencias de auditoría.

## Resumen por área

| Área | Requisitos | Avance ponderado |
|---|---:|---:|
| Generales y catálogos | 10 | 49.1 % |
| POS y ventas | 12 | 44.2 % |
| Caja y cierres | 8 | 68.8 % |
| Inventarios y bodegas | 12 | 38.3 % |
| Recetas, producción y mermas | 6 | 10.0 % |
| Compras y proveedores | 9 | 42.4 % |
| Clientes y crédito | 6 | 21.2 % |
| Integración hotelera | 8 | 43.4 % |
| Documentos comerciales | 6 | 50.0 % |
| Reportes y paneles | 9 | 53.3 % |
| Seguridad y auditoría | 10 | 51.8 % |
| No funcionales | 10 | 58.9 % |

## Hallazgos que deben corregirse antes de considerar terminada la operación

Las etiquetas distinguen reproducción aislada (ejecución del código real con una base en memoria) de lectura estática (consecuencia del código aún no ensayada con PostgreSQL). Ninguna reproducción aislada equivale a un ataque al servidor ni modifica información real.

### F01. Filtros vacíos bloquean consultas — alta, reproducido

El cliente serializa propiedades undefined mediante URLSearchParams. El POS envía `busqueda=undefined&categoriaId=undefined`; el backend aplica esos valores como filtros reales, por lo que el catálogo normal puede aparecer vacío. Reportes envía `fechaInicio=undefined&fechaFin=undefined`, que se convierte en fechas inválidas. Auditoría repite el patrón con acción y entidad, ocultando registros cuando no hay filtros. La aplicación puede mostrar vacío o cero sin explicar el error. Deben omitirse propiedades ausentes antes de construir la consulta y mostrar errores de carga. Evidencia: frontend/src/api/client.ts:65, POS.tsx:117, Reportes.tsx:28 y Auditoria.tsx:13.

### F02. Precio reducido sin permiso — crítica, reproducido

En ventas.controller.ts:81, el backend acepta precioUnitario del cliente; solo verifica el permiso si descuento > 0. Con precio de catálogo 100, enviar precio 1 y descuento 0 resulta en venta aceptada bajo un usuario CAJERO sin permiso de descuento. El precio debe provenir del servidor o exigir autorización explícita para su modificación. POS-004 y SEG-002 no están garantizados.

### F03. Stock negativo con líneas repetidas — crítica, reproducido

Con stock 5, dos líneas del mismo producto por cantidad 4 superan las comprobaciones individuales y terminan dejando -3. El controlador valida cada línea contra el saldo inicial y no verifica de nuevo dentro de la operación de descuento. Consolidar producto/cantidad y hacer la validación atómica es necesario. Aunque la interfaz agrupe productos, la API sigue siendo vulnerable a solicitudes válidas estructuralmente con líneas repetidas.

### F04. Ajuste de inventario inconsistente — crítica, reproducido

Con saldo 5 y ajuste negativo 10, Math.max(0, saldo-cantidad) deja saldo 0, pero registra salida de 10: 5 - 10 no es 0. Debe rechazarse la operación o aplicarse un procedimiento explícitamente autorizado, nunca recortar silenciosamente. El endpoint tampoco limita tipo a POSITIVO/NEGATIVO ni exige cantidad positiva/finita. Fuente: inventario.controller.ts:299-365.

### F05. Pago mixto sobrecarga habitación — crítica, reproducido

Una venta de 100 con efectivo 60 y cargo habitación 40 registra RoomCharge.monto = 100 porque usa totalVenta. Debe usar la suma exclusiva de pagos CARGO_HABITACION. La conciliación actual no señala esta diferencia. Fuente: ventas.controller.ts:275-292.

### F06. Crédito sin autorización ni deuda — alta, reproducido

Se acepta pago CREDITO sin cliente. Los campos creditoActivo, limiteCredito y diasCredito están en el catálogo, pero no participan en la aprobación de ventas. No hay entidad de deuda, abonos, vencimientos ni estado de cuenta. Mostrar «Crédito» entre las formas de pago no implementa cuentas por cobrar.

### F07. PMS directo omite validación operativa — alta, reproducido parcialmente

El endpoint directo acepta monto negativo y no consulta si habitación y huésped están habilitados o corresponden entre sí. La reproducción verifica esa ausencia de validación en el controlador; las FK reales impedirían IDs inexistentes, pero no una habitación existente cerrada ni la combinación de dos IDs existentes incompatibles. En ventas se valida OCUPADA, pero no activo, hospedaje vigente ni correspondencia huésped/habitación.

### F08. Los pagos no coinciden necesariamente al centavo — alta, reproducido

Se aceptó pago 99.96 para una venta de 100. La tolerancia > 0.05 contradice el criterio de coincidencia exacta. Además, aunque PostgreSQL guarda Decimal, los cálculos usan Number, es decir, flotantes binarios, sin política uniforme de redondeo. Una línea puede redondearse distinto a su agregado. Usar aritmética decimal o unidades menores y regla consistente para cantidades fraccionarias, impuestos y descuentos.

### F09. Roles iniciales incompletos — alta, lectura estática

Seed crea siete roles, pero asigna permisos solo a ADMINISTRADOR, CAJERO y BODEGA. CAJERO recibe CAJA:VER y CAJA:CREAR; cierre exige CAJA:EDITAR. En una instalación nueva, el cajero no puede completar el cierre indicado en el manual. RESTAURANTE_BAR no recibe permisos de ventas; PROVEEDURIA y CONTABILIDAD quedan sin permisos operativos. AUDITOR puede consultar bitácora por requireRole, pero no reportes por permiso. Esto describe el seed; no se verificó si la base local fue corregida manualmente. La navegación tampoco coincide completamente con la matriz de responsabilidades.

### F10. Autorización inconsistente por ruta — alta, lectura estática

PMS exige autenticación, sin requirePermission HOTEL_PMS. Cualquier usuario autenticado alcanza enviar/reintentar cargos y conciliación. El dashboard financiero se consulta sin REPORTES:VER. Inventario/movimiento acepta AJUSTE_POSITIVO y AJUSTE_NEGATIVO con INVENTARIO:CREAR, mientras /ajuste exige INVENTARIO:AJUSTE. Catálogos permite crear productos a quien tenga VENTAS:CREAR, incluido el cajero del seed; conviene separar permisos administrativos. No hay asignación de usuarios a puntos de venta ni comprobación de titularidad del turno.

### F11. Transacciones no aseguran concurrencia — alta, lectura estática; falta ensayo concurrente

Usar $transaction no elimina carreras de negocio. Se leen saldos y se escriben valores absolutos, con verificaciones fuera de la transacción y sin bloqueo/versionado. Ventas/traslados/recepciones pueden perder actualizaciones. count()+1 genera consecutivos potencialmente iguales en solicitudes simultáneas; unique evita persistir duplicados, pero provoca fallos y no asigna números robustamente. Apertura no tiene restricción única de turno abierto; cierre y venta pueden intercalarse; dos anulaciones pueden pasar la validación inicial. Deben probarse específicamente en PostgreSQL.

### F12. Anulaciones no revierten todos los efectos — alta, lectura estática

La anulación reintegra inventario y marca venta ANULADA. No anula/revierte RoomCharge, no crea devolución o compensación PMS y no considera si el turno ya fue cerrado. Los reportes excluyen ANULADA, pero el cierre guardado permanece con el importe anterior. Debe definirse y probarse el tratamiento de devoluciones por cada medio y de ventas pertenecientes a cierres finalizados.

### F13. Recepciones y compras insuficientemente validadas — alta, lectura estática

Órdenes aceptan cantidades/precios sin validación positiva/finita. Recepción crea detalles antes de omitir cantidades <= 0, permite sobreentregas y aumenta stock de productos no presentes en la orden. Líneas repetidas buscan la primera coincidencia en una copia de detalles previa a la transacción; los acumulados pueden quedar mal. No hay aprobación real: cada orden nace APROBADA. Faltan solicitudes, producto/período como filtros y método de actualización del costo.

### F14. Estado de integración y conciliación incompletos — alta, lectura estática

La simulación es aceptable según el PDF. El problema es de diseño: POS confirma cargos por su cuenta; falta adaptador compartido. Reintentar actualiza el cargo a CONFIRMADO, pero deja la cola FALLIDO, sobrescribe la respuesta previa y permite reintentar cargos ya confirmados. La consulta de un UUID existente devuelve success true incluso si el estado es ERROR. La restricción UUID evita filas duplicadas, pero no compara payload ni maneja correctamente dos solicitudes simultáneas. «Conciliación» lista cargos y suma confirmados, sin calcular diferencias por venta/pago ni explicar cargos sin venta.

### F15. Auditoría incompleta y no atómica — alta, lectura estática

Se registran eventos después del commit y registrarAuditoria captura el error sin propagarlo. Puede existir una operación exitosa sin bitácora. Faltan logout, intentos fallidos de login y cambios administrativos aún no implementados. CREAR_VENTA no registra expresamente importe/motivo de descuento; editar producto sí conserva antes/después. No hay garantía de inmutabilidad por roles de base de datos, aunque la API no publica endpoints de modificación de auditoría. El seed crea stock inicial sin movimiento de apertura de Kardex y puede actualizar precios al reejecutarse sin auditoría.

### F16. Secretos y configuración — alta, lectura estática

.env no está versionado y .env.example sí, lo cual es correcto. Sin embargo, hay contraseña fija de PostgreSQL en compose, secreto JWT fallback en código y contraseñas iniciales conocidas en seed/manuales. El administrador inicial no es configurable por entorno y no se ofrece cambio de contraseña desde la aplicación. bcrypt protege el almacenamiento, no vuelve secretas las credenciales publicadas. No se imprime aquí ningún secreto local ni se examinó su valor efectivo. El riesgo del fallback aplica cuando falta JWT_SECRET.

### F17. Gestión de sesión y errores — media, lectura estática

JWT_EXPIRES_IN se define en configuración pero el login fija 8h. Logout solo limpia localStorage, sin auditoría/revocación; las respuestas 401/403 durante uso no fuerzan limpieza del estado React. Los fallos de autenticación del middleware incluyen también problemas de base de datos y pueden presentarse como token inválido. CORS es abierto; no hay limitación de intentos de login en el código. Debe ajustarse antes de exponer el sistema. errorHandler devuelve details y no normaliza errores de validación/restricciones Prisma a códigos de negocio.

### F18. Reportes, historial y exportaciones — media/alta, lectura estática

Los filtros de período solo funcionan cuando existen ambas fechas. new Date(fechaFin) representa el inicio del día indicado, no su final, y las fechas sin zona pueden no coincidir con el día operativo local. Ventas devuelve como máximo 100 registros, caja 50 y auditoría 200, sin paginación visible. CSV concatena cadenas sin escape correcto de comillas/saltos ni protección de celdas que una hoja interprete como fórmula. No hay exportación PDF de reportes ni archivo XLSX nativo, aunque CSV cumple una alternativa del documento. REP-003 y REP-006 carecen de reporte específico.

### F19. Interfaz y comprobantes — media, lectura estática

No hay pantallas de administración de usuarios, roles, productos, clientes, proveedores, bodegas, cajas, departamentos ni parámetros. POS no ofrece campo efectivo para observaciones ni referencias de pago pese a que existen en payload/estado; no hay venta suspendida. Cambiar pestaña desmonta el POS y pierde carrito. El comprobante usa datos fijos del hotel, omite cliente/descuento explícito y usa nombres actuales del catálogo; una reimpresión histórica puede cambiar si se renombra un producto. window.print imprime la página sin reglas específicas; falta probar resultado en papel/PDF y desbordamiento de modales.

### F20. Instalación, respaldo y documentación — alta para entrega, lectura estática

Los scripts de inicio dependen de rutas personales de PostgreSQL y anuncian éxito sin health checks completos. Docker solo incluye base de datos. El proxy /api existe en desarrollo Vite; no hay despliegue productivo completo de frontend/API/proxy documentado. Sí hay schema, seed y manual: NO se requiere obligatoriamente una carpeta migrations porque la lista permite scripts o migraciones; su ausencia es una mejora de reproducibilidad/versionado, no incumplimiento automático. Tener comandos pg_dump/pg_restore no demuestra restauración. README está vacío salvo título, aunque otros documentos sí explican el sistema. Swagger está instalado, pero no se monta ni se incluye especificación OpenAPI; documentación Markdown de endpoints sí existe.

### F21. Evidencia de pruebas sobredeclara resultados — alta para entrega

test-scenarios.ts crea directamente registros mediante Prisma, sin atravesar API ni middleware. La prueba de permiso consulta que un rol no tenga permiso, pero nunca intenta la llamada prohibida. La de respaldo cuenta usuarios/productos/bodegas: no genera dump ni restaura. La de idempotencia inserta un cargo y lo consulta: no envía dos solicitudes ni reproduce caída/reintento. Varios escenarios guardan Kardex sin actualizar Stock. Usa consecutivos fijos que pueden fallar al repetir, modifica el turno real y el resumen imprime «100%» como texto constante. No sirve como evidencia de los diez escenarios de aceptación del PDF y no se ejecutó para evitar contaminar la base configurada.

### F22. Entregables y reportes semanales incoherentes — media/alta

LISTA_VERIFICACION_ENTREGA e INFORME_PRIMER_AVANCE declaran totalidad del MVP/10 pruebas al 100 %, mientras reportes semanales señalan 10–50 %. Estos porcentajes no comparten metodología. Semana 3 menciona roles distintos a los del seed. Semana 4 menciona colecciones REST no encontradas en el inventario del repositorio y Semana 5 menciona estrés/concurrencia sin evidencias adjuntas verificables. El texto documentado no acredita ejecución. Deben conservarse como antecedentes y corregirse con resultados reales, sin inventar fechas, firmas ni reuniones.

## Lo que sí constituye una base aprovechable

React y Express están separados; existen nueve módulos API, pantallas operativas, autenticación real, Prisma y 34 modelos relacionales. Hay carrito, pago mixto, caja, movimientos, compras parciales, Kardex, comprobantes, simulación PMS, dashboard y auditoría. Las operaciones importantes usan transacciones en varios puntos. El sistema compila y tiene historial Git. La corrección debe reforzar esta base; la estimación baja frente al 100 % declarado no significa que deba rehacerse todo.

## Entregables académicos (sección 18; fuera de la fórmula de 106 requisitos)

| Entregable | Evaluación de evidencia |
|---|---|
| 01 Requerimientos aprobados | PDF y reportes presentes; alcance final firmado y control formal de cambios no autenticados en esta auditoría |
| 02 Diseño | Documentación, diagrama/diccionario en informe y esquema presentes; falta alinear decisiones con implementación real |
| 03 Prototipo validado | Pantallas desarrolladas; no se demostró validación previa con usuarios |
| 04 Código fuente | Repositorio Git y compilación presentes; defectos operativos pendientes |
| 05 Base de datos | Schema y seed presentes; restauración no demostrada y seed no configura todos los roles |
| 06 MVP | Núcleo amplio pero parcialmente completo; administración y controles críticos pendientes |
| 07 Pruebas | Script insuficiente para aceptación; esta auditoría aporta reproducciones de defectos, no aprobación integral |
| 08 Instalación | Manual existente; no se ensayó instalación/restauración en equipo limpio |
| 09 Manual de usuario | Presente; instrucciones y permisos no coinciden completamente con interfaz/seed |
| 10 Documentación técnica | Presente; afirmaciones de seguridad/idempotencia/100 % requieren corrección |
| 11 Presentación final | No se encontró presentación final en el inventario; demostración no realizada aquí |
| 12 Pendientes/fase 2 | Lista previa dice totalidad cumplida; la matriz de esta auditoría identifica faltantes verificables |

## Diez escenarios obligatorios: estado de la evidencia

| Escenario | Qué falta demostrar o corregir |
|---|---|
| Venta completa | Corregir filtros POS, ejecutar por API/UI y verificar venta, pago, stock, Kardex y comprobante |
| Pago mixto | Exactitud decimal, cierre y cargo PMS parcial correcto |
| Anulación controlada | HTTP prohibido sin permiso, autorizado con motivo, inventario y reversión PMS/cierre coherentes |
| Inventario | Entradas/salidas/traslados, límites, duplicados y concurrencia; saldo final igual a Kardex |
| Compra | Orden válida, recepción parcial, rechazo de exceso/producto ajeno y cantidades acumuladas correctas |
| Cierre | Usuario CAJERO real del seed, resumen y diferencia almacenada, rechazo de cambios posteriores |
| Seguridad | Matriz completa por rol y llamadas directas, no solo botones ocultos |
| Auditoría | Eventos producidos por operaciones reales, filtros válidos y fallos de persistencia controlados |
| Respaldo | Dump real, restauración en otra base y comparación de entidades, relaciones y saldos |
| PMS simulado | Error, reintento del mismo UUID, cola y cargo consistentes, cero duplicados y conciliación numérica |

## Orden sugerido para completar el trabajo

1. **Integridad y acceso:** filtros undefined, precio autorizado, stock y ajustes, montos/fechas/tipos, cargo PMS parcial, crédito restringido, permisos del seed y rutas.
2. **Concurrencia y reversión:** consecutivos robustos, control transaccional de stock/turnos/recepciones/anulaciones, compensaciones de caja/PMS, auditoría atómica y cola coherente.
3. **MVP administrable:** usuarios/roles, catálogos y parámetros desde UI/API; mínimo de inventario, entradas/salidas, notas/referencias, historial completo e impresión.
4. **Aceptación demostrable:** diez escenarios sobre base de prueba aislada, pruebas negativas y concurrentes, dos navegadores, respaldo/restauración y evidencias guardadas.
5. **Entrega:** corregir manuales/checklist/porcentajes, configuración portable, instalación limpia, presentación y alcance pendiente firmado/confirmado.
6. **Alcance posterior acordado:** recetas, producción, mesas, crédito completo y facturación electrónica. No posponer la interfaz desacoplada de integraciones si está incluida en el MVP aprobado.

No se estima calendario ni horas restantes porque faltan disponibilidad de trabajo, alcance aprobado y pruebas de aceptación. Corregir un defecto transversal puede elevar varios requisitos simultáneamente; el porcentaje restante no equivale al mismo porcentaje de tiempo.

## Evidencias técnicas y reproducción

El script `tmp/auditoria/repro.cjs` transpila los controladores originales en memoria con TypeScript e inyecta persistencia controlada. No llama al servidor ni a PostgreSQL. Ejecutarlo desde la raíz con Node: `node tmp/auditoria/repro.cjs`. Escribe `tmp/auditoria/resultados.json`. Sus ocho valores defectReproduced=true significan ocho defectos confirmados en el ensayo, no ocho criterios de aceptación superados. Las pruebas no cubren restricciones reales, aislamiento de PostgreSQL, middleware completo ni renderizado del navegador.

Los escenarios de concurrencia, anulaciones históricas, compras y permisos restantes se identificaron leyendo el código; se deben convertir en pruebas de integración antes de cerrar los hallazgos. No se modificó implementación para obtener los resultados.

## Matriz completa de requisitos

Cada porcentaje es avance técnico estimado, no una afirmación de aceptación. Los títulos resumen el requisito; el texto vinculante y su criterio de aceptación permanecen en el PDF original.

### GEN — Generales y catálogos

Fuente principal de implementación: [backend/src/modules/catalogos/catalogos.controller.ts](<C:/Users/chris/OneDrive/Escritorio/Proyecto/backend/src/modules/catalogos/catalogos.controller.ts>). Revisar también interfaz, rutas, modelo y hallazgos transversales.

| ID | Prioridad | Avance | Requisito resumido | Evidencia / pendiente |
|---|---|---:|---|---|
| GEN-001 | Alta | 100 % | Autenticación | Login con Zod, bcrypt, usuario activo y JWT; controlador y pantalla presentes. |
| GEN-002 | Alta | 0 % | Administrar usuarios | Modelo y seed presentes, pero faltan endpoints y pantalla de creación, edición e inactivación. |
| GEN-003 | Alta | 50 % | Roles y permisos | Middleware real, sin administración; seed asigna permisos solo a administrador, cajero y bodega; cajero no puede cerrar caja. |
| GEN-004 | Alta | 25 % | Puntos de venta, cajas, bodegas y departamentos | Asociaciones y consultas presentes; configuración depende del seed; departamento es texto sin catálogo administrable. |
| GEN-005 | Alta | 50 % | Productos y servicios | API crea, actualiza e inactiva; no hay pantalla de mantenimiento y faltan validaciones numéricas completas. |
| GEN-006 | Media | 75 % | Búsqueda de catálogo | Backend busca por código, nombre y barras; filtros undefined del POS impiden el funcionamiento habitual. |
| GEN-007 | Alta | 25 % | Clientes y proveedores | API crea y consulta; faltan edición, inactivación y pantallas de mantenimiento. |
| GEN-008 | Alta | 50 % | Autor y fechas de cambios | Operaciones y auditoría guardan autor/fecha; cobertura incompleta y auditoría puede fallar sin impedir la operación. |
| GEN-009 | Media | 50 % | Exportaciones | CSV en tres reportes; faltan escape robusto, filtros fiables y exportación general; no existe generador PDF de reportes. |
| GEN-010 | Alta | 75 % | Preservación de historial | No hay rutas DELETE y productos admiten inactivación; faltan flujos de inactivación para otros catálogos. |

### POS — POS y ventas

Fuente principal de implementación: [backend/src/modules/ventas/ventas.controller.ts](<C:/Users/chris/OneDrive/Escritorio/Proyecto/backend/src/modules/ventas/ventas.controller.ts>). Revisar también interfaz, rutas, modelo y hallazgos transversales.

| ID | Prioridad | Avance | Requisito resumido | Evidencia / pendiente |
|---|---|---:|---|---|
| POS-001 | Alta | 75 % | Registrar venta | API y pantalla con consecutivo, detalles, pagos y usuario; fallos de filtros, validación y concurrencia pendientes. |
| POS-002 | Alta | 50 % | Agregar productos | Carrito y accesos por tarjetas presentes; filtros undefined bloquean la carga normal del catálogo POS. |
| POS-003 | Alta | 75 % | Modificar cantidades | Recalcula cantidades y totales; no revalida que un descuento previo siga siendo válido al bajar cantidad. |
| POS-004 | Alta | 25 % | Descuentos autorizados | Valida descuento explícito, pero acepta precioUnitario reducido sin permiso; interfaz solo por monto y sin límites suficientes. |
| POS-005 | Media | 25 % | Observaciones | Backend y esquema aceptan notas de línea/venta; estado notasVenta sin campo editable y sin visualización en comprobante. |
| POS-006 | Media | 0 % | Suspender y retomar venta | Estado SUSPENDIDA comentado en modelo; no hay endpoints ni persistencia del carrito para este flujo. |
| POS-007 | Alta | 50 % | Anulación autorizada | Permiso, motivo y reintegro presentes; no revierte PMS ni resuelve ventas de turnos cerrados; carrera de doble anulación. |
| POS-008 | Media | 75 % | Reimpresión | Historial abre comprobante existente; usa window.print sin diseño específico de impresión. |
| POS-009 | Alta | 50 % | Formas de pago | Cinco formas disponibles; crédito no autorizado se acepta y pagos mixtos PMS sobrecargan habitación. |
| POS-010 | Alta | 50 % | Pago mixto | Desglose presente; acepta diferencia de hasta 0.05 y el cargo PMS usa el total completo. |
| POS-011 | Media | 0 % | Mesas y cuentas abiertas | Sin modelos ni flujos de mesas; condicional a necesidades del hotel. |
| POS-012 | Baja | 0 % | Dividir y trasladar cuentas | Ausente; condicional a operación de mesas. |

### CAJ — Caja y cierres

Fuente principal de implementación: [backend/src/modules/caja/caja.controller.ts](<C:/Users/chris/OneDrive/Escritorio/Proyecto/backend/src/modules/caja/caja.controller.ts>). Revisar también interfaz, rutas, modelo y hallazgos transversales.

| ID | Prioridad | Avance | Requisito resumido | Evidencia / pendiente |
|---|---|---:|---|---|
| CAJ-001 | Alta | 75 % | Apertura de caja | Pantalla/API y asociación al usuario; backend no valida monto no negativo ni apertura concurrente. |
| CAJ-002 | Alta | 75 % | Bloqueo con caja cerrada | Se verifica turno abierto; verificación fuera de transacción permite carrera con cierre. |
| CAJ-003 | Alta | 75 % | Movimientos extraordinarios | Entrada/salida, motivo y auditoría; backend acepta tipos y montos inválidos y no verifica titularidad. |
| CAJ-004 | Alta | 50 % | Cierre por turno | Calcula resumen; cajero del seed carece de CAJA:EDITAR; cierre concurrente y autor real requieren revisión. |
| CAJ-005 | Alta | 75 % | Arqueo automático | Calcula y almacena diferencia; validación de montos y redondeos incompleta. |
| CAJ-006 | Alta | 75 % | Proteger cierres | Rechaza cierre ya cerrado; anular ventas posteriormente altera reportes sin compensar el cierre guardado. |
| CAJ-007 | Alta | 75 % | Desglose del cierre | Resumen por cinco medios disponible al cerrar y en auditoría; histórico no permite recuperar ese mismo resumen fácilmente. |
| CAJ-008 | Alta | 50 % | Histórico de cajas | Consulta por caja limitada a 50 registros; falta filtro por fecha y paginación. |

### INV — Inventarios y bodegas

Fuente principal de implementación: [backend/src/modules/inventario/inventario.controller.ts](<C:/Users/chris/OneDrive/Escritorio/Proyecto/backend/src/modules/inventario/inventario.controller.ts>). Revisar también interfaz, rutas, modelo y hallazgos transversales.

| ID | Prioridad | Avance | Requisito resumido | Evidencia / pendiente |
|---|---|---:|---|---|
| INV-001 | Alta | 25 % | Administrar bodegas | Multibodega en esquema y operaciones; solo consulta, sin mantenimiento del catálogo. |
| INV-002 | Alta | 75 % | Existencias | Consulta por bodega y producto presente; exactitud condicionada a defectos de movimientos y concurrencia. |
| INV-003 | Alta | 50 % | Entradas | API manual y compras generan Kardex; no existe formulario específico de entrada manual en la interfaz. |
| INV-004 | Alta | 50 % | Salidas con motivo | API manual con motivo y usuario; no existe formulario específico y validación/concurrencia incompletas. |
| INV-005 | Alta | 50 % | Traslados | Documento y movimientos en ambas bodegas; backend no valida cantidades positivas ni acumulación de líneas repetidas. |
| INV-006 | Alta | 25 % | Ajustes autorizados | Formulario y permiso presentes; Math.max recorta saldos sin rechazar exceso y ruta manual admite ajustes con permiso CREAR. |
| INV-007 | Media | 0 % | Inventario físico | No hay captura de conteo, comparación ni aplicación de diferencias. |
| INV-008 | Alta | 75 % | Kardex | Consulta, fecha, documento, signo y saldos; ajustes pueden producir movimientos matemáticamente inconsistentes. |
| INV-009 | Media | 25 % | Mínimos y alertas | Campos y alertas presentes; falta configurar mínimos mediante aplicación. |
| INV-010 | Alta | 25 % | Evitar negativos | Chequeos iniciales insuficientes; líneas repetidas de venta producen stock negativo; ajustes excesivos se recortan. |
| INV-011 | Media | 25 % | Método de costos | Costos almacenados en producto/recepción/movimiento; compras no recalculan costo del producto ni hay método formal implementado. |
| INV-012 | Media | 0 % | Unidades y conversiones | No hay modelo/campo de unidad ni conversiones; aplicabilidad debe acordarse. |

### REC — Recetas, producción y mermas

Fuente principal de implementación: [backend/src/modules/inventario/inventario.controller.ts](<C:/Users/chris/OneDrive/Escritorio/Proyecto/backend/src/modules/inventario/inventario.controller.ts>). Revisar también interfaz, rutas, modelo y hallazgos transversales.

| ID | Prioridad | Avance | Requisito resumido | Evidencia / pendiente |
|---|---|---:|---|---|
| REC-001 | Media | 0 % | Recetas | No hay entidades, API ni interfaz de recetas. |
| REC-002 | Media | 0 % | Consumo de ingredientes | Ventas descuentan el producto final, no ingredientes. |
| REC-003 | Baja | 0 % | Subrecetas | Sin implementación. |
| REC-004 | Baja | 0 % | Producción interna | Sin órdenes de producción ni transformación de insumos. |
| REC-005 | Media | 50 % | Mermas | API de movimiento admite MERMA con motivo; falta interfaz y robustez de movimientos. |
| REC-006 | Media | 0 % | Costo y margen de receta | Sin recetas ni cálculo específico. |

### COM — Compras y proveedores

Fuente principal de implementación: [backend/src/modules/compras/compras.controller.ts](<C:/Users/chris/OneDrive/Escritorio/Proyecto/backend/src/modules/compras/compras.controller.ts>). Revisar también interfaz, rutas, modelo y hallazgos transversales.

| ID | Prioridad | Avance | Requisito resumido | Evidencia / pendiente |
|---|---|---:|---|---|
| COM-001 | Alta | 25 % | Proveedores | Creación/consulta API; sin mantenimiento completo ni pantalla. |
| COM-002 | Media | 0 % | Solicitudes de compra | No hay entidad ni flujo de solicitud interna. |
| COM-003 | Media | 0 % | Aprobación de compras | Todas las órdenes nacen APROBADA; no hay transición autorizada ni revisión. |
| COM-004 | Alta | 75 % | Órdenes de compra | Pantalla/API/detalle/totales presentes; backend no valida cantidades/precios positivos ni consecutivos concurrentes. |
| COM-005 | Alta | 50 % | Recepción parcial y total | Actualiza stock/Kardex; permite productos ajenos, sobreentregas y detalles negativos sin rechazo explícito. |
| COM-006 | Alta | 50 % | Comparar solicitado y recibido | Modal muestra solicitado y recibido; no bloquea exceso ni consolida correctamente líneas duplicadas. |
| COM-007 | Alta | 75 % | Factura del proveedor | Campo almacenado y formulario; puede omitirse, falta garantía de trazabilidad documental exigida. |
| COM-008 | Media | 25 % | Histórico de compras | API filtra proveedor/estado; faltan producto/período y filtros de interfaz. |
| COM-009 | Media | 50 % | Condiciones del proveedor | Días de crédito en esquema/API; faltan mantenimiento y condiciones de pago completas. |

### CLI — Clientes y crédito

Fuente principal de implementación: [backend/src/modules/catalogos/catalogos.controller.ts](<C:/Users/chris/OneDrive/Escritorio/Proyecto/backend/src/modules/catalogos/catalogos.controller.ts>). Revisar también interfaz, rutas, modelo y hallazgos transversales.

| ID | Prioridad | Avance | Requisito resumido | Evidencia / pendiente |
|---|---|---:|---|---|
| CLI-001 | Alta | 50 % | Clientes y empresas | Creación API, tipos de identificación y selección POS; falta pantalla para registrar clientes. |
| CLI-002 | Alta | 25 % | Identificación y contacto | Creación y almacenamiento presentes; no permite actualización vía API/interfaz. |
| CLI-003 | Media | 0 % | Crédito autorizado | Controlador de ventas no consulta creditoActivo; admite crédito incluso sin cliente. |
| CLI-004 | Media | 25 % | Límite de crédito | Campos en catálogo; no calcula deuda ni valida límite al vender. |
| CLI-005 | Media | 0 % | Abonos y saldos | No hay cuentas por cobrar, abonos ni saldo pendiente; pago mixto no equivale a crédito con abonos. |
| CLI-006 | Baja | 0 % | Estado de cuenta | Sin vencimientos, antigüedad ni reporte de deuda. |

### PMS — Integración hotelera

Fuente principal de implementación: [backend/src/modules/pms/pms.controller.ts](<C:/Users/chris/OneDrive/Escritorio/Proyecto/backend/src/modules/pms/pms.controller.ts>). Revisar también interfaz, rutas, modelo y hallazgos transversales.

| ID | Prioridad | Avance | Requisito resumido | Evidencia / pendiente |
|---|---|---:|---|---|
| PMS-001 | Alta | 25 % | Capa independiente | Módulo PMS separado, pero ventas crea/confirma cargos directamente; falta adaptador compartido sustituible. |
| PMS-002 | Media | 75 % | Habitaciones y huéspedes | Consulta local de ocupadas y huésped hospedado; simulación permitida por PDF. |
| PMS-003 | Media | 25 % | Validar cargo | Ventas verifica ocupación, no correspondencia huésped/habitación; endpoint PMS directo no comprueba validez operativa ni monto positivo. |
| PMS-004 | Media | 50 % | Enviar cargo | Cargo simulado persistido; pago mixto usa total completo y cargo directo no conserva punto de venta. |
| PMS-005 | Alta | 50 % | Idempotencia | UUID único y búsqueda previa; carrera simultánea termina en conflicto no tratado y reintento no compara payload. |
| PMS-006 | Alta | 50 % | Estados e intentos | Cargo y cola registran error; reintento confirma cargo sin actualizar cola ni conservar historial completo de respuestas. |
| PMS-007 | Media | 50 % | Reintentar | Actualiza mismo cargo; siempre simula éxito, permite reiterar confirmado y deja cola fallida. |
| PMS-008 | Media | 25 % | Conciliación | Lista cargos/estados y sumas; no calcula diferencias contra pagos POS ni resuelve anulaciones. |

### FAC — Documentos comerciales

Fuente principal de implementación: [frontend/src/pages/POS.tsx](<C:/Users/chris/OneDrive/Escritorio/Proyecto/frontend/src/pages/POS.tsx>). Revisar también interfaz, rutas, modelo y hallazgos transversales.

| ID | Prioridad | Avance | Requisito resumido | Evidencia / pendiente |
|---|---|---:|---|---|
| FAC-001 | Alta | 75 % | Comprobante interno | Modal consultable/imprimible; impresión no aislada y datos del hotel fijos. |
| FAC-002 | Alta | 75 % | Datos comerciales | Venta conserva detalle/importes/cliente; comprobante omite cliente y descuento explícito, nombres se leen del catálogo actual. |
| FAC-003 | Media | 0 % | Interfaz electrónica | No hay adaptador, contrato o generador de documento electrónico independiente; integración productiva queda fuera del MVP. |
| FAC-004 | Media | 0 % | Estado electrónico | No hay modelo/flujo de documento electrónico; condicional a integración. |
| FAC-005 | Media | 50 % | Reversión autorizada | Anulación interna vinculada y auditada; no hay nota de crédito ni reversión del cargo PMS. |
| FAC-006 | Media | 75 % | Regeneración de copia | Historial reabre mismo comprobante; no duplica venta; faltan formato de impresión y envío. |

### REP — Reportes y paneles

Fuente principal de implementación: [backend/src/modules/reportes/reportes.controller.ts](<C:/Users/chris/OneDrive/Escritorio/Proyecto/backend/src/modules/reportes/reportes.controller.ts>). Revisar también interfaz, rutas, modelo y hallazgos transversales.

| ID | Prioridad | Avance | Requisito resumido | Evidencia / pendiente |
|---|---|---:|---|---|
| REP-001 | Alta | 50 % | Ventas filtradas | API filtra fecha/POS/usuario, no producto; interfaz solo fechas; undefined y fecha final afectan resultados. |
| REP-002 | Alta | 50 % | Medios de pago | Agrupa pagos completados; filtros de fecha defectuosos y anulaciones posteriores al cierre rompen conciliación histórica. |
| REP-003 | Media | 0 % | Más vendidos | Sin agrupación/ranking por producto. |
| REP-004 | Alta | 75 % | Existencias por bodega | Reporte operativo presente; depende de exactitud del stock, no tiene exportación dedicada. |
| REP-005 | Alta | 75 % | Movimientos por producto | Kardex visible y secuencial por fecha; errores de ajustes afectan consistencia. |
| REP-006 | Media | 0 % | Compras por proveedor/período | No hay reporte de documentos recibidos por período; listado de órdenes no cubre criterio. |
| REP-007 | Alta | 75 % | Diferencias de caja | Reporte y CSV presentes; responsable refleja usuario de apertura, puede diferir de quien cierra. |
| REP-008 | Media | 75 % | Indicadores del día | Ventas/transacciones/ticket/alertas; no hay pruebas de rendimiento ni coherencia de zona horaria en despliegue. |
| REP-009 | Media | 50 % | Exportación fiel | CSV desde datos cargados; no escapa comillas ni preserva exactamente todas las columnas visibles; filtros defectuosos. |

### SEG — Seguridad y auditoría

Fuente principal de implementación: [backend/src/middleware/auth.middleware.ts](<C:/Users/chris/OneDrive/Escritorio/Proyecto/backend/src/middleware/auth.middleware.ts>). Revisar también interfaz, rutas, modelo y hallazgos transversales.

| ID | Prioridad | Avance | Requisito resumido | Evidencia / pendiente |
|---|---|---:|---|---|
| SEG-001 | Alta | 100 % | Hash de contraseñas | bcrypt en seed y comparación en login; valor persistido es hash, aunque credenciales iniciales están publicadas. |
| SEG-002 | Alta | 25 % | Autorización backend | Middleware existente; PMS sin permiso granular, ajustes alternos y precios permiten eludir restricciones, seed incompleto. |
| SEG-003 | Alta | 50 % | Bitácora | Registra login exitoso y acciones; faltan logout, fallos de login y cambios administrativos; filtros undefined ocultan registros. |
| SEG-004 | Alta | 50 % | Auditar sensibles | Anulación/ajuste/precio/cierre presentes; descuento no tiene evento/detalle suficiente y audit falla silenciosamente. |
| SEG-005 | Media | 75 % | Cierre y expiración de sesión | Token expira a 8h y logout limpia almacenamiento; no registra logout ni fuerza salida visual inmediata tras 401/403. |
| SEG-006 | Alta | 25 % | Validación de entradas | Prisma evita concatenación SQL, Zod en login; números/tipos/referencias sin validación suficiente en operaciones. |
| SEG-007 | Alta | 25 % | Secretos externos | .env ignorado y ejemplo versionado; secreto fallback, contraseñas seed/compose/manual públicas. |
| SEG-008 | Alta | 25 % | Backup y restauración | Comandos documentados; no hay evidencia de dump restaurado ni prueba real en escenario 9. |
| SEG-009 | Alta | 100 % | Integridad referencial | Prisma define PK/FK/unique y esquema valida; no equivale a verificar toda regla de negocio. |
| SEG-010 | Media | 50 % | Errores seguros | Middleware central registra stack y oculta mensaje 500 en producción; otros mensajes/details pueden filtrar datos internos. |

### RNF — No funcionales

Fuente principal de implementación: [backend/src/server.ts](<C:/Users/chris/OneDrive/Escritorio/Proyecto/backend/src/server.ts>). Revisar también interfaz, rutas, modelo y hallazgos transversales.

| ID | Prioridad | Avance | Requisito resumido | Evidencia / pendiente |
|---|---|---:|---|---|
| RNF-001 | Alta | 25 % | Dos navegadores | Stack web compatible en principio; sin evidencia reproducible de flujos críticos en dos navegadores. |
| RNF-002 | Alta | 25 % | Rendimiento local | Sin mediciones; consultas sin paginación y cálculos en memoria impiden darlo por demostrado. |
| RNF-003 | Alta | 50 % | Usabilidad escritorio | Tailwind responsive y pantallas presentes; sin validación visual funcional, modales largos/impresión pendientes. |
| RNF-004 | Alta | 75 % | Claves, índices y restricciones | 34 modelos, PK/FK/unique y Decimal; sin índices adicionales para fecha/FK ni restricciones de saldos/turnos abiertos. |
| RNF-005 | Alta | 75 % | Separación de responsabilidades | Frontend/backend/módulos separados; lógica y Prisma conviven en controladores e integración incrustada en ventas. |
| RNF-006 | Alta | 100 % | Git | Repositorio real con 7 commits; HEAD 36e6381 en auditoría y árbol limpio antes de generar evidencias. |
| RNF-007 | Media | 75 % | Errores y logs centralizados | Middleware Express y console; sin correlación/rotación persistente y algunas fallas no llegan al usuario. |
| RNF-008 | Alta | 50 % | Configuración externa | dotenv y DATABASE_URL; puertos/proxy, JWT expiración, datos hotel y rutas de arranque fijos. |
| RNF-009 | Alta | 50 % | Despliegue documentado | Manual, schema y seed; arranque específico de Windows, sin instalación limpia/restauración demostradas ni configuración productiva de proxy. |
| RNF-010 | Media | 75 % | Mantenibilidad | Módulos y TypeScript compilables; contratos any, controladores extensos y ausencia de capa de integración compartida limitan extensión. |
