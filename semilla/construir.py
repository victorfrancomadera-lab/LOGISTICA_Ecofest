# Construye semilla/planilla_ecofest.json a partir de las planillas de Excel (transcritas a mano y auditadas).
import json, collections
F = {'VIERNES': '2026-10-23', 'SABADO': '2026-10-24', 'DOMINGO': '2026-10-25'}
DIA = {'2026-10-23': 'Viernes 23', '2026-10-24': 'Sábado 24', '2026-10-25': 'Domingo 25'}
# Personas con nombre: (nombre, grupo). Grupos: (nombre_grupo, cantidad)
P = lambda n, g='Equipo Ecofest': ('p', n, g)
G = lambda g, c: ('g', g, c)
COND = ('p', 'Conductor (por definir)', 'Conductores')

# (fecha, ubicación, comida, lista, total_escrito_en_planilla) — PLANILLA_ALIMENTOS_ECOFEST.xlsx v2 (23 de octubre)
ENTREGAS_VERSION = 2
CONDS = lambda n: G('Conductores (por definir)', n)
SO = lambda n: G('Equipo Sebastián Ospina', n)
R = [
 ('VIERNES','Plaza de la Paz','am',[G('Creativos',7),G('CUC',13),G('Gobernación',10),P('Kiki'),P('Ángela'),CONDS(1),SO(10),P('Juan Pablo'),P('Emanuel')],45),
 ('VIERNES','Plaza de la Paz','alm',[G('CUC',13),G('Gobernación',10),P('Kiki'),P('Pamela'),P('Ángela'),P('Maleja'),CONDS(1),SO(10),P('Juan Pablo'),P('Daniela'),P('Víctor Franco'),P('Emanuel')],42),
 ('VIERNES','Plaza de la Paz','pm',[G('CUC',13),G('Gobernación',10),P('Kiki'),P('Pamela'),P('Ángela'),P('Maleja'),CONDS(1),SO(10),P('Juan Pablo'),P('Daniela'),P('Emanuel')],41),
 ('VIERNES','Bosque Urbano Miramar (6:00 a. m.)','am',[G('Chavelita',2),P('Javier Fernández'),P('Julio','Conductores')],4),
 ('SABADO','Plaza de la Paz','am',[G('Gobernación',5),P('Claudia'),P('Liseth'),P('José Viaña'),P('Kiki'),P('Pamela'),P('Ángela'),P('Maleja'),G('Contabilidad',6),CONDS(2),SO(10),P('Juan Pablo'),P('Daniela'),P('Emanuel')],33),
 ('SABADO','Plaza de la Paz','alm',[G('INUBAC',2),G('Gobernación',7),P('Emanuel'),CONDS(2),P('Claudia'),P('Liseth'),P('José Viaña'),P('Kiki'),P('Pamela'),P('Ángela'),P('Maleja'),G('Contabilidad',5),SO(10),P('Juan Pablo'),P('Daniela')],36),
 ('SABADO','Plaza de la Paz','pm',[G('INUBAC',2),G('Gobernación',6),P('Emanuel'),CONDS(1),P('Claudia'),P('Liseth'),P('José Viaña'),P('Kiki'),P('Pamela'),P('Ángela'),P('Maleja'),G('Contabilidad',5),SO(1),P('Juan Pablo'),P('Daniela')],23),
 ('SABADO','Ecoparque Ciénaga de Mallorquín','am',[G('Gobernación',2),CONDS(2),G('Chavelita',3)],7),
 ('DOMINGO','Plaza de la Paz (stand logística)','am',[G('INUBAC',2),G('Gobernación',7),P('Víctor Franco'),P('José Viaña'),P('Kiki'),P('Pamela'),P('Ángela'),P('Maleja'),CONDS(2),SO(10),P('Juan Pablo'),P('Daniela'),G('Contabilidad',6)],35),
 ('DOMINGO','Plaza de la Paz (stand logística)','alm',[G('INUBAC',2),G('Gobernación',9),P('José Viaña'),P('Kiki'),P('Pamela'),P('Ángela'),P('Maleja'),CONDS(2),SO(10),P('Juan Pablo'),P('Daniela'),G('Contabilidad',5),P('Emanuel')],36),
 ('DOMINGO','Plaza de la Paz (stand logística)','pm',[G('INUBAC',2),G('Gobernación',9),P('José Viaña'),P('Kiki'),P('Pamela'),P('Ángela'),P('Maleja'),CONDS(2),SO(10),P('Juan Pablo'),P('Daniela'),G('Contabilidad',6),P('Emanuel')],37),
 ('DOMINGO','Plaza de la Paz (Social Plogging)','am',[G('Chavelita',2),P('Juan','Gobernación'),P('Marcela','Gobernación'),P('Emanuel'),CONDS(1)],7),
]
# Lugares donde las meriendas no se pagan en efectivo (las cubre Fabián)
A_CARGO_FABIAN = ['Viernes: Cámara de Comercio (agenda académica)', 'Domingo: Punta Roca']
COMIDA = {'am': 'Merienda AM', 'alm': 'Almuerzo', 'pm': 'Merienda PM'}
filas = collections.OrderedDict(); conteos = []
for dia, ubic, com, lista, escrito in R:
    fecha = F[dia]; n = 0
    for t, a, b in lista:
        if t == 'p': nombre, grupo, cant, es_grupo = a, b, 1, False
        else: nombre, grupo, cant, es_grupo = f'{a} ({b})', a, b, True
        if es_grupo:
            nombre = a
        k = (fecha, ubic, nombre)
        f = filas.setdefault(k, {'fecha': fecha, 'ubicacion': ubic, 'beneficiario': nombre, 'grupo': grupo,
                                  'es_grupo': es_grupo, 'merienda_am': 0, 'almuerzo': 0, 'merienda_pm': 0})
        f[{'am': 'merienda_am', 'alm': 'almuerzo', 'pm': 'merienda_pm'}[com]] = cant
        n += cant
    conteos.append({'fecha': fecha, 'dia': DIA[fecha], 'ubicacion': ubic, 'comida': COMIDA[com], 'contados': n, 'escrito': escrito})

