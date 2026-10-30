'use strict';
/*
 * Lector de códigos de barras de documentos colombianos con la cámara del celular.
 *
 * Lee el PDF417 o QR de:
 *   - Cédula de ciudadanía antigua (amarilla con hologramas): PDF417 binario de posiciones fijas.
 *   - Cédula de ciudadanía nueva (digital, 2020+): código QR. Si trae la zona MRZ (formato pasaporte, 3 líneas
 *     con "<") se lee con dígitos de verificación; si trae otro formato, se extrae lo reconocible.
 *   - Licencia de conducción (RUNT): número, categorías, apellidos y nombre (después viene la foto del titular).
 *   - Tarjeta de identidad antigua (azul, PDF417) y nueva (digital, QR): mismos formatos que la cédula; se
 *     distingue de la cédula por la edad (menor de 18 años).
 *   - Cédula de extranjería y PPT (Permiso por Protección Temporal): MRZ con nacionalidad distinta de COL, o
 *     palabras clave en el texto; si el QR es un enlace de verificación, se devuelve el enlace y sus datos.
 *   - Tarjeta de propiedad (licencia de tránsito): formato no documentado; se separan todos los campos y se
 *     nombra cada uno por su forma (placa, VIN, año, marca, color, servicio, propietario…).
 *   - SOAT y revisión técnico-mecánica: formato no documentado (cambia según aseguradora o CDA); se buscan
 *     placa, número de póliza o certificado, entidad y fechas de vigencia.
 *
 * Depende solo de zxing-wasm (https://github.com/Sec-ant/zxing-wasm), versión 3.1.6, build IIFE "reader":
 *   node_modules/zxing-wasm/dist/iife/reader/index.js  y  node_modules/zxing-wasm/dist/reader/zxing_reader.wasm
 * La cámara en vivo exige HTTPS (o localhost).
 *
 * Uso:
 *   <script src="lector-codigos-colombia.js"></script>
 *   LectorCodigos.configurar({ script: '/vendor/zxing/reader.js', wasm: '/vendor/zxing/zxing_reader.wasm' });
 *
 *   // Cámara en vivo
 *   const camara = await LectorCodigos.iniciarCamara(document.querySelector('video'), (datos) => {
 *     camara.detener();
 *     console.log(datos);   // { tipo, documento, nombres, apellidos, ... , campos, crudo }
 *   });
 *
 *   // Desde una foto (input type=file)
 *   const datos = await LectorCodigos.leerFoto(input.files[0]);   // null si no encuentra código
 *
 *   // Si ya se sabe qué documento es: 'cedula' | 'licencia' | 'tarjeta' | 'soat' | 'tecnomecanica'
 *   // (por defecto se detecta solo; 'cedula' cubre también tarjeta de identidad, extranjería y PPT)
 *   LectorCodigos.leerFoto(archivo, { esperado: 'tarjeta' });
 */
