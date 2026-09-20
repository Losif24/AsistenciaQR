import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const KEY_LEN = 64;
const COST = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** Deriva la contrasena con scrypt. Nunca se guarda el texto plano. */
export async function hashPassword(plain) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(plain, salt, KEY_LEN, COST);
  return { hash: key.toString('hex'), salt };
}

/** Comparacion en tiempo constante: no filtra informacion por el tiempo de respuesta. */
export async function verifyPassword(plain, hash, salt) {
  if (!plain || !hash || !salt) return false;
  try {
    const key = await derive(plain, salt, KEY_LEN, COST);
    const stored = Buffer.from(hash, 'hex');
    if (stored.length !== key.length) return false;
    return timingSafeEqual(key, stored);
  } catch {
    return false;
  }
}

export function passwordProblems(plain) {
  const problems = [];
  if (!plain || plain.length < 8) problems.push('debe tener al menos 8 caracteres');
  if (!/[a-zA-Z]/.test(plain || '')) problems.push('debe incluir al menos una letra');
  if (!/[0-9]/.test(plain || '')) problems.push('debe incluir al menos un numero');
  return problems;
}
