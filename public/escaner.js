'use strict';
// Pantalla del escáner de documentos con la cámara del celular. La lectura e interpretación de los códigos
// (cédulas, tarjetas de identidad, extranjería/PPT, licencia, tarjeta de propiedad, SOAT y técnico-mecánica)
// está en /lector-codigos.js (LectorCodigos); aquí van la pantalla, la confirmación y la lectura por foto con Claude.

const cargarZXing = () => LectorCodigos.cargarLector();
const titulo = (s) => s.toLowerCase().replace(/(^|\s)(\S)/g, (_, e, l) => e + l.toUpperCase());
const MODOS = {
  persona: { titulo: 'Escanear documento', donde: 'del <b>reverso</b> de la cédula, tarjeta de identidad, cédula de extranjería, PPT o licencia' },
  vehiculo: { titulo: 'Escanear tarjeta de propiedad', donde: 'de la tarjeta de propiedad', esperado: 'tarjeta' },
  soat: { titulo: 'Escanear SOAT', donde: 'del SOAT (impreso o en la pantalla del celular)', esperado: 'soat' },
  tecnomecanica: { titulo: 'Escanear técnico-mecánica', donde: 'del certificado de revisión técnico-mecánica', esperado: 'tecnomecanica' },
};

// ---------- foto del frente (la lee Claude en el servidor) ----------
function achicarFoto(archivo, lado = 1600) {
  return new Promise((ok, falla) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, lado / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      ok(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => falla(new Error('No se pudo abrir la foto'));
    img.src = URL.createObjectURL(archivo);
  });
}
async function leerFrente(archivo) {
  const r = await api('/leer-documento', { method: 'POST', body: { imagen: await achicarFoto(archivo) } });
  return {
    tipo: r.tipo, documento: r.numero, nombres: titulo(r.nombres || ''), apellidos: titulo(r.apellidos || ''),
    sexo: r.sexo, nacimiento: r.nacimiento, rh: r.rh, expedicion: r.expedicion, vence: r.vence,
    categorias: r.categorias, organismo: r.organismo, nacionalidad: r.nacionalidad, delFrente: true,
  };
}
// Tarjeta de propiedad (licencia de tránsito) del vehículo: solo por foto
async function leerTarjetaPropiedad(archivo) {
  const r = await api('/leer-documento', { method: 'POST', body: { clase: 'vehiculo', imagen: await achicarFoto(archivo) } });
  for (const k of ['marca', 'linea', 'color', 'clase', 'servicio']) r[k] = titulo(r[k] || '');
  // Las empresas (S.A.S., LTDA) se dejan como vienen impresas
  if (!/\b(S\.?A\.?S|LTDA|S\.?A)\b\.?/i.test(r.propietario || '')) r.propietario = titulo(r.propietario || '');
  return r;
}
// SOAT o técnico-mecánica por foto: clase 'soat' | 'tecnomecanica'
async function leerVigenciaFoto(archivo, clase) {
  const r = await api('/leer-documento', { method: 'POST', body: { clase, imagen: await achicarFoto(archivo) } });
  r.entidad = /\b(S\.?A\.?S|LTDA|S\.?A)\b/i.test(r.entidad || '') ? r.entidad : titulo(r.entidad || '');
  return r;
}
// Une lo del código de barras con lo del frente: el frente trae el nombre completo y las fechas
function unir(codigo, frente) {
  const d = { ...codigo };
  for (const [k, v] of Object.entries(frente)) if (v && (!d[k] || ['nombres', 'apellidos', 'tipo'].includes(k))) d[k] = v;
  d.nombreCompleto = [d.nombres, d.apellidos].filter(Boolean).join(' ');
  if (codigo.documento && frente.documento && codigo.documento !== frente.documento) {
    d.aviso = `El número del código (${codigo.documento}) no coincide con el del frente (${frente.documento}). Verifique en el documento.`;
  }
  return d;
}

