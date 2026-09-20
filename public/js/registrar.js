import { api, avisoError, avisoOk, escapar, ICONOS, montarArmazon, pastillaTipo, sinDatos } from './core.js';

const { vista } = await montarArmazon({
  titulo: 'Registrar asistencia',
  subtitulo: 'Escanee el codigo o digite el documento',
});

vista.innerHTML = `
  <div class="rejilla rejilla-2-1">
    <div class="tarjeta">
      <div class="tarjeta-cabeza">
        <div><h3>Lector de codigo QR</h3><p>Apunte la camara al carne de la persona</p></div>
        <div class="fila">
          <select class="entrada" id="modo" style="width:auto">
            <option value="auto">Alternar automatico</option>
            <option value="entrada">Solo entradas</option>
            <option value="salida">Solo salidas</option>
          </select>
          <button class="boton boton-principal" id="btnCamara">${ICONOS.camara}<span>Encender camara</span></button>
        </div>
      </div>
      <div class="tarjeta-cuerpo">
        <div class="escaner-marco" id="marco">
          <div class="escaner-reposo" id="reposo">
            ${ICONOS.camara}
            <div>La camara esta apagada</div>
            <div class="chico" style="margin-top:6px">Pulse <b>Encender camara</b> para comenzar</div>
          </div>
          <div id="lector" class="oculto"></div>
        </div>

        <div class="mt-24" id="resultado"></div>

        <div class="tarjeta mt-16">
          <div class="tarjeta-cabeza"><div><h3>Registro manual</h3><p>Cuando el codigo no se puede leer</p></div></div>
          <div class="tarjeta-cuerpo">
            <form class="fila" id="formManual">
              <div class="buscador crece">
                ${ICONOS.buscar}
                <input class="entrada" id="documento" placeholder="Numero de documento" autocomplete="off">
              </div>
              <button class="boton" type="submit" id="btnManual">Registrar</button>
            </form>
            <div class="error chico" id="errorManual"></div>
          </div>
        </div>
      </div>
    </div>

    <div class="tarjeta">
      <div class="tarjeta-cabeza"><div><h3>Ultimas marcaciones</h3><p>Se actualiza sola</p></div></div>
      <div class="tabla-marco" id="recientes">${sinDatos('Sin marcaciones aun')}</div>
    </div>
  </div>
`;

const marco = document.getElementById('marco');
const reposo = document.getElementById('reposo');
const lector = document.getElementById('lector');
const btnCamara = document.getElementById('btnCamara');
const modo = document.getElementById('modo');
const resultado = document.getElementById('resultado');

let escaner = null;
let encendida = false;
let ocupado = false;

/* ---------------------------------------------------------------- Sonido */

let audio;
/** Pitido corto generado en el navegador: no hace falta ningun archivo. */
function pitar(exito = true) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audio.createOscillator();
    const vol = audio.createGain();
    osc.connect(vol);
    vol.connect(audio.destination);
    osc.frequency.value = exito ? 880 : 240;
    osc.type = 'sine';
    vol.gain.setValueAtTime(0.16, audio.currentTime);
    vol.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.2);
    osc.start();
    osc.stop(audio.currentTime + 0.2);
  } catch {
    // Sin audio disponible se sigue igual: el aviso visual ya informa.
  }
  if (navigator.vibrate) navigator.vibrate(exito ? [60] : [40, 50, 40]);
}

/* -------------------------------------------------------------- Registro */

function mostrar(datos, repetido) {
  resultado.innerHTML = `
    <div class="resultado ${repetido ? '' : datos.tipo}">
      ${pastillaTipo(datos.tipo)}
      <div class="resultado-nombre">${escapar(datos.nombre)}</div>
      <div class="resultado-dato">${escapar(datos.documento || '')}${datos.cargo ? ` · ${escapar(datos.cargo)}` : ''}</div>
      <div class="resultado-hora">${escapar(datos.hora)}</div>
      ${repetido ? '<div class="resultado-dato" style="margin-top:8px">Ya estaba registrado</div>' : ''}
    </div>`;

  clearTimeout(mostrar.id);
  mostrar.id = setTimeout(() => { resultado.innerHTML = ''; }, 9000);
}

