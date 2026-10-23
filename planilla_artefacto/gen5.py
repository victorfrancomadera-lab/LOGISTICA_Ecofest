# Genera la página de la planilla (v5: datos en la base del artefacto) y los archivos de carga inicial.
import json, base64, io, os, sys
from PIL import Image
AQUI = os.path.dirname(os.path.abspath(__file__)); SALIDA = sys.argv[1]
REPO = '/home/user/LOGISTICA_Ecofest'
d = json.load(open(REPO + '/semilla/planilla_ecofest.json'))
im = Image.open(REPO + '/public/logo.jpg'); im.thumbnail((520, 200)); b = io.BytesIO(); im.save(b, 'JPEG', quality=80)
LOGO = 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()
DIAS = d['dias']

# ---------- carga inicial (se escribe una sola vez en la base con ArtifactData) ----------
sem = os.path.join(SALIDA, 'semilla'); os.makedirs(sem, exist_ok=True)
personas = {}
for i, f in enumerate(d['entregas']):
    personas[f"{f['fecha']}-p{i+1:03d}"] = {
        'fecha': f['fecha'], 'lugar': f['ubicacion'], 'nombre': f['beneficiario'], 'grupo': f['grupo'], 'es_grupo': f['es_grupo'],
        'am': f['merienda_am'], 'al': f['almuerzo'], 'pm': f['merienda_pm'], 'obs': f['observacion'] or '',
        'tarifa': 'completo' if f['almuerzo'] else 'medio-dia', 'orden': i}
rutas = {}
for i, r in enumerate(d['transporte']):
    rutas[f'r{i+1}'] = {'fecha': r['fecha'], 'actividad': r['actividad'], 'destino': r['destino'], 'hora_actividad': '',
        'paradas': [{'lugar': l, 'quien': q} for l, q in r['paradas']], 'hora_recogida': r['hora'], 'conductor': '', 'conductor_tel': '',
        'placa': '', 'vehiculo': '', 'hora_regreso': '', 'lugar_regreso': '', 'equipos': r['actividad'] if r['tipo'] == 'carga' else '', 'notas': r['cruce']}
tarifas = {'lista': [{'id': 'completo', 'nombre': 'Completo', 'valor': 40000}, {'id': 'medio-dia', 'nombre': 'Medio día', 'valor': 30000}]}
for col, docs in (('personas', personas), ('rutas', rutas)):
    os.makedirs(os.path.join(sem, col), exist_ok=True)
    for k, v in docs.items(): json.dump(v, open(os.path.join(sem, col, k + '.json'), 'w'), ensure_ascii=False)
json.dump(tarifas, open(os.path.join(sem, 'tarifas.json'), 'w'), ensure_ascii=False)

