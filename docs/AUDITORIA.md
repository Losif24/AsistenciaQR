# Auditoría del proyecto original

Revisión de `ProyectoQR` (rama `master`, último cambio 5 de marzo de 2025) y
registro de cómo se resolvió cada punto en esta versión.

El original eran 6.605 líneas de JavaScript sobre Express y MySQL. La versión
actual son 3.536, con más funciones y sin ninguna de las fallas de abajo.

**Resumen:** 9 problemas de seguridad, 12 defectos de funcionamiento y 3 de
estructura. Cuatro de ellos hacían que el sistema entregara datos incorrectos
o se cayera; uno permitía entrar sin credenciales.

---

## Seguridad

### S1 · Cualquiera podía entrar sin credenciales · **Crítico**

Toda la autenticación vivía en el navegador:

```js
// public/js/Authentication/validateAccess.js
const isAuthenticated = sessionStorage.getItem('isAuthenticated');
const userRole = sessionStorage.getItem('userRole');
if (!isAuthenticated || !userRole) { window.location.href = '/'; }
```

Dos líneas en la consola del navegador bastaban para entrar como administrador:

```js
sessionStorage.setItem('isAuthenticated', 'true');
sessionStorage.setItem('userRole', 'Admin');
```

Peor aún: **ninguna ruta del servidor comprobaba nada**. `/ver-personal`,
`/showreport`, `/registro-empleado` respondían a cualquiera que las pidiera,
con o sin sesión. Ni siquiera hacía falta el truco del navegador.

**Ahora:** la sesión vive en el servidor (tabla `sesiones`), la cookie va
firmada con HMAC, y cada ruta pasa por `requireAuth` y `requireRole`. El
navegador ya no decide nada. Hay pruebas que lo verifican:
`test/api.test.js`, bloque «permisos por rol».

### S2 · Contraseñas guardadas en texto plano · **Crítico**

```js
// routes/login/login.js
const query = 'SELECT id, nombre, ... FROM empleados WHERE user = ? AND pass = ?';
```

La contraseña se comparaba directamente en SQL, lo que significa que estaba
almacenada tal cual en la tabla. Quien viera la base de datos —o un respaldo,
o un volcado— veía todas las contraseñas.

**Ahora:** derivadas con `scrypt` y sal por usuario, comparadas en tiempo
constante con `timingSafeEqual`. El texto plano no se guarda nunca.

### S3 · `multipleStatements: true` · **Alto**

```js
// dbconfig/db.config.js
multipleStatements: true // 🔹 Permite ejecutar múltiples consultas en una sola llamada
```

Con esta opción, cualquier inyección SQL deja de ser una consulta manipulada y
pasa a ser ejecución de comandos encadenados: `'; DROP TABLE asistencia; --`.
Las consultas usaban parámetros, así que no había una inyección abierta, pero
la opción quitaba la única red de seguridad que quedaba.

**Ahora:** no aplica. SQLite ejecuta una sentencia por llamada y todas las
consultas usan parámetros enlazados.

### S4 · Cookie de rol sin firmar · **Alto**

```js
// routes/login/login.js
res.cookie('userValidation', JSON.stringify({ user: usuario.user, rol: usuario.rol }), { httpOnly: true });
```

El rol viajaba dentro de la cookie sin firma. Bastaba reemplazarla por
`{"user":"x","rol":"Admin"}`. Tampoco tenía `secure` ni `sameSite`.

**Ahora:** la cookie solo lleva un identificador de sesión firmado. El rol se
lee de la base de datos en cada petición. `HttpOnly`, `SameSite=Lax` y `secure`
cuando corre detrás de HTTPS.

### S5 · Sin límite de intentos de inicio de sesión · **Alto**

No había ningún freno. Un script podía probar contraseñas indefinidamente.

**Ahora:** 10 intentos cada 10 minutos por IP, y 300 peticiones por minuto en
el resto de la API. Los intentos fallidos quedan en `auditoria`.

### S6 · El código QR era el número de documento · **Medio**

```js
// routes/reports/register-empleadosqr.js
QRCode.toDataURL(identificacion)
```

Dos consecuencias: el carné exponía el documento de la persona a cualquiera
con un lector, y quien conociera una cédula podía generar el código y marcar
por otro.

**Ahora:** el QR lleva un `randomUUID()` sin relación con los datos personales.
Si alguien pierde el carné, se regenera el código y el anterior deja de
funcionar (`POST /api/personal/:id/regenerar-qr`).

### S7 · `.env` versionado en el repositorio · **Medio**

El archivo con la configuración de la base de datos estaba en el control de
versiones. En este caso la contraseña estaba vacía, pero el patrón es el
problema: el día que se llena, se publica.

**Ahora:** `.env` está en `.gitignore`; se versiona `.env.example`. La clave de
firma se genera sola en `data/secret.key` si nadie la define.

### S8 · Sin cabeceras de seguridad ni defensa CSRF · **Medio**

