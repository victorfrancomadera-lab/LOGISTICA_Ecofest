// Actas de entrega: se guardan en la base compartida del artefacto (colección "actas", un documento por entrega)
const ENT = JSON.parse(document.getElementById('datos').textContent);
const DIAS = { '2026-10-23': 'viernes 23 de octubre', '2026-10-24': 'sábado 24 de octubre', '2026-10-25': 'domingo 25 de octubre' };
const actas = {};             // id de entrega -> datos del acta firmada
let valores = { merienda: 0, almuerzo: 0 };
let db = null, usuario = null, descargas = null, puedeEscribir = true, puedeAdministrar = false;
const velo = document.getElementById('velo'), hoja = document.getElementById('hoja');
const estadoDb = document.querySelector('.estado-db');

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pesos = (n) => '$' + Number(n || 0).toLocaleString('es-CO');
const entero = (v) => Math.max(0, Math.round(Number(String(v ?? '').replace(/[^\d]/g, '')) || 0));
const horaCorta = (iso) => new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
const fechaHora = (iso) => new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
const consecutivo = (id) => 'ECO-' + id.slice(8);
function sugerido(e) { return (e.am + e.pm) * valores.merienda + e.al * valores.almuerzo; }
function toast(msg) {
  const t = document.getElementById('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3000);
}
function declaracion(e, quien, doc, monto) {
  const grupo = e.eg ? ` como responsable del grupo ${e.b},` : '';
  return `Yo, ${quien || '______'}, identificado(a) con documento ${doc || '______'},${grupo} declaro que recibí ${pesos(monto)} en efectivo para ${e.c} del evento Ecofest, en ${e.u}, el ${DIAS[e.f]}.`;
}

// ---------- pintar estado en las tablas ----------
function pintarEstado() {
  document.querySelectorAll('[data-acta]').forEach((b) => {
    const a = actas[b.dataset.acta];
    b.classList.toggle('ok', !!a);
    b.querySelector('.hora').textContent = a ? horaCorta(a.firmado_en) : '';
    b.closest('tr').classList.toggle('firmada', !!a);
  });
  const prog = {}, dia = {};
  for (const [id, e] of Object.entries(ENT)) {
    const k = e.f + '|' + e.u;
    prog[k] = prog[k] || [0, 0]; prog[k][1]++; if (actas[id]) prog[k][0]++;
    dia[e.f] = dia[e.f] || [0, 0]; dia[e.f][1]++; if (actas[id]) dia[e.f][0]++;
  }
  document.querySelectorAll('[data-prog]').forEach((td) => { const p = prog[td.dataset.prog]; td.textContent = p ? `${p[0]}/${p[1]}` : ''; });
  document.querySelectorAll('[data-dia]').forEach((s) => { const p = dia[s.dataset.dia]; s.innerHTML = p ? `<b>${p[0]}/${p[1]}</b> actas firmadas` : ''; });
}

// ---------- hoja (modal) ----------
let alCerrar = null;
function abrir(html, despues) {
  hoja.innerHTML = html; velo.hidden = false; document.body.style.overflow = 'hidden';
  hoja.querySelector('.cerrar').onclick = cerrar;
  hoja.querySelector('input, button:not(.cerrar)')?.focus({ preventScroll: true });
  if (despues) despues();
}
function cerrar() { velo.hidden = true; document.body.style.overflow = ''; hoja.innerHTML = ''; if (alCerrar) { alCerrar(); alCerrar = null; } }
velo.addEventListener('click', (ev) => { if (ev.target === velo) cerrar(); });
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !velo.hidden) cerrar(); });

document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-acta]');
  if (!b) return;
  const id = b.dataset.acta;
  if (actas[id]) verActa(id); else nuevaActa(id);
});

function cabecera(e, titulo) {
  return `<div class="cab"><div><span class="pie">${esc(DIAS[e.f])} · ${esc(e.u)}</span><h2 id="hoja-titulo">${esc(titulo)}</h2></div>
    <button type="button" class="cerrar" aria-label="Cerrar">×</button></div>`;
}

