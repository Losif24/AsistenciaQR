import { api } from './core.js';

const formulario = document.getElementById('formulario');
const error = document.getElementById('error');
const enviar = document.getElementById('enviar');

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  error.textContent = '';
  enviar.disabled = true;
  enviar.textContent = 'Verificando...';

  try {
    const { usuario } = await api('/auth/entrar', {
      metodo: 'POST',
      datos: {
        usuario: document.getElementById('usuario').value,
        clave: document.getElementById('clave').value,
      },
    });

    window.location.href = usuario.debeCambiar ? '/cambiar-clave' : '/panel';
  } catch (fallo) {
    error.textContent = fallo.message;
    document.getElementById('clave').value = '';
    document.getElementById('clave').focus();
    enviar.disabled = false;
    enviar.textContent = 'Entrar';
  }
});
