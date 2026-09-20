/* Graficas en SVG puro. Sin libreria externa: menos peso y nada que actualizar. */

import { escapar } from './core.js';

const ALTO = 190;
const MARGEN = { arriba: 12, derecha: 8, abajo: 26, izquierda: 30 };

/** Escala "bonita" para el eje: topes en 1, 2 o 5 por decada. */
function techo(valor) {
  if (valor <= 4) return 4;
  const magnitud = 10 ** Math.floor(Math.log10(valor));
  const normal = valor / magnitud;
  const paso = normal <= 1 ? 1 : normal <= 2 ? 2 : normal <= 5 ? 5 : 10;
  return paso * magnitud;
}

/**
 * Barras agrupadas de entradas y salidas por dia.
 * El ancho se toma del contenedor para que la grafica sea adaptable.
 */
export function barrasPorDia(serie, ancho = 720) {
  if (!serie?.length) return '<div class="vacio">Sin marcaciones en el periodo</div>';

  const maximo = techo(Math.max(1, ...serie.flatMap((d) => [d.entradas, d.salidas])));
  const areaAncho = ancho - MARGEN.izquierda - MARGEN.derecha;
  const areaAlto = ALTO - MARGEN.arriba - MARGEN.abajo;
  const paso = areaAncho / serie.length;
  const anchoBarra = Math.max(3, Math.min(13, paso / 2.9));
  const y = (v) => MARGEN.arriba + areaAlto - (v / maximo) * areaAlto;

  const lineas = [0, 0.25, 0.5, 0.75, 1]
    .map((f) => {
      const py = MARGEN.arriba + areaAlto * (1 - f);
      return `<line class="rejilla-linea" x1="${MARGEN.izquierda}" y1="${py}" x2="${ancho - MARGEN.derecha}" y2="${py}"/>
              <text x="${MARGEN.izquierda - 7}" y="${py + 3.5}" text-anchor="end">${Math.round(maximo * f)}</text>`;
    })
    .join('');

  const barras = serie
    .map((d, i) => {
      const centro = MARGEN.izquierda + paso * i + paso / 2;
      const ent = `<rect class="barra-entrada" x="${centro - anchoBarra - 1.5}" y="${y(d.entradas)}" width="${anchoBarra}" height="${Math.max(0, MARGEN.arriba + areaAlto - y(d.entradas))}" rx="2"><title>${escapar(d.fecha)}: ${d.entradas} entradas</title></rect>`;
      const sal = `<rect class="barra-salida" x="${centro + 1.5}" y="${y(d.salidas)}" width="${anchoBarra}" height="${Math.max(0, MARGEN.arriba + areaAlto - y(d.salidas))}" rx="2"><title>${escapar(d.fecha)}: ${d.salidas} salidas</title></rect>`;
      // Con muchos dias se rotulan solo algunos para que no se encimen.
      const cada = Math.ceil(serie.length / 12);
      const etiqueta = i % cada === 0
        ? `<text x="${centro}" y="${ALTO - 9}" text-anchor="middle">${escapar(d.fecha.slice(8))}</text>`
        : '';
      return ent + sal + etiqueta;
    })
    .join('');

  return `<svg class="grafica" viewBox="0 0 ${ancho} ${ALTO}" preserveAspectRatio="none" role="img"
            aria-label="Entradas y salidas por dia">${lineas}${barras}</svg>`;
}

/** Distribucion horaria: una sola serie, util para ver los picos de entrada. */
export function barrasPorHora(datos, ancho = 720) {
  if (!datos?.length) return '<div class="vacio">Sin datos de horario</div>';

  const porHora = new Map(datos.map((d) => [d.hora, d.total]));
  const serie = Array.from({ length: 24 }, (_, h) => ({ hora: h, total: porHora.get(h) || 0 }));
  const maximo = techo(Math.max(1, ...serie.map((d) => d.total)));

  const areaAncho = ancho - MARGEN.izquierda - MARGEN.derecha;
  const areaAlto = ALTO - MARGEN.arriba - MARGEN.abajo;
  const paso = areaAncho / 24;
  const y = (v) => MARGEN.arriba + areaAlto - (v / maximo) * areaAlto;

  const lineas = [0, 0.5, 1]
    .map((f) => {
      const py = MARGEN.arriba + areaAlto * (1 - f);
      return `<line class="rejilla-linea" x1="${MARGEN.izquierda}" y1="${py}" x2="${ancho - MARGEN.derecha}" y2="${py}"/>
              <text x="${MARGEN.izquierda - 7}" y="${py + 3.5}" text-anchor="end">${Math.round(maximo * f)}</text>`;
    })
    .join('');

  const barras = serie
    .map((d, i) => {
      const x = MARGEN.izquierda + paso * i + paso * 0.18;
      const w = paso * 0.64;
      const alto = Math.max(0, MARGEN.arriba + areaAlto - y(d.total));
      const etiqueta = i % 3 === 0 ? `<text x="${x + w / 2}" y="${ALTO - 9}" text-anchor="middle">${String(i).padStart(2, '0')}</text>` : '';
      return `<rect class="barra-salida" x="${x}" y="${y(d.total)}" width="${w}" height="${alto}" rx="2" opacity="${d.total ? 1 : 0.18}"><title>${String(i).padStart(2, '0')}:00 - ${d.total} marcaciones</title></rect>${etiqueta}`;
    })
    .join('');

  return `<svg class="grafica" viewBox="0 0 ${ancho} ${ALTO}" preserveAspectRatio="none" role="img"
            aria-label="Marcaciones por hora del dia">${lineas}${barras}</svg>`;
}

/** Ranking horizontal. Se prefiere a un circular: se compara mejor. */
export function barrasRanking(filas, { etiqueta = 'area', valor = 'total' } = {}) {
  if (!filas?.length) return '<div class="vacio">Sin datos</div>';

  const maximo = Math.max(...filas.map((f) => f[valor]), 1);
  const cuerpo = filas
    .map(
      (f) => `
      <div class="barra-fila">
        <span class="nombre">${escapar(f[etiqueta])}</span>
        <span class="valor">${f[valor]}</span>
        <span class="barra-pista"><span class="barra-relleno" style="width:${(f[valor] / maximo) * 100}%"></span></span>
      </div>`,
    )
    .join('');

  return `<div class="barra-lista">${cuerpo}</div>`;
}

export const leyendaEntradaSalida = `
  <div class="leyenda">
    <span><i style="background:var(--verde)"></i>Entradas</span>
    <span><i style="background:var(--acento)"></i>Salidas</span>
  </div>`;