# Observaciones por fila
obs = collections.defaultdict(list)
for k, f in filas.items():
    n = max(f['merienda_am'], f['almuerzo'], f['merienda_pm'])
    if f['beneficiario'].startswith('Conductores (por definir)'): obs[k].append('La planilla dice solo "conductor": falta el nombre de quien recibe')
    elif f['beneficiario'] == 'Equipo Sebastián Ospina': obs[k].append(f'Equipo de {n}: confirmar si Sebastián Ospina recibe y firma por todos')
    elif f['es_grupo']: obs[k].append(f"Grupo sin nombres: falta definir quién recibe y firma por las {n} personas")
    if f['beneficiario'] == 'Equipo Sebastián Ospina' and f['fecha'] == '2026-10-24' and f['merienda_pm'] == 1:
        obs[k].append('Sábado PM la planilla dice "Sebastián Ospina" sin el 10: ¿es 1 o son 10?')
# misma persona en dos lugares la misma mañana
porpersona = collections.defaultdict(list)
for k, f in filas.items():
    if not f['es_grupo'] and f['merienda_am'] and 'por definir' not in f['beneficiario']:
        porpersona[(f['fecha'], f['beneficiario'])].append(k)
for (fecha, nom), ks in porpersona.items():
    if len(ks) > 1:
        lugares = ' y '.join(filas[k]['ubicacion'] for k in ks)
        for k in ks: obs[k].append(f'Tiene merienda AM en dos lugares el mismo día ({lugares}): confirmar dónde se le entrega')
for k, f in filas.items(): f['observacion'] = ' · '.join(obs[k]) or None