No había Helmet, ni política de contenido, ni comprobación de origen. Cualquier
página externa podía disparar peticiones con la sesión del usuario.

**Ahora:** Helmet con una CSP estricta (`script-src 'self'`, sin `unsafe-eval`,
`frame-ancestors 'none'`), más `SameSite=Lax` y una cabecera obligatoria
`X-Requested-With` en todo lo que modifica datos.

### S9 · `node_modules` servido como estático · **Bajo**

```js
app.use('/exceljs', express.static(path.join(path.resolve(), 'node_modules/exceljs/dist')));
```

Exponer una carpeta de dependencias al público amplía la superficie sin
necesidad.

**Ahora:** se sirve un único archivo concreto, el del lector de QR, por ruta
exacta.

---

## Defectos de funcionamiento

### F1 · El reporte en pantalla y el descargado salían de tablas distintas · **Crítico**

Existían dos tablas para lo mismo: `asistencia` y `registro_asistencia`.

| Endpoint | Tabla que leía |
|---|---|
| `GET /showreport` | `asistencia` |
| `GET /asistencias` | `asistencia` |
| `POST /download-reports` | `registro_asistencia` |
| `POST /createreport` | `registro_asistencia` |
| `POST /asistencia` | `asistencia` |

El registro por QR escribía en `asistencia`. La descarga leía de
`registro_asistencia`. **El Excel que se entregaba no contenía las marcaciones
hechas con el lector.**

**Ahora:** una sola tabla `asistencia` y una vista `v_asistencia` que usan por
igual la pantalla y la exportación.

### F2 · Ruta que se caía siempre · **Alto**

```js
// routes/reports/register-empleadosqr.js
const [rows] = await db.query(`SELECT ...`);
```

`db` no se importaba en ese archivo —el módulo exporta `connection`—, así que
la variable no existía. Todo llamado a esa ruta lanzaba `ReferenceError`.

Además la ruta `/asistencias` estaba declarada dos veces, en este archivo y en
`showreport.js`. Express se queda con la primera registrada: **la rota**.

**Ahora:** cada ruta se declara una vez. La lista está en `src/app.js`.

### F3 · Todos los manejadores se registraban dos veces · **Alto**

```js
// scanqr.js
import RegisterEmpleadosQrRouter from './routes/reports/register-empleadosqr.js';
import RegisterPersonalQrRouter  from './routes/reports/register-empleadosqr.js';  // el mismo archivo
...
app.use(RegisterEmpleadosQrRouter);
app.use(RegisterPersonalQrRouter);
```

El mismo router montado dos veces: cada petición atravesaba la pila dos veces y
cada `console.group` se duplicaba.

**Ahora:** cada router se importa y se monta una sola vez, bajo su prefijo.

### F4 · El monitor del sistema reventaba cada 30 segundos · **Alto**

```js
// routes/dashboard/dashboard.js
activeConnections: connection._allConnections.length
```

`_allConnections` es propiedad interna de un *pool* de mysql2. Aquí la conexión
era única (`createConnection`), así que la propiedad no existe y leer `.length`
sobre `undefined` lanzaba. Dentro de un `setInterval` sin `try`, eso derribaba
el proceso.

**Ahora:** no existe ese monitor. El único temporizador es la limpieza de
sesiones vencidas, y va envuelto.

### F5 · Una conexión caída dejaba el sistema muerto · **Alto**

```js
const connection = mysql.createConnection(dbConfig);
connection.connect((err) => { if (err) { console.error(...); return; } });
```

Una sola conexión, sin *pool* y sin reconexión. Si MySQL cerraba la conexión
por inactividad —cosa que hace— la aplicación seguía viva pero ninguna consulta
volvía a funcionar hasta reiniciarla a mano. Y si la conexión fallaba al
arrancar, el servidor arrancaba igual, aparentemente sano.

**Ahora:** SQLite embebido. No hay conexión de red que se pueda caer.

### F6 · Las horas se calculaban a mano y salían mal · **Alto**

```js
// routes/reports/showreport.js
const dateColombia = new Date(fecha.getTime() - (5 * 60 * 60 * 1000));
```

```js
// routes/login/login.js
const colombiaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
access_date: colombiaTime.toISOString().split('T')[0],
```

El segundo caso desplaza dos veces: `toLocaleString` ya convierte a hora de
Bogotá, y `toISOString()` vuelve a restar el desfase. Entre las 19:00 y la
medianoche, la fecha guardada era la del día anterior.

El primero fija el desfase en −5 horas escrito a mano.

**Ahora:** `Intl.DateTimeFormat` con la zona configurada. Se guarda el instante
en UTC como fuente de verdad y la fecha y hora locales aparte. Hay pruebas para
el cruce de medianoche: `test/unidad.test.js`, bloque «fechas y horas».

### F7 · La redirección de dominio nunca se ejecutaba · **Medio**

```js
app.get('/', (req, res) => { res.sendFile(...); });

app.use((req, res, next) => {                       // registrado DESPUÉS
    if (req.headers.host === 'juniorfc.info') {
        return res.redirect(301, 'https://www.juniorfc.info' + req.url);
    }
    next();
});
```

