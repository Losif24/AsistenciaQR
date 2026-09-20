import { api, avisoError, avisoOk, cargando, descargar, escapar, hoyISO, ICONOS, montarArmazon, pastillaTipo, retrasar, sinDatos } from './core.js';

const { usuario, vista } = await montarArmazon({
  titulo: 'Reportes',
  subtitulo: 'Historico de marcaciones',
});

const puedeExportar = ['supervisor', 'admin'].includes(usuario.rol);

// Por defecto se muestra el mes corriente: es el recorte que casi siempre se pide.
const hoy = hoyISO();
const inicioMes = `${hoy.slice(0, 7)}-01`;

vista.innerHTML = `
  <div class="tarjeta">
    <div class="tarjeta-cabeza">
      <div class="fila crece">
        <div class="buscador" style="max-width:250px">${ICONOS.buscar}<input class="entrada" id="q" placeholder="Persona, documento u operador"></div>
        <div class="campo"><label for="desde" class="chico">Desde</label><input class="entrada" type="date" id="desde" value="${inicioMes}"></div>
        <div class="campo"><label for="hasta" class="chico">Hasta</label><input class="entrada" type="date" id="hasta" value="${hoy}"></div>
        <div class="campo"><label for="tipo" class="chico">Tipo</label>
          <select class="entrada" id="tipo"><option value="">Todos</option><option value="entrada">Entradas</option><option value="salida">Salidas</option></select>
        </div>
        <div class="campo"><label for="area" class="chico">Area</label>
          <select class="entrada" id="area"><option value="">Todas</option></select>
        </div>
      </div>
      <div class="fila">
        <button class="boton" id="btnLimpiar">Limpiar</button>
        ${puedeExportar ? `<button class="boton" id="btnCsv">${ICONOS.descargar}<span>CSV</span></button>` : ''}
        ${puedeExportar ? `<button class="boton boton-principal" id="btnExcel">${ICONOS.descargar}<span>Excel</span></button>` : ''}
      </div>
    </div>
    <div id="lista">${cargando()}</div>
    <div class="paginacion oculto" id="paginacion">
      <span id="resumen"></span>
      <div class="fila">
        <button class="boton boton-chico" id="anterior">Anterior</button>
        <span id="posicion" class="nowrap"></span>
        <button class="boton boton-chico" id="siguiente">Siguiente</button>
      </div>
    </div>
  </div>
`;

const lista = document.getElementById('lista');
const paginacion = document.getElementById('paginacion');
const campos = ['q', 'desde', 'hasta', 'tipo', 'area'].map((id) => document.getElementById(id));
let pagina = 1;

function parametros() {
  const p = new URLSearchParams();
  const [q, desde, hasta, tipo, area] = campos.map((c) => c.value.trim());
  if (q) p.set('q', q);
  if (desde) p.set('desde', desde);
  if (hasta) p.set('hasta', hasta);
  if (tipo) p.set('tipo', tipo);
  if (area) p.set('area', area);
  return p;
}

async function cargar() {
  lista.innerHTML = cargando();
  paginacion.classList.add('oculto');

  const p = parametros();
  p.set('pagina', pagina);
  p.set('porPagina', '50');

  let respuesta;
  try {
    respuesta = await api(`/reportes?${p}`);
  } catch (fallo) {
    lista.innerHTML = sinDatos(fallo.message);
    return;
  }

  const { datos, paginacion: pag, areas } = respuesta;

  const selectArea = document.getElementById('area');
  if (selectArea.options.length <= 1 && areas.length) {
    selectArea.innerHTML = '<option value="">Todas</option>' + areas.map((a) => `<option>${escapar(a)}</option>`).join('');
  }

  if (!datos.length) {
    lista.innerHTML = sinDatos('No hay marcaciones con esos filtros');
    return;
  }

  lista.innerHTML = `
    <div class="tabla-marco">
      <table class="tabla">
        <thead>
          <tr><th>Persona</th><th>Documento</th><th>Cargo</th><th>Area</th><th>Tipo</th><th>Fecha</th><th>Hora</th><th>Origen</th><th>Registrado por</th></tr>
        </thead>
        <tbody>
          ${datos
            .map(
              (r) => `<tr>
                <td><b>${escapar(r.persona)}</b></td>
                <td class="num">${escapar(r.documento)}</td>
                <td class="medio">${escapar(r.cargo)}</td>
                <td class="medio">${escapar(r.area)}</td>
                <td>${pastillaTipo(r.tipo.toLowerCase())}</td>
                <td class="num nowrap">${escapar(r.fecha)}</td>
                <td class="num nowrap">${escapar(r.hora)}</td>
                <td><span class="pastilla pastilla-neutra pastilla-sin-punto">${escapar(r.origen)}</span></td>
                <td class="tenue chico">${escapar(r.registrado_por)}</td>
              </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>`;

  paginacion.classList.remove('oculto');
  const primero = (pag.pagina - 1) * pag.porPagina + 1;
  const ultimo = Math.min(pag.pagina * pag.porPagina, pag.total);
  document.getElementById('resumen').textContent = `Mostrando ${primero}-${ultimo} de ${pag.total} marcaciones`;
  document.getElementById('posicion').textContent = `Pagina ${pag.pagina} de ${pag.paginas}`;
  document.getElementById('anterior').disabled = pag.pagina <= 1;
  document.getElementById('siguiente').disabled = pag.pagina >= pag.paginas;
}

const recargarDesdeCero = () => { pagina = 1; return cargar(); };

campos[0].addEventListener('input', retrasar(recargarDesdeCero));
campos.slice(1).forEach((c) => c.addEventListener('change', recargarDesdeCero));

document.getElementById('anterior').addEventListener('click', () => { pagina -= 1; cargar(); });
document.getElementById('siguiente').addEventListener('click', () => { pagina += 1; cargar(); });

document.getElementById('btnLimpiar').addEventListener('click', () => {
  campos.forEach((c) => { c.value = ''; });
  recargarDesdeCero();
});

if (puedeExportar) {
  const exportar = async (formato, boton) => {
    boton.disabled = true;
    try {
      await descargar(`/reportes/${formato}?${parametros()}`, `asistencia.${formato === 'excel' ? 'xlsx' : 'csv'}`);
      avisoOk('Archivo descargado.');
    } catch (fallo) {
      avisoError(fallo.message);
    } finally {
      boton.disabled = false;
    }
  };

  const btnExcel = document.getElementById('btnExcel');
  const btnCsv = document.getElementById('btnCsv');
  btnExcel.addEventListener('click', () => exportar('excel', btnExcel));
  btnCsv.addEventListener('click', () => exportar('csv', btnCsv));
}

await cargar();
