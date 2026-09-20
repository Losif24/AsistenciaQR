/* Llena la base con personal y marcaciones de ejemplo para ver el sistema en marcha. */

import { close, get } from '../src/db/index.js';
import { migrate } from '../src/db/migrate.js';
import { seed, seedDemo } from '../src/db/seed.js';

migrate({ verbose: false });
await seed({ verbose: false });

const existentes = get('SELECT COUNT(*) AS c FROM personal')?.c ?? 0;
if (existentes > 0 && !process.argv.includes('--forzar')) {
  console.log(`Ya hay ${existentes} personas registradas. Use --forzar para agregar datos de ejemplo igualmente.`);
  close();
  process.exit(0);
}

await seedDemo({ days: 21 });
console.log('Listo. Arranque con "npm start" y entre al panel.');
close();
