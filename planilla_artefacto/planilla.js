// Planilla Ecofest: personas, recibidos de entrega, rutas y tarifas viven en la base compartida del artefacto.
//   personas/{id}   alimentación por día y lugar      actas/{id}    recibido firmado (mismo id de la persona)
//   rutas/{id}      transporte                         config/tarifas  {lista: [{id, nombre, valor}]}
const DIAS = { '2026-10-23': 'viernes 23 de octubre', '2026-10-24': 'sábado 24 de octubre', '2026-10-25': 'domingo 25 de octubre' };
const D = { personas: {}, actas: {}, rutas: {}, tarifas: [] };
let db = null, usuario = null, descargas = null, puedeEscribir = true, puedeAdministrar = false, conectado = false;
const velo = document.getElementById('velo'), hoja = document.getElementById('hoja');
const q = document.getElementById('buscar');

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pesos = (n) => '$' + Number(n || 0).toLocaleString('es-CO');
const entero = (v) => Math.max(0, Math.round(Number(String(v ?? '').replace(/[^\d]/g, '')) || 0));
const horaCorta = (iso) => new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
const fechaHora = (iso) => new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
const consecutivo = (id) => 'ECO-' + id.replace(/^\d{4}-\d{2}-/, '').slice(0, 12);
const nuevoId = (fecha) => `${fecha}-n${Date.now().toString(36)}`;
const personasDe = (p) => (p.es_grupo ? Math.max(p.am || 0, p.al || 0, p.pm || 0, 1) : 1);
function comidas(p) {
  const r = [];
  const add = (n, s, pl) => n && r.push(`${n} ${n === 1 ? s : pl}`);
  add(p.am, 'merienda AM', 'meriendas AM'); add(p.al, 'almuerzo', 'almuerzos'); add(p.pm, 'merienda PM', 'meriendas PM');
  return r.length > 1 ? r.slice(0, -1).join(', ') + ' y ' + r.at(-1) : r[0] || 'alimentación';
}
const tarifa = (id) => D.tarifas.find((t) => t.id === id);
function tarifaSugerida(p) { return tarifa(p.tarifa) ? p.tarifa : (D.tarifas[0] && D.tarifas[0].id) || ''; }
function toast(msg) {
  const t = document.getElementById('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3000);
}
function declaracion(p, quien, doc, monto, tar) {
  const grupo = p.es_grupo ? ` como responsable del grupo ${p.nombre} (${personasDe(p)} personas),` : '';
  const t = tar ? ` (${tar.nombre})` : '';
  return `Yo, ${quien || '______'}, identificado(a) con documento ${doc || '______'},${grupo} declaro que recibí ${pesos(monto)} en efectivo${t} para ${comidas(p)} del evento Ecofest, en ${p.lugar}, el ${DIAS[p.fecha] || p.fecha}.`;
}
function sinConexion() {
  return !conectado ? 'Abra esta página en claude.ai con su sesión iniciada para guardar cambios.'
    : !puedeEscribir ? 'Su acceso es de solo lectura. Pídale al dueño permiso de Colaborador.' : '';
}

// ================= pintar =================
function pintarTodo() { Object.keys(DIAS).forEach(pintarDia); pintarRutas(); pintarTarifas(); pintarResumen(); }

function pintarDia(fecha) {
  const cont = document.getElementById('lista-' + fecha);
  if (!cont) return;
  const t = (q.value || '').trim().toLowerCase();
  const lista = Object.entries(D.personas).filter(([, p]) => p.fecha === fecha)
    .sort(([, a], [, b]) => (a.orden ?? 999) - (b.orden ?? 999) || a.lugar.localeCompare(b.lugar) || (a.es_grupo - b.es_grupo) || a.nombre.localeCompare(b.nombre));
  const tot = [0, 0, 0], firm = [0, lista.length];
  const lugares = new Map();
  for (const [id, p] of lista) {
    tot[0] += p.am || 0; tot[1] += p.al || 0; tot[2] += p.pm || 0; if (D.actas[id]) firm[0]++;
    if (!lugares.has(p.lugar)) lugares.set(p.lugar, []);
    lugares.get(p.lugar).push([id, p]);
  }
  document.getElementById('tot-' + fecha).innerHTML = `<span><b>${tot[0]}</b> mer. AM</span><span><b>${tot[1]}</b> almuerzos</span><span><b>${tot[2]}</b> mer. PM</span><span><b>${firm[0]}/${firm[1]}</b> recibidos</span>`;
  if (!lista.length) {
    cont.innerHTML = `<p class="pie">${conectado ? 'No hay personas en este día. Use “+ Agregar persona”.' : 'Cargando la planilla…'}</p>`;
    return;
  }
  const celda = (n) => `<td class="n">${n ? n : '<span class="dash">·</span>'}</td>`;
  let html = '';
  for (const [lugar, filas] of lugares) {
    const vis = filas.filter(([, p]) => !t || `${p.nombre} ${p.grupo || ''} ${lugar}`.toLowerCase().includes(t));
    if (!vis.length) continue;
    const s = [0, 0, 0]; let f = 0;
    filas.forEach(([id, p]) => { s[0] += p.am || 0; s[1] += p.al || 0; s[2] += p.pm || 0; if (D.actas[id]) f++; });
    html += `<div class="ubic"><h3>${esc(lugar)}</h3><div class="tw"><table>
      <thead><tr><th>Quién recibe</th><th class="n">AM</th><th class="n">Alm.</th><th class="n">PM</th><th class="acta">Recibido</th></tr></thead><tbody>
      ${vis.map(([id, p]) => {
        const a = D.actas[id];
        return `<tr class="${p.es_grupo ? 'grupo' : ''}${a ? ' firmada' : ''}">
          <td><button type="button" class="nombre" data-editar="${esc(id)}"><b>${esc(p.nombre)}</b>${p.es_grupo ? `<span class="tag">grupo · ${personasDe(p)}</span>` : ''}</button>
            <div class="sub">${esc(p.grupo || '')}${tarifa(p.tarifa) ? ` · ${esc(tarifa(p.tarifa).nombre)}` : ''}</div>
            ${p.obs && !a ? `<div class="nota">${esc(p.obs)}</div>` : ''}</td>
          ${celda(p.am)}${celda(p.al)}${celda(p.pm)}
          <td class="acta"><button type="button" class="chk${a ? ' ok' : ''}" data-acta="${esc(id)}" aria-label="Recibido de ${esc(p.nombre)}"><span class="box"></span><span class="hora">${a ? horaCorta(a.firmado_en) : ''}</span></button></td></tr>`;
      }).join('')}</tbody>
      <tfoot><tr><td>Total</td>${celda(s[0])}${celda(s[1])}${celda(s[2])}<td class="acta progreso">${f}/${filas.length}</td></tr></tfoot></table></div></div>`;
  }
  cont.innerHTML = html || '<p class="pie">Nadie coincide con la búsqueda en este día.</p>';
}

function pintarRutas() {
  const cont = document.getElementById('lista-rutas');
  const lista = Object.entries(D.rutas).sort(([, a], [, b]) => (a.fecha + (a.hora_recogida || '99')).localeCompare(b.fecha + (b.hora_recogida || '99')));
  document.getElementById('tot-rutas').innerHTML = `<span><b>${lista.length}</b> rutas</span><span><b>${lista.filter(([, r]) => r.placa).length}</b> con placa</span>`;
  if (!lista.length) { cont.innerHTML = `<p class="pie">${conectado ? 'No hay rutas. Use “+ Agregar ruta”.' : 'Cargando rutas…'}</p>`; return; }
  const falta = (v) => (v ? esc(v) : '<span class="falta">Por definir</span>');
  cont.innerHTML = lista.map(([id, r]) => `<article class="ruta">
    <div class="rh"><span class="fecha">${esc(DIAS[r.fecha] || r.fecha)}</span><h3>${esc(r.actividad)}</h3></div>
    <ol class="paradas">${(r.paradas || []).map((p) => `<li><span class="lugar">${esc(p.lugar || '¿?')}</span><span class="quien">${esc(p.quien || '')}</span></li>`).join('')}
      <li class="fin"><span class="lugar">${esc(r.destino || '¿?')}</span><span class="quien">Destino${r.hora_actividad ? ' · actividad ' + esc(r.hora_actividad) : ''}</span></li></ol>
    <dl><dt>Recogida</dt><dd>${falta(r.hora_recogida)}</dd><dt>Conductor</dt><dd>${falta(r.conductor)}${r.conductor_tel ? ' · ' + esc(r.conductor_tel) : ''}</dd>
      <dt>Vehículo</dt><dd>${falta([r.placa, r.vehiculo].filter(Boolean).join(' · '))}</dd><dt>Regreso</dt><dd>${falta(r.hora_regreso)}${r.lugar_regreso ? ' desde ' + esc(r.lugar_regreso) : ''}</dd>
      ${r.equipos ? `<dt>Equipos</dt><dd>${esc(r.equipos)}</dd>` : ''}</dl>
    ${r.notas ? `<p class="cruce">${esc(r.notas)}</p>` : ''}
    <button type="button" class="btn sec" data-ruta="${esc(id)}">Editar ruta</button></article>`).join('');
}

function pintarTarifas() {
  const cont = document.getElementById('tarifas');
  if (!cont) return;
  const lista = D.tarifas.length ? D.tarifas.map((t) => `<li><span>${esc(t.nombre)}</span><b>${pesos(t.valor)}</b></li>`).join('') : '<li class="pie">Aún no hay tarifas.</li>';
  cont.innerHTML = `<ul class="tarifas">${lista}</ul>
    ${puedeAdministrar ? '<button type="button" class="btn sec" id="editar-tarifas">Cambiar tarifas</button>' : '<p class="pie" style="margin:0">Solo el administrador cambia las tarifas.</p>'}`;
  const b = document.getElementById('editar-tarifas'); if (b) b.onclick = editarTarifas;
}

function pintarResumen() {
  const tot = [0, 0, 0]; let monto = 0, n = 0;
  for (const p of Object.values(D.personas)) { tot[0] += p.am || 0; tot[1] += p.al || 0; tot[2] += p.pm || 0; n++; }
  for (const a of Object.values(D.actas)) monto += a.monto || 0;
  const el = document.getElementById('resumen-gen');
  if (el) el.innerHTML = `<div><b>${tot[0]}</b><span>meriendas AM</span></div><div><b>${tot[1]}</b><span>almuerzos</span></div>
    <div><b>${tot[2]}</b><span>meriendas PM</span></div><div><b>${Object.keys(D.actas).length}/${n}</b><span>recibidos · ${pesos(monto)} entregados</span></div>`;
}

// ================= hoja (ventana) =================
function abrir(html, despues) {
  hoja.innerHTML = html; velo.hidden = false; document.body.style.overflow = 'hidden';
  hoja.querySelector('.cerrar').onclick = cerrar;
  if (despues) despues();
}
function cerrar() { velo.hidden = true; document.body.style.overflow = ''; hoja.innerHTML = ''; }
velo.addEventListener('click', (ev) => { if (ev.target === velo) cerrar(); });
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !velo.hidden) cerrar(); });
const cab = (sub, titulo) => `<div class="cab"><div><span class="pie">${esc(sub)}</span><h2 id="hoja-titulo">${esc(titulo)}</h2></div><button type="button" class="cerrar" aria-label="Cerrar">×</button></div>`;
const aviso = (t) => `<p class="msg">${esc(t)}</p>`;
async function guardar(ref, datos, btn, msgEl) {
  btn.disabled = true;
  try { await ref.set(datos); return true; }
  catch (err) {
    btn.disabled = false;
    if (err && err.code === 'invalid_argument') { puedeEscribir = false; msgEl.textContent = 'No tiene permiso para guardar en esta página.'; }
    else msgEl.textContent = 'No se pudo guardar. Revise la conexión e intente de nuevo.';
    msgEl.hidden = false; return false;
  }
}

