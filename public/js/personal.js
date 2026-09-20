import { api, avisoError, avisoOk, cargando, escapar, ICONOS, montarArmazon, retrasar, sinDatos } from './core.js';

const { usuario, organizacion, vista } = await montarArmazon({
  titulo: 'Personal',
  subtitulo: 'Personas con control de asistencia',
  acciones: `<button class="boton boton-principal" id="btnNuevo">${ICONOS.mas}<span>Agregar persona</span></button>`,
});

const puedeEditar = ['supervisor', 'admin'].includes(usuario.rol);
if (!puedeEditar) document.getElementById('btnNuevo').classList.add('oculto');

vista.innerHTML = `
  <div class="tarjeta">
    <div class="tarjeta-cabeza">
      <div class="fila crece">
        <div class="buscador">${ICONOS.buscar}<input class="entrada" id="busqueda" placeholder="Buscar por nombre, documento o cargo"></div>
        <select class="entrada" id="area" style="width:auto"><option value="">Todas las areas</option></select>
        <select class="entrada" id="estado" style="width:auto">
          <option value="1">Solo activos</option>
          <option value="0">Activos e inactivos</option>
        </select>
      </div>
      <span class="tenue chico nowrap" id="conteo"></span>
    </div>
    <div id="lista">${cargando()}</div>
  </div>

  <div class="modal-fondo" id="modalPersona">
    <div class="modal">
      <div class="modal-cabeza"><h3 id="modalTitulo">Agregar persona</h3><button class="cerrar" data-cerrar>&times;</button></div>
      <form id="formPersona">
        <div class="modal-cuerpo">
          <div class="campo"><label for="nombre">Nombre completo</label><input id="nombre" required maxlength="120"></div>
          <div class="campo"><label for="doc">Documento de identidad</label><input id="doc" required maxlength="30" autocomplete="off"></div>
          <div class="rejilla rejilla-2">
            <div class="campo"><label for="cargo">Cargo</label><input id="cargo" maxlength="80" placeholder="Opcional"></div>
            <div class="campo"><label for="areaCampo">Area</label><input id="areaCampo" maxlength="80" placeholder="Opcional" list="areasSugeridas"></div>
          </div>
          <datalist id="areasSugeridas"></datalist>
          <div class="error" id="errorPersona"></div>
        </div>
        <div class="modal-pie">
          <button type="button" class="boton" data-cerrar>Cancelar</button>
          <button type="submit" class="boton boton-principal" id="guardar">Guardar</button>
        </div>
      </form>
    </div>
  </div>

  <div class="modal-fondo" id="modalQr">
    <div class="modal modal-centrado">
      <div class="modal-cabeza"><h3>Codigo QR</h3><button class="cerrar" data-cerrar>&times;</button></div>
      <div class="modal-cuerpo centro" id="cuerpoQr"></div>
      <div class="modal-pie">
        <button type="button" class="boton" data-cerrar>Cerrar</button>
        <button type="button" class="boton boton-principal" id="imprimirQr">${ICONOS.imprimir}<span>Imprimir</span></button>
      </div>
    </div>
  </div>
`;

const lista = document.getElementById('lista');
const conteo = document.getElementById('conteo');
const busqueda = document.getElementById('busqueda');
const filtroArea = document.getElementById('area');
const filtroEstado = document.getElementById('estado');

/* ---------------------------------------------------------------- Modales */

const abrir = (id) => document.getElementById(id).classList.add('abierto');
const cerrar = (id) => document.getElementById(id).classList.remove('abierto');

document.querySelectorAll('[data-cerrar]').forEach((boton) => {
  boton.addEventListener('click', () => boton.closest('.modal-fondo').classList.remove('abierto'));
});

document.querySelectorAll('.modal-fondo').forEach((fondo) => {
  fondo.addEventListener('click', (evento) => {
    if (evento.target === fondo) fondo.classList.remove('abierto');
  });
});

document.addEventListener('keydown', (evento) => {
  if (evento.key === 'Escape') document.querySelectorAll('.modal-fondo.abierto').forEach((f) => f.classList.remove('abierto'));
});

/* ---------------------------------------------------------------- Listado */