async function marcar(cuerpo) {
  if (ocupado) return;
  ocupado = true;

  try {
    const tipo = modo.value === 'auto' ? undefined : modo.value;
    const respuesta = await api('/asistencia', { metodo: 'POST', datos: { ...cuerpo, tipo } });

    pitar(true);
    mostrar(respuesta.datos, respuesta.repetido);
    if (respuesta.repetido) avisoOk(respuesta.mensaje, 'Ya registrado');
    else avisoOk(respuesta.mensaje, 'Listo');

    await refrescarRecientes();
  } catch (fallo) {
    pitar(false);
    avisoError(fallo.message);
  } finally {
    // Pausa breve para no registrar dos veces la misma lectura de camara.
    setTimeout(() => { ocupado = false; }, 1200);
  }
}

/* ---------------------------------------------------------------- Camara */

/** html5-qrcode se publica como script global, no como modulo. */
function cargarLibreria() {
  if (window.Html5Qrcode) return Promise.resolve();
  return new Promise((resolver, rechazar) => {
    const etiqueta = document.createElement('script');
    etiqueta.src = '/vendor/html5-qrcode.min.js';
    etiqueta.onload = resolver;
    etiqueta.onerror = () => rechazar(new Error('No se pudo cargar el lector de codigos.'));
    document.head.appendChild(etiqueta);
  });
}

async function encender() {
  btnCamara.disabled = true;

  try {
    await cargarLibreria();

    escaner = escaner || new window.Html5Qrcode('lector', { verbose: false });
    reposo.classList.add('oculto');
    lector.classList.remove('oculto');

    await escaner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.333 },
      (texto) => marcar({ codigo: texto }),
      () => {},
    );

    encendida = true;
    btnCamara.innerHTML = `${ICONOS.camara}<span>Apagar camara</span>`;
    btnCamara.classList.remove('boton-principal');
  } catch (fallo) {
    reposo.classList.remove('oculto');
    lector.classList.add('oculto');
    const mensaje = String(fallo?.message || fallo);
    avisoError(
      mensaje.includes('Permission') || mensaje.includes('NotAllowed')
        ? 'El navegador no dio permiso para usar la camara. Use el registro manual o habilite el permiso.'
        : mensaje,
      'Camara no disponible',
    );
  } finally {
    btnCamara.disabled = false;
  }
}

async function apagar() {
  try {
    await escaner?.stop();
  } catch {
    // Si ya estaba detenida no hay nada que hacer.
  }
  encendida = false;
  lector.classList.add('oculto');
  reposo.classList.remove('oculto');
  btnCamara.innerHTML = `${ICONOS.camara}<span>Encender camara</span>`;
  btnCamara.classList.add('boton-principal');
}

btnCamara.addEventListener('click', () => (encendida ? apagar() : encender()));
window.addEventListener('beforeunload', () => { if (encendida) escaner?.stop().catch(() => {}); });

// La camara consume bateria: se apaga sola si la pestana pasa a segundo plano.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && encendida) apagar();
});

/* ---------------------------------------------------------------- Manual */

const documento = document.getElementById('documento');
const errorManual = document.getElementById('errorManual');

async function enviarManual() {
  errorManual.textContent = '';

  const valor = documento.value.trim();
  if (!valor) {
    errorManual.textContent = 'Escriba el numero de documento.';
    return;
  }

  await marcar({ documento: valor });
  documento.value = '';
  documento.focus();
}

document.getElementById('formManual').addEventListener('submit', (evento) => {
  evento.preventDefault();
  enviarManual();
});

// Un lector de mano escribe el codigo y manda Enter (a veces Tab). No se
// confia en el envio implicito del formulario: se atiende la tecla aqui.
documento.addEventListener('keydown', (evento) => {
  if (evento.key === 'Enter' || evento.key === 'Tab') {
    evento.preventDefault();
    enviarManual();
  }
});

// El foco vive en el campo para que el lector escriba directo ahi.
documento.focus();

/* ------------------------------------------------------------- Recientes */

const contenedor = document.getElementById('recientes');

async function refrescarRecientes() {
  try {
    const { datos } = await api('/asistencia/recientes?limite=14');

    contenedor.innerHTML = datos.length
      ? `<table class="tabla">
           <thead><tr><th>Persona</th><th>Tipo</th><th>Hora</th></tr></thead>
           <tbody>${datos
             .map(
               (r) => `<tr>
                 <td>${escapar(r.persona)}<div class="tenue chico">${escapar(r.documento)}</div></td>
                 <td>${pastillaTipo(r.tipo)}</td>
                 <td class="num nowrap">${escapar(r.hora_local)}</td>
               </tr>`,
             )
             .join('')}</tbody>
         </table>`
      : sinDatos('Sin marcaciones aun');
  } catch {
    // Un fallo puntual al refrescar no debe interrumpir el registro.
  }
}

await refrescarRecientes();
setInterval(refrescarRecientes, 20000);