document.addEventListener('click', (ev) => {
  const a = ev.target.closest('[data-acta]'); if (a) return D.actas[a.dataset.acta] ? verRecibido(a.dataset.acta) : nuevoRecibido(a.dataset.acta);
  const e = ev.target.closest('[data-editar]'); if (e) return editarPersona(e.dataset.editar);
  const n = ev.target.closest('[data-nueva]'); if (n) return editarPersona(null, n.dataset.nueva);
  const r = ev.target.closest('[data-ruta]'); if (r) return editarRuta(r.dataset.ruta);
  if (ev.target.closest('#nueva-ruta')) return editarRuta(null);
});

// ---------- personas ----------
function editarPersona(id, fechaNueva) {
  const p = id ? D.personas[id] : { fecha: fechaNueva, lugar: '', nombre: '', grupo: 'Equipo Ecofest', es_grupo: false, am: 0, al: 1, pm: 0, obs: '', tarifa: tarifaSugerida({}) };
  const bloqueo = sinConexion();
  const lugares = [...new Set(Object.values(D.personas).map((x) => x.lugar))].sort();
  const firmado = id && D.actas[id];
  abrir(`${cab(DIAS[p.fecha] || p.fecha, id ? 'Editar persona' : 'Agregar persona')}
    ${bloqueo ? aviso(bloqueo) : ''}${firmado ? aviso('Esta entrega ya tiene recibido firmado: los cambios no modifican el recibido.') : ''}
    <form id="f-p" style="display:grid;gap:12px">
      <label>Nombre de la persona o del grupo<input id="p-nombre" value="${esc(p.nombre)}" required autocomplete="off"></label>
      <label class="decl"><input type="checkbox" id="p-grupo" ${p.es_grupo ? 'checked' : ''}><span>Es un grupo (una persona recibe y firma por todos)</span></label>
      <div class="dos">
        <label>Grupo o entidad<input id="p-ent" value="${esc(p.grupo || '')}" placeholder="Gobernación, CUC…"></label>
        <label>Lugar<input id="p-lugar" value="${esc(p.lugar)}" list="dl-lugares" required placeholder="Plaza de la Paz"></label>
      </div>
      <datalist id="dl-lugares">${lugares.map((l) => `<option value="${esc(l)}">`).join('')}</datalist>
      <div class="tres">
        <label>Merienda AM<input id="p-am" type="number" min="0" inputmode="numeric" value="${p.am || 0}"></label>
        <label>Almuerzo<input id="p-al" type="number" min="0" inputmode="numeric" value="${p.al || 0}"></label>
        <label>Merienda PM<input id="p-pm" type="number" min="0" inputmode="numeric" value="${p.pm || 0}"></label>
      </div>
      <label>Tarifa<select id="p-tar">${D.tarifas.map((t) => `<option value="${esc(t.id)}" ${t.id === p.tarifa ? 'selected' : ''}>${esc(t.nombre)} · ${pesos(t.valor)}</option>`).join('')}<option value="" ${!tarifa(p.tarifa) ? 'selected' : ''}>Sin tarifa (monto manual)</option></select></label>
      <label>Observación<input id="p-obs" value="${esc(p.obs || '')}"></label>
      <p class="msg" id="p-msg" hidden></p>
      <button class="btn" id="p-ok" ${bloqueo ? 'disabled' : ''}>Guardar</button>
      ${id && !firmado && !bloqueo ? '<button type="button" class="btn peligro" id="p-quitar">Quitar de la lista</button><div id="p-conf"></div>' : ''}
    </form>`, () => {
    document.getElementById('f-p').onsubmit = async (ev) => {
      ev.preventDefault();
      const msg = document.getElementById('p-msg');
      const datos = {
        ...p, nombre: document.getElementById('p-nombre').value.trim(), es_grupo: document.getElementById('p-grupo').checked,
        grupo: document.getElementById('p-ent').value.trim(), lugar: document.getElementById('p-lugar').value.trim(),
        am: entero(document.getElementById('p-am').value), al: entero(document.getElementById('p-al').value), pm: entero(document.getElementById('p-pm').value),
        tarifa: document.getElementById('p-tar').value, obs: document.getElementById('p-obs').value.trim(),
      };
      if (!datos.nombre || !datos.lugar) { msg.textContent = 'Escriba el nombre y el lugar.'; msg.hidden = false; return; }
      if (!datos.am && !datos.al && !datos.pm) { msg.textContent = 'Marque al menos una comida.'; msg.hidden = false; return; }
      const nid = id || nuevoId(datos.fecha);
      if (await guardar(db.collection('personas').doc(nid), datos, document.getElementById('p-ok'), msg)) {
        D.personas[nid] = datos; pintarTodo(); cerrar(); toast(id ? 'Cambios guardados' : `${datos.nombre} agregado(a)`);
      }
    };
    const qt = document.getElementById('p-quitar');
    if (qt) qt.onclick = () => {
      document.getElementById('p-conf').innerHTML = `<div class="confirmar"><span>¿Quitar a ${esc(p.nombre)} de la lista de este día?</span>
        <div class="fila2"><button type="button" class="btn peligro" id="p-si">Sí, quitar</button><button type="button" class="btn sec" id="p-no">No</button></div></div>`;
      document.getElementById('p-no').onclick = () => (document.getElementById('p-conf').innerHTML = '');
      document.getElementById('p-si').onclick = async () => {
        try { await db.collection('personas').doc(id).delete(); delete D.personas[id]; pintarTodo(); cerrar(); toast('Quitado de la lista'); }
        catch { toast('No se pudo quitar. Intente de nuevo.'); }
      };
    };
  });
}

