import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

process.env.DB_FILE = join(mkdtempSync(join(tmpdir(), 'asistencia-api-')), 'prueba.db');
process.env.TZ = 'America/Bogota';
process.env.SESSION_SECRET = 'clave-solo-para-pruebas';

const { createApp } = await import('../src/app.js');
const { migrate } = await import('../src/db/migrate.js');
const { close, run } = await import('../src/db/index.js');
const { hashPassword } = await import('../src/lib/password.js');

let servidor;
let base;

/** Cliente minimo que arrastra la cookie de sesion entre llamadas. */
function crearCliente() {
  let cookie = '';

  async function pedir(ruta, { metodo = 'GET', datos, cabeceras = {} } = {}) {
    const respuesta = await fetch(`${base}${ruta}`, {
      method: metodo,
      headers: {
        'X-Requested-With': 'asistencia-qr',
        ...(datos ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...cabeceras,
      },
      body: datos ? JSON.stringify(datos) : undefined,
      redirect: 'manual',
    });

    const recibida = respuesta.headers.getSetCookie?.() || [];
    if (recibida.length) cookie = recibida.map((c) => c.split(';')[0]).join('; ');

    const tipo = respuesta.headers.get('content-type') || '';
    const cuerpo = tipo.includes('application/json') ? await respuesta.json() : await respuesta.text();
    return { estado: respuesta.status, cuerpo, cabeceras: respuesta.headers };
  }

  /** Descarga sin decodificar, para comprobar firmas de archivo y el BOM. */
  pedir.bruto = async (ruta) => {
    const respuesta = await fetch(`${base}${ruta}`, {
      headers: { 'X-Requested-With': 'asistencia-qr', ...(cookie ? { Cookie: cookie } : {}) },
    });
    return respuesta.arrayBuffer();
  };

  return pedir;
}

async function crearUsuario(usuario, rol, clave) {
  const { hash, salt } = await hashPassword(clave);
  run(
    `INSERT INTO usuarios (nombre, apellido, usuario, clave_hash, clave_salt, rol, debe_cambiar)
     VALUES (?, '', ?, ?, ?, ?, 0)`,
    ['Prueba', usuario, hash, salt, rol],
  );
}

before(async () => {
  migrate({ verbose: false });
  await crearUsuario('jefe', 'admin', 'Admin2026');
  await crearUsuario('portero', 'operador', 'Oper2026');

  await new Promise((listo) => {
    servidor = createApp().listen(0, '127.0.0.1', listo);
  });
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => {
  servidor?.close();
  close();
});

describe('autenticacion', () => {
  it('la API responde 401 en JSON, no redirige', async () => {
    const { estado, cuerpo } = await crearCliente()('/api/personal');
    assert.equal(estado, 401);
    assert.equal(cuerpo.ok, false);
  });

  it('la sonda de salud es publica', async () => {
    const { estado, cuerpo } = await crearCliente()('/api/salud');
    assert.equal(estado, 200);
    assert.equal(cuerpo.ok, true);
  });

  it('rechaza credenciales invalidas sin decir cual fallo', async () => {
    const pedir = crearCliente();
    const noExiste = await pedir('/api/auth/entrar', { metodo: 'POST', datos: { usuario: 'fantasma', clave: 'x' } });
    const claveMala = await pedir('/api/auth/entrar', { metodo: 'POST', datos: { usuario: 'jefe', clave: 'mala' } });
    assert.equal(noExiste.estado, 401);
    assert.equal(claveMala.estado, 401);
    assert.equal(noExiste.cuerpo.mensaje, claveMala.cuerpo.mensaje);
  });

  it('la cookie de sesion es httpOnly', async () => {
    const pedir = crearCliente();
    const { cabeceras } = await pedir('/api/auth/entrar', { metodo: 'POST', datos: { usuario: 'jefe', clave: 'Admin2026' } });
    const cookies = cabeceras.getSetCookie().join(';');
    assert.match(cookies, /HttpOnly/i);
    assert.match(cookies, /SameSite=Lax/i);
  });

  it('bloquea peticiones sin la cabecera anti-CSRF', async () => {
    const respuesta = await fetch(`${base}/api/auth/entrar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: 'jefe', clave: 'Admin2026' }),
    });
    assert.equal(respuesta.status, 403);
  });
});

describe('personal y asistencia', () => {
  let admin;

  before(async () => {
    admin = crearCliente();
    await admin('/api/auth/entrar', { metodo: 'POST', datos: { usuario: 'jefe', clave: 'Admin2026' } });
  });

  it('registra una persona y le genera codigo QR', async () => {
    const { estado, cuerpo } = await admin('/api/personal', {
      metodo: 'POST',
      datos: { nombre: 'fulana de tal', documento: '1.234.567-89', cargo: 'Auxiliar', area: 'Bodega' },
    });
    assert.equal(estado, 201);
    assert.equal(cuerpo.datos.nombre, 'FULANA DE TAL');
    assert.equal(cuerpo.datos.documento, '123456789');
    assert.match(cuerpo.datos.qr, /^data:image\/png;base64,/);
    // El QR lleva un token opaco, nunca el numero de documento.
    assert.ok(!cuerpo.datos.codigo_qr.includes('123456789'));
  });

  it('no deja duplicar el documento aunque venga con otro formato', async () => {
    const { estado } = await admin('/api/personal', {
      metodo: 'POST',
      datos: { nombre: 'otra persona', documento: '123456789' },
    });
    assert.equal(estado, 409);
  });

  it('alterna entrada y salida cuando no se indica el tipo', async () => {
    const primera = await admin('/api/asistencia', { metodo: 'POST', datos: { documento: '123456789' } });
    assert.equal(primera.cuerpo.datos.tipo, 'entrada');
    assert.equal(primera.cuerpo.repetido, false);
  });

  it('descarta la relectura inmediata en vez de marcar la salida', async () => {
    // Es el caso real: un lector de mano dispara dos veces seguidas.
    const segunda = await admin('/api/asistencia', { metodo: 'POST', datos: { documento: '123456789' } });
    assert.equal(segunda.cuerpo.repetido, true);
    assert.equal(segunda.cuerpo.datos.tipo, 'entrada');
  });

  it('avisa cuando el codigo no corresponde a nadie', async () => {
    const { estado } = await admin('/api/asistencia', { metodo: 'POST', datos: { codigo: 'inventado' } });
    assert.equal(estado, 404);
  });

  it('guarda la marcacion con fecha y hora locales', async () => {
    const { cuerpo } = await admin('/api/reportes?porPagina=10');
    assert.ok(cuerpo.paginacion.total >= 1);
    assert.match(cuerpo.datos[0].fecha, /^\d{2}\/\d{2}\/\d{4}$/);
    assert.match(cuerpo.datos[0].hora, /^\d{2}:\d{2}:\d{2}$/);
  });
});

describe('permisos por rol', () => {
  let operador;

  before(async () => {
    operador = crearCliente();
    await operador('/api/auth/entrar', { metodo: 'POST', datos: { usuario: 'portero', clave: 'Oper2026' } });
  });

  it('el operador marca asistencia', async () => {
    const { estado } = await operador('/api/asistencia', {
      metodo: 'POST',
      datos: { documento: '123456789', tipo: 'salida' },
    });
    assert.equal(estado, 201);
  });

  it('el operador no crea personal', async () => {
    const { estado } = await operador('/api/personal', {
      metodo: 'POST',
      datos: { nombre: 'colado sin permiso', documento: '999888777' },
    });
    assert.equal(estado, 403);
  });

  it('el operador no exporta reportes', async () => {
    const { estado } = await operador('/api/reportes/excel');
    assert.equal(estado, 403);
  });

  it('el operador no toca la gestion de usuarios', async () => {
    const { estado } = await operador('/api/usuarios');
    assert.equal(estado, 403);
  });
});

describe('reportes', () => {
  let admin;

  before(async () => {
    admin = crearCliente();
    await admin('/api/auth/entrar', { metodo: 'POST', datos: { usuario: 'jefe', clave: 'Admin2026' } });
  });

  it('rechaza filtros de fecha mal formados', async () => {
    const { estado } = await admin('/api/reportes?desde=ayer');
    assert.equal(estado, 400);
  });

  it('no entrega el archivo sin sesion', async () => {
    const respuesta = await fetch(`${base}/api/reportes/excel`, {
      headers: { 'X-Requested-With': 'asistencia-qr' },
    });
    assert.equal(respuesta.status, 401);
  });

  it('el XLSX es un archivo de Excel real', async () => {
    const bytes = Buffer.from(await admin.bruto('/api/reportes/excel'));
    // Un .xlsx es un ZIP: debe empezar por la firma PK.
    assert.equal(bytes.subarray(0, 2).toString('latin1'), 'PK');
    assert.ok(bytes.length > 1000);
  });

  it('el CSV sale con BOM para que Excel respete los acentos', async () => {
    // text() de fetch descarta el BOM al decodificar: hay que mirar los bytes.
    const bytes = Buffer.from(await admin.bruto('/api/reportes/csv'));
    assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.ok(bytes.toString('utf8').includes('Persona'));
  });
});
