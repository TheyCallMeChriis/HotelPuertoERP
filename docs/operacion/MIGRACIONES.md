# Migraciones de PostgreSQL

La migración `20260918000000_initial` representa el esquema Prisma existente al 18 de septiembre de 2026. No agrega un módulo de negocio. Las siguientes modificaciones del esquema deben generar migraciones nuevas; no editar una migración que ya se haya aplicado.

## Instalación nueva

Configurar `backend/.env` para una base vacía y ejecutar desde `backend`:

```powershell
npm run prisma:deploy
npm run prisma:status
npm run prisma:generate
```

## Base existente creada con db push

En la instalación local del proyecto, el historial se adoptó el 18 de septiembre de 2026: se verificó un respaldo mediante restauración en otra instancia, se confirmó que el esquema coincidía y se registró `20260918000000_initial` como aplicada. No se ejecutó el SQL de creación sobre las tablas existentes.

El procedimiento siguiente queda para otras bases existentes creadas con db push. La migración inicial no debe ejecutarse sobre sus tablas existentes.

Antes de adoptar el historial, disponer de un respaldo comprobado y confirmar que `DATABASE_URL` corresponde a la base prevista. Desde `backend`, comparar el esquema real en modo de lectura:

```powershell
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code
```

Código 0 indica que Prisma no detecta diferencias estructurales; código 2 indica diferencias y código 1 un error. Si hay diferencias o errores, revisar su causa y detener este procedimiento. Esta comparación no valida saldos ni otros datos de negocio, y no cubre objetos externos que Prisma no modele.

Solo cuando la comparación sea satisfactoria y se haya comprobado el respaldo, registrar la migración inicial como ya presente:

```powershell
npx prisma migrate resolve --applied 20260918000000_initial
npm run prisma:status
```

`resolve` registra el historial; no crea las tablas de la migración. No ejecutar `migrate reset`, borrar volúmenes o usar `db push --accept-data-loss` para resolver diferencias en una base con datos.

## Cambios futuros

En una base de desarrollo separada:

```powershell
npx prisma migrate dev --name descripcion_del_cambio
```

Revisar el SQL generado, verificarlo con datos de prueba y versionar la carpeta. Aplicar migraciones revisadas con `npm run prisma:deploy` en el destino correspondiente, tras el respaldo necesario. Mantener `db push` solo para prototipos descartables; no usarlo como sustituto del historial versionado.
