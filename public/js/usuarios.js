import { api, avisoError, avisoOk, cargando, escapar, ICONOS, montarArmazon, sinDatos } from './core.js';

const { vista } = await montarArmazon({
  titulo: 'Usuarios',
  subtitulo: 'Quienes pueden entrar al sistema',
  acciones: `<button class="boton boton-principal" id="btnNuevo">${ICONOS.mas}<span>Nuevo usuario</span></button>`,
});

vista.innerHTML = `
  <div class="rejilla rejilla-1-2">
    <div class="tarjeta">
      <div class="tarjeta-cabeza"><div><h3>Que puede hacer cada rol</h3></div></div>
      <div class="tarjeta-cuerpo">
        <div class="barra-lista">
          <div><span class="pastilla pastilla-acento pastilla-sin-punto">Administrador</span>
            <div class="medio chico" style="margin-top:6px">Todo, incluida la gestion de usuarios y la auditoria.</div></div>
          <div><span class="pastilla pastilla-neutra pastilla-sin-punto">Supervisor</span>
            <div class="medio chico" style="margin-top:6px">Registra asistencia, administra el personal y exporta reportes.</div></div>
          <div><span class="pastilla pastilla-neutra pastilla-sin-punto">Operador</span>
            <div class="medio chico" style="margin-top:6px">Registra asistencia y consulta. No modifica ni exporta.</div></div>
        </div>
      </div>
    </div>

    <div class="tarjeta">
      <div class="tarjeta-cabeza"><div><h3>Usuarios del sistema</h3></div><span class="tenue chico" id="conteo"></span></div>
      <div id="lista">${cargando()}</div>
    </div>
  </div>

  <div class="tarjeta mt-16">
    <div class="tarjeta-cabeza">
      <div><h3>Auditoria</h3><p>Ultimas acciones registradas</p></div>
      <button class="boton boton-chico" id="btnAuditoria">${ICONOS.refrescar}<span>Actualizar</span></button>
    </div>
    <div id="auditoria">${cargando()}</div>
  </div>

  <div class="modal-fondo" id="modalUsuario">
    <div class="modal">
      <div class="modal-cabeza"><h3 id="modalTitulo">Nuevo usuario</h3><button class="cerrar" data-cerrar>&times;</button></div>
      <form id="formUsuario">
        <div class="modal-cuerpo">
          <div class="rejilla rejilla-2">
            <div class="campo"><label for="nombre">Nombre</label><input id="nombre" required maxlength="60"></div>
            <div class="campo"><label for="apellido">Apellido</label><input id="apellido" maxlength="60"></div>
          </div>
          <div class="campo"><label for="usuario">Usuario</label><input id="usuario" required maxlength="40" autocomplete="off" placeholder="sin espacios ni acentos"></div>
          <div class="campo" id="campoClave">
            <label for="clave">Contrasena temporal</label>
            <div class="fila">
              <input class="crece" id="clave" type="text" required minlength="8" autocomplete="new-password">
              <button type="button" class="boton" id="btnGenerar">Generar</button>
            </div>
            <span class="tenue chico">La persona debera cambiarla en su primer ingreso.</span>
          </div>
          <div class="rejilla rejilla-2">
            <div class="campo"><label for="rol">Rol</label>
              <select id="rol"><option value="operador">Operador</option><option value="supervisor">Supervisor</option><option value="admin">Administrador</option></select>
            </div>
            <div class="campo"><label for="telefono">Telefono</label><input id="telefono" maxlength="30" placeholder="Opcional"></div>
          </div>
          <div class="error" id="errorUsuario"></div>
        </div>
        <div class="modal-pie">
          <button type="button" class="boton" data-cerrar>Cancelar</button>
          <button type="submit" class="boton boton-principal" id="guardar">Guardar</button>
        </div>
      </form>
    </div>
  </div>
`;

document.querySelectorAll('[data-cerrar]').forEach((b) =>
  b.addEventListener('click', () => b.closest('.modal-fondo').classList.remove('abierto')),
);

const lista = document.getElementById('lista');
const conteo = document.getElementById('conteo');

/* ---------------------------------------------------------------- Listado */

