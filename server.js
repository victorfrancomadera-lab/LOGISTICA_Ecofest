'use strict';
// Ecofest · Logística — servidor Express + SQLite (node:sqlite, sin dependencias nativas)
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
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
    color_primario: '#1F7A4D',
    color_secundario: '#F2A93B',
    logo: null,
    monto_defecto: '20000',
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
    if (u) { req.user = u; return next(); }
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
  res.json({ id: u.id, nombre: u.nombre, usuario: u.usuario, rol: u.rol });
});
api.post('/logout', (req, res) => {
  const token = leerCookie(req, 'eco_sesion');
  if (token) db.prepare('DELETE FROM sesiones WHERE token = ?').run(token);
  res.setHeader('Set-Cookie', 'eco_sesion=; Path=/; Max-Age=0');
  res.json({ ok: true });
});
api.get('/ajustes-publicos', (req, res) => {
  const a = getAjustes();
  res.json({ evento: a.evento, color_primario: a.color_primario, color_secundario: a.color_secundario, logo: a.logo, monto_defecto: a.monto_defecto });
});

api.use(auth);
api.get('/yo', (req, res) => res.json(req.user));

// --- ajustes ---
api.get('/ajustes', (req, res) => res.json(getAjustes()));
api.put('/ajustes', soloAdmin, (req, res) => {
  const permitidas = ['evento', 'color_primario', 'color_secundario', 'logo', 'monto_defecto'];
  const up = db.prepare('INSERT INTO ajustes (clave, valor) VALUES (?,?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor');
  for (const k of permitidas) if (k in req.body) up.run(k, req.body[k] === null ? null : String(req.body[k]));
  res.json(getAjustes());
});

// --- usuarios ---
api.get('/usuarios', soloAdmin, (req, res) => {
  res.json(db.prepare('SELECT id, nombre, usuario, rol, activo FROM usuarios ORDER BY nombre').all());
});
api.post('/usuarios', soloAdmin, (req, res) => {
  const { nombre, usuario, pin, rol } = req.body;
  if (!nombre || !usuario || !pin) return res.status(400).json({ error: 'Nombre, usuario y clave son obligatorios' });
  try {
    const r = db.prepare('INSERT INTO usuarios (nombre, usuario, pin_hash, rol) VALUES (?,?,?,?)')
      .run(String(nombre).trim(), String(usuario).trim().toLowerCase(), hashPin(pin), rol === 'admin' ? 'admin' : 'operador');
    res.json({ id: Number(r.lastInsertRowid) });
  } catch (e) {
    res.status(400).json({ error: 'Ese usuario ya existe' });
  }
});
api.put('/usuarios/:id', soloAdmin, (req, res) => {
  const { nombre, rol, activo, pin } = req.body;
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'No existe' });
  db.prepare('UPDATE usuarios SET nombre = ?, rol = ?, activo = ? WHERE id = ?').run(
    nombre ?? u.nombre, rol ?? u.rol, activo === undefined ? u.activo : (activo ? 1 : 0), u.id);
  if (pin) db.prepare('UPDATE usuarios SET pin_hash = ? WHERE id = ?').run(hashPin(pin), u.id);
  if (activo === false || activo === 0) db.prepare('DELETE FROM sesiones WHERE usuario_id = ?').run(u.id);
  res.json({ ok: true });
});

