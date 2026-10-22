# Construye semilla/planilla_ecofest.json a partir de las planillas de Excel (transcritas a mano y auditadas).
import json, collections
F = {'VIERNES': '2026-10-23', 'SABADO': '2026-10-24', 'DOMINGO': '2026-10-25'}
DIA = {'2026-10-23': 'Viernes 23', '2026-10-24': 'Sábado 24', '2026-10-25': 'Domingo 25'}
# Personas con nombre: (nombre, grupo). Grupos: (nombre_grupo, cantidad)
P = lambda n, g='Equipo Ecofest': ('p', n, g)
G = lambda g, c: ('g', g, c)
COND = ('p', 'Conductor (por definir)', 'Conductores')

# (fecha, ubicación, comida, lista, total_escrito_en_planilla)
R = [
 ('VIERNES','Plaza de la Paz','am',[G('CUC',8),G('Gobernación',9),P('Kiki'),P('Ángela'),COND,P('Sebastián Ospina'),P('Juan Pablo'),P('Emanuel')],23),
 ('VIERNES','Plaza de la Paz','alm',[G('CUC',8),G('Gobernación',9),P('Kiki'),P('Pamela'),P('Ángela'),P('Maleja'),COND,P('Sebastián Ospina'),P('Juan Pablo'),P('Daniela'),P('Víctor Franco'),P('Emanuel')],27),
 ('VIERNES','Plaza de la Paz','pm',[G('CUC',8),G('Gobernación',9),P('Kiki'),P('Pamela'),P('Ángela'),P('Maleja'),COND,P('Sebastián Ospina'),P('Juan Pablo'),P('Daniela'),P('Emanuel')],27),
 ('VIERNES','Bosque Urbano Miramar (6:00 a. m.)','am',[G('Chavelita',3),P('Javier Fernández'),P('Julio','Conductores')],None),
 ('VIERNES','Parque Productivo Las Gardenias','am',[P('Beatriz'),P('Emanuel'),COND],3),
 ('VIERNES','Cámara de Comercio (agenda académica)','am',[G('Asistentes agenda académica',180),P('Beatriz'),P('Maleja'),P('Pamela'),P('Daniela')],184),
 ('SABADO','Plaza de la Paz','am',[P('Kendris'),G('Gobernación',5),P('Claudia'),P('Liseth'),P('José Viaña'),P('Kiki'),P('Pamela'),P('Ángela'),P('Maleja'),G('Contabilidad',5),COND,P('Sebastián Ospina'),P('Juan Pablo'),P('Daniela'),P('Emanuel')],23),
 ('SABADO','Plaza de la Paz','alm',[P('Beatriz'),G('Gobernación',7),P('Emanuel'),COND,P('Claudia'),P('Liseth'),P('José Viaña'),P('Kiki'),P('Pamela'),P('Ángela'),P('Maleja'),G('Contabilidad',5),P('Junior'),P('Emanuel (conductor)','Conductores'),P('Sebastián Ospina'),P('Juan Pablo'),P('Daniela')],27),
 ('SABADO','Plaza de la Paz','pm',[P('Beatriz'),G('Gobernación',6),P('Emanuel'),COND,P('Claudia'),P('Liseth'),P('José Viaña'),P('Kiki'),P('Pamela'),P('Ángela'),P('Maleja'),G('Contabilidad',5),P('Sebastián Ospina'),P('Juan Pablo'),P('Daniela')],23),
 ('SABADO','Ecoparque Ciénaga de Mallorquín','am',[P('Marcela','Gobernación'),P('Jessica','Gobernación'),P('Julio','Conductores'),G('Chavelita',3)],6),
 ('DOMINGO','Plaza de la Paz (stand logística)','am',[P('Beatriz'),P('Kendris'),G('Gobernación',7),P('Víctor Franco'),P('José Viaña'),P('Kiki'),P('Pamela'),P('Ángela'),P('Maleja'),COND,P('Sebastián Ospina'),P('Juan Pablo'),P('Daniela'),G('Contabilidad',5)],24),
 ('DOMINGO','Plaza de la Paz (stand logística)','alm',[P('Beatriz'),G('Gobernación',9),P('José Viaña'),P('Kiki'),P('Pamela'),P('Ángela'),P('Maleja'),COND,P('Sebastián Ospina'),P('Juan Pablo'),P('Daniela'),G('Contabilidad',5),P('Emanuel')],24),
 ('DOMINGO','Plaza de la Paz (stand logística)','pm',[P('Beatriz'),G('Gobernación',9),P('Kendris'),P('José Viaña'),P('Kiki'),P('Pamela'),P('Ángela'),P('Maleja'),COND,P('Sebastián Ospina'),P('Juan Pablo'),P('Daniela'),G('Contabilidad',5),P('Emanuel')],26),
 ('DOMINGO','Plaza de la Paz (Social Plogging)','am',[G('Chavelita',3),P('Juan','Gobernación'),P('Marcela','Gobernación'),P('Emanuel'),COND],7),
 ('DOMINGO','Punta Roca','am',[P('Sebastián','Gobernación'),P('Jessica','Gobernación'),P('Gabriel','Gobernación'),COND,P('Pamela'),P('Javier Fernández')],6),
]
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
    if f['beneficiario'].startswith('Conductor (por definir)'): obs[k].append('La planilla dice solo "conductor": falta el nombre')
    if f['es_grupo']: obs[k].append(f"Grupo sin nombres: falta definir quién recibe y firma por las {max(f['merienda_am'],f['almuerzo'],f['merienda_pm'])} personas")
    if f['beneficiario'] == 'Asistentes agenda académica': obs[k].append('180 meriendas: confirmar si es catering contratado y no efectivo')
    if f['beneficiario'] == 'Emanuel (conductor)': obs[k].append('Aparece "Emanuel" y "Emanuel conductor" en el mismo almuerzo: ¿es la misma persona?')
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

