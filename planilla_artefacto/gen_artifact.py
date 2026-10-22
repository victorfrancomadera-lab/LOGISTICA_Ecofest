import json, base64, io, html, collections, sys
from PIL import Image
S = sys.argv[1]
d = json.load(open('/home/user/LOGISTICA_Ecofest/semilla/planilla_ecofest.json'))
im = Image.open('/home/user/LOGISTICA_Ecofest/public/logo.jpg'); im.thumbnail((520, 200)); b = io.BytesIO(); im.save(b, 'JPEG', quality=80)
LOGO = 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()
e = html.escape
dias = d['dias']; filas = d['entregas']; conteos = d['conteos']
for i, f in enumerate(filas): f['id'] = f"{f['fecha']}-{i+1:03d}"
def comidas_txt(f):
    p = []
    for k, s1, pl in (('merienda_am','merienda AM','meriendas AM'),('almuerzo','almuerzo','almuerzos'),('merienda_pm','merienda PM','meriendas PM')):
        if f[k]: p.append(f"{f[k]} {s1 if f[k]==1 else pl}")
    return (', '.join(p[:-1]) + ' y ' + p[-1]) if len(p) > 1 else p[0]
ENT = {f['id']: {'b': f['beneficiario'], 'g': f['grupo'], 'eg': f['es_grupo'], 'u': f['ubicacion'], 'f': f['fecha'],
       'am': f['merienda_am'], 'al': f['almuerzo'], 'pm': f['merienda_pm'], 'c': comidas_txt(f)} for f in filas}

tot = collections.defaultdict(lambda: [0, 0, 0])
for f in filas:
    t = tot[f['fecha']]; t[0] += f['merienda_am']; t[1] += f['almuerzo']; t[2] += f['merienda_pm']
malos = [c for c in conteos if c['escrito'] is not None and c['escrito'] != c['contados']]

def celda(n): return f'<td class="n">{n if n else "<span class=dash>·</span>"}</td>'

secciones = []
for fecha, nombre_dia in dias.items():
    por_ubic = collections.OrderedDict()
    for f in filas:
        if f['fecha'] == fecha: por_ubic.setdefault(f['ubicacion'], []).append(f)
    bloques = []
    for ub, lista in por_ubic.items():
        lista.sort(key=lambda f: (f['es_grupo'], f['grupo'] == 'Conductores', f['beneficiario']))
        s = [sum(f[k] for f in lista) for k in ('merienda_am', 'almuerzo', 'merienda_pm')]
        alerta = [c for c in malos if c['fecha'] == fecha and c['ubicacion'] == ub]
        rows = ''.join(
            f'<tr data-id="{f["id"]}" class="{"grupo" if f["es_grupo"] else ""}{" obs" if f["observacion"] else ""}" data-q="{e((f["beneficiario"]+" "+f["grupo"]+" "+ub).lower())}">'
            f'<td><b>{e(f["beneficiario"])}</b>{"<span class=tag>grupo</span>" if f["es_grupo"] else ""}<div class=sub>{e(f["grupo"])}</div>'
            f'{"<div class=nota>"+e(f["observacion"])+"</div>" if f["observacion"] else ""}</td>'
            + celda(f['merienda_am']) + celda(f['almuerzo']) + celda(f['merienda_pm'])
            + f'<td class="acta"><button type="button" class="chk" data-acta="{f["id"]}" aria-label="Marcar recibido de {e(f["beneficiario"])}"><span class="box"></span><span class="hora"></span></button></td></tr>' for f in lista)
        al = ''.join(f'<p class="aviso">La planilla dice <b>{c["escrito"]}</b> en {e(c["comida"].lower())}, pero los nombres listados suman <b>{c["contados"]}</b>.</p>' for c in alerta)
        bloques.append(f'''<div class="ubic"><h3>{e(ub)}</h3>{al}<div class="tw"><table>
<thead><tr><th>Quién recibe</th><th class="n">AM</th><th class="n">Alm.</th><th class="n">PM</th><th class="acta">Recibido</th></tr></thead>
<tbody>{rows}</tbody><tfoot><tr><td>Total</td>{celda(s[0])}{celda(s[1])}{celda(s[2])}<td class="acta progreso" data-prog="{e(fecha+'|'+ub)}"></td></tr></tfoot></table></div></div>''')
    t = tot[fecha]
    secciones.append(f'''<section class="dia panel" id="d{fecha[-2:]}" data-panel="d{fecha[-2:]}"><div class="diahead"><h2>{e(nombre_dia)} de octubre</h2>
<div class="chips"><span><b>{t[0]}</b> mer. AM</span><span><b>{t[1]}</b> almuerzos</span><span><b>{t[2]}</b> mer. PM</span><span class="firmadas" data-dia="{fecha}"></span></div></div>{"".join(bloques)}</section>''')