function nuevaActa(id) {
  const e = ENT[id];
  if (!db) return abrir(`${cabecera(e, 'Acta de entrega')}<p class="msg">Para guardar actas, abra esta página en claude.ai con su sesión iniciada. ${esc(estadoDb?.textContent || '')}</p>`);
  if (!puedeEscribir) return abrir(`${cabecera(e, 'Acta de entrega')}<p class="msg">Su acceso a esta página es de solo lectura. Pídale al dueño que le dé permiso de Colaborador o Editor.</p>`);
  const monto = sugerido(e);
  abrir(`${cabecera(e, 'Acta de entrega')}
    <div class="resumen-acta"><b style="font-size:18px">${esc(e.b)}${e.eg ? ' · grupo' : ''}</b>
      <span class="pie">${esc(e.g)}</span><span>${esc(e.c)}</span></div>
    <form id="f-acta" class="hoja-form" style="display:grid;gap:12px" novalidate>
      ${e.eg ? '<label>Nombre de quien recibe por el grupo<input id="a-quien" autocomplete="off" required></label>' : ''}
      <div class="dos">
        <label>Cédula<input id="a-doc" inputmode="numeric" autocomplete="off" required></label>
        <label>Celular (opcional)<input id="a-tel" type="tel" autocomplete="off"></label>
      </div>
      <label>Monto entregado<input id="a-monto" inputmode="numeric" value="${monto || ''}" placeholder="$ en efectivo" required></label>
      <label class="decl"><input type="checkbox" id="a-acepto"><span id="a-texto"></span></label>
      <div><b style="font-size:14px">Firma de quien recibe</b>
        <div class="lienzo" style="margin-top:4px"><canvas id="a-lienzo"></canvas><div class="linea"></div><div class="ayuda">Firme aquí con el dedo</div></div>
        <div class="fila2" style="justify-content:space-between;margin-top:6px"><span class="pie">La firma queda guardada con fecha y hora.</span>
          <button type="button" class="btn sec" id="a-borrar">Borrar firma</button></div></div>
      <p class="msg" id="a-msg" hidden></p>
      <button class="btn" id="a-guardar" style="min-height:54px;font-size:17px">Guardar acta firmada</button>
    </form>`, () => {
    const f = document.getElementById('f-acta');
    const quien = () => (e.eg ? document.getElementById('a-quien').value.trim() : e.b);
    const actualizar = () => { document.getElementById('a-texto').textContent = declaracion(e, quien(), document.getElementById('a-doc').value.trim(), entero(document.getElementById('a-monto').value)); };
    f.addEventListener('input', actualizar); actualizar();
    const firma = lienzoFirma(document.getElementById('a-lienzo'));
    document.getElementById('a-borrar').onclick = firma.limpiar;
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const msg = document.getElementById('a-msg');
      const falta = (t) => { msg.textContent = t; msg.hidden = false; };
      const doc = document.getElementById('a-doc').value.trim(), m = entero(document.getElementById('a-monto').value);
      if (e.eg && !quien()) return falta('Escriba el nombre de quien recibe por el grupo.');
      if (!doc) return falta('Falta la cédula.');
      if (!m) return falta('Escriba el monto entregado.');
      if (!document.getElementById('a-acepto').checked) return falta('La persona debe marcar la declaración.');
      if (firma.vacia()) return falta('Falta la firma.');
      msg.hidden = true;
      const btn = document.getElementById('a-guardar'); btn.disabled = true; btn.textContent = 'Guardando…';
      const acta = {
        entrega: id, fecha: e.f, lugar: e.u, beneficiario: e.b, grupo: e.g, es_grupo: e.eg, comidas: e.c,
        merienda_am: e.am, almuerzo: e.al, merienda_pm: e.pm, recibe: quien(), documento: doc,
        telefono: document.getElementById('a-tel').value.trim(), monto: m,
        declaracion: declaracion(e, quien(), doc, m), firma: firma.imagen(),
        firmado_en: new Date().toISOString(), registrado_por: usuario ? await usuario.id().catch(() => null) : null,
      };
      try {
        await db.collection('actas').doc(id).set(acta);
        actas[id] = acta; pintarEstado(); cerrar(); toast(`Acta guardada: ${acta.recibe}`);
      } catch (err) {
        btn.disabled = false; btn.textContent = 'Guardar acta firmada';
        if (err && err.code === 'invalid_argument') { puedeEscribir = false; falta('No tiene permiso para guardar actas en esta página.'); }
        else falta('No se pudo guardar. Revise la conexión e intente de nuevo; la firma sigue en pantalla.');
      }
    };
  });
}

