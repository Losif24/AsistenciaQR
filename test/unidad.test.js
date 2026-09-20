import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

// Cada archivo de prueba corre en su propio proceso: basta con apuntar la
// base a un temporal antes de importar nada que la abra.
process.env.DB_FILE = join(mkdtempSync(join(tmpdir(), 'asistencia-')), 'prueba.db');
process.env.TZ = 'America/Bogota';

const { hashPassword, verifyPassword, passwordProblems } = await import('../src/lib/password.js');
const { documento, texto, fechaISO, entero, opcion, ValidationError } = await import('../src/lib/validate.js');
const { localDate, localTime, shiftDate, dayName, formatDisplay } = await import('../src/lib/time.js');

describe('contrasenas', () => {
  it('acepta la correcta y rechaza la equivocada', async () => {
    const { hash, salt } = await hashPassword('Secreta2026');
    assert.equal(await verifyPassword('Secreta2026', hash, salt), true);
    assert.equal(await verifyPassword('Secreta2027', hash, salt), false);
  });

  it('nunca guarda el texto plano', async () => {
    const { hash, salt } = await hashPassword('Secreta2026');
    assert.ok(!hash.includes('Secreta'));
    assert.ok(!salt.includes('Secreta'));
  });

  it('usa una sal distinta cada vez', async () => {
    const a = await hashPassword('Secreta2026');
    const b = await hashPassword('Secreta2026');
    assert.notEqual(a.hash, b.hash);
  });

  it('no revienta con valores faltantes', async () => {
    assert.equal(await verifyPassword(null, 'x', 'y'), false);
    assert.equal(await verifyPassword('x', null, null), false);
  });

  it('exige longitud, letra y numero', () => {
    assert.equal(passwordProblems('Segura2026').length, 0);
    assert.ok(passwordProblems('corta1').length > 0);
    assert.ok(passwordProblems('solamenteletras').length > 0);
    assert.ok(passwordProblems('12345678').length > 0);
  });
});

describe('documentos', () => {
  it('normaliza puntos, guiones y espacios a la misma clave', () => {
    const esperado = '1098765432';
    for (const variante of ['1.098.765-432', '1098765432', '1 098 765 432', '1.098.765.432']) {
      assert.equal(documento(variante), esperado, `fallo con "${variante}"`);
    }
  });

  it('rechaza caracteres que no pertenecen a un documento', () => {
    assert.throws(() => documento('12<script>'), ValidationError);
    assert.throws(() => documento('abc; DROP TABLE personal'), ValidationError);
  });

  it('rechaza lo que queda demasiado corto tras normalizar', () => {
    assert.throws(() => documento('1-2'), ValidationError);
  });
});

describe('validaciones', () => {
  it('texto respeta obligatorio, minimo y maximo', () => {
    assert.equal(texto('  hola  ', 'campo'), 'hola');
    assert.equal(texto('', 'campo', { requerido: false }), null);
    assert.throws(() => texto('', 'campo'), ValidationError);
    assert.throws(() => texto('a'.repeat(200), 'campo', { max: 10 }), ValidationError);
  });

  it('fechaISO solo acepta AAAA-MM-DD', () => {
    assert.equal(fechaISO('2026-09-20', 'desde'), '2026-09-20');
    assert.equal(fechaISO('', 'desde'), null);
    assert.throws(() => fechaISO('20/09/2026', 'desde'), ValidationError);
    assert.throws(() => fechaISO('2026-13-45', 'desde'), ValidationError);
  });

  it('entero aplica rango y valor por defecto', () => {
    assert.equal(entero('5', 'n', { min: 1, max: 10 }), 5);
    assert.equal(entero('', 'n', { defecto: 7 }), 7);
    assert.throws(() => entero('99', 'n', { min: 1, max: 10 }), ValidationError);
    assert.throws(() => entero('abc', 'n', { min: 1, max: 10 }), ValidationError);
  });

  it('opcion limita a la lista permitida', () => {
    assert.equal(opcion('entrada', ['entrada', 'salida'], 'tipo'), 'entrada');
    assert.throws(() => opcion('otra', ['entrada', 'salida'], 'tipo'), ValidationError);
  });
});

describe('fechas y horas', () => {
  it('convierte a la zona configurada, no a UTC', () => {
    // 20/09/2026 02:30 UTC son las 21:30 del 19 en Bogota.
    const instante = new Date('2026-09-20T02:30:00Z');
    assert.equal(localDate(instante), '2026-09-19');
    assert.equal(localTime(instante), '21:30:00');
  });

  it('medianoche local no se adelanta un dia', () => {
    const instante = new Date('2026-09-20T05:00:00Z');
    assert.equal(localDate(instante), '2026-09-20');
    assert.equal(localTime(instante), '00:00:00');
  });

  it('shiftDate cruza meses y anos sin perderse', () => {
    assert.equal(shiftDate('2026-09-20', -1), '2026-09-19');
    assert.equal(shiftDate('2026-03-01', -1), '2026-02-28');
    assert.equal(shiftDate('2026-01-01', -1), '2025-12-31');
    assert.equal(shiftDate('2024-03-01', -1), '2024-02-29');
  });

  it('nombra el dia en espanol', () => {
    assert.equal(dayName('2026-09-20'), 'Domingo');
  });

  it('formatDisplay pasa a formato local', () => {
    assert.equal(formatDisplay('2026-09-20'), '20/09/2026');
    assert.equal(formatDisplay('2026-09-20', '08:15:00'), '20/09/2026 08:15:00');
  });
});

after(async () => {
  const { close } = await import('../src/db/index.js');
  close();
});
