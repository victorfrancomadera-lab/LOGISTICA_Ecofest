'use strict';
// Escáner de cédula y licencia de conducción (código PDF417 o QR del reverso) con la cámara del celular.
// Lee con zxing-wasm (servido desde /vendor/zxing, sin CDN) y muestra los datos para confirmarlos antes de llenar el formulario.

let zxingListo = null;
function cargarZXing() {
  if (zxingListo) return zxingListo;
  zxingListo = new Promise((ok, falla) => {
    const s = document.createElement('script');
    s.src = '/vendor/zxing/reader.js';
    s.onload = () => {
      ZXingWASM.prepareZXingModule({
        overrides: { locateFile: (p, prefijo) => (p.endsWith('.wasm') ? '/vendor/zxing/zxing_reader.wasm' : prefijo + p) },
        fireImmediately: true,
      }).then(ok, falla);
    };
    s.onerror = () => { zxingListo = null; falla(new Error('No se pudo cargar el lector. Revise la conexión.')); };
    document.head.appendChild(s);
  });
  return zxingListo;
}

const OPCIONES_LECTOR = { formats: ['PDF417', 'QRCode'], tryHarder: true, tryRotate: true, tryInvert: false, maxNumberOfSymbols: 1 };

// ---------- interpretación de los datos ----------
const latin1 = (bytes) => Array.from(bytes, (b) => String.fromCharCode(b)).join('');
const limpiarCampo = (s) => s.replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').replace(/\s+/g, ' ').trim();
const soloLetras = (s) => /^[A-ZÁÉÍÓÚÑÜ ]+$/.test(s);
function fechaValida(aaaammdd) {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(aaaammdd || '');
  if (!m) return '';
  const [a, me, d] = [+m[1], +m[2], +m[3]];
  if (a < 1900 || a > 2100 || me < 1 || me > 12 || d < 1 || d > 31) return '';
  return `${m[1]}-${m[2]}-${m[3]}`;
}
const titulo = (s) => s.toLowerCase().replace(/(^|\s)(\S)/g, (_, e, l) => e + l.toUpperCase());

// Cédula amarilla con hologramas: PDF417 de posiciones fijas (documento 48-58, apellidos, nombres, sexo, nacimiento, RH)
function leerCedulaAmarilla(raw) {
  if (raw.length < 160) return null;
  const doc = raw.slice(48, 58).replace(/\D/g, '').replace(/^0+/, '');
  const campos = [raw.slice(58, 81), raw.slice(81, 104), raw.slice(104, 127), raw.slice(127, 150)].map(limpiarCampo);
  if (doc.length < 5 || !campos[0] || !campos[2] || !campos.every((c) => !c || soloLetras(c))) return null;
  const resto = raw.slice(150);
  const sn = /([MF])(\d{8})/.exec(resto);
  const rh = /(A|B|AB|O)\s?([+-])/.exec(raw.slice(160).replace(/\x00/g, ' '));
  return {
    tipo: 'Cédula de ciudadanía',
    documento: doc,
    apellidos: titulo([campos[0], campos[1]].filter(Boolean).join(' ')),
    nombres: titulo([campos[2], campos[3]].filter(Boolean).join(' ')),
    sexo: sn ? sn[1] : '',
    nacimiento: sn ? fechaValida(sn[2]) : '',
    rh: rh ? rh[1] + rh[2] : '',
  };
}

// Licencia de conducción, cédula digital u otro código: se extrae lo que se pueda reconocer y se pide confirmar
function leerGenerico(texto) {
  const t = texto.replace(/[\x00-\x1f]/g, '|');
  const datos = { tipo: /LICENCIA|CONDUC|RUNT|TRANSITO|TRÁNSITO/i.test(t) ? 'Licencia de conducción' : 'Documento' };
  const fechas = [...t.matchAll(/(?<!\d)(\d{4})[-/]?(\d{2})[-/]?(\d{2})(?!\d)|(?<!\d)(\d{2})[-/](\d{2})[-/](\d{4})(?!\d)/g)]
    .map((m) => (m[1] ? fechaValida(m[1] + m[2] + m[3]) : fechaValida(m[6] + m[5] + m[4]))).filter(Boolean);
  const sinFechas = t.replace(/(?<!\d)(\d{4})[-/]?(\d{2})[-/]?(\d{2})(?!\d)/g, (m, a, me, d) => (fechaValida(a + me + d) ? '|' : m))
    .replace(/(?<!\d)\d{2}[-/]\d{2}[-/]\d{4}(?!\d)/g, '|');
  const numeros = (sinFechas.match(/\d{6,10}/g) || []).map((n) => n.replace(/^0+/, '')).filter((n) => n.length >= 6);
  if (numeros.length) datos.documento = numeros[0];
  const vacias = /\b(LICENCIA|CONDUCCI[OÓ]N|REP[UÚ]BLICA|COLOMBIA|MINISTERIO|TRANSPORTE|RUNT|C[EÉ]DULA|NUIP|TR[AÁ]NSITO|SERVICIO|PARTICULAR|P[UÚ]BLICO|CATEGOR[IÍ]A|NACIONALIDAD|COL)\b/;
  const nombres = t.toUpperCase().split(/[|,;:\t]+/).map((x) => x.replace(/\s+/g, ' ').trim())
    .filter((x) => x.length >= 3 && /^[A-ZÁÉÍÓÚÑÜ ]+$/.test(x) && !vacias.test(x));
  if (nombres.length) datos.nombreCompleto = titulo(nombres.slice(0, 2).reverse().join(' '));
  const cats = [...new Set(t.toUpperCase().match(/\b(A1|A2|B1|B2|B3|C1|C2|C3)\b/g) || [])];
  if (cats.length) { datos.categorias = cats.join(', '); datos.tipo = 'Licencia de conducción'; }
  if (datos.tipo === 'Licencia de conducción' && fechas.length) datos.vence = fechas.sort().at(-1);
  else if (fechas.length) datos.nacimiento = fechas.sort()[0];
  return datos;
}

