/* Nucleo compartido: peticiones, armazon de pagina, avisos y utilidades. */

/* --------------------------------------------------------------- Peticiones */

/**
 * Envoltura de fetch para la API. La cabecera X-Requested-With es la que
 * el servidor exige para aceptar cualquier peticion que modifique datos.
 */
export async function api(ruta, { metodo = 'GET', datos, ...resto } = {}) {
  const respuesta = await fetch(`/api${ruta}`, {
    method: metodo,
    headers: {
      'X-Requested-With': 'asistencia-qr',
      ...(datos ? { 'Content-Type': 'application/json' } : {}),
    },
    body: datos ? JSON.stringify(datos) : undefined,
    ...resto,
  });

  if (respuesta.status === 401) {
    window.location.href = '/';
    throw new Error('Sesion expirada.');
  }

  const cuerpo = await respuesta.json().catch(() => ({ ok: false, mensaje: 'Respuesta no valida del servidor.' }));

  if (respuesta.status === 409 && cuerpo.codigo === 'CAMBIO_REQUERIDO') {
    window.location.href = '/cambiar-clave';
    throw new Error(cuerpo.mensaje);
  }

  if (!respuesta.ok || cuerpo.ok === false) {
    const error = new Error(cuerpo.mensaje || `Error ${respuesta.status}`);
    error.campo = cuerpo.campo;
    error.status = respuesta.status;
    throw error;
  }

  return cuerpo;
}

/** Descarga un archivo generado por la API respetando el nombre que manda. */
export async function descargar(ruta, nombrePorDefecto) {
  const respuesta = await fetch(`/api${ruta}`, { headers: { 'X-Requested-With': 'asistencia-qr' } });
  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => ({}));
    throw new Error(cuerpo.mensaje || 'No se pudo generar el archivo.');
  }

  const cabecera = respuesta.headers.get('Content-Disposition') || '';
  const coincide = cabecera.match(/filename="?([^";]+)"?/i);
  const blob = await respuesta.blob();
  const url = URL.createObjectURL(blob);

  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = coincide ? coincide[1] : nombrePorDefecto;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ Avisos */

function contenedorAvisos() {
  let caja = document.querySelector('.avisos');
  if (!caja) {
    caja = document.createElement('div');
    caja.className = 'avisos';
    document.body.appendChild(caja);
  }
  return caja;
}

export function aviso(mensaje, tipo = 'info', titulo) {
  const nodo = document.createElement('div');
  nodo.className = `aviso aviso-${tipo}`;
  nodo.innerHTML = `
    ${titulo ? `<div class="aviso-titulo">${escapar(titulo)}</div>` : ''}
    <div class="aviso-texto">${escapar(mensaje)}</div>
  `;

  contenedorAvisos().appendChild(nodo);
  setTimeout(() => {
    nodo.style.opacity = '0';
    nodo.style.transition = 'opacity 0.25s ease';
    setTimeout(() => nodo.remove(), 250);
  }, tipo === 'error' ? 5200 : 3200);
}

export const avisoOk = (m, t) => aviso(m, 'ok', t);
export const avisoError = (m, t) => aviso(m, 'error', t || 'No se pudo completar');

/* -------------------------------------------------------------- Utilidades */

/** Escapa texto antes de inyectarlo como HTML. */
export function escapar(valor) {
  const div = document.createElement('div');
  div.textContent = valor ?? '';
  return div.innerHTML;
}

export const iniciales = (nombre = '') =>
  nombre.trim().split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase() || '?';

export function retrasar(fn, ms = 320) {
  let id;
  return (...args) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...args), ms);
  };
}

export const hoyISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

export function relojVivo(nodo) {
  const pintar = () => {
    nodo.textContent = new Date().toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };
  pintar();
  return setInterval(pintar, 1000);
}

export const pastillaTipo = (tipo) =>
  `<span class="pastilla pastilla-${tipo === 'entrada' ? 'entrada' : 'salida'}">${tipo === 'entrada' ? 'Entrada' : 'Salida'}</span>`;

/* ------------------------------------------------------------------ Iconos */

const trazo = (d) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

