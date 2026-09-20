import { randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import QRCode from 'qrcode';
import { config } from '../config.js';
import { hashPassword } from '../lib/password.js';
import { localDate, localTime, shiftDate } from '../lib/time.js';
import { get, run, transaction } from './index.js';

// Sin ambiguos (0/O, 1/l/I) para que se pueda dictar por telefono sin errores.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function readablePassword(length = 12) {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8)}`;
}

/**
 * Crea el administrador inicial la primera vez que arranca el sistema.
 * La clave se genera al azar y se escribe una sola vez en data/, para que
 * nadie herede una contrasena por defecto conocida.
 */
export async function seed({ verbose = true } = {}) {
  const existing = get('SELECT COUNT(*) AS total FROM usuarios');
  if (existing?.total > 0) return { created: false };

  const plain = readablePassword();
  const { hash, salt } = await hashPassword(plain);

  run(
    `INSERT INTO usuarios (nombre, apellido, usuario, clave_hash, clave_salt, rol, debe_cambiar)
     VALUES (?, ?, ?, ?, ?, 'admin', 1)`,
    ['Administrador', 'del sistema', 'admin', hash, salt],
  );

  const file = join(config.dataDir, 'credenciales-iniciales.txt');
  writeFileSync(
    file,
    [
      'Asistencia QR - acceso inicial',
      '================================',
      '',
      'Usuario:    admin',
      `Contrasena: ${plain}`,
      '',
      'El sistema pedira cambiar esta contrasena en el primer inicio de sesion.',
      'Borre este archivo cuando ya la haya cambiado.',
      '',
    ].join('\n'),
    { mode: 0o600 },
  );

  if (verbose) {
    console.log('');
    console.log('  ┌──────────────────────────────────────────────┐');
    console.log('  │  Usuario administrador creado                │');
    console.log('  ├──────────────────────────────────────────────┤');
    console.log('  │  usuario:    admin                           │');
    console.log(`  │  contrasena: ${plain.padEnd(32)}│`);
    console.log('  └──────────────────────────────────────────────┘');
    console.log(`  Tambien quedo en ${file}`);
    console.log('');
  }

  return { created: true, usuario: 'admin', clave: plain };
}

const NOMBRES = [
  ['Ana Maria Restrepo', 'Coordinadora', 'Administracion'],
  ['Carlos Andres Mejia', 'Analista', 'Sistemas'],
  ['Diana Patricia Gomez', 'Auxiliar', 'Recursos Humanos'],
  ['Esteban Ruiz Salazar', 'Tecnico', 'Mantenimiento'],
  ['Fernanda Lopez Ortiz', 'Recepcionista', 'Administracion'],
  ['Gabriel Torres Nino', 'Supervisor', 'Operaciones'],
  ['Helena Quintero Diaz', 'Contadora', 'Finanzas'],
  ['Ivan Dario Castro', 'Operario', 'Operaciones'],
];

/** Datos de ejemplo para ver el panel con informacion real. */
export async function seedDemo({ days = 14 } = {}) {
  const inserted = [];

  for (const [nombre, cargo, area] of NOMBRES) {
    const documento = String(1000000000 + Math.floor(Math.random() * 99999999));
    const codigo = randomUUID();
    const png = await QRCode.toDataURL(codigo, { width: 320, margin: 1 });
    const { lastInsertRowid } = run(
      'INSERT INTO personal (nombre, documento, cargo, area, codigo_qr, qr_png) VALUES (?, ?, ?, ?, ?, ?)',
      [nombre.toUpperCase(), documento, cargo, area, codigo, png],
    );
    inserted.push(Number(lastInsertRowid));
  }

  const hoy = localDate();
  const ahora = Number(localTime().slice(0, 2));

  const aleatorio = (desde, hasta) =>
    `${String(desde + Math.floor(Math.random() * (hasta - desde))).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:00`;

  const marcar = (id, tipo, fecha, hora) =>
    run(
      `INSERT INTO asistencia (personal_id, tipo, marcado_en, fecha_local, hora_local, origen, registrado_por)
       VALUES (?, ?, ?, ?, ?, 'qr', 1)`,
      [id, tipo, `${fecha}T${hora}Z`, fecha, hora],
    );

  transaction(() => {
    for (let d = days - 1; d >= 1; d -= 1) {
      const fecha = shiftDate(hoy, -d);
      if ([0, 6].includes(new Date(`${fecha}T12:00:00Z`).getUTCDay())) continue;

      for (const id of inserted) {
        if (Math.random() < 0.12) continue; // ausencias ocasionales
        marcar(id, 'entrada', fecha, aleatorio(6, 9));
        marcar(id, 'salida', fecha, aleatorio(16, 19));
      }
    }

    // El dia de hoy se genera aparte y solo hasta la hora actual: asi el panel
    // muestra gente dentro de la sede, que es como se ve en uso real.
    for (const id of inserted) {
      if (Math.random() < 0.15) continue;
      const entrada = aleatorio(6, Math.min(9, Math.max(7, ahora)));
      if (entrada.slice(0, 2) >= String(ahora).padStart(2, '0')) continue;
      marcar(id, 'entrada', hoy, entrada);

      // Solo algunos han salido ya; el resto sigue adentro.
      if (ahora >= 16 && Math.random() < 0.5) marcar(id, 'salida', hoy, aleatorio(16, Math.min(19, ahora + 1)));
    }
  });

  const total = get('SELECT COUNT(*) AS c FROM asistencia')?.c ?? 0;
  console.log(`[db] datos de ejemplo: ${inserted.length} personas, ${total} marcaciones`);
  return { personas: inserted.length, marcaciones: total, hora: localTime() };
}
