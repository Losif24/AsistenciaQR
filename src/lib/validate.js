/** Error de entrada del usuario: el manejador global lo traduce a HTTP 400. */
export class ValidationError extends Error {
  constructor(message, campo) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
    this.campo = campo;
  }
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export function texto(value, campo, { min = 1, max = 120, requerido = true } = {}) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v) {
    if (requerido) throw new ValidationError(`El campo "${campo}" es obligatorio.`, campo);
    return null;
  }
  if (v.length < min) throw new ValidationError(`"${campo}" debe tener al menos ${min} caracteres.`, campo);
  if (v.length > max) throw new ValidationError(`"${campo}" no puede superar ${max} caracteres.`, campo);
  return v;
}

/**
 * Normaliza el documento quitando puntos, espacios y guiones. Asi
 * "1.098.765-432" y "1098765432" son la misma persona y no se duplica.
 */
export function documento(value) {
  const v = texto(value, 'documento', { min: 3, max: 30 });
  if (!/^[A-Za-z0-9.\s-]+$/.test(v)) {
    throw new ValidationError('El documento solo admite letras, numeros, puntos y guiones.', 'documento');
  }
  const limpio = v.replace(/[.\s-]/g, '');
  if (limpio.length < 3) throw new ValidationError('El documento es demasiado corto.', 'documento');
  return limpio;
}

export function opcion(value, permitidos, campo) {
  const v = texto(value, campo);
  if (!permitidos.includes(v)) {
    throw new ValidationError(`"${campo}" debe ser uno de: ${permitidos.join(', ')}.`, campo);
  }
  return v;
}

export function fechaISO(value, campo, { requerido = false } = {}) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v) {
    if (requerido) throw new ValidationError(`El campo "${campo}" es obligatorio.`, campo);
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) {
    throw new ValidationError(`"${campo}" debe tener el formato AAAA-MM-DD.`, campo);
  }
  return v;
}

export function entero(value, campo, { min = 1, max = Number.MAX_SAFE_INTEGER, defecto = null } = {}) {
  if (value === undefined || value === null || value === '') {
    if (defecto !== null) return defecto;
    throw new ValidationError(`El campo "${campo}" es obligatorio.`, campo);
  }
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new ValidationError(`"${campo}" debe ser un numero entre ${min} y ${max}.`, campo);
  }
  return n;
}