export const ICONOS = {
  panel: trazo('<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>'),
  qr: trazo('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM19 19h2v2h-2zM14 21h1M21 14h-1"/>'),
  personas: trazo('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
  reporte: trazo('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>'),
  usuarios: trazo('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
  salir: trazo('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
  buscar: trazo('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>'),
  camara: trazo('<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>'),
  mas: trazo('<path d="M12 5v14M5 12h14"/>'),
  descargar: trazo('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>'),
  vacio: trazo('<path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/>'),
  escudo: trazo('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
  revisar: trazo('<path d="M20 6 9 17l-5-5"/>'),
  refrescar: trazo('<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>'),
  llave: trazo('<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3"/>'),
  imprimir: trazo('<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>'),
};

/* ------------------------------------------------------------------ Armazon */

const NAVEGACION = [
  { ruta: '/panel', texto: 'Panel', icono: 'panel', rol: 'operador' },
  { ruta: '/registrar', texto: 'Registrar', icono: 'qr', rol: 'operador' },
  { ruta: '/personal', texto: 'Personal', icono: 'personas', rol: 'operador' },
  { ruta: '/reportes', texto: 'Reportes', icono: 'reporte', rol: 'operador' },
  { ruta: '/usuarios', texto: 'Usuarios', icono: 'usuarios', rol: 'admin' },
];

const NIVEL = { operador: 1, supervisor: 2, admin: 3 };

/**
 * Pinta la barra lateral y la superior, y devuelve la sesion actual.
 * Cada pagina llama a esto una vez y se ocupa solo de su contenido.
 */
export async function montarArmazon({ titulo, subtitulo, acciones = '' }) {
  const { usuario, organizacion } = await api('/auth/yo');

  const enlaces = NAVEGACION.filter((n) => NIVEL[usuario.rol] >= NIVEL[n.rol])
    .map((n) => {
      const activo = window.location.pathname === n.ruta ? ' activo' : '';
      return `<a href="${n.ruta}" class="${activo.trim()}">${ICONOS[n.icono]}<span>${n.texto}</span></a>`;
    })
    .join('');

  document.body.innerHTML = `
    <div class="app">
      <aside class="lateral">
        <div class="marca">
          <div class="marca-titulo"><span class="marca-glifo">QR</span><span>Asistencia QR</span></div>
          <div class="marca-org">${escapar(organizacion)}</div>
        </div>
        <nav class="menu">
          <div class="menu-titulo">Operacion</div>
          ${enlaces}
        </nav>
        <div class="pie-lateral">
          <div class="usuario-caja">
            <div class="avatar">${iniciales(`${usuario.nombre} ${usuario.apellido}`)}</div>
            <div class="usuario-datos">
              <div class="usuario-nombre">${escapar(usuario.nombre)} ${escapar(usuario.apellido)}</div>
              <div class="usuario-rol">${escapar(usuario.rolTexto)}</div>
            </div>
          </div>
          <button class="boton boton-ancho boton-chico" id="btnSalir" style="margin-top:8px">${ICONOS.salir}<span>Cerrar sesion</span></button>
        </div>
      </aside>
      <main class="contenido">
        <header class="barra-superior">
          <div>
            <div class="barra-titulo">${escapar(titulo)}</div>
            ${subtitulo ? `<div class="barra-sub">${escapar(subtitulo)}</div>` : ''}
          </div>
          <div class="barra-acciones">${acciones}<div class="reloj" id="reloj"></div></div>
        </header>
        <div class="vista" id="vista"></div>
      </main>
    </div>
  `;

  relojVivo(document.getElementById('reloj'));

  document.getElementById('btnSalir').addEventListener('click', async () => {
    await api('/auth/salir', { metodo: 'POST' }).catch(() => {});
    window.location.href = '/';
  });

  return { usuario, organizacion, vista: document.getElementById('vista') };
}

export const cargando = (texto = 'Cargando...') =>
  `<div class="cargando"><div class="giro"></div>${escapar(texto)}</div>`;

export const sinDatos = (texto) => `<div class="vacio">${ICONOS.vacio}<div>${escapar(texto)}</div></div>`;
