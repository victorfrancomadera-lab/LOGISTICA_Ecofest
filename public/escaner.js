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

function interpretar(resultado) {
  const raw = resultado.bytes && resultado.bytes.length ? latin1(resultado.bytes) : resultado.text;
  const d = leerCedulaAmarilla(raw) || leerGenerico(raw);
  d.formato = resultado.format;
  d.crudo = limpiarCampo(raw.replace(/\x00+/g, ' | '));
  if (!d.nombreCompleto && (d.nombres || d.apellidos)) d.nombreCompleto = [d.nombres, d.apellidos].filter(Boolean).join(' ');
  return d;
}

// ---------- pantalla del escáner ----------
// escanearDocumento() abre la cámara y devuelve { documento, nombreCompleto, ... } ya confirmado, o null si se cancela.
function escanearDocumento() {
  return new Promise((resolver) => {
    const capa = document.createElement('div');
    capa.className = 'escaner';
    capa.innerHTML = `
      <div class="esc-barra"><b>Escanear documento</b><button type="button" class="btn chico" data-a="cerrar">Cerrar</button></div>
      <div class="esc-video"><video playsinline muted></video><div class="esc-marco"></div></div>
      <p class="esc-ayuda">Ponga el <b>reverso</b> de la cédula o de la licencia frente a la cámara, con el código de barras (el rectángulo de rayas) dentro del marco. Acerque hasta que se vea nítido.</p>
      <div class="esc-botones">
        <button type="button" class="btn chico" data-a="linterna" hidden>🔦 Linterna</button>
        <label class="btn chico">📸 Tomar foto<input type="file" accept="image/*" capture="environment" hidden></label>
      </div>
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
      confirmar(interpretar(r));
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
          <table class="datos">${fila('sexo', 'Sexo')}${fila('nacimiento', 'Nacimiento')}${fila('rh', 'RH')}${fila('categorias', 'Categorías')}${fila('vence', 'Vence')}</table>
          ${d.tipo === 'Cédula de ciudadanía' ? '' : '<p class="obs pequeno">Revise los datos contra el documento físico: este formato no trae los campos en posiciones fijas.</p>'}
          <details class="pequeno"><summary>Ver texto del código</summary><code class="crudo">${h(d.crudo)}</code></details>
          <p><button type="button" class="btn primario bloque grande" data-a="usar">Usar estos datos</button></p>
          <p><button type="button" class="btn bloque" data-a="otra">Escanear otra vez</button></p>
        </div>`;
      capa.querySelector('[data-a=cerrar]').onclick = () => terminar(null);
      capa.querySelector('[data-a=otra]').onclick = () => { capa.remove(); escanearDocumento().then(resolver); };
      capa.querySelector('[data-a=usar]').onclick = () => {
        d.documento = capa.querySelector('#esc-doc').value.replace(/\D/g, '');
        d.nombreCompleto = capa.querySelector('#esc-nom').value.trim();
        terminar(d);
      };
    }

    capa.querySelector('input[type=file]').onchange = async (ev) => {
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
