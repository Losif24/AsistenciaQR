-- =====================================================================
--  Asistencia QR - esquema completo
--  Se aplica solo en una base vacia. El versionado vive en migrate.js.
-- =====================================================================

-- Usuarios que entran al sistema (quienes operan la aplicacion).
CREATE TABLE IF NOT EXISTS usuarios (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre          TEXT    NOT NULL,
    apellido        TEXT    NOT NULL DEFAULT '',
    usuario         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    clave_hash      TEXT    NOT NULL,
    clave_salt      TEXT    NOT NULL,
    rol             TEXT    NOT NULL CHECK (rol IN ('admin', 'supervisor', 'operador')),
    telefono        TEXT,
    activo          INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
    debe_cambiar    INTEGER NOT NULL DEFAULT 0 CHECK (debe_cambiar IN (0, 1)),
    creado_en       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    actualizado_en  TEXT
);

-- Personas a las que se les controla la asistencia.
-- codigo_qr es un token opaco: el QR no expone el numero de documento.
CREATE TABLE IF NOT EXISTS personal (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre          TEXT    NOT NULL,
    documento       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    cargo           TEXT,
    area            TEXT,
    codigo_qr       TEXT    NOT NULL UNIQUE,
    qr_png          TEXT,
    activo          INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
    creado_en       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    actualizado_en  TEXT
);

-- Marcaciones. Una sola tabla: marcado_en (UTC) es la fuente de verdad y
-- fecha_local / hora_local son copias derivadas para filtrar e indexar rapido.
CREATE TABLE IF NOT EXISTS asistencia (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    personal_id     INTEGER NOT NULL REFERENCES personal(id) ON DELETE CASCADE,
    tipo            TEXT    NOT NULL CHECK (tipo IN ('entrada', 'salida')),
    marcado_en      TEXT    NOT NULL,
    fecha_local     TEXT    NOT NULL,
    hora_local      TEXT    NOT NULL,
    origen          TEXT    NOT NULL DEFAULT 'qr' CHECK (origen IN ('qr', 'manual')),
    registrado_por  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    nota            TEXT
);

-- Sesiones del lado del servidor. La cookie solo lleva el identificador firmado.
CREATE TABLE IF NOT EXISTS sesiones (
    id           TEXT    PRIMARY KEY,
    usuario_id   INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    creada_en    TEXT    NOT NULL,
    expira_en    TEXT    NOT NULL,
    ip           TEXT,
    agente       TEXT
);

-- Rastro de acciones sensibles. Sirve para auditar quien hizo que.
CREATE TABLE IF NOT EXISTS auditoria (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    accion      TEXT    NOT NULL,
    detalle     TEXT,
    ip          TEXT,
    creado_en   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_asistencia_fecha    ON asistencia (fecha_local DESC, hora_local DESC);
CREATE INDEX IF NOT EXISTS idx_asistencia_personal ON asistencia (personal_id, marcado_en DESC);
CREATE INDEX IF NOT EXISTS idx_asistencia_tipo     ON asistencia (tipo, fecha_local);
CREATE INDEX IF NOT EXISTS idx_personal_documento  ON personal (documento);
CREATE INDEX IF NOT EXISTS idx_personal_codigo     ON personal (codigo_qr);
CREATE INDEX IF NOT EXISTS idx_sesiones_expira     ON sesiones (expira_en);
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha     ON auditoria (creado_en DESC);

-- Vista de consulta para reportes: evita repetir el JOIN en cada endpoint.
CREATE VIEW IF NOT EXISTS v_asistencia AS
SELECT  a.id,
        a.personal_id,
        p.nombre        AS persona,
        p.documento,
        p.cargo,
        p.area,
        a.tipo,
        a.fecha_local,
        a.hora_local,
        a.marcado_en,
        a.origen,
        a.nota,
        COALESCE(u.usuario, 'sistema') AS registrado_por
FROM asistencia a
JOIN personal p ON p.id = a.personal_id
LEFT JOIN usuarios u ON u.id = a.registrado_por;
