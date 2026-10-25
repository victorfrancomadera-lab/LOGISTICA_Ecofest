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
  [/^#\/caja$/, vistaCaja],
  [/^#\/caja\/nueva(\?.*)?$/, vistaFormGasto],
  [/^#\/caja\/(\d+)$/, (m) => vistaGasto(m[1])],
  [/^#\/mas$/, vistaMas],
  [/^#\/vehiculos$/, vistaVehiculos],
  [/^#\/vehiculos\/nuevo$/, () => vistaFormVehiculo()],
  [/^#\/vehiculos\/(\d+)$/, (m) => vistaFormVehiculo(m[1])],
  [/^#\/usuarios$/, vistaUsuarios],
  [/^#\/usuarios\/nuevo$/, () => vistaFormUsuario()],
  [/^#\/usuarios\/(\d+)$/, (m) => vistaFormUsuario(m[1])],
  [/^#\/ajustes$/, vistaAjustes],
];
async function enrutar() {
  if (!estado.user) return vistaLogin();
  detenerPoll();
  document.getElementById('tabs').hidden = false;
  const hash = location.hash || '#/traslados';
  const tab = hash.split('/')[1].split('?')[0];
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
  // Aviso al administrador si el servidor no tiene dónde guardar los datos de forma permanente
  if (esAdmin() && estado.user.persistente === false && !document.getElementById('aviso-volumen')) {
    document.getElementById('topbar').insertAdjacentHTML('afterend', `<div id="aviso-volumen" class="aviso-volumen">⚠️ Railway no tiene volumen: los datos se borran en cada despliegue.
      Cree un volumen montado en <b>/data</b> en el servicio.</div>`);
  }
  enrutar();
}

// ---------- selector de fechas ----------
// "Vie 23": corto para que todos los días quepan en la pantalla del celular
function diaCorto(f) {
  const d = new Date(f + 'T12:00:00');
  const s = d.toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', '');
  return s.charAt(0).toUpperCase() + s.slice(1) + ' ' + d.getDate();
}
function barraFechas(actual, fechas, idCampo) {
  const lista = [...new Set([hoy(), ...fechas, actual])].filter(Boolean).sort();
  return `<div class="barra-fechas">
    ${lista.map((f) => `<button type="button" class="btn chico ${f === actual ? 'activo' : ''}" data-fecha="${f}">
      ${f === hoy() ? 'Hoy' : diaCorto(f)}</button>`).join('')}
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
  const [t, gastos] = await Promise.all([api('/traslados/' + id), api('/gastos?traslado_id=' + id)]);
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
      <a class="btn" href="#/caja/nueva?traslado=${t.id}">💵 Dar efectivo para transporte</a>
    </div>
    ${gastos.length ? `<div class="tarjeta"><div class="suave pequeno">EFECTIVO ENTREGADO PARA ESTE TRASLADO</div>
      ${gastos.map((g) => `<div class="fila entre" style="margin-top:6px"><a href="#/caja/${g.id}">${h(consecutivoCaja(g.id))} · ${h(g.beneficiario)}</a>
        <b style="${g.estado === 'anulado' ? 'text-decoration:line-through' : ''}">${pesos(g.monto)}</b></div>`).join('')}</div>` : ''}

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
  jornada: 'jornada', tipo: 'jornada', personas: 'personas', cantidad: 'personas',
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
// Alimentación por jornada: día entero o medio día, por persona (un grupo multiplica por sus personas)
const JORNADAS = { entero: 'Día entero', medio: 'Medio día' };
const valorJornada = (j) => Number(j === 'medio' ? estado.ajustes.valor_medio_dia : estado.ajustes.valor_dia_entero) || 0;
function chipsComidas(e) {
  return `<span class="chip comida">${JORNADAS[e.jornada] || 'Día entero'}${e.personas > 1 ? ` × ${e.personas}` : ''}</span>`;
}
function opcionesJornada(nombre, actual) {
  return `<div class="cats">${Object.entries(JORNADAS).map(([k, t]) => `<label class="cat"><input type="radio" name="${nombre}" value="${k}" ${k === (actual || 'entero') ? 'checked' : ''}>
    <span>${t} · ${pesos(valorJornada(k))}</span></label>`).join('')}</div>`;
}
const valoresDefinidos = () => valorJornada('entero') > 0 || valorJornada('medio') > 0;

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
      <a class="btn chico" href="#/caja/nueva?cat=Alimentación">💵 Otro gasto</a>
      <a class="btn primario chico" href="#/almuerzos/nueva">+ Persona</a></div>
    </div>
    ${barraFechas(estado.fechaAl, fechas, 'fecha-al')}
    ${!valoresDefinidos() ? `<div class="aviso">Aún no hay valor para día entero ni medio día, así que los montos salen en $0.
      ${esAdmin() ? '<a href="#/ajustes">Definir valores</a>' : 'Pídale al administrador que los defina.'}</div>` : ''}
    <div class="resumen">
      <div><b>${ent.length}/${vivas.length}</b><span>Firmados</span></div>
      <div><b>${vivas.filter((e) => e.jornada !== 'medio').reduce((s, e) => s + (e.personas || 1), 0)} · ${vivas.filter((e) => e.jornada === 'medio').reduce((s, e) => s + (e.personas || 1), 0)}</b><span>Día entero · Medio día (personas)</span></div>
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
    : { fecha: estado.fechaAl, ubicacion: estado.lugarAl, jornada: 'entero', personas: 1, concepto: 'Alimentación' };
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
      <label>Jornada</label>
      ${opcionesJornada('jornada', e.jornada)}
      <div class="dos">
        <div><label>Personas (si es grupo)</label><input name="personas" type="number" min="1" inputmode="numeric" value="${v('personas') || 1}"></div>
        <div><label>Monto</label><input name="monto" inputmode="numeric" value="${id ? v('monto') : ''}" placeholder="Vacío = jornada × personas"></div>
      </div>
      <div class="dos">
        <div><label>Fecha *</label><input type="date" name="fecha" value="${v('fecha')}" required></div>
      </div>
      <div class="dos">
        <div><label>Cédula / documento</label><input name="documento" inputmode="numeric" value="${v('documento')}"></div>
        <div><label>Teléfono</label><input name="telefono" type="tel" value="${v('telefono')}"></div>
      </div>
      <label>Observación</label><textarea name="observacion">${v('observacion')}</textarea>
      <p><button class="btn primario bloque grande">${id ? 'Guardar' : 'Guardar y firmar'}</button></p>
    </form>`);
  const fEn = document.getElementById('f-en');
  botonEscanear(fEn.documento, (d) => { if (d.nombreCompleto && !fEn.beneficiario.value) fEn.beneficiario.value = d.nombreCompleto; });
  fEn.onsubmit = async (ev) => {
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

const paraQue = (e) => 'alimentación de ' + (e.comidas || 'día entero');
function textoDeclaracion(e, quien, doc, monto, evento) {
  const grupo = e.es_grupo ? ` como responsable del grupo ${e.beneficiario}${e.personas > 1 ? ` (${e.personas} personas)` : ''},` : '';
  const jornada = (JORNADAS[e.jornada] || 'Día entero').toLowerCase();
  return `Yo, ${quien || '______'}, identificado(a) con documento ${doc || '______'},${grupo} declaro que recibí ${pesos(monto)} en efectivo para alimentación de ${jornada} del evento ${evento}${e.ubicacion ? `, en ${e.ubicacion}` : ''}.`;
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
      <label>Jornada</label>
      ${opcionesJornada('jornada', e.jornada)}
      <div class="dos">
        <div><label>Cédula *</label><input name="documento" inputmode="numeric" value="${h(e.documento || '')}" required></div>
        <div><label>Monto entregado${e.personas > 1 ? ` (${e.personas} personas)` : ''} *</label><input name="monto" inputmode="numeric" value="${e.monto ? h(e.monto) : ''}" required></div>
      </div>
      <label class="check" style="margin-top:14px"><input type="checkbox" id="acepto" required>
        <span id="texto-decl"></span></label>
      <label>Firma de quien recibe</label>
      <div class="firma-caja"><canvas id="lienzo"></canvas><div class="linea"></div><div class="ayuda">Firme aquí con el dedo</div></div>
      <div class="fila entre" style="margin-top:6px"><span class="suave pequeno" id="geo-txt"></span><button type="button" class="btn chico" id="limpiar">Borrar firma</button></div>
      <p><button class="btn primario bloque grande" id="confirmar">Confirmar entrega</button></p>
    </form>`);
  const form = document.getElementById('f-firma');
  const jornadaSel = () => (form.querySelector('input[name=jornada]:checked') || {}).value || 'entero';
  const decl = () => {
    const m = Number(String(form.monto.value).replace(/[^\d]/g, '')) || 0;
    const quien = e.es_grupo ? form.recibido_por.value : e.beneficiario;
    document.getElementById('texto-decl').textContent = textoDeclaracion({ ...e, jornada: jornadaSel() }, quien, form.documento.value, m, evento);
  };
  // al cambiar la jornada, el monto se recalcula: valor × personas
  form.querySelectorAll('input[name=jornada]').forEach((r) => (r.onchange = () => { form.monto.value = valorJornada(r.value) * (e.personas || 1) || ''; decl(); }));
  form.oninput = decl; decl();
  botonEscanear(form.documento, (d) => { if (e.es_grupo && d.nombreCompleto) form.recibido_por.value = d.nombreCompleto; });

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
        firma: firma.png(), documento: form.documento.value, monto: form.monto.value, jornada: jornadaSel(),
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
        <tr><td>Jornada</td><td>${h(JORNADAS[e.jornada] || 'Día entero')}${e.personas > 1 ? ` · ${e.personas} personas` : ''}</td></tr>
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
    columnas: 'Nombre, Documento, Teléfono, Grupo, Lugar, Jornada (día entero / medio día), Personas, Monto, Fecha, Observación (sin Fecha se usa la seleccionada; sin Monto se calcula: jornada × personas)',
    ejemplo: 'Nombre\tGrupo\tLugar\tJornada\tPersonas\nAna Pérez\tEquipo Ecofest\tPlaza de la Paz\tDía entero\t1',
    completar: (f) => ({ fecha: estado.fechaAl, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }),
  });
}

// ================= CAJA MENOR =================
// Salidas de efectivo que no son las entregas de alimentación planeadas: transporte por cuenta propia, compras, etc.
const CATEGORIAS = { Transporte: '🚕', 'Alimentación': '🍽️', Materiales: '🧰', 'Logística': '📦', Otros: '💵' };
const consecutivoCaja = (id) => `CM-${String(id).padStart(4, '0')}`;
function leerParams() {
  const i = location.hash.indexOf('?');
  return new URLSearchParams(i < 0 ? '' : location.hash.slice(i + 1));
}

async function vistaCaja(silencioso) {
  if (!estado.fechaCajaAuto) { estado.fechaCaja = hoy(); estado.fechaCajaAuto = true; }
  const [lista, todos, res] = await Promise.all([
    api('/gastos?fecha=' + estado.fechaCaja), api('/gastos'), api('/gastos/resumen?fecha=' + estado.fechaCaja),
  ]);
  const fechas = [...new Set(todos.map((g) => g.fecha))];
  const vivos = lista.filter((g) => g.estado === 'registrado');
  const totalDia = vivos.reduce((s, g) => s + g.monto, 0);
  const y = window.scrollY;
  pintar(`
    <div class="fila entre"><h1>Caja menor</h1><a class="btn primario chico" href="#/caja/nueva">+ Registrar salida</a></div>
    ${barraFechas(estado.fechaCaja, fechas, 'fecha-caja')}
    <div class="resumen">
      <div><b>${pesos(totalDia)}</b><span>Salidas del día (${vivos.length})</span></div>
      <div><b>${pesos(res.total_gastos + res.total_entregas)}</b><span>Total salidas del evento</span></div>
      <div><b>${res.saldo === null ? '—' : pesos(res.saldo)}</b><span>${res.saldo === null ? (esAdmin() ? '<a href="#/ajustes">Definir base de caja</a>' : 'Sin base de caja') : 'Saldo de ' + pesos(res.base)}</span></div>
    </div>
    <p class="suave pequeno">Total del evento = caja menor ${pesos(res.total_gastos)} + recibidos de alimentación ${pesos(res.total_entregas)}.</p>
    ${res.por_categoria.length ? `<div class="fila" style="margin-bottom:10px">${res.por_categoria.map((c) => `<span class="chip">${CATEGORIAS[c.categoria] || ''} ${h(c.categoria)} · ${pesos(c.total)}</span>`).join('')}</div>` : ''}
    ${lista.length ? lista.map((g) => `<a class="tarjeta" href="#/caja/${g.id}">
      <div class="fila entre"><span class="titulo">${CATEGORIAS[g.categoria] || ''} ${h(g.concepto)}</span>
        <b style="${g.estado === 'anulado' ? 'text-decoration:line-through;color:var(--suave)' : ''}">${pesos(g.monto)}</b></div>
      <div class="suave pequeno">${h(consecutivoCaja(g.id))} · ${h(g.categoria)} · recibió ${h(g.beneficiario)} · ${h(g.medio)}${g.tiene_soporte ? ' · 📎 soporte' : ''}</div>
      ${g.traslado_desc ? `<div class="suave pequeno">🚐 ${h(g.traslado_desc)}</div>` : ''}
      ${g.estado === 'anulado' ? `<div class="obs pequeno">Anulado: ${h(g.anulado_motivo || '')}</div>` : ''}
    </a>`).join('') : '<div class="tarjeta suave">No hay salidas de caja este día. Use “+ Registrar salida”.</div>'}
  `);
  if (silencioso) window.scrollTo(0, y);
  enlazarFechas((f) => { estado.fechaCaja = f; vistaCaja(); }, 'fecha-caja');
  cadaRato(vistaCaja);
}

async function vistaFormGasto() {
  const prm = leerParams();
  const trasladoId = prm.get('traslado');
  const t = trasladoId ? await api('/traslados/' + trasladoId).catch(() => null) : null;
  const fecha = t ? t.fecha : estado.fechaCaja || hoy();
  const traslados = await api('/traslados?fecha=' + fecha);
  const cat = t ? 'Transporte' : (prm.get('cat') || 'Transporte');
  const concepto = t ? `Transporte por cuenta propia: ${t.pasajeros}${t.destino ? ' → ' + t.destino : ''}` : (prm.get('concepto') || '');
  document.getElementById('tabs').hidden = true; // evita tocar las pestañas por error al firmar
  pintar(`
    <p><a href="${t ? '#/traslados/' + t.id : '#/caja'}">← Volver</a></p>
    <h1>Registrar salida de caja</h1>
    <form id="f-gasto">
      <label>Categoría</label>
      <div class="cats">${Object.entries(CATEGORIAS).map(([c, i]) => `<label class="cat"><input type="radio" name="categoria" value="${h(c)}" ${c === cat ? 'checked' : ''}><span>${i} ${h(c)}</span></label>`).join('')}</div>
      <label>¿Para qué es el dinero? *</label>
      <input name="concepto" value="${h(concepto)}" required placeholder="Ej. Taxi Montecristo → Plaza de la Paz, hielo, cinta">
      <div class="dos">
        <div><label>Fecha *</label><input type="date" name="fecha" value="${h(fecha)}" required></div>
        <div><label>Traslado relacionado</label><select name="traslado_id"><option value="">Ninguno</option>
          ${traslados.map((x) => `<option value="${x.id}" ${t && x.id === t.id ? 'selected' : ''}>${h(x.hora_recogida || '--:--')} · ${h(x.pasajeros)}</option>`).join('')}</select></div>
      </div>
      <h2>Quién recibe</h2>
      <label>Nombre completo *</label><input name="beneficiario" required autocomplete="off">
      <div class="dos">
        <div><label>Cédula *</label><input name="documento" inputmode="numeric" required autocomplete="off"></div>
        <div><label>Celular</label><input name="telefono" type="tel" autocomplete="off"></div>
      </div>
      <div class="dos">
        <div><label>Monto *</label><input name="monto" inputmode="numeric" required placeholder="$"></div>
        <div><label>Medio</label><select name="medio">${['Efectivo', 'Nequi', 'Daviplata', 'Transferencia'].map((m) => `<option>${m}</option>`).join('')}</select></div>
      </div>
      <label>Foto del soporte (opcional)</label>
      <input type="file" id="soporte" accept="image/*" capture="environment">
      <img id="soporte-prev" alt="" style="display:none;max-height:140px;margin-top:6px;border-radius:8px">
      <label class="check" style="margin-top:14px"><input type="checkbox" id="acepto" required><span id="texto-decl"></span></label>
      <label>Firma de quien recibe</label>
      <div class="firma-caja"><canvas id="lienzo"></canvas><div class="linea"></div><div class="ayuda">Firme aquí con el dedo</div></div>
      <div class="fila entre" style="margin-top:6px"><span class="suave pequeno" id="geo-txt"></span><button type="button" class="btn chico" id="limpiar">Borrar firma</button></div>
      <p><button class="btn primario bloque grande" id="guardar">Registrar salida</button></p>
    </form>`);
  const form = document.getElementById('f-gasto');
  const decl = () => {
    const m = Number(String(form.monto.value).replace(/[^\d]/g, '')) || 0;
    document.getElementById('texto-decl').textContent = `Yo, ${form.beneficiario.value || '______'}, identificado(a) con documento ${form.documento.value || '______'}, declaro que recibí ${pesos(m)} (${form.medio.value.toLowerCase()}) para: ${form.concepto.value || '______'}, del evento ${estado.ajustes.evento || 'Ecofest'}.`;
  };
  form.oninput = decl; form.onchange = decl; decl();
  botonEscanear(form.documento, (d) => { if (d.nombreCompleto) form.beneficiario.value = d.nombreCompleto; });
  const firma = lienzoFirma(document.getElementById('lienzo'));
  document.getElementById('limpiar').onclick = firma.limpiar;
  let soporte = null;
  document.getElementById('soporte').onchange = async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    try { soporte = await fotoLiviana(f, 1200); const img = document.getElementById('soporte-prev'); img.src = soporte; img.style.display = 'block'; }
    catch { toast('No se pudo leer la foto', true); }
  };
  let geo = {};
  if (navigator.geolocation) navigator.geolocation.getCurrentPosition(
    (p) => { geo = { lat: p.coords.latitude, lng: p.coords.longitude }; document.getElementById('geo-txt').textContent = '📍 Ubicación registrada'; },
    () => { document.getElementById('geo-txt').textContent = 'Sin ubicación'; }, { timeout: 8000, maximumAge: 120000 });
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    if (firma.vacia()) return toast('Falta la firma', true);
    const btn = document.getElementById('guardar'); btn.disabled = true;
    try {
      const datos = { ...formDatos(form), firma: firma.png(), soporte, ...geo };
      const { id } = await api('/gastos', { method: 'POST', body: datos });
      estado.fechaCaja = datos.fecha;
      document.getElementById('tabs').hidden = false;
      toast('Salida registrada ✔'); location.hash = '#/caja/' + id;
    } catch (err) { toast(err.message, true); btn.disabled = false; }
  };
}
// Foto del soporte en JPEG reducido para que no pese en la base
function fotoLiviana(file, max) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = rej; img.src = URL.createObjectURL(file);
  });
}

async function vistaGasto(id) {
  const g = await api('/gastos/' + id);
  const a = estado.ajustes;
  pintar(`
    <p class="no-print"><a href="#/caja">← Caja menor</a></p>
    <div class="comprobante">
      <div class="cab">
        <div>${a.logo ? `<img src="${h(a.logo)}" alt="${h(a.evento)}">` : `<b style="font-size:22px">${h(a.evento)}</b>`}</div>
        <div class="num">Caja menor<br>${h(g.consecutivo)}</div>
      </div>
      ${g.estado === 'anulado' ? `<div class="anulado">ANULADO · ${h(g.anulado_motivo || '')}</div>` : ''}
      <p style="margin:12px 0 0">Comprobante de salida de dinero del evento <b>${h(a.evento)}</b>.</p>
      <table>
        <tr><td>Categoría</td><td>${CATEGORIAS[g.categoria] || ''} ${h(g.categoria)}</td></tr>
        <tr><td>Concepto</td><td><b>${h(g.concepto)}</b></td></tr>
        <tr><td>Recibió</td><td><b>${h(g.beneficiario)}</b></td></tr>
        <tr><td>Documento</td><td>${h(g.documento || '—')}</td></tr>
        ${g.telefono ? `<tr><td>Celular</td><td>${h(g.telefono)}</td></tr>` : ''}
        <tr><td>Valor</td><td class="monto">${pesos(g.monto)}</td></tr>
        <tr><td>Medio</td><td>${h(g.medio)}</td></tr>
        <tr><td>Fecha</td><td>${h(fechaLarga(g.fecha))}</td></tr>
        ${g.traslado_desc ? `<tr><td>Traslado</td><td><a href="#/traslados/${g.traslado_id}">${h(g.traslado_desc)}</a></td></tr>` : ''}
        <tr><td>Registrado</td><td>${h(utcALocal(g.creado))} · ${h(g.registrado_por_nombre || '')}</td></tr>
        ${g.lat ? `<tr><td>Ubicación</td><td><a href="https://www.google.com/maps?q=${g.lat},${g.lng}" target="_blank" rel="noopener">${Number(g.lat).toFixed(5)}, ${Number(g.lng).toFixed(5)}</a></td></tr>` : ''}
      </table>
      <p class="legal">Yo, ${h(g.beneficiario)}, identificado(a) con documento ${h(g.documento || '')}, declaro que recibí ${pesos(g.monto)} (${h(g.medio.toLowerCase())}) para: ${h(g.concepto)}, del evento ${h(a.evento)}.</p>
      <div class="firma">${g.firma ? `<img src="${g.firma}" alt="Firma de ${h(g.beneficiario)}">` : ''}
        <p style="text-align:center;margin:4px 0 0">${h(g.beneficiario)}<br><span class="suave pequeno">Firma de quien recibe</span></p></div>
      ${g.soporte ? `<p class="suave pequeno" style="margin-top:14px">Soporte adjunto:</p><img src="${g.soporte}" alt="Soporte" style="max-width:100%;border-radius:8px;border:1px solid var(--borde)">` : ''}
    </div>
    <div class="acciones no-print">
      <button class="btn primario" onclick="window.print()">🖨️ Imprimir / PDF</button>
      ${esAdmin() && g.estado === 'registrado' ? '<button class="btn peligro" id="anular">Anular</button>' : ''}
    </div>`);
  const an = document.getElementById('anular');
  if (an) an.onclick = async () => {
    const motivo = prompt('Motivo de la anulación:');
    if (!motivo) return;
    try { await api(`/gastos/${g.id}/anular`, { method: 'POST', body: { motivo } }); toast('Anulado'); vistaGasto(g.id); }
    catch (err) { toast(err.message, true); }
  };
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
      <a class="btn" href="/api/export/gastos.csv">⬇️ Caja menor</a>
      ${esAdmin() ? '<a class="btn" href="/api/export/respaldo.db">💾 Respaldo completo</a>' : ''}
    </div>
    <p><button class="btn peligro bloque" id="salir">Cerrar sesión</button></p>
    <p class="suave pequeno" style="text-align:center">Versión ${h(estado.user.version || '')}</p>`);
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
      <div style="margin-top:6px">👤 ${h(v.conductor || 'Sin conductor')} ${v.conductor_doc ? '· CC ' + h(v.conductor_doc) : ''}${v.conductor_licencia ? ' · 🪪 ' + h(v.conductor_licencia) : ''}</div>
      ${v.propietario || v.modelo ? `<div class="suave pequeno" style="margin-top:4px">${h([v.modelo && 'Modelo ' + v.modelo, v.servicio, v.propietario && 'Propietario: ' + v.propietario].filter(Boolean).join(' · '))}</div>` : ''}
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
        <label class="btn">📷 Leer tarjeta (foto)<input type="file" accept="image/*" capture="environment" hidden id="foto-tarjeta"></label>
        <button type="button" class="btn" id="codigo-tarjeta">▦ Escanear código</button>
      </div>
      <p class="suave pequeno" id="tarjeta-txt">La foto del frente llena placa, vehículo, color, puestos y propietario. El código de barras llena la placa, el modelo y el VIN.</p>
      <div class="dos">
        <div><label>Placa *</label><input name="placa" value="${c('placa')}" required style="text-transform:uppercase"></div>
        <div><label>Puestos</label><input name="capacidad" inputmode="numeric" value="${c('capacidad')}"></div>
      </div>
      <div class="dos">
        <div><label>Tipo / marca</label><input name="descripcion" value="${c('descripcion')}" placeholder="Ej. Van Hyundai H1"></div>
        <div><label>Color</label><input name="color" value="${c('color')}"></div>
      </div>
      <div class="dos">
        <div><label>Modelo (año)</label><input name="modelo" inputmode="numeric" value="${c('modelo')}"></div>
        <div><label>Servicio</label><input name="servicio" value="${c('servicio')}" placeholder="Particular / Público"></div>
      </div>
      <div class="dos">
        <div><label>Propietario</label><input name="propietario" value="${c('propietario')}"></div>
        <div><label>Doc. propietario</label><input name="propietario_doc" inputmode="numeric" value="${c('propietario_doc')}"></div>
      </div>
      <label>N.º licencia de tránsito</label><input name="tarjeta_no" value="${c('tarjeta_no')}">
      <label>Conductor</label><input name="conductor" value="${c('conductor')}">
      <div class="dos">
        <div><label>Celular conductor</label><input name="conductor_tel" type="tel" value="${c('conductor_tel')}"></div>
        <div><label>Cédula conductor</label><input name="conductor_doc" inputmode="numeric" value="${c('conductor_doc')}"></div>
      </div>
      <label>Licencia (categorías y vigencia)</label><input name="conductor_licencia" value="${c('conductor_licencia')}" placeholder="Ej. C1 · vence 2029-03-15">
      <label>Notas</label><textarea name="notas">${c('notas')}</textarea>
      <p><button class="btn primario bloque grande">Guardar</button></p>
      ${id ? '<p><button type="button" class="btn peligro bloque" id="borrar">Retirar vehículo</button></p>' : ''}
    </form>`);
  const fVeh = document.getElementById('f-veh');
  document.getElementById('codigo-tarjeta').onclick = async () => {
    const d = await escanearDocumento('vehiculo');
    if (!d) return;
    const t = (x) => titulo(String(x || '').toLowerCase());
    if (d.placa) fVeh.placa.value = d.placa;
    if (d.modelo) fVeh.modelo.value = d.modelo;
    if (d.color) fVeh.color.value = t(d.color);
    if (d.servicio) fVeh.servicio.value = t(d.servicio);
    const desc = [d.clase, d.marca].filter(Boolean).map(t).join(' ');
    if (desc && !fVeh.descripcion.value) fVeh.descripcion.value = desc;
    if (d.propietario && !fVeh.propietario.value) fVeh.propietario.value = /\b(S\.?A\.?S|LTDA|S\.?A)\b/.test(d.propietario) ? d.propietario : t(d.propietario);
    if (d.propietario_doc && !fVeh.propietario_doc.value) fVeh.propietario_doc.value = d.propietario_doc.replace(/\D/g, '');
    if (d.aNotas && d.campos.length) {
      const lista = 'Código de la tarjeta:\n' + d.campos.map((c, i) => `${c.etiqueta || 'Dato ' + (i + 1)}: ${c.valor}`).join('\n');
      fVeh.notas.value = [fVeh.notas.value.replace(/Código de la tarjeta:[\s\S]*$/, '').trim(), lista].filter(Boolean).join('\n');
    }
    document.getElementById('tarjeta-txt').textContent = `✔ ${d.campos.length} datos leídos del código. Revíselos antes de guardar.`;
  };
  document.getElementById('foto-tarjeta').onchange = async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    const txt = document.getElementById('tarjeta-txt');
    txt.textContent = 'Leyendo la tarjeta…';
    try {
      const t = await leerTarjetaPropiedad(f);
      const antes = fVeh.placa.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const poner = (campo, valor) => { if (valor) fVeh[campo].value = valor; };
      poner('placa', t.placa); poner('capacidad', t.capacidad); poner('color', t.color);
      poner('descripcion', [t.clase, t.marca, t.linea].filter(Boolean).join(' '));
      poner('modelo', t.modelo); poner('servicio', t.servicio); poner('propietario', t.propietario);
      poner('propietario_doc', t.propietario_doc); poner('tarjeta_no', t.tarjeta_no);
      txt.textContent = antes && t.placa && antes !== t.placa
        ? `⚠️ La placa de la tarjeta (${t.placa}) no es la que estaba registrada (${antes}). Revise antes de guardar.`
        : '✔ Datos cargados de la tarjeta. Revíselos antes de guardar.';
    } catch (e) { txt.textContent = e.message; }
    ev.target.value = '';
  };
  botonEscanear(fVeh.conductor_doc, (d) => {
    if (d.nombreCompleto) fVeh.conductor.value = d.nombreCompleto;
    const lic = [d.categorias, d.vence && 'vence ' + d.vence, d.expedicion && 'expedida ' + d.expedicion].filter(Boolean).join(' · ');
    if (lic) fVeh.conductor_licencia.value = lic;
  });
  fVeh.onsubmit = async (ev) => {
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
    <div class="fila entre"><h1>Usuarios</h1><a class="btn primario chico" href="#/usuarios/nuevo">+ Usuario</a></div>
    <p class="suave pequeno">Toque un usuario para cambiarle el nombre, el usuario, el perfil, la clave o desactivarlo.</p>
    ${lista.map((u) => `<a class="tarjeta" href="#/usuarios/${u.id}">
      <div class="fila entre"><span class="titulo">${h(u.nombre)}${u.id === estado.user.id ? ' <span class="suave pequeno">(usted)</span>' : ''}</span>
        <span class="chip ${u.activo ? (u.rol === 'admin' ? 'est-finalizado' : 'est-programado') : 'est-anulada'}">${u.activo ? (u.rol === 'admin' ? 'Administrador' : 'Operador') : 'Inactivo'}</span></div>
      <div class="suave pequeno">usuario: ${h(u.usuario)}${u.telefono ? ' · ' + h(u.telefono) : ''}</div>
    </a>`).join('')}`);
}

async function vistaFormUsuario(id) {
  if (!esAdmin()) { location.hash = '#/mas'; return; }
  const u = id ? await api('/usuarios/' + id) : { nombre: '', usuario: '', rol: 'operador', activo: 1, telefono: '' };
  const yo = id && Number(id) === estado.user.id;
  pintar(`
    <p><a href="#/usuarios">← Usuarios</a></p>
    <h1>${id ? 'Editar usuario' : 'Nuevo usuario'}</h1>
    <form id="f-us">
      <label>Nombre completo</label><input name="nombre" value="${h(u.nombre)}" required>
      <div class="dos">
        <div><label>Usuario (para entrar)</label><input name="usuario" value="${h(u.usuario)}" autocapitalize="none" autocomplete="off" required></div>
        <div><label>Celular</label><input name="telefono" type="tel" value="${h(u.telefono || '')}"></div>
      </div>
      <label>Perfil</label>
      <select name="rol" ${yo ? 'disabled' : ''}>
        <option value="operador" ${u.rol === 'operador' ? 'selected' : ''}>Operador (calle)</option>
        <option value="admin" ${u.rol === 'admin' ? 'selected' : ''}>Administrador</option>
      </select>
      <p class="suave pequeno">Operador: ve todo, actualiza traslados y registra recibidos con firma. Administrador: además crea, edita, importa, anula y maneja usuarios.</p>
      <label>${id ? 'Nueva clave (déjela vacía para no cambiarla)' : 'Clave'}</label>
      <input name="pin" type="text" autocomplete="new-password" minlength="4" ${id ? '' : 'required'} placeholder="Mínimo 4 caracteres">
      ${id ? `<label class="check" style="margin-top:14px"><input type="checkbox" name="activo" value="1" ${u.activo ? 'checked' : ''} ${yo ? 'disabled' : ''}>
        <span>Activo (puede entrar a la app)</span></label>` : ''}
      ${yo ? '<p class="suave pequeno">Es su propio usuario: no puede quitarse el perfil de administrador ni desactivarse.</p>' : ''}
      <p><button class="btn primario bloque grande">${id ? 'Guardar cambios' : 'Crear usuario'}</button></p>
    </form>`);
  document.getElementById('f-us').onsubmit = async (ev) => {
    ev.preventDefault();
    const datos = formDatos(ev.target);
    if (!datos.pin) delete datos.pin;
    if (id && !yo) datos.activo = ev.target.activo.checked ? 1 : 0;
    if (yo) delete datos.rol;
    try {
      if (id) await api('/usuarios/' + id, { method: 'PUT', body: datos });
      else await api('/usuarios', { method: 'POST', body: datos });
      if (yo) { estado.user = await api('/yo'); document.getElementById('who').textContent = `${estado.user.nombre} · admin`; }
      toast(id ? 'Usuario actualizado' : 'Usuario creado'); location.hash = '#/usuarios';
    } catch (e) { toast(e.message, true); }
  };
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
        <div><label>Valor día entero (por persona)</label><input name="valor_dia_entero" inputmode="numeric" value="${h(a.valor_dia_entero)}"></div>
        <div><label>Valor medio día (por persona)</label><input name="valor_medio_dia" inputmode="numeric" value="${h(a.valor_medio_dia)}"></div>
      </div>
      <label>Base de caja (efectivo total asignado al evento)</label><input name="base_caja" inputmode="numeric" value="${h(a.base_caja || '')}" placeholder="$">
      <p class="suave pequeno">Con la base, la pestaña Caja muestra el saldo: base − salidas de caja menor − recibidos de alimentación.</p>
      <p class="suave pequeno">Al guardar, se recalcula el monto de todas las entregas pendientes: valor de la jornada × personas. Las ya firmadas no cambian.</p>
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