// ---------- pantalla del escáner ----------
// escanearDocumento() abre la cámara y devuelve { documento, nombreCompleto, ... } ya confirmado, o null si se cancela.
// Modos: 'persona' (por defecto), 'vehiculo' (tarjeta de propiedad), 'soat' y 'tecnomecanica'.
function escanearDocumento(modo = 'persona') {
  const M = MODOS[modo];
  const vehiculo = modo !== 'persona';
  return new Promise((resolver) => {
    const capa = document.createElement('div');
    capa.className = 'escaner';
    capa.innerHTML = `
      <div class="esc-barra"><b>${M.titulo}</b><button type="button" class="btn chico" data-a="cerrar">Cerrar</button></div>
      <div class="esc-video"><video playsinline muted></video><div class="esc-marco"></div></div>
      <p class="esc-ayuda">Ponga el código de barras (el rectángulo de rayas o el cuadro QR) ${M.donde} dentro del marco. Acerque hasta que se vea nítido.</p>
      <div class="esc-botones">
        <button type="button" class="btn chico" data-a="linterna" hidden>🔦 Linterna</button>
        <label class="btn chico">📸 Foto del código<input type="file" accept="image/*" capture="environment" hidden data-a="foto-codigo"></label>
        ${vehiculo ? '' : '<label class="btn chico">🪪 Foto del frente<input type="file" accept="image/*" capture="environment" hidden data-a="foto-frente"></label>'}
      </div>
      <p class="suave pequeno">${vehiculo ? 'Si el código no trae todos los datos, cierre y use el botón de <b>foto</b> del documento.'
        : 'La cédula y la tarjeta de identidad antiguas traen todo en el código. La licencia solo trae número, categorías y parte del nombre: para lo demás use <b>Foto del frente</b>.'}</p>
      <p class="esc-estado suave pequeno">Preparando cámara…</p>`;
    document.body.appendChild(capa);
    const video = capa.querySelector('video');
    const estadoTxt = capa.querySelector('.esc-estado');
    let flujo = null, activo = true, ocupado = false, linterna = false;

    function terminar(valor) {
      activo = false;
      if (flujo) flujo.getTracks().forEach((t) => t.stop());
      capa.remove();
      resolver(valor);
    }
    capa.querySelector('[data-a=cerrar]').onclick = () => terminar(null);

    async function procesar(entrada) {
      const r = await LectorCodigos.leerCodigo(entrada);
      if (!r) return false;
      activo = false;
      if (navigator.vibrate) navigator.vibrate(80);
      if (flujo) flujo.getTracks().forEach((t) => t.stop());
      const d = LectorCodigos.interpretar(r, M.esperado);
      if (vehiculo) confirmarVehiculo(d); else confirmar(d);
      return true;
    }

    function confirmar(d) {
      const fila = (k, etiqueta) => (d[k] ? `<tr><td>${h(etiqueta)}</td><td>${h(d[k])}</td></tr>` : '');
      capa.innerHTML = `
        <div class="esc-barra"><b>Datos leídos</b><button type="button" class="btn chico" data-a="cerrar">Cancelar</button></div>
        <div class="esc-confirmar">
          <div class="chip">${h(d.tipo)}</div>
          <label>Número de documento</label><input id="esc-doc" inputmode="numeric" value="${h(d.documento || '')}">
          <label>Nombre completo</label><input id="esc-nom" value="${h(d.nombreCompleto || '')}">
          ${d.tipo === 'Licencia de conducción' ? '<p class="suave pequeno">Revise que el número coincida con el de la licencia física.</p>' : ''}
          <table class="datos">${fila('sexo', 'Sexo')}${fila('nacimiento', 'Nacimiento')}${fila('rh', 'RH')}${fila('expedicion', 'Expedición')}${fila('categorias', 'Categorías')}${fila('vence', 'Vence')}${fila('organismo', 'Expedida por')}${fila('nacionalidad', 'Nacionalidad')}${fila('numeroTarjeta', 'N.º de la tarjeta')}</table>
          ${d.verificado === false ? '<p class="obs pequeno">⚠️ Los dígitos de control no cuadran: puede haber un carácter mal leído. Escanee otra vez.</p>' : ''}
          ${d.enlace ? `<p class="pequeno">Enlace de verificación: <a href="${h(d.enlace)}" target="_blank" rel="noopener">abrir</a></p>` : ''}
          ${d.aviso ? `<p class="obs pequeno">⚠️ ${h(d.aviso)}</p>` : ''}
          ${d.delFrente ? '' : `<label class="btn bloque" style="margin-top:10px">🪪 Completar con foto del frente<input type="file" accept="image/*" capture="environment" hidden id="esc-frente"></label>
          <p class="suave pequeno" id="esc-frente-txt"></p>`}
          ${d.apellidos || d.delFrente ? '' : '<p class="obs pequeno">Revise los datos contra el documento físico: este formato no trae los campos en posiciones fijas.</p>'}
          ${d.crudo ? `<details class="pequeno"><summary>Ver texto del código</summary><code class="crudo">${h(d.crudo)}</code></details>` : ''}
          <p><button type="button" class="btn primario bloque grande" data-a="usar">Usar estos datos</button></p>
          <p><button type="button" class="btn bloque" data-a="otra">Escanear otra vez</button></p>
        </div>`;
      capa.querySelector('[data-a=cerrar]').onclick = () => terminar(null);
      const fr = capa.querySelector('#esc-frente');
      if (fr) fr.onchange = async (ev) => {
        const f = ev.target.files[0]; if (!f) return;
        const txt = capa.querySelector('#esc-frente-txt'); txt.textContent = 'Leyendo el frente…';
        try { confirmar(unir(d, await leerFrente(f))); } catch (e) { txt.textContent = e.message; }
      };
      capa.querySelector('[data-a=otra]').onclick = () => { capa.remove(); escanearDocumento().then(resolver); };
      capa.querySelector('[data-a=usar]').onclick = () => {
        d.documento = capa.querySelector('#esc-doc').value.replace(/\D/g, '');
        d.nombreCompleto = capa.querySelector('#esc-nom').value.trim();
        terminar(d);
      };
    }

    function confirmarVehiculo(d) {
      const tabla = d.campos.map((c, i) => `<div><span>${h(c.etiqueta || 'Dato ' + (i + 1))}</span><b>${h(c.valor)}</b></div>`).join('');
      capa.innerHTML = `
        <div class="esc-barra"><b>Datos del código</b><button type="button" class="btn chico" data-a="cerrar">Cancelar</button></div>
        <div class="esc-confirmar">
          <div class="chip">${h(d.tipo)} · ${d.campos.length} datos</div>
          <label>Placa</label><input id="esc-placa" style="text-transform:uppercase" value="${h(d.placa || '')}">
          ${modo === 'vehiculo' ? `<label>Modelo (año)</label><input id="esc-modelo" inputmode="numeric" value="${h(d.modelo || '')}">`
            : `<label>${modo === 'soat' ? 'N.º de póliza' : 'N.º de certificado'}</label><input id="esc-numero" value="${h(d.numero || '')}">
          <label>${modo === 'soat' ? 'Aseguradora' : 'CDA'}</label><input id="esc-entidad" value="${h(d.entidad || '')}">
          <label>Vence</label><input id="esc-vence" type="date" value="${h(d.vence || '')}">
          ${d.enlace ? `<p class="pequeno">Enlace de verificación: <a href="${h(d.enlace)}" target="_blank" rel="noopener">abrir</a></p>` : ''}`}
          <h2>Todo lo que trae el código</h2>
          <div class="todos">${tabla || '<div>El código no trae campos legibles</div>'}</div>
          ${modo === 'vehiculo' ? '<label class="check"><input type="checkbox" id="esc-notas" checked><span>Guardar todos estos datos en Notas</span></label>' : ''}
          <p class="obs pequeno">Los nombres de cada dato se deducen por su forma (placa, año, fechas, entidad…). Los que dicen “Dato N” no se reconocieron: compárelos con el documento.</p>
          <details class="pequeno"><summary>Texto completo del código</summary><code class="crudo">${h(d.crudo)}</code></details>
          <p><button type="button" class="btn primario bloque grande" data-a="usar">Usar estos datos</button></p>
          <p><button type="button" class="btn bloque" data-a="otra">Escanear otra vez</button></p>
        </div>`;
      capa.querySelector('[data-a=cerrar]').onclick = () => terminar(null);
      capa.querySelector('[data-a=otra]').onclick = () => { capa.remove(); escanearDocumento(modo).then(resolver); };
      capa.querySelector('[data-a=usar]').onclick = () => terminar({
        ...d,
        placa: capa.querySelector('#esc-placa').value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
        ...(modo === 'vehiculo' ? {
          modelo: capa.querySelector('#esc-modelo').value.replace(/\D/g, ''),
          aNotas: capa.querySelector('#esc-notas').checked,
        } : {
          numero: capa.querySelector('#esc-numero').value.trim(),
          entidad: capa.querySelector('#esc-entidad').value.trim(),
          vence: capa.querySelector('#esc-vence').value,
        }),
      });
    }

    if (!vehiculo) capa.querySelector('[data-a=foto-frente]').onchange = async (ev) => {
      const f = ev.target.files[0]; if (!f) return;
      estadoTxt.textContent = 'Leyendo el frente del documento…';
      try {
        const d = await leerFrente(f);
        activo = false;
        if (flujo) flujo.getTracks().forEach((t) => t.stop());
        confirmar(unir({}, d));
      } catch (e) { estadoTxt.textContent = e.message; }
    };
    capa.querySelector('[data-a=foto-codigo]').onchange = async (ev) => {
      const f = ev.target.files[0]; if (!f) return;
      estadoTxt.textContent = 'Leyendo la foto…';
      try {
        await cargarZXing();
        if (!(await procesar(f))) estadoTxt.textContent = 'No se encontró el código en la foto. Tómela más cerca, sin reflejos y con el código derecho.';
      } catch (e) { estadoTxt.textContent = e.message; }
    };

    const lienzo = document.createElement('canvas');
    const ctx = lienzo.getContext('2d', { willReadFrequently: true });
    async function cuadro() {
      if (!activo) return;
      if (!ocupado && video.readyState >= 2 && video.videoWidth) {
        ocupado = true;
        lienzo.width = video.videoWidth; lienzo.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        try { await procesar(ctx.getImageData(0, 0, lienzo.width, lienzo.height)); } catch (e) { /* cuadro ilegible: se sigue intentando */ }
        ocupado = false;
      }
      if (activo) setTimeout(cuadro, 250);
    }

    (async () => {
      try {
        await cargarZXing();
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Este navegador no deja usar la cámara en vivo. Use “Tomar foto”.');
        flujo = await navigator.mediaDevices.getUserMedia({
          audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (!activo) return flujo.getTracks().forEach((t) => t.stop());
        video.srcObject = flujo; await video.play();
        const pista = flujo.getVideoTracks()[0];
        const cap = pista.getCapabilities ? pista.getCapabilities() : {};
        if (cap.focusMode && cap.focusMode.includes('continuous')) pista.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
        if (cap.torch) {
          const b = capa.querySelector('[data-a=linterna]'); b.hidden = false;
          b.onclick = () => { linterna = !linterna; pista.applyConstraints({ advanced: [{ torch: linterna }] }).catch(() => {}); };
        }
        estadoTxt.textContent = 'Buscando el código…';
        cuadro();
      } catch (e) {
        estadoTxt.textContent = e.name === 'NotAllowedError' ? 'Sin permiso para la cámara. Actívelo en el navegador o use “Tomar foto”.' : e.message;
      }
    })();
  });
}

// Botón 📷 debajo de un campo de cédula: llena el número y entrega los demás datos a alLeer(datos)
function botonEscanear(inputDoc, alLeer) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'btn chico btn-escanear'; b.textContent = '📷 Escanear cédula o licencia';
  b.onclick = async () => {
    const d = await escanearDocumento();
    if (!d) return;
    if (d.documento) inputDoc.value = d.documento;
    if (alLeer) alLeer(d);
    inputDoc.dispatchEvent(new Event('input', { bubbles: true }));
    toast('Datos cargados del documento ✔');
  };
  inputDoc.insertAdjacentElement('afterend', b);
  return b;
}
