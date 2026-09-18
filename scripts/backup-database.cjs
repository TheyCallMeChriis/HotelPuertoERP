// Respaldo lógico sin colocar credenciales en los argumentos del proceso.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
require('../backend/node_modules/dotenv').config({ path: path.join(root, 'backend/.env'), quiet: true });
const { PrismaClient } = require('../backend/node_modules/@prisma/client');

async function main() {
  const pgBin = process.argv[2];
  if (!pgBin || !fs.existsSync(path.join(pgBin, 'pg_dump.exe'))) throw Error('Indique la carpeta bin de PostgreSQL');
  const url = new URL(process.env.DATABASE_URL);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw Error('Este procedimiento se limita a PostgreSQL local');
  const destination = path.join(root, 'tmp/backups', new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(destination, { recursive: true });
  const backup = path.join(destination, 'database.dump');
  const env = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: decodeURIComponent(url.pathname.slice(1)) };
  const p = new PrismaClient();
  try {
    const tables = await p.$queryRawUnsafe("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name");
    const counts = {};
    for (const { table_name: table } of tables) {
      const rows = await p.$queryRawUnsafe('SELECT COUNT(*)::text AS count FROM "' + table.replaceAll('"', '""') + '"');
      counts[table] = rows[0].count;
    }
    const result = spawnSync(path.join(pgBin, 'pg_dump.exe'), ['--format=custom', '--no-password', '--file', backup], { env, windowsHide: true, encoding: 'utf8' });
    if (result.status !== 0) throw Error('pg_dump no pudo completar el respaldo; no aplicar cambios');
    const listing = spawnSync(path.join(pgBin, 'pg_restore.exe'), ['--list', backup], { windowsHide: true, encoding: 'utf8' });
    if (listing.status !== 0 || fs.statSync(backup).size === 0) throw Error('El archivo de respaldo no es legible');
    fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify({ createdAt: new Date().toISOString(), database: env.PGDATABASE,
      sha256: crypto.createHash('sha256').update(fs.readFileSync(backup)).digest('hex'), counts }, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ backup, manifest: path.join(destination, 'manifest.json'), tables: tables.length }));
  } finally { await p.$disconnect(); }
}
main().catch(e => { console.error(e.code || e.message); process.exitCode = 1; });
