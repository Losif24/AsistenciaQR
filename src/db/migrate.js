import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, config } from '../config.js';
import { isMain } from '../lib/ismain.js';
import { all, close, exec, get, run } from './index.js';
import { seed } from './seed.js';

// Cada entrada es un paso idempotente. El numero de version vive en
// PRAGMA user_version, de modo que actualizar la app nunca pide trabajo manual.
const MIGRATIONS = [
  {
    version: 1,
    name: 'esquema inicial',
    up: () => exec(readFileSync(join(ROOT, 'src/db/schema.sql'), 'utf8')),
  },
];

const currentVersion = () => get('PRAGMA user_version')?.user_version ?? 0;

export function migrate({ verbose = true } = {}) {
  const from = currentVersion();
  const pending = MIGRATIONS.filter((m) => m.version > from);

  if (pending.length === 0) {
    if (verbose) console.log(`[db] esquema al dia (version ${from})`);
    return { from, to: from, applied: 0 };
  }

  for (const migration of pending) {
    if (verbose) console.log(`[db] aplicando v${migration.version}: ${migration.name}`);
    migration.up();
    // PRAGMA no acepta parametros enlazados; la version es un entero nuestro.
    exec(`PRAGMA user_version = ${Number(migration.version)}`);
  }

  const to = currentVersion();
  if (verbose) console.log(`[db] esquema actualizado ${from} -> ${to}`);
  return { from, to, applied: pending.length };
}

/** Borra las tablas de la aplicacion. Solo se usa desde "npm run reset-db". */
function dropAll() {
  const views = all("SELECT name FROM sqlite_master WHERE type = 'view'");
  for (const v of views) exec(`DROP VIEW IF EXISTS "${v.name}"`);

  const tables = all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
  exec('PRAGMA foreign_keys = OFF');
  for (const t of tables) exec(`DROP TABLE IF EXISTS "${t.name}"`);
  exec('PRAGMA foreign_keys = ON');
  exec('PRAGMA user_version = 0');
}

/** Limpieza de sesiones vencidas. Se llama al arrancar y cada hora. */
export function purgeSessions() {
  const { changes } = run('DELETE FROM sesiones WHERE expira_en < ?', [new Date().toISOString()]);
  return changes;
}

// Ejecutado directamente: node src/db/migrate.js [--reset]
if (isMain(import.meta.url)) {
  const reset = process.argv.includes('--reset');
  if (reset) {
    console.log('[db] borrando datos existentes por --reset');
    dropAll();
  }
  migrate();
  await seed();
  console.log(`[db] archivo: ${config.dbFile}`);
  close();
}
