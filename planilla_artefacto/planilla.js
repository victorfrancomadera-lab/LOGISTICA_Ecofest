// Planilla Ecofest: personas, recibidos de entrega, rutas y tarifas viven en la base compartida del artefacto.
//   personas/{id}   alimentación por día y lugar      actas/{id}    recibido firmado (mismo id de la persona)
//   rutas/{id}      transporte                         config/tarifas  {lista: [{id, nombre, valor}]}
const DIAS = { '2026-10-22': 'jueves 22 de octubre', '2026-10-23': 'viernes 23 de octubre', '2026-10-24': 'sábado 24 de octubre', '2026-10-25': 'domingo 25 de octubre' };
const D = { personas: {}, actas: {}, rutas: {}, tarifas: [], caja: {} };
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
// Alimentación por jornada: cada entrega es de día entero o de medio día (tarifa), por persona
const personasDe = (p) => (p.es_grupo ? (p.personas || Math.max(p.am || 0, p.al || 0, p.pm || 0, 1)) : 1);
const tarifa = (id) => D.tarifas.find((t) => t.id === id);
const nombreJornada = (p, tar) => ((tar || tarifa(p.tarifa) || {}).nombre || 'Día entero');
function comidas(p, tar) { return `alimentación de ${nombreJornada(p, tar).toLowerCase()}`; }
function tarifaSugerida(p) { return tarifa(p.tarifa) ? p.tarifa : (D.tarifas[0] && D.tarifas[0].id) || ''; }
function toast(msg) {
  const t = document.getElementById('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3000);
}
function declaracion(p, quien, doc, monto, tar) {
  const grupo = p.es_grupo ? ` como responsable del grupo ${p.nombre} (${personasDe(p)} personas),` : '';
  return `Yo, ${quien || '______'}, identificado(a) con documento ${doc || '______'},${grupo} declaro que recibí ${pesos(monto)} en efectivo para ${comidas(p, tar)} del evento Ecofest, en ${p.lugar}, el ${DIAS[p.fecha] || p.fecha}.`;
}
function sinConexion() {
  return !conectado ? 'Abra esta página en claude.ai con su sesión iniciada para guardar cambios.'
    : !puedeEscribir ? 'Su acceso es de solo lectura. Pídale al dueño permiso de Colaborador.' : '';
}

// ================= pintar =================
function pintarTodo() { Object.keys(DIAS).forEach(pintarDia); pintarRutas(); pintarTarifas(); pintarResumen(); pintarCaja(); }

function pintarDia(fecha) {
  const cont = document.getElementById('lista-' + fecha);
  if (!cont) return;
  const t = (q.value || '').trim().toLowerCase();
  const lista = Object.entries(D.personas).filter(([, p]) => p.fecha === fecha)
    .sort(([, a], [, b]) => (a.orden ?? 999) - (b.orden ?? 999) || a.lugar.localeCompare(b.lugar) || (a.es_grupo - b.es_grupo) || a.nombre.localeCompare(b.nombre));
  const tot = [0, 0, 0], firm = [0, lista.length];
  const lugares = new Map();
  for (const [id, p] of lista) {
    if (p.tarifa === 'medio-dia') tot[1] += personasDe(p); else tot[0] += personasDe(p); if (D.actas[id]) firm[0]++;
    if (!lugares.has(p.lugar)) lugares.set(p.lugar, []);
    lugares.get(p.lugar).push([id, p]);
  }
  document.getElementById('tot-' + fecha).innerHTML = `<span><b>${tot[0]}</b> día entero</span><span><b>${tot[1]}</b> medio día</span><span><b>${firm[0]}/${firm[1]}</b> recibidos</span>`;
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
    filas.forEach(([id, p]) => { s[0] += personasDe(p); if (D.actas[id]) f++; });
    html += `<div class="ubic"><h3>${esc(lugar)}</h3><div class="tw"><table>
      <thead><tr><th>Quién recibe</th><th class="jor">Jornada</th><th class="acta">Recibido</th></tr></thead><tbody>
      ${vis.map(([id, p]) => {
        const a = D.actas[id];
        return `<tr class="${p.es_grupo ? 'grupo' : ''}${a ? ' firmada' : ''}">
          <td><button type="button" class="nombre" data-editar="${esc(id)}"><b>${esc(p.nombre)}</b>${p.es_grupo ? `<span class="tag">grupo · ${personasDe(p)}</span>` : ''}</button>
            <div class="sub">${esc(p.grupo || '')}</div>
            ${p.obs && !a ? `<div class="nota">${esc(p.obs)}</div>` : ''}</td>
          <td class="jor">${(() => { const j = D.actas[id] ? D.actas[id].tarifa : nombreJornada(p); return `<span class="tag${/medio/i.test(j) ? ' medio' : ''}">${esc(j)}</span>`; })()}${personasDe(p) > 1 ? `<div class="pie">× ${personasDe(p)}</div>` : ''}</td>
          <td class="acta"><button type="button" class="chk${a ? ' ok' : ''}" data-acta="${esc(id)}" aria-label="Recibido de ${esc(p.nombre)}"><span class="box"></span><span class="hora">${a ? horaCorta(a.firmado_en) : ''}</span></button></td></tr>`;
      }).join('')}</tbody>
      <tfoot><tr><td>Total</td><td class="jor">${s[0]} pers.</td><td class="acta progreso">${f}/${filas.length}</td></tr></tfoot></table></div></div>`;
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
    <div class="fila2"><button type="button" class="btn sec" data-ruta="${esc(id)}">Editar ruta</button>
      <button type="button" class="btn sec" data-efectivo="${esc(id)}">💵 Dar efectivo</button></div>
    ${Object.values(D.caja).filter((g) => g.ruta === id && g.estado !== 'anulado').map((g) => `<span class="pie">💵 ${pesos(g.monto)} a ${esc(g.recibe)}</span>`).join('')}</article>`).join('');
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
  for (const p of Object.values(D.personas)) { if (p.tarifa === 'medio-dia') tot[1] += personasDe(p); else tot[0] += personasDe(p); n++; }
  for (const a of Object.values(D.actas)) monto += a.monto || 0;
  const el = document.getElementById('resumen-gen');
  if (el) el.innerHTML = `<div><b>${tot[0]}</b><span>personas día entero</span></div><div><b>${tot[1]}</b><span>personas medio día</span></div>
    <div><b>${Object.keys(D.actas).length}/${n}</b><span>recibidos · ${pesos(monto)} entregados</span></div>`;
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
  const p = id ? D.personas[id] : { fecha: fechaNueva, lugar: '', nombre: '', grupo: 'Equipo Ecofest', es_grupo: false, personas: 1, obs: '', tarifa: tarifaSugerida({}) };
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
      <div class="dos">
        <label>Jornada<select id="p-tar">${D.tarifas.map((t) => `<option value="${esc(t.id)}" ${t.id === p.tarifa ? 'selected' : ''}>${esc(t.nombre)} · ${pesos(t.valor)}</option>`).join('')}</select></label>
        <label>Personas (si es grupo)<input id="p-pers" type="number" min="1" inputmode="numeric" value="${personasDe(p)}"></label>
      </div>
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
        personas: document.getElementById('p-grupo').checked ? (entero(document.getElementById('p-pers').value) || 1) : 1,
        tarifa: document.getElementById('p-tar').value, obs: document.getElementById('p-obs').value.trim(),
      };
      if (!datos.nombre || !datos.lugar) { msg.textContent = 'Escriba el nombre y el lugar.'; msg.hidden = false; return; }
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
      <span class="pie">${esc(p.grupo || '')}${p.lugar ? ' · ' + esc(p.lugar) : ''}</span></div>
    <form id="f-r" style="display:grid;gap:12px" novalidate>
      ${p.es_grupo ? '<label>Nombre de quien recibe por el grupo<input id="r-quien" autocomplete="off" required></label>' : ''}
      <div class="dos">
        <label>Cédula<input id="r-doc" inputmode="numeric" autocomplete="off" required></label>
        <label>Celular (opcional)<input id="r-tel" type="tel" autocomplete="off"></label>
      </div>
      <fieldset class="opciones"><legend>Jornada</legend>
        ${D.tarifas.map((t) => `<label class="opcion"><input type="radio" name="r-tar" value="${esc(t.id)}" ${t.id === tarIni ? 'checked' : ''}><span>${esc(t.nombre)}</span><b>${pesos(t.valor)}</b></label>`).join('')}
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
        comidas: comidas(p, t), merienda_am: p.am || 0, almuerzo: p.al || 0, merienda_pm: p.pm || 0,
        tarifa: t ? t.nombre : 'Día entero', valor_unitario: t ? t.valor : null, recibe: quien(), documento: doc,
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
      <span>${esc(a.tarifa || '')}${a.personas > 1 ? ' · ' + a.personas + ' personas' : ''}</span>
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
  const fila = (t) => `<div class="fila-tarifa"><input class="tf-nombre" value="${esc(t.nombre)}" placeholder="Nombre (Día entero, Medio día…)" aria-label="Nombre de la tarifa">
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

// ================= caja menor =================
// caja/{id}: salidas de efectivo que no son los recibidos de alimentación (transporte propio, compras…)
// config/caja: {base} efectivo total asignado al evento (solo el administrador lo cambia)
const CATEGORIAS = { Transporte: '🚕', 'Alimentación': '🍽️', Materiales: '🧰', 'Logística': '📦', Otros: '💵' };
const MEDIOS = ['Efectivo', 'Nequi', 'Daviplata', 'Transferencia'];
let baseCaja = 0;
function ordenCaja() { return Object.entries(D.caja).sort(([, a], [, b]) => String(a.creado).localeCompare(String(b.creado))); }
function numCaja(id) { const i = ordenCaja().findIndex(([k]) => k === id); return 'CM-' + String(i + 1).padStart(4, '0'); }
function pintarCaja() {
  const cont = document.getElementById('lista-caja');
  if (!cont) return;
  const lista = ordenCaja().reverse();
  const vivos = lista.filter(([, g]) => g.estado !== 'anulado');
  const totalCaja = vivos.reduce((s, [, g]) => s + (g.monto || 0), 0);
  const totalRecibidos = Object.values(D.actas).reduce((s, a) => s + (a.monto || 0), 0);
  const porCat = {};
  vivos.forEach(([, g]) => (porCat[g.categoria] = (porCat[g.categoria] || 0) + g.monto));
  document.getElementById('tot-caja').innerHTML = `<span><b>${pesos(totalCaja)}</b> caja menor</span><span><b>${pesos(totalRecibidos)}</b> recibidos</span>
    ${baseCaja ? `<span><b>${pesos(baseCaja - totalCaja - totalRecibidos)}</b> saldo de ${pesos(baseCaja)}</span>` : ''}`;
  document.getElementById('cats-caja').innerHTML = Object.entries(porCat).map(([c, v]) => `<span class="tag">${CATEGORIAS[c] || ''} ${esc(c)} · ${pesos(v)}</span>`).join(' ');
  if (!lista.length) { cont.innerHTML = `<p class="pie">${conectado ? 'Todavía no hay salidas de caja. Use “+ Registrar salida”.' : 'Cargando caja…'}</p>`; return; }
  let html = '', dia = '';
  for (const [id, g] of lista) {
    if (g.fecha !== dia) { dia = g.fecha; html += `<h3 style="margin-top:6px">${esc(DIAS[dia] || dia)}</h3>`; }
    html += `<button type="button" class="gasto${g.estado === 'anulado' ? ' anulado' : ''}" data-gasto="${esc(id)}">
      <span class="g-top"><b>${CATEGORIAS[g.categoria] || ''} ${esc(g.concepto)}</b><b class="g-monto">${pesos(g.monto)}</b></span>
      <span class="pie">${esc(numCaja(id))} · recibió ${esc(g.recibe)} · ${esc(g.medio)}${g.soporte ? ' · 📎 soporte' : ''}${g.ruta_desc ? ' · 🚐 ' + esc(g.ruta_desc) : ''}${g.estado === 'anulado' ? ' · ANULADO' : ''}</span></button>`;
  }
  cont.innerHTML = html;
}
function fotoLiviana(file, max) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = rej; img.src = URL.createObjectURL(file);
  });
}
function nuevaSalida({ categoria = 'Transporte', fecha, rutaId } = {}) {
  const bloqueo = sinConexion();
  if (bloqueo) return abrir(`${cab('Caja menor', 'Registrar salida')}${aviso(bloqueo)}`);
  const r = rutaId ? D.rutas[rutaId] : null;
  const f0 = r ? r.fecha : fecha || '2026-10-23';
  const concepto = r ? `Transporte por cuenta propia: ${r.actividad}${r.destino ? ' → ' + r.destino : ''}` : '';
  const rutas = Object.entries(D.rutas).sort(([, a], [, b]) => (a.fecha + a.hora_recogida).localeCompare(b.fecha + b.hora_recogida));
  abrir(`${cab('Caja menor', 'Registrar salida de efectivo')}
    <form id="f-g" style="display:grid;gap:12px" novalidate>
      <fieldset class="opciones"><legend>Categoría</legend><div class="cats">
        ${Object.entries(CATEGORIAS).map(([c, i]) => `<label class="cat"><input type="radio" name="g-cat" value="${esc(c)}" ${c === (r ? 'Transporte' : categoria) ? 'checked' : ''}><span>${i} ${esc(c)}</span></label>`).join('')}</div></fieldset>
      <label>¿Para qué es el dinero?<input id="g-concepto" value="${esc(concepto)}" placeholder="Taxi Montecristo → Plaza de la Paz, hielo, cinta…"></label>
      <div class="dos">
        <label>Día<select id="g-fecha">${Object.entries(DIAS).map(([f, n]) => `<option value="${f}" ${f === f0 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label>Ruta relacionada<select id="g-ruta"><option value="">Ninguna</option>${rutas.map(([id, x]) => `<option value="${esc(id)}" ${id === rutaId ? 'selected' : ''}>${esc((DIAS[x.fecha] || '').split(' ')[0])} ${esc(x.hora_recogida || '')} · ${esc(x.actividad)}</option>`).join('')}</select></label>
      </div>
      <label>Nombre de quien recibe<input id="g-quien" autocomplete="off"></label>
      <div class="dos">
        <label>Cédula<input id="g-doc" inputmode="numeric" autocomplete="off"></label>
        <label>Celular (opcional)<input id="g-tel" type="tel" autocomplete="off"></label>
      </div>
      <div class="dos">
        <label>Monto<input id="g-monto" inputmode="numeric" placeholder="$"></label>
        <label>Medio<select id="g-medio">${MEDIOS.map((m) => `<option>${m}</option>`).join('')}</select></label>
      </div>
      <label>Foto del soporte (opcional)<input type="file" id="g-foto" accept="image/*" capture="environment"></label>
      <img id="g-prev" alt="" hidden style="max-height:140px;border-radius:8px">
      <label class="decl"><input type="checkbox" id="g-acepto"><span id="g-texto"></span></label>
      <div><b style="font-size:14px">Firma de quien recibe</b>
        <div class="lienzo" style="margin-top:4px"><canvas id="g-lienzo"></canvas><div class="linea"></div><div class="ayuda">Firme aquí con el dedo</div></div>
        <div class="fila2" style="justify-content:flex-end;margin-top:6px"><button type="button" class="btn sec" id="g-borrar">Borrar firma</button></div></div>
      <p class="msg" id="g-msg" hidden></p>
      <button class="btn" id="g-ok" style="min-height:54px;font-size:17px">Registrar salida</button>
    </form>`, () => {
    const f = document.getElementById('f-g'), g = (k) => document.getElementById(k);
    const decl = () => { g('g-texto').textContent = `Yo, ${g('g-quien').value.trim() || '______'}, identificado(a) con documento ${g('g-doc').value.trim() || '______'}, declaro que recibí ${pesos(entero(g('g-monto').value))} (${g('g-medio').value.toLowerCase()}) para: ${g('g-concepto').value.trim() || '______'}, del evento Ecofest.`; };
    f.addEventListener('input', decl); f.addEventListener('change', decl); decl();
    const firma = lienzoFirma(g('g-lienzo')); g('g-borrar').onclick = firma.limpiar;
    let foto = null;
    g('g-foto').onchange = async (ev) => {
      const file = ev.target.files[0]; if (!file) return;
      try { foto = await fotoLiviana(file, 900); g('g-prev').src = foto; g('g-prev').hidden = false; } catch { toast('No se pudo leer la foto.'); }
    };
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const msg = g('g-msg'), falta = (t) => { msg.textContent = t; msg.hidden = false; };
      const cat = (f.querySelector('input[name=g-cat]:checked') || {}).value;
      const datos = { categoria: cat, concepto: g('g-concepto').value.trim(), fecha: g('g-fecha').value, ruta: g('g-ruta').value,
        recibe: g('g-quien').value.trim(), documento: g('g-doc').value.trim(), telefono: g('g-tel').value.trim(),
        monto: entero(g('g-monto').value), medio: g('g-medio').value };
      if (!datos.concepto) return falta('Escriba para qué es el dinero.');
      if (!datos.recibe) return falta('Escriba quién recibe el dinero.');
      if (!datos.documento) return falta('Falta la cédula.');
      if (!datos.monto) return falta('Escriba el monto.');
      if (!g('g-acepto').checked) return falta('La persona debe marcar la declaración.');
      if (firma.vacia()) return falta('Falta la firma.');
      msg.hidden = true;
      const rr = datos.ruta && D.rutas[datos.ruta];
      const doc = { ...datos, ruta_desc: rr ? `${rr.actividad}${rr.hora_recogida ? ' ' + rr.hora_recogida : ''}` : '', estado: 'registrado',
        declaracion: g('g-texto').textContent, firma: firma.imagen(), soporte: foto, creado: new Date().toISOString(),
        registrado_por: usuario ? await usuario.id().catch(() => null) : null };
      if (JSON.stringify(doc).length > 240000) return falta('La foto es muy pesada. Tómela de nuevo más de lejos.');
      const id = 'cm-' + Date.now().toString(36);
      if (await guardar(db.collection('caja').doc(id), doc, g('g-ok'), msg)) {
        D.caja[id] = doc; pintarCaja(); cerrar(); toast(`Salida registrada: ${numCaja(id)}`);
      }
    };
  });
}
function verSalida(id) {
  const x = D.caja[id];
  abrir(`${cab(`${DIAS[x.fecha] || x.fecha} · ${x.categoria}`, 'Caja menor ' + numCaja(id))}
    ${x.estado === 'anulado' ? aviso('ANULADO: ' + (x.anulado_motivo || '')) : ''}
    <div class="resumen-acta"><b style="font-size:18px">${esc(x.concepto)}</b>
      <span>Recibió <b>${esc(x.recibe)}</b> · CC ${esc(x.documento)}${x.telefono ? ' · ' + esc(x.telefono) : ''}</span>
      <span style="font-size:24px;font-weight:800">${pesos(x.monto)}</span>
      <span>${esc(x.medio)}${x.ruta_desc ? ' · 🚐 ' + esc(x.ruta_desc) : ''}</span>
      <span class="pie" id="s-firmado">Registrado: ${esc(fechaHora(x.creado))}</span></div>
    <p style="margin:0;font-size:14px">${esc(x.declaracion)}</p>
    <div class="firma-img"><img src="${esc(x.firma)}" alt="Firma de ${esc(x.recibe)}"></div>
    ${x.soporte ? `<div class="firma-img"><img src="${esc(x.soporte)}" alt="Soporte"></div>` : ''}
    ${puedeAdministrar && x.estado !== 'anulado' ? `<div class="fila2"><input id="s-motivo" placeholder="Motivo para anular" style="flex:1"><button type="button" class="btn peligro" id="s-anular">Anular salida</button></div>` : ''}`, () => {
    if (usuario && x.registrado_por) usuario.profiles([x.registrado_por]).then((ps) => {
      const n = ps && ps[x.registrado_por] && ps[x.registrado_por].name, el = document.getElementById('s-firmado'); if (n && el) el.textContent += ' · ' + n;
    }).catch(() => {});
    const b = document.getElementById('s-anular');
    if (b) b.onclick = async () => {
      const motivo = document.getElementById('s-motivo').value.trim();
      if (!motivo) return toast('Escriba el motivo para anular.');
      try { await db.collection('caja').doc(id).update({ estado: 'anulado', anulado_motivo: motivo }); D.caja[id] = { ...x, estado: 'anulado', anulado_motivo: motivo }; pintarCaja(); cerrar(); toast('Salida anulada'); }
      catch { toast('No se pudo anular. Intente de nuevo.'); }
    };
  });
}
function editarBase() {
  abrir(`${cab('Caja menor', 'Base de caja')}<p class="pie" style="margin:0">Efectivo total asignado al evento. El saldo es la base menos la caja menor y los recibidos de alimentación.</p>
    <form id="f-base" style="display:grid;gap:10px"><label>Base<input id="b-valor" inputmode="numeric" value="${baseCaja || ''}" placeholder="$"></label>
    <p class="msg" id="b-msg" hidden></p><button class="btn" id="b-ok">Guardar base</button></form>`, () => {
    document.getElementById('f-base').onsubmit = async (ev) => {
      ev.preventDefault();
      const v = entero(document.getElementById('b-valor').value);
      if (await guardar(db.doc('config/caja'), { base: v }, document.getElementById('b-ok'), document.getElementById('b-msg'))) { baseCaja = v; pintarCaja(); cerrar(); toast('Base guardada'); }
    };
  });
}
document.addEventListener('click', (ev) => {
  const v = ev.target.closest('[data-gasto]'); if (v) return verSalida(v.dataset.gasto);
  const e = ev.target.closest('[data-efectivo]'); if (e) return nuevaSalida({ rutaId: e.dataset.efectivo });
  const o = ev.target.closest('[data-otro-gasto]'); if (o) return nuevaSalida({ categoria: 'Alimentación', fecha: o.dataset.otroGasto });
  if (ev.target.closest('#nueva-salida')) return nuevaSalida({});
  if (ev.target.closest('#editar-base')) return editarBase();
});
document.getElementById('exp-caja').onclick = async () => {
  const lista = ordenCaja();
  if (!lista.length) return toast('Todavía no hay salidas de caja.');
  if (!descargas) return toast('Esta vista no permite descargar archivos.');
  const cols = [['num', 'Comprobante'], ['fecha', 'Fecha'], ['categoria', 'Categoría'], ['concepto', 'Concepto'], ['recibe', 'Recibió'], ['documento', 'Cédula'],
    ['telefono', 'Celular'], ['monto', 'Monto'], ['medio', 'Medio'], ['ruta_desc', 'Ruta'], ['estado', 'Estado'], ['creado', 'Registrado'], ['anulado_motivo', 'Motivo anulación']];
  const celda = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const filas = lista.map(([id, x]) => cols.map(([k]) => celda(k === 'num' ? numCaja(id) : k === 'creado' ? fechaHora(x.creado) : x[k])).join(';'));
  try { await descargas.save({ filename: 'caja_menor_ecofest.csv', data: '﻿' + [cols.map((c) => c[1]).join(';'), ...filas].join('\r\n') }); }
  catch (err) { if (err && err.code !== 'declined') toast('No se pudo descargar.'); }
};

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
    ['Jornada', `${a.tarifa || ''}${a.personas > 1 ? ' · ' + a.personas + ' personas' : ''}`], ['Valor entregado', pesos(a.monto)], ['Firmado', fechaHora(a.firmado_en)]];
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
    ['tarifa', 'Jornada'], ['monto', 'Monto'], ['firmado_en', 'Firmado']];
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
  escuchar('personas', 'personas'); escuchar('actas', 'actas'); escuchar('rutas', 'rutas'); escuchar('caja', 'caja');
  db.doc('config/caja').onSnapshot((d) => { baseCaja = d.exists ? entero(d.data().base) : 0; pintarCaja(); }, () => {});
  db.doc('config/tarifas').onSnapshot((d) => { D.tarifas = d.exists && Array.isArray(d.data().lista) ? d.data().lista : []; pintarTodo(); }, () => {});
  estadoDb.textContent = puedeEscribir ? 'Conectado: todo se guarda en línea y lo ve el equipo al instante.' : 'Acceso de solo lectura.';
})();