// --- vehículos ---
const CAMPOS_VEH = ['placa', 'descripcion', 'color', 'capacidad', 'conductor', 'conductor_tel', 'conductor_doc', 'notas'];
function datosVehiculo(b) {
  return CAMPOS_VEH.map((k) => (k === 'capacidad' ? (b[k] ? Number(b[k]) : null) : k === 'placa' ? (txt(b[k]) || '').toUpperCase() : txt(b[k])));
}
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
  const filas = db.prepare(`${SQL_ENTREGAS}${where} ORDER BY e.estado = 'pendiente' DESC, e.beneficiario`).all(...params);
  res.json(filas.map(({ firma, ...r }) => ({ ...r, tiene_firma: !!firma })));
});
api.get('/entregas/resumen', (req, res) => {
  const { fecha } = req.query;
  const where = fecha ? 'WHERE fecha = ?' : '';
  const params = fecha ? [fecha] : [];
  res.json(db.prepare(`SELECT estado, COUNT(*) n, COALESCE(SUM(monto),0) total FROM entregas ${where} GROUP BY estado`).all(...params));
});
api.get('/entregas/:id', (req, res) => {
  const e = db.prepare(`${SQL_ENTREGAS} WHERE e.id = ?`).get(req.params.id);
  if (!e) return res.status(404).json({ error: 'No existe' });
  res.json(e);
});
function crearEntrega(b) {
  const r = db.prepare(`INSERT INTO entregas (fecha, beneficiario, documento, telefono, cargo, monto, concepto)
    VALUES (?,?,?,?,?,?,?)`).run(txt(b.fecha), txt(b.beneficiario), txt(b.documento), txt(b.telefono), txt(b.cargo),
    Math.round(Number(String(b.monto ?? 0).replace(/[^\d]/g, '')) || 0), txt(b.concepto) || 'Almuerzo');
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
  db.prepare(`UPDATE entregas SET fecha = ?, beneficiario = ?, documento = ?, telefono = ?, cargo = ?, monto = ?, concepto = ? WHERE id = ?`)
    .run(txt(b.fecha) || e.fecha, txt(b.beneficiario) || e.beneficiario, txt(b.documento), txt(b.telefono), txt(b.cargo),
      Math.round(Number(String(b.monto ?? e.monto).replace(/[^\d]/g, '')) || 0), txt(b.concepto) || e.concepto, e.id);
  res.json({ ok: true });
});
api.post('/entregas/:id/firmar', (req, res) => {
  const e = db.prepare('SELECT * FROM entregas WHERE id = ?').get(req.params.id);
  if (!e) return res.status(404).json({ error: 'No existe' });
  if (e.estado !== 'pendiente') return res.status(409).json({ error: 'Esta entrega ya fue firmada o anulada' });
  const { firma, documento, monto, lat, lng } = req.body;
  if (!/^data:image\/png;base64,/.test(firma || '') || firma.length < 2000) return res.status(400).json({ error: 'Falta la firma' });
  if (!txt(documento) && !txt(e.documento)) return res.status(400).json({ error: 'Falta el número de documento' });
  const montoFinal = monto !== undefined && monto !== '' ? Math.round(Number(String(monto).replace(/[^\d]/g, '')) || 0) : e.monto;
  if (!montoFinal) return res.status(400).json({ error: 'El monto debe ser mayor a cero' });
  db.prepare(`UPDATE entregas SET estado = 'entregado', firma = ?, firmado_en = ?, entregado_por = ?, documento = ?, monto = ?,
    lat = ?, lng = ?, dispositivo = ? WHERE id = ?`).run(firma, ahora(), req.user.id, txt(documento) || e.documento, montoFinal,
    lat ?? null, lng ?? null, String(req.headers['user-agent'] || '').slice(0, 250), e.id);
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
    .map((e) => ({ ...e, consecutivo: consecutivo(e.id) }));
  csv(res, 'entregas_almuerzos_ecofest.csv', [['consecutivo', 'Comprobante'], ['fecha', 'Fecha'], ['beneficiario', 'Nombre'],
    ['documento', 'Documento'], ['telefono', 'Teléfono'], ['cargo', 'Cargo/Rol'], ['concepto', 'Concepto'], ['monto', 'Monto'],
    ['estado', 'Estado'], ['firmado_en', 'Firmado (UTC)'], ['entregado_por_nombre', 'Entregado por'], ['lat', 'Latitud'],
    ['lng', 'Longitud'], ['anulada_motivo', 'Motivo anulación']], filas);
});
const consecutivo = (id) => `ECO-${String(id).padStart(4, '0')}`;

// Respaldo completo de la base (solo admin)
api.get('/export/respaldo.db', soloAdmin, (req, res) => {
  const tmp = path.join(DATA_DIR, `respaldo-${Date.now()}.db`);
  db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  res.download(tmp, 'ecofest_respaldo.db', () => fs.unlink(tmp, () => {}));
});

app.use('/api', api);
app.get('/healthz', (req, res) => res.json({ ok: true }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '5m' }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Ecofest logística en puerto ${PORT} · datos en ${DB_FILE}`));