# ---------- página ----------
css = open(os.path.join(AQUI, 'estilos.css')).read() + '''
.acciones-dia { display:flex; flex-wrap:wrap; gap:10px; align-items:center; justify-content:space-between }
button.nombre { all:unset; cursor:pointer; display:inline; border-radius:4px }
button.nombre:focus-visible { outline:3px solid var(--lima); outline-offset:2px }
button.nombre b { text-decoration:underline; text-decoration-color:var(--line); text-underline-offset:3px }
.tres { display:grid; grid-template-columns:repeat(3, 1fr); gap:10px }
.hoja select, .hoja textarea { font:inherit; padding:10px 12px; border-radius:10px; border:1px solid var(--line); background:var(--card); color:var(--fg); width:100%; min-height:44px }
.opciones { border:1px solid var(--line); border-radius:12px; padding:8px 12px 10px; margin:0; display:grid; gap:6px }
.opciones legend { font-weight:700; font-size:14px; padding:0 4px }
.hoja label.opcion { display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:10px; padding:10px 8px; border-radius:10px; border:1px solid var(--line); background:var(--card); font-size:16px; cursor:pointer }
.opcion input { width:22px; height:22px; min-height:0; margin:0 }
.opcion:has(input:checked) { border-color:var(--tablero); box-shadow:inset 0 0 0 2px var(--lima) }
.tarifas { list-style:none; margin:0; padding:0; display:grid; gap:6px }
.tarifas li { display:flex; justify-content:space-between; gap:12px; padding:10px 12px; background:var(--bg); border-radius:10px; font-size:16px }
.tarifas b { font-variant-numeric:tabular-nums }
.fila-tarifa { display:grid; grid-template-columns:1fr 120px auto; gap:8px; align-items:center }
.ruta .btn { justify-self:start }
'''
def dia_html(f, n):
    return f'''<section class="dia panel" data-panel="d{f[-2:]}"><div class="diahead"><h2>{n.capitalize()}</h2><div class="chips" id="tot-{f}"></div></div>
<div class="acciones-dia"><span class="pie">Toque un nombre para editarlo. Toque la casilla para registrar el recibido.</span><div class="fila2"><button type="button" class="btn sec" data-otro-gasto="{f}">💵 Otro gasto</button><button type="button" class="btn" data-nueva="{f}">+ Agregar persona</button></div></div>
<div id="lista-{f}" style="display:grid;gap:18px"><p class="pie">Cargando la planilla…</p></div></section>'''
NOMBRES = {'2026-10-23': 'viernes 23 de octubre', '2026-10-24': 'sábado 24 de octubre', '2026-10-25': 'domingo 25 de octubre'}
pendientes = [
 'Meriendas a cargo de Fabián (no se entregan en efectivo): ' + '; '.join(d.get('a_cargo_fabian', [])) + '.',
 'Quién recibe y firma por cada grupo: Creativos, CUC, Gobernación, INUBAC, Contabilidad, Chavelita y el equipo de Sebastián Ospina.',
 'Nombre de los conductores que la planilla no identifica.',
 'Nombres completos y cédulas de quienes aparecen con apodo: Kiki, Maleja.',
 'Totales del Excel que no cuadran con los nombres: sábado merienda PM (dice 23, suman 25; además "Sebastián Ospina" va sin el 10) y Plogging del domingo (dice 7, suman 6).',
 'Bosques de Miramar: alimentos lo tiene el viernes 6:00 a. m. y transporte el sábado 5:20 a. m. ¿Cuál es el día?',
 'Transporte: placas, conductores y horas de regreso. Social Plogging y Limpieza de playa salen ambos el domingo a las 5:00 a. m.: hacen falta dos vehículos.',
]
page = f'''<title>Planilla Ecofest</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Public+Sans:wght@400;600;700&display=swap">
<style>{css}</style>
<header><div class="wrap"><img src="{LOGO}" alt="Ecofest"><p>Alimentos y transporte, persona por persona. Todo se guarda en línea para el equipo.</p></div></header>
<nav class="dias" aria-label="Días"><div class="wrap"><div class="tabs" role="tablist">
<button role="tab" data-tab="d23">Vie 23</button><button role="tab" data-tab="d24">Sáb 24</button><button role="tab" data-tab="d25">Dom 25</button>
<button role="tab" data-tab="transporte">Rutas</button><button role="tab" data-tab="caja">Caja</button><button role="tab" data-tab="resumen">Valores</button></div>
<input id="buscar" type="search" placeholder="Buscar nombre o grupo en este día" aria-label="Buscar nombre o grupo"></div></nav>
<main class="wrap">
{"".join(dia_html(f, n) for f, n in NOMBRES.items())}
<section class="dia panel" data-panel="transporte"><div class="diahead"><h2>Transporte</h2><div class="chips" id="tot-rutas"></div></div>
<div class="acciones-dia"><span class="pie">Cada ruta lleva sus paradas, conductor, placa y horas.</span><button type="button" class="btn" id="nueva-ruta">+ Agregar ruta</button></div>
<div class="rutas" id="lista-rutas"><p class="pie">Cargando rutas…</p></div></section>
<section class="dia panel" data-panel="caja"><div class="diahead"><h2>Caja menor</h2><div class="chips" id="tot-caja"></div></div>
<div class="acciones-dia"><span class="pie">Efectivo que sale por fuera de los recibidos: transporte propio, compras, imprevistos.</span>
<div class="fila2"><button type="button" class="btn sec" id="editar-base">Base de caja</button><button type="button" class="btn" id="nueva-salida">+ Registrar salida</button></div></div>
<div id="cats-caja"></div>
<div id="lista-caja" style="display:grid;gap:8px"><p class="pie">Cargando caja…</p></div>
<div class="fila2"><button type="button" class="btn sec" id="exp-caja">Descargar caja menor (Excel/CSV)</button></div></section>
<section class="dia panel" data-panel="resumen"><div class="diahead"><h2>Valores y resumen</h2></div>
<div class="card"><h2>Tarifas de entrega</h2><p class="pie" style="margin:0">Al registrar un recibido se escoge la tarifa y el monto sale solo: valor × personas.</p><div id="tarifas"></div></div>
<div class="resumen" id="resumen-gen"></div>
<div class="card"><h2>Soportes</h2><div class="fila2"><button type="button" class="btn sec" id="exp-csv">Descargar recibidos firmados (Excel/CSV)</button></div>
<p class="estado-db pie" style="margin:0"></p></div>
<div class="pend"><h2>Falta definir antes del viernes</h2><ol>{"".join(f"<li>{p}</li>" for p in pendientes)}</ol></div>
</section>
</main>
<div class="velo" id="velo" hidden><div class="hoja" role="dialog" aria-modal="true" aria-labelledby="hoja-titulo" id="hoja"></div></div>
<div class="toast" id="toast" hidden></div>
<script>
const tabs = [...document.querySelectorAll('[data-tab]')], qBuscar = document.getElementById('buscar');
function mostrar(id) {{
  if (!document.querySelector(`[data-panel="${{id}}"]`)) id = 'd23';
  document.querySelectorAll('.panel').forEach(p => p.hidden = p.dataset.panel !== id);
  tabs.forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
  qBuscar.hidden = !/^d\\d/.test(id);
  try {{ localStorage.setItem('ecofest-tab', id) }} catch (e) {{}}
  window.scrollTo(0, 0);
}}
tabs.forEach(b => b.addEventListener('click', () => mostrar(b.dataset.tab)));
let inicial = location.hash.slice(1);
if (!inicial) {{ try {{ inicial = localStorage.getItem('ecofest-tab') || '' }} catch (e) {{}} }}
mostrar(inicial === 'resumen' || inicial === 'transporte' || inicial === 'caja' || /^d2[345]$/.test(inicial) ? inicial : 'd23');
</script>
<script>{open(os.path.join(AQUI, 'planilla.js')).read()}</script>'''
open(os.path.join(SALIDA, 'planilla-ecofest.html'), 'w').write(page)
print('página', len(page), '| personas', len(personas), '| rutas', len(rutas))
