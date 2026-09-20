import { mkdirSync } from 'node:fs';
import sqlite3 from 'node-sqlite3-wasm';
import { config } from '../config.js';

// SQLite compilado a WebAssembly: no hay binarios nativos que compilar,
// asi que "npm install" funciona igual en Windows, Linux y macOS.
mkdirSync(config.dataDir, { recursive: true });

// node-sqlite3-wasm se publica como CommonJS: se importa por defecto.
const { Database } = sqlite3;
const db = new Database(config.dbFile);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
  PRAGMA synchronous = NORMAL;
`);

export const all = (sql, params = []) => db.all(sql, params);
export const get = (sql, params = []) => db.get(sql, params);
export const run = (sql, params = []) => db.run(sql, params);
export const exec = (sql) => db.exec(sql);

/** Ejecuta fn dentro de una transaccion y revierte si algo falla. */
export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function close() {
  try {
    db.close();
  } catch {
    // La base ya estaba cerrada; no hay nada que rescatar.
  }
}

export default db;
