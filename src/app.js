import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { config, ROOT } from './config.js';
import { attachUser, blockIfMustChange, requireAuth, requireRole, requireSameOrigin } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/errors.js';
import asistenciaRoutes from './routes/asistencia.routes.js';
import authRoutes from './routes/auth.routes.js';
import panelRoutes from './routes/panel.routes.js';
import personalRoutes from './routes/personal.routes.js';
import reportesRoutes from './routes/reportes.routes.js';
import usuariosRoutes from './routes/usuarios.routes.js';

const PUBLIC = join(ROOT, 'public');
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // Detras de un proxy o de IIS, sin esto todas las peticiones parecen venir de 127.0.0.1
  // y el limitador por IP dejaria de distinguir a los clientes.
  app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          // Los QR se entregan como data URL y la camara se ve como blob.
          imgSrc: ["'self'", 'data:', 'blob:'],
          mediaSrc: ["'self'", 'blob:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));
  app.use(cookieParser());
  app.use(attachUser);

  app.use(
    '/api',
    rateLimit({
      windowMs: 60 * 1000,
      limit: 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { ok: false, mensaje: 'Demasiadas peticiones. Intente de nuevo en un minuto.' },
    }),
  );
  app.use('/api', requireSameOrigin);

  // ------------------------------------------------------------------ API
  // Sonda publica: el instalador y cualquier monitor la usan sin credenciales.
  app.get('/api/salud', (_req, res) => res.json({ ok: true, version: VERSION }));

  app.use('/api/auth', authRoutes);

  app.use('/api', requireAuth, blockIfMustChange);
  app.use('/api/panel', panelRoutes);
  app.use('/api/personal', personalRoutes);
  app.use('/api/asistencia', asistenciaRoutes);
  app.use('/api/reportes', reportesRoutes);
  app.use('/api/usuarios', usuariosRoutes);

  // -------------------------------------------------------------- Estaticos
  const estaticos = { maxAge: config.isProduction ? '7d' : 0, index: false };
  app.use('/css', express.static(join(PUBLIC, 'css'), estaticos));
  app.use('/js', express.static(join(PUBLIC, 'js'), estaticos));
  app.use('/img', express.static(join(PUBLIC, 'img'), estaticos));
  // Libreria del lector de QR servida desde node_modules: funciona sin internet.
  app.use('/vendor/html5-qrcode.min.js', express.static(join(ROOT, 'node_modules/html5-qrcode/html5-qrcode.min.js'), estaticos));

  // --------------------------------------------------------------- Paginas
  const pagina = (archivo) => (_req, res) => res.sendFile(join(PUBLIC, archivo));
  const protegida = (archivo, rol) => [requireAuth, blockIfMustChange, ...(rol ? [requireRole(rol)] : []), pagina(archivo)];

  app.get('/', (req, res, next) => (req.usuario ? res.redirect('/panel') : pagina('login.html')(req, res, next)));
  app.get('/cambiar-clave', requireAuth, pagina('cambiar-clave.html'));
  app.get('/panel', protegida('panel.html'));
  app.get('/registrar', protegida('registrar.html'));
  app.get('/personal', protegida('personal.html'));
  app.get('/reportes', protegida('reportes.html'));
  app.get('/usuarios', protegida('usuarios.html', 'admin'));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