(function (global) {
  // ---------- carga del lector ----------
  const config = { script: '/vendor/zxing/reader.js', wasm: '/vendor/zxing/zxing_reader.wasm' };
  let listo = null;

  function configurar(opciones) { Object.assign(config, opciones); listo = null; }

  function cargarLector() {
    if (listo) return listo;
    listo = new Promise((ok, falla) => {
      const s = document.createElement('script');
      s.src = config.script;
      s.onload = () => {
        global.ZXingWASM.prepareZXingModule({
          overrides: { locateFile: (p, prefijo) => (p.endsWith('.wasm') ? config.wasm : prefijo + p) },
          fireImmediately: true,
        }).then(ok, falla);
      };
      s.onerror = () => { listo = null; falla(new Error('No se pudo cargar el lector de códigos.')); };
      document.head.appendChild(s);
    });
    return listo;
  }

  const OPCIONES_LECTOR = { formats: ['PDF417', 'QRCode'], tryHarder: true, tryRotate: true, tryInvert: false, maxNumberOfSymbols: 1 };

  // Devuelve el primer código válido de una imagen (File, Blob, ImageData) o null
  async function leerCodigo(fuente) {
    await cargarLector();
    const res = await global.ZXingWASM.readBarcodes(fuente, OPCIONES_LECTOR);
    return res.find((x) => x.isValid) || null;
  }

  async function leerFoto(archivo, opciones = {}) {
    const r = await leerCodigo(archivo);
    return r ? interpretar(r, opciones.esperado) : null;
  }

  // ---------- cámara en vivo ----------
  // Lee un cuadro cada 250 ms hasta encontrar un código; alLeer(datos) recibe el resultado ya interpretado.
  async function iniciarCamara(video, alLeer, opciones = {}) {
    await cargarLector();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Este navegador no deja usar la cámara en vivo. Use una foto.');
    }
    const flujo = await navigator.mediaDevices.getUserMedia({
      audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
    video.setAttribute('playsinline', ''); video.muted = true;
    video.srcObject = flujo; await video.play();
    const pista = flujo.getVideoTracks()[0];
    const cap = pista.getCapabilities ? pista.getCapabilities() : {};
    if (cap.focusMode && cap.focusMode.includes('continuous')) pista.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});

    let activo = true, ocupado = false, luz = false;
    const lienzo = document.createElement('canvas');
    const ctx = lienzo.getContext('2d', { willReadFrequently: true });
    async function cuadro() {
      if (!activo) return;
      if (!ocupado && video.readyState >= 2 && video.videoWidth) {
        ocupado = true;
        lienzo.width = video.videoWidth; lienzo.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        try {
          const r = await leerCodigo(ctx.getImageData(0, 0, lienzo.width, lienzo.height));
          if (r && activo) {
            activo = false;
            if (navigator.vibrate) navigator.vibrate(80);
            alLeer(interpretar(r, opciones.esperado));
          }
        } catch (e) { /* cuadro ilegible: se sigue intentando */ }
        ocupado = false;
      }
      if (activo) setTimeout(cuadro, 250);
    }
    cuadro();

    return {
      tieneLinterna: !!cap.torch,
      linterna() { luz = !luz; return pista.applyConstraints({ advanced: [{ torch: luz }] }).catch(() => {}); },
      detener() { activo = false; flujo.getTracks().forEach((t) => t.stop()); video.srcObject = null; },
    };
  }

  // ---------- utilidades ----------
  const latin1 = (bytes) => Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  const limpiarCampo = (s) => s.replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').replace(/\s+/g, ' ').trim();
  const soloLetras = (s) => /^[A-ZÁÉÍÓÚÑÜ ]+$/.test(s);
  const titulo = (s) => s.toLowerCase().replace(/(^|\s)(\S)/g, (_, e, l) => e + l.toUpperCase());
  function fechaValida(aaaammdd) {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(aaaammdd || '');
    if (!m) return '';
    const [a, me, d] = [+m[1], +m[2], +m[3]];
    if (a < 1900 || a > 2100 || me < 1 || me > 12 || d < 1 || d > 31) return '';
    return `${m[1]}-${m[2]}-${m[3]}`;
  }
  function edad(nacimiento) {
    if (!nacimiento) return null;
    const n = new Date(nacimiento + 'T12:00:00'), h = new Date();
    return h.getFullYear() - n.getFullYear() - (h < new Date(h.getFullYear(), n.getMonth(), n.getDate()) ? 1 : 0);
  }
  const esMenor = (nacimiento) => { const e = edad(nacimiento); return e !== null && e < 18; };
  // Fechas en cualquiera de las formas usuales: AAAAMMDD, AAAA-MM-DD, DD/MM/AAAA, DD-MM-AAAA
  function fechasEn(texto) {
    return [...texto.matchAll(/(?<!\d)(\d{4})[-/]?(\d{2})[-/]?(\d{2})(?!\d)|(?<!\d)(\d{2})[-/](\d{2})[-/](\d{4})(?!\d)/g)]
      .map((m) => (m[1] ? fechaValida(m[1] + m[2] + m[3]) : fechaValida(m[6] + m[5] + m[4]))).filter(Boolean);
  }
  // Corta la foto JPEG que algunos códigos traen al final (la licencia la trae codificada en UTF-8)
  function sinFoto(texto) {
    const i = texto.search(/\xff\xd8|Ã¿Ã\u0098|ÿØ|JFIF/);
    return i < 0 ? texto : texto.slice(0, Math.max(0, texto.lastIndexOf('JFIF', i) === i ? i - 6 : i));
  }

  // ---------- cédula antigua (amarilla con hologramas) y tarjeta de identidad antigua (azul) ----------
  // PDF417 binario de posiciones fijas: documento 48-58, primer apellido 58-81, segundo 81-104,
  // primer nombre 104-127, segundo 127-150, luego sexo + nacimiento AAAAMMDD, municipio y RH.
  function leerCedulaAntigua(raw) {
    if (raw.length < 160) return null;
    const doc = raw.slice(48, 58).replace(/\D/g, '').replace(/^0+/, '');
    const campos = [raw.slice(58, 81), raw.slice(81, 104), raw.slice(104, 127), raw.slice(127, 150)].map(limpiarCampo);
    if (doc.length < 5 || !campos[0] || !campos[2] || !campos.every((c) => !c || soloLetras(c))) return null;
    const sn = /([MF])(\d{8})/.exec(raw.slice(150));
    const rh = /(A|B|AB|O)\s?([+-])/.exec(raw.slice(160).replace(/\x00/g, ' '));
    const nacimiento = sn ? fechaValida(sn[2]) : '';
    return {
      // La tarjeta de identidad usa el mismo formato; se reconoce porque el titular es menor de edad
      tipo: esMenor(nacimiento) ? 'Tarjeta de identidad (antigua)' : 'Cédula de ciudadanía (antigua)',
      documento: doc,
      apellidos: titulo([campos[0], campos[1]].filter(Boolean).join(' ')),
      nombres: titulo([campos[2], campos[3]].filter(Boolean).join(' ')),
      sexo: sn ? sn[1] : '',
      nacimiento,
      rh: rh ? rh[1] + rh[2] : '',
    };
  }

  // ---------- documentos con zona MRZ (formato ICAO TD1 de 3 líneas x 30 caracteres) ----------
  // Cédula digital, tarjeta de identidad digital y cédula de extranjería / PPT expedidos en Colombia.
  function digitoMRZ(s) {
    const pesos = [7, 3, 1];
    let suma = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      const v = c === '<' ? 0 : /\d/.test(c) ? +c : c.charCodeAt(0) - 55;
      suma += v * pesos[i % 3];
    }
    return String(suma % 10);
  }
  function fechaMRZ(aammdd, esNacimiento) {
    if (!/^\d{6}$/.test(aammdd)) return '';
    const aa = +aammdd.slice(0, 2), siglo = esNacimiento && aa > (new Date().getFullYear() % 100) ? 1900 : 2000;
    return fechaValida(String(siglo + aa) + aammdd.slice(2));
  }
  function leerMRZ(texto) {
    const lineas = texto.toUpperCase().replace(/[^A-Z0-9<\n]/g, '\n').split('\n').map((l) => l.trim()).filter((l) => /^[A-Z0-9<]{30}$/.test(l));
    const i = lineas.findIndex((l) => /^[IAC][A-Z<]COL/.test(l));
    if (i < 0 || !lineas[i + 2]) return null;
    const [l1, l2, l3] = lineas.slice(i, i + 3);
    const numero = l1.slice(5, 14).replace(/</g, '');
    const opcional = l1.slice(15, 30).replace(/</g, '');
    const [ap, no] = l3.split('<<');
    const verificado = digitoMRZ(l1.slice(5, 14)) === l1[14] && digitoMRZ(l2.slice(0, 6)) === l2[6] && digitoMRZ(l2.slice(8, 14)) === l2[14];
    const nacionalidad = l2.slice(15, 18).replace(/</g, '');
    const nacimiento = fechaMRZ(l2.slice(0, 6), true);
    const extranjero = nacionalidad && nacionalidad !== 'COL';
    let tipo;
    if (extranjero) tipo = /PPT|PROTECCI[OÓ]N/.test(texto.toUpperCase()) ? 'Permiso por Protección Temporal (PPT)' : 'Cédula de extranjería';
    else tipo = esMenor(nacimiento) ? 'Tarjeta de identidad (digital)' : 'Cédula de ciudadanía (digital)';
    return {
      tipo,
      // Para colombianos el NUIP va en el campo opcional y el principal es el número de la tarjeta;
      // para extranjeros el número del documento es el principal
      documento: (!extranjero && /^\d{6,10}$/.test(opcional) ? opcional : numero).replace(/^0+/, ''),
      numeroTarjeta: numero,
      apellidos: titulo((ap || '').replace(/</g, ' ').trim()),
      nombres: titulo((no || '').replace(/</g, ' ').trim()),
      sexo: /[MF]/.test(l2[7]) ? l2[7] : '',
      nacimiento,
      vence: fechaMRZ(l2.slice(8, 14), false),
      nacionalidad,
      verificado,
    };
  }

  // ---------- licencia de conducción (RUNT) ----------
  // Ej.: 0001140861508B1 A2 C FRANCO MADERA VICTOR 2ÿØÿà…JFIF… (número con ceros, categorías, apellidos, nombre, foto)
  // No trae segundo nombre, fechas ni RH: esos están solo impresos en el frente.
  function leerLicencia(texto) {
    const cabeza = limpiarCampo(sinFoto(texto)).toUpperCase();
    const m = /^0*(\d{6,12})\s*((?:[ABC][1-3]\s*)+)(.*)$/.exec(cabeza);
    if (!m) return null;
    const palabras = m[3].match(/[A-ZÁÉÍÓÚÑÜ]{2,}/g) || [];
    if (!palabras.length) return null;
    // Primero vienen los dos apellidos y luego los nombres
    const ap = palabras.length > 2 ? palabras.slice(0, 2) : palabras.slice(0, 1);
    const fechas = [...cabeza.matchAll(/(?<!\d)(\d{4})[-/]?(\d{2})[-/]?(\d{2})(?!\d)/g)].map((f) => fechaValida(f[1] + f[2] + f[3])).filter(Boolean);
    return {
      tipo: 'Licencia de conducción',
      documento: m[1],
      apellidos: titulo(ap.join(' ')),
      nombres: titulo(palabras.slice(ap.length).join(' ')),
      categorias: [...new Set(m[2].match(/[ABC][1-3]/g))].join(', '),
      vence: fechas.sort().at(-1) || '',
    };
  }

  // ---------- tarjeta de propiedad (licencia de tránsito) ----------
  const VOCES_TARJETA = {
    Servicio: /^(PARTICULAR|P[UÚ]BLICO|OFICIAL|DIPLOM[AÁ]TICO|ESPECIAL)$/,
    Clase: /^(AUTOM[OÓ]VIL|CAMIONETA|CAMPERO|MICROB[UÚ]S|BUS|BUSETA|MOTOCICLETA|MOTOCARRO|CUATRIMOTO|CAMI[OÓ]N|VOLQUETA|TRACTOCAMI[OÓ]N|VAN)$/,
    Combustible: /^(GASOLINA|DI[EÉ]SEL|ACPM|GAS|GNV|GAS ?GASOLINA|EL[EÉ]CTRICO|H[IÍ]BRIDO)$/,
    Carrocería: /^(SED[AÁ]N|HATCH ?BACK|COUP[EÉ]|WAGON|STATION WAGON|CERRADA|DOBLE CABINA|ESTACAS|FURG[OÓ]N|PLATAFORMA|STREET|SPORT|TURISMO)$/,
    Marca: /^(HYUNDAI|CHEVROLET|RENAULT|TOYOTA|KIA|NISSAN|MAZDA|FORD|VOLKSWAGEN|MERCEDES[ -]?BENZ|MERCEDES|SUZUKI|YAMAHA|HONDA|AUTECO|BAJAJ|AKT|JAC|FOTON|INTERNATIONAL|HINO|ISUZU|MITSUBISHI|DODGE|JEEP|BMW|AUDI|PEUGEOT|CITRO[EË]N|FIAT|SSANGYONG|CHERY|BYD|DFSK|GREAT WALL|SUBARU|VOLVO|KENWORTH|FREIGHTLINER|AGRALE|DAEWOO|KTM|TVS|VICTORY|HERO)$/,
    Color: /^(BLANC[OA]|NEGR[OA]|GRIS|PLATA|PLATEAD[OA]|ROJ[OA]|AZUL|VERDE|AMARILL[OA]|NARANJA|BEIGE|CAF[EÉ]|VINOTINTO|DORAD[OA]|MORAD[OA]|BLANCO .+|GRIS .+|NEGRO .+|ROJO .+|AZUL .+|PLATA .+)$/,
  };
  const RE_PLACA = /^[A-Z]{3}[ -]?(\d{3}|\d{2}[A-Z])$/;
  const esVIN = (v) => /^[A-HJ-NPR-Z0-9]{17}$/.test(v) && /\d/.test(v) && /[A-Z]/.test(v);
  function etiquetarCampo(v) {
    if (/^HTTPS?:\/\//.test(v)) return 'Enlace de verificación';
    if (RE_PLACA.test(v)) return 'Placa';
    if (esVIN(v)) return 'VIN / chasis';
    if (/^(19[5-9]\d|20[0-4]\d)$/.test(v)) return 'Modelo (año)';
    if (fechaValida(v.replace(/[-/]/g, '')) || /^\d{2}[-/]\d{2}[-/]\d{4}$/.test(v)) return 'Fecha';
    for (const [etiqueta, re] of Object.entries(VOCES_TARJETA)) if (re.test(v)) return etiqueta;
    if (ASEGURADORAS.test(v)) return 'Aseguradora';
    // Nombre de persona o empresa: dos o más palabras solo con letras (S.A.S., LTDA incluidos)
    if (v.length >= 8 && /^[A-ZÁÉÍÓÚÑÜ.&]+( [A-ZÁÉÍÓÚÑÜ.&]+)+$/.test(v)) return 'Nombre (¿propietario?)';
    if (/^\d{3,5}$/.test(v)) return 'Número corto (cilindraje, capacidad…)';
    if (/^\d{6,12}$/.test(v)) return 'Número (documento, licencia de tránsito…)';
    return '';
  }
  function separarCampos(texto) {
    let partes = texto.split(/[\x00-\x1f|;]+/);
    if (partes.filter((x) => x.trim()).length < 3) partes = texto.split(/[\x00-\x1f|;,]+|\s{2,}/);
    return partes.map((x) => x.replace(/\s+/g, ' ').trim().toUpperCase()).filter(Boolean);
  }
  function leerTarjeta(texto) {
    const campos = separarCampos(sinFoto(texto)).map((valor) => ({ etiqueta: etiquetarCampo(valor), valor }));
    // El número que viene justo después del nombre se toma como documento del propietario
    campos.forEach((c, i) => {
      const sig = campos[i + 1];
      if (c.etiqueta === 'Nombre (¿propietario?)' && sig && /^\d{6,12}$/.test(sig.valor.replace(/[.\-\s]/g, ''))) sig.etiqueta = 'Documento (¿propietario?)';
    });
    const d = { tipo: 'Tarjeta de propiedad', campos };
    const claves = { 'Placa': 'placa', 'VIN / chasis': 'vin', 'Modelo (año)': 'modelo', Servicio: 'servicio', Clase: 'clase', Marca: 'marca',
      Color: 'color', Combustible: 'combustible', 'Carrocería': 'carroceria', 'Nombre (¿propietario?)': 'propietario', 'Documento (¿propietario?)': 'propietario_doc' };
    for (const c of campos) {
      const k = claves[c.etiqueta];
      if (k && !d[k]) d[k] = k === 'placa' ? c.valor.replace(/[^A-Z0-9]/g, '') : c.valor;
    }
    return d;
  }
  const pareceTarjeta = (texto) => separarCampos(sinFoto(texto)).some((v) => RE_PLACA.test(v) || esVIN(v));

  // ---------- SOAT y revisión técnico-mecánica ----------
  const ASEGURADORAS = /\b(SURA|SURAMERICANA|MAPFRE|PREVISORA|BOL[IÍ]VAR|ALLIANZ|AXA ?COLPATRIA|COLPATRIA|MUNDIAL|SOLIDARIA|EQUIDAD|HDI|LIBERTY|ESTADO|POSITIVA|SBS|COLMENA|CARDIF|ZURICH|QBE)\b/;
  const RE_SOAT = /SOAT|SEGURO OBLIGATORIO|P[OÓ]LIZA/;
  const RE_RTM = /T[EÉ]CNICO ?-?MEC[AÁ]NICA|TECNOMEC[AÁ]NICA|REVISI[OÓ]N T[EÉ]CNICO|\bCDA\b|CENTRO DE DIAGN[OÓ]STICO|\bRTM\b/;
  // Si el QR es un enlace (página de verificación), sus parámetros también son datos
  function datosDeEnlace(texto) {
    const m = /https?:\/\/[^\s|]+/i.exec(texto);
    if (!m) return null;
    const campos = [];
    try {
      const u = new URL(m[0]);
      u.searchParams.forEach((v, k) => { if (v) campos.push({ etiqueta: k, valor: v.toUpperCase() }); });
    } catch (e) { /* enlace mal formado: se devuelve tal cual */ }
    return { enlace: m[0], campos };
  }
  function leerDocVehiculo(texto, clase) {
    const t = sinFoto(texto).toUpperCase();
    const enlace = datosDeEnlace(texto);
    const campos = separarCampos(sinFoto(texto)).map((valor) => ({ etiqueta: etiquetarCampo(valor), valor }));
    if (enlace) campos.push(...enlace.campos.map((c) => ({ etiqueta: etiquetarCampo(c.valor) || c.etiqueta, valor: c.valor })));
    const todo = [t, ...campos.map((c) => c.valor)].join('|');
    const placa = /(?<![A-Z0-9])([A-Z]{3})[ -]?(\d{3}|\d{2}[A-Z])(?![A-Z0-9])/.exec(todo);
    const fechas = [...new Set(fechasEn(todo))].sort();
    // Número de póliza o certificado: la cifra más larga que no sea fecha ni documento corto
    const sinFechas = todo.replace(/(?<!\d)(\d{4})[-/]?(\d{2})[-/]?(\d{2})(?!\d)/g, (m0, a, me, d) => (fechaValida(a + me + d) ? '|' : m0));
    const numeros = (sinFechas.match(/\d{6,20}/g) || []).sort((a, b) => b.length - a.length);
    const aseg = ASEGURADORAS.exec(todo);
    const cda = /\bCDA[ A-ZÁÉÍÓÚÑ.&]{3,40}/.exec(todo);
    return {
      tipo: clase === 'soat' ? 'SOAT' : 'Revisión técnico-mecánica',
      placa: placa ? placa[1] + placa[2] : '',
      numero: numeros[0] || '',
      entidad: clase === 'soat' ? (aseg ? aseg[1] : '') : (cda ? cda[0].trim() : ''),
      desde: fechas.length > 1 ? fechas[0] : '',
      vence: fechas.at(-1) || '',
      enlace: enlace ? enlace.enlace : '',
      campos,
    };
  }

  // ---------- cualquier otro código: lo reconocible por su forma ----------
  function leerGenerico(texto) {
    // Si es un enlace de verificación, se trabaja con los valores de sus parámetros en lugar de la dirección
    const enlace = datosDeEnlace(texto);
    const base = enlace ? texto.replace(enlace.enlace, '|') + '|' + enlace.campos.map((c) => c.valor).join('|') : texto;
    const t = base.replace(/[\x00-\x1f]/g, '|');
    const T = (texto + '|' + t).toUpperCase();
    const datos = { tipo: /PPT|PROTECCI[OÓ]N TEMPORAL/.test(T) ? 'Permiso por Protección Temporal (PPT)'
      : /EXTRANJER/.test(T) ? 'Cédula de extranjería'
        : /TARJETA DE IDENTIDAD/.test(T) ? 'Tarjeta de identidad'
          : /LICENCIA|CONDUC|RUNT|TRANSITO|TRÁNSITO/.test(T) ? 'Licencia de conducción' : 'Documento' };
    if (enlace) datos.enlace = enlace.enlace;
    // Los nombres de los parámetros del enlace dicen qué es cada dato
    const porNombre = {};
    if (enlace) {
      for (const c of enlace.campos) {
        const k = c.etiqueta.toLowerCase();
        if (/venc|hasta|expira/.test(k)) porNombre.vence = fechasEn(c.valor)[0];
        else if (/nac/.test(k)) porNombre.nacimiento = fechasEn(c.valor)[0];
        else if (/^(doc|num|nro|id|cedula|ppt)/.test(k) && /\d{5,}/.test(c.valor)) porNombre.documento = c.valor.replace(/\D/g, '').replace(/^0+/, '');
        else if (/nom/.test(k)) porNombre.nombreCompleto = titulo(c.valor);
      }
    }
    const fechas = [...t.matchAll(/(?<!\d)(\d{4})[-/]?(\d{2})[-/]?(\d{2})(?!\d)|(?<!\d)(\d{2})[-/](\d{2})[-/](\d{4})(?!\d)/g)]
      .map((m) => (m[1] ? fechaValida(m[1] + m[2] + m[3]) : fechaValida(m[6] + m[5] + m[4]))).filter(Boolean);
    const sinFechas = t.replace(/(?<!\d)(\d{4})[-/]?(\d{2})[-/]?(\d{2})(?!\d)/g, (m, a, me, d) => (fechaValida(a + me + d) ? '|' : m))
      .replace(/(?<!\d)\d{2}[-/]\d{2}[-/]\d{4}(?!\d)/g, '|');
    const numeros = (sinFechas.match(/\d{6,10}/g) || []).map((n) => n.replace(/^0+/, '')).filter((n) => n.length >= 6);
    if (numeros.length) datos.documento = numeros[0];
    const vacias = /\b(LICENCIA|CONDUCCI[OÓ]N|REP[UÚ]BLICA|COLOMBIA|MINISTERIO|TRANSPORTE|RUNT|C[EÉ]DULA|NUIP|TR[AÁ]NSITO|SERVICIO|PARTICULAR|P[UÚ]BLICO|CATEGOR[IÍ]A|NACIONALIDAD|COL|PPT|PERMISO|PROTECCI[OÓ]N|TEMPORAL|EXTRANJER[IÍ]A|MIGRACI[OÓ]N)\b/;
    const nombres = t.toUpperCase().split(/[|,;:\t]+/).map((x) => x.replace(/\s+/g, ' ').trim())
      .filter((x) => x.length >= 3 && /^[A-ZÁÉÍÓÚÑÜ ]+$/.test(x) && !vacias.test(x));
    if (nombres.length) datos.nombreCompleto = titulo(nombres.slice(0, 2).reverse().join(' '));
    const cats = [...new Set(t.toUpperCase().match(/\b(A1|A2|B1|B2|B3|C1|C2|C3)\b/g) || [])];
    if (cats.length) { datos.categorias = cats.join(', '); datos.tipo = 'Licencia de conducción'; }
    if (fechas.length) {
      datos.fechas = fechas.sort();
      if (datos.tipo === 'Documento' || datos.tipo === 'Tarjeta de identidad') datos.nacimiento = datos.fechas[0]; else datos.vence = datos.fechas.at(-1);
    }
    for (const [k, v] of Object.entries(porNombre)) if (v) datos[k] = v;
    if (porNombre.vence && datos.nacimiento === porNombre.vence) delete datos.nacimiento;
    return datos;
  }

  // ---------- interpretación ----------
  // resultado: lo que devuelve zxing-wasm. esperado (opcional): 'cedula' | 'licencia' | 'tarjeta'.
  // Siempre devuelve también `campos` (todo lo que trae el código, separado) y `crudo` (el texto completo).
  function interpretar(resultado, esperado) {
    const hayBytes = resultado.bytes && resultado.bytes.length;
    // La cédula antigua es binaria y se lee byte a byte; la licencia y la tarjeta vienen en UTF-8 (Ñ y tildes)
    const raw = hayBytes ? latin1(resultado.bytes) : resultado.text;
    const utf8 = hayBytes ? new TextDecoder('utf-8').decode(resultado.bytes) : resultado.text;
    const T = utf8.toUpperCase();
    let d = null;
    if (esperado === 'tarjeta') d = leerTarjeta(utf8);
    else if (esperado === 'soat' || esperado === 'tecnomecanica') d = leerDocVehiculo(utf8, esperado);
    else d = leerCedulaAntigua(raw) || leerMRZ(utf8) || leerLicencia(utf8);
    if (!d && !esperado) {
      if (RE_SOAT.test(T)) d = leerDocVehiculo(utf8, 'soat');
      else if (RE_RTM.test(T)) d = leerDocVehiculo(utf8, 'tecnomecanica');
      else if (pareceTarjeta(utf8)) d = leerTarjeta(utf8);
    }
    if (!d) d = leerGenerico(sinFoto(utf8));
    if (!d.campos) d.campos = separarCampos(sinFoto(utf8)).map((valor) => ({ etiqueta: '', valor }));
    if (d.nombres || d.apellidos) d.nombreCompleto = [d.nombres, d.apellidos].filter(Boolean).join(' ');
    d.formato = resultado.format;
    d.crudo = limpiarCampo(sinFoto(raw).replace(/\x00+/g, ' | '));
    return d;
  }

  global.LectorCodigos = {
    configurar, cargarLector, iniciarCamara, leerFoto, leerCodigo, interpretar,
    // intérpretes sueltos, por si se quieren usar con un texto ya leído
    leerCedulaAntigua, leerMRZ, leerLicencia, leerTarjeta, leerDocVehiculo, leerGenerico,
  };
})(typeof window !== 'undefined' ? window : globalThis);