# Transporte v2: planilla TRANSPORTE_PERSONAL.xlsx (22 de octubre). HORA se toma como hora de recogida/salida.
JUE = '2026-10-22'
TRANSPORTE_VERSION = 2
transporte = [
 {'actividad': 'Estructuras para Ecofest', 'fecha': JUE, 'hora': '07:00', 'destino': 'Las Nieves', 'tipo': 'carga',
  'personal_planilla': '', 'recogida_planilla': '', 'paradas': [],
  'cruce': 'Traslado de carga: la planilla no dice desde dónde salen las estructuras ni quién las acompaña.'},
 {'actividad': 'Felipe Restrepo', 'fecha': F['VIERNES'], 'hora': '06:00', 'destino': 'Cámara de Comercio', 'tipo': 'personal',
  'personal_planilla': 'Felipe Posada', 'recogida_planilla': 'Aeropuerto', 'paradas': [('Aeropuerto', 'Felipe Posada')],
  'cruce': 'La actividad dice "Felipe Restrepo" y el personal "Felipe Posada": confirmar el nombre y el número de vuelo.'},
 {'actividad': 'Material para siembra', 'fecha': F['VIERNES'], 'hora': '17:00', 'destino': 'Invernadero Jardín Botánico', 'tipo': 'carga',
  'personal_planilla': '', 'recogida_planilla': '', 'paradas': [],
  'cruce': 'Traslado de carga: la planilla no dice desde dónde sale el material.'},
 {'actividad': 'Bosques de Miramar', 'fecha': F['SABADO'], 'hora': '05:20', 'destino': 'Miramar', 'tipo': 'personal',
  'personal_planilla': '2 personas Chavelita', 'recogida_planilla': 'Edificio Amore Mallorquín',
  'paradas': [('Edificio Amore Mallorquín', 'Chavelita (2 personas)')],
  'cruce': 'Cambió de día: antes era viernes. La planilla de alimentos sigue con Bosque Urbano Miramar el viernes 6:00 a. m. (3 de Chavelita, Javier Fernández y Julio).'},
 {'actividad': 'Yoga (Miramar)', 'fecha': F['SABADO'], 'hora': '06:30', 'destino': 'Miramar', 'tipo': 'personal',
  'personal_planilla': '2 personas Chavelita', 'recogida_planilla': 'Edificio Amore Mallorquín, Montecristo, San Pacho',
  'paradas': [('Edificio Amore Mallorquín', 'Chavelita (2 personas)'), ('Montecristo', '¿quién?'), ('San Pacho', '¿quién?')],
  'cruce': 'Hay dos filas de Yoga el sábado. Esta va a Miramar a las 6:30 y lista Montecristo y San Pacho sin persona: parece repetida de la otra fila. Confirmar.'},
 {'actividad': 'Yoga (Mallorquín)', 'fecha': F['SABADO'], 'hora': '06:00', 'destino': 'Ciénaga de Mallorquín', 'tipo': 'personal',
  'personal_planilla': 'Jessica, Marcela, Juan', 'recogida_planilla': 'Montecristo, San Pacho',
  'paradas': [('Montecristo', 'Jessica'), ('San Pacho', 'Marcela y Juan')],
  'cruce': 'Juan no tiene lugar propio: quedó con Marcela en San Pacho. Confirmar.'},
 {'actividad': 'Social Plogging', 'fecha': F['DOMINGO'], 'hora': '05:00', 'destino': 'Plaza de la Paz', 'tipo': 'personal',
  'personal_planilla': '2 personas Chavelita, Marcela, Juan', 'recogida_planilla': 'Edificio Amore Mallorquín, San Pacho',
  'paradas': [('Edificio Amore Mallorquín', 'Chavelita (2 personas)'), ('San Pacho', 'Marcela y Juan')],
  'cruce': 'Misma hora (5:00 a. m.) que Limpieza de playa: se necesitan dos vehículos.'},
 {'actividad': 'Limpieza de playa', 'fecha': F['DOMINGO'], 'hora': '05:00', 'destino': 'Punta Roca', 'tipo': 'personal',
  'personal_planilla': 'Jessica, Sebastián', 'recogida_planilla': 'Montecristo, Villa Carolina',
  'paradas': [('Montecristo', 'Jessica'), ('Villa Carolina', 'Sebastián')],
  'cruce': 'Misma hora (5:00 a. m.) que Social Plogging: se necesitan dos vehículos. En alimentos figuran además Gabriel, Pamela y Javier Fernández en Punta Roca, sin recogida.'},
]
json.dump({'entregas': list(filas.values()), 'conteos': conteos, 'transporte': transporte, 'transporte_version': TRANSPORTE_VERSION,
           'entregas_version': ENTREGAS_VERSION, 'a_cargo_fabian': A_CARGO_FABIAN, 'dias': DIA},
          open(__file__.replace('construir.py', 'planilla_ecofest.json'), 'w'), ensure_ascii=False, indent=1)
print(len(filas), 'filas de entrega')
for c in conteos: print(c['dia'], c['ubicacion'], c['comida'], c['contados'], c['escrito'], '' if c['escrito'] in (None, c['contados']) else '  <-- NO CUADRA')
tot = collections.Counter()
for f in filas.values():
    for k in ('merienda_am','almuerzo','merienda_pm'): tot[(f['fecha'],k)] += f[k]
print(dict(tot))
for f in filas.values():
    if f['observacion']: print('*', f['fecha'], f['beneficiario'], '|', f['observacion'])