async function cargar() {
  lista.innerHTML = cargando();

  const parametros = new URLSearchParams();
  if (busqueda.value.trim()) parametros.set('q', busqueda.value.trim());
  if (filtroArea.value) parametros.set('area', filtroArea.value);
  if (filtroEstado.value === '0') parametros.set('activos', '0');

  let respuesta;
  try {
    respuesta = await api(`/personal?${parametros}`);
  } catch (fallo) {
    lista.innerHTML = sinDatos(fallo.message);
    return;
  }

  const { datos, areas, total } = respuesta;
  conteo.textContent = `${total} persona${total === 1 ? '' : 's'}`;

  // El desplegable de areas se rellena una sola vez y conserva lo elegido.
  if (filtroArea.options.length <= 1 && areas.length) {
    filtroArea.innerHTML =
      '<option value="">Todas las areas</option>' + areas.map((a) => `<option>${escapar(a)}</option>`).join('');
  }
  document.getElementById('areasSugeridas').innerHTML = areas.map((a) => `<option value="${escapar(a)}">`).join('');

  if (!datos.length) {
    lista.innerHTML = sinDatos(busqueda.value ? 'Ninguna persona coincide con la busqueda' : 'Aun no hay personal registrado');
    return;
  }

  lista.innerHTML = `
    <div class="tabla-marco">
      <table class="tabla">
        <thead>
          <tr>
            <th>Persona</th><th>Documento</th><th>Cargo</th><th>Area</th>
            <th>Ultima marca</th><th>Estado</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${datos
            .map((p) => {
              const ultima = p.ultimo_en
                ? `${p.ultimo_tipo === 'entrada' ? 'Entrada' : 'Salida'} · ${new Date(p.ultimo_en).toLocaleDateString('es-CO')}`
                : 'Sin marcas';
              return `
              <tr>
                <td><b>${escapar(p.nombre)}</b></td>
                <td class="num">${escapar(p.documento)}</td>
                <td class="medio">${escapar(p.cargo || '-')}</td>
                <td class="medio">${escapar(p.area || '-')}</td>
                <td class="tenue chico nowrap">${escapar(ultima)}</td>
                <td>${p.activo ? '<span class="pastilla pastilla-entrada">Activo</span>' : '<span class="pastilla pastilla-neutra">Inactivo</span>'}</td>
                <td class="nowrap" style="text-align:right">
                  <button class="boton boton-chico" data-qr="${p.id}">${ICONOS.qr}<span>QR</span></button>
                  ${puedeEditar ? `<button class="boton boton-chico" data-editar="${p.id}">Editar</button>` : ''}
                </td>
              </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </div>`;

  lista.querySelectorAll('[data-qr]').forEach((b) => b.addEventListener('click', () => verQr(b.dataset.qr)));
  lista.querySelectorAll('[data-editar]').forEach((b) =>
    b.addEventListener('click', () => editar(datos.find((p) => String(p.id) === b.dataset.editar))),
  );
}

busqueda.addEventListener('input', retrasar(cargar));
filtroArea.addEventListener('change', cargar);
filtroEstado.addEventListener('change', cargar);

/* -------------------------------------------------------------------- QR */

async function verQr(id) {
  const cuerpo = document.getElementById('cuerpoQr');
  cuerpo.innerHTML = cargando('Generando codigo...');
  abrir('modalQr');

  try {
    const { datos } = await api(`/personal/${id}/qr`);
    cuerpo.innerHTML = `
      <div class="qr-caja"><img src="${datos.qr}" alt="Codigo QR de ${escapar(datos.nombre)}"></div>
      <div style="margin-top:14px;font-weight:650">${escapar(datos.nombre)}</div>
      <div class="tenue chico">${escapar(datos.documento)}</div>`;

    document.getElementById('imprimirQr').onclick = () => imprimirCarne(datos);
  } catch (fallo) {
    cuerpo.innerHTML = sinDatos(fallo.message);
  }
}

/** Abre una ventana con el carne listo para imprimir o guardar en PDF. */
function imprimirCarne(datos) {
  const ventana = window.open('', '_blank', 'width=460,height=640');
  if (!ventana) {
    avisoError('El navegador bloqueo la ventana de impresion.');
    return;
  }

  ventana.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
    <title>Carne ${escapar(datos.nombre)}</title>
    <style>
      body{font-family:Arial,Helvetica,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh}
      .carne{width:300px;border:1px solid #333;border-radius:12px;padding:22px;text-align:center}
      .org{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#666}
      img{width:210px;height:210px;margin:16px 0}
      .nombre{font-size:16px;font-weight:bold}
      .doc{font-size:13px;color:#555;margin-top:2px}
      @media print{body{min-height:auto}}
    </style></head><body onload="window.print()">
    <div class="carne">
      <div class="org">${escapar(organizacion)}</div>
      <img src="${datos.qr}" alt="Codigo QR">
      <div class="nombre">${escapar(datos.nombre)}</div>
      <div class="doc">${escapar(datos.documento)}</div>
    </div></body></html>`);
  ventana.document.close();
}

/* -------------------------------------------------------------- Formulario */

let editando = null;
const formulario = document.getElementById('formPersona');
const errorPersona = document.getElementById('errorPersona');

document.getElementById('btnNuevo').addEventListener('click', () => {
  editando = null;
  formulario.reset();
  errorPersona.textContent = '';
  document.getElementById('modalTitulo').textContent = 'Agregar persona';
  document.getElementById('doc').disabled = false;
  abrir('modalPersona');
  document.getElementById('nombre').focus();
});

function editar(persona) {
  editando = persona;
  errorPersona.textContent = '';
  document.getElementById('modalTitulo').textContent = 'Editar persona';
  document.getElementById('nombre').value = persona.nombre;
  document.getElementById('doc').value = persona.documento;
  // El documento identifica a la persona: se muestra pero no se cambia.
  document.getElementById('doc').disabled = true;
  document.getElementById('cargo').value = persona.cargo || '';
  document.getElementById('areaCampo').value = persona.area || '';
  abrir('modalPersona');
}

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  errorPersona.textContent = '';

  const guardar = document.getElementById('guardar');
  guardar.disabled = true;

  const cuerpo = {
    nombre: document.getElementById('nombre').value,
    cargo: document.getElementById('cargo').value,
    area: document.getElementById('areaCampo').value,
  };

  try {
    if (editando) {
      await api(`/personal/${editando.id}`, { metodo: 'PATCH', datos: cuerpo });
      avisoOk('Datos actualizados.');
    } else {
      await api('/personal', { metodo: 'POST', datos: { ...cuerpo, documento: document.getElementById('doc').value } });
      avisoOk('Persona registrada con su codigo QR.');
    }
    cerrar('modalPersona');
    await cargar();
  } catch (fallo) {
    errorPersona.textContent = fallo.message;
  } finally {
    guardar.disabled = false;
  }
});

await cargar();
