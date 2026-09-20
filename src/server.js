import { networkInterfaces } from 'node:os';
import { createApp } from './app.js';
import { config } from './config.js';
import { close } from './db/index.js';
import { migrate, purgeSessions } from './db/migrate.js';
import { seed } from './db/seed.js';
import { log } from './lib/logger.js';

// El esquema se crea o actualiza solo: instalar la aplicacion no exige
// ejecutar ningun script de base de datos a mano.
migrate();
await seed();
purgeSessions();

const limpieza = setInterval(purgeSessions, 60 * 60 * 1000);
limpieza.unref();

const app = createApp();
const server = app.listen(config.port, config.host, () => {
  const lineas = [`http://localhost:${config.port}`];

  if (config.host === '0.0.0.0') {
    for (const redes of Object.values(networkInterfaces())) {
      for (const red of redes || []) {
        if (red.family === 'IPv4' && !red.internal) lineas.push(`http://${red.address}:${config.port}`);
      }
    }
  }

  console.log('');
  console.log('  Asistencia QR');
  console.log(`  ${config.orgName}  ·  zona horaria ${config.timezone}`);
  console.log('  ' + '-'.repeat(46));
  for (const url of lineas) console.log(`  ${url}`);
  console.log('  ' + '-'.repeat(46));
  console.log(`  base de datos: ${config.dbFile}`);
  console.log('  Ctrl+C para detener');
  console.log('');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    log.error(`El puerto ${config.port} ya esta ocupado. Cambie PORT en el archivo .env.`);
  } else {
    log.error('No se pudo iniciar el servidor', err);
  }
  process.exit(1);
});

let cerrando = false;
function apagar(senal) {
  if (cerrando) return;
  cerrando = true;
  log.info(`${senal} recibido, cerrando...`);

  server.close(() => {
    close();
    log.ok('Servidor detenido.');
    process.exit(0);
  });

  // Si alguna conexion se queda colgada, no se espera indefinidamente.
  setTimeout(() => {
    close();
    process.exit(0);
  }, 5000).unref();
}

process.on('SIGINT', () => apagar('SIGINT'));
process.on('SIGTERM', () => apagar('SIGTERM'));

process.on('uncaughtException', (err) => {
  log.error('Excepcion no capturada', err);
  apagar('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  log.error('Promesa rechazada sin manejar', reason instanceof Error ? reason : new Error(String(reason)));
});