// ---------- recibidos ----------
function nuevoRecibido(id) {
  const p = D.personas[id];
  const bloqueo = sinConexion();
  if (bloqueo) return abrir(`${cab(`${DIAS[p.fecha]} · ${p.lugar}`, 'Entrega de alimentación')}${aviso(bloqueo)}`);
  const cant = personasDe(p);
  const tarIni = tarifaSugerida(p);
  abrir(`${cab(`${DIAS[p.fecha]} · ${p.lugar}`, 'Entrega de alimentación')}
    <div class="resumen-acta"><b style="font-size:18px">${esc(p.nombre)}${p.es_grupo ? ` · grupo de ${cant}` : ''}</b>
      <span class="pie">${esc(p.grupo || '')}</span><span>${esc(comidas(p))}</span></div>
    <form id="f-r" style="display:grid;gap:12px" novalidate>
      ${p.es_grupo ? '<label>Nombre de quien recibe por el grupo<input id="r-quien" autocomplete="off" required></label>' : ''}
      <div class="dos">
        <label>Cédula<input id="r-doc" inputmode="numeric" autocomplete="off" required></label>
        <label>Celular (opcional)<input id="r-tel" type="tel" autocomplete="off"></label>
      </div>
      <fieldset class="opciones"><legend>Tipo de entrega</legend>
        ${D.tarifas.map((t) => `<label class="opcion"><input type="radio" name="r-tar" value="${esc(t.id)}" ${t.id === tarIni ? 'checked' : ''}><span>${esc(t.nombre)}</span><b>${pesos(t.valor)}</b></label>`).join('')}
        <label class="opcion"><input type="radio" name="r-tar" value="" ${!tarIni ? 'checked' : ''}><span>Otro valor</span><b></b></label>
      </fieldset>
      <label>Monto entregado${p.es_grupo ? ` (${cant} personas)` : ''}<input id="r-monto" inputmode="numeric" required></label>
      <label class="decl"><input type="checkbox" id="r-acepto"><span id="r-texto"></span></label>
      <div><b style="font-size:14px">Firma de quien recibe</b>
        <div class="lienzo" style="margin-top:4px"><canvas id="r-lienzo"></canvas><div class="linea"></div><div class="ayuda">Firme aquí con el dedo</div></div>
        <div class="fila2" style="justify-content:space-between;margin-top:6px"><span class="pie">Queda guardada con fecha y hora.</span>
          <button type="button" class="btn sec" id="r-borrar">Borrar firma</button></div></div>
      <p class="msg" id="r-msg" hidden></p>
      <button class="btn" id="r-ok" style="min-height:54px;font-size:17px">Confirmar recibido</button>
    </form>`, () => {
    const f = document.getElementById('f-r'), monto = document.getElementById('r-monto');
    const tarSel = () => tarifa((f.querySelector('input[name=r-tar]:checked') || {}).value);
    const quien = () => (p.es_grupo ? document.getElementById('r-quien').value.trim() : p.nombre);
    const ponerMonto = () => { const t = tarSel(); if (t) monto.value = t.valor * cant; };
    const actualizar = () => { document.getElementById('r-texto').textContent = declaracion(p, quien(), document.getElementById('r-doc').value.trim(), entero(monto.value), tarSel()); };
    f.querySelectorAll('input[name=r-tar]').forEach((r) => r.addEventListener('change', () => { if (r.value) ponerMonto(); else { monto.value = ''; monto.focus(); } actualizar(); }));
    ponerMonto(); f.addEventListener('input', actualizar); actualizar();
    const firma = lienzoFirma(document.getElementById('r-lienzo'));
    document.getElementById('r-borrar').onclick = firma.limpiar;
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const msg = document.getElementById('r-msg'), falta = (t) => { msg.textContent = t; msg.hidden = false; };
      const doc = document.getElementById('r-doc').value.trim(), m = entero(monto.value), t = tarSel();
      if (p.es_grupo && !quien()) return falta('Escriba el nombre de quien recibe por el grupo.');
      if (!doc) return falta('Falta la cédula.');
      if (!m) return falta('Escriba el monto entregado.');
      if (!document.getElementById('r-acepto').checked) return falta('La persona debe marcar la declaración.');
      if (firma.vacia()) return falta('Falta la firma.');
      msg.hidden = true;
      const acta = {
        entrega: id, fecha: p.fecha, lugar: p.lugar, beneficiario: p.nombre, grupo: p.grupo || '', es_grupo: !!p.es_grupo, personas: cant,
        comidas: comidas(p), merienda_am: p.am || 0, almuerzo: p.al || 0, merienda_pm: p.pm || 0,
        tarifa: t ? t.nombre : 'Otro valor', valor_unitario: t ? t.valor : null, recibe: quien(), documento: doc,
        telefono: document.getElementById('r-tel').value.trim(), monto: m, declaracion: declaracion(p, quien(), doc, m, t),
        firma: firma.imagen(), firmado_en: new Date().toISOString(), registrado_por: usuario ? await usuario.id().catch(() => null) : null,
      };
      if (await guardar(db.collection('actas').doc(id), acta, document.getElementById('r-ok'), msg)) {
        D.actas[id] = acta; pintarTodo(); cerrar(); toast(`Recibido guardado: ${acta.recibe}`);
      }
    };
  });
}