async function cargar() {
  lista.innerHTML = cargando();

  let respuesta;
  try {
    respuesta = await api('/usuarios');
  } catch (fallo) {
    lista.innerHTML = sinDatos(fallo.message);
    return;
  }

  const { datos } = respuesta;
  conteo.textContent = `${datos.length} usuario${datos.length === 1 ? '' : 's'}`;

  lista.innerHTML = `
    <div class="tabla-marco">
      <table class="tabla">
        <thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Ultimo ingreso</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          ${datos
            .map((u) => {
              const ultima = u.ultima_sesion ? new Date(u.ultima_sesion).toLocaleString('es-CO') : 'Nunca';
              return `<tr>
                <td class="mono">${escapar(u.usuario)}</td>
                <td>${escapar(u.nombre)} ${escapar(u.apellido || '')}</td>
                <td><span class="pastilla ${u.rol === 'admin' ? 'pastilla-acento' : 'pastilla-neutra'} pastilla-sin-punto">${escapar(u.rolTexto)}</span></td>
                <td class="tenue chico nowrap">${escapar(ultima)}</td>
                <td>${u.activo ? '<span class="pastilla pastilla-entrada">Activo</span>' : '<span class="pastilla pastilla-neutra">Inactivo</span>'}
                    ${u.debe_cambiar ? '<span class="pastilla pastilla-neutra pastilla-sin-punto" title="Debe cambiar la contrasena">clave temporal</span>' : ''}</td>
                <td class="nowrap" style="text-align:right">
                  <button class="boton boton-chico" data-clave="${u.id}">${ICONOS.llave}<span>Clave</span></button>
                  <button class="boton boton-chico" data-estado="${u.id}" data-activo="${u.activo}">${u.activo ? 'Desactivar' : 'Activar'}</button>
                </td>
              </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </div>`;

  lista.querySelectorAll('[data-clave]').forEach((b) => b.addEventListener('click', () => reiniciarClave(b.dataset.clave)));
  lista.querySelectorAll('[data-estado]').forEach((b) =>
    b.addEventListener('click', () => cambiarEstado(b.dataset.estado, b.dataset.activo !== '1')),
  );
}

/* ------------------------------------------------------------- Contrasenas */

// Sin caracteres ambiguos: la clave se suele dictar de viva voz.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function claveAlAzar() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const texto = Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join('');
  return `${texto.slice(0, 4)}-${texto.slice(4, 8)}-${texto.slice(8)}`;
}

document.getElementById('btnGenerar').addEventListener('click', () => {
  document.getElementById('clave').value = claveAlAzar();
});

async function reiniciarClave(id) {
  const clave = claveAlAzar();
  if (!window.confirm(`Se asignara la contrasena temporal:\n\n${clave}\n\nLa persona debera cambiarla al entrar. Anotela antes de continuar.`)) return;

  try {
    await api(`/usuarios/${id}/clave`, { metodo: 'POST', datos: { clave } });
    avisoOk(`Nueva contrasena: ${clave}`, 'Contrasena restablecida');
    await cargar();
  } catch (fallo) {
    avisoError(fallo.message);
  }
}

async function cambiarEstado(id, activar) {
  try {
    await api(`/usuarios/${id}`, { metodo: 'PATCH', datos: { activo: activar } });
    avisoOk(activar ? 'Usuario activado.' : 'Usuario desactivado.');
    await cargar();
  } catch (fallo) {
    avisoError(fallo.message);
  }
}

/* -------------------------------------------------------------- Formulario */

const formulario = document.getElementById('formUsuario');
const errorUsuario = document.getElementById('errorUsuario');

document.getElementById('btnNuevo').addEventListener('click', () => {
  formulario.reset();
  errorUsuario.textContent = '';
  document.getElementById('clave').value = claveAlAzar();
  document.getElementById('modalUsuario').classList.add('abierto');
  document.getElementById('nombre').focus();
});

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  errorUsuario.textContent = '';

  const guardar = document.getElementById('guardar');
  guardar.disabled = true;

  const clave = document.getElementById('clave').value;

  try {
    await api('/usuarios', {
      metodo: 'POST',
      datos: {
        nombre: document.getElementById('nombre').value,
        apellido: document.getElementById('apellido').value,
        usuario: document.getElementById('usuario').value,
        clave,
        rol: document.getElementById('rol').value,
        telefono: document.getElementById('telefono').value,
      },
    });

    document.getElementById('modalUsuario').classList.remove('abierto');
    avisoOk(`Contrasena temporal: ${clave}`, 'Usuario creado');
    await cargar();
  } catch (fallo) {
    errorUsuario.textContent = fallo.message;
  } finally {
    guardar.disabled = false;
  }
});

/* --------------------------------------------------------------- Auditoria */

const cajaAuditoria = document.getElementById('auditoria');

async function cargarAuditoria() {
  cajaAuditoria.innerHTML = cargando();

  try {
    const { datos } = await api('/usuarios/auditoria?limite=60');

    cajaAuditoria.innerHTML = datos.length
      ? `<div class="tabla-marco"><table class="tabla">
           <thead><tr><th>Cuando</th><th>Usuario</th><th>Accion</th><th>Detalle</th><th>IP</th></tr></thead>
           <tbody>${datos
             .map(
               (a) => `<tr>
                 <td class="num nowrap">${new Date(a.creado_en).toLocaleString('es-CO')}</td>
                 <td class="mono">${escapar(a.usuario)}</td>
                 <td><span class="pastilla pastilla-neutra pastilla-sin-punto">${escapar(a.accion)}</span></td>
                 <td class="tenue chico">${escapar(a.detalle || '-')}</td>
                 <td class="tenue chico mono">${escapar(a.ip || '-')}</td>
               </tr>`,
             )
             .join('')}</tbody></table></div>`
      : sinDatos('Sin acciones registradas');
  } catch (fallo) {
    cajaAuditoria.innerHTML = sinDatos(fallo.message);
  }
}

document.getElementById('btnAuditoria').addEventListener('click', cargarAuditoria);

await cargar();
await cargarAuditoria();
