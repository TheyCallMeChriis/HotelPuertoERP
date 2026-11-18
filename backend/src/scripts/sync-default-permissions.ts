// npm run permissions:sync — adds missing permissions to the catalog and grants the default ones,
// without loading demo data. iniciar.bat runs it on every start.

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
import { prisma } from '../utils/prisma';
import { ensureDefaultPermissions, ensurePermissionCatalog } from '../utils/default-permissions';

ensurePermissionCatalog(prisma)
  .then((nuevos) => {
    if (nuevos > 0) console.log(`Permisos nuevos registrados en el catálogo: ${nuevos}.`);
    return ensureDefaultPermissions(prisma);
  })
  .then((count) => console.log(`Permisos iniciales sincronizados: ${count} asignaciones verificadas.`))
  .catch((error: unknown) => {
    console.error('No se pudieron sincronizar los permisos. Verifique la conexión y que los roles y permisos iniciales estén instalados.');
    if (error instanceof Error && /^Falta (el rol|el permiso) inicial /.test(error.message)) {
      console.error(error.message);
    } else if (error && typeof error === 'object') {
      const failure = error as { code?: unknown; errorCode?: unknown };
      const code = failure.code ?? failure.errorCode;
      if (typeof code === 'string' && /^P\d{4}$/.test(code)) console.error(`Código Prisma: ${code}`);
    }
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