function verRecibido(id) {
  const a = D.actas[id];
  abrir(`${cab(`${DIAS[a.fecha]} · ${a.lugar}`, 'Recibido ' + consecutivo(id))}
    <div class="resumen-acta">
      <b style="font-size:18px">${esc(a.recibe)}</b>
      ${a.es_grupo ? `<span>Por el grupo ${esc(a.beneficiario)} (${a.personas || ''} personas)</span>` : `<span class="pie">${esc(a.grupo || '')}</span>`}
      <span>CC ${esc(a.documento)}${a.telefono ? ' · ' + esc(a.telefono) : ''}</span>
      <span style="font-size:24px;font-weight:800">${pesos(a.monto)}</span>
      <span>${esc(a.tarifa || '')} · ${esc(a.comidas)}</span>
      <span class="pie" id="v-firmado">Firmado: ${esc(fechaHora(a.firmado_en))}</span>
    </div>
    <p style="margin:0;font-size:14px">${esc(a.declaracion)}</p>
    <div class="firma-img"><img src="${esc(a.firma)}" alt="Firma de ${esc(a.recibe)}"></div>
    <div class="fila2"><button type="button" class="btn" id="v-desc">Descargar soporte (imagen)</button>
      ${puedeAdministrar ? '<button type="button" class="btn peligro" id="v-anular">Anular recibido</button>' : ''}</div>
    <div id="v-conf"></div>`, () => {
    if (usuario && a.registrado_por) usuario.profiles([a.registrado_por]).then((ps) => {
      const n = ps && ps[a.registrado_por] && ps[a.registrado_por].name; const el = document.getElementById('v-firmado');
      if (n && el) el.textContent += ' · registró ' + n;
    }).catch(() => {});
    document.getElementById('v-desc').onclick = () => descargarSoporte(id);
    const an = document.getElementById('v-anular');
    if (an) an.onclick = () => {
      document.getElementById('v-conf').innerHTML = `<div class="confirmar"><span>¿Anular este recibido? La entrega vuelve a quedar pendiente y la firma se borra.</span>
        <div class="fila2"><button type="button" class="btn peligro" id="v-si">Sí, anular</button><button type="button" class="btn sec" id="v-no">No</button></div></div>`;
      document.getElementById('v-no').onclick = () => (document.getElementById('v-conf').innerHTML = '');
      document.getElementById('v-si').onclick = async () => {
        try { await db.collection('actas').doc(id).delete(); delete D.actas[id]; pintarTodo(); cerrar(); toast('Recibido anulado'); }
        catch { toast('No se pudo anular. Intente de nuevo.'); }
      };
    };
  });
}

