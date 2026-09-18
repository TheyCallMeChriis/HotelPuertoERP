export function validateEnvironment(source: NodeJS.ProcessEnv) {
  const secret = source.JWT_SECRET?.trim();
  if (!secret || secret.length < 32 || /cambiar|fallback_secret|reemplazar/i.test(secret)) {
    throw new Error('JWT_SECRET es obligatorio: genere un secreto aleatorio de al menos 32 caracteres en backend/.env');
  }
  const database = source.DATABASE_URL?.trim();
  try {
    const url = new URL(database ?? '');
    if (!['postgresql:', 'postgres:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2) throw new Error();
  } catch {
    throw new Error('DATABASE_URL debe indicar una base PostgreSQL válida en backend/.env');
  }
  const portText = source.PORT ?? '4000';
  const port = Number(portText);
  if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT debe estar entre 1 y 65535');
  const duration = source.JWT_EXPIRES_IN ?? '8h';
  const match = /^(\d+)(s|m|h|d)$/.exec(duration);
  const factors: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  const seconds = match ? Number(match[1]) * factors[match[2]] : NaN;
  if (!Number.isSafeInteger(seconds) || seconds <= 0) throw new Error('JWT_EXPIRES_IN debe ser una duración positiva, por ejemplo 8h');
  return { PORT: port, NODE_ENV: source.NODE_ENV ?? 'development', DATABASE_URL: database!, JWT_SECRET: secret, JWT_EXPIRES_IN: seconds };
}

export function seedPasswords(source: NodeJS.ProcessEnv) {
  const admin = source.SEED_ADMIN_PASSWORD;
  const operator = source.SEED_OPERATOR_PASSWORD;
  if (!admin || !operator || admin.length < 12 || operator.length < 12 || admin === operator) {
    throw new Error('Defina SEED_ADMIN_PASSWORD y SEED_OPERATOR_PASSWORD diferentes, de al menos 12 caracteres, antes de cargar datos de demostración');
  }
  return { admin, operator };
}
