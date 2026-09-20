import { log } from '../lib/logger.js';

export function notFound(req, res) {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ ok: false, mensaje: 'Recurso no encontrado.' });
  }
  return res.status(404).redirect('/');
}

/** Envuelve un handler async para que sus errores lleguen al manejador global. */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// eslint-disable-next-line no-unused-vars -- Express distingue el manejador de errores por sus 4 argumentos.
export function errorHandler(err, req, res, next) {
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;

  if (status >= 500) log.error(`${req.method} ${req.originalUrl}`, err);
  else log.warn(`${req.method} ${req.originalUrl} -> ${status}: ${err.message}`);

  // Un 500 nunca revela detalles internos al cliente.
  const mensaje = status >= 500 ? 'Error interno del servidor.' : err.message;
  res.status(status).json({ ok: false, mensaje, campo: err.campo });
}
