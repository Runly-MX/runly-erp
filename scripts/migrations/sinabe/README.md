# Migración sinabe → Runly: guía del operador

Esta guía es para el día de la migración en sitio. El migrador mueve una instancia de sinabe
(MySQL + carpeta `uploads/`) a una empresa de Runly, por lotes pequeños y sin dañar nada:
cada paso se puede repetir (si ya se migró, se reconoce y no se duplica) y todo lo que crea se
puede revertir.

Spec: `docs/superpowers/specs/2026-10-14-sinabe-migrator-design.md`.

## 1. Reglas de bajo perfil (obligatorias)

- Avisar a TI del cliente antes de empezar: qué día, qué horario, qué IP y qué se va a transferir.
- Trabajar fuera del horario laboral y solo por la VPN oficial que nos asigne TI.
- Nada de escaneos de red, de puertos ni de directorios. Solo se leen: el dump que genera el
  operador en el VPS de sinabe, el listado de archivos y cada archivo por su ruta exacta.
- Siempre con límite de ancho de banda (`--rate`) y pausa entre lotes (`--pause-ms`). El
  descargador nunca hace más de 2 descargas a la vez y reintenta una sola vez.
- Si algo se ve raro (muchos errores, lentitud del servidor de sinabe), detenerse con Ctrl+C.
  Se puede retomar después: el migrador continúa donde se quedó.

## 2. Privacidad de los archivos

- El dump (`.sql`), el listado de archivos, la carpeta de archivos y `plan.json` contienen datos
  personales y rutas de archivos. Nunca salen de la red del cliente, nunca se suben a git, chat,
  correo ni tickets. Al terminar se borran de los equipos temporales.
- Los reportes (`report*.md/json`, `verify.*`, `rollback.*`, `census.*`) solo tienen conteos,
  códigos e identificadores internos de sinabe: se pueden compartir con el equipo.
- Nunca imprimir el `.env` ni variables de entorno.

## 3. Requisitos

- Runly instalado y funcionando en el servidor destino, con la empresa ya creada.
- El UUID de la empresa (`<UUID_EMPRESA>`) y el UUID del perfil de usuario que firmará la
  migración como autor (`<UUID_PERFIL>`); debe ser miembro de esa empresa.
- Node 22 (el contenedor de la API ya lo trae, con todas las dependencias).
- Opcional: `deliverers.json` con `{ "correo@cliente": "<UUID_PERFIL_RUNLY>" }` para que quien
  entregó cada resguardo quede ligado a un usuario de Runly. Sin ese archivo se guarda su nombre.

## 4. Preparar los datos de origen (en el VPS de sinabe)

El operador de sinabe genera dos archivos y los copia al servidor de Runly (por ejemplo a
`/srv/sinabe-migracion/`).

Dump de la base de datos (solo lectura, sin bloquear tablas):

```bash
mysqldump --single-transaction --quick --skip-lock-tables --default-character-set=utf8mb4 -u <USUARIO> -p <BASE_SINABE> > sinabe.sql
```

Listado de archivos, ejecutado dentro de `backend/src/uploads`:

```bash
find . -type f -printf '%s\t%TY-%Tm-%Td\t%p\n' > uploads-listing.tsv
```

Archivos: hay dos formas.

- Recomendada: copiar la carpeta `uploads` completa al servidor de Runly (por ejemplo con
  `rsync --bwlimit` en horario nocturno) y usar `--files-dir`.
- Alternativa: que el migrador los descargue uno por uno desde el nginx de sinabe con
  `--files-base-url https://<HOST_SINABE>/api/uploads`, siempre con `--rate` y `--pause-ms`.

## 5. Dónde correr el migrador

Desde el repositorio (equipo con acceso a la base de Runly), en la raíz del repo:

```bash
node --env-file=.env scripts/migrations/sinabe/cli.mjs <comando> ...
```

Dentro del contenedor de la API: la imagen debe estar construida con este código (el migrador importa
`apps/api/src/services/legacy-import`; una imagen anterior falla con `ERR_MODULE_NOT_FOUND`). La imagen no
incluye `scripts/`, así que se copia la carpeta del migrador (no hace falta `npm install` ni internet; las dependencias salen de `apps/api`). El
contenedor ya tiene las variables de entorno, por eso ahí no se usa `--env-file`. Para ubicar el
contenedor de la API se usa `docker ps` (termina en `-api-local` o `-api-external`).

```bash
docker exec <CONTENEDOR_API> mkdir -p /app/scripts/migrations /tmp/sinabe
docker cp scripts/migrations/sinabe <CONTENEDOR_API>:/app/scripts/migrations/sinabe
docker cp /srv/sinabe-migracion/sinabe.sql <CONTENEDOR_API>:/tmp/sinabe/sinabe.sql
docker cp /srv/sinabe-migracion/uploads-listing.tsv <CONTENEDOR_API>:/tmp/sinabe/uploads-listing.tsv
docker cp /srv/sinabe-migracion/uploads <CONTENEDOR_API>:/tmp/sinabe/uploads
docker exec -it <CONTENEDOR_API> sh
```

