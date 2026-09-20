import { Router } from 'express';
import writeXlsxFile from 'write-excel-file/node';
import { config } from '../config.js';
import { all, get } from '../db/index.js';
import { formatDisplay, localDate } from '../lib/time.js';
import { entero, fechaISO, opcion, texto } from '../lib/validate.js';
import { asyncHandler } from '../middleware/errors.js';
import { auditar, requireRole } from '../middleware/auth.js';

const router = Router();

/** Traduce los filtros de la interfaz a un WHERE con parametros enlazados. */
function construirFiltros(query) {
  const desde = fechaISO(query.desde, 'desde');
  const hasta = fechaISO(query.hasta, 'hasta');
  const busqueda = texto(query.q, 'q', { requerido: false, max: 60 });
  const tipo = query.tipo ? opcion(query.tipo, ['entrada', 'salida'], 'tipo') : null;
  const area = texto(query.area, 'area', { requerido: false, max: 80 });

  const where = [];
  const params = [];

  if (desde) { where.push('fecha_local >= ?'); params.push(desde); }
  if (hasta) { where.push('fecha_local <= ?'); params.push(hasta); }
  if (tipo) { where.push('tipo = ?'); params.push(tipo); }
  if (area) { where.push('area = ?'); params.push(area); }
  if (busqueda) {
    where.push('(persona LIKE ? OR documento LIKE ? OR registrado_por LIKE ?)');
    params.push(`%${busqueda}%`, `%${busqueda}%`, `%${busqueda}%`);
  }

  return {
    clause: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
    resumen: { desde, hasta, tipo, area, busqueda },
  };
}

const COLUMNAS = [
  { header: 'Persona', key: 'persona', width: 34 },
  { header: 'Documento', key: 'documento', width: 16 },
  { header: 'Cargo', key: 'cargo', width: 22 },
  { header: 'Area', key: 'area', width: 22 },
  { header: 'Tipo', key: 'tipo', width: 12 },
  { header: 'Fecha', key: 'fecha', width: 14 },
  { header: 'Hora', key: 'hora', width: 12 },
  { header: 'Origen', key: 'origen', width: 10 },
  { header: 'Registrado por', key: 'registrado_por', width: 18 },
];

const aFila = (r) => ({
  persona: r.persona,
  documento: r.documento,
  cargo: r.cargo || '-',
  area: r.area || '-',
  tipo: r.tipo === 'entrada' ? 'Entrada' : 'Salida',
  fecha: formatDisplay(r.fecha_local),
  hora: r.hora_local,
  origen: r.origen === 'qr' ? 'QR' : 'Manual',
  registrado_por: r.registrado_por,
});

/** Listado paginado. La paginacion evita traer anos de historico de golpe. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { clause, params, resumen } = construirFiltros(req.query);
    const pagina = entero(req.query.pagina, 'pagina', { min: 1, max: 100000, defecto: 1 });
    const porPagina = entero(req.query.porPagina, 'porPagina', { min: 10, max: 500, defecto: 50 });

    const total = get(`SELECT COUNT(*) AS c FROM v_asistencia ${clause}`, params)?.c ?? 0;
    const filas = all(
      `SELECT * FROM v_asistencia ${clause} ORDER BY fecha_local DESC, hora_local DESC LIMIT ? OFFSET ?`,
      [...params, porPagina, (pagina - 1) * porPagina],
    );

    const areas = all(
      "SELECT DISTINCT area FROM v_asistencia WHERE area IS NOT NULL AND area <> '' ORDER BY area",
    ).map((r) => r.area);

    res.json({
      ok: true,
      filtros: resumen,
      paginacion: { pagina, porPagina, total, paginas: Math.max(1, Math.ceil(total / porPagina)) },
      areas,
      datos: filas.map(aFila),
    });
  }),
);

const CABECERA = { backgroundColor: '#111318', color: '#FFFFFF', fontWeight: 'bold', align: 'left' };
// En el Excel la entrada va en negrita y la salida en gris: el archivo
// tambien se imprime en blanco y negro.
const ENTRADA = '#111318';
const SALIDA = '#6F7681';

router.get(
  '/excel',
  requireRole('supervisor'),
  asyncHandler(async (req, res) => {
    const { clause, params, resumen } = construirFiltros(req.query);
    const filas = all(`SELECT * FROM v_asistencia ${clause} ORDER BY fecha_local DESC, hora_local DESC`, params);

    const periodo = resumen.desde || resumen.hasta
      ? `Periodo: ${resumen.desde ? formatDisplay(resumen.desde) : 'inicio'} a ${resumen.hasta ? formatDisplay(resumen.hasta) : 'hoy'}`
      : 'Periodo: historico completo';

    const hoja = [
      [{ value: `${config.orgName} - Reporte de asistencia`, fontWeight: 'bold', fontSize: 15, span: COLUMNAS.length, align: 'left' }],
      [{ value: `${periodo}   |   Registros: ${filas.length}   |   Generado: ${formatDisplay(localDate())}`, fontSize: 10, color: '#666666', span: COLUMNAS.length, align: 'left' }],
      [{ value: null, height: 6 }],
      COLUMNAS.map((c) => ({ ...CABECERA, value: c.header })),
    ];

    for (const r of filas) {
      const fila = aFila(r);
      hoja.push(
        COLUMNAS.map((c) =>
          c.key === 'tipo'
            ? { value: fila.tipo, fontWeight: 'bold', color: r.tipo === 'entrada' ? ENTRADA : SALIDA }
            : { value: fila[c.key], type: String },
        ),
      );
    }

    auditar(req, 'reporte_excel', { total: filas.length, ...resumen });

    const libro = await writeXlsxFile(hoja, {
      buffer: true,
      sheet: 'Asistencia',
      columns: COLUMNAS.map((c) => ({ width: c.width })),
      stickyRowsCount: 4,
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="asistencia-${localDate()}.xlsx"`);
    res.send(await libro.toBuffer());
  }),
);

router.get(
  '/csv',
  requireRole('supervisor'),
  asyncHandler(async (req, res) => {
    const { clause, params, resumen } = construirFiltros(req.query);
    const filas = all(`SELECT * FROM v_asistencia ${clause} ORDER BY fecha_local DESC, hora_local DESC`, params);

    const escapar = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lineas = [COLUMNAS.map((c) => escapar(c.header)).join(';')];
    for (const r of filas) {
      const fila = aFila(r);
      lineas.push(COLUMNAS.map((c) => escapar(fila[c.key])).join(';'));
    }

    auditar(req, 'reporte_csv', { total: filas.length, ...resumen });

    // El prefijo BOM hace que Excel abra el CSV con los acentos correctos.
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="asistencia-${localDate()}.csv"`);
    res.send(`\uFEFF${lineas.join('\r\n')}\r\n`);
  }),
);

export default router;