transporte = [
 {'actividad': 'Bosques de Miramar', 'fecha': F['VIERNES'], 'destino': 'Bosque Urbano Miramar', 'hora_actividad': '06:00',
  'personal_planilla': '2 personas Chavelita', 'recogida_planilla': 'Edificio Mallorquín',
  'paradas': [('Edificio Mallorquín', 'Chavelita (2 personas)')],
  'conductor_planilla': 'Julio (según planilla de alimentos)',
  'cruce': 'En alimentos figuran 3 de Chavelita + Javier Fernández + Julio (conductor). Transporte dice 2 de Chavelita. Javier Fernández no tiene recogida.'},
 {'actividad': 'Yoga', 'fecha': F['SABADO'], 'destino': 'Ecoparque Ciénaga de Mallorquín', 'hora_actividad': None,
  'personal_planilla': '2 personas Chavelita, Jessica, Marcela', 'recogida_planilla': 'Edificio Mallorquín, Montecristo, San Pacho',
  'paradas': [('Edificio Mallorquín', 'Chavelita (2 personas)'), ('Montecristo', 'Jessica'), ('San Pacho', 'Marcela')],
  'conductor_planilla': 'Julio (según planilla de alimentos)',
  'cruce': 'En alimentos figuran 3 de Chavelita. Transporte dice 2.'},
 {'actividad': 'Social Plogging', 'fecha': F['DOMINGO'], 'destino': 'Plaza de la Paz', 'hora_actividad': None,
  'personal_planilla': '2 personas Chavelita, Marcela, Juan', 'recogida_planilla': 'Edificio Mallorquín, San Pacho',
  'paradas': [('Edificio Mallorquín', 'Chavelita (2 personas)'), ('San Pacho', 'Marcela'), ('¿?', 'Juan (sin lugar de recogida)')],
  'conductor_planilla': 'Por definir',
  'cruce': 'En alimentos figuran 3 de Chavelita + Juan + Marcela + Emanuel + conductor. Juan no tiene lugar de recogida.'},
 {'actividad': 'Limpieza de playa', 'fecha': F['DOMINGO'], 'destino': 'Punta Roca', 'hora_actividad': None,
  'personal_planilla': 'Jessica, Sebastián', 'recogida_planilla': 'Montecristo, Villa Carolina',
  'paradas': [('Montecristo', 'Jessica'), ('Villa Carolina', 'Sebastián')],
  'conductor_planilla': 'Por definir',
  'cruce': 'En alimentos figuran además Gabriel (Gobernación), Pamela y Javier Fernández, sin recogida asignada.'},
]
json.dump({'entregas': list(filas.values()), 'conteos': conteos, 'transporte': transporte, 'dias': DIA},
          open(__file__.replace('construir.py', 'planilla_ecofest.json'), 'w'), ensure_ascii=False, indent=1)
print(len(filas), 'filas de entrega')
for c in conteos: print(c['dia'], c['ubicacion'], c['comida'], c['contados'], c['escrito'], '' if c['escrito'] in (None, c['contados']) else '  <-- NO CUADRA')
tot = collections.Counter()
for f in filas.values():
    for k in ('merienda_am','almuerzo','merienda_pm'): tot[(f['fecha'],k)] += f[k]
print(dict(tot))
for f in filas.values():
    if f['observacion']: print('*', f['fecha'], f['beneficiario'], '|', f['observacion'])
