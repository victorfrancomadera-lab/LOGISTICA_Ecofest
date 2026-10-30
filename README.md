# Ecofest · Logística

Producción: https://logisticaecofest-production.up.railway.app (Railway, despliegue automático desde `main`).
La versión desplegada se ve al final de **Más** y en `/healthz`.

App web para el equipo en calle:

1. **Traslados**: vehículo (placa), conductor, a quién se recoge, hora y lugar de recogida, destino, a qué hora y dónde se recoge de nuevo, equipos o carga y notas. El estado se actualiza desde el celular (en camino, recogido, entregado, regreso…) y queda en una bitácora con quién lo hizo y a qué hora.
2. **Almuerzos**: entrega de dinero con **firma digital en el celular o la tablet**, cédula, monto, fecha y hora, ubicación GPS y quién entregó. Cada entrega genera un comprobante `ECO-0001` que se puede imprimir o guardar en PDF.

**Escanear cédula o licencia**: en los formularios con cédula (firma de alimentación, caja menor, nueva entrega y conductor del vehículo) el botón **📷 Escanear cédula o licencia** abre la cámara y lee el código de barras del reverso. Antes de llenar el formulario muestra los datos para confirmarlos o corregirlos. Si la cámara en vivo no funciona, **Tomar foto** lee el código desde una foto.

- Cédula amarilla con hologramas (PDF417): número, nombres, apellidos, sexo, nacimiento y RH.
- Licencia de conducción y cédula digital: se extrae lo que el código traiga legible (número, nombre, categorías, vigencia) y siempre se pide revisar.
- **Foto del frente**: la licencia no trae en el código el nombre completo, las fechas ni el RH. El botón **🪪 Foto del frente** (o **Completar con foto del frente** después de escanear) manda la foto a Claude, que transcribe los datos impresos. La foto no se guarda. Requiere la variable `ANTHROPIC_API_KEY` en Railway; sin ella, la app avisa y el resto sigue funcionando. `/healthz` muestra `lectura_fotos: true` cuando está configurada.
- **Tarjeta de propiedad**: en **Vehículos → Nuevo/Editar**, **▦ Escanear código** lee el código de barras de la tarjeta (placa, modelo y VIN; el formato aún no está documentado, así que se confirma a mano) y **📷 Leer tarjeta (foto)** lee con Claude la foto del frente y llena placa, clase/marca/línea, color, puestos, modelo, servicio, propietario y número de la licencia de tránsito.
- **Otros documentos de identidad**: el mismo botón lee la tarjeta de identidad antigua y nueva (se distingue de la cédula por la edad), la cédula de extranjería y el PPT (por la nacionalidad o por el texto del código). Si el código es un enlace de verificación, lo muestra.
- **SOAT y técnico-mecánica**: en **Vehículos → Nuevo/Editar**, cada uno tiene **▦ Escanear código** y **📷 Leer foto**; se guardan número, aseguradora o CDA y vencimiento. La lista de vehículos muestra si están vencidos o por vencer (30 días), y al asignar un vehículo a un traslado aparece ⚠️ si tiene alguno vencido.
- Toda la lectura de códigos está en `lector-codigos/lector-codigos-colombia.js` (independiente de la app; la app lo sirve en `/lector-codigos.js`).
- El lector (`zxing-wasm`) se sirve desde la propia app en `/vendor/zxing`; no depende de un CDN. Requiere HTTPS (Railway ya lo da).

Los dos módulos se exportan a Excel (CSV) desde **Más**.

## Desplegar en Railway (5 minutos)

1. En Railway: **New Project → Deploy from GitHub repo →** `LOGISTICA_Ecofest`.
2. En el servicio: **Settings → Volumes → Add Volume**, ruta de montaje **`/data`**. *Sin el volumen se borran los datos en cada despliegue; la app lo avisa con una franja roja al administrador y en `/healthz` (`datos_persistentes`).*
3. **Variables**:
   - `DATA_DIR` no hace falta: si hay volumen, la app usa su ruta sola (`RAILWAY_VOLUME_MOUNT_PATH`).
   - `ADMIN_USER` = `admin` (o el que quiera)
   - `ADMIN_PIN` = una clave segura (solo se usa la primera vez que arranca)
4. **Settings → Networking → Generate Domain**. Ese enlace es el que se comparte al equipo.

Requiere Node 22.13 o superior (viene declarado en `package.json`). No usa base de datos externa: SQLite en el volumen.

## Planilla inicial

La primera vez que arranca, la app carga sola `semilla/planilla_ecofest.json`: 71 entregas de alimentación (viernes 23 a domingo 25 de octubre, por persona o grupo, lugar y comidas) y las 4 rutas de transporte. Ese archivo se genera con `python3 semilla/construir.py` a partir de los Excel. Se carga una sola vez; después todo se edita desde la app.

Los montos se calculan con **Más → Valores y marca** (valor por merienda y por almuerzo). Al guardar, se recalculan las entregas pendientes.

## Primer uso

1. Entre con el usuario admin.
2. **Más → Marca y ajustes**: suba el logo de Ecofest (los colores se proponen solos a partir del logo) y defina el valor del almuerzo.
3. **Más → Usuarios**: cree un usuario *operador* para cada persona en calle.
4. **Más → Vehículos**: registre placas y conductores.
5. **Traslados → Importar** y **Almuerzos → Importar**: copie la tabla desde Excel y péguela, o cree los registros uno por uno.
6. En cada celular: abrir el enlace → menú del navegador → **Agregar a pantalla de inicio**.

## Roles

- **Operador**: ve todo, actualiza estados de traslados, agrega personas y registra firmas.
- **Administrador**: además crea, edita, importa, anula comprobantes y descarga el respaldo completo.

Una entrega firmada no se puede borrar ni editar desde la calle. Solo el administrador la puede anular, con un motivo, y el comprobante queda marcado como ANULADO.

## Local

```bash
npm install
npm run dev   # http://localhost:3000  ·  admin / ecofest2026
```
