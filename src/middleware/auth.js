import { run } from '../db/index.js';
import { COOKIE_NAME, resolveSession } from '../lib/session.js';
import { HttpError } from '../lib/validate.js';

// Jerarquia de permisos. Un rol hereda todo lo que puede el de abajo.
const NIVEL = { operador: 1, supervisor: 2, admin: 3 };

// Dentro de app.use('/api', ...) Express recorta req.path al tramo restante,
// asi que hay que mirar la URL completa para saber si es una llamada de API.
const rutaReal = (req) => (req.originalUrl || req.url).split('?')[0];
const esApi = (req) => rutaReal(req).startsWith('/api/');

/** Adjunta req.usuario cuando hay sesion valida. Nunca bloquea. */
export function attachUser(req, _res, next) {
  req.usuario = resolveSession(req.cookies?.[COOKIE_NAME]) || null;
  next();
}

/** Exige sesion. Responde 401 en la API y redirige en las paginas. */
export function requireAuth(req, res, next) {
  if (req.usuario) return next();
  if (esApi(req)) return res.status(401).json({ ok: false, mensaje: 'Debe iniciar sesion.' });
  return res.redirect('/');
}

/** Exige un rol minimo. requireRole('supervisor') deja pasar supervisor y admin. */
export function requireRole(minimo) {
  const requerido = NIVEL[minimo];
  return (req, res, next) => {
    if (!req.usuario) return requireAuth(req, res, next);
    if (NIVEL[req.usuario.rol] >= requerido) return next();

    if (esApi(req)) return res.status(403).json({ ok: false, mensaje: 'Su rol no tiene permiso para esta accion.' });
    return res.redirect('/panel');
  };
}

/**
 * Defensa CSRF. Con SameSite=Lax un sitio externo no puede mandar la cookie
 * en una peticion fetch; ademas exigimos una cabecera que solo pone nuestro JS.
 */
export function requireSameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With') === 'asistencia-qr') return next();
  return res.status(403).json({ ok: false, mensaje: 'Peticion rechazada por seguridad.' });
}

/** Obliga a cambiar la contrasena inicial antes de usar el resto del sistema. */
const PERMITIDO_SIN_CAMBIAR = new Set([
  '/api/auth/cambiar-clave',
  '/api/auth/salir',
  '/api/auth/yo',
  '/cambiar-clave',
]);

export function blockIfMustChange(req, res, next) {
  if (!req.usuario?.debeCambiar) return next();
  if (PERMITIDO_SIN_CAMBIAR.has(rutaReal(req))) return next();

  if (esApi(req)) {
    return res.status(409).json({ ok: false, codigo: 'CAMBIO_REQUERIDO', mensaje: 'Debe cambiar su contrasena.' });
  }
  return res.redirect('/cambiar-clave');
}

export function auditar(req, accion, detalle) {
  run('INSERT INTO auditoria (usuario_id, accion, detalle, ip) VALUES (?, ?, ?, ?)', [
    req.usuario?.id ?? null,
    accion,
    typeof detalle === 'string' ? detalle : JSON.stringify(detalle ?? null),
    req.ip || null,
  ]);
}

export { HttpError };