Express evalúa en orden. La ruta raíz respondía antes de que el middleware
llegara a mirar el `host`, así que la redirección jamás se aplicaba a `/`, que
es justo donde importaba.

**Ahora:** eliminada junto con el resto de referencias al dominio anterior.

### F8 · Código inalcanzable tras el `export` · **Medio**

En `routes/dashboard/dashboard.js` había un `export default router;` a mitad de
archivo y más código después. Funciona por cómo se izan los módulos ES, pero
cualquiera que lea el archivo asume que ahí termina.

### F9 · Sin validación de entrada · **Medio**

Las rutas comprobaban que los campos existieran, nada más. Ni longitudes, ni
formatos, ni valores permitidos. El campo `tipo` aceptaba cualquier texto y
`createreport` recibía `nombre` como texto libre sin contrastarlo con la tabla
`personal`.

**Ahora:** `src/lib/validate.js` valida todo lo que entra; los errores salen
con el campo señalado y un mensaje en español.

### F10 · Una relectura marcaba la salida por error · **Alto**

*(No existía protección de ningún tipo en el original, y el mismo defecto
apareció al construir esta versión: queda documentado porque es el caso real
más frecuente en operación.)*

Los lectores de QR disparan varias veces la misma lectura. Sin guarda, la
persona marca entrada y un segundo después queda marcada como que salió.

**Ahora:** dentro de una ventana de 45 segundos la segunda lectura se descarta.
En modo automático se descarta siempre, no solo cuando coincide el tipo —que
era el error sutil—, porque el tipo se alterna. Probado en
`test/api.test.js`: «descarta la relectura inmediata en vez de marcar la salida».

### F11 · El lector de mano no funcionaba · **Medio**

*(Defecto detectado al probar esta versión en el navegador.)*

El formulario de registro manual dependía del envío implícito al pulsar Enter.
No se disparaba. Un lector de mano escribe el código y manda Enter: sin eso,
el flujo con lector queda inutilizable.

**Ahora:** la tecla se atiende de forma explícita, y también Tab, que es lo que
mandan algunos modelos.

### F12 · Barras de gráfica invisibles · **Bajo**

*(Detectado al probar esta versión.)*

`.barra-relleno` era un `<span>` sin `display: block`. Un elemento en línea
ignora la altura, así que la barra existía en el DOM con altura cero.

---

## Estructura y mantenimiento

### E1 · No había esquema de base de datos

El repositorio no incluía ni un `CREATE TABLE`. Para levantar el proyecto había
que deducir las tablas leyendo las consultas: `empleados`, `personal`,
`asistencia`, `registro_asistencia`, `session_details`, y adivinar tipos y
restricciones. En la práctica, nadie más podía instalarlo.

**Ahora:** `src/db/schema.sql` completo, aplicado solo al arrancar y versionado
con `PRAGMA user_version`. Instalar es ejecutar el instalador.

### E2 · `package.json` con dependencias equivocadas

```json
"node": "^18.20.6",     // Node.js como paquete de npm
"path": "^0.12.7",      // relleno de un módulo que ya trae Node
"xlsx": "^0.18.5",      // junto a exceljs: dos librerías para lo mismo
"pm2": "^5.4.3"         // gestor de procesos como dependencia de la aplicación
```

No había script `start`. La versión de `xlsx` publicada en npm arrastra
vulnerabilidades conocidas y no se actualiza desde ahí.

**Ahora:** 9 dependencias directas, 105 paquetes en total, ninguna advertencia
de obsolescencia al instalar. Se cambió `exceljs` (198 paquetes, cuatro avisos
de dependencias abandonadas) por `write-excel-file` (2 paquetes).

### E3 · Archivos sobrantes en el repositorio

`scanqr.js.save` —copia de seguridad de un editor de terminal— estaba
versionado, además de rutas y plantillas duplicadas entre
`public/js/components/` y `public/js/`.

---

## Referencias al cliente anterior

Se eliminó todo rastro del cliente para el que se hizo el proyecto:

| Dónde | Qué decía |
|---|---|
| `package.json` | `"name": "qr-proyect-junior-s.a"` |
| `package-lock.json` | el mismo nombre, dos veces |
| `scanqr.js` | redirección a `juniorfc.info` y `www.juniorfc.info` |
| `scanqr.js` | IP del servidor de producción, `46.202.177.241` |
| `README.md` | descripción que mencionaba el encargo |

El sistema es ahora genérico: el nombre de la organización se configura al
instalar y no hay ninguna referencia fija a un cliente, dominio o servidor.

---

## Qué se conservó

La idea y el flujo de trabajo eran correctos, y se mantienen:

- Registro de entrada y salida leyendo un código QR.
- Alta de personal con su código generado automáticamente.
- Roles diferenciados para portería, supervisión y administración.
- Panel con indicadores del día.
- Reporte filtrable y exportación a Excel.

Lo que cambió es cómo está construido por dentro.