rutas = ''.join(f'''<article class="ruta"><div class="rh"><span class="fecha">{e(dias[r["fecha"]])}</span><h3>{e(r["actividad"])}</h3></div>
<ol class="paradas">{"".join(f'<li><span class=lugar>{e(l)}</span><span class=quien>{e(q)}</span></li>' for l,q in r["paradas"])}
<li class="fin"><span class=lugar>{e(r["destino"])}</span><span class=quien>Destino{" · actividad "+r["hora_actividad"] if r["hora_actividad"] else ""}</span></li></ol>
<dl><dt>Conductor</dt><dd>{e(r["conductor_planilla"])}</dd><dt>Vehículo / placa</dt><dd class=falta>Por definir</dd>
<dt>Hora de recogida</dt><dd class=falta>Por definir</dd><dt>Regreso</dt><dd class=falta>Por definir</dd></dl>
<p class="cruce">{e(r["cruce"])}</p></article>''' for r in d['transporte'])

nfilas = len(filas); ngrupos = sum(1 for f in filas if f['es_grupo'])
gt = [sum(tot[f][i] for f in dias) for i in range(3)]
pendientes = [
 'Valor en pesos de cada merienda y de cada almuerzo. Sin ese dato la app no puede calcular cuánto efectivo se entrega.',
 'Quién recibe y firma por cada grupo: Gobernación, CUC, Contabilidad, Chavelita y asistentes de la Cámara de Comercio.',
 '¿Las 180 meriendas de la agenda académica son catering contratado o efectivo?',
 'Nombre de cada "conductor" que la planilla no identifica (aparece en 6 entregas).',
 'Nombres completos y cédulas de quienes aparecen con apodo: Kiki, Maleja, Chavelita.',
 'Emanuel y Beatriz (viernes) y Pamela (domingo) tienen merienda AM en dos lugares el mismo día.',
 'Sábado: ¿"Emanuel" y "Emanuel conductor" son la misma persona?',
 '¿Sebastián (Gobernación, Punta Roca) es el mismo Sebastián Ospina?',
 'Transporte: placas, conductores, horas de recogida y de regreso. Solo Miramar tiene hora (6:00 a. m.).',
]
page = f'''<title>Planilla Ecofest</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Public+Sans:wght@400;600;700&display=swap">
<style>
/* Layout: banda de tablero verde con el logo arriba; abajo, tablas por día y ubicación en una sola columna legible */
:root {{
  --tablero:#183A2C; --lima:#8DC63F; --bg:#F3F5F1; --card:#FFFFFF; --fg:#18221D; --muted:#5B6A61; --line:#DCE3DC;
  --warn-bg:#FFF3D6; --warn-fg:#7A4E00; --falta:#A23B2A; --grupo:#EEF4E6;
  --f-display:"Bricolage Grotesque", "Public Sans", system-ui, sans-serif; --f-body:"Public Sans", system-ui, -apple-system, Segoe UI, sans-serif;
}}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{
  --bg:#0F1713; --card:#16211B; --fg:#E7EEE9; --muted:#9AAAA0; --line:#2A3A31; --warn-bg:#3A2E10; --warn-fg:#F3D38A; --falta:#F08C78; --grupo:#1B2A20; color-scheme:dark }} }}
:root[data-theme="dark"] {{ --bg:#0F1713; --card:#16211B; --fg:#E7EEE9; --muted:#9AAAA0; --line:#2A3A31; --warn-bg:#3A2E10; --warn-fg:#F3D38A; --falta:#F08C78; --grupo:#1B2A20; color-scheme:dark }}
* {{ box-sizing:border-box }}
[hidden] {{ display:none !important }}
body {{ background:var(--bg); color:var(--fg); font-family:var(--f-body); font-size:15px; line-height:1.45 }}
.wrap {{ max-width:860px; margin:0 auto; padding-left:max(16px, env(safe-area-inset-left, 0px)); padding-right:max(16px, env(safe-area-inset-right, 0px)) }}
header {{ background:var(--tablero); color:#fff; border-bottom:4px solid var(--lima) }}
header .wrap {{ padding-block:14px 12px; display:grid; gap:6px }}
header img {{ width:min(220px, 60vw); display:block }}
header p {{ font-size:14px }}
header p {{ margin:0; color:#CFE0D4; max-width:60ch }}
nav.dias {{ position:sticky; top:env(safe-area-inset-top, 0px); z-index:5; background:var(--bg); border-bottom:1px solid var(--line) }}
nav.dias .wrap {{ display:grid; gap:8px; padding-block:10px }}
.tabs {{ display:grid; grid-template-columns:repeat(5, 1fr); gap:6px }}
.tabs button {{ font:inherit; font-weight:700; font-size:14px; padding:8px 4px; border-radius:10px; border:1px solid var(--line); background:var(--card); color:var(--fg); cursor:pointer; white-space:nowrap }}
.tabs button[aria-selected="true"] {{ background:var(--tablero); border-color:var(--tablero); color:#fff; box-shadow:inset 0 -3px 0 var(--lima) }}
.tabs button:focus-visible {{ outline:3px solid var(--lima); outline-offset:2px }}
@media (max-width:420px) {{ .tabs button {{ font-size:13px }} }}
.panel[hidden] {{ display:none }}
input:focus-visible {{ outline:3px solid var(--lima); outline-offset:2px }}
nav.dias input {{ width:100%; font:inherit; padding:7px 12px; border-radius:999px; border:1px solid var(--line); background:var(--card); color:var(--fg) }}
h1,h2,h3 {{ font-family:var(--f-display); text-wrap:balance; margin:0 }}
h2 {{ font-size:26px; font-weight:800 }} h3 {{ font-size:18px; font-weight:600 }}
main {{ display:grid; gap:20px; padding-block:18px 60px }}
.resumen {{ display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:10px }}
.resumen div {{ background:var(--card); border:1px solid var(--line); border-radius:12px; padding:12px 14px }}
.resumen b {{ display:block; font-family:var(--f-display); font-size:30px; font-weight:800; font-variant-numeric:tabular-nums }}
.resumen span {{ color:var(--muted); font-size:13px }}
.pend {{ background:var(--warn-bg); color:var(--warn-fg); border-radius:12px; padding:16px 18px }}
.pend h2 {{ font-size:20px; margin-bottom:8px }} .pend ol {{ margin:0; padding-left:20px; display:grid; gap:6px }}
.diahead {{ display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:8px; border-bottom:3px solid var(--tablero); padding-bottom:6px; margin-bottom:14px }}
:root[data-theme="dark"] .diahead {{ border-color:var(--lima) }}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) .diahead {{ border-color:var(--lima) }} }}
.chips {{ display:flex; gap:12px; flex-wrap:wrap; color:var(--muted); font-size:14px }} .chips b {{ color:var(--fg); font-variant-numeric:tabular-nums }}
.dia {{ display:grid; gap:18px }}
.ubic {{ display:grid; gap:8px }}
.tw {{ overflow-x:auto; background:var(--card); border:1px solid var(--line); border-radius:12px }}
table {{ width:100%; border-collapse:collapse; table-layout:fixed }}
th {{ text-align:left; font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); padding:9px 10px; border-bottom:1px solid var(--line) }}
td {{ padding:9px 10px; border-bottom:1px solid var(--line); vertical-align:top; overflow-wrap:anywhere }}
.n {{ text-align:center; width:48px; padding-inline:2px; font-variant-numeric:tabular-nums; font-weight:700 }}
.dash {{ color:var(--line); font-weight:400 }}
tr.grupo td {{ background:var(--grupo) }}
tfoot td {{ font-weight:800; border-bottom:none }}
.sub {{ color:var(--muted); font-size:13px }}
.tag {{ margin-left:8px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); border:1px solid var(--line); padding:1px 6px; border-radius:6px }}
.nota {{ margin-top:4px; font-size:13px; color:var(--warn-fg); background:var(--warn-bg); padding:4px 8px; border-radius:6px }}
.aviso {{ margin:0; background:var(--warn-bg); color:var(--warn-fg); padding:8px 12px; border-radius:8px; font-size:14px }}
.rutas {{ display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:12px }}
.ruta {{ background:var(--card); border:1px solid var(--line); border-radius:12px; padding:14px 16px; display:grid; gap:10px; min-width:0 }}
.rh .fecha {{ font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); font-weight:700 }}
.paradas {{ list-style:none; margin:0; padding:0 0 0 14px; border-left:3px solid var(--lima); display:grid; gap:8px }}
.paradas li {{ display:grid }} .lugar {{ font-weight:700 }} .quien {{ color:var(--muted); font-size:14px }}
.paradas li.fin .lugar {{ color:var(--fg) }}
dl {{ display:grid; grid-template-columns:auto 1fr; gap:4px 12px; margin:0; font-size:14px }} dt {{ color:var(--muted) }} dd {{ margin:0; font-weight:600 }}
.falta {{ color:var(--falta) }}
.cruce {{ margin:0; font-size:13px; color:var(--warn-fg); background:var(--warn-bg); padding:8px 10px; border-radius:8px }}
.pie {{ color:var(--muted); font-size:13px }}
.oculto {{ display:none }}
th.acta, td.acta {{ width:58px; text-align:center; padding-inline:2px }}
.n {{ width:40px }}
.chk {{ all:unset; cursor:pointer; display:inline-grid; justify-items:center; gap:2px; padding:4px; border-radius:8px; min-width:44px; min-height:40px; align-content:center }}
.chk:focus-visible {{ outline:3px solid var(--lima); outline-offset:1px }}
.chk .box {{ width:24px; height:24px; border:2px solid var(--muted); border-radius:6px; display:grid; place-items:center; background:var(--card) }}
.chk.ok .box {{ background:var(--lima); border-color:var(--lima) }}
.chk.ok .box::after {{ content:""; width:7px; height:13px; border:solid var(--tablero); border-width:0 3px 3px 0; transform:rotate(45deg) translate(-1px,-1px) }}
.chk .hora {{ font-size:11px; color:var(--muted); font-variant-numeric:tabular-nums }}
tr.firmada td:first-child b {{ color:var(--muted) }}
.progreso {{ font-size:12px; color:var(--muted); font-weight:700 }}
.firmadas b {{ color:var(--fg) }}
.card {{ background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px 18px; display:grid; gap:10px }}
.card h2 {{ font-size:20px }}
.fila2 {{ display:flex; flex-wrap:wrap; gap:10px; align-items:end }}
.fila2 label {{ display:grid; gap:4px; font-weight:600; font-size:14px; flex:1; min-width:130px }}
input.campo, .fila2 input, .hoja input {{ font:inherit; padding:10px 12px; border-radius:10px; border:1px solid var(--line); background:var(--card); color:var(--fg); width:100%; min-height:44px }}
.btn {{ font:inherit; font-weight:700; border:none; border-radius:10px; padding:11px 16px; min-height:44px; background:var(--tablero); color:#fff; cursor:pointer }}
.btn.sec {{ background:var(--card); color:var(--fg); border:1px solid var(--line) }}
.btn.peligro {{ background:var(--card); color:var(--falta); border:1px solid var(--falta) }}
.btn:disabled {{ opacity:.55; cursor:default }}
.btn:focus-visible {{ outline:3px solid var(--lima); outline-offset:2px }}
.velo {{ position:fixed; inset:0; z-index:20; background:rgba(10,20,15,.55); display:grid; align-items:end; justify-items:center }}
.hoja {{ background:var(--bg); color:var(--fg); width:100%; max-width:560px; max-height:calc(100% - env(safe-area-inset-top, 0px) - 12px); overflow:auto; border-radius:16px 16px 0 0;
  padding-block:16px calc(20px + env(safe-area-inset-bottom, 0px)); padding-left:max(16px, env(safe-area-inset-left, 0px)); padding-right:max(16px, env(safe-area-inset-right, 0px)); display:grid; gap:12px }}
@media (min-width:600px) {{ .velo {{ align-items:center }} .hoja {{ border-radius:16px }} }}
.hoja h2 {{ font-size:22px }}
.hoja .cab {{ display:flex; justify-content:space-between; gap:10px; align-items:start }}
.hoja .cerrar {{ all:unset; cursor:pointer; font-size:26px; line-height:1; padding:4px 8px; border-radius:8px; color:var(--muted) }}
.hoja .cerrar:focus-visible {{ outline:3px solid var(--lima) }}
.hoja label {{ display:grid; gap:4px; font-weight:600; font-size:14px }}
.hoja .dos {{ display:grid; grid-template-columns:1fr 1fr; gap:10px }}
@media (max-width:400px) {{ .hoja .dos {{ grid-template-columns:1fr }} }}
.resumen-acta {{ background:var(--card); border:1px solid var(--line); border-radius:12px; padding:12px 14px; display:grid; gap:4px }}
.hoja label.decl {{ display:flex; gap:10px; align-items:start; font-weight:500 !important; font-size:14px }}
.decl input {{ width:22px; height:22px; min-height:0; flex:none; margin-top:2px }}
.lienzo {{ position:relative; background:#fff; border:2px dashed var(--tablero); border-radius:12px; touch-action:none }}
.lienzo canvas {{ display:block; width:100%; height:200px; border-radius:10px }}
.lienzo .linea {{ position:absolute; left:8%; right:8%; bottom:42px; border-bottom:1px solid #9AA59E; pointer-events:none }}
.lienzo .ayuda {{ position:absolute; left:0; right:0; bottom:14px; text-align:center; color:#7C8A82; font-size:13px; pointer-events:none }}
.firma-img {{ background:#fff; border-radius:10px; border:1px solid var(--line); padding:6px }}
.firma-img img {{ display:block; width:100%; height:auto }}
.msg {{ font-size:14px; font-weight:600; color:var(--falta); margin:0 }}
.toast {{ position:fixed; left:50%; transform:translateX(-50%); bottom:calc(18px + env(safe-area-inset-bottom, 0px)); z-index:30; background:var(--tablero); color:#fff; padding:12px 18px; border-radius:12px; font-weight:700; box-shadow:0 6px 20px rgba(0,0,0,.25) }}
.confirmar {{ background:var(--warn-bg); color:var(--warn-fg); border-radius:10px; padding:10px 12px; display:grid; gap:8px }}
</style>
<header><div class="wrap"><img src="{LOGO}" alt="Ecofest"><p>Alimentos y transporte, persona por persona. Totales recontados contra los nombres.</p></div></header>
<nav class="dias" aria-label="Días"><div class="wrap"><div class="tabs" role="tablist">
<button role="tab" data-tab="d23">Vie 23</button><button role="tab" data-tab="d24">Sáb 24</button><button role="tab" data-tab="d25">Dom 25</button>
<button role="tab" data-tab="transporte">Transporte</button><button role="tab" data-tab="resumen">Pendientes</button></div>
<input id="buscar" type="search" placeholder="Buscar nombre o grupo en este día" aria-label="Buscar nombre o grupo"></div></nav>
<main class="wrap">
<section class="dia panel" data-panel="resumen"><div class="diahead"><h2>Resumen de los 3 días</h2></div>
<div class="resumen" aria-label="Totales del evento">
 <div><b>{gt[0]}</b><span>meriendas AM</span></div><div><b>{gt[1]}</b><span>almuerzos</span></div>
 <div><b>{gt[2]}</b><span>meriendas PM</span></div><div><b>{nfilas}</b><span>entregas a firmar ({ngrupos} son grupos)</span></div>
</div>
<div class="tw"><table class="tdias"><thead><tr><th>Día</th><th class="n">AM</th><th class="n">Alm.</th><th class="n">PM</th></tr></thead><tbody>{"".join(f'<tr><td><b>{e(nd)}</b></td><td class=n>{tot[f][0]}</td><td class=n>{tot[f][1]}</td><td class=n>{tot[f][2]}</td></tr>' for f, nd in dias.items())}</tbody></table></div>
<div class="valores card"><h2>Valores y soportes</h2>
<p class="pie" style="margin:0">El valor de cada comida sirve para sugerir el monto de cada entrega. Siempre se puede corregir antes de firmar.</p>
<form id="f-valores" class="fila2"><label>Merienda (AM o PM)<input id="v-merienda" inputmode="numeric" placeholder="$ por merienda"></label>
<label>Almuerzo<input id="v-almuerzo" inputmode="numeric" placeholder="$ por almuerzo"></label><button class="btn">Guardar valores</button></form>
<div class="fila2"><button type="button" class="btn sec" id="exp-csv">Descargar recibidos firmados (Excel/CSV)</button></div>
<p class="estado-db pie" style="margin:0"></p></div>
<div class="pend"><h2>Falta definir antes del viernes</h2><ol>{"".join(f"<li>{e(p)}</li>" for p in pendientes)}</ol></div>
</section>
{"".join(secciones)}
<section id="transporte" class="dia panel" data-panel="transporte"><div class="diahead"><h2>Transporte inicial</h2><div class="chips"><span><b>4</b> rutas</span><span><b>0</b> con vehículo asignado</span></div></div>
<p class="pie" style="margin:0">El Excel lista los lugares de recogida juntos. Los emparejé con cada persona porque se repiten igual en varias rutas (Jessica siempre en Montecristo, Marcela en San Pacho, Chavelita en el Edificio Mallorquín). Hay que confirmarlo.</p>
<div class="rutas">{rutas}</div></section>
<p class="pie">Fechas tomadas como viernes 23, sábado 24 y domingo 25 de octubre de 2026. Cada fila es una entrega con firma: una persona o un grupo, en un lugar y un día, con todas sus comidas de ese día.</p>
</main>
<div class="velo" id="velo" hidden><div class="hoja" role="dialog" aria-modal="true" aria-labelledby="hoja-titulo" id="hoja"></div></div>
<div class="toast" id="toast" hidden></div>
<script id="datos" type="application/json">{json.dumps(ENT, ensure_ascii=False).replace("</", "<\\/")}</script>
<script>
const q = document.getElementById('buscar');
const tabs = [...document.querySelectorAll('[data-tab]')];
const pie = document.querySelector('.pie-final');
function filtrar() {{
  const t = q.value.trim().toLowerCase();
  document.querySelectorAll('tbody tr[data-q]').forEach(tr => tr.classList.toggle('oculto', !!t && !tr.dataset.q.includes(t)));
  document.querySelectorAll('.ubic').forEach(u => u.classList.toggle('oculto', !!t && !u.querySelector('tbody tr:not(.oculto)')));
}}
function mostrar(id) {{
  if (!document.querySelector(`[data-panel="${{id}}"]`)) id = 'd23';
  document.querySelectorAll('.panel').forEach(p => p.hidden = p.dataset.panel !== id);
  tabs.forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
  q.hidden = !id.startsWith('d');
  try {{ localStorage.setItem('ecofest-tab', id) }} catch (e) {{}}
  filtrar(); window.scrollTo(0, 0);
}}
tabs.forEach(b => b.addEventListener('click', () => mostrar(b.dataset.tab)));
q.addEventListener('input', filtrar);
let inicial = location.hash.slice(1);
if (!inicial) {{ try {{ inicial = localStorage.getItem('ecofest-tab') || '' }} catch (e) {{}} }}
mostrar(inicial || 'd23');
</script>
<script>{open(__import__('os').path.dirname(__file__) + '/actas.js').read()}</script>'''
open(S + '/planilla-ecofest.html', 'w').write(page)
print(len(page))
