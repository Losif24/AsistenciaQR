import { api } from './core.js';

const formulario = document.getElementById('formulario');
const error = document.getElementById('error');
const enviar = document.getElementById('enviar');

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  error.textContent = '';

  const actual = document.getElementById('actual').value;
  const nueva = document.getElementById('nueva').value;
  const repetir = document.getElementById('repetir').value;

  if (nueva !== repetir) {
    error.textContent = 'Las dos contrasenas nuevas no coinciden.';
    return;
  }

  enviar.disabled = true;
  enviar.textContent = 'Guardando...';

  try {
    await api('/auth/cambiar-clave', { metodo: 'POST', datos: { actual, nueva } });
    window.location.href = '/panel';
  } catch (fallo) {
    error.textContent = fallo.message;
    enviar.disabled = false;
    enviar.textContent = 'Guardar y continuar';
  }
});

document.getElementById('salir').addEventListener('click', async (evento) => {
  evento.preventDefault();
  await api('/auth/salir', { metodo: 'POST' }).catch(() => {});
  window.location.href = '/';
});