Ya dentro del contenedor, los comandos de abajo se ejecutan desde `/app` cambiando
`node --env-file=.env` por `node`, y las rutas por `/tmp/sinabe/...`. Para recuperar los
reportes: `docker cp <CONTENEDOR_API>:/tmp/sinabe/salida ./salida`. Al terminar, borrar
`/tmp/sinabe` del contenedor.

## 6. Pasos

En los comandos, `<SALIDA>` es una carpeta de trabajo fuera del repositorio.

### 6.1 Censo (sin tocar Runly)

Cuenta registros, revisa la versión del esquema, cruza la base con el listado (archivos
faltantes y huérfanos, tamaños, duplicados). Solo agregados.

```bash
node scripts/migrations/sinabe/cli.mjs census --dump sinabe.sql --listing uploads-listing.tsv --out <SALIDA>/censo
```

Revisar `census.md`: tablas o columnas faltantes, archivos de más de 50 MB, duplicados.

### 6.2 Plan de lotes

Agrupa los activos en lotes de 50 y calcula archivos y bytes por lote. Deja un archivo
`batches/batch-NNN.txt` por lote con los ids de sinabe, que sirve para `--only`.

```bash
node scripts/migrations/sinabe/cli.mjs plan --dump sinabe.sql --listing uploads-listing.tsv --batch-size 50 --out <SALIDA>/plan
```

### 6.3 Simulación (dry-run, no escribe nada)

Es el modo por defecto. Lee Runly para detectar conflictos (números de activo ya usados, folios
de OC/factura repetidos) y reporta lo que se crearía.

```bash
node --env-file=.env scripts/migrations/sinabe/cli.mjs migrate --dump sinabe.sql --listing uploads-listing.tsv --files-dir uploads --company <UUID_EMPRESA> --actor <UUID_PERFIL> --out <SALIDA>/simulacion
```

Revisar `report-dry-run.md`. Los conflictos traen solo ids de sinabe; resolverlos en sinabe o
aceptar que esos registros se omitan.

### 6.4 Piloto (50 activos)

```bash
node --env-file=.env scripts/migrations/sinabe/cli.mjs migrate --commit --only <SALIDA>/plan/batches/batch-001.txt --dump sinabe.sql --listing uploads-listing.tsv --files-dir uploads --company <UUID_EMPRESA> --actor <UUID_PERFIL> --rate 2000000 --pause-ms 2000 --max-errors 20 --deliverers-map deliverers.json --out <SALIDA>/piloto
node --env-file=.env scripts/migrations/sinabe/cli.mjs verify --dump sinabe.sql --listing uploads-listing.tsv --files-dir uploads --company <UUID_EMPRESA> --out <SALIDA>/piloto
```

Revisar en Runly algunos activos del piloto con el cliente (fotos, documentos, estado, fechas,
factura). Si algo no convence, revertir el piloto (6.7) y corregir antes de seguir.

### 6.5 Migración completa por lotes

Sin `--only` se migra todo, lote por lote, con pausa entre lotes. Con
`--files-base-url https://<HOST_SINABE>/api/uploads` en vez de `--files-dir` los archivos se
descargan de sinabe uno por uno; en ese caso usar un `--rate` bajo (por ejemplo 1000000 = 1 MB/s)
y `--pause-ms` de varios segundos.

```bash
node --env-file=.env scripts/migrations/sinabe/cli.mjs migrate --commit --dump sinabe.sql --listing uploads-listing.tsv --files-dir uploads --company <UUID_EMPRESA> --actor <UUID_PERFIL> --rate 2000000 --pause-ms 2000 --max-errors 50 --deliverers-map deliverers.json --out <SALIDA>/migracion
```

Si se interrumpe (Ctrl+C, corte de red, `--max-errors`), se vuelve a ejecutar el mismo comando:
lo ya migrado aparece como "Existentes" y se continúa con lo pendiente. Una segunda ejecución
completa debe terminar con 0 creados.

Los resguardos se migran cuando todos sus activos ya están en Runly; los que dependen de activos
de otros lotes aparecen como omitidos (`CUSTODY_ITEMS_PENDING`) hasta que se migran esos lotes.
Al final de una corrida completa (sin `--only`; en el piloto solo se cuentan) se migran:

- Proyectos a runly.projects, con el actor como dueño. El código, proveedor y presupuesto de
  sinabe pasan a la descripción. Un proyecto deshabilitado o cancelado queda archivado.
