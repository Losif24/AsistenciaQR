import { Router } from 'express';
import { all, get, run } from '../db/index.js';
import { localDateTime } from '../lib/time.js';
import { entero, opcion, texto, HttpError } from '../lib/validate.js';
import { asyncHandler } from '../middleware/errors.js';
import { auditar } from '../middleware/auth.js';

const router = Router();

// Una lectura de QR suele dispararse varias veces seguidas. Dentro de esta
// ventana se considera la misma marcacion y no se duplica el registro.
const VENTANA_REPETIDO_SEG = 45;

function buscarPersona({ codigo, documento }) {
  if (codigo) return get('SELECT * FROM personal WHERE codigo_qr = ?', [codigo]);
  if (documento) return get('SELECT * FROM personal WHERE documento = ? COLLATE NOCASE', [documento]);
  return null;
}

/** Consulta previa: muestra a quien pertenece el codigo antes de marcar. */
router.get(
  '/buscar',
  asyncHandler(async (req, res) => {
    const codigo = texto(req.query.codigo, 'codigo', { requerido: false, max: 80 });
    const documento = texto(req.query.documento, 'documento', { requerido: false, max: 40 });
    if (!codigo && !documento) throw new HttpError(400, 'Indique un codigo QR o un documento.');

    const persona = buscarPersona({ codigo, documento });
    if (!persona) throw new HttpError(404, 'No se encontro a nadie con ese codigo o documento.');
    if (persona.activo !== 1) throw new HttpError(409, `${persona.nombre} esta inactivo en el sistema.`);

    const ultimo = get(
      'SELECT tipo, fecha_local, hora_local FROM asistencia WHERE personal_id = ? ORDER BY marcado_en DESC LIMIT 1',
      [persona.id],
    );

    res.json({
      ok: true,
      datos: {
        id: persona.id,
        nombre: persona.nombre,
        documento: persona.documento,
        cargo: persona.cargo,
        area: persona.area,
        ultimo: ultimo || null,
        sugerido: ultimo?.tipo === 'entrada' ? 'salida' : 'entrada',
      },
    });
  }),
);

/**
 * Registra una marcacion. Si no se indica el tipo, se alterna a partir de la
 * ultima del dia: evita dos entradas seguidas por descuido del operador.
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const codigo = texto(req.body?.codigo, 'codigo', { requerido: false, max: 80 });
    const documento = texto(req.body?.documento, 'documento', { requerido: false, max: 40 });
    const origen = req.body?.codigo ? 'qr' : 'manual';
    const nota = texto(req.body?.nota, 'nota', { requerido: false, max: 200 });

    if (!codigo && !documento) throw new HttpError(400, 'Indique un codigo QR o un documento.');

    const persona = buscarPersona({ codigo, documento });
    if (!persona) throw new HttpError(404, 'No se encontro a nadie con ese codigo o documento.');
    if (persona.activo !== 1) throw new HttpError(409, `${persona.nombre} esta inactivo en el sistema.`);

    const ultimo = get(
      'SELECT tipo, marcado_en, hora_local FROM asistencia WHERE personal_id = ? ORDER BY marcado_en DESC LIMIT 1',
      [persona.id],
    );

    const tipoExplicito = Boolean(req.body?.tipo);
    const tipo = tipoExplicito
      ? opcion(req.body.tipo, ['entrada', 'salida'], 'tipo')
      : ultimo?.tipo === 'entrada'
        ? 'salida'
        : 'entrada';

    const ahora = new Date();
    const segundos = ultimo ? (ahora - new Date(ultimo.marcado_en)) / 1000 : Infinity;

    // En modo automatico el tipo se alterna, asi que una segunda lectura
    // dentro de la ventana se descarta siempre: si no, un lector que dispara
    // dos veces marcaria la entrada y acto seguido la salida.
    const esRepeticion = segundos < VENTANA_REPETIDO_SEG && (!tipoExplicito || ultimo.tipo === tipo);

    if (ultimo && esRepeticion) {
      return res.status(200).json({
        ok: true,
        repetido: true,
        mensaje: `${persona.nombre} ya registro ${ultimo.tipo} a las ${ultimo.hora_local}.`,
        datos: {
          nombre: persona.nombre,
          documento: persona.documento,
          cargo: persona.cargo,
          tipo: ultimo.tipo,
          hora: ultimo.hora_local,
        },
      });
    }

    const { fecha, hora, utc } = localDateTime(ahora);
    const { lastInsertRowid } = run(
      `INSERT INTO asistencia (personal_id, tipo, marcado_en, fecha_local, hora_local, origen, registrado_por, nota)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [persona.id, tipo, utc, fecha, hora, origen, req.usuario?.id ?? null, nota],
    );

    auditar(req, 'asistencia_marcar', { persona: persona.documento, tipo, origen });

    res.status(201).json({
      ok: true,
      repetido: false,
      mensaje: `${tipo === 'entrada' ? 'Entrada' : 'Salida'} registrada para ${persona.nombre}.`,
      datos: {
        id: Number(lastInsertRowid),
        nombre: persona.nombre,
        documento: persona.documento,
        cargo: persona.cargo,
        tipo,
        fecha,
        hora,
      },
    });
  }),
);

/** Ultimas marcaciones, para el panel lateral de la pantalla de registro. */
router.get(
  '/recientes',
  asyncHandler(async (req, res) => {
    const limite = entero(req.query.limite, 'limite', { min: 1, max: 100, defecto: 12 });
    const datos = all(
      'SELECT persona, documento, tipo, fecha_local, hora_local, origen FROM v_asistencia ORDER BY marcado_en DESC LIMIT ?',
      [limite],
    );
    res.json({ ok: true, datos });
  }),
);

export default router;
