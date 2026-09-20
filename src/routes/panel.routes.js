import { Router } from 'express';
import { all, get } from '../db/index.js';
import { dayName, localDate, shiftDate } from '../lib/time.js';
import { entero } from '../lib/validate.js';
import { asyncHandler } from '../middleware/errors.js';

const router = Router();

/**
 * Todo lo que pinta el panel en una sola peticion: indicadores del dia,
 * serie de los ultimos dias, reparto por area y quienes siguen adentro.
 */
router.get(
  '/resumen',
  asyncHandler(async (req, res) => {
    const dias = entero(req.query.dias, 'dias', { min: 7, max: 90, defecto: 14 });
    const hoy = localDate();
    const desde = shiftDate(hoy, -(dias - 1));

    const activos = get('SELECT COUNT(*) AS c FROM personal WHERE activo = 1')?.c ?? 0;

    const delDia = get(
      `SELECT
         COUNT(*)                                        AS marcaciones,
         SUM(CASE WHEN tipo = 'entrada' THEN 1 ELSE 0 END) AS entradas,
         SUM(CASE WHEN tipo = 'salida'  THEN 1 ELSE 0 END) AS salidas,
         COUNT(DISTINCT personal_id)                     AS personas
       FROM asistencia WHERE fecha_local = ?`,
      [hoy],
    );

    // Presentes: su ultima marcacion de hoy fue una entrada.
    const presentes = all(
      `SELECT p.nombre, p.cargo, p.area, a.hora_local
       FROM personal p
       JOIN asistencia a ON a.id = (
         SELECT id FROM asistencia WHERE personal_id = p.id AND fecha_local = ?
         ORDER BY marcado_en DESC LIMIT 1
       )
       WHERE a.tipo = 'entrada'
       ORDER BY a.hora_local ASC`,
      [hoy],
    );

    const serie = all(
      `SELECT fecha_local AS fecha,
              SUM(CASE WHEN tipo = 'entrada' THEN 1 ELSE 0 END) AS entradas,
              SUM(CASE WHEN tipo = 'salida'  THEN 1 ELSE 0 END) AS salidas
       FROM asistencia
       WHERE fecha_local BETWEEN ? AND ?
       GROUP BY fecha_local ORDER BY fecha_local ASC`,
      [desde, hoy],
    );

    // Se completan los dias sin marcaciones para que la grafica no tenga huecos.
    const porFecha = new Map(serie.map((r) => [r.fecha, r]));
    const serieCompleta = [];
    for (let i = dias - 1; i >= 0; i -= 1) {
      const fecha = shiftDate(hoy, -i);
      const fila = porFecha.get(fecha);
      serieCompleta.push({
        fecha,
        dia: dayName(fecha).slice(0, 3),
        entradas: fila?.entradas ?? 0,
        salidas: fila?.salidas ?? 0,
      });
    }

    const porArea = all(
      `SELECT COALESCE(NULLIF(area, ''), 'Sin area') AS area, COUNT(*) AS total
       FROM v_asistencia WHERE fecha_local BETWEEN ? AND ?
       GROUP BY area ORDER BY total DESC LIMIT 8`,
      [desde, hoy],
    );

    const porHora = all(
      `SELECT CAST(substr(hora_local, 1, 2) AS INTEGER) AS hora, COUNT(*) AS total
       FROM asistencia WHERE fecha_local BETWEEN ? AND ?
       GROUP BY hora ORDER BY hora ASC`,
      [desde, hoy],
    );

    const ultimas = all(
      'SELECT persona, documento, tipo, fecha_local, hora_local, area FROM v_asistencia ORDER BY marcado_en DESC LIMIT 8',
    );

    res.json({
      ok: true,
      hoy,
      diaNombre: dayName(hoy),
      indicadores: {
        personalActivo: activos,
        marcacionesHoy: delDia?.marcaciones ?? 0,
        entradasHoy: delDia?.entradas ?? 0,
        salidasHoy: delDia?.salidas ?? 0,
        personasHoy: delDia?.personas ?? 0,
        presentes: presentes.length,
        cobertura: activos ? Math.round(((delDia?.personas ?? 0) / activos) * 100) : 0,
      },
      serie: serieCompleta,
      porArea,
      porHora,
      presentes,
      ultimas,
    });
  }),
);

export default router;
