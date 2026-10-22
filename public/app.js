'use strict';
// Ecofest · Logística — interfaz (SPA sin frameworks, pensada para celular)
const $app = document.getElementById('app');
const estado = { user: null, ajustes: null, fechaTr: hoy(), fechaAl: hoy(), vehFiltro: '', busqueda: '', poll: null };

const ESTADOS = {
  programado: 'Programado',
  en_camino: 'En camino a recoger',
  recogido: 'Recogido',
  entregado: 'Entregado en destino',
  esperando_regreso: 'Esperando regreso',
  regreso: 'De regreso',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
};

// ---------- utilidades ----------
function hoy() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function h(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const pesos = (n) => '$' + Number(n || 0).toLocaleString('es-CO');
const esAdmin = () => estado.user && estado.user.rol === 'admin';
function fechaLarga(f) {
  if (!f) return '';
  const d = new Date(f + 'T12:00:00');
  return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
}
function utcALocal(s) {
  if (!s) return '';
  return new Date(s.replace(' ', 'T') + 'Z').toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}
const telLimpio = (t) => String(t || '').replace(/[^\d+]/g, '');
function waLink(t) {
  let n = telLimpio(t).replace(/^\+/, '');
  if (n.length === 10) n = '57' + n;
  return `https://wa.me/${n}`;
}
const mapa = (lugar) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lugar)}`;

function toast(msg, error) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast' + (error ? ' error' : ''); t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 3200);
}
async function api(ruta, opts = {}) {
  const r = await fetch('/api' + ruta, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && ruta !== '/login') { estado.user = null; vistaLogin(); throw new Error('Sesión vencida'); }
  if (!r.ok) throw new Error(data.error || 'Error de conexión');
  return data;
}
function formDatos(form) {
  return Object.fromEntries(new FormData(form).entries());
}
function pintar(html) { $app.innerHTML = html; window.scrollTo(0, 0); }
function detenerPoll() { clearInterval(estado.poll); estado.poll = null; }
function cadaRato(fn) { detenerPoll(); estado.poll = setInterval(() => { if (!document.hidden) fn(true); }, 30000); }

// ---------- marca ----------
function aplicarMarca(a) {
  estado.ajustes = a;
  const root = document.documentElement.style;
  if (a.color_primario) root.setProperty('--primario', a.color_primario);
  if (a.color_secundario) root.setProperty('--secundario', a.color_secundario);
  document.querySelector('meta[name=theme-color]').setAttribute('content', a.color_primario || '#183A2C');
  document.title = `${a.evento || 'Ecofest'} · Logística`;
  document.getElementById('brand').innerHTML = a.logo
    ? `<img src="${h(a.logo)}" alt="${h(a.evento || 'Ecofest')}">`
    : `<span class="brand-text">${h(a.evento || 'Ecofest')}</span>`;
}

// ---------- enrutador ----------
const rutas = [
  [/^#\/traslados$/, vistaTraslados],
  [/^#\/traslados\/nuevo$/, () => vistaFormTraslado()],
  [/^#\/traslados\/importar$/, vistaImportarTraslados],
  [/^#\/traslados\/(\d+)$/, (m) => vistaTraslado(m[1])],
  [/^#\/traslados\/(\d+)\/editar$/, (m) => vistaFormTraslado(m[1])],
  [/^#\/almuerzos$/, vistaAlmuerzos],
  [/^#\/almuerzos\/nueva$/, () => vistaFormEntrega()],
  [/^#\/almuerzos\/importar$/, vistaImportarEntregas],
  [/^#\/almuerzos\/(\d+)$/, (m) => vistaEntrega(m[1])],
  [/^#\/almuerzos\/(\d+)\/editar$/, (m) => vistaFormEntrega(m[1])],
  [/^#\/mas$/, vistaMas],
  [/^#\/vehiculos$/, vistaVehiculos],
  [/^#\/vehiculos\/nuevo$/, () => vistaFormVehiculo()],
  [/^#\/vehiculos\/(\d+)$/, (m) => vistaFormVehiculo(m[1])],
  [/^#\/usuarios$/, vistaUsuarios],
  [/^#\/ajustes$/, vistaAjustes],
];
async function enrutar() {
  if (!estado.user) return vistaLogin();
  detenerPoll();
  document.getElementById('tabs').hidden = false;
  const hash = location.hash || '#/traslados';
  const tab = hash.split('/')[1];
  const tabActiva = ['vehiculos', 'usuarios', 'ajustes'].includes(tab) ? 'mas' : tab;
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('activo', a.dataset.tab === tabActiva));
  for (const [re, fn] of rutas) {
    const m = hash.match(re);
    if (m) {
      try { await fn(m); } catch (e) { if (e.message !== 'Sesión vencida') pintar(`<p class="suave">${h(e.message)}</p>`); }
      return;
    }
  }
  location.hash = '#/traslados';
}
window.addEventListener('hashchange', enrutar);

// ---------- login ----------
function vistaLogin() {
  detenerPoll();
  document.getElementById('topbar').hidden = true;
  document.getElementById('tabs').hidden = true;
  const a = estado.ajustes || {};
  pintar(`<div class="login">
    ${a.logo ? `<div class="banda"><img src="${h(a.logo)}" alt="${h(a.evento)}"></div>` : ''}
    <h1>${h(a.evento || 'Ecofest')} · Logística</h1>
    <p class="suave">Traslados y entrega de almuerzos</p>
    <form id="f-login">
      <label for="usuario">Usuario</label>
      <input id="usuario" name="usuario" autocomplete="username" autocapitalize="none" required>
      <label for="pin">Clave</label>
      <input id="pin" name="pin" type="password" autocomplete="current-password" required>
      <p><button class="btn primario bloque grande">Entrar</button></p>
    </form></div>`);
  document.getElementById('f-login').onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      estado.user = await api('/login', { method: 'POST', body: formDatos(ev.target) });
      iniciarSesion();
    } catch (e) { toast(e.message, true); }
  };
}
function iniciarSesion() {
  document.getElementById('topbar').hidden = false;
  document.getElementById('tabs').hidden = false;
  document.getElementById('who').textContent = `${estado.user.nombre}${esAdmin() ? ' · admin' : ''}`;
  enrutar();
}

// ---------- selector de fechas ----------
function barraFechas(actual, fechas, idCampo) {
  const lista = [...new Set([hoy(), ...fechas, actual])].filter(Boolean).sort();
  return `<div class="barra-fechas">
    ${lista.map((f) => `<button type="button" class="btn chico ${f === actual ? 'activo' : ''}" data-fecha="${f}">
      ${f === hoy() ? 'Hoy' : new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })}</button>`).join('')}
    <input type="date" id="${idCampo}" value="${actual}" style="width:auto;min-height:36px;padding:4px 8px" aria-label="Elegir fecha">
  </div>`;
}
function enlazarFechas(onCambio, idCampo) {
  $app.querySelectorAll('[data-fecha]').forEach((b) => (b.onclick = () => onCambio(b.dataset.fecha)));
  const inp = document.getElementById(idCampo);
  if (inp) inp.onchange = () => inp.value && onCambio(inp.value);
}

// ================= TRASLADOS =================
// "1) Edificio Mallorquín: Chavelita · 2) Montecristo: Jessica" → [{lugar, quien}]
function paradas(texto) {
  if (!texto) return [];
  return texto.split(' · ').map((p) => {
    const m = p.replace(/^\d+\)\s*/, '').match(/^([^:]+)(?::\s*(.*))?$/);
    return { lugar: (m ? m[1] : p).trim(), quien: m && m[2] ? m[2].trim() : '' };
  });
}
async function vistaTraslados(silencioso) {
  if (!estado.fechaTrAuto) {
    estado.fechaTr = fechaInicial([...new Set((await api('/traslados')).map((t) => t.fecha))], estado.fechaTr);
    estado.fechaTrAuto = true;
  }
  const [lista, todos, vehiculos] = await Promise.all([
    api('/traslados?fecha=' + estado.fechaTr), api('/traslados'), api('/vehiculos'),
  ]);
  const fechas = [...new Set(todos.map((t) => t.fecha))];
  const filtrados = lista.filter((t) => !estado.vehFiltro || String(t.vehiculo_id) === estado.vehFiltro);
  const activos = filtrados.filter((t) => !['finalizado', 'cancelado'].includes(t.estado)).length;
  const y = window.scrollY;
  pintar(`
    <div class="fila entre"><h1>Traslados</h1>
      ${esAdmin() ? `<div class="fila"><a class="btn chico" href="#/traslados/importar">Importar</a><a class="btn primario chico" href="#/traslados/nuevo">+ Nuevo</a></div>` : ''}
    </div>
    ${barraFechas(estado.fechaTr, fechas, 'fecha-tr')}
    <div class="fila" style="margin-bottom:10px">
      <select id="veh-filtro" class="crece" aria-label="Filtrar por vehículo">
        <option value="">Todos los vehículos</option>
        ${vehiculos.map((v) => `<option value="${v.id}" ${String(v.id) === estado.vehFiltro ? 'selected' : ''}>${h(v.placa)} · ${h(v.conductor || '')}</option>`).join('')}
      </select>
    </div>
    <p class="suave">${h(fechaLarga(estado.fechaTr))} · ${filtrados.length} traslado(s), ${activos} activo(s)</p>
    ${filtrados.length ? filtrados.map(tarjetaTraslado).join('') : '<div class="tarjeta suave">No hay traslados para esta fecha.</div>'}
  `);
  if (silencioso) window.scrollTo(0, y);
  enlazarFechas((f) => { estado.fechaTr = f; vistaTraslados(); }, 'fecha-tr');
  document.getElementById('veh-filtro').onchange = (e) => { estado.vehFiltro = e.target.value; vistaTraslados(); };
  cadaRato(vistaTraslados);
}
function tarjetaTraslado(t) {
  return `<a class="tarjeta" href="#/traslados/${t.id}">
    <div class="fila entre"><span class="hora">${t.hora_recogida ? h(t.hora_recogida) : '<span class="suave pequeno">Hora por definir</span>'}</span>
      <span class="chip est-${h(t.estado)}">${h(ESTADOS[t.estado] || t.estado)}</span></div>
    <div class="titulo">${h(t.pasajeros)}</div>
    <div class="ruta">📍 <b>${h(t.lugar_recogida || 'Sin lugar')}</b> → 🏁 <b>${h(t.destino || 'Sin destino')}</b></div>
    ${t.hora_regreso || t.lugar_regreso ? `<div class="ruta pequeno">↩️ Regreso ${h(t.hora_regreso || '')} desde <b>${h(t.lugar_regreso || t.destino || '')}</b>${t.destino_regreso ? ` → ${h(t.destino_regreso)}` : ''}</div>` : ''}
    <div class="suave pequeno">🚐 ${t.placa ? `${h(t.placa)} · ${h(t.conductor || 'sin conductor')}` : 'Sin vehículo asignado'}${t.equipos ? ` · 🎒 ${h(t.equipos)}` : ''}</div>
  </a>`;
}

async function vistaTraslado(id) {
  const t = await api('/traslados/' + id);
  pintar(`
    <p class="no-print"><a href="#/traslados">← Traslados</a></p>
    <div class="fila entre"><h1 style="margin:0">${t.hora_recogida ? h(t.hora_recogida) + ' · ' : ''}${h(t.pasajeros)}</h1></div>
    <p><span class="chip est-${h(t.estado)}">${h(ESTADOS[t.estado])}</span> <span class="suave">${h(fechaLarga(t.fecha))}</span></p>

    <div class="tarjeta">
      <div class="suave pequeno">RECOGER</div>
      ${t.hora_recogida ? `<div class="titulo">${h(t.hora_recogida)}</div>` : '<div class="obs pequeno">Hora de recogida por definir</div>'}
      ${paradas(t.lugar_recogida).map((p) => `<div style="margin-top:4px"><b>${h(p.lugar)}</b>${p.quien ? ` · ${h(p.quien)}` : ''}
        ${p.lugar && p.lugar !== '¿?' ? `<a class="pequeno" href="${mapa(p.lugar)}" target="_blank" rel="noopener">mapa</a>` : ''}</div>`).join('') || '<div>—</div>'}
      <div class="suave pequeno" style="margin-top:10px">LLEVAR A</div>
      <div class="titulo">${h(t.destino || '—')}</div>
      ${t.destino ? `<a class="pequeno" href="${mapa(t.destino)}" target="_blank" rel="noopener">Abrir en mapa</a>` : ''}
      ${t.hora_regreso || t.lugar_regreso || t.destino_regreso ? `
        <div class="suave pequeno" style="margin-top:10px">RECOGER DE NUEVO</div>
        <div class="titulo">${h(t.hora_regreso || '')} · ${h(t.lugar_regreso || t.destino || '—')}</div>
        ${t.destino_regreso ? `<div>→ Llevar a <b>${h(t.destino_regreso)}</b></div>` : ''}` : ''}
    </div>

    <div class="tarjeta">
      <div class="suave pequeno">VEHÍCULO Y CONDUCTOR</div>
      ${t.placa ? `<div class="titulo">${h(t.placa)} ${t.vehiculo_desc ? '· ' + h(t.vehiculo_desc) : ''} ${t.vehiculo_color ? '· ' + h(t.vehiculo_color) : ''}</div>
        <div>${h(t.conductor || 'Sin conductor')} ${t.conductor_tel ? '· ' + h(t.conductor_tel) : ''}</div>` : '<div>Sin vehículo asignado</div>'}
      ${t.equipos ? `<div class="suave pequeno" style="margin-top:10px">EQUIPOS / CARGA</div><div>${h(t.equipos)}</div>` : ''}
      ${t.contacto_tel ? `<div class="suave pequeno" style="margin-top:10px">CONTACTO PASAJERO</div><div>${h(t.contacto_tel)}</div>` : ''}
      ${t.notas ? `<div class="suave pequeno" style="margin-top:10px">NOTAS</div><div>${h(t.notas)}</div>` : ''}
    </div>

    <div class="acciones">
      ${t.conductor_tel ? `<a class="btn" href="tel:${h(telLimpio(t.conductor_tel))}">📞 Conductor</a>
        <a class="btn" href="${waLink(t.conductor_tel)}" target="_blank" rel="noopener">💬 WhatsApp conductor</a>` : ''}
      ${t.contacto_tel ? `<a class="btn" href="tel:${h(telLimpio(t.contacto_tel))}">📞 Pasajero</a>
        <a class="btn" href="${waLink(t.contacto_tel)}" target="_blank" rel="noopener">💬 WhatsApp pasajero</a>` : ''}
      <button class="btn" id="compartir">📤 Enviar ficha</button>
    </div>

    <h2>Actualizar estado</h2>
    <input id="nota-estado" placeholder="Nota opcional (ej. llegó con 10 min de retraso)">
    <div class="estados" style="margin-top:8px">
      ${Object.entries(ESTADOS).map(([k, v]) => `<button class="btn ${k === t.estado ? 'actual' : ''} ${k === 'cancelado' ? 'peligro' : ''}" data-estado="${k}">${h(v)}</button>`).join('')}
    </div>

    ${esAdmin() ? `<div class="fila" style="margin-top:16px"><a class="btn" href="#/traslados/${t.id}/editar">✏️ Editar</a>
      <button class="btn peligro" id="borrar">Eliminar</button></div>` : ''}

    <h2>Bitácora</h2>
    <ul class="bitacora">${t.bitacora.map((b) => `<li><b>${h(ESTADOS[b.estado] || b.estado)}</b> · ${h(utcALocal(b.fecha))} · ${h(b.usuario || '')}${b.nota ? `<br><span class="suave">${h(b.nota)}</span>` : ''}</li>`).join('')}</ul>
  `);
  $app.querySelectorAll('[data-estado]').forEach((b) => (b.onclick = async () => {
    try {
      await api(`/traslados/${t.id}/estado`, { method: 'POST', body: { estado: b.dataset.estado, nota: document.getElementById('nota-estado').value } });
      toast('Estado actualizado'); vistaTraslado(t.id);
    } catch (e) { toast(e.message, true); }
  }));
  document.getElementById('compartir').onclick = () => {
    const texto = `*${estado.ajustes.evento} · Traslado*\n📅 ${fechaLarga(t.fecha)}\n👥 ${t.pasajeros}\n🕒 Recogida: ${t.hora_recogida || '--'} en ${t.lugar_recogida || '--'}\n🏁 Destino: ${t.destino || '--'}` +
      (t.hora_regreso || t.lugar_regreso ? `\n↩️ Regreso: ${t.hora_regreso || '--'} desde ${t.lugar_regreso || t.destino || '--'}${t.destino_regreso ? ' → ' + t.destino_regreso : ''}` : '') +
      `\n🚐 ${t.placa || 'Sin vehículo'} · ${t.conductor || ''} ${t.conductor_tel || ''}` + (t.equipos ? `\n🎒 Equipos: ${t.equipos}` : '') + (t.notas ? `\n📝 ${t.notas}` : '');
    if (navigator.share) navigator.share({ text: texto }).catch(() => {});
    else window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank');
  };
  const borrar = document.getElementById('borrar');
  if (borrar) borrar.onclick = async () => {
    if (!confirm('¿Eliminar este traslado?')) return;
    await api('/traslados/' + t.id, { method: 'DELETE' }); toast('Eliminado'); location.hash = '#/traslados';
  };
}

async function vistaFormTraslado(id) {
  if (!esAdmin()) { location.hash = '#/traslados'; return; }
  const [vehiculos, t] = await Promise.all([api('/vehiculos'), id ? api('/traslados/' + id) : Promise.resolve({ fecha: estado.fechaTr })]);
  const v = (k) => h(t[k] ?? '');
  pintar(`
    <p><a href="${id ? '#/traslados/' + id : '#/traslados'}">← Volver</a></p>
    <h1>${id ? 'Editar' : 'Nuevo'} traslado</h1>
    <form id="f-tr">
      <div class="dos">
        <div><label>Fecha *</label><input type="date" name="fecha" value="${v('fecha')}" required></div>
        <div><label>Vehículo</label><select name="vehiculo_id"><option value="">Sin asignar</option>
          ${vehiculos.map((x) => `<option value="${x.id}" ${x.id === t.vehiculo_id ? 'selected' : ''}>${h(x.placa)} · ${h(x.conductor || '')}</option>`).join('')}</select></div>
      </div>
      ${vehiculos.length ? '' : '<p class="suave pequeno">Aún no hay vehículos. <a href="#/vehiculos/nuevo">Registre uno</a>.</p>'}
      <label>¿A quién se recoge? *</label>
      <input name="pasajeros" value="${v('pasajeros')}" placeholder="Ej. Ana Pérez y 2 acompañantes" required>
      <label>Teléfono del pasajero</label><input name="contacto_tel" type="tel" value="${v('contacto_tel')}">
      <h2>Ida</h2>
      <div class="dos">
        <div><label>Hora de recogida</label><input type="time" name="hora_recogida" value="${v('hora_recogida')}"></div>
        <div><label>Lugar de recogida</label><input name="lugar_recogida" value="${v('lugar_recogida')}" placeholder="Dirección o sitio"></div>
      </div>
      <label>¿A dónde se lleva?</label><input name="destino" value="${v('destino')}">
      <h2>Regreso (opcional)</h2>
      <div class="dos">
        <div><label>Hora de regreso</label><input type="time" name="hora_regreso" value="${v('hora_regreso')}"></div>
        <div><label>Recoger de nuevo en</label><input name="lugar_regreso" value="${v('lugar_regreso')}" placeholder="Si es distinto al destino"></div>
      </div>
      <label>Llevar de regreso a</label><input name="destino_regreso" value="${v('destino_regreso')}">
      <h2>Carga</h2>
      <label>Equipos / materiales</label><textarea name="equipos" placeholder="Ej. 2 carpas, sonido, 3 cajas de material">${v('equipos')}</textarea>
      <label>Notas</label><textarea name="notas">${v('notas')}</textarea>
      <p><button class="btn primario bloque grande">Guardar</button></p>
    </form>`);
  document.getElementById('f-tr').onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      const datos = formDatos(ev.target);
      if (id) await api('/traslados/' + id, { method: 'PUT', body: datos });
      else id = (await api('/traslados', { method: 'POST', body: datos })).id;
      estado.fechaTr = datos.fecha;
      toast('Traslado guardado'); location.hash = '#/traslados/' + id;
    } catch (e) { toast(e.message, true); }
  };
}

// ---------- importación desde Excel (copiar y pegar) ----------
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
function parsearTabla(texto, mapa) {
  const lineas = texto.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (lineas.length < 2) return [];
  const sep = lineas[0].includes('\t') ? '\t' : lineas[0].includes(';') ? ';' : ',';
  const cab = lineas[0].split(sep).map((c) => mapa[norm(c)] || null);
  return lineas.slice(1).map((l) => {
    const celdas = l.split(sep); const fila = {};
    cab.forEach((k, i) => { if (k) fila[k] = (celdas[i] || '').trim(); });
    if (fila.fecha) fila.fecha = fechaISO(fila.fecha);
    return fila;
  });
}
function fechaISO(f) {
  const m = f.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return f;
}
const MAPA_TR = {
  fecha: 'fecha', placa: 'placa', vehiculo: 'placa', pasajeros: 'pasajeros', pasajero: 'pasajeros', persona: 'pasajeros',
  nombre: 'pasajeros', quien: 'pasajeros', telefono: 'contacto_tel', celular: 'contacto_tel', contacto: 'contacto_tel',
  horarecogida: 'hora_recogida', hora: 'hora_recogida', lugarrecogida: 'lugar_recogida', recogida: 'lugar_recogida', origen: 'lugar_recogida',
  destino: 'destino', horaregreso: 'hora_regreso', lugarregreso: 'lugar_regreso', recogerdenuevoen: 'lugar_regreso',
  destinoregreso: 'destino_regreso', llevarderegresoa: 'destino_regreso', equipos: 'equipos', carga: 'equipos', notas: 'notas', observaciones: 'notas',
};
const MAPA_AL = {
  fecha: 'fecha', nombre: 'beneficiario', beneficiario: 'beneficiario', persona: 'beneficiario', documento: 'documento',
  cedula: 'documento', cc: 'documento', telefono: 'telefono', celular: 'telefono', cargo: 'cargo', rol: 'cargo',
  area: 'cargo', monto: 'monto', valor: 'monto', concepto: 'concepto', grupo: 'grupo', entidad: 'grupo',
  lugar: 'ubicacion', ubicacion: 'ubicacion', meriendaam: 'merienda_am', am: 'merienda_am', almuerzo: 'almuerzo',
  almuerzos: 'almuerzo', meriendapm: 'merienda_pm', pm: 'merienda_pm', observacion: 'observacion', observaciones: 'observacion',
};
function vistaImportar({ titulo, volver, columnas, mapa, ruta, ejemplo, completar }) {
  if (!esAdmin()) { location.hash = volver; return; }
  pintar(`
    <p><a href="${volver}">← Volver</a></p>
    <h1>${titulo}</h1>
    <p class="suave">Copie la tabla desde Excel o Google Sheets (incluyendo la fila de títulos) y péguela aquí.
      Columnas reconocidas: <b>${columnas}</b>. Fechas como 25/10/2026 o 2026-10-25.</p>
    <textarea id="pegar" style="min-height:200px;font-family:monospace;font-size:13px" placeholder="${h(ejemplo)}"></textarea>
    <p><button class="btn" id="previa">Ver vista previa</button></p>
    <div id="res"></div>`);
  let filas = [];
  document.getElementById('previa').onclick = () => {
    filas = parsearTabla(document.getElementById('pegar').value, mapa).map(completar || ((f) => f));
    document.getElementById('res').innerHTML = filas.length
      ? `<p><b>${filas.length}</b> fila(s) leídas. Primeras 5:</p>
         ${filas.slice(0, 5).map((f) => `<div class="tarjeta pequeno">${Object.entries(f).map(([k, v]) => `<b>${h(k)}</b>: ${h(v)}`).join(' · ')}</div>`).join('')}
         <button class="btn primario bloque grande" id="importar">Importar ${filas.length} fila(s)</button>`
      : '<p class="suave">No se leyó nada. Revise que la primera fila tenga los títulos.</p>';
    const b = document.getElementById('importar');
    if (b) b.onclick = async () => {
      b.disabled = true;
      try {
        const r = await api(ruta, { method: 'POST', body: { filas } });
        toast(`${r.creados} registro(s) importados`);
        if (r.errores.length) alert('Revise:\n' + r.errores.join('\n'));
        location.hash = volver;
      } catch (e) { toast(e.message, true); b.disabled = false; }
    };
  };
}
function vistaImportarTraslados() {
  vistaImportar({
    titulo: 'Importar traslados', volver: '#/traslados', mapa: MAPA_TR, ruta: '/traslados/importar',
    columnas: 'Fecha, Placa, Pasajeros, Teléfono, Hora recogida, Lugar recogida, Destino, Hora regreso, Lugar regreso, Destino regreso, Equipos, Notas',
    ejemplo: 'Fecha\tPlaca\tPasajeros\tHora recogida\tLugar recogida\tDestino\tHora regreso\tEquipos\n25/10/2026\tABC123\tAna Pérez\t07:30\tHotel X\tParque Y\t17:00\t2 carpas',
  });
}

// ================= ALMUERZOS / ALIMENTACIÓN =================
// Si hoy no hay nada programado, abre en la próxima fecha que sí tenga registros
function fechaInicial(fechas, actual) {
  if (fechas.includes(actual) || !fechas.length) return actual;
  return fechas.filter((f) => f >= hoy()).sort()[0] || fechas.sort().at(-1);
}
function chipsComidas(e) {
  const c = [];
  if (e.merienda_am) c.push(`<span class="chip comida">AM ×${e.merienda_am}</span>`);
  if (e.almuerzo) c.push(`<span class="chip comida">Almuerzo ×${e.almuerzo}</span>`);
  if (e.merienda_pm) c.push(`<span class="chip comida">PM ×${e.merienda_pm}</span>`);
  return c.join(' ');
}
const valoresDefinidos = () => Number(estado.ajustes.valor_merienda) > 0 || Number(estado.ajustes.valor_almuerzo) > 0;

async function vistaAlmuerzos(silencioso) {
  if (!estado.fechaAlAuto) {
    const fechas = [...new Set((await api('/entregas')).map((e) => e.fecha))];
    estado.fechaAl = fechaInicial(fechas, estado.fechaAl); estado.fechaAlAuto = true;
  }
  const [lista, todas] = await Promise.all([api('/entregas?fecha=' + estado.fechaAl), api('/entregas')]);
  const fechas = [...new Set(todas.map((e) => e.fecha))];
  const lugares = [...new Set(lista.map((e) => e.ubicacion || 'Sin lugar'))];
  if (estado.lugarAl && !lugares.includes(estado.lugarAl)) estado.lugarAl = '';
  const q = norm(estado.busqueda);
  const filtradas = lista.filter((e) => (!estado.lugarAl || (e.ubicacion || 'Sin lugar') === estado.lugarAl) &&
    (!q || norm(`${e.beneficiario} ${e.documento || ''} ${e.cargo || ''} ${e.grupo || ''} ${e.recibido_por || ''}`).includes(q)));
  const vivas = filtradas.filter((e) => e.estado !== 'anulada');
  const ent = vivas.filter((e) => e.estado === 'entregado');
  const pen = vivas.filter((e) => e.estado === 'pendiente');
  const suma = (arr, k) => arr.reduce((s, e) => s + (e[k] || 0), 0);
  const y = window.scrollY;
  const enfoque = document.activeElement && document.activeElement.id === 'buscar';
  // agrupa por lugar, conservando el orden del servidor (pendientes primero)
  const grupos = new Map();
  for (const e of filtradas) { const k = e.ubicacion || 'Sin lugar'; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(e); }
  pintar(`
    <div class="fila entre"><h1>Alimentación</h1>
      <div class="fila">${esAdmin() ? '<a class="btn chico" href="#/almuerzos/importar">Importar</a>' : ''}
      <a class="btn primario chico" href="#/almuerzos/nueva">+ Persona</a></div>
    </div>
    ${barraFechas(estado.fechaAl, fechas, 'fecha-al')}
    ${!valoresDefinidos() ? `<div class="aviso">Aún no hay valor por merienda ni por almuerzo, así que los montos salen en $0.
      ${esAdmin() ? '<a href="#/ajustes">Definir valores</a>' : 'Pídale al administrador que los defina.'}</div>` : ''}
    <div class="resumen">
      <div><b>${ent.length}/${vivas.length}</b><span>Firmados</span></div>
      <div><b>${suma(vivas, 'merienda_am')}·${suma(vivas, 'almuerzo')}·${suma(vivas, 'merienda_pm')}</b><span>AM · Almuerzo · PM</span></div>
      <div><b>${pesos(suma(ent, 'monto'))}</b><span>Entregado de ${pesos(suma(vivas, 'monto'))}</span></div>
    </div>
    <div class="fila" style="margin-bottom:8px">
      <select id="lugar-al" class="crece" aria-label="Filtrar por lugar">
        <option value="">Todos los lugares (${lista.length})</option>
        ${lugares.map((l) => `<option ${l === estado.lugarAl ? 'selected' : ''}>${h(l)}</option>`).join('')}
      </select>
    </div>
    <input id="buscar" type="search" placeholder="Buscar por nombre, grupo o cédula" value="${h(estado.busqueda)}">
    ${filtradas.length ? [...grupos].map(([lugar, items]) => `
      <h2>${h(lugar)} <span class="suave pequeno">${items.filter((e) => e.estado === 'entregado').length}/${items.filter((e) => e.estado !== 'anulada').length} firmados · ${pen.length && items.some((e) => e.estado === 'pendiente') ? items.filter((e) => e.estado === 'pendiente').length + ' pendientes' : 'completo'}</span></h2>
      ${items.map((e) => `<a class="tarjeta${e.observacion && e.estado === 'pendiente' ? ' con-obs' : ''}" href="#/almuerzos/${e.id}">
        <div class="fila entre"><span class="titulo">${h(e.beneficiario)}${e.es_grupo ? ' <span class="chip">grupo</span>' : ''}</span>
          <span class="chip est-${h(e.estado)}">${e.estado === 'entregado' ? '✔ Firmado' : e.estado === 'anulada' ? 'Anulada' : 'Pendiente'}</span></div>
        <div class="fila entre suave pequeno"><span>${h(e.grupo || e.cargo || '')}${e.documento ? ' · CC ' + h(e.documento) : ''}</span><b style="color:var(--texto)">${pesos(e.monto)}</b></div>
        <div style="margin-top:6px">${chipsComidas(e)}</div>
        ${e.estado === 'entregado' ? `<div class="suave pequeno">${h(utcALocal(e.firmado_en))} · por ${h(e.entregado_por_nombre || '')}${e.recibido_por ? ' · recibió ' + h(e.recibido_por) : ''}</div>` : ''}
        ${e.observacion && e.estado === 'pendiente' ? `<div class="obs pequeno">⚠️ ${h(e.observacion)}</div>` : ''}
      </a>`).join('')}`).join('') : '<div class="tarjeta suave" style="margin-top:10px">No hay entregas para esta fecha. Use “+ Persona” o importe la lista.</div>'}
  `);
  if (silencioso) window.scrollTo(0, y);
  const b = document.getElementById('buscar');
  if (enfoque) { b.focus(); b.setSelectionRange(b.value.length, b.value.length); }
  b.oninput = () => {
    estado.busqueda = b.value; clearTimeout(b._t);
    b._t = setTimeout(() => vistaAlmuerzos(true).then(() => { const n = document.getElementById('buscar'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }), 250);
  };
  document.getElementById('lugar-al').onchange = (ev) => { estado.lugarAl = ev.target.value; vistaAlmuerzos(); };
  enlazarFechas((f) => { estado.fechaAl = f; vistaAlmuerzos(); }, 'fecha-al');
  cadaRato((s) => { if (document.activeElement?.id !== 'buscar') vistaAlmuerzos(s); });
}

async function vistaFormEntrega(id) {
  const e = id ? await api('/entregas/' + id)
    : { fecha: estado.fechaAl, ubicacion: estado.lugarAl, almuerzo: 1, merienda_am: 0, merienda_pm: 0, concepto: 'Alimentación' };
  const v = (k) => h(e[k] ?? '');
  pintar(`
    <p><a href="${id ? '#/almuerzos/' + id : '#/almuerzos'}">← Volver</a></p>
    <h1>${id ? 'Editar entrega' : 'Agregar persona'}</h1>
    <form id="f-en">
      <label>Nombre de la persona o del grupo *</label><input name="beneficiario" value="${v('beneficiario')}" required autocomplete="off">
      <label class="check"><input type="checkbox" name="es_grupo" value="1" ${e.es_grupo ? 'checked' : ''}><span>Es un grupo (firma una persona por todos)</span></label>
      <div class="dos">
        <div><label>Grupo / entidad</label><input name="grupo" value="${v('grupo')}" placeholder="Ej. Gobernación, CUC, Equipo Ecofest"></div>
        <div><label>Lugar</label><input name="ubicacion" value="${v('ubicacion')}" placeholder="Ej. Plaza de la Paz" list="lugares"></div>
      </div>
      <h2>Comidas de ese día</h2>
      <div class="tres">
        <div><label>Merienda AM</label><input name="merienda_am" type="number" min="0" inputmode="numeric" value="${v('merienda_am') || 0}"></div>
        <div><label>Almuerzo</label><input name="almuerzo" type="number" min="0" inputmode="numeric" value="${v('almuerzo') || 0}"></div>
        <div><label>Merienda PM</label><input name="merienda_pm" type="number" min="0" inputmode="numeric" value="${v('merienda_pm') || 0}"></div>
      </div>
      <div class="dos">
        <div><label>Monto</label><input name="monto" inputmode="numeric" value="${id ? v('monto') : ''}" placeholder="Vacío = se calcula con los valores"></div>
        <div><label>Fecha *</label><input type="date" name="fecha" value="${v('fecha')}" required></div>
      </div>
      <div class="dos">
        <div><label>Cédula / documento</label><input name="documento" inputmode="numeric" value="${v('documento')}"></div>
        <div><label>Teléfono</label><input name="telefono" type="tel" value="${v('telefono')}"></div>
      </div>
      <label>Observación</label><textarea name="observacion">${v('observacion')}</textarea>
      <p><button class="btn primario bloque grande">${id ? 'Guardar' : 'Guardar y firmar'}</button></p>
    </form>`);
  document.getElementById('f-en').onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      const datos = formDatos(ev.target);
      datos.es_grupo = datos.es_grupo ? 1 : 0;
      if (id) await api('/entregas/' + id, { method: 'PUT', body: datos });
      else id = (await api('/entregas', { method: 'POST', body: datos })).id;
      estado.fechaAl = datos.fecha;
      location.hash = '#/almuerzos/' + id;
    } catch (err) { toast(err.message, true); }
  };
}

async function vistaEntrega(id) {
  const e = await api('/entregas/' + id);
  if (e.estado === 'pendiente') return vistaFirmar(e);
  return vistaComprobante(e);
}

const paraQue = (e) => e.comidas || (e.concepto || 'alimentación').toLowerCase();
function textoDeclaracion(e, quien, doc, monto, evento) {
  const grupo = e.es_grupo ? ` como responsable del grupo ${e.beneficiario}${e.grupo && e.grupo !== e.beneficiario ? ` (${e.grupo})` : ''},` : '';
  return `Yo, ${quien || '______'}, identificado(a) con documento ${doc || '______'},${grupo} declaro que recibí ${pesos(monto)} en efectivo para ${paraQue(e)} del evento ${evento}${e.ubicacion ? `, en ${e.ubicacion}` : ''}.`;
}

function vistaFirmar(e) {
  const evento = estado.ajustes.evento || 'Ecofest';
  document.getElementById('tabs').hidden = true; // evita tocar las pestañas por error al firmar
  pintar(`
    <p><a href="#/almuerzos">← Alimentación</a></p>
    <h1>Firmar recibido</h1>
    <div class="tarjeta">
      <div class="titulo" style="font-size:20px">${h(e.beneficiario)}${e.es_grupo ? ' <span class="chip">grupo</span>' : ''}</div>
      <div class="suave">${h([e.grupo, e.ubicacion].filter(Boolean).join(' · '))}</div>
      <div style="margin-top:6px">${chipsComidas(e)}</div>
      <div class="fila entre" style="margin-top:6px"><span>${h(fechaLarga(e.fecha))}</span>
        <a class="pequeno" href="#/almuerzos/${e.id}/editar">Corregir datos</a></div>
      ${e.observacion ? `<div class="obs pequeno" style="margin-top:8px">⚠️ ${h(e.observacion)}</div>` : ''}
    </div>
    <form id="f-firma">
      ${e.es_grupo ? `<label>Nombre de quien recibe por el grupo *</label><input name="recibido_por" required autocomplete="off">` : ''}
      <div class="dos">
        <div><label>Cédula *</label><input name="documento" inputmode="numeric" value="${h(e.documento || '')}" required></div>
        <div><label>Monto entregado *</label><input name="monto" inputmode="numeric" value="${e.monto ? h(e.monto) : ''}" required></div>
      </div>
      <label class="check" style="margin-top:14px"><input type="checkbox" id="acepto" required>
        <span id="texto-decl"></span></label>
      <label>Firma de quien recibe</label>
      <div class="firma-caja"><canvas id="lienzo"></canvas><div class="linea"></div><div class="ayuda">Firme aquí con el dedo</div></div>
      <div class="fila entre" style="margin-top:6px"><span class="suave pequeno" id="geo-txt"></span><button type="button" class="btn chico" id="limpiar">Borrar firma</button></div>
      <p><button class="btn primario bloque grande" id="confirmar">Confirmar entrega</button></p>
    </form>`);
  const form = document.getElementById('f-firma');
  const decl = () => {
    const m = Number(String(form.monto.value).replace(/[^\d]/g, '')) || 0;
    const quien = e.es_grupo ? form.recibido_por.value : e.beneficiario;
    document.getElementById('texto-decl').textContent = textoDeclaracion(e, quien, form.documento.value, m, evento);
  };
  form.oninput = decl; decl();

  const firma = lienzoFirma(document.getElementById('lienzo'));
  document.getElementById('limpiar').onclick = firma.limpiar;

  let geo = {};
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (p) => { geo = { lat: p.coords.latitude, lng: p.coords.longitude }; document.getElementById('geo-txt').textContent = '📍 Ubicación registrada'; },
      () => { document.getElementById('geo-txt').textContent = 'Sin ubicación'; }, { timeout: 8000, maximumAge: 120000 });
  }
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    if (firma.vacia()) return toast('Falta la firma', true);
    const btn = document.getElementById('confirmar'); btn.disabled = true;
    try {
      await api(`/entregas/${e.id}/firmar`, { method: 'POST', body: {
        firma: firma.png(), documento: form.documento.value, monto: form.monto.value,
        recibido_por: e.es_grupo ? form.recibido_por.value : undefined, ...geo } });
      toast('Entrega registrada ✔');
      document.getElementById('tabs').hidden = false;
      vistaEntrega(e.id);
    } catch (err) { toast(err.message, true); btn.disabled = false; }
  };
}

function lienzoFirma(canvas) {
  const ctx = canvas.getContext('2d');
  let trazos = 0, dibujando = false, ultimo = null;
  function ajustar() {
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    canvas.width = r.width * dpr; canvas.height = r.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, r.width, r.height);
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0B1F3A';
    trazos = 0;
  }
  ajustar();
  const pos = (ev) => { const r = canvas.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
  canvas.addEventListener('pointerdown', (ev) => { ev.preventDefault(); canvas.setPointerCapture(ev.pointerId); dibujando = true; ultimo = pos(ev); });
  canvas.addEventListener('pointermove', (ev) => {
    if (!dibujando) return; ev.preventDefault();
    const p = pos(ev);
    ctx.beginPath(); ctx.moveTo(ultimo.x, ultimo.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    ultimo = p; trazos++;
  });
  const fin = () => { dibujando = false; };
  canvas.addEventListener('pointerup', fin); canvas.addEventListener('pointercancel', fin);
  let ancho = window.innerWidth;
  window.addEventListener('resize', () => { if (window.innerWidth !== ancho && trazos === 0) { ancho = window.innerWidth; ajustar(); } });
  return { limpiar: ajustar, vacia: () => trazos < 8, png: () => canvas.toDataURL('image/png') };
}

function vistaComprobante(e) {
  const a = estado.ajustes;
  const num = `ECO-${String(e.id).padStart(4, '0')}`;
  pintar(`
    <p class="no-print"><a href="#/almuerzos">← Alimentación</a></p>
    <div class="comprobante">
      <div class="cab">
        <div>${a.logo ? `<img src="${h(a.logo)}" alt="${h(a.evento)}">` : `<b style="font-size:22px">${h(a.evento)}</b>`}</div>
        <div class="num">Comprobante<br>${num}</div>
      </div>
      ${e.estado === 'anulada' ? `<div class="anulado">ANULADO · ${h(e.anulada_motivo || '')}</div>` : ''}
      <p style="margin:12px 0 0">Recibo de dinero para <b>${h(paraQue(e))}</b> del evento <b>${h(a.evento)}</b>.</p>
      <table>
        ${e.es_grupo ? `<tr><td>Grupo</td><td><b>${h(e.beneficiario)}</b>${e.grupo && e.grupo !== e.beneficiario ? ' · ' + h(e.grupo) : ''}</td></tr>` : ''}
        <tr><td>Recibió</td><td><b>${h(e.es_grupo ? e.recibido_por || '—' : e.beneficiario)}</b></td></tr>
        <tr><td>Documento</td><td>${h(e.documento || '—')}</td></tr>
        ${!e.es_grupo && (e.grupo || e.cargo) ? `<tr><td>Grupo / cargo</td><td>${h(e.grupo || e.cargo)}</td></tr>` : ''}
        ${e.ubicacion ? `<tr><td>Lugar</td><td>${h(e.ubicacion)}</td></tr>` : ''}
        ${e.comidas ? `<tr><td>Comidas</td><td>${h(e.comidas)}</td></tr>` : ''}
        ${e.telefono ? `<tr><td>Teléfono</td><td>${h(e.telefono)}</td></tr>` : ''}
        <tr><td>Valor</td><td class="monto">${pesos(e.monto)}</td></tr>
        <tr><td>Fecha del evento</td><td>${h(fechaLarga(e.fecha))}</td></tr>
        <tr><td>Firmado</td><td>${h(utcALocal(e.firmado_en))}</td></tr>
        <tr><td>Entregado por</td><td>${h(e.entregado_por_nombre || '—')}</td></tr>
        ${e.lat ? `<tr><td>Ubicación</td><td><a href="https://www.google.com/maps?q=${e.lat},${e.lng}" target="_blank" rel="noopener">${Number(e.lat).toFixed(5)}, ${Number(e.lng).toFixed(5)}</a></td></tr>` : ''}
      </table>
      <p class="legal">${h(textoDeclaracion(e, e.es_grupo ? e.recibido_por : e.beneficiario, e.documento, e.monto, a.evento))}</p>
      <div class="firma">${e.firma ? `<img src="${e.firma}" alt="Firma de ${h(e.beneficiario)}">` : ''}
        <p style="text-align:center;margin:4px 0 0">${h(e.es_grupo ? e.recibido_por || '' : e.beneficiario)}<br><span class="suave pequeno">Firma de quien recibe</span></p></div>
    </div>
    <div class="acciones no-print">
      <button class="btn primario" onclick="window.print()">🖨️ Imprimir / PDF</button>
      ${e.telefono ? `<a class="btn" target="_blank" rel="noopener" href="${waLink(e.telefono)}?text=${encodeURIComponent(`${a.evento}: confirmamos la entrega de ${pesos(e.monto)} para ${paraQue(e)} a ${e.es_grupo ? e.recibido_por + ' (' + e.beneficiario + ')' : e.beneficiario}. Comprobante ${num}.`)}">💬 Avisar por WhatsApp</a>` : ''}
      ${esAdmin() && e.estado === 'entregado' ? '<button class="btn peligro" id="anular">Anular</button>' : ''}
    </div>`);
  const an = document.getElementById('anular');
  if (an) an.onclick = async () => {
    const motivo = prompt('Motivo de la anulación:');
    if (!motivo) return;
    try { await api(`/entregas/${e.id}/anular`, { method: 'POST', body: { motivo } }); toast('Anulada'); vistaEntrega(e.id); }
    catch (err) { toast(err.message, true); }
  };
}

function vistaImportarEntregas() {
  vistaImportar({
    titulo: 'Importar lista de alimentación', volver: '#/almuerzos', mapa: MAPA_AL, ruta: '/entregas/importar',
    columnas: 'Nombre, Documento, Teléfono, Grupo, Lugar, Merienda AM, Almuerzo, Merienda PM, Monto, Fecha, Observación (sin Fecha se usa la seleccionada; sin Monto se calcula con los valores de Ajustes)',
    ejemplo: 'Nombre\tGrupo\tLugar\tMerienda AM\tAlmuerzo\tMerienda PM\nAna Pérez\tEquipo Ecofest\tPlaza de la Paz\t1\t1\t1',
    completar: (f) => ({ fecha: estado.fechaAl, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }),
  });
}

// ================= MÁS =================
function vistaMas() {
  pintar(`
    <h1>Más</h1>
    <a class="tarjeta" href="#/vehiculos"><div class="titulo">🚐 Vehículos y conductores</div><div class="suave">Placas, conductores y teléfonos</div></a>
    ${esAdmin() ? `<a class="tarjeta" href="#/usuarios"><div class="titulo">👥 Usuarios del equipo</div><div class="suave">Quién entra a la app</div></a>
    <a class="tarjeta" href="#/ajustes"><div class="titulo">🎨 Valores y marca</div><div class="suave">Valor de merienda y almuerzo, logo, colores</div></a>` : ''}
    <h2>Descargar reportes (Excel)</h2>
    <div class="acciones">
      <a class="btn" href="/api/export/traslados.csv">⬇️ Traslados</a>
      <a class="btn" href="/api/export/entregas.csv">⬇️ Entregas de alimentación</a>
      ${esAdmin() ? '<a class="btn" href="/api/export/respaldo.db">💾 Respaldo completo</a>' : ''}
    </div>
    <p><button class="btn peligro bloque" id="salir">Cerrar sesión</button></p>`);
  document.getElementById('salir').onclick = async () => { await api('/logout', { method: 'POST' }); estado.user = null; vistaLogin(); };
}

async function vistaVehiculos() {
  const lista = await api('/vehiculos');
  pintar(`
    <p><a href="#/mas">← Más</a></p>
    <div class="fila entre"><h1>Vehículos</h1>${esAdmin() ? '<a class="btn primario chico" href="#/vehiculos/nuevo">+ Vehículo</a>' : ''}</div>
    ${lista.length ? lista.map((v) => `<div class="tarjeta">
      <div class="fila entre"><span class="titulo" style="font-size:20px">${h(v.placa)}</span>${esAdmin() ? `<a class="btn chico" href="#/vehiculos/${v.id}">Editar</a>` : ''}</div>
      <div class="suave">${h([v.descripcion, v.color, v.capacidad ? v.capacidad + ' puestos' : ''].filter(Boolean).join(' · '))}</div>
      <div style="margin-top:6px">👤 ${h(v.conductor || 'Sin conductor')} ${v.conductor_doc ? '· CC ' + h(v.conductor_doc) : ''}</div>
      ${v.conductor_tel ? `<div class="fila" style="margin-top:8px"><a class="btn chico" href="tel:${h(telLimpio(v.conductor_tel))}">📞 ${h(v.conductor_tel)}</a>
        <a class="btn chico" href="${waLink(v.conductor_tel)}" target="_blank" rel="noopener">💬 WhatsApp</a></div>` : ''}
      ${v.notas ? `<div class="suave pequeno" style="margin-top:6px">${h(v.notas)}</div>` : ''}
    </div>`).join('') : '<div class="tarjeta suave">No hay vehículos registrados.</div>'}`);
}

async function vistaFormVehiculo(id) {
  if (!esAdmin()) { location.hash = '#/vehiculos'; return; }
  const v = id ? (await api('/vehiculos')).find((x) => String(x.id) === String(id)) || {} : {};
  const c = (k) => h(v[k] ?? '');
  pintar(`
    <p><a href="#/vehiculos">← Vehículos</a></p>
    <h1>${id ? 'Editar' : 'Nuevo'} vehículo</h1>
    <form id="f-veh">
      <div class="dos">
        <div><label>Placa *</label><input name="placa" value="${c('placa')}" required style="text-transform:uppercase"></div>
        <div><label>Puestos</label><input name="capacidad" inputmode="numeric" value="${c('capacidad')}"></div>
      </div>
      <div class="dos">
        <div><label>Tipo / marca</label><input name="descripcion" value="${c('descripcion')}" placeholder="Ej. Van Hyundai H1"></div>
        <div><label>Color</label><input name="color" value="${c('color')}"></div>
      </div>
      <label>Conductor</label><input name="conductor" value="${c('conductor')}">
      <div class="dos">
        <div><label>Celular conductor</label><input name="conductor_tel" type="tel" value="${c('conductor_tel')}"></div>
        <div><label>Cédula conductor</label><input name="conductor_doc" inputmode="numeric" value="${c('conductor_doc')}"></div>
      </div>
      <label>Notas</label><textarea name="notas">${c('notas')}</textarea>
      <p><button class="btn primario bloque grande">Guardar</button></p>
      ${id ? '<p><button type="button" class="btn peligro bloque" id="borrar">Retirar vehículo</button></p>' : ''}
    </form>`);
  document.getElementById('f-veh').onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      const datos = formDatos(ev.target);
      if (id) await api('/vehiculos/' + id, { method: 'PUT', body: datos });
      else await api('/vehiculos', { method: 'POST', body: datos });
      toast('Vehículo guardado'); location.hash = '#/vehiculos';
    } catch (e) { toast(e.message, true); }
  };
  const b = document.getElementById('borrar');
  if (b) b.onclick = async () => {
    if (!confirm('¿Retirar este vehículo? Los traslados ya asignados conservan la información.')) return;
    await api('/vehiculos/' + id, { method: 'DELETE' }); location.hash = '#/vehiculos';
  };
}

async function vistaUsuarios() {
  if (!esAdmin()) { location.hash = '#/mas'; return; }
  const lista = await api('/usuarios');
  pintar(`
    <p><a href="#/mas">← Más</a></p>
    <h1>Usuarios</h1>
    ${lista.map((u) => `<div class="tarjeta">
      <div class="fila entre"><div><div class="titulo">${h(u.nombre)}</div><div class="suave pequeno">usuario: ${h(u.usuario)} · ${u.rol}${u.activo ? '' : ' · INACTIVO'}</div></div>
      <div class="fila"><button class="btn chico" data-pin="${u.id}">Cambiar clave</button>
      ${u.id !== estado.user.id ? `<button class="btn chico ${u.activo ? 'peligro' : ''}" data-act="${u.id}" data-v="${u.activo ? 0 : 1}">${u.activo ? 'Desactivar' : 'Activar'}</button>` : ''}</div></div>
    </div>`).join('')}
    <h2>Agregar persona del equipo</h2>
    <form id="f-us" class="tarjeta">
      <label>Nombre</label><input name="nombre" required>
      <div class="dos">
        <div><label>Usuario</label><input name="usuario" autocapitalize="none" required></div>
        <div><label>Clave</label><input name="pin" required minlength="4"></div>
      </div>
      <label>Rol</label><select name="rol"><option value="operador">Operador (calle)</option><option value="admin">Administrador</option></select>
      <p class="suave pequeno">Operador: ve todo, actualiza estados de traslados y registra/firma entregas. Administrador: además crea, edita, importa y anula.</p>
      <button class="btn primario bloque">Crear usuario</button>
    </form>`);
  document.getElementById('f-us').onsubmit = async (ev) => {
    ev.preventDefault();
    try { await api('/usuarios', { method: 'POST', body: formDatos(ev.target) }); toast('Usuario creado'); vistaUsuarios(); }
    catch (e) { toast(e.message, true); }
  };
  $app.querySelectorAll('[data-pin]').forEach((b) => (b.onclick = async () => {
    const pin = prompt('Nueva clave (mínimo 4 caracteres):');
    if (!pin || pin.length < 4) return;
    await api('/usuarios/' + b.dataset.pin, { method: 'PUT', body: { pin } }); toast('Clave cambiada');
  }));
  $app.querySelectorAll('[data-act]').forEach((b) => (b.onclick = async () => {
    await api('/usuarios/' + b.dataset.act, { method: 'PUT', body: { activo: b.dataset.v === '1' } }); vistaUsuarios();
  }));
}

async function vistaAjustes() {
  if (!esAdmin()) { location.hash = '#/mas'; return; }
  const a = await api('/ajustes');
  let logo = a.logo;
  pintar(`
    <p><a href="#/mas">← Más</a></p>
    <h1>Marca y ajustes</h1>
    <form id="f-aj">
      <label>Nombre del evento</label><input name="evento" value="${h(a.evento)}">
      <label>Logo</label>
      <div class="fila"><img id="logo-prev" src="${h(a.logo || '')}" alt="" style="max-height:60px;${a.logo ? '' : 'display:none'}">
        <input type="file" id="logo-file" accept="image/*" class="crece"></div>
      <p class="suave pequeno">Al subir el logo se proponen los colores automáticamente; puede ajustarlos abajo.</p>
      <div class="dos">
        <div><label>Color principal</label><input type="color" name="color_primario" value="${h(a.color_primario)}"></div>
        <div><label>Color de acento</label><input type="color" name="color_secundario" value="${h(a.color_secundario)}"></div>
      </div>
      <div class="dos">
        <div><label>Valor de cada merienda (AM o PM)</label><input name="valor_merienda" inputmode="numeric" value="${h(a.valor_merienda)}"></div>
        <div><label>Valor de cada almuerzo</label><input name="valor_almuerzo" inputmode="numeric" value="${h(a.valor_almuerzo)}"></div>
      </div>
      <p class="suave pequeno">Al guardar, se recalcula el monto de todas las entregas pendientes según sus comidas. Las ya firmadas no cambian.</p>
      <label>Monto por defecto (personas agregadas sin comidas)</label><input name="monto_defecto" inputmode="numeric" value="${h(a.monto_defecto)}">
      <p><button class="btn primario bloque grande">Guardar</button></p>
      ${a.logo ? '<p><button type="button" class="btn bloque" id="quitar-logo">Quitar logo</button></p>' : ''}
    </form>`);
  const form = document.getElementById('f-aj');
  document.getElementById('logo-file').onchange = async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    logo = await reducirImagen(f, 400);
    const img = document.getElementById('logo-prev'); img.src = logo; img.style.display = '';
    const [p, s] = await coloresDominantes(logo);
    if (p) form.color_primario.value = p;
    if (s) form.color_secundario.value = s;
  };
  const q = document.getElementById('quitar-logo');
  if (q) q.onclick = () => { logo = null; document.getElementById('logo-prev').style.display = 'none'; };
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      const r = await api('/ajustes', { method: 'PUT', body: { ...formDatos(form), logo } });
      aplicarMarca(r); toast('Ajustes guardados');
    } catch (e) { toast(e.message, true); }
  };
}
function reducirImagen(file, max) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL('image/png'));
    };
    img.onerror = rej; img.src = URL.createObjectURL(file);
  });
}
// Propone dos colores del logo: el más frecuente con buena saturación y uno contrastante.
function coloresDominantes(src) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 64;
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, 64, 64);
      const d = ctx.getImageData(0, 0, 64, 64).data; const cubos = new Map();
      for (let i = 0; i < d.length; i += 4) {
        const [r, g, b, a] = [d[i], d[i + 1], d[i + 2], d[i + 3]];
        if (a < 200) continue;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        if (max - min < 40 || max > 245 || max < 30) continue; // ignora blancos, negros y grises
        const k = `${r >> 4},${g >> 4},${b >> 4}`;
        const v = cubos.get(k) || { n: 0, r: 0, g: 0, b: 0 };
        v.n++; v.r += r; v.g += g; v.b += b; cubos.set(k, v);
      }
      const orden = [...cubos.values()].sort((a, b) => b.n - a.n).map((v) => [v.r / v.n, v.g / v.n, v.b / v.n]);
      const hex = (x) => '#' + x.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');
      const p = orden[0];
      const s = orden.find((x) => p && Math.abs(x[0] - p[0]) + Math.abs(x[1] - p[1]) + Math.abs(x[2] - p[2]) > 150);
      res([p && hex(p), s && hex(s)]);
    };
    img.onerror = () => res([]); img.src = src;
  });
}

// ---------- arranque ----------
(async function () {
  try { aplicarMarca(await api('/ajustes-publicos')); } catch { aplicarMarca({ evento: 'Ecofest' }); }
  try { estado.user = await api('/yo'); iniciarSesion(); } catch { vistaLogin(); }
})();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
