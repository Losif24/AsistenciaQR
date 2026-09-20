import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const num = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const dbFile = process.env.DB_FILE || 'data/asistencia.db';
const DATA_DIR = dirname(isAbsolute(dbFile) ? dbFile : join(ROOT, dbFile));

// La clave de sesion se persiste para que reiniciar el servidor no
// invalide las sesiones abiertas ni obligue a configurar nada a mano.
function resolveSecret() {
  const fromEnv = (process.env.SESSION_SECRET || '').trim();
  if (fromEnv) return fromEnv;

  const keyFile = join(DATA_DIR, 'secret.key');
  if (existsSync(keyFile)) return readFileSync(keyFile, 'utf8').trim();

  mkdirSync(DATA_DIR, { recursive: true });
  const generated = randomBytes(48).toString('hex');
  writeFileSync(keyFile, generated, { mode: 0o600 });
  return generated;
}

export const config = {
  port: num(process.env.PORT, 4090),
  host: process.env.HOST || '0.0.0.0',
  dbFile: isAbsolute(dbFile) ? dbFile : join(ROOT, dbFile),
  dataDir: DATA_DIR,
  timezone: process.env.TZ || 'America/Bogota',
  sessionSecret: resolveSecret(),
  sessionHours: num(process.env.SESSION_HOURS, 12),
  orgName: process.env.ORG_NAME || 'Mi Organizacion',
  isProduction: process.env.NODE_ENV === 'production',
};

export const ROLES = Object.freeze(['admin', 'supervisor', 'operador']);

export const ROLE_LABEL = Object.freeze({
  admin: 'Administrador',
  supervisor: 'Supervisor',
  operador: 'Operador',
});
