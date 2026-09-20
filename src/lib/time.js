import { config } from '../config.js';

const parts = (date, options) =>
  new Intl.DateTimeFormat('es-CO', { timeZone: config.timezone, ...options })
    .formatToParts(date)
    .reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});

/** Fecha local YYYY-MM-DD en la zona horaria configurada. */
export function localDate(date = new Date()) {
  const p = parts(date, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${p.year}-${p.month}-${p.day}`;
}

/** Hora local HH:MM:SS en la zona horaria configurada. */
export function localTime(date = new Date()) {
  const p = parts(date, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  return `${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second}`;
}

/** Instante exacto en UTC. Es la unica fuente de verdad que se guarda. */
export const utcStamp = (date = new Date()) => date.toISOString();

export function localDateTime(date = new Date()) {
  return { fecha: localDate(date), hora: localTime(date), utc: utcStamp(date) };
}

/** Nombre del dia en espanol, para el panel y los reportes. */
export function dayName(isoDate) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  const name = new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', weekday: 'long' }).format(d);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Devuelve la fecha local desplazada N dias, util para rangos de reportes. */
export function shiftDate(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatDisplay(isoDate, hora) {
  const [y, m, d] = isoDate.split('-');
  return hora ? `${d}/${m}/${y} ${hora}` : `${d}/${m}/${y}`;
}
