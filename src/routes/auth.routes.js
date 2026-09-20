import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config, ROLE_LABEL } from '../config.js';
import { get, run } from '../db/index.js';
import { hashPassword, passwordProblems, verifyPassword } from '../lib/password.js';
import { COOKIE_NAME, cookieOptions, createSession, destroySession, destroyUserSessions } from '../lib/session.js';
import { texto } from '../lib/validate.js';
import { asyncHandler } from '../middleware/errors.js';
import { auditar, requireAuth } from '../middleware/auth.js';

const router = Router();

// Freno a la fuerza bruta: el original aceptaba intentos ilimitados.
const limiteLogin = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, mensaje: 'Demasiados intentos. Espere unos minutos e intente de nuevo.' },
});

const perfil = (u) => ({
  id: u.id,
  nombre: u.nombre,
  apellido: u.apellido,
  usuario: u.usuario,
  rol: u.rol,
  rolTexto: ROLE_LABEL[u.rol],
  debeCambiar: u.debeCambiar ?? u.debe_cambiar === 1,
});

router.post(
  '/entrar',
  limiteLogin,
  asyncHandler(async (req, res) => {
    const usuario = texto(req.body?.usuario, 'usuario', { max: 60 });
    const clave = texto(req.body?.clave, 'clave', { max: 200 });

    const fila = get('SELECT * FROM usuarios WHERE usuario = ? COLLATE NOCASE', [usuario]);
    const valida = fila ? await verifyPassword(clave, fila.clave_hash, fila.clave_salt) : false;

    // Mismo mensaje para usuario inexistente y clave mala: no se filtra quien existe.
    if (!fila || !valida || fila.activo !== 1) {
      run('INSERT INTO auditoria (accion, detalle, ip) VALUES (?, ?, ?)', [
        'login_fallido',
        `usuario=${usuario}`,
        req.ip || null,
      ]);
      return res.status(401).json({ ok: false, mensaje: 'Usuario o contrasena incorrectos.' });
    }

    const { cookie, expira } = createSession(fila.id, { ip: req.ip, agente: req.get('user-agent') });
    res.cookie(COOKIE_NAME, cookie, cookieOptions(expira));

    run('INSERT INTO auditoria (usuario_id, accion, ip) VALUES (?, ?, ?)', [fila.id, 'login', req.ip || null]);

    return res.json({
      ok: true,
      usuario: perfil({ ...fila, debeCambiar: fila.debe_cambiar === 1 }),
      organizacion: config.orgName,
    });
  }),
);

router.post('/salir', (req, res) => {
  if (req.usuario) {
    auditar(req, 'logout');
    destroySession(req.usuario.sid);
  }
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

router.get('/yo', (req, res) => {
  if (!req.usuario) return res.status(401).json({ ok: false, mensaje: 'Sin sesion.' });
  return res.json({ ok: true, usuario: perfil(req.usuario), organizacion: config.orgName });
});

router.post(
  '/cambiar-clave',
  requireAuth,
  asyncHandler(async (req, res) => {
    const actual = texto(req.body?.actual, 'clave actual', { max: 200 });
    const nueva = texto(req.body?.nueva, 'clave nueva', { max: 200 });

    const fila = get('SELECT clave_hash, clave_salt FROM usuarios WHERE id = ?', [req.usuario.id]);
    if (!(await verifyPassword(actual, fila.clave_hash, fila.clave_salt))) {
      return res.status(400).json({ ok: false, mensaje: 'La contrasena actual no es correcta.', campo: 'actual' });
    }

    const problemas = passwordProblems(nueva);
    if (problemas.length) {
      return res.status(400).json({ ok: false, mensaje: `La nueva contrasena ${problemas.join(', ')}.`, campo: 'nueva' });
    }
    if (actual === nueva) {
      return res.status(400).json({ ok: false, mensaje: 'La nueva contrasena debe ser distinta de la actual.', campo: 'nueva' });
    }

    const { hash, salt } = await hashPassword(nueva);
    run(
      `UPDATE usuarios
       SET clave_hash = ?, clave_salt = ?, debe_cambiar = 0,
           actualizado_en = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       WHERE id = ?`,
      [hash, salt, req.usuario.id],
    );

    auditar(req, 'cambio_clave');

    // Cerrar el resto de sesiones y abrir una limpia con la clave nueva.
    destroyUserSessions(req.usuario.id);
    const { cookie, expira } = createSession(req.usuario.id, { ip: req.ip, agente: req.get('user-agent') });
    res.cookie(COOKIE_NAME, cookie, cookieOptions(expira));

    return res.json({ ok: true, mensaje: 'Contrasena actualizada.' });
  }),
);

export default router;
