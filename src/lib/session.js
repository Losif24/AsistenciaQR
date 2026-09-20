import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { get, run } from '../db/index.js';

export const COOKIE_NAME = 'asistencia_sid';

const sign = (id) => createHmac('sha256', config.sessionSecret).update(id).digest('base64url');

/** La cookie lleva "id.firma": sin la clave del servidor no se puede fabricar. */
function unsign(value) {
  if (typeof value !== 'string') return null;
  const index = value.lastIndexOf('.');
  if (index <= 0) return null;

  const id = value.slice(0, index);
  const given = Buffer.from(value.slice(index + 1));
  const expected = Buffer.from(sign(id));
  if (given.length !== expected.length) return null;
  return timingSafeEqual(given, expected) ? id : null;
}

export function createSession(usuarioId, { ip, agente } = {}) {
  const id = randomBytes(24).toString('base64url');
  const ahora = new Date();
  const expira = new Date(ahora.getTime() + config.sessionHours * 3600 * 1000);

  run('INSERT INTO sesiones (id, usuario_id, creada_en, expira_en, ip, agente) VALUES (?, ?, ?, ?, ?, ?)', [
    id,
    usuarioId,
    ahora.toISOString(),
    expira.toISOString(),
    ip || null,
    (agente || '').slice(0, 250) || null,
  ]);

  return { cookie: `${id}.${sign(id)}`, expira };
}

/** Devuelve el usuario dueno de la cookie, o null si no vale. */
export function resolveSession(cookieValue) {
  const id = unsign(cookieValue);
  if (!id) return null;

  const row = get(
    `SELECT s.id AS sid, s.expira_en, u.id, u.nombre, u.apellido, u.usuario, u.rol, u.activo, u.debe_cambiar
     FROM sesiones s
     JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.id = ?`,
    [id],
  );

  if (!row) return null;
  if (new Date(row.expira_en) < new Date() || row.activo !== 1) {
    run('DELETE FROM sesiones WHERE id = ?', [id]);
    return null;
  }

  return {
    sid: row.sid,
    id: row.id,
    nombre: row.nombre,
    apellido: row.apellido,
    usuario: row.usuario,
    rol: row.rol,
    debeCambiar: row.debe_cambiar === 1,
  };
}

export const destroySession = (sid) => run('DELETE FROM sesiones WHERE id = ?', [sid]);
export const destroyUserSessions = (usuarioId) => run('DELETE FROM sesiones WHERE usuario_id = ?', [usuarioId]);

export const cookieOptions = (expira) => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: config.isProduction && process.env.TRUST_HTTPS === '1',
  path: '/',
  expires: expira,
});
