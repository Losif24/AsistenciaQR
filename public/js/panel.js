import { api, avisoError, cargando, escapar, ICONOS, montarArmazon, pastillaTipo, sinDatos } from './core.js';
import { barrasPorDia, barrasPorHora, barrasRanking, leyendaEntradaSalida } from './graficas.js';

const acciones = `
  <select class="entrada" id="rango" style="width:auto">
    <option value="7">Ultimos 7 dias</option>
    <option value="14" selected>Ultimos 14 dias</option>
    <option value="30">Ultimos 30 dias</option>
    <option value="90">Ultimos 90 dias</option>
  </select>
`;

const { vista } = await montarArmazon({
  titulo: 'Panel',
  subtitulo: 'Resumen de la operacion',
  acciones,
});

const indicador = (nombre, valor, nota, clase = '') => `
  <div class="indicador ${clase}">
    <div class="indicador-nombre">${escapar(nombre)}</div>
    <div class="indicador-valor">${valor}</div>
    <div class="indicador-nota">${escapar(nota)}</div>
  </div>`;

async function pintar(dias) {
  vista.innerHTML = cargando('Cargando indicadores...');

  let datos;
  try {
    datos = await api(`/panel/resumen?dias=${dias}`);
  } catch (fallo) {
    vista.innerHTML = sinDatos(fallo.message);
    avisoError(fallo.message);
    return;
  }

  const { indicadores: i, serie, porArea, porHora, presentes, ultimas, diaNombre, hoy } = datos;

  const filasUltimas = ultimas.length
    ? ultimas
        .map(
          (r) => `
        <tr>
          <td>${escapar(r.persona)}</td>
          <td class="tenue chico">${escapar(r.area || '-')}</td>
          <td>${pastillaTipo(r.tipo)}</td>
          <td class="num nowrap">${escapar(r.hora_local)}</td>
        </tr>`,
        )
        .join('')
    : `<tr><td colspan="4">${sinDatos('Todavia no hay marcaciones')}</td></tr>`;

  const filasPresentes = presentes.length
    ? presentes
        .map(
          (p) => `
        <tr>
          <td>${escapar(p.nombre)}</td>
          <td class="tenue chico">${escapar(p.cargo || '-')}</td>
          <td class="num nowrap">${escapar(p.hora_local)}</td>
        </tr>`,
        )
        .join('')
    : `<tr><td colspan="3">${sinDatos('Nadie ha marcado entrada hoy')}</td></tr>`;

  vista.innerHTML = `
    <div class="rejilla rejilla-4">
      ${indicador('Personal activo', i.personalActivo, 'registrados en el sistema')}
      ${indicador('Marcaron hoy', i.personasHoy, `${i.cobertura}% del personal`, 'azul')}
      ${indicador('Presentes ahora', i.presentes, 'su ultima marca fue entrada', 'verde')}
      ${indicador('Marcaciones hoy', i.marcacionesHoy, `${i.entradasHoy} entradas · ${i.salidasHoy} salidas`, 'rojo')}
    </div>

    <div class="rejilla rejilla-2-1 mt-16">
      <div class="tarjeta">
        <div class="tarjeta-cabeza">
          <div><h3>Entradas y salidas por dia</h3><p>Ultimos ${dias} dias</p></div>
          ${leyendaEntradaSalida}
        </div>
        <div class="tarjeta-cuerpo">${barrasPorDia(serie)}</div>
      </div>

      <div class="tarjeta">
        <div class="tarjeta-cabeza"><div><h3>Marcaciones por area</h3><p>Acumulado del periodo</p></div></div>
        <div class="tarjeta-cuerpo">${barrasRanking(porArea)}</div>
      </div>
    </div>

    <div class="rejilla rejilla-2 mt-16">
      <div class="tarjeta">
        <div class="tarjeta-cabeza"><div><h3>Distribucion por hora</h3><p>A que horas se concentra el movimiento</p></div></div>
        <div class="tarjeta-cuerpo">${barrasPorHora(porHora)}</div>
      </div>

      <div class="tarjeta">
        <div class="tarjeta-cabeza">
          <div><h3>Ultimas marcaciones</h3><p>En tiempo real</p></div>
          <a href="/reportes" class="boton boton-chico">${ICONOS.reporte}<span>Ver todo</span></a>
        </div>
        <div class="tabla-marco">
          <table class="tabla">
            <thead><tr><th>Persona</th><th>Area</th><th>Tipo</th><th>Hora</th></tr></thead>
            <tbody>${filasUltimas}</tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="tarjeta mt-16">
      <div class="tarjeta-cabeza">
        <div><h3>Dentro de la sede</h3><p>${escapar(diaNombre)} ${escapar(hoy)} · ${presentes.length} persona${presentes.length === 1 ? '' : 's'}</p></div>
      </div>
      <div class="tabla-marco">
        <table class="tabla">
          <thead><tr><th>Persona</th><th>Cargo</th><th>Entrada</th></tr></thead>
          <tbody>${filasPresentes}</tbody>
        </table>
      </div>
    </div>
  `;
}

const rango = document.getElementById('rango');
rango.addEventListener('change', () => pintar(rango.value));

await pintar(rango.value);

// El panel se refresca solo: sirve como tablero de pared en recepcion.
setInterval(() => pintar(rango.value), 60000);
