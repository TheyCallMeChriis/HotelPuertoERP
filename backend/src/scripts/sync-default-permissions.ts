import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
import { prisma } from '../utils/prisma';
import { ensureDefaultPermissions } from '../utils/default-permissions';

ensureDefaultPermissions(prisma)
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