- Hitos como tareas del proyecto y las tareas de cada hito como subtareas. Pendiente, en
  progreso y completado van a "Por hacer", "En progreso" y "Listo"; lo cancelado va a "Listo"
  con una nota.
- Eventos a un calendario nuevo "Sinabe - eventos" (todo el día). Tipo, estado, proveedor y
  fecha de cierre pasan a la descripción. La recurrencia no se migra (aviso
  `EVENT_RECURRENCE_NOT_MIGRATED`).
- Integrantes, responsables y asistentes solo se asignan si su correo coincide con un perfil de
  Runly (`--deliverers-map` primero, luego el correo del perfil). Quien no tiene perfil se cuenta
  en el aviso `USER_WITHOUT_RUNLY_PROFILE`.
- No se migran los documentos de proyecto ni los activos ligados a hitos; el reporte los cuenta
  como "Pendiente etapa C".

### 6.6 Verificación

Compara campo por campo cada registro migrado contra el dump (número de activo, serie, estado,
fechas, factura y OC ligadas, cantidad de adjuntos y su sha256, resguardos con documento y
firmas). Meta: 0 diferencias antes de cerrar.

```bash
node --env-file=.env scripts/migrations/sinabe/cli.mjs verify --dump sinabe.sql --listing uploads-listing.tsv --files-dir uploads --company <UUID_EMPRESA> --out <SALIDA>/verificacion
```

### 6.7 Reversión (solo si hace falta)

Borra lo que el migrador CREÓ (resguardos, comentarios, archivos, activos, compras, proveedores y
colaboradores creados, catálogos creados), incluidos los archivos guardados. Lo que ya existía en
Runly antes de la migración no se toca. Con `--only` se revierten solo esos activos (y sus
archivos, comentarios y resguardos); requiere `--dump`.

```bash
node --env-file=.env scripts/migrations/sinabe/cli.mjs rollback --company <UUID_EMPRESA> --out <SALIDA>/reversion
node --env-file=.env scripts/migrations/sinabe/cli.mjs rollback --company <UUID_EMPRESA> --only <SALIDA>/plan/batches/batch-001.txt --dump sinabe.sql --out <SALIDA>/reversion-piloto
```

## 7. Decisiones de mapeo que el cliente debe conocer

- Número de activo: se usa el número de activo de sinabe si no está vacío ni repetido; si no, el
  folio interno (si es único); si tampoco, `SINABE-<8 primeros caracteres del id>`. El número
  original siempre queda en el campo "Número de activo (sinabe)" y el folio en
  "Folio interno (sinabe)".
- Condición: se elige la peor (Descompuesto > En Reparación > En Mantenimiento > Usado >
  Semi Nuevo > Nuevo > otras); la lista completa queda en "Condiciones (sinabe)".
- Verticales del modelo → campo "Vertical". Los campos personalizados y los `details` de sinabe
  se vuelven campos personalizados de texto.
- Estados: ALTA → registrado, PROPUESTA → propuesta de baja, BAJA → dado de baja (motivo "otro").
  Sin fecha de alta se usa la fecha de creación; sin fecha de baja, la última actualización
  (advertencias `ALTA_DATE_FROM_CREATED_AT` y `BAJA_DATE_FROM_UPDATED_AT`). Las fechas se
  convierten a día de la zona `America/Mexico_City` (`--timezone` para otra).
- Activos eliminados en sinabe (`enabled = false`) se migran deshabilitados.
- Órdenes de compra → cerradas; facturas → pagadas, con PDF/XML y folio fiscal leído del XML.
- El responsable actual de cada activo sale de su último resguardo completado.
- La bitácora de sinabe de cada activo se vuelve comentarios del activo con su fecha original,
  firmados por el perfil `--actor`.

## 8. Opciones

| Opción | Uso |
|---|---|
| `--dump` | Archivo `.sql` de mysqldump |
| `--listing` | Listado TSV de `uploads` (recomendado: evita pedir archivos que no existen) |
| `--files-dir` / `--files-base-url` | Origen de los archivos (carpeta local o nginx de sinabe) |
| `--company` / `--actor` | Empresa destino y perfil autor |
| `--source` | Nombre del origen en Runly (por defecto `sinabe`) |
| `--dry-run` / `--commit` | Simular (por defecto) o escribir |
| `--batch-size` | Activos por lote (50) |
| `--only` | Archivo con ids de inventario de sinabe (uno por línea) |
| `--rate` | Límite de bytes por segundo al leer archivos |
| `--pause-ms` | Pausa entre lotes |
| `--max-errors` | Aborta limpio al superar ese número de errores |
| `--deliverers-map` | JSON correo → perfil de Runly para quien entrega |
| `--max-file-mb` | Tamaño máximo por archivo (50) |
| `--out` | Carpeta de reportes |
