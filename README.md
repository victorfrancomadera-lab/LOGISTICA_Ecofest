# Ecofest · Logística

App web para el equipo en calle:

1. **Traslados**: vehículo (placa), conductor, a quién se recoge, hora y lugar de recogida, destino, a qué hora y dónde se recoge de nuevo, equipos o carga y notas. El estado se actualiza desde el celular (en camino, recogido, entregado, regreso…) y queda en una bitácora con quién lo hizo y a qué hora.
2. **Almuerzos**: entrega de dinero con **firma digital en el celular o la tablet**, cédula, monto, fecha y hora, ubicación GPS y quién entregó. Cada entrega genera un comprobante `ECO-0001` que se puede imprimir o guardar en PDF.

Los dos módulos se exportan a Excel (CSV) desde **Más**.

## Desplegar en Railway (5 minutos)

1. En Railway: **New Project → Deploy from GitHub repo →** `LOGISTICA_Ecofest`.
2. En el servicio: **Settings → Volumes → Add Volume**, ruta de montaje **`/data`**. *Sin el volumen se borran los datos en cada despliegue.*
3. **Variables**:
   - `DATA_DIR` = `/data`
   - `ADMIN_USER` = `admin` (o el que quiera)
   - `ADMIN_PIN` = una clave segura (solo se usa la primera vez que arranca)
4. **Settings → Networking → Generate Domain**. Ese enlace es el que se comparte al equipo.

Requiere Node 22.13 o superior (viene declarado en `package.json`). No usa base de datos externa: SQLite en el volumen.

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
