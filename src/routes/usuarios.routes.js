import { Router } from 'express';
import { ROLES, ROLE_LABEL } from '../config.js';
import { all, get, run } from '../db/index.js';
import { hashPassword, passwordProblems } from '../lib/password.js';
import { destroyUserSessions } from '../lib/session.js';
import { entero, opcion, texto, HttpError } from '../lib/validate.js';
import { asyncHandler } from '../middleware/errors.js';
import { auditar, requireRole } from '../middleware/auth.js';

const router = Router();

// Toda esta seccion es solo del administrador.
router.use(requireRole('admin'));

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const datos = all(
      `SELECT u.id, u.nombre, u.apellido, u.usuario, u.rol, u.telefono, u.activo, u.debe_cambiar, u.creado_en,
              (SELECT MAX(creada_en) FROM sesiones s WHERE s.usuario_id = u.id) AS ultima_sesion
       FROM usuarios u ORDER BY u.usuario ASC`,
    );

    res.json({
      ok: true,
      roles: ROLES.map((r) => ({ valor: r, texto: ROLE_LABEL[r] })),
      datos: datos.map((u) => ({ ...u, rolTexto: ROLE_LABEL[u.rol] })),
    });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const nombre = texto(req.body?.nombre, 'nombre', { min: 2, max: 60 });
    const apellido = texto(req.body?.apellido, 'apellido', { requerido: false, max: 60 }) || '';
    const usuario = texto(req.body?.usuario, 'usuario', { min: 3, max: 40 }).toLowerCase();
    const clave = texto(req.body?.clave, 'clave', { max: 200 });
    const rol = opcion(req.body?.rol, ROLES, 'rol');
    const telefono = texto(req.body?.telefono, 'telefono', { requerido: false, max: 30 });

    if (!/^[a-z0-9._-]+$/.test(usuario)) {
      throw new HttpError(400, 'El usuario solo admite letras, numeros, punto, guion y guion bajo.');
    }

    const problemas = passwordProblems(clave);
    if (problemas.length) throw new HttpError(400, `La contrasena ${problemas.join(', ')}.`);

    if (get('SELECT id FROM usuarios WHERE usuario = ? COLLATE NOCASE', [usuario])) {
      throw new HttpError(409, 'Ese nombre de usuario ya existe.');
    }

    const { hash, salt } = await hashPassword(clave);
    const { lastInsertRowid } = run(
      `INSERT INTO usuarios (nombre, apellido, usuario, clave_hash, clave_salt, rol, telefono, debe_cambiar)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [nombre, apellido, usuario, hash, salt, rol, telefono],
    );

    auditar(req, 'usuario_crear', { usuario, rol });

    res.status(201).json({
      ok: true,
      mensaje: `Usuario ${usuario} creado. Debera cambiar la contrasena al entrar.`,
      datos: { id: Number(lastInsertRowid), nombre, apellido, usuario, rol, rolTexto: ROLE_LABEL[rol], activo: 1 },
    });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = entero(req.params.id, 'id');
    const actual = get('SELECT * FROM usuarios WHERE id = ?', [id]);
    if (!actual) throw new HttpError(404, 'Usuario no encontrado.');

    const nombre = req.body?.nombre === undefined ? actual.nombre : texto(req.body.nombre, 'nombre', { min: 2, max: 60 });
    const apellido = req.body?.apellido === undefined ? actual.apellido : texto(req.body.apellido, 'apellido', { requerido: false, max: 60 }) || '';
    const telefono = req.body?.telefono === undefined ? actual.telefono : texto(req.body.telefono, 'telefono', { requerido: false, max: 30 });
    const rol = req.body?.rol === undefined ? actual.rol : opcion(req.body.rol, ROLES, 'rol');
    const activo = req.body?.activo === undefined ? actual.activo : Number(Boolean(req.body.activo));

    // Sin esta guarda el sistema puede quedarse sin ningun administrador con acceso.
    if (actual.rol === 'admin' && (rol !== 'admin' || activo === 0)) {
      const otros = get("SELECT COUNT(*) AS c FROM usuarios WHERE rol = 'admin' AND activo = 1 AND id <> ?", [id])?.c ?? 0;
      if (otros === 0) throw new HttpError(409, 'Debe quedar al menos un administrador activo.');
    }

    run(
      `UPDATE usuarios SET nombre = ?, apellido = ?, telefono = ?, rol = ?, activo = ?,
              actualizado_en = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       WHERE id = ?`,
      [nombre, apellido, telefono, rol, activo, id],
    );

    // Cambiar el rol o desactivar debe surtir efecto ya, no cuando venza la sesion.
    if (rol !== actual.rol || activo !== actual.activo) destroyUserSessions(id);

    auditar(req, 'usuario_editar', { id, rol, activo });
    res.json({ ok: true, mensaje: 'Usuario actualizado.' });
  }),
);

/** El administrador asigna una clave temporal; el dueno la cambia al entrar. */
router.post(
  '/:id/clave',
  asyncHandler(async (req, res) => {
    const id = entero(req.params.id, 'id');
    const clave = texto(req.body?.clave, 'clave', { max: 200 });

    if (!get('SELECT id FROM usuarios WHERE id = ?', [id])) throw new HttpError(404, 'Usuario no encontrado.');

    const problemas = passwordProblems(clave);
    if (problemas.length) throw new HttpError(400, `La contrasena ${problemas.join(', ')}.`);

    const { hash, salt } = await hashPassword(clave);
    run(
      `UPDATE usuarios SET clave_hash = ?, clave_salt = ?, debe_cambiar = 1,
              actualizado_en = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       WHERE id = ?`,
      [hash, salt, id],
    );
    destroyUserSessions(id);

    auditar(req, 'usuario_reset_clave', { id });
    res.json({ ok: true, mensaje: 'Contrasena restablecida. El usuario debera cambiarla al entrar.' });
  }),
);

router.get(
  '/auditoria',
  asyncHandler(async (req, res) => {
    const limite = entero(req.query.limite, 'limite', { min: 10, max: 500, defecto: 100 });
    const datos = all(
      `SELECT a.id, a.accion, a.detalle, a.ip, a.creado_en, COALESCE(u.usuario, '-') AS usuario
       FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id
       ORDER BY a.id DESC LIMIT ?`,
      [limite],
    );
    res.json({ ok: true, datos });
  }),
);

export default router;