// Licencia de conducción (RUNT): número de documento con ceros a la izquierda, categorías, apellidos y nombres,
// y después la foto del titular (JPEG). Ej.: 0001140861508B1 A2 C FRANCO MADERA VICTOR 2ÿØÿà…JFIF…
function sinFoto(texto) {
  const i = texto.search(/\xff\xd8|\u00c3\u00bf\u00c3\u0098|ÿØ|JFIF/);
  return i < 0 ? texto : texto.slice(0, Math.max(0, texto.lastIndexOf('JFIF', i) === i ? i - 6 : i));
}
function leerLicencia(texto) {
  const cabeza = limpiarCampo(sinFoto(texto)).toUpperCase();
  const m = /^0*(\d{6,12})\s*((?:[ABC][1-3]\s*)+)(.*)$/.exec(cabeza);
  if (!m) return null;
  const palabras = m[3].match(/[A-ZÁÉÍÓÚÑÜ]{2,}/g) || [];
  if (!palabras.length) return null;
  // Primero vienen los dos apellidos y luego los nombres
  const ap = palabras.length > 2 ? palabras.slice(0, 2) : palabras.slice(0, 1);
  const no = palabras.slice(ap.length);
  const fechas = [...cabeza.matchAll(/(?<!\d)(\d{4})[-/]?(\d{2})[-/]?(\d{2})(?!\d)/g)].map((f) => fechaValida(f[1] + f[2] + f[3])).filter(Boolean);
  return {
    tipo: 'Licencia de conducción',
    documento: m[1],
    apellidos: titulo(ap.join(' ')),
    nombres: titulo(no.join(' ')),
    categorias: [...new Set(m[2].match(/[ABC][1-3]/g))].join(', '),
    vence: fechas.sort().at(-1) || '',
    cabeza,
  };
}

function interpretar(resultado) {
  const raw = resultado.bytes && resultado.bytes.length ? latin1(resultado.bytes) : resultado.text;
  // La licencia viene en UTF-8 (Ñ y tildes); la cédula amarilla es binaria y se lee byte a byte
  const utf8 = resultado.bytes && resultado.bytes.length ? new TextDecoder('utf-8').decode(resultado.bytes) : resultado.text;
  const d = leerCedulaAmarilla(raw) || leerLicencia(utf8) || leerGenerico(sinFoto(utf8));
  d.formato = resultado.format;
  d.crudo = d.cabeza || limpiarCampo(sinFoto(raw).replace(/\x00+/g, ' | '));
  delete d.cabeza;
  if (!d.nombreCompleto && (d.nombres || d.apellidos)) d.nombreCompleto = [d.nombres, d.apellidos].filter(Boolean).join(' ');
  return d;
}

