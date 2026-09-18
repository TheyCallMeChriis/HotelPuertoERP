// Crea exclusivamente la base temporal en el puerto reservado para estas pruebas.
const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: 'postgresql://codex_test@127.0.0.1:55439/postgres' } } });
(async () => {
  const existing = await prisma.$queryRaw`SELECT 1 FROM pg_database WHERE datname = 'pos_erp_tanda2_test'`;
  if (!existing.length) await prisma.$executeRawUnsafe('CREATE DATABASE pos_erp_tanda2_test');
  console.log('Base temporal pos_erp_tanda2_test disponible.');
})().catch(error => { console.error(error.code || error.name); process.exitCode = 1; }).finally(() => prisma.$disconnect());
