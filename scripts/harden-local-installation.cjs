// Explicit operation for the local PostgreSQL installation. Never prints passwords.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const dotenv = require('../backend/node_modules/dotenv');
const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const bcrypt = require('../backend/node_modules/bcryptjs');

// Creates a directory readable only by the current user
function privateDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const identity = spawnSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true });
  const sid = identity.stdout?.match(/S-1-\d+(?:-\d+)+/)?.[0];
  if (identity.status !== 0 || !sid) throw Error('No se pudo identificar al usuario de Windows');
  const acl = spawnSync('icacls.exe', [directory, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`], { encoding: 'utf8', windowsHide: true });
  if (acl.status !== 0) throw Error('No se pudo restringir el acceso al archivo de recuperación');
}
// Replaces (or appends) KEY=value lines in an .env file
function replaceEnv(text, name, value) {
  const line = `${name}=${JSON.stringify(value)}`;
  const pattern = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=.*$`, 'm');
  return pattern.test(text) ? text.replace(pattern, () => line) : `${text.trimEnd()}\n${line}\n`;
}
// Writes through a temporary file and renames it, so a crash never leaves a half-written file
function atomicWrite(file, text) {
  const temp = `${file}.pending-${crypto.randomUUID()}`;
  fs.writeFileSync(temp, text, { flag: 'wx' });
  fs.renameSync(temp, file);
}
// Usage: node scripts/harden-local-installation.cjs --apply <pgData> <verified backup folder>
// Requires a verified backup. Replaces "trust" rules in pg_hba.conf with scram-sha-256, sets a random
// password on the PostgreSQL role, rotates JWT_SECRET, resets demo passwords still in use, and saves
// the previous files plus the new credentials in a private recovery folder.
async function main() {
  const [mode, pgData, backupDirectory] = process.argv.slice(2);
  if (mode !== '--apply' || !pgData || !backupDirectory || !process.env.LOCALAPPDATA) {
    throw Error('Uso: node scripts/harden-local-installation.cjs --apply <pgData> <respaldo-verificado>');
  }
  const envPath = path.join(root, 'backend/.env');
  const originalEnv = fs.readFileSync(envPath, 'utf8');
  const settings = dotenv.parse(originalEnv);
  const url = new URL(settings.DATABASE_URL);
  if (url.hostname !== '127.0.0.1' || (url.port || '5432') !== '5432' || url.pathname !== '/pos_erp_hotel') {
    throw Error('Destino distinto de la instalación local revisada; no aplicar');
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(backupDirectory, 'manifest.json')));
  const verified = JSON.parse(fs.readFileSync(path.join(backupDirectory, 'restore-verified.json')));
  const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(backupDirectory, 'database.dump'))).digest('hex');
  if (manifest.sha256 !== digest || verified.sha256 !== digest || manifest.database !== 'pos_erp_hotel') throw Error('Respaldo no verificado');
  const hbaPath = path.join(path.resolve(pgData), 'pg_hba.conf');
  const originalHba = fs.readFileSync(hbaPath, 'utf8');
  if (!originalHba.split(/\r?\n/).some(line => /^\s*(host|local)\s/.test(line) && /\btrust(?=\s*(?:#|$))/.test(line))) {
    throw Error('No hay reglas trust que corregir; no repetir la rotación automáticamente');
  }
  const hardenedHba = originalHba.split(/\r?\n/).map(line => /^\s*(host|local)\s/.test(line)
    ? line.replace(/\btrust(?=\s*(?:#|$))/, 'scram-sha-256') : line).join('\n');
  const p = new PrismaClient({ datasources: { db: { url: settings.DATABASE_URL } } });
  const dbPassword = crypto.randomBytes(32).toString('hex');
  const jwtSecret = crypto.randomBytes(48).toString('hex');
  const newUrl = new URL(url); newUrl.password = dbPassword;
  let recovery;
  let hbaChanged = false;
  try {
    const identity = await p.$queryRawUnsafe("SELECT current_user AS name, current_setting('hba_file') AS file");
    if (identity[0].name !== decodeURIComponent(url.username) || path.resolve(identity[0].file).toLowerCase() !== hbaPath.toLowerCase()) {
      throw Error('La conexión no corresponde al archivo de autenticación indicado');
    }
    const legacy = [];
    const users = await p.user.findMany({ select: { id: true, username: true, passwordHash: true } });
    for (const user of users) {
      for (const sample of ['AdminPassword2026!', 'Hotel2026!']) {
        if (await bcrypt.compare(sample, user.passwordHash)) {
          const password = crypto.randomBytes(18).toString('base64url');
          legacy.push({ ...user, password, nextHash: await bcrypt.hash(password, 12) }); break;
        }
      }
    }
    recovery = path.join(process.env.LOCALAPPDATA, 'HotelPuertoERP', 'recovery', new Date().toISOString().replace(/[:.]/g, '-'));
    privateDirectory(recovery);
    fs.writeFileSync(path.join(recovery, 'backend.env.before'), originalEnv, { flag: 'wx' });
    fs.writeFileSync(path.join(recovery, 'pg_hba.conf.before'), originalHba, { flag: 'wx' });
    fs.writeFileSync(path.join(recovery, 'credentials.txt'), [
      'Credenciales locales de HotelPuertoERP. No compartir ni subir a Git.',
      'Reiniciar la API para aplicar el nuevo secreto JWT y volver a iniciar sesión.',
      '', `PostgreSQL usuario: ${identity[0].name}`, `PostgreSQL contraseña: ${dbPassword}`, '',
      ...legacy.flatMap(user => [`Usuario de aplicación: ${user.username}`, `Contraseña: ${user.password}`, '']),
    ].join('\n'), { flag: 'wx' });
    await p.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET LOCAL password_encryption = 'scram-sha-256'");
      // Identifier of the verified connection and the generated hexadecimal password,
      // explicitly escaped; SQL is never taken from user input.
      await tx.$executeRawUnsafe(`ALTER ROLE "${identity[0].name.replaceAll('"', '""')}" PASSWORD '${dbPassword}'`);
      for (const user of legacy) {
        const updated = await tx.user.updateMany({ where: { id: user.id, passwordHash: user.passwordHash }, data: { passwordHash: user.nextHash } });
        if (updated.count !== 1) throw Error('Una cuenta cambió durante la corrección; operación revertida');
      }
    }, { timeout: 15000 });
    atomicWrite(envPath, replaceEnv(replaceEnv(originalEnv, 'DATABASE_URL', newUrl.toString()), 'JWT_SECRET', jwtSecret));
    atomicWrite(hbaPath, hardenedHba);
    hbaChanged = true;
    const errors = await p.$queryRawUnsafe('SELECT error FROM pg_hba_file_rules WHERE error IS NOT NULL');
    if (errors.length) throw Error('PostgreSQL detectó una regla inválida');
    await p.$queryRawUnsafe('SELECT pg_reload_conf()');
    // Reloading is asynchronous: wait at most two seconds until a password is required.
    let rejected = false;
    const wrongUrl = new URL(newUrl); wrongUrl.password = crypto.randomBytes(24).toString('hex');
    for (let attempt = 0; attempt < 10 && !rejected; attempt++) {
      const wrong = new PrismaClient({ datasources: { db: { url: wrongUrl.toString() } } });
      try { await wrong.$connect(); } catch (error) {
        if (error.errorCode === 'P1000') rejected = true;
        else throw Error('No se pudo verificar la autenticación de PostgreSQL');
      } finally { await wrong.$disconnect(); }
      if (!rejected) await new Promise(resolve => setTimeout(resolve, 200));
    }
    if (!rejected) throw Error('PostgreSQL todavía acepta una contraseña incorrecta');
    const good = new PrismaClient({ datasources: { db: { url: newUrl.toString() } } });
    try {
      await good.$connect();
      for (const user of legacy) {
        const saved = await good.user.findUniqueOrThrow({ where: { id: user.id } });
        if (!(await bcrypt.compare(user.password, saved.passwordHash))) throw Error('No se pudo verificar una contraseña de aplicación');
      }
    } finally { await good.$disconnect(); }
    fs.writeFileSync(path.join(recovery, 'result.json'), JSON.stringify({ completedAt: new Date().toISOString(), users: legacy.map(user => user.username), authentication: 'scram-sha-256', restartApiRequired: true }, null, 2));
    console.log(JSON.stringify({ status: 'HARDENED', users: legacy.map(user => user.username), recoveryFile: path.join(recovery, 'credentials.txt'), restartApiRequired: true }));
  } catch (error) {
    if (hbaChanged) {
      fs.writeFileSync(hbaPath, originalHba);
      await p.$queryRawUnsafe('SELECT pg_reload_conf()').catch(() => {});
    }
    console.error(JSON.stringify({ status: 'INCOMPLETE', recoveryDirectory: recovery ?? null, code: error.code ?? 'REVIEW_REQUIRED' }));
    process.exitCode = 1;
  } finally { await p.$disconnect(); }
}
main().catch(() => { console.error('No se pudo preparar la corrección; no se imprimen credenciales. Revise los parámetros y el respaldo.'); process.exitCode = 1; });