// Tarjeta de propiedad: el formato del código no está documentado; se buscan la placa, el VIN y el año y se pide confirmar
function interpretarTarjeta(resultado) {
  const utf8 = resultado.bytes && resultado.bytes.length ? new TextDecoder('utf-8').decode(resultado.bytes) : resultado.text;
  const t = sinFoto(utf8).replace(/[\x00-\x1f]/g, '|').toUpperCase();
  const placa = /(?<![A-Z0-9])([A-Z]{3})[ -]?(\d{3}|\d{2}[A-Z])(?![A-Z0-9])/.exec(t);
  const vin = /(?<![A-Z0-9])([A-HJ-NPR-Z0-9]{17})(?![A-Z0-9])/.exec(t);
  const modelo = /(?<!\d)(19[5-9]\d|20[0-4]\d)(?!\d)/.exec(t);
  return {
    placa: placa ? placa[1] + placa[2] : '',
    vin: vin && /\d/.test(vin[1]) && /[A-Z]/.test(vin[1]) ? vin[1] : '',
    modelo: modelo ? modelo[1] : '',
    crudo: limpiarCampo(sinFoto(utf8).replace(/\x00+/g, ' | ')),
  };
}

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
    categorias: r.categorias, organismo: r.organismo, delFrente: true,
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
// Con modo 'vehiculo' lee el código de la tarjeta de propiedad y devuelve { placa, vin, modelo }.
function escanearDocumento(modo = 'persona') {
  const vehiculo = modo === 'vehiculo';
  return new Promise((resolver) => {
    const capa = document.createElement('div');
    capa.className = 'escaner';
    capa.innerHTML = `
      <div class="esc-barra"><b>${vehiculo ? 'Escanear tarjeta de propiedad' : 'Escanear documento'}</b><button type="button" class="btn chico" data-a="cerrar">Cerrar</button></div>
      <div class="esc-video"><video playsinline muted></video><div class="esc-marco"></div></div>
      <p class="esc-ayuda">Ponga el código de barras (el rectángulo de rayas o el cuadro QR) ${vehiculo ? 'de la tarjeta de propiedad' : 'del <b>reverso</b> de la cédula o de la licencia'} dentro del marco. Acerque hasta que se vea nítido.</p>
      <div class="esc-botones">
        <button type="button" class="btn chico" data-a="linterna" hidden>🔦 Linterna</button>
        <label class="btn chico">📸 Foto del código<input type="file" accept="image/*" capture="environment" hidden data-a="foto-codigo"></label>
        ${vehiculo ? '' : '<label class="btn chico">🪪 Foto del frente<input type="file" accept="image/*" capture="environment" hidden data-a="foto-frente"></label>'}
      </div>
      <p class="suave pequeno">${vehiculo ? 'Si el código no trae todos los datos, cierre y use <b>Leer tarjeta de propiedad</b> con la foto del frente.'
        : 'La cédula amarilla trae todo en el código. La licencia solo trae número, categorías y parte del nombre: para el nombre completo, fechas y RH use <b>Foto del frente</b>.'}</p>
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
      const res = await ZXingWASM.readBarcodes(entrada, OPCIONES_LECTOR);
      const r = res.find((x) => x.isValid);
      if (!r) return false;
      activo = false;
      if (navigator.vibrate) navigator.vibrate(80);
      if (flujo) flujo.getTracks().forEach((t) => t.stop());
      if (vehiculo) confirmarVehiculo(interpretarTarjeta(r)); else confirmar(interpretar(r));
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
          <table class="datos">${fila('sexo', 'Sexo')}${fila('nacimiento', 'Nacimiento')}${fila('rh', 'RH')}${fila('expedicion', 'Expedición')}${fila('categorias', 'Categorías')}${fila('vence', 'Vence')}${fila('organismo', 'Expedida por')}</table>
          ${d.aviso ? `<p class="obs pequeno">⚠️ ${h(d.aviso)}</p>` : ''}
          ${d.delFrente ? '' : `<label class="btn bloque" style="margin-top:10px">🪪 Completar con foto del frente<input type="file" accept="image/*" capture="environment" hidden id="esc-frente"></label>
          <p class="suave pequeno" id="esc-frente-txt"></p>`}
          ${d.tipo === 'Cédula de ciudadanía' || d.apellidos || d.delFrente ? '' : '<p class="obs pequeno">Revise los datos contra el documento físico: este formato no trae los campos en posiciones fijas.</p>'}
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
      capa.innerHTML = `
        <div class="esc-barra"><b>Datos del código</b><button type="button" class="btn chico" data-a="cerrar">Cancelar</button></div>
        <div class="esc-confirmar">
          <div class="chip">Tarjeta de propiedad</div>
          <label>Placa</label><input id="esc-placa" style="text-transform:uppercase" value="${h(d.placa)}">
          <label>Modelo (año)</label><input id="esc-modelo" inputmode="numeric" value="${h(d.modelo)}">
          <label>VIN / chasis</label><input id="esc-vin" style="text-transform:uppercase" value="${h(d.vin)}">
          <p class="obs pequeno">Revise contra la tarjeta: todavía no conocemos el orden de los datos en este código.</p>
          <details class="pequeno" open><summary>Texto del código</summary><code class="crudo">${h(d.crudo)}</code></details>
          <p><button type="button" class="btn primario bloque grande" data-a="usar">Usar estos datos</button></p>
          <p><button type="button" class="btn bloque" data-a="otra">Escanear otra vez</button></p>
        </div>`;
      capa.querySelector('[data-a=cerrar]').onclick = () => terminar(null);
      capa.querySelector('[data-a=otra]').onclick = () => { capa.remove(); escanearDocumento(modo).then(resolver); };
      capa.querySelector('[data-a=usar]').onclick = () => terminar({
        placa: capa.querySelector('#esc-placa').value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
        modelo: capa.querySelector('#esc-modelo').value.replace(/\D/g, ''),
        vin: capa.querySelector('#esc-vin').value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
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
