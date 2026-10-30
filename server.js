'use strict';
// Ecofest · Logística — servidor Express + SQLite (node:sqlite, sin dependencias nativas)
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
// En Railway, si hay un volumen montado se usa siempre esa ruta (así no importa si DATA_DIR quedó mal escrita).
// Sin volumen, los archivos del contenedor se borran en cada despliegue.
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.DATA_DIR || path.join(__dirname, 'data');
const EN_RAILWAY = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_PROJECT_ID);
const PERSISTENTE = !EN_RAILWAY || !!process.env.RAILWAY_VOLUME_MOUNT_PATH;
if (!PERSISTENTE) console.warn('ATENCIÓN: no hay volumen montado en Railway. Los datos se borrarán en el próximo despliegue.');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'ecofest.db');

const db = new DatabaseSync(DB_FILE);
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  usuario TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'operador',
  activo INTEGER NOT NULL DEFAULT 1,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sesiones (
  token TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS ajustes (
  clave TEXT PRIMARY KEY,
  valor TEXT
);
CREATE TABLE IF NOT EXISTS vehiculos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  placa TEXT NOT NULL,
  descripcion TEXT,
  color TEXT,
  capacidad INTEGER,
  conductor TEXT,
  conductor_tel TEXT,
  conductor_doc TEXT,
  notas TEXT,
  activo INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS traslados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  vehiculo_id INTEGER REFERENCES vehiculos(id) ON DELETE SET NULL,
  pasajeros TEXT NOT NULL,
  contacto_tel TEXT,
  hora_recogida TEXT,
  lugar_recogida TEXT,
  destino TEXT,
  hora_regreso TEXT,
  lugar_regreso TEXT,
  destino_regreso TEXT,
  equipos TEXT,
  notas TEXT,
  estado TEXT NOT NULL DEFAULT 'programado',
  actualizado TEXT NOT NULL DEFAULT (datetime('now')),
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS bitacora_traslados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  traslado_id INTEGER NOT NULL REFERENCES traslados(id) ON DELETE CASCADE,
  estado TEXT NOT NULL,
  nota TEXT,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  fecha TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS entregas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  beneficiario TEXT NOT NULL,
  documento TEXT,
  telefono TEXT,
  cargo TEXT,
  monto INTEGER NOT NULL DEFAULT 0,
  concepto TEXT NOT NULL DEFAULT 'Almuerzo',
  estado TEXT NOT NULL DEFAULT 'pendiente',
  firma TEXT,
  firmado_en TEXT,
  entregado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  lat REAL,
  lng REAL,
  dispositivo TEXT,
  anulada_motivo TEXT,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_traslados_fecha ON traslados(fecha);
CREATE INDEX IF NOT EXISTS ix_entregas_fecha ON entregas(fecha);
`);

// Columnas agregadas después de la primera versión (bases ya creadas en Railway)
const columnasEntregas = db.prepare('PRAGMA table_info(entregas)').all().map((c) => c.name);
for (const [col, tipo] of [['ubicacion', 'TEXT'], ['grupo', 'TEXT'], ['es_grupo', 'INTEGER NOT NULL DEFAULT 0'],
  ['merienda_am', 'INTEGER NOT NULL DEFAULT 0'], ['almuerzo', 'INTEGER NOT NULL DEFAULT 0'], ['merienda_pm', 'INTEGER NOT NULL DEFAULT 0'],
  ['observacion', 'TEXT'], ['monto_manual', 'INTEGER NOT NULL DEFAULT 0'], ['recibido_por', 'TEXT'],
  ['jornada', 'TEXT'], ['personas', 'INTEGER']]) {
  if (!columnasEntregas.includes(col)) db.exec(`ALTER TABLE entregas ADD COLUMN ${col} ${tipo}`);
}

if (!db.prepare('PRAGMA table_info(usuarios)').all().some((c) => c.name === 'telefono')) db.exec('ALTER TABLE usuarios ADD COLUMN telefono TEXT');
const columnasVeh = db.prepare('PRAGMA table_info(vehiculos)').all().map((c) => c.name);
for (const col of ['conductor_licencia', 'modelo', 'servicio', 'propietario', 'propietario_doc', 'tarjeta_no',
  'soat_numero', 'soat_entidad', 'soat_vence', 'rtm_numero', 'rtm_entidad', 'rtm_vence']) {
  if (!columnasVeh.includes(col)) db.exec(`ALTER TABLE vehiculos ADD COLUMN ${col} TEXT`);
}

// Caja menor: salidas de efectivo que no son las entregas de alimentación planeadas (transporte propio, compras, etc.)
db.exec(`CREATE TABLE IF NOT EXISTS gastos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  categoria TEXT NOT NULL,
  concepto TEXT NOT NULL,
  beneficiario TEXT NOT NULL,
  documento TEXT,
  telefono TEXT,
  monto INTEGER NOT NULL,
  medio TEXT NOT NULL DEFAULT 'Efectivo',
  traslado_id INTEGER REFERENCES traslados(id) ON DELETE SET NULL,
  firma TEXT,
  soporte TEXT,
  registrado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  lat REAL,
  lng REAL,
  estado TEXT NOT NULL DEFAULT 'registrado',
  anulado_motivo TEXT,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_gastos_fecha ON gastos(fecha);`);

// ---------- utilidades ----------
function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(String(pin), salt, 32).toString('hex');
  return `${salt}:${h}`;
}
function checkPin(pin, stored) {
  const [salt, h] = String(stored).split(':');
  const test = crypto.scryptSync(String(pin), salt, 32);
  return crypto.timingSafeEqual(test, Buffer.from(h, 'hex'));
}
const ahora = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const txt = (v) => (v === undefined || v === null ? null : String(v).trim() || null);

function getAjustes() {
  const out = {
    evento: 'Ecofest',
    color_primario: '#183A2C',
    color_secundario: '#8DC63F',
    logo: '/logo.jpg',
    monto_defecto: '20000',
    base_caja: '0',
    valor_merienda: '0',
    valor_dia_entero: '40000',
    valor_medio_dia: '30000',
    valor_almuerzo: '0',
  };
  for (const r of db.prepare('SELECT clave, valor FROM ajustes').all()) out[r.clave] = r.valor;
  return out;
}

// Usuario administrador inicial
if (!db.prepare('SELECT COUNT(*) n FROM usuarios').get().n) {
  const usuario = (process.env.ADMIN_USER || 'admin').toLowerCase();
  const pin = process.env.ADMIN_PIN || 'ecofest2026';
  db.prepare('INSERT INTO usuarios (nombre, usuario, pin_hash, rol) VALUES (?,?,?,?)')
    .run('Administrador', usuario, hashPin(pin), 'admin');
  console.log(`Usuario admin creado: ${usuario}` + (process.env.ADMIN_PIN ? '' : ' / ecofest2026 (cámbielo)'));
}

// ---------- app ----------
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '5mb' }));

function leerCookie(req, nombre) {
  const c = req.headers.cookie || '';
  for (const part of c.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === nombre) return decodeURIComponent(v.join('='));
  }
  return null;
}

function auth(req, res, next) {
  const token = leerCookie(req, 'eco_sesion');
  if (token) {
    const u = db.prepare(`SELECT u.id, u.nombre, u.usuario, u.rol FROM sesiones s
      JOIN usuarios u ON u.id = s.usuario_id WHERE s.token = ? AND u.activo = 1`).get(token);
    if (u) { req.user = u; req.cookieToken = token; return next(); }
  }
  res.status(401).json({ error: 'Sesión no válida' });
}
function soloAdmin(req, res, next) {
  if (req.user.rol !== 'admin') return res.status(403).json({ error: 'Solo el administrador puede hacer esto' });
  next();
}
const api = express.Router();

// --- sesión ---
api.post('/login', (req, res) => {
  const usuario = String(req.body.usuario || '').trim().toLowerCase();
  const u = db.prepare('SELECT * FROM usuarios WHERE usuario = ? AND activo = 1').get(usuario);
  if (!u || !checkPin(req.body.pin || '', u.pin_hash)) {
    return res.status(401).json({ error: 'Usuario o clave incorrectos' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sesiones (token, usuario_id) VALUES (?,?)').run(token, u.id);
  const segura = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `eco_sesion=${token}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax${segura}`);
  res.json({ id: u.id, nombre: u.nombre, usuario: u.usuario, rol: u.rol, version: VERSION, persistente: PERSISTENTE });
});
api.post('/logout', (req, res) => {
  const token = leerCookie(req, 'eco_sesion');
  if (token) db.prepare('DELETE FROM sesiones WHERE token = ?').run(token);
  res.setHeader('Set-Cookie', 'eco_sesion=; Path=/; Max-Age=0');
  res.json({ ok: true });
});
api.get('/ajustes-publicos', (req, res) => {
  const a = getAjustes();
  res.json({ evento: a.evento, color_primario: a.color_primario, color_secundario: a.color_secundario, logo: a.logo, monto_defecto: a.monto_defecto,
    valor_merienda: a.valor_merienda, valor_almuerzo: a.valor_almuerzo, valor_dia_entero: a.valor_dia_entero, valor_medio_dia: a.valor_medio_dia });
});

api.use(auth);
api.get('/yo', (req, res) => res.json({ ...req.user, version: VERSION, persistente: PERSISTENTE }));

// --- ajustes ---
api.get('/ajustes', (req, res) => res.json(getAjustes()));
api.put('/ajustes', soloAdmin, (req, res) => {
  const permitidas = ['evento', 'color_primario', 'color_secundario', 'logo', 'monto_defecto', 'valor_merienda', 'valor_almuerzo', 'valor_dia_entero', 'valor_medio_dia', 'base_caja'];
  const up = db.prepare('INSERT INTO ajustes (clave, valor) VALUES (?,?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor');
  for (const k of permitidas) if (k in req.body) up.run(k, req.body[k] === null ? null : String(req.body[k]));
  recalcularPendientes();
  res.json(getAjustes());
});

// --- usuarios ---
api.get('/usuarios', soloAdmin, (req, res) => {
  res.json(db.prepare('SELECT id, nombre, usuario, rol, activo, telefono FROM usuarios ORDER BY activo DESC, nombre').all());
});
api.post('/usuarios', soloAdmin, (req, res) => {
  const { nombre, usuario, pin, rol, telefono } = req.body;
  if (!nombre || !usuario || !pin) return res.status(400).json({ error: 'Nombre, usuario y clave son obligatorios' });
  if (String(pin).length < 4) return res.status(400).json({ error: 'La clave debe tener mínimo 4 caracteres' });
  try {
    const r = db.prepare('INSERT INTO usuarios (nombre, usuario, pin_hash, rol, telefono) VALUES (?,?,?,?,?)')
      .run(String(nombre).trim(), String(usuario).trim().toLowerCase().replace(/\s+/g, ''), hashPin(pin), rol === 'admin' ? 'admin' : 'operador', txt(telefono));
    res.json({ id: Number(r.lastInsertRowid) });
  } catch (e) {
    res.status(400).json({ error: 'Ese usuario ya existe' });
  }
});
api.get('/usuarios/:id', soloAdmin, (req, res) => {
  const u = db.prepare('SELECT id, nombre, usuario, rol, activo, telefono FROM usuarios WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'No existe' });
  res.json(u);
});
api.put('/usuarios/:id', soloAdmin, (req, res) => {
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'No existe' });
  const b = req.body;
  const nombre = 'nombre' in b ? txt(b.nombre) : u.nombre;
  const usuario = 'usuario' in b ? (txt(b.usuario) || '').toLowerCase().replace(/\s+/g, '') : u.usuario;
  const rol = 'rol' in b ? (b.rol === 'admin' ? 'admin' : 'operador') : u.rol;
  const activo = 'activo' in b ? (b.activo && b.activo !== '0' ? 1 : 0) : u.activo;
  const telefono = 'telefono' in b ? txt(b.telefono) : u.telefono;
  if (!nombre || !usuario) return res.status(400).json({ error: 'Nombre y usuario son obligatorios' });
  if (b.pin && String(b.pin).length < 4) return res.status(400).json({ error: 'La clave debe tener mínimo 4 caracteres' });
  // Nunca dejar la app sin un administrador activo
  const quedaAdmin = rol === 'admin' && activo;
  if (u.rol === 'admin' && u.activo && !quedaAdmin) {
    const otros = db.prepare(`SELECT COUNT(*) n FROM usuarios WHERE rol = 'admin' AND activo = 1 AND id != ?`).get(u.id).n;
    if (!otros) return res.status(400).json({ error: 'Debe quedar al menos un administrador activo' });
  }
  if (u.id === req.user.id && !quedaAdmin) return res.status(400).json({ error: 'No puede quitarse a sí mismo el perfil de administrador ni desactivarse' });
  try {
    db.prepare('UPDATE usuarios SET nombre = ?, usuario = ?, rol = ?, activo = ?, telefono = ? WHERE id = ?')
      .run(nombre, usuario, rol, activo, telefono, u.id);
  } catch (e) {
    return res.status(400).json({ error: 'Ese nombre de usuario ya lo tiene otra persona' });
  }
  if (b.pin) db.prepare('UPDATE usuarios SET pin_hash = ? WHERE id = ?').run(hashPin(b.pin), u.id);
  // Si cambió el acceso (desactivado, clave o rol), se cierran sus sesiones abiertas
  if (!activo || b.pin || rol !== u.rol) db.prepare('DELETE FROM sesiones WHERE usuario_id = ? AND token != ?').run(u.id, req.cookieToken || '');
  res.json({ ok: true });
});

// --- vehículos ---
const CAMPOS_VEH = ['placa', 'descripcion', 'color', 'capacidad', 'conductor', 'conductor_tel', 'conductor_doc', 'conductor_licencia', 'modelo', 'servicio', 'propietario', 'propietario_doc', 'tarjeta_no',
  'soat_numero', 'soat_entidad', 'soat_vence', 'rtm_numero', 'rtm_entidad', 'rtm_vence', 'notas'];
function datosVehiculo(b) {
  return CAMPOS_VEH.map((k) => (k === 'capacidad' ? (b[k] ? Number(b[k]) : null) : k === 'placa' ? (txt(b[k]) || '').toUpperCase() : txt(b[k])));
}
// --- lectura del frente de cédula o licencia con Claude (la foto no se guarda) ---
const claude = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
const ESQUEMA_DOCUMENTO = {
  type: 'object',
  additionalProperties: false,
  required: ['legible', 'tipo', 'numero', 'nombres', 'apellidos', 'sexo', 'nacimiento', 'rh', 'expedicion', 'vence', 'categorias', 'organismo', 'nacionalidad'],
  properties: {
    legible: { type: 'boolean', description: 'false si la foto no es un documento de identidad o no se puede leer' },
    tipo: { type: 'string', enum: ['Cédula de ciudadanía', 'Licencia de conducción', 'Tarjeta de identidad', 'Cédula de extranjería',
      'Permiso por Protección Temporal (PPT)', 'Pasaporte', 'Otro'] },
    numero: { type: 'string', description: 'Solo dígitos, sin puntos' },
    nombres: { type: 'string' },
    apellidos: { type: 'string' },
    sexo: { type: 'string', description: 'M, F o vacío' },
    nacimiento: { type: 'string', description: 'AAAA-MM-DD o vacío' },
    rh: { type: 'string', description: 'Ej. O+ o vacío' },
    expedicion: { type: 'string', description: 'AAAA-MM-DD o vacío' },
    vence: { type: 'string', description: 'AAAA-MM-DD o vacío' },
    categorias: { type: 'string', description: 'Categorías de la licencia separadas por coma, ej. B1, C1; vacío si no aparecen' },
    organismo: { type: 'string', description: 'Organismo de tránsito o lugar de expedición, o vacío' },
    nacionalidad: { type: 'string', description: 'Nacionalidad si aparece (ej. Venezolana), o vacío' },
  },
};
const ESQUEMA_VIGENCIA = {
  type: 'object',
  additionalProperties: false,
  required: ['legible', 'placa', 'numero', 'entidad', 'desde', 'vence'],
  properties: {
    legible: { type: 'boolean', description: 'false si la foto no es el documento pedido o no se puede leer' },
    placa: { type: 'string', description: 'Ej. ABC123, sin espacios ni guiones' },
    numero: { type: 'string', description: 'Número de póliza (SOAT) o de certificado (técnico-mecánica)' },
    entidad: { type: 'string', description: 'Aseguradora (SOAT) o nombre del CDA (técnico-mecánica)' },
    desde: { type: 'string', description: 'Inicio de vigencia o fecha de expedición, AAAA-MM-DD o vacío' },
    vence: { type: 'string', description: 'Fin de vigencia o fecha de vencimiento, AAAA-MM-DD o vacío' },
  },
};
const ESQUEMA_TARJETA = {
  type: 'object',
  additionalProperties: false,
  required: ['legible', 'placa', 'marca', 'linea', 'modelo', 'color', 'clase', 'servicio', 'capacidad', 'propietario', 'propietario_doc', 'tarjeta_no'],
  properties: {
    legible: { type: 'boolean', description: 'false si la foto no es una licencia de tránsito (tarjeta de propiedad) o no se puede leer' },
    placa: { type: 'string', description: 'Ej. ABC123, sin espacios ni guiones' },
    marca: { type: 'string' },
    linea: { type: 'string' },
    modelo: { type: 'string', description: 'Año del modelo, ej. 2019' },
    color: { type: 'string' },
    clase: { type: 'string', description: 'Ej. Automóvil, Camioneta, Microbús, Bus' },
    servicio: { type: 'string', description: 'Particular, Público u Oficial' },
    capacidad: { type: 'string', description: 'Número de pasajeros sentados, solo dígitos; vacío si no aparece' },
    propietario: { type: 'string', description: 'Nombre completo del propietario' },
    propietario_doc: { type: 'string', description: 'Número de identificación del propietario, solo dígitos' },
    tarjeta_no: { type: 'string', description: 'Número de la licencia de tránsito' },
  },
};
const LECTURAS = {
  persona: {
    esquema: ESQUEMA_DOCUMENTO,
    texto: 'Es la foto de un documento de identidad expedido en Colombia (cédula, tarjeta de identidad, cédula de extranjería, '
      + 'PPT o licencia de conducción) tomada con el celular. '
      + 'Transcribe los datos tal como aparecen impresos, con tildes y Ñ. Fechas en formato AAAA-MM-DD (en el documento vienen DD-MM-AAAA). '
      + 'No inventes: si un dato no aparece o no se lee con seguridad, déjalo vacío.',
    noLegible: 'No se reconoce un documento en la foto. Tómela de frente, con buena luz y sin reflejos.',
  },
  vehiculo: {
    esquema: ESQUEMA_TARJETA,
    texto: 'Es la foto de una licencia de tránsito colombiana (tarjeta de propiedad de un vehículo) tomada con el celular. '
      + 'Transcribe los datos tal como aparecen impresos, con tildes y Ñ. '
      + 'No inventes: si un dato no aparece o no se lee con seguridad, déjalo vacío.',
    noLegible: 'No se reconoce una tarjeta de propiedad en la foto. Tómela de frente, con buena luz y sin reflejos.',
  },
  soat: {
    esquema: ESQUEMA_VIGENCIA,
    texto: 'Es la foto de un SOAT colombiano (seguro obligatorio de accidentes de tránsito), impreso o en pantalla. '
      + 'Transcribe placa, número de póliza, aseguradora y la vigencia (desde y hasta). Fechas en formato AAAA-MM-DD. '
      + 'No inventes: si un dato no aparece o no se lee con seguridad, déjalo vacío.',
    noLegible: 'No se reconoce un SOAT en la foto. Tómela de frente, con buena luz y sin reflejos.',
  },
  tecnomecanica: {
    esquema: ESQUEMA_VIGENCIA,
    texto: 'Es la foto de un certificado de revisión técnico-mecánica y de emisiones contaminantes de Colombia. '
      + 'Transcribe placa, número de certificado, nombre del CDA, fecha de expedición (desde) y fecha de vencimiento. '
      + 'Fechas en formato AAAA-MM-DD. No inventes: si un dato no aparece o no se lee con seguridad, déjalo vacío.',
    noLegible: 'No se reconoce un certificado de técnico-mecánica en la foto. Tómela de frente, con buena luz y sin reflejos.',
  },
};
api.post('/leer-documento', async (req, res) => {
  if (!claude) return res.status(503).json({ error: 'Falta configurar ANTHROPIC_API_KEY en Railway para leer fotos.' });
  const lectura = LECTURAS[req.body.clase || 'persona'];
  if (!lectura) return res.status(400).json({ error: 'Tipo de documento no válido' });
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(String(req.body.imagen || ''));
  if (!m) return res.status(400).json({ error: 'Foto no válida' });
  try {
    const r = await claude.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: lectura.esquema } },
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
        { type: 'text', text: lectura.texto },
      ] }],
    });
    if (r.stop_reason === 'refusal') return res.status(422).json({ error: 'No se pudo leer esta foto. Escriba los datos a mano.' });
    const texto = r.content.find((b) => b.type === 'text');
    const d = JSON.parse(texto ? texto.text : '{}');
    if (!d.legible) return res.status(422).json({ error: lectura.noLegible });
    // Documentos de persona y del propietario: solo dígitos. Póliza y certificado pueden llevar letras.
    const soloDigitos = lectura.esquema === ESQUEMA_VIGENCIA ? ['capacidad'] : ['numero', 'capacidad', 'propietario_doc'];
    for (const k of soloDigitos) if (k in d) d[k] = String(d[k] || '').replace(/\D/g, '');
    if ('numero' in d) d.numero = String(d.numero || '').trim();
    if ('placa' in d) d.placa = String(d.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    res.json(d);
  } catch (e) {
    console.error('leer-documento:', e.status || '', e.message);
    res.status(502).json({ error: e instanceof Anthropic.RateLimitError ? 'Demasiadas lecturas seguidas; intente en un minuto.' : 'No se pudo leer la foto. Intente de nuevo.' });
  }
});

api.get('/vehiculos', (req, res) => {
  res.json(db.prepare('SELECT * FROM vehiculos WHERE activo = 1 ORDER BY placa').all());
});
api.post('/vehiculos', soloAdmin, (req, res) => {
  if (!txt(req.body.placa)) return res.status(400).json({ error: 'La placa es obligatoria' });
  const r = db.prepare(`INSERT INTO vehiculos (${CAMPOS_VEH.join(',')}) VALUES (${CAMPOS_VEH.map(() => '?').join(',')})`)
    .run(...datosVehiculo(req.body));
  res.json({ id: Number(r.lastInsertRowid) });
});
api.put('/vehiculos/:id', soloAdmin, (req, res) => {
  if (!txt(req.body.placa)) return res.status(400).json({ error: 'La placa es obligatoria' });
  db.prepare(`UPDATE vehiculos SET ${CAMPOS_VEH.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
    .run(...datosVehiculo(req.body), req.params.id);
  res.json({ ok: true });
});
api.delete('/vehiculos/:id', soloAdmin, (req, res) => {
  db.prepare('UPDATE vehiculos SET activo = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- traslados ---
const ESTADOS_TRASLADO = ['programado', 'en_camino', 'recogido', 'entregado', 'esperando_regreso', 'regreso', 'finalizado', 'cancelado'];
const CAMPOS_TR = ['fecha', 'vehiculo_id', 'pasajeros', 'contacto_tel', 'hora_recogida', 'lugar_recogida', 'destino',
  'hora_regreso', 'lugar_regreso', 'destino_regreso', 'equipos', 'notas'];
function datosTraslado(b) {
  return CAMPOS_TR.map((k) => (k === 'vehiculo_id' ? (b[k] ? Number(b[k]) : null) : txt(b[k])));
}
const SQL_TRASLADOS = `SELECT t.*, v.placa, v.descripcion AS vehiculo_desc, v.color AS vehiculo_color,
  v.conductor, v.conductor_tel FROM traslados t LEFT JOIN vehiculos v ON v.id = t.vehiculo_id`;

api.get('/traslados', (req, res) => {
  const { fecha, vehiculo_id } = req.query;
  const cond = []; const params = [];
  if (fecha) { cond.push('t.fecha = ?'); params.push(fecha); }
  if (vehiculo_id) { cond.push('t.vehiculo_id = ?'); params.push(vehiculo_id); }
  const where = cond.length ? ` WHERE ${cond.join(' AND ')}` : '';
  res.json(db.prepare(`${SQL_TRASLADOS}${where} ORDER BY t.fecha, t.hora_recogida, t.id`).all(...params));
});
api.get('/traslados/:id', (req, res) => {
  const t = db.prepare(`${SQL_TRASLADOS} WHERE t.id = ?`).get(req.params.id);
  if (!t) return res.status(404).json({ error: 'No existe' });
  t.bitacora = db.prepare(`SELECT b.*, u.nombre AS usuario FROM bitacora_traslados b
    LEFT JOIN usuarios u ON u.id = b.usuario_id WHERE b.traslado_id = ? ORDER BY b.id DESC`).all(t.id);
  res.json(t);
});
function crearTraslado(b, userId) {
  const r = db.prepare(`INSERT INTO traslados (${CAMPOS_TR.join(',')}) VALUES (${CAMPOS_TR.map(() => '?').join(',')})`)
    .run(...datosTraslado(b));
  const id = Number(r.lastInsertRowid);
  db.prepare('INSERT INTO bitacora_traslados (traslado_id, estado, nota, usuario_id) VALUES (?,?,?,?)')
    .run(id, 'programado', 'Creado', userId);
  return id;
}
api.post('/traslados', soloAdmin, (req, res) => {
  if (!txt(req.body.fecha) || !txt(req.body.pasajeros)) return res.status(400).json({ error: 'Fecha y pasajeros son obligatorios' });
  res.json({ id: crearTraslado(req.body, req.user.id) });
});
api.post('/traslados/importar', soloAdmin, (req, res) => {
  const filas = Array.isArray(req.body.filas) ? req.body.filas : [];
  const placas = new Map(db.prepare('SELECT id, placa FROM vehiculos WHERE activo = 1').all()
    .map((v) => [v.placa.replace(/\W/g, '').toUpperCase(), v.id]));
  let n = 0; const errores = [];
  db.exec('BEGIN');
  try {
    filas.forEach((f, i) => {
      if (!txt(f.fecha) || !txt(f.pasajeros)) { errores.push(`Fila ${i + 1}: falta fecha o pasajeros`); return; }
      if (f.placa) f.vehiculo_id = placas.get(String(f.placa).replace(/\W/g, '').toUpperCase()) || null;
      if (f.placa && !f.vehiculo_id) errores.push(`Fila ${i + 1}: placa ${f.placa} no registrada (quedó sin vehículo)`);
      crearTraslado(f, req.user.id); n++;
    });
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); return res.status(400).json({ error: e.message }); }
  res.json({ creados: n, errores });
});
api.put('/traslados/:id', soloAdmin, (req, res) => {
  if (!txt(req.body.fecha) || !txt(req.body.pasajeros)) return res.status(400).json({ error: 'Fecha y pasajeros son obligatorios' });
  db.prepare(`UPDATE traslados SET ${CAMPOS_TR.map((k) => `${k} = ?`).join(', ')}, actualizado = ? WHERE id = ?`)
    .run(...datosTraslado(req.body), ahora(), req.params.id);
  res.json({ ok: true });
});
api.post('/traslados/:id/estado', (req, res) => {
  const { estado, nota } = req.body;
  if (!ESTADOS_TRASLADO.includes(estado)) return res.status(400).json({ error: 'Estado no válido' });
  const t = db.prepare('SELECT id FROM traslados WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'No existe' });
  db.prepare('UPDATE traslados SET estado = ?, actualizado = ? WHERE id = ?').run(estado, ahora(), t.id);
  db.prepare('INSERT INTO bitacora_traslados (traslado_id, estado, nota, usuario_id) VALUES (?,?,?,?)')
    .run(t.id, estado, txt(nota), req.user.id);
  res.json({ ok: true });
});
api.delete('/traslados/:id', soloAdmin, (req, res) => {
  db.prepare('DELETE FROM traslados WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- entregas de dinero ---
const SQL_ENTREGAS = `SELECT e.*, u.nombre AS entregado_por_nombre FROM entregas e
  LEFT JOIN usuarios u ON u.id = e.entregado_por`;
api.get('/entregas', (req, res) => {
  const { fecha, estado } = req.query;
  const cond = []; const params = [];
  if (fecha) { cond.push('e.fecha = ?'); params.push(fecha); }
  if (estado) { cond.push('e.estado = ?'); params.push(estado); }
  const where = cond.length ? ` WHERE ${cond.join(' AND ')}` : '';
  // la firma no se manda en el listado para no pesar en el celular
  const filas = db.prepare(`${SQL_ENTREGAS}${where} ORDER BY e.estado = 'pendiente' DESC, e.ubicacion, e.es_grupo, e.beneficiario`).all(...params);
  res.json(filas.map(({ firma, ...r }) => ({ ...r, tiene_firma: !!firma, comidas: conceptoComidas(r) })));
});
api.get('/entregas/resumen', (req, res) => {
  const { fecha } = req.query;
  const where = fecha ? 'WHERE fecha = ?' : '';
  const params = fecha ? [fecha] : [];
  res.json(db.prepare(`SELECT estado, COUNT(*) n, COALESCE(SUM(monto),0) total,
    SUM(CASE WHEN jornada = 'medio' THEN 0 ELSE personas END) dia_entero, SUM(CASE WHEN jornada = 'medio' THEN personas ELSE 0 END) medio_dia
    FROM entregas ${where} GROUP BY estado`).all(...params));
});
api.get('/entregas/:id', (req, res) => {
  const e = db.prepare(`${SQL_ENTREGAS} WHERE e.id = ?`).get(req.params.id);
  if (!e) return res.status(404).json({ error: 'No existe' });
  res.json({ ...e, comidas: conceptoComidas(e) });
});
const entero = (v) => Math.max(0, Math.round(Number(String(v ?? '').replace(/[^\d]/g, '')) || 0));
// Alimentación por jornada: cada entrega es de día entero o de medio día, por persona (un grupo multiplica por sus personas)
const JORNADAS = { entero: 'Día entero', medio: 'Medio día' };
function jornadaDe(b) {
  if (JORNADAS[b.jornada]) return b.jornada;
  const t = String(b.jornada || '').toLowerCase();
  if (t.includes('medio')) return 'medio';
  if (t.includes('entero') || t.includes('complet')) return 'entero';
  // planillas con comidas sueltas: con almuerzo es día entero; solo meriendas, medio día
  if (entero(b.almuerzo) > 0) return 'entero';
  return entero(b.merienda_am) + entero(b.merienda_pm) > 0 ? 'medio' : 'entero';
}
function personasDe(b, esGrupo) {
  const n = entero(b.personas);
  if (n) return n;
  return esGrupo ? Math.max(entero(b.merienda_am), entero(b.almuerzo), entero(b.merienda_pm), 1) : 1;
}
function conceptoComidas(e) {
  const j = (JORNADAS[e.jornada] || 'Día entero').toLowerCase();
  return e.personas > 1 ? `${j} (${e.personas} personas)` : j;
}
function montoComidas(e, a = getAjustes()) {
  const valor = e.jornada === 'medio' ? entero(a.valor_medio_dia) : entero(a.valor_dia_entero);
  return valor * (e.personas || 1);
}
function recalcularPendientes() {
  const a = getAjustes();
  const up = db.prepare('UPDATE entregas SET monto = ? WHERE id = ?');
  for (const e of db.prepare(`SELECT * FROM entregas WHERE estado = 'pendiente' AND monto_manual = 0 AND jornada IS NOT NULL`).all()) {
    up.run(montoComidas(e, a), e.id);
  }
}
// Entregas creadas antes de las jornadas: se les asigna la jornada por sus comidas y se recalcula el monto de las pendientes
if (db.prepare('SELECT COUNT(*) n FROM entregas WHERE jornada IS NULL').get().n) {
  db.exec(`UPDATE entregas SET jornada = CASE WHEN almuerzo > 0 THEN 'entero' WHEN merienda_am + merienda_pm > 0 THEN 'medio' ELSE 'entero' END,
    personas = CASE WHEN es_grupo = 1 THEN MAX(merienda_am, almuerzo, merienda_pm, 1) ELSE 1 END WHERE jornada IS NULL`);
  recalcularPendientes();
}
function crearEntrega(b) {
  const esGrupo = !!(b.es_grupo && b.es_grupo !== '0');
  const e = {
    merienda_am: entero(b.merienda_am), almuerzo: entero(b.almuerzo), merienda_pm: entero(b.merienda_pm),
    jornada: jornadaDe(b), personas: personasDe(b, esGrupo),
  };
  const calculado = montoComidas(e);
  const escrito = b.monto === undefined || b.monto === '' ? 0 : entero(b.monto);
  const manual = escrito > 0 && escrito !== calculado;
  const r = db.prepare(`INSERT INTO entregas (fecha, beneficiario, documento, telefono, cargo, monto, concepto, ubicacion, grupo,
    es_grupo, merienda_am, almuerzo, merienda_pm, observacion, monto_manual, jornada, personas) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(txt(b.fecha), txt(b.beneficiario), txt(b.documento), txt(b.telefono), txt(b.cargo), manual ? escrito : calculado,
      txt(b.concepto) || 'Alimentación', txt(b.ubicacion), txt(b.grupo), esGrupo ? 1 : 0,
      e.merienda_am, e.almuerzo, e.merienda_pm, txt(b.observacion), manual ? 1 : 0, e.jornada, e.personas);
  return Number(r.lastInsertRowid);
}
// Crear una entrega (pendiente). Cualquier usuario puede registrar a alguien que no estaba en la lista.
api.post('/entregas', (req, res) => {
  if (!txt(req.body.fecha) || !txt(req.body.beneficiario)) return res.status(400).json({ error: 'Fecha y nombre son obligatorios' });
  res.json({ id: crearEntrega(req.body) });
});
api.post('/entregas/importar', soloAdmin, (req, res) => {
  const filas = Array.isArray(req.body.filas) ? req.body.filas : [];
  let n = 0; const errores = [];
  db.exec('BEGIN');
  try {
    filas.forEach((f, i) => {
      if (!txt(f.fecha) || !txt(f.beneficiario)) { errores.push(`Fila ${i + 1}: falta fecha o nombre`); return; }
      crearEntrega(f); n++;
    });
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); return res.status(400).json({ error: e.message }); }
  res.json({ creados: n, errores });
});
api.put('/entregas/:id', (req, res) => {
  const e = db.prepare('SELECT * FROM entregas WHERE id = ?').get(req.params.id);
  if (!e) return res.status(404).json({ error: 'No existe' });
  if (e.estado !== 'pendiente' && req.user.rol !== 'admin') return res.status(403).json({ error: 'Una entrega firmada no se puede editar' });
  const b = req.body;
  const esGrupo = 'es_grupo' in b ? (b.es_grupo && b.es_grupo !== '0' ? 1 : 0) : e.es_grupo;
  const c = {
    jornada: JORNADAS[b.jornada] ? b.jornada : e.jornada || 'entero',
    personas: esGrupo ? (entero(b.personas) || e.personas || 1) : 1,
  };
  // Si el monto escrito es el mismo que daría el cálculo (o viene vacío), se sigue calculando solo
  const calculado = montoComidas(c);
  const escrito = b.monto === undefined || b.monto === '' ? 0 : entero(b.monto);
  const manual = escrito > 0 && escrito !== calculado;
  db.prepare(`UPDATE entregas SET fecha = ?, beneficiario = ?, documento = ?, telefono = ?, cargo = ?, monto = ?, concepto = ?,
    ubicacion = ?, grupo = ?, es_grupo = ?, jornada = ?, personas = ?, observacion = ?, monto_manual = ? WHERE id = ?`)
    .run(txt(b.fecha) || e.fecha, txt(b.beneficiario) || e.beneficiario, txt(b.documento), txt(b.telefono), txt(b.cargo),
      manual ? escrito : calculado, txt(b.concepto) || e.concepto, 'ubicacion' in b ? txt(b.ubicacion) : e.ubicacion,
      'grupo' in b ? txt(b.grupo) : e.grupo, esGrupo, c.jornada, c.personas,
      'observacion' in b ? txt(b.observacion) : e.observacion, manual ? 1 : 0, e.id);
  res.json({ ok: true });
});
api.post('/entregas/:id/firmar', (req, res) => {
  const e = db.prepare('SELECT * FROM entregas WHERE id = ?').get(req.params.id);
  if (!e) return res.status(404).json({ error: 'No existe' });
  if (e.estado !== 'pendiente') return res.status(409).json({ error: 'Esta entrega ya fue firmada o anulada' });
  const { firma, documento, monto, lat, lng } = req.body;
  const recibidoPor = txt(req.body.recibido_por);
  if (e.es_grupo && !recibidoPor) return res.status(400).json({ error: 'Escriba el nombre de quien recibe por el grupo' });
  if (!/^data:image\/png;base64,/.test(firma || '') || firma.length < 2000) return res.status(400).json({ error: 'Falta la firma' });
  if (!txt(documento) && !txt(e.documento)) return res.status(400).json({ error: 'Falta el número de documento' });
  const montoFinal = monto !== undefined && monto !== '' ? Math.round(Number(String(monto).replace(/[^\d]/g, '')) || 0) : e.monto;
  if (!montoFinal) return res.status(400).json({ error: 'El monto debe ser mayor a cero' });
  const jornada = JORNADAS[req.body.jornada] ? req.body.jornada : e.jornada || 'entero';
  db.prepare(`UPDATE entregas SET estado = 'entregado', firma = ?, firmado_en = ?, entregado_por = ?, documento = ?, monto = ?,
    lat = ?, lng = ?, dispositivo = ?, recibido_por = ?, jornada = ? WHERE id = ?`).run(firma, ahora(), req.user.id, txt(documento) || e.documento, montoFinal,
    lat ?? null, lng ?? null, String(req.headers['user-agent'] || '').slice(0, 250), recibidoPor, jornada, e.id);
  res.json({ ok: true });
});
api.post('/entregas/:id/anular', soloAdmin, (req, res) => {
  const motivo = txt(req.body.motivo);
  if (!motivo) return res.status(400).json({ error: 'Escriba el motivo de la anulación' });
  db.prepare(`UPDATE entregas SET estado = 'anulada', anulada_motivo = ? WHERE id = ?`).run(motivo, req.params.id);
  res.json({ ok: true });
});
api.delete('/entregas/:id', soloAdmin, (req, res) => {
  const e = db.prepare('SELECT estado FROM entregas WHERE id = ?').get(req.params.id);
  if (e && e.estado !== 'pendiente') return res.status(409).json({ error: 'Solo se borran pendientes. Las firmadas se anulan.' });
  db.prepare('DELETE FROM entregas WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- caja menor ---
const CATEGORIAS_CAJA = ['Transporte', 'Alimentación', 'Materiales', 'Logística', 'Otros'];
const MEDIOS_CAJA = ['Efectivo', 'Nequi', 'Daviplata', 'Transferencia'];
const SQL_GASTOS = `SELECT g.*, u.nombre AS registrado_por_nombre,
  CASE WHEN t.id IS NULL THEN NULL ELSE t.fecha || ' ' || COALESCE(t.hora_recogida, '') || ' · ' || t.pasajeros END AS traslado_desc
  FROM gastos g LEFT JOIN usuarios u ON u.id = g.registrado_por LEFT JOIN traslados t ON t.id = g.traslado_id`;
api.get('/gastos', (req, res) => {
  const { fecha, categoria, traslado_id } = req.query;
  const cond = []; const params = [];
  if (fecha) { cond.push('g.fecha = ?'); params.push(fecha); }
  if (categoria) { cond.push('g.categoria = ?'); params.push(categoria); }
  if (traslado_id) { cond.push('g.traslado_id = ?'); params.push(traslado_id); }
  const where = cond.length ? ` WHERE ${cond.join(' AND ')}` : '';
  // sin firma ni foto en el listado, para que cargue rápido en el celular
  res.json(db.prepare(`${SQL_GASTOS}${where} ORDER BY g.id DESC`).all(...params)
    .map(({ firma, soporte, ...g }) => ({ ...g, tiene_soporte: !!soporte })));
});
// Totales: salidas de caja menor + recibidos de alimentación firmados, contra la base de caja
api.get('/gastos/resumen', (req, res) => {
  const { fecha } = req.query;
  const f = fecha ? ' AND fecha = ?' : ''; const p = fecha ? [fecha] : [];
  const porCategoria = db.prepare(`SELECT categoria, COUNT(*) n, SUM(monto) total FROM gastos WHERE estado = 'registrado'${f} GROUP BY categoria`).all(...p);
  const totalGastos = db.prepare(`SELECT COALESCE(SUM(monto),0) t FROM gastos WHERE estado = 'registrado'`).get().t;
  const totalEntregas = db.prepare(`SELECT COALESCE(SUM(monto),0) t FROM entregas WHERE estado = 'entregado'`).get().t;
  const base = Math.round(Number(getAjustes().base_caja) || 0);
  res.json({ por_categoria: porCategoria, total_gastos: totalGastos, total_entregas: totalEntregas, base,
    saldo: base ? base - totalGastos - totalEntregas : null, categorias: CATEGORIAS_CAJA, medios: MEDIOS_CAJA });
});
api.get('/gastos/:id', (req, res) => {
  const g = db.prepare(`${SQL_GASTOS} WHERE g.id = ?`).get(req.params.id);
  if (!g) return res.status(404).json({ error: 'No existe' });
  res.json({ ...g, consecutivo: consecutivoCaja(g.id) });
});
api.post('/gastos', (req, res) => {
  const b = req.body;
  const monto = Math.round(Number(String(b.monto ?? '').replace(/[^\d]/g, '')) || 0);
  if (!txt(b.fecha)) return res.status(400).json({ error: 'Falta la fecha' });
  if (!CATEGORIAS_CAJA.includes(b.categoria)) return res.status(400).json({ error: 'Escoja una categoría' });
  if (!txt(b.beneficiario)) return res.status(400).json({ error: 'Escriba quién recibe el dinero' });
  if (!txt(b.documento)) return res.status(400).json({ error: 'Falta la cédula de quien recibe' });
  if (!txt(b.concepto)) return res.status(400).json({ error: 'Escriba para qué es el dinero' });
  if (!monto) return res.status(400).json({ error: 'El monto debe ser mayor a cero' });
  if (!/^data:image\/png;base64,/.test(b.firma || '') || b.firma.length < 2000) return res.status(400).json({ error: 'Falta la firma de quien recibe' });
  if (b.soporte && (!/^data:image\/(jpeg|png);base64,/.test(b.soporte) || b.soporte.length > 1500000)) return res.status(400).json({ error: 'La foto del soporte no es válida o es muy pesada' });
  const traslado = b.traslado_id ? db.prepare('SELECT id FROM traslados WHERE id = ?').get(b.traslado_id) : null;
  const r = db.prepare(`INSERT INTO gastos (fecha, categoria, concepto, beneficiario, documento, telefono, monto, medio, traslado_id,
    firma, soporte, registrado_por, lat, lng) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    txt(b.fecha), b.categoria, txt(b.concepto), txt(b.beneficiario), txt(b.documento), txt(b.telefono), monto,
    MEDIOS_CAJA.includes(b.medio) ? b.medio : 'Efectivo', traslado ? traslado.id : null, b.firma, txt(b.soporte),
    req.user.id, b.lat ?? null, b.lng ?? null);
  const id = Number(r.lastInsertRowid);
  if (traslado) db.prepare('INSERT INTO bitacora_traslados (traslado_id, estado, nota, usuario_id) SELECT id, estado, ?, ? FROM traslados WHERE id = ?')
    .run(`Efectivo para transporte: $${monto.toLocaleString('es-CO')} a ${txt(b.beneficiario)} (${consecutivoCaja(id)})`, req.user.id, traslado.id);
  res.json({ id });
});
api.post('/gastos/:id/anular', soloAdmin, (req, res) => {
  const motivo = txt(req.body.motivo);
  if (!motivo) return res.status(400).json({ error: 'Escriba el motivo de la anulación' });
  db.prepare(`UPDATE gastos SET estado = 'anulado', anulado_motivo = ? WHERE id = ?`).run(motivo, req.params.id);
  res.json({ ok: true });
});

// --- exportes CSV (Excel en español usa ;) ---
function csv(res, nombre, cols, filas) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const cuerpo = [cols.map((c) => c[1]).join(';'), ...filas.map((f) => cols.map((c) => esc(f[c[0]])).join(';'))].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
  res.send('﻿' + cuerpo);
}
api.get('/export/traslados.csv', (req, res) => {
  const filas = db.prepare(`${SQL_TRASLADOS} ORDER BY t.fecha, t.hora_recogida`).all();
  csv(res, 'traslados_ecofest.csv', [['id', 'ID'], ['fecha', 'Fecha'], ['placa', 'Placa'], ['conductor', 'Conductor'],
    ['conductor_tel', 'Tel. conductor'], ['pasajeros', 'Pasajeros'], ['contacto_tel', 'Tel. contacto'],
    ['hora_recogida', 'Hora recogida'], ['lugar_recogida', 'Lugar recogida'], ['destino', 'Destino'],
    ['hora_regreso', 'Hora regreso'], ['lugar_regreso', 'Recoger de nuevo en'], ['destino_regreso', 'Llevar de regreso a'],
    ['equipos', 'Equipos'], ['notas', 'Notas'], ['estado', 'Estado'], ['actualizado', 'Última actualización (UTC)']], filas);
});
api.get('/export/entregas.csv', (req, res) => {
  const filas = db.prepare(`${SQL_ENTREGAS} ORDER BY e.fecha, e.id`).all()
    .map((e) => ({ ...e, consecutivo: consecutivo(e.id), jornada_txt: JORNADAS[e.jornada] || '' }));
  csv(res, 'entregas_almuerzos_ecofest.csv', [['consecutivo', 'Comprobante'], ['fecha', 'Fecha'], ['ubicacion', 'Lugar'], ['beneficiario', 'Nombre'], ['grupo', 'Grupo'],
    ['jornada_txt', 'Jornada'], ['personas', 'Personas'], ['recibido_por', 'Recibió (grupo)'],
    ['documento', 'Documento'], ['telefono', 'Teléfono'], ['cargo', 'Cargo/Rol'], ['concepto', 'Concepto'], ['monto', 'Monto'],
    ['estado', 'Estado'], ['firmado_en', 'Firmado (UTC)'], ['entregado_por_nombre', 'Entregado por'], ['lat', 'Latitud'],
    ['lng', 'Longitud'], ['observacion', 'Observación'], ['anulada_motivo', 'Motivo anulación']], filas);
});
const consecutivo = (id) => `ECO-${String(id).padStart(4, '0')}`;
const consecutivoCaja = (id) => `CM-${String(id).padStart(4, '0')}`;
api.get('/export/gastos.csv', (req, res) => {
  const filas = db.prepare(`${SQL_GASTOS} ORDER BY g.fecha, g.id`).all().map((g) => ({ ...g, consecutivo: consecutivoCaja(g.id) }));
  csv(res, 'caja_menor_ecofest.csv', [['consecutivo', 'Comprobante'], ['fecha', 'Fecha'], ['categoria', 'Categoría'], ['concepto', 'Concepto'],
    ['beneficiario', 'Recibió'], ['documento', 'Documento'], ['telefono', 'Teléfono'], ['monto', 'Monto'], ['medio', 'Medio'],
    ['traslado_desc', 'Traslado'], ['estado', 'Estado'], ['registrado_por_nombre', 'Registró'], ['creado', 'Registrado (UTC)'],
    ['lat', 'Latitud'], ['lng', 'Longitud'], ['anulado_motivo', 'Motivo anulación']], filas);
});

// Respaldo completo de la base (solo admin)
api.get('/export/respaldo.db', soloAdmin, (req, res) => {
  const tmp = path.join(DATA_DIR, `respaldo-${Date.now()}.db`);
  db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  res.download(tmp, 'ecofest_respaldo.db', () => fs.unlink(tmp, () => {}));
});

// Planilla inicial (semilla/planilla_ecofest.json).
// Las entregas se cargan una sola vez. El transporte lleva versión: cuando cambia, se reemplazan las rutas de la
// planilla anterior que nadie ha tocado (sin cambios de estado ni ediciones); las que ya se trabajaron se conservan.
for (const tabla of ['traslados', 'entregas']) {
  if (!db.prepare(`PRAGMA table_info(${tabla})`).all().some((c) => c.name === 'semilla')) db.exec(`ALTER TABLE ${tabla} ADD COLUMN semilla INTEGER`);
}
function insertarTransporte(lista, version, userId) {
  for (const t of lista) {
    const paradas = t.paradas.map(([lugar, quien], i) => `${i + 1}) ${lugar}: ${quien}`).join(' · ');
    const id = crearTraslado({
      fecha: t.fecha, pasajeros: t.personal_planilla ? `${t.actividad}: ${t.personal_planilla}` : `${t.actividad} (carga)`,
      lugar_recogida: paradas || null, destino: t.destino, hora_recogida: t.hora || null,
      equipos: t.tipo === 'carga' ? t.actividad : null,
      notas: [t.cruce, 'Falta: placa, conductor y regreso.'].filter(Boolean).join(' '),
    }, userId);
    db.prepare('UPDATE traslados SET semilla = ? WHERE id = ?').run(version, id);
  }
}
function cargarSemilla() {
  const archivo = path.join(__dirname, 'semilla', 'planilla_ecofest.json');
  if (!fs.existsSync(archivo)) return;
  const s = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  const version = s.transporte_version || 1;
  const admin = db.prepare(`SELECT id FROM usuarios WHERE rol = 'admin' ORDER BY id LIMIT 1`).get();
  const ajustes = getAjustes();
  const guardar = db.prepare('INSERT INTO ajustes (clave, valor) VALUES (?,?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor');
  db.exec('BEGIN');
  try {
    // Alimentación: cuando cambia la versión de la planilla se reemplazan las entregas PENDIENTES que vinieron de la
    // planilla anterior. Las firmadas o anuladas nunca se tocan, y no se crea otra entrega para quien ya firmó.
    const versionE = s.entregas_version || 1;
    const actualE = Number(ajustes.entregas_version || (ajustes.semilla_cargada ? 1 : 0));
    if (actualE < versionE) {
      const borradas = ajustes.semilla_cargada ? db.prepare(`DELETE FROM entregas WHERE estado = 'pendiente'
        AND (semilla IS NOT NULL OR (semilla IS NULL AND creado <= datetime(?, '+10 seconds')))`).run(ajustes.semilla_cargada).changes : 0;
      const firmada = db.prepare(`SELECT 1 FROM entregas WHERE estado != 'pendiente' AND fecha = ? AND ubicacion = ? AND beneficiario = ?`);
      let nuevas = 0, omitidas = 0;
      for (const e of s.entregas) {
        if (firmada.get(e.fecha, e.ubicacion, e.beneficiario)) { omitidas++; continue; }
        const id = crearEntrega({ ...e, concepto: 'Alimentación' });
        db.prepare('UPDATE entregas SET semilla = ? WHERE id = ?').run(versionE, id); nuevas++;
      }
      if (!ajustes.semilla_cargada) guardar.run('semilla_cargada', ahora());
      guardar.run('entregas_version', String(versionE));
      console.log(`Alimentación v${versionE}: ${borradas} pendientes anteriores reemplazadas por ${nuevas} (${omitidas} ya firmadas se conservan)`);
    }
    const actual = Number(ajustes.transporte_version || (ajustes.semilla_cargada ? 1 : 0));
    if (actual < version) {
      // Rutas de planillas anteriores sin trabajar: creadas por la semilla, en "programado", sin ediciones ni cambios de estado
      const viejas = db.prepare(`SELECT t.id FROM traslados t WHERE t.estado = 'programado' AND t.actualizado = t.creado
        AND (t.semilla IS NOT NULL OR t.notas LIKE '%Cruce con alimentos:%')
        AND (SELECT COUNT(*) FROM bitacora_traslados b WHERE b.traslado_id = t.id) <= 1`).all();
      for (const v of viejas) db.prepare('DELETE FROM traslados WHERE id = ?').run(v.id);
      insertarTransporte(s.transporte, version, admin && admin.id);
      guardar.run('transporte_version', String(version));
      console.log(`Transporte v${version}: ${viejas.length} rutas anteriores reemplazadas por ${s.transporte.length}`);
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); console.error('No se pudo cargar la planilla inicial:', e.message); }
}
cargarSemilla();

app.use('/api', api);
// Versión desplegada (Railway define RAILWAY_GIT_COMMIT_SHA); sirve para saber qué versión tiene abierta cada celular
const VERSION = (process.env.RAILWAY_GIT_COMMIT_SHA || '').slice(0, 7) || 'local';
app.get('/healthz', (req, res) => res.json({ ok: true, version: VERSION, datos_persistentes: PERSISTENTE, carpeta_datos: DATA_DIR, lectura_fotos: !!claude }));
// Sin caché: cada vez que se abre la app, el celular revisa si hay versión nueva
const sinCache = (res) => res.setHeader('Cache-Control', 'no-cache');
const INDEX = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8')
  .replace('/styles.css"', `/styles.css?v=${VERSION}"`).replace('/app.js"', `/app.js?v=${VERSION}"`).replace('/escaner.js"', `/escaner.js?v=${VERSION}"`)
  .replace('/lector-codigos.js"', `/lector-codigos.js?v=${VERSION}"`);
const enviarIndex = (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.type('html').send(INDEX); };
app.get(['/', '/index.html'], enviarIndex);
app.use(express.static(path.join(__dirname, 'public'), { setHeaders: sinCache, index: false }));
// Lector de códigos de barras (cédula y licencia), servido desde el propio servidor
const ZXING = path.join(__dirname, 'node_modules', 'zxing-wasm', 'dist');
app.get('/lector-codigos.js', (req, res) => { sinCache(res); res.sendFile(path.join(__dirname, 'lector-codigos', 'lector-codigos-colombia.js')); });
app.get('/vendor/zxing/reader.js', (req, res) => res.sendFile(path.join(ZXING, 'iife', 'reader', 'index.js'), { maxAge: '7d' }));
app.get('/vendor/zxing/zxing_reader.wasm', (req, res) => res.sendFile(path.join(ZXING, 'reader', 'zxing_reader.wasm'), { maxAge: '7d' }));
app.get('*', enviarIndex);

app.listen(PORT, () => console.log(`Ecofest logística en puerto ${PORT} · datos en ${DB_FILE}`));