// ---------- rutas ----------
function editarRuta(id) {
  const r = id ? D.rutas[id] : { fecha: '2026-10-23', actividad: '', destino: '', paradas: [], hora_recogida: '', hora_actividad: '', conductor: '', conductor_tel: '', placa: '', vehiculo: '', hora_regreso: '', lugar_regreso: '', equipos: '', notas: '' };
  const bloqueo = sinConexion();
  const v = (k) => esc(r[k] || '');
  abrir(`${cab('Transporte', id ? 'Editar ruta' : 'Agregar ruta')}${bloqueo ? aviso(bloqueo) : ''}
    <form id="f-ruta" style="display:grid;gap:12px">
      <div class="dos">
        <label>Actividad<input id="t-actividad" value="${v('actividad')}" required placeholder="Yoga"></label>
        <label>Día<select id="t-fecha">${Object.entries(DIAS).map(([f, n]) => `<option value="${f}" ${f === r.fecha ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      </div>
      <label>Paradas de recogida, una por línea: <span class="pie">Lugar: personas</span>
        <textarea id="t-paradas" rows="4" placeholder="Edificio Mallorquín: Chavelita (2)&#10;Montecristo: Jessica">${esc((r.paradas || []).map((p) => `${p.lugar}${p.quien ? ': ' + p.quien : ''}`).join('\n'))}</textarea></label>
      <div class="dos">
        <label>Hora de recogida<input id="t-hora" type="time" value="${v('hora_recogida')}"></label>
        <label>Destino<input id="t-destino" value="${v('destino')}"></label>
      </div>
      <div class="dos">
        <label>Conductor<input id="t-cond" value="${v('conductor')}"></label>
        <label>Celular conductor<input id="t-ctel" type="tel" value="${v('conductor_tel')}"></label>
      </div>
      <div class="dos">
        <label>Placa<input id="t-placa" value="${v('placa')}" style="text-transform:uppercase"></label>
        <label>Vehículo<input id="t-veh" value="${v('vehiculo')}" placeholder="Van blanca"></label>
      </div>
      <div class="dos">
        <label>Hora de regreso<input id="t-reg" type="time" value="${v('hora_regreso')}"></label>
        <label>Recoger de nuevo en<input id="t-lreg" value="${v('lugar_regreso')}"></label>
      </div>
      <label>Equipos o carga<input id="t-equipos" value="${v('equipos')}"></label>
      <label>Notas<textarea id="t-notas" rows="3">${v('notas')}</textarea></label>
      <p class="msg" id="t-msg" hidden></p>
      <button class="btn" id="t-ok" ${bloqueo ? 'disabled' : ''}>Guardar ruta</button>
      ${id && !bloqueo ? '<button type="button" class="btn peligro" id="t-quitar">Eliminar ruta</button><div id="t-conf"></div>' : ''}
    </form>`, () => {
    document.getElementById('f-ruta').onsubmit = async (ev) => {
      ev.preventDefault();
      const g = (k) => document.getElementById(k).value.trim(), msg = document.getElementById('t-msg');
      const datos = {
        ...r, actividad: g('t-actividad'), fecha: g('t-fecha'), destino: g('t-destino'), hora_recogida: g('t-hora'),
        paradas: g('t-paradas').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const i = l.indexOf(':'); return i < 0 ? { lugar: l, quien: '' } : { lugar: l.slice(0, i).trim(), quien: l.slice(i + 1).trim() }; }),
        conductor: g('t-cond'), conductor_tel: g('t-ctel'), placa: g('t-placa').toUpperCase(), vehiculo: g('t-veh'),
        hora_regreso: g('t-reg'), lugar_regreso: g('t-lreg'), equipos: g('t-equipos'), notas: g('t-notas'),
      };
      if (!datos.actividad) { msg.textContent = 'Escriba la actividad.'; msg.hidden = false; return; }
      const nid = id || nuevoId(datos.fecha);
      if (await guardar(db.collection('rutas').doc(nid), datos, document.getElementById('t-ok'), msg)) {
        D.rutas[nid] = datos; pintarRutas(); cerrar(); toast('Ruta guardada');
      }
    };
    const qt = document.getElementById('t-quitar');
    if (qt) qt.onclick = () => {
      document.getElementById('t-conf').innerHTML = `<div class="confirmar"><span>¿Eliminar la ruta ${esc(r.actividad)}?</span>
        <div class="fila2"><button type="button" class="btn peligro" id="t-si">Sí, eliminar</button><button type="button" class="btn sec" id="t-no">No</button></div></div>`;
      document.getElementById('t-no').onclick = () => (document.getElementById('t-conf').innerHTML = '');
      document.getElementById('t-si').onclick = async () => {
        try { await db.collection('rutas').doc(id).delete(); delete D.rutas[id]; pintarRutas(); cerrar(); toast('Ruta eliminada'); }
        catch { toast('No se pudo eliminar. Intente de nuevo.'); }
      };
    };
  });
}

// ---------- tarifas ----------
function editarTarifas() {
  const fila = (t) => `<div class="fila-tarifa"><input class="tf-nombre" value="${esc(t.nombre)}" placeholder="Nombre (Completo, Medio día…)" aria-label="Nombre de la tarifa">
    <input class="tf-valor" inputmode="numeric" value="${t.valor || ''}" placeholder="$" aria-label="Valor"><input type="hidden" class="tf-id" value="${esc(t.id || '')}">
    <button type="button" class="cerrar tf-quitar" aria-label="Quitar tarifa">×</button></div>`;
  abrir(`${cab('Valores de la entrega', 'Tarifas')}
    <p class="pie" style="margin:0">El monto sugerido es el valor de la tarifa por cada persona. Siempre se puede corregir al entregar.</p>
    <form id="f-tar" style="display:grid;gap:10px"><div id="tf-filas" style="display:grid;gap:8px">${(D.tarifas.length ? D.tarifas : [{ nombre: '', valor: 0 }]).map(fila).join('')}</div>
      <button type="button" class="btn sec" id="tf-mas">+ Agregar tarifa</button>
      <p class="msg" id="tf-msg" hidden></p><button class="btn" id="tf-ok">Guardar tarifas</button></form>`, () => {
    const filas = document.getElementById('tf-filas');
    filas.addEventListener('click', (ev) => { const b = ev.target.closest('.tf-quitar'); if (b) b.parentElement.remove(); });
    document.getElementById('tf-mas').onclick = () => { filas.insertAdjacentHTML('beforeend', fila({ nombre: '', valor: 0 })); filas.lastElementChild.querySelector('input').focus(); };
    document.getElementById('f-tar').onsubmit = async (ev) => {
      ev.preventDefault();
      const msg = document.getElementById('tf-msg');
      const lista = [...filas.children].map((f) => ({ id: f.querySelector('.tf-id').value, nombre: f.querySelector('.tf-nombre').value.trim(), valor: entero(f.querySelector('.tf-valor').value) }))
        .filter((t) => t.nombre && t.valor)
        .map((t) => ({ ...t, id: t.id || t.nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-') }));
      if (!lista.length) { msg.textContent = 'Deje al menos una tarifa con nombre y valor.'; msg.hidden = false; return; }
      if (await guardar(db.doc('config/tarifas'), { lista }, document.getElementById('tf-ok'), msg)) {
        D.tarifas = lista; pintarTodo(); cerrar(); toast('Tarifas guardadas');
      }
    };
  });
}

// ---------- firma con el dedo ----------
function lienzoFirma(canvas) {
  const ctx = canvas.getContext('2d');
  let trazos = 0, dibujando = false, ultimo = null;
  function ajustar() {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, r.width, r.height);
    ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0E2A1E'; trazos = 0;
  }
  ajustar();
  const pos = (ev) => { const r = canvas.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
  canvas.addEventListener('pointerdown', (ev) => { ev.preventDefault(); canvas.setPointerCapture(ev.pointerId); dibujando = true; ultimo = pos(ev); });
  canvas.addEventListener('pointermove', (ev) => {
    if (!dibujando) return; ev.preventDefault();
    const p = pos(ev); ctx.beginPath(); ctx.moveTo(ultimo.x, ultimo.y); ctx.lineTo(p.x, p.y); ctx.stroke(); ultimo = p; trazos++;
  });
  const fin = () => (dibujando = false);
  canvas.addEventListener('pointerup', fin); canvas.addEventListener('pointercancel', fin);
  return {
    limpiar: ajustar, vacia: () => trazos < 8,
    // imagen liviana (600 px de ancho) para que el recibido quepa holgado en la base
    imagen: () => {
      const c = document.createElement('canvas'); c.width = 600; c.height = Math.round(600 * canvas.height / canvas.width);
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(canvas, 0, 0, c.width, c.height);
      return c.toDataURL('image/png');
    },
  };
}

// ---------- soporte descargable ----------
function cargarImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
function envolver(ctx, texto, x, y, ancho, alto) {
  let linea = '';
  for (const p of texto.split(' ')) {
    const t = linea ? linea + ' ' + p : p;
    if (ctx.measureText(t).width > ancho && linea) { ctx.fillText(linea, x, y); y += alto; linea = p; } else linea = t;
  }
  if (linea) ctx.fillText(linea, x, y);
  return y + alto;
}
async function descargarSoporte(id) {
  const a = D.actas[id];
  if (!descargas) return toast('Esta vista no permite descargar archivos.');
  const W = 1000, c = document.createElement('canvas'); c.width = W; c.height = 1400;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, c.height);
  x.fillStyle = '#183A2C'; x.fillRect(0, 0, W, 170); x.fillStyle = '#8DC63F'; x.fillRect(0, 170, W, 8);
  try { const logo = await cargarImg(document.querySelector('header img').src); x.drawImage(logo, 40, 30, 110 * logo.width / logo.height, 110); } catch {}
  x.fillStyle = '#fff'; x.textAlign = 'right'; x.font = 'bold 34px system-ui, sans-serif'; x.fillText('Recibido de entrega', W - 40, 80);
  x.font = 'bold 28px system-ui, sans-serif'; x.fillText(consecutivo(id), W - 40, 125);
  x.textAlign = 'left';
  const filas = [['Recibió', a.recibe], ...(a.es_grupo ? [['Grupo', `${a.beneficiario} (${a.personas} personas)`]] : a.grupo ? [['Grupo', a.grupo]] : []),
    ['Cédula', a.documento], ...(a.telefono ? [['Celular', a.telefono]] : []), ['Lugar', a.lugar], ['Fecha del evento', DIAS[a.fecha] || a.fecha],
    ['Comidas', a.comidas], ['Tipo de entrega', a.tarifa || ''], ['Valor entregado', pesos(a.monto)], ['Firmado', fechaHora(a.firmado_en)]];
  let y = 240;
  for (const [k, v] of filas) {
    x.font = '24px system-ui, sans-serif'; x.fillStyle = '#5B6A61'; x.fillText(k, 40, y);
    x.font = (k === 'Valor entregado' ? 'bold 34px' : 'bold 26px') + ' system-ui, sans-serif'; x.fillStyle = '#18221D';
    y = envolver(x, String(v), 300, y, W - 340, 34) + 14;
  }
  x.font = '22px system-ui, sans-serif'; x.fillStyle = '#18221D';
  y = envolver(x, a.declaracion, 40, y + 20, W - 80, 32) + 10;
  const f = await cargarImg(a.firma); const fh = 220, fw = Math.min(W - 160, fh * f.width / f.height);
  x.drawImage(f, (W - fw) / 2, y, fw, fh); y += fh + 10;
  x.strokeStyle = '#18221D'; x.beginPath(); x.moveTo(200, y); x.lineTo(W - 200, y); x.stroke();
  x.textAlign = 'center'; x.font = 'bold 24px system-ui, sans-serif'; x.fillText(a.recibe, W / 2, y + 36);
  x.font = '20px system-ui, sans-serif'; x.fillStyle = '#5B6A61'; x.fillText('Firma de quien recibe · CC ' + a.documento, W / 2, y + 64);
  const final = document.createElement('canvas'); final.width = W; final.height = y + 110; final.getContext('2d').drawImage(c, 0, 0);
  const blob = await new Promise((r) => final.toBlob(r, 'image/png'));
  const nombre = `${consecutivo(id)}_${a.recibe}`.replace(/[^\wÁÉÍÓÚáéíóúÑñ-]+/g, '_') + '.png';
  try { await descargas.save({ filename: nombre, data: blob }); } catch (err) { if (err && err.code !== 'declined') toast('No se pudo descargar el soporte.'); }
}

// ---------- exportar ----------
document.getElementById('exp-csv').onclick = async () => {
  const lista = Object.values(D.actas).sort((p, r) => (p.fecha + p.lugar + p.beneficiario).localeCompare(r.fecha + r.lugar + r.beneficiario));
  if (!lista.length) return toast('Todavía no hay recibidos firmados.');
  if (!descargas) return toast('Esta vista no permite descargar archivos.');
  const cols = [['entrega', 'Recibido'], ['fecha', 'Fecha'], ['lugar', 'Lugar'], ['beneficiario', 'Persona o grupo'], ['grupo', 'Grupo'], ['personas', 'Personas'],
    ['recibe', 'Recibió'], ['documento', 'Cédula'], ['telefono', 'Celular'], ['merienda_am', 'Merienda AM'], ['almuerzo', 'Almuerzo'], ['merienda_pm', 'Merienda PM'],
    ['tarifa', 'Tipo de entrega'], ['monto', 'Monto'], ['firmado_en', 'Firmado']];
  const celda = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const filas = lista.map((a) => cols.map(([k]) => celda(k === 'entrega' ? consecutivo(a.entrega) : k === 'firmado_en' ? fechaHora(a[k]) : a[k])).join(';'));
  try { await descargas.save({ filename: 'recibidos_ecofest.csv', data: '﻿' + [cols.map((c) => c[1]).join(';'), ...filas].join('\r\n') }); }
  catch (err) { if (err && err.code !== 'declined') toast('No se pudo descargar.'); }
};
q.addEventListener('input', () => Object.keys(DIAS).forEach(pintarDia));

// ---------- conexión ----------
const estadoDb = document.querySelector('.estado-db');
(async () => {
  pintarTodo();
  if (!window.claude || !window.claude.use) { estadoDb.textContent = 'La planilla se carga solo cuando la página está abierta en claude.ai.'; return; }
  [db, usuario, descargas] = await Promise.all([claude.use('db'), claude.use('user'), claude.use('downloads')]);
  if (!db) { estadoDb.textContent = 'Inicie sesión en claude.ai para ver y guardar la planilla.'; return; }
  if (usuario) { if ((await usuario.can('data.write')) === false) puedeEscribir = false; puedeAdministrar = !!(await usuario.canEdit()); }
  const escuchar = (col, destino) => db.collection(col).limit(1000).onSnapshot((snap) => {
    conectado = true;
    for (const k of Object.keys(D[destino])) delete D[destino][k];
    snap.docs.forEach((d) => { if (d.exists) D[destino][d.id] = d.data(); });
    pintarTodo();
  }, () => { estadoDb.textContent = 'Se perdió la conexión con la base. Recargue la página.'; });
  escuchar('personas', 'personas'); escuchar('actas', 'actas'); escuchar('rutas', 'rutas');
  db.doc('config/tarifas').onSnapshot((d) => { D.tarifas = d.exists && Array.isArray(d.data().lista) ? d.data().lista : []; pintarTodo(); }, () => {});
  estadoDb.textContent = puedeEscribir ? 'Conectado: todo se guarda en línea y lo ve el equipo al instante.' : 'Acceso de solo lectura.';
})();
