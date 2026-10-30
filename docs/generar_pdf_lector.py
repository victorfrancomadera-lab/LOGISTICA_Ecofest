import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
                                PageBreak, KeepTogether, Preformatted, Flowable)

F = '/usr/share/fonts/truetype/dejavu/'
pdfmetrics.registerFont(TTFont('S', F + 'DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('SB', F + 'DejaVuSans-Bold.ttf'))
pdfmetrics.registerFont(TTFont('SI', F + 'DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('M', F + 'DejaVuSansMono.ttf'))
from reportlab.pdfbase.pdfmetrics import registerFontFamily
registerFontFamily('S', normal='S', bold='SB', italic='SI', boldItalic='SB')

VERDE = colors.HexColor('#183A2C')
LIMA = colors.HexColor('#8DC63F')
GRIS = colors.HexColor('#5E6B64')
BORDE = colors.HexColor('#DDE3DE')
FONDO = colors.HexColor('#F5F7F4')
AMBAR = colors.HexColor('#FFF1D6')

st = {
    'h1': ParagraphStyle('h1', fontName='SB', fontSize=16, leading=20, textColor=VERDE, spaceBefore=14, spaceAfter=8),
    'h2': ParagraphStyle('h2', fontName='SB', fontSize=12, leading=16, textColor=VERDE, spaceBefore=10, spaceAfter=4),
    'p': ParagraphStyle('p', fontName='S', fontSize=9.5, leading=13.5, spaceAfter=6, alignment=TA_LEFT),
    'li': ParagraphStyle('li', fontName='S', fontSize=9.5, leading=13.5, leftIndent=14, bulletIndent=4, spaceAfter=2),
    'td': ParagraphStyle('td', fontName='S', fontSize=8.5, leading=11),
    'th': ParagraphStyle('th', fontName='SB', fontSize=8.5, leading=11, textColor=colors.white),
    'code': ParagraphStyle('code', fontName='M', fontSize=7.8, leading=10.2, backColor=FONDO, borderColor=BORDE,
                           borderWidth=0.5, borderPadding=6, spaceBefore=4, spaceAfter=10),
    'nota': ParagraphStyle('nota', fontName='S', fontSize=8.8, leading=12.5, backColor=AMBAR, borderPadding=6,
                           spaceBefore=4, spaceAfter=10, textColor=colors.HexColor('#5A3B00')),
    'small': ParagraphStyle('small', fontName='S', fontSize=8, leading=11, textColor=GRIS),
}
P = lambda t, s='p': Paragraph(t, st[s])
H1 = lambda t: P(t, 'h1')
H2 = lambda t: P(t, 'h2')
def UL(items): return [Paragraph(i, st['li'], bulletText='•') for i in items]
def CODE(t): return Preformatted(t, st['code'])
def NOTA(t): return P(t, 'nota')

def T(filas, anchos, cab=True):
    data = [[Paragraph(str(c), st['th'] if (cab and i == 0) else st['td']) for c in f] for i, f in enumerate(filas)]
    t = Table(data, colWidths=anchos, repeatRows=1 if cab else 0)
    estilo = [('GRID', (0, 0), (-1, -1), 0.4, BORDE), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
              ('LEFTPADDING', (0, 0), (-1, -1), 5), ('RIGHTPADDING', (0, 0), (-1, -1), 5),
              ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 3)]
    if cab:
        estilo += [('BACKGROUND', (0, 0), (-1, 0), VERDE)]
        estilo += [('BACKGROUND', (0, i), (-1, i), FONDO) for i in range(2, len(filas), 2)]
    t.setStyle(TableStyle(estilo))
    return t

class Flujo(Flowable):
    """Diagrama de cajas conectadas por flechas, en filas."""
    def __init__(self, cajas, ancho, alto_caja=1.25 * cm, por_fila=4):
        super().__init__()
        self.cajas, self.ancho, self.hc, self.n = cajas, ancho, alto_caja, por_fila
        self.filas = (len(cajas) + por_fila - 1) // por_fila
        self.height = self.filas * (self.hc + 0.7 * cm)
    def wrap(self, *a): return self.ancho, self.height
    def draw(self):
        c = self.canv
        sep = 0.55 * cm
        w = (self.ancho - sep * (self.n - 1)) / self.n
        pos = []
        for i, (titulo, sub) in enumerate(self.cajas):
            f, k = divmod(i, self.n)
            if f % 2: k = self.n - 1 - k  # serpentina
            x = k * (w + sep)
            y = self.height - (f + 1) * self.hc - f * 0.7 * cm
            pos.append((x, y))
            c.setFillColor(FONDO); c.setStrokeColor(VERDE); c.setLineWidth(0.8)
            c.roundRect(x, y, w, self.hc, 5, fill=1, stroke=1)
            c.setFillColor(VERDE); c.setFont('SB', 8)
            c.drawCentredString(x + w / 2, y + self.hc - 0.45 * cm, titulo)
            c.setFillColor(GRIS); c.setFont('S', 6.8)
            for j, linea in enumerate(sub.split('\n')):
                c.drawCentredString(x + w / 2, y + self.hc - 0.8 * cm - j * 0.28 * cm, linea)
        c.setStrokeColor(LIMA); c.setFillColor(LIMA); c.setLineWidth(1.6)
        for i in range(len(pos) - 1):
            (x1, y1), (x2, y2) = pos[i], pos[i + 1]
            if abs(y1 - y2) < 1:
                if x2 > x1: a, b = (x1 + w, y1 + self.hc / 2), (x2, y2 + self.hc / 2)
                else: a, b = (x1, y1 + self.hc / 2), (x2 + w, y2 + self.hc / 2)
            else:
                a, b = (x1 + w / 2, y1), (x2 + w / 2, y2 + self.hc)
            c.line(*a, *b)
            dx, dy = b[0] - a[0], b[1] - a[1]
            import math
            ang = math.atan2(dy, dx)
            p1 = (b[0] - 5 * math.cos(ang - 0.45), b[1] - 5 * math.sin(ang - 0.45))
            p2 = (b[0] - 5 * math.cos(ang + 0.45), b[1] - 5 * math.sin(ang + 0.45))
            path = c.beginPath(); path.moveTo(*b); path.lineTo(*p1); path.lineTo(*p2); path.close()
            c.drawPath(path, fill=1, stroke=0)

def fondo_pagina(c, doc):
    c.saveState()
    w, h = letter
    c.setFillColor(VERDE); c.rect(0, h - 0.9 * cm, w, 0.9 * cm, fill=1, stroke=0)
    c.setFillColor(LIMA); c.rect(0, h - 0.98 * cm, w, 0.08 * cm, fill=1, stroke=0)
    c.setFillColor(colors.white); c.setFont('SB', 8.5)
    c.drawString(2 * cm, h - 0.6 * cm, 'Ecofest · Logística')
    c.setFont('S', 8.5); c.drawRightString(w - 2 * cm, h - 0.6 * cm, 'Lector de documentos · Documento técnico')
    c.setFillColor(GRIS); c.setFont('S', 7.5)
    c.drawString(2 * cm, 1.2 * cm, 'Versión de la app: commit bac3132 · Octubre de 2026')
    c.drawRightString(w - 2 * cm, 1.2 * cm, f'Página {doc.page}')
    c.restoreState()

def portada(c, doc):
    c.saveState()
    w, h = letter
    c.setFillColor(VERDE); c.rect(0, 0, w, h, fill=1, stroke=0)
    c.setFillColor(LIMA); c.rect(2 * cm, h - 9.4 * cm, 3 * cm, 0.18 * cm, fill=1, stroke=0)
    c.setFillColor(colors.white); c.setFont('SB', 30)
    c.drawString(2 * cm, h - 7 * cm, 'Lector de documentos')
    c.setFont('S', 15)
    c.drawString(2 * cm, h - 8.2 * cm, 'Cómo funciona la lectura con el celular')
    c.setFont('S', 10.5); c.setFillColor(colors.HexColor('#C9D3CD'))
    y = h - 11 * cm
    for linea in ['Cédulas, tarjetas de identidad, cédula de extranjería, PPT,',
                  'licencia de conducción, tarjeta de propiedad, SOAT y técnico-mecánica.',
                  '', 'Documento técnico · Ecofest · Logística',
                  'Repositorio: victorfrancomadera-lab/LOGISTICA_Ecofest · commit bac3132',
                  'Octubre de 2026']:
        c.drawString(2 * cm, y, linea); y -= 0.6 * cm
    c.restoreState()

def construir(salida):
    doc = BaseDocTemplate(salida, pagesize=letter, leftMargin=2 * cm, rightMargin=2 * cm, topMargin=2 * cm, bottomMargin=2 * cm,
                          title='Lector de documentos · Documento técnico', author='Ecofest · Logística',
                          subject='Funcionamiento del lector de códigos de barras y lectura por foto')
    marco = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id='f')
    doc.addPageTemplates([PageTemplate(id='portada', frames=[marco], onPage=portada),
                          PageTemplate(id='normal', frames=[marco], onPage=fondo_pagina)])
    W = doc.width
    s = []
    from reportlab.platypus.doctemplate import NextPageTemplate
    s += [NextPageTemplate('normal'), PageBreak()]

    # 1
    s += [H1('1. Resumen'),
          P('El lector de documentos permite llenar los formularios de la app (firma de alimentación, caja menor, entregas y vehículos) '
            'sin transcribir datos: el celular lee el <b>código de barras o QR</b> del documento y, cuando el código no trae todo, '
            'una <b>foto del frente</b> la interpreta Claude. En todos los casos el operador ve los datos y los confirma antes de usarlos.'),
          T([['Documento', 'Por código de barras / QR', 'Por foto (Claude)', 'Dónde se usa'],
             ['Cédula antigua (amarilla)', 'Sí · PDF417 de posiciones fijas', 'Sí', 'Botón Escanear (formularios con cédula)'],
             ['Cédula nueva (digital)', 'Sí · QR con zona MRZ', 'Sí', 'Botón Escanear'],
             ['Tarjeta de identidad antigua / nueva', 'Sí · mismo formato que la cédula', 'Sí', 'Botón Escanear'],
             ['Cédula de extranjería y PPT', 'Sí · MRZ, texto o enlace', 'Sí', 'Botón Escanear'],
             ['Licencia de conducción', 'Sí · número, categorías, apellidos, nombre', 'Sí', 'Botón Escanear / conductor'],
             ['Tarjeta de propiedad', 'Sí · todos los campos que traiga', 'Sí', 'Vehículos'],
             ['SOAT', 'Sí · placa, póliza, entidad, vigencia', 'Sí', 'Vehículos'],
             ['Revisión técnico-mecánica', 'Sí · placa, certificado, CDA, vigencia', 'Sí', 'Vehículos']],
            [4.3 * cm, 5.3 * cm, 2.4 * cm, 5.4 * cm]),
          Spacer(1, 8),
          P('Las afirmaciones sobre formatos llevan una etiqueta de certeza: <b>[Seguro]</b> verificado con un documento real o con la norma; '
            '<b>[Probable]</b> deducido de evidencia parcial; <b>[Suponiendo]</b> diseño a la espera de una muestra real.')]

    # 2
    s += [H1('2. Arquitectura'),
          P('Son cuatro piezas. La lectura del código ocurre <b>entera en el celular</b>; solo la lectura por foto pasa por el servidor.'),
          T([['Pieza', 'Archivo', 'Qué hace'],
             ['Motor de lectura', 'zxing-wasm 3.1.6 (node_modules, servido en /vendor/zxing)',
              'Decodifica PDF417 y QR desde imágenes. Es ZXing-C++ compilado a WebAssembly: funciona igual en Android y iPhone, sin CDN externo.'],
             ['Lector', 'lector-codigos/lector-codigos-colombia.js (servido en /lector-codigos.js)',
              'Carga el motor, maneja la cámara y la foto, detecta el tipo de documento e interpreta los datos. Independiente de la app: expone el objeto global LectorCodigos.'],
             ['Pantalla', 'public/escaner.js',
              'Interfaz del escáner: video con marco, botones de foto y linterna, pantalla de confirmación editable y unión de código + foto.'],
             ['Lectura por foto', 'server.js · POST /api/leer-documento',
              'Envía la foto a Claude con un esquema JSON estricto y devuelve los campos. La foto no se guarda.']],
            [3.0 * cm, 5.4 * cm, 9.0 * cm]),
          Spacer(1, 10), KeepTogether([H2('Flujo de una lectura'),
          Flujo([('Botón Escanear', 'el operador lo toca\njunto al campo'),
                 ('Cámara trasera', 'getUserMedia\n1920×1080, enfoque continuo'),
                 ('Cuadro cada 250 ms', 'se copia a un canvas\n(ImageData)'),
                 ('zxing-wasm', 'busca PDF417 o QR\ntryHarder + tryRotate'),
                 ('Bytes del código', 'latin1 (binario)\ny UTF-8 (texto)'),
                 ('interpretar()', 'detecta el tipo y\nextrae los campos'),
                 ('Confirmación', 'el operador revisa\ny corrige'),
                 ('Formulario', 'se llenan número,\nnombre y demás')], W)]),
          Spacer(1, 6),
          P('Si la cámara en vivo no está disponible (permiso negado, navegador sin soporte), los botones <b>Foto del código</b> y '
            '<b>Foto del frente</b> hacen la misma lectura sobre una foto tomada con la cámara del sistema.', 'small')]

    # 3
    s += [H1('3. Captura y decodificación'),
          H2('Cámara'),
          UL(['Se pide la cámara trasera (<i>facingMode: environment</i>) a 1920×1080: el PDF417 de la cédula es denso y necesita resolución.',
              'Si el equipo lo permite se activa el <b>enfoque continuo</b> y aparece el botón de <b>linterna</b> (capacidad <i>torch</i>).',
              'Cada 250 ms se toma un cuadro; si el anterior aún se está procesando, se salta. Al encontrar un código válido el celular vibra, '
              'se detiene la cámara y se pasa a confirmación.',
              'La cámara en vivo exige HTTPS (Railway lo da). En HTTP solo funciona la ruta por foto.']),
          H2('Opciones del motor'),
          CODE("{ formats: ['PDF417', 'QRCode'], tryHarder: true, tryRotate: true,\n  tryInvert: false, maxNumberOfSymbols: 1 }"),
          UL(['<b>tryHarder</b>: búsqueda más exhaustiva (más lenta, más tolerante a enfoque y ángulo).',
              '<b>tryRotate</b>: lee el código aunque el documento esté de lado o al revés.',
              'Solo se aceptan resultados con <i>isValid = true</i> (corrección de errores superada).']),
          H2('Dos lecturas de los mismos bytes'),
          P('Cada resultado se decodifica de dos maneras, porque los documentos no usan la misma codificación:'),
          UL(['<b>latin1</b> (byte a byte): para la cédula antigua, cuyo PDF417 es binario con bytes nulos de relleno.',
              '<b>UTF-8</b>: para licencia, tarjeta de propiedad, SOAT y técnico-mecánica, que traen Ñ y tildes. '
              'La licencia trae además la foto del titular en JPEG; se corta en la marca <i>FF D8</i> / <i>JFIF</i> antes de interpretar.'])]

    # 4
    s += [KeepTogether([H1('4. Detección del tipo de documento'),
          P('<i>LectorCodigos.interpretar(resultado, esperado)</i> prueba los intérpretes en este orden y se queda con el primero que reconoce el formato. '
            'Si la pantalla ya sabe qué documento espera (por ejemplo, el botón del SOAT), se salta la detección.'),
          T([['Orden', 'Intérprete', 'Condición para aceptarlo'],
             ['1', 'leerCedulaAntigua', 'Al menos 160 bytes; número en posiciones 48-58 y apellidos/nombres solo con letras.'],
             ['2', 'leerMRZ', 'Tres líneas de 30 caracteres [A-Z0-9&lt;] y la primera empieza por I, A o C + COL.'],
             ['3', 'leerLicencia', 'Empieza con un número de 6-12 dígitos seguido de categorías (A1…C3) y palabras.'],
             ['4', 'leerDocVehiculo (SOAT)', 'El texto contiene SOAT, SEGURO OBLIGATORIO o PÓLIZA.'],
             ['5', 'leerDocVehiculo (técnico-mecánica)', 'El texto contiene TÉCNICO-MECÁNICA, TECNOMECÁNICA, CDA, CENTRO DE DIAGNÓSTICO o RTM.'],
             ['6', 'leerTarjeta', 'Algún campo tiene forma de placa (ABC123 / ABC12D) o de VIN (17 caracteres).'],
             ['7', 'leerGenerico', 'Siempre: extrae lo reconocible por su forma.']],
            [1.6 * cm, 4.6 * cm, 11.2 * cm])]),
          Spacer(1, 6),
          P('Todos los resultados devuelven además <b>campos</b> (la lista de todo lo que trae el código, separado) y <b>crudo</b> '
            '(el texto completo), que la pantalla muestra en "Ver texto del código".')]

    # 5
    s += [H1('5. Formatos por documento'),
          H2('5.1 Cédula antigua y tarjeta de identidad antigua · PDF417 de posiciones fijas'),
          P('[Probable] Registro binario de longitud fija con bytes nulos de relleno. Es el formato que usan los lectores de cédula conocidos; '
            'verificado con un código sintético armado según ese formato, pendiente de una cédula real.'),
          T([['Posición (bytes)', 'Contenido', 'Tratamiento'],
             ['0 - 47', 'Cabecera y código AFIS (incluye "PubDSK_1")', 'Se ignora'],
             ['48 - 57', 'Número de documento (10 dígitos, ceros a la izquierda)', 'Se quitan los ceros'],
             ['58 - 80', 'Primer apellido', 'Se limpia y se pone en tipo título'],
             ['81 - 103', 'Segundo apellido', 'Ídem'],
             ['104 - 126', 'Primer nombre', 'Ídem'],
             ['127 - 149', 'Segundo nombre', 'Ídem'],
             ['150 en adelante', 'Sexo (M/F) + nacimiento AAAAMMDD, municipio, RH', 'Se buscan por patrón: [MF]\\d{8} y (A|B|AB|O)[+-]']],
            [3.0 * cm, 7.4 * cm, 7.0 * cm]),
          NOTA('Tarjeta de identidad: [Suponiendo] usa el mismo formato. Se distingue de la cédula por la edad: si el titular tiene menos de 18 años '
               'según la fecha de nacimiento, se marca como tarjeta de identidad.'),
          H2('5.2 Cédula digital, tarjeta de identidad digital, cédula de extranjería y PPT · zona MRZ'),
          P('[Suponiendo] El QR del reverso trae la zona de lectura mecánica (MRZ) en el formato internacional ICAO 9303 TD1: tres líneas de 30 caracteres. '
            'Si el QR trae otro formato, el lector cae al intérprete genérico y muestra el texto completo.'),
          T([['Línea', 'Posición', 'Contenido'],
             ['1', '0-1 / 2-4', 'Tipo de documento (I, A o C) / país emisor (COL)'],
             ['1', '5-13 / 14', 'Número de la tarjeta / dígito de control'],
             ['1', '15-29', 'Dato opcional: en documentos de colombianos, el NUIP (número de cédula o TI)'],
             ['2', '0-5 / 6', 'Nacimiento AAMMDD / dígito de control'],
             ['2', '7', 'Sexo (M, F)'],
             ['2', '8-13 / 14', 'Vencimiento AAMMDD / dígito de control'],
             ['2', '15-17', 'Nacionalidad (COL, VEN…)'],
             ['3', '0-29', 'APELLIDOS&lt;&lt;NOMBRES, con &lt; como espacio']],
            [1.4 * cm, 3.0 * cm, 13.0 * cm]),
          Spacer(1, 6),
          P('<b>Dígitos de control.</b> Cada carácter vale su número (0-9), su posición en el alfabeto + 9 (A=10 … Z=35) o 0 si es &lt;. '
            'Se multiplica por los pesos 7, 3, 1 repetidos, se suma y el resultado módulo 10 debe coincidir con el dígito impreso. '
            'Se verifican número, nacimiento y vencimiento; si alguno falla, la pantalla avisa que puede haber un carácter mal leído.'),
          P('<b>Tipo de documento.</b> Nacionalidad distinta de COL: cédula de extranjería, o PPT si el código contiene "PPT" o "PROTECCIÓN". '
            'Nacionalidad COL: tarjeta de identidad digital si es menor de 18 años; si no, cédula digital. '
            'Para colombianos el número de documento se toma del dato opcional (NUIP); para extranjeros, del número principal.'),
          P('<b>Años de dos dígitos.</b> En el nacimiento, un año mayor que el actual se interpreta como 19xx; en el vencimiento siempre 20xx.'),
          H2('5.3 Licencia de conducción · RUNT'),
          P('[Seguro] Verificado con una licencia real expedida en Barranquilla. Estructura:'),
          CODE('0001140861508B1 A2 C FRANCO MADERA VICTOR 2 ÿØÿà…JFIF… (foto)\n'
               '└─ número ──┘└categ┘   └ apellidos ┘└nombre┘  └ foto del titular en JPEG\n\n'
               'Expresión: ^0*(\\d{6,12})\\s*((?:[ABC][1-3]\\s*)+)(.*)$'),
          UL(['Se quitan los ceros iniciales del número (0001140861508 → 1140861508).',
              'De las palabras restantes, las dos primeras son apellidos y el resto, nombres.',
              '[Seguro] El código <b>no</b> trae segundo nombre, nacimiento, RH, expedición ni organismo de tránsito: están solo impresos en el frente. '
              'Para obtenerlos se usa <b>Completar con foto del frente</b> (sección 6).']),
          H2('5.4 Tarjeta de propiedad (licencia de tránsito)'),
          P('[Suponiendo] Formato no documentado. Se separan todos los campos (por bytes de control, |, ; o, si hay menos de tres, por comas y espacios dobles) '
            'y a cada uno se le pone nombre por su forma:'),
          T([['Etiqueta', 'Regla'],
             ['Placa', '3 letras + 3 dígitos (carro) o 3 letras + 2 dígitos + letra (moto)'],
             ['VIN / chasis', '17 caracteres sin I, O ni Q, con letras y números'],
             ['Modelo (año)', 'Número entre 1950 y 2049'],
             ['Fecha', 'AAAAMMDD, AAAA-MM-DD o DD/MM/AAAA válida'],
             ['Servicio, clase, combustible, carrocería, marca, color', 'Lista de valores conocidos (PARTICULAR, MICROBÚS, DIÉSEL, HYUNDAI, BLANCO…)'],
             ['Aseguradora', 'Lista de aseguradoras del SOAT'],
             ['Nombre (¿propietario?)', 'Dos o más palabras solo con letras, al menos 8 caracteres (incluye S.A.S., LTDA)'],
             ['Documento (¿propietario?)', 'Número de 6-12 dígitos que viene justo después del nombre'],
             ['Número corto / Número', '3-5 dígitos (cilindraje, capacidad) / 6-12 dígitos (documento, licencia de tránsito)'],
             ['Dato N', 'No se reconoció: se muestra para compararlo con la tarjeta']],
            [5.4 * cm, 12.0 * cm]),
          H2('5.5 SOAT y revisión técnico-mecánica'),
          P('[Suponiendo] El formato cambia según la aseguradora o el CDA. El intérprete busca en todo el texto y en los campos:'),
          UL(['<b>Placa</b> con la misma regla de la tarjeta de propiedad.',
              '<b>Número</b> de póliza o certificado: la cifra más larga (6-20 dígitos) que no sea una fecha.',
              '<b>Entidad</b>: aseguradora conocida (SURA, Mapfre, Previsora, Bolívar, Allianz, AXA Colpatria, Mundial, Solidaria, Equidad, HDI, Liberty, Estado, Positiva…) '
              'o el texto que empieza por "CDA".',
              '<b>Vigencia</b>: la fecha más temprana es "desde" y la más tardía, "vence".',
              'Si el QR es un enlace de verificación, se extraen también los parámetros de la dirección.']),
          H2('5.6 Códigos genéricos y enlaces de verificación'),
          P('Cuando ningún intérprete reconoce el formato: tipo por palabras clave (PPT, EXTRANJERÍA, TARJETA DE IDENTIDAD, LICENCIA), primer número de 6-10 dígitos '
            'que no sea fecha como documento, campos solo con letras como nombre, y fechas ordenadas. Si el código es un enlace (por ejemplo, de verificación de Migración), '
            'el nombre de cada parámetro decide qué es: <i>venc/hasta</i> → vencimiento, <i>nac</i> → nacimiento, <i>doc/num/id</i> → documento, <i>nom</i> → nombre.')]

    # 6
    s += [PageBreak(), H1('6. Lectura por foto con Claude'),
          P('Para lo que el código no trae (segundo nombre y fechas de la licencia, documentos sin código legible, SOAT impreso sin QR) '
            'la app envía una foto del documento al servidor, que la pasa a Claude.'),
          H2('Recorrido'),
          UL(['El celular reduce la foto a 1600 px por el lado mayor y la convierte a JPEG 85 % (cerca de 300 KB).',
              'POST <b>/api/leer-documento</b> con <i>{ clase, imagen }</i>. Requiere sesión iniciada.',
              'El servidor llama a la API de Anthropic con el SDK oficial: modelo <b>claude-opus-5-5</b>, esfuerzo bajo, '
              'salida forzada a un <b>esquema JSON</b> (structured outputs) y reintento automático con otro modelo si el primero se niega (fallbacks: "default").',
              'Se valida la respuesta: si el documento no es legible se responde 422 con instrucciones para repetir la foto.',
              'La foto no se escribe en disco ni en la base de datos.']),
          T([['clase', 'Documento', 'Campos devueltos'],
             ['persona', 'Cédula, TI, extranjería, PPT, licencia', 'tipo, número, nombres, apellidos, sexo, nacimiento, RH, expedición, vence, categorías, organismo, nacionalidad'],
             ['vehiculo', 'Tarjeta de propiedad', 'placa, marca, línea, modelo, color, clase, servicio, capacidad, propietario, documento del propietario, N.º de licencia de tránsito'],
             ['soat', 'SOAT', 'placa, número de póliza, aseguradora, desde, vence'],
             ['tecnomecanica', 'Técnico-mecánica', 'placa, número de certificado, CDA, desde, vence']],
            [2.4 * cm, 4.6 * cm, 10.4 * cm]),
          Spacer(1, 6),
          H2('Unión de código y foto'),
          P('Con <b>Completar con foto del frente</b>, el resultado del código se combina con el de la foto: del código se conservan número y categorías; '
            'de la foto se toman nombres, apellidos y los datos que el código no trae. Si los dos números no coinciden, la pantalla lo advierte.'),
          H2('Configuración y costo'),
          UL(['Variable <b>ANTHROPIC_API_KEY</b> en Railway. Sin ella el botón responde que falta configurarla y el resto de la app sigue igual.',
              '/healthz muestra <i>lectura_fotos: true</i> cuando está configurada.',
              '[Probable] Costo cercano a 1 centavo de dólar por foto.'])]

    # 7
    s += [H1('7. Qué se guarda y qué alertas genera'),
          T([['Formulario', 'Campos que llena el lector'],
             ['Firma de alimentación', 'Cédula; en grupos, también quién recibe'],
             ['Caja menor', 'Cédula y nombre completo'],
             ['Nueva entrega', 'Cédula; el nombre solo si está vacío'],
             ['Vehículo · conductor', 'Cédula, nombre y licencia (categorías, vigencia, expedición)'],
             ['Vehículo · tarjeta de propiedad', 'Placa, puestos, tipo/marca, color, modelo, servicio, propietario, documento del propietario, N.º licencia de tránsito; '
              'opcionalmente todos los datos del código en Notas'],
             ['Vehículo · SOAT y técnico-mecánica', 'Número, aseguradora o CDA y vencimiento (columnas soat_* y rtm_*)']],
            [5.0 * cm, 12.4 * cm]),
          Spacer(1, 6),
          UL(['Lista de vehículos: SOAT y técnico-mecánica en rojo si están vencidos, amarillo si vencen en 30 días o menos, verde si están vigentes.',
              'Al asignar un vehículo a un traslado, la lista de placas marca con ⚠ los que tienen algún documento vencido.',
              'Si un SOAT o técnico-mecánica leído es de otra placa, se avisa antes de guardar.'])]

    # 8
    s += [H1('8. Seguridad y privacidad'),
          UL(['La lectura del código ocurre en el celular: los datos del código solo viajan al servidor cuando se guarda el formulario.',
              'El motor de lectura se sirve desde la propia app; no depende de CDN ni de terceros.',
              'La lectura por foto exige sesión y la foto no se almacena. Va a la API de Anthropic, uso permitido por la política de datos de la organización.',
              'Ningún dato se llena sin pasar por la pantalla de confirmación, donde el operador puede corregirlo.'])]

    # 9
    s += [H1('9. Uso del lector fuera de la app'),
          P('El archivo <i>lector-codigos-colombia.js</i> no depende de la app. Requiere los dos archivos de zxing-wasm 3.1.6 '
            '(<i>dist/iife/reader/index.js</i> y <i>dist/reader/zxing_reader.wasm</i>).'),
          CODE("<script src=\"lector-codigos-colombia.js\"></script>\n"
               "LectorCodigos.configurar({ script: '/vendor/zxing/reader.js',\n"
               "                          wasm: '/vendor/zxing/zxing_reader.wasm' });\n\n"
               "// Cámara en vivo\n"
               "const camara = await LectorCodigos.iniciarCamara(video, (datos) => {\n"
               "  camara.detener();\n"
               "  console.log(datos);  // { tipo, documento, nombres, apellidos, ..., campos, crudo }\n"
               "});\n\n"
               "// Desde una foto; esperado: 'cedula' | 'licencia' | 'tarjeta' | 'soat' | 'tecnomecanica'\n"
               "const datos = await LectorCodigos.leerFoto(archivo, { esperado: 'soat' });"),
          T([['Función', 'Devuelve'],
             ['configurar({ script, wasm })', 'Rutas del motor zxing-wasm'],
             ['iniciarCamara(video, alLeer, { esperado })', '{ detener(), linterna(), tieneLinterna }'],
             ['leerFoto(archivo, { esperado })', 'Datos interpretados o null'],
             ['leerCodigo(imagen)', 'Resultado crudo de zxing-wasm o null'],
             ['interpretar(resultado, esperado)', 'Datos interpretados'],
             ['leerCedulaAntigua, leerMRZ, leerLicencia, leerTarjeta, leerDocVehiculo, leerGenerico', 'Intérpretes sueltos, para texto ya leído']],
            [8.4 * cm, 9.0 * cm])]

    # 10
    s += [KeepTogether([H1('10. Pruebas y estado de cada formato'),
          T([['Documento', 'Probado con', 'Estado'],
             ['Licencia de conducción', 'Texto del código de una licencia real', '[Seguro] Número, categorías, apellidos y nombre'],
             ['Cédula antigua', 'PDF417 generado según el formato de posiciones fijas', '[Probable] Falta una cédula real'],
             ['Cédula digital y TI digital', 'QR con MRZ generado, con dígitos de control', '[Suponiendo] Falta confirmar que el QR real trae MRZ'],
             ['Extranjería y PPT', 'QR con MRZ (VEN) y enlace de verificación generados', '[Suponiendo] Falta muestra real'],
             ['Tarjeta de propiedad', 'PDF417 generado con 14 campos', '[Suponiendo] Falta muestra real'],
             ['SOAT y técnico-mecánica', 'QR generados', '[Suponiendo] Varía por aseguradora o CDA'],
             ['Lectura por foto', 'Respuesta de Claude simulada', 'Pendiente de configurar ANTHROPIC_API_KEY']],
            [4.4 * cm, 6.4 * cm, 6.6 * cm])]),
          Spacer(1, 6),
          P('Las pruebas se hicieron en Chromium (Playwright) con cámara simulada y con fotos: lectura en vivo, lectura desde foto, '
            'llenado de cada formulario y avisos de vencimiento.'),
          H2('Cómo ajustar un formato nuevo'),
          UL(['Escanear el documento real y copiar el texto de "Ver texto del código" (se pueden tapar los datos personales).',
              'Identificar la posición o el separador de cada dato.',
              'Escribir o ajustar el intérprete en <i>lector-codigos-colombia.js</i> y ponerlo en el orden de detección (sección 4).',
              'Probar con el texto real y con los códigos sintéticos para no romper los demás formatos.'])]

    plano = []
    for x in s: plano.extend(x if isinstance(x, list) else [x])
    doc.build(plano)

construir(sys.argv[1])