function verActa(id) {
  const e = ENT[id], a = actas[id];
  abrir(`${cabecera(e, 'Acta ' + consecutivo(id))}
    <div class="resumen-acta">
      <b style="font-size:18px">${esc(a.recibe)}</b>
      ${a.es_grupo ? `<span>Por el grupo ${esc(a.beneficiario)}</span>` : `<span class="pie">${esc(a.grupo || '')}</span>`}
      <span>CC ${esc(a.documento)}${a.telefono ? ' · ' + esc(a.telefono) : ''}</span>
      <span style="font-size:24px;font-weight:800">${pesos(a.monto)}</span>
      <span>${esc(a.comidas)}</span>
      <span class="pie">Firmado: ${esc(fechaHora(a.firmado_en))}${a.quien_registro ? ' · registró ' + esc(a.quien_registro) : ''}</span>
    </div>
    <p style="margin:0;font-size:14px">${esc(a.declaracion)}</p>
    <div class="firma-img"><img src="${esc(a.firma)}" alt="Firma de ${esc(a.recibe)}"></div>
    <div class="fila2">
      <button type="button" class="btn" id="v-desc">Descargar soporte (imagen)</button>
      ${puedeAdministrar ? '<button type="button" class="btn peligro" id="v-anular">Anular acta</button>' : ''}
    </div>
    <div id="v-conf"></div>`, () => {
    if (usuario && a.registrado_por) usuario.profiles([a.registrado_por]).then((ps) => {
      const n = ps && ps[a.registrado_por] && ps[a.registrado_por].name;
      const pie = hoja.querySelector('.resumen-acta .pie:last-child'); if (n && pie) pie.textContent += ' · registró ' + n;
    }).catch(() => {});
    document.getElementById('v-desc').onclick = () => descargarSoporte(id);
    const an = document.getElementById('v-anular');
    if (an) an.onclick = () => {
      document.getElementById('v-conf').innerHTML = `<div class="confirmar"><span>¿Anular esta acta? La entrega vuelve a quedar pendiente y la firma se borra.</span>
        <div class="fila2"><button type="button" class="btn peligro" id="v-si">Sí, anular</button><button type="button" class="btn sec" id="v-no">No</button></div></div>`;
      document.getElementById('v-no').onclick = () => (document.getElementById('v-conf').innerHTML = '');
      document.getElementById('v-si').onclick = async () => {
        try { await db.collection('actas').doc(id).delete(); delete actas[id]; pintarEstado(); cerrar(); toast('Acta anulada'); }
        catch { toast('No se pudo anular. Intente de nuevo.'); }
      };
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
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, r.width, r.height);
    ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0E2A1E';
    trazos = 0;
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
    // imagen liviana (600 px de ancho) para que el acta quepa holgada en la base
    imagen: () => {
      const c = document.createElement('canvas'); c.width = 600; c.height = Math.round(600 * canvas.height / canvas.width);
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(canvas, 0, 0, c.width, c.height);
      return c.toDataURL('image/png');
    },
  };
}

// ---------- soporte descargable (imagen del acta) ----------
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
  const a = actas[id];
  if (!descargas) return toast('Esta vista no permite descargar archivos.');
  const W = 1000, c = document.createElement('canvas'); c.width = W; c.height = 1300;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, c.height);
  x.fillStyle = '#183A2C'; x.fillRect(0, 0, W, 170); x.fillStyle = '#8DC63F'; x.fillRect(0, 170, W, 8);
  try { const logo = await cargarImg(document.querySelector('header img').src); x.drawImage(logo, 40, 30, 110 * logo.width / logo.height, 110); } catch {}
  x.fillStyle = '#fff'; x.textAlign = 'right'; x.font = 'bold 34px system-ui, sans-serif'; x.fillText('Acta de entrega', W - 40, 80);
  x.font = 'bold 28px system-ui, sans-serif'; x.fillText(consecutivo(id), W - 40, 125);
  x.textAlign = 'left'; x.fillStyle = '#18221D';
  const filas = [['Recibió', a.recibe], ...(a.es_grupo ? [['Grupo', a.beneficiario]] : a.grupo ? [['Grupo', a.grupo]] : []), ['Cédula', a.documento],
    ...(a.telefono ? [['Celular', a.telefono]] : []), ['Lugar', a.lugar], ['Fecha del evento', DIAS[a.fecha]], ['Comidas', a.comidas],
    ['Valor entregado', pesos(a.monto)], ['Firmado', fechaHora(a.firmado_en)]];
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
  const final = document.createElement('canvas'); final.width = W; final.height = y + 110;
  final.getContext('2d').drawImage(c, 0, 0);
  const blob = await new Promise((r) => final.toBlob(r, 'image/png'));
  const nombre = `${consecutivo(id)}_${a.recibe}`.replace(/[^\wÁÉÍÓÚáéíóúÑñ-]+/g, '_') + '.png';
  try { await descargas.save({ filename: nombre, data: blob }); } catch (err) { if (err && err.code !== 'declined') toast('No se pudo descargar el soporte.'); }
}

