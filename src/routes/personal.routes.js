import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import QRCode from 'qrcode';
import { all, get, run } from '../db/index.js';
import { documento as validarDocumento, entero, texto, HttpError } from '../lib/validate.js';
import { asyncHandler } from '../middleware/errors.js';
import { auditar, requireRole } from '../middleware/auth.js';

const router = Router();

const SELECT_BASE = `
  SELECT p.id, p.nombre, p.documento, p.cargo, p.area, p.codigo_qr, p.activo, p.creado_en,
         (SELECT a.tipo FROM asistencia a WHERE a.personal_id = p.id ORDER BY a.marcado_en DESC LIMIT 1) AS ultimo_tipo,
         (SELECT a.marcado_en FROM asistencia a WHERE a.personal_id = p.id ORDER BY a.marcado_en DESC LIMIT 1) AS ultimo_en
  FROM personal p
`;

/** Listado con busqueda y filtros. La imagen del QR se pide aparte. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const busqueda = texto(req.query.q, 'q', { requerido: false, max: 60 });
    const area = texto(req.query.area, 'area', { requerido: false, max: 60 });
    const soloActivos = req.query.activos !== '0';

    const where = [];
    const params = [];

    if (busqueda) {
      where.push('(p.nombre LIKE ? OR p.documento LIKE ? OR p.cargo LIKE ?)');
      params.push(`%${busqueda}%`, `%${busqueda}%`, `%${busqueda}%`);
    }
    if (area) {
      where.push('p.area = ?');
      params.push(area);
    }
    if (soloActivos) where.push('p.activo = 1');

    const sql = `${SELECT_BASE} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY p.nombre ASC`;
    const filas = all(sql, params);
    const areas = all("SELECT DISTINCT area FROM personal WHERE area IS NOT NULL AND area <> '' ORDER BY area").map((r) => r.area);

    res.json({ ok: true, total: filas.length, areas, datos: filas });
  }),
);

/** Imagen del QR. Se genera una sola vez y queda guardada. */
router.get(
  '/:id/qr',
  asyncHandler(async (req, res) => {
    const id = entero(req.params.id, 'id');
    const fila = get('SELECT id, nombre, documento, codigo_qr, qr_png FROM personal WHERE id = ?', [id]);
    if (!fila) throw new HttpError(404, 'Persona no encontrada.');

    let png = fila.qr_png;
    if (!png) {
      png = await QRCode.toDataURL(fila.codigo_qr, { width: 420, margin: 1, errorCorrectionLevel: 'M' });
      run('UPDATE personal SET qr_png = ? WHERE id = ?', [png, id]);
    }

    res.json({ ok: true, datos: { id: fila.id, nombre: fila.nombre, documento: fila.documento, qr: png } });
  }),
);

router.post(
  '/',
  requireRole('supervisor'),
  asyncHandler(async (req, res) => {
    const nombre = texto(req.body?.nombre, 'nombre', { min: 3, max: 120 }).toUpperCase();
    const documento = validarDocumento(req.body?.documento);
    const cargo = texto(req.body?.cargo, 'cargo', { requerido: false, max: 80 });
    const area = texto(req.body?.area, 'area', { requerido: false, max: 80 });

    if (get('SELECT id FROM personal WHERE documento = ? COLLATE NOCASE', [documento])) {
      throw new HttpError(409, 'Ya existe una persona con ese documento.');
    }

    // El QR guarda un token aleatorio, no el documento: asi el codigo no
    // revela datos personales ni se puede fabricar conociendo la cedula.
    const codigo = randomUUID();
    const png = await QRCode.toDataURL(codigo, { width: 420, margin: 1, errorCorrectionLevel: 'M' });

    const { lastInsertRowid } = run(
      'INSERT INTO personal (nombre, documento, cargo, area, codigo_qr, qr_png) VALUES (?, ?, ?, ?, ?, ?)',
      [nombre, documento, cargo, area, codigo, png],
    );

    auditar(req, 'personal_crear', { documento, nombre });

    res.status(201).json({
      ok: true,
      mensaje: 'Persona registrada.',
      datos: { id: Number(lastInsertRowid), nombre, documento, cargo, area, codigo_qr: codigo, qr: png, activo: 1 },
    });
  }),
);

router.patch(
  '/:id',
  requireRole('supervisor'),
  asyncHandler(async (req, res) => {
    const id = entero(req.params.id, 'id');
    const actual = get('SELECT * FROM personal WHERE id = ?', [id]);
    if (!actual) throw new HttpError(404, 'Persona no encontrada.');

    const nombre = req.body?.nombre === undefined ? actual.nombre : texto(req.body.nombre, 'nombre', { min: 3, max: 120 }).toUpperCase();
    const cargo = req.body?.cargo === undefined ? actual.cargo : texto(req.body.cargo, 'cargo', { requerido: false, max: 80 });
    const area = req.body?.area === undefined ? actual.area : texto(req.body.area, 'area', { requerido: false, max: 80 });
    const activo = req.body?.activo === undefined ? actual.activo : Number(Boolean(req.body.activo));

    run(
      `UPDATE personal SET nombre = ?, cargo = ?, area = ?, activo = ?,
              actualizado_en = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       WHERE id = ?`,
      [nombre, cargo, area, activo, id],
    );

    auditar(req, 'personal_editar', { id, nombre, activo });
    res.json({ ok: true, mensaje: 'Datos actualizados.' });
  }),
);

/** Regenera el codigo por perdida o robo del carnet: el QR viejo deja de servir. */
router.post(
  '/:id/regenerar-qr',
  requireRole('supervisor'),
  asyncHandler(async (req, res) => {
    const id = entero(req.params.id, 'id');
    if (!get('SELECT id FROM personal WHERE id = ?', [id])) throw new HttpError(404, 'Persona no encontrada.');

    const codigo = randomUUID();
    const png = await QRCode.toDataURL(codigo, { width: 420, margin: 1, errorCorrectionLevel: 'M' });
    run('UPDATE personal SET codigo_qr = ?, qr_png = ? WHERE id = ?', [codigo, png, id]);

    auditar(req, 'personal_regenerar_qr', { id });
    res.json({ ok: true, mensaje: 'Codigo QR regenerado. El anterior queda anulado.', datos: { qr: png } });
  }),
);

/** Baja logica: se conserva el historico de asistencia. */
router.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const id = entero(req.params.id, 'id');
    const { changes } = run('UPDATE personal SET activo = 0 WHERE id = ?', [id]);
    if (!changes) throw new HttpError(404, 'Persona no encontrada.');

    auditar(req, 'personal_desactivar', { id });
    res.json({ ok: true, mensaje: 'Persona desactivada. Su historico se conserva.' });
  }),
);

export default router;
