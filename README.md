# HotelPuertoERP

Proyecto académico de POS y ERP hotelero. Incluye ventas y pagos mixtos, caja, inventario/Kardex, compras, catálogos, roles, reportes y un simulador local de cargos a habitación.

**El PMS no está conectado a un sistema hotelero externo.** La existencia de pantallas y tablas no demuestra cumplimiento completo de los requerimientos. El diagnóstico inicial está en [docs/auditoria](docs/auditoria/) y las correcciones verificadas en [tests/README.md](tests/README.md).

## Estructura

| Carpeta | Contenido |
| --- | --- |
| `backend/src` | API Express, autenticación JWT, permisos y operaciones |
| `backend/prisma` | Esquema PostgreSQL, migraciones y datos de demostración |
| `frontend/src` | Interfaz React/Vite |
| `tests` | Pruebas específicas y procedimiento de PostgreSQL temporal |
| `docs`, `Documentacion` | Análisis y documentación académica existente |
| `tmp` | Archivos temporales y logs locales, excluidos de Git |

## Preparar una instalación nueva

Requiere Node.js con npm, PostgreSQL 16 y, solo si se elige esa opción, Docker Compose. Ejecutar desde la raíz:

```powershell
npm --prefix backend ci
npm --prefix frontend ci
Copy-Item backend/.env.example backend/.env
```

No sobrescribir un `.env` existente. Configurar `DATABASE_URL` con la base que se desea utilizar y `JWT_SECRET` con un secreto aleatorio propio. Puede generarse con:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Guardar el resultado únicamente en `backend/.env`. Si la contraseña de PostgreSQL contiene caracteres especiales, codificarla para su uso dentro de `DATABASE_URL`. El backend rechaza un secreto ausente o de ejemplo y valida puerto y duración de sesión (`JWT_EXPIRES_IN`, por ejemplo `8h`). Los secretos no se incluyen en Git.

Para PostgreSQL con Docker, copiar también `.env.example` de la raíz a `.env`, definir `POSTGRES_PASSWORD` y mantener esas credenciales coherentes con `backend/.env`. El puerto de Docker solo se publica en la máquina local.

```powershell
docker compose up -d postgres
```

Cambiar la variable de Docker **no cambia la contraseña de una base ya existente en el volumen**. No eliminar el volumen para cambiar credenciales; conservar los datos y realizar la rotación por separado.

Con una base **nueva y vacía**, instalar las migraciones:

```powershell
npm --prefix backend run prisma:generate
npm --prefix backend run prisma:deploy
```

Para una base existente creada con `db push`, seguir primero [la adopción de migraciones](docs/operacion/MIGRACIONES.md). No ejecutar la migración inicial sobre tablas existentes ni reiniciar esa base.

El seed carga datos de demostración y se ejecuta explícitamente, nunca al iniciar los servidores. Requiere `SEED_ADMIN_PASSWORD` y `SEED_OPERATOR_PASSWORD` diferentes y de al menos 12 caracteres en `backend/.env`. No cambia las contraseñas de usuarios que ya existan.

```powershell
npm --prefix backend run prisma:seed
```

Para completar permisos en una base ya instalada sin volver a sembrar datos:

```powershell
npm --prefix backend run permissions:sync
```

## Iniciar en Windows

Con PostgreSQL ya disponible:

```powershell
./start_servers.ps1 -CheckOnly
./start_servers.ps1
```

También puede usarse `start_servers.bat`. Ambos parten de la carpeta del proyecto, independientemente de la carpeta desde la que se ejecuten. Los servidores se inician en segundo plano y sus logs están en `tmp/server-logs`. El script comprueba la API y el puerto del frontend antes de anunciar el inicio; esa comprobación no valida operaciones de la base de datos.

Para que el script inicie la base:

```powershell
./start_servers.ps1 -Database Docker
# Instalación local propia: sustituir ambas rutas por las de esa instalación.
./start_servers.ps1 -Database Local -PgCtl 'C:/PostgreSQL/bin/pg_ctl.exe' -PgData 'C:/PostgreSQL/data'
```

La opción local también acepta las variables `PG_CTL` y `PGDATA`. No inicializa ni modifica una carpeta de datos existente. El modo predeterminado `External` no intenta iniciar PostgreSQL.

Alternativamente, abrir dos terminales:

```powershell
npm run dev:backend
npm run dev:frontend
```

Frontend: `http://localhost:3000`. API predeterminada: `http://localhost:4000/api/health`. El lanzador configura automáticamente el proxy para el `PORT` del backend; al iniciar el frontend manualmente con un puerto de API diferente, definir `VITE_API_TARGET`.

## Validación y límites actuales

Consultar [las pruebas y correcciones por tanda](tests/README.md). Las pruebas PostgreSQL usan un destino temporal protegido; no deben apuntar a la base del hotel. Las pruebas generales desde el navegador se realizarán al finalizar las correcciones.

- El crédito exige un cliente activo con crédito autorizado, límite y plazo; dos ventas simultáneas no pueden exceder el cupo. Autorizar condiciones de crédito requiere `CLIENTES:EDITAR` o administrador.
- Todavía no hay cobranzas/cuentas por cobrar: se acumulan los importes `CREDITO` de ventas completadas. Las anulaciones liberan cupo; no se presume que una deuda haya sido cobrada.
- La anulación reintegra existencias y revierte el cargo del simulador. Las ventas de turnos cerrados requieren un futuro flujo de devolución y actualmente no se anulan.
- Las nuevas configuraciones eliminan credenciales predeterminadas para instalaciones futuras. Los secretos presentes en versiones antiguas y las contraseñas de usuarios ya creados no se rotan automáticamente.
- En la instalación local revisada el 18 de septiembre de 2026 se sustituyeron las cinco contraseñas de demostración, se renovó JWT y PostgreSQL pasó de trust a scram-sha-256. Las claves de recuperación están fuera del repositorio, en `%LOCALAPPDATA%/HotelPuertoERP/recovery`, con acceso restringido al usuario de Windows. Reiniciar la API para cargar el secreto nuevo e iniciar sesión con las claves actualizadas.
- Los permisos iniciales y el historial de migraciones ya se aplicaron a esa instalación local, tras verificar el respaldo. Esto no implica que se hayan aplicado en otras instalaciones.
- Las bitácoras e informes semanales se mantienen separados de estas correcciones y están pendientes de revisión final.