// ---------- exportar CSV ----------
document.getElementById('exp-csv').onclick = async () => {
  const lista = Object.values(actas).sort((p, q) => (p.fecha + p.lugar + p.beneficiario).localeCompare(q.fecha + q.lugar + q.beneficiario));
  if (!lista.length) return toast('Todavía no hay actas firmadas.');
  if (!descargas) return toast('Esta vista no permite descargar archivos.');
  const cols = [['entrega', 'Acta'], ['fecha', 'Fecha'], ['lugar', 'Lugar'], ['beneficiario', 'Persona o grupo'], ['grupo', 'Grupo'], ['recibe', 'Recibió'],
    ['documento', 'Cédula'], ['telefono', 'Celular'], ['merienda_am', 'Merienda AM'], ['almuerzo', 'Almuerzo'], ['merienda_pm', 'Merienda PM'],
    ['monto', 'Monto'], ['firmado_en', 'Firmado']];
  const celda = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const filas = lista.map((a) => cols.map(([k]) => celda(k === 'entrega' ? consecutivo(a.entrega) : k === 'firmado_en' ? fechaHora(a[k]) : a[k])).join(';'));
  const csv = '﻿' + [cols.map((c) => c[1]).join(';'), ...filas].join('\r\n');
  try { await descargas.save({ filename: 'actas_ecofest.csv', data: csv }); } catch (err) { if (err && err.code !== 'declined') toast('No se pudo descargar.'); }
};

// ---------- valores ----------
document.getElementById('f-valores').onsubmit = async (ev) => {
  ev.preventDefault();
  if (!db) return toast('Abra la página en claude.ai para guardar valores.');
  const v = { merienda: entero(document.getElementById('v-merienda').value), almuerzo: entero(document.getElementById('v-almuerzo').value) };
  try { await db.doc('config/valores').set(v); valores = v; toast('Valores guardados'); }
  catch { toast('No se pudieron guardar los valores.'); }
};

// ---------- conexión con la base ----------
(async () => {
  if (!window.claude || !window.claude.use) { if (estadoDb) estadoDb.textContent = 'Las actas se guardan solo cuando la página está abierta en claude.ai.'; return; }
  [db, usuario, descargas] = await Promise.all([claude.use('db'), claude.use('user'), claude.use('downloads')]);
  if (!db) { if (estadoDb) estadoDb.textContent = 'Inicie sesión en claude.ai para ver y guardar actas.'; return; }
  if (usuario) {
    const w = await usuario.can('data.write'); if (w === false) puedeEscribir = false;
    puedeAdministrar = !!(await usuario.canEdit());
  }
  if (estadoDb) estadoDb.textContent = puedeEscribir ? 'Conectado: las actas se guardan en línea y las ve todo el equipo.' : 'Acceso de solo lectura.';
  db.collection('actas').limit(1000).onSnapshot((snap) => {
    for (const k of Object.keys(actas)) delete actas[k];
    snap.docs.forEach((d) => { if (d.exists) actas[d.id] = d.data(); });
    pintarEstado();
  }, () => { if (estadoDb) estadoDb.textContent = 'Se perdió la conexión con la base. Recargue la página.'; });
  db.doc('config/valores').onSnapshot((d) => {
    if (!d.exists) return;
    const v = d.data(); valores = { merienda: entero(v.merienda), almuerzo: entero(v.almuerzo) };
    const im = document.getElementById('v-merienda'), ia = document.getElementById('v-almuerzo');
    if (document.activeElement !== im) im.value = valores.merienda || '';
    if (document.activeElement !== ia) ia.value = valores.almuerzo || '';
  }, () => {});
})();
pintarEstado();
