# Obtener un respaldo completo de la external para el ensayo de actualizacion

Estado: **procedimiento ensayado en local con recursos desechables (Paso 0 ejecutado el 2026-10-28);
nada se ha ejecutado contra produccion ni con datos reales.** El ensayo corrio el flujo real de
respaldo y recuperacion de Runly sobre dos instalaciones Supabase desechables independientes y un MinIO
local, y encontro varios fallos del procedimiento original que ya estan corregidos aqui (C.3, B.2, B.3).
Resultados, hallazgos del producto, limites y dictamen en la **seccion D**; comandos efectivos en
`BACKUP_RESTORE_REHEARSAL_COMMANDS.md`. Lo no cubierto por el ensayo se lista en D.6.

Los valores entre `<...>` son marcadores. Ningun secreto, direccion real, nombre de bucket ni
identificador de instancia se escribe aqui ni se pega en la conversacion: viven en el gestor
de secretos del operador.

Las decisiones ya tomadas para el ensayo (se conservan identidades, empresas, membresias,
permisos, notas y todos los objetos de Storage; salida de red bloqueada y verificada antes de
arrancar API, Worker o servicios con tareas; neutralizacion solo en la copia; credenciales de
propietario exclusivas de la replica; sin datos sinteticos) se aplican a todo el documento.

## 0. Que hay realmente en el repositorio (hechos y vacios)

El sistema de respaldos de Runly (`docs/deployment/backup-recovery.md`, `backup-acceptance.md`):

- Es **opcional** (`BACKUP_MODE=enabled`). Un contenedor `runly-backup-external` (perfil
  `backup-external`) ejecuta cada noche `run-backup.sh`: `pg_dump -Fc` de **una** base
  (`DATABASE_URL`), copia de **todos los buckets** de Storage por S3 (necesita
  `BACKUP_STORAGE_S3_*`), copia de los modulos personalizados y de `.env.external`, y un
  `backup-manifest.json` con SHA-256 y tamano de cada archivo. Lo sube con **restic**
  (cifrado, repositorio S3) como snapshot "pendiente", ejecuta `restic check` y solo entonces
  lo etiqueta `runly-complete-v1`. Despues aplica retencion (`forget --prune`) solo sobre
  snapshots verificados de la misma cobertura.
- Si el contenedor no esta, o `BACKUP_MODE` no esta habilitado, **no hay respaldo automatico**.
  Nada en este equipo dice si la external real lo tiene activo.
- `verify-backup.sh` comprueba, en solo lectura (`--no-lock`), que existe un snapshot completo
  verificado, que su antiguedad esta dentro de `BACKUP_MAX_AGE_HOURS` (36 por defecto) y que el
  repositorio pasa `restic check`.
- `scripts/recovery/runly-recovery.mjs` (`inspect`, `extract`, `assess`) lista y extrae
  snapshots desde un equipo del operador, sin bloquear el repositorio, y clasifica la cobertura
  (`complete-declared`, `database-only`, `legacy-unknown`).
- **Vacios que importan para este ensayo**:
  1. **Nunca se ha hecho un ensayo de recuperacion con el repositorio real** (el documento de
     aceptacion lo dice: solo infraestructura sintetica). Una revision de solo presencia, fechada el
     2026-10-12, tampoco encontro en los archivos habituales del equipo ningun campo de
     recuperacion ni la contrasena original de restic. Un respaldo que existe pero cuya contrasena se perdio **no se puede leer**, y no se
     puede sustituir por una nueva.
  2. **Los roles globales no estan en el respaldo.** `pg_dump -Fc` guarda los objetos de la base
     y sus permisos (`GRANT`), pero no los roles del cluster (ni sus atributos, membresias o
     `ALTER ROLE ... SET`). Para este ensayo basta con un Supabase nuevo de la misma version (trae
     `anon`, `authenticated`, `service_role`, `supabase_*`) mas el rol propio de Runly
     (`runly_studio_socket`, que crean las migraciones y el Installer); pero hay que **auditar**
     la diferencia de roles (ver B.4).
  3. **El respaldo contiene secretos de produccion**: `.env.external` entra completo en el
     snapshot y la base lleva valores cifrados con claves del entorno (ver 5.2). Hay que tratarlo
     como material secreto.
  4. La consistencia es "metadatos estables, no atomica" (`consistency: metadata-stable-not-atomic`):
     el inventario de Storage se compara antes y despues de la copia y el respaldo falla si
     cambio, pero un objeto subido durante la copia puede no estar. `pg_dump` en cambio es una
     instantanea consistente de la base.
  5. La imagen de respaldo (`postgres:17-alpine`) trae `pg_dump` 17: sirve para servidores
     PostgreSQL 17 o anteriores. `backup-coverage.mjs` se niega a respaldar si `pg_dump` es mas
     antiguo que el servidor.
  6. `docker/backup` descarga binarios de GitHub al construirse; una imagen oficial fija
     (`raulbellosom/runlyerp:backup-<version>`) o un id local `sha256:` es obligatorio para
     `runly-recovery.mjs` (rechaza `latest`).

## 1. Que procedimiento es el mas seguro

| Opcion | Que hace | Riesgo en produccion | Veredicto |
|---|---|---|---|
| **A. Usar un respaldo existente** | Leerlo desde el equipo del operador con una credencial de solo lectura | Ninguno: no toca el servidor ni la base; solo lee el repositorio de respaldos | **Primera opcion** si existe y es legible |
| **B1. Ejecutar una vez el trabajo de respaldo del producto contra el repositorio actual** | Reutiliza `run-backup.sh` | Escribe un snapshot nuevo y **ejecuta `forget --prune`** sobre el historial de respaldos de produccion; si no esta configurado, exige cambiar produccion | No recomendado |
| **B2. Ejecutar una vez el mismo codigo hacia un repositorio temporal propio del ensayo** | Mismo `run-backup.sh`, imagen fijada, con un bucket y contrasena de restic **nuevos** y una copia **redactada** de `.env.external` como fuente de configuracion | Lee la base (`pg_dump`: bloqueos `ACCESS SHARE`, no bloquea escrituras) y Storage; no modifica configuracion, contenedores ni el repositorio de respaldos existente | **Recomendado** si no hay respaldo utilizable |
| **B3. Exportacion manual con herramientas nativas** | `pg_dump`, `pg_dumpall --roles-only`, copia de objetos, manifiesto propio | Igual lectura, pero codigo y verificaciones a medida | Solo si la imagen de respaldo no se puede usar |

Por que B2 y no B1: el respaldo "propio del ensayo" no mezcla datos de ensayo con la retencion
de produccion, se cifra con una contrasena unica que solo existe para este fin, se puede destruir
al terminar (bucket y clave) y no cambia nada de lo instalado. Por que no B3: B2 ya valida
inventario, tamanos, compatibilidad de version de `pg_dump` y deriva del inventario; repetirlo a
mano multiplica los puntos de error.

Regla para toda la operacion en produccion: **ninguna edicion de `.env.external`, ninguna
reinstalacion, ningun reinicio, ningun cambio de contenedores.** Solo se ejecuta un contenedor
efimero de lectura.

---

# Parte 1: diagnostico de solo lectura (puede hacerse sin autorizacion de generacion)

Objetivo: saber si **ya existe** un respaldo completo y recuperable. Ninguna orden escribe en
produccion ni en el repositorio de respaldos. Las salidas que se compartan deben ser solo las
que este documento marca como seguras; todo lo demas se revisa en local.

## A.1 Del equipo del operador (preferido: no toca el servidor)

Necesita el "kit de recuperacion" original, que debe estar en el gestor de secretos: endpoint y
bucket del repositorio de respaldos, `RUNLY_INSTANCE_ID`, una credencial **de solo lectura**
(`listBucket`/`listFiles`/`readFiles` en B2; sin escritura ni borrado) y la contrasena de restic
original.

1. Crear un archivo privado `.env.recovery` (permisos solo del usuario) con exactamente los
   nombres `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `RUNLY_INSTANCE_ID`,
   `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`, `RESTIC_PASSWORD` y opcionalmente
   `BACKUP_S3_REGION`. Rellenarlo directamente desde el gestor; **nunca** pegarlo en chats.
2. Tener una imagen de respaldo **fija y local** (`raulbellosom/runlyerp:backup-<version>` o el id
   `sha256:` de una imagen construida de este repositorio con `docker build -f
   infra/docker/backup.Dockerfile`). Sin `latest`.
3. Listar (solo lectura, sin bloqueo):
   `node scripts/recovery/runly-recovery.mjs inspect --config <ruta a .env.recovery> --image <imagen>`.
   Salida: ids, fechas y clasificacion de cobertura de cada snapshot. Es seguro compartir la
   **clasificacion y la fecha** (no hace falta compartir ids).
4. Si la contrasena es incorrecta o falta, `inspect` falla: **eso responde la pregunta**:
   los snapshots existentes no son legibles. No intentar contrasenas; pasar a la Parte 2.

## A.2 En el servidor, solo si no hay kit (el operador, sin cambiar nada)

Cada orden es de lectura. No pegar salidas completas en la conversacion.

```text
# 1. Hay respaldo configurado? Solo nombres y si tienen valor (no los valores).
awk -F= '/^(BACKUP_MODE|BACKUP_COVERAGE_MODE|BACKUP_MAX_AGE_HOURS|BACKUP_S3_ENDPOINT|BACKUP_S3_BUCKET|BACKUP_S3_ACCESS_KEY_ID|BACKUP_S3_SECRET_ACCESS_KEY|RESTIC_PASSWORD|BACKUP_STORAGE_S3_ENDPOINT|BACKUP_STORAGE_S3_ACCESS_KEY_ID|BACKUP_STORAGE_S3_SECRET_ACCESS_KEY)=/ {print $1, ($2=="" ? "VACIO" : "definido")}' .env.external
# Es seguro compartir esta salida: nunca imprime valores.

# 2. Existe y esta corriendo el contenedor de respaldo? Imagen y estado.
docker ps -a --filter "name=backup-external" --format '{{.Names}} | {{.Status}} | {{.Image}}'

# 3. La imagen en uso conoce el modo "complete"? Solo nombres de archivo.
docker exec <contenedor-de-respaldo> ls /app

# 4. Estado del respaldo segun el propio verificador (solo lectura: restic --no-lock).
docker exec <contenedor-de-respaldo> ./verify-backup.sh ; echo "codigo=$?"
```

Lectura de resultados:

- `/app` debe contener `backup-coverage.mjs` y `verify-backup.sh`; si no, el contenedor usa una
  imagen anterior al modo "complete" y sus snapshots son `legacy-unknown`.
- `verify-backup.sh` imprime `[verify] OK: verified complete snapshot within <N> hours` o
  `FAILED`. Solo imprime frases fijas (no endpoints ni claves): es seguro compartir la linea y el
  codigo de salida. Un `FAILED` o un error de "no snapshot with verified matching coverage"
  significa que **no hay respaldo completo vigente**.
- Registros recientes: revisar localmente; para compartir, solo conteos de lineas
  `backup run complete` y `FAILED` por fecha (los errores de `restic` pueden incluir direcciones).
- En la consola del proveedor del almacenamiento de respaldos, verificar la **fecha del ultimo
  archivo bajo el prefijo `snapshots/` de la instancia** (sin copiar claves).
- Preguntas para el operador: ¿existen ademas copias del proveedor de base de datos o
  instantaneas de disco/VM? (fuentes alternativas con otro procedimiento de restauracion).

## A.3 Criterios de "completo y recuperable"

Un respaldo sirve para el ensayo si cumple **todo** esto; el ultimo punto solo se demuestra
restaurando:

1. Snapshot con etiqueta `runly-complete-v1` y sin `runly-pending-v1`, del host
   `RUNLY_INSTANCE_ID` de la instancia.
2. `assess` (tras `extract`) informa `database`, `storage`, `modules` y `config` como
   `complete`, y los SHA-256 y tamanos del manifiesto coinciden con los archivos.
3. `restic check` sin errores (lo hace `verify-backup.sh`; opcionalmente
   `check --read-data-subset=5%` para leer una muestra real del contenido).
4. Se conserva la contrasena de restic original y la credencial de lectura.
5. Versiones compatibles: el manifiesto trae `serverMajor`/`dumpMajor` del dump y las
   referencias de imagen configuradas; hay que reunir ademas, en el servidor, los **digests de las
   imagenes realmente en ejecucion** (`docker image inspect`), porque lo configurado no prueba lo
   que corre.
6. **Se restaura sin errores inesperados en una replica aislada** (Parte 3). Sin esto es
   "probablemente recuperable", no "recuperable".
7. Antiguedad: el estado que se quiere ensayar es el de produccion **despues del intento
   fallido** (migraciones aplicadas, bucket sin cerrar). Un snapshot anterior al intento tiene el
   esquema anterior; sirve igualmente, pero entonces el estado intermedio se reproduce aplicando
   las migraciones con el Installer `.5` en la replica (se hizo asi en la replica sintetica).

## A.4 Decision

| Hallazgo | Conclusion | Siguiente paso |
|---|---|---|
| Snapshot completo reciente, kit disponible | Hay respaldo utilizable | Ir a la Parte 3 (restaurar); **no se genera nada nuevo** |
| Completo pero antiguo | Utilizable con otra linea base | Decidir con el responsable: ensayar desde ese estado, o Parte 2 |
| Solo `database-only` o `legacy-unknown` | Storage no cubierto | Parte 2 (o exportacion de Storage por separado) |
| Respaldo deshabilitado o sin contenedor | No hay respaldo | Parte 2 |
| Contrasena de restic perdida | Snapshots existentes ilegibles | Parte 2 y registrar el hallazgo: la instancia no tiene respaldo recuperable |
| `inspect` o `verify` fallan por credencial | Indeterminado | Reunir el kit correcto; no improvisar acceso |

---

# Parte 2: generacion y traslado seguro de un respaldo (solo con autorizacion expresa)

**No ejecutar sin autorizacion explicita del responsable de la instalacion.** Esta parte
modifica el servidor de forma minima (un contenedor efimero de lectura) y crea datos nuevos
(un repositorio temporal con datos personales reales).

## B.0 Paso 0: ensayar el propio procedimiento de respaldo en el entorno desechable

**Ejecutado.** La secuencia (imagen fija, repositorio temporal, configuracion redactada, extraccion,
comprobaciones, restauracion en una segunda instalacion, auditoria, aislamiento y fallos simulados)
esta automatizada en `scripts/rehearsal/verify-backup-restore.mjs` y se puede repetir antes de cada uso:

```text
node scripts/rehearsal/verify-backup-restore.mjs --run=<id> --api-image=<api certificada> --worker-image=<worker certificado> --backup-image=<imagen de respaldo fija> --stage=all
```

Las etapas son `source`, `prepare`, `backup`, `verify`, `diagnostic`, `roles`, `replica`, `audit`, `isolation` y
`failures`, y se pueden lanzar por separado sobre la misma ejecucion. Los comandos de redaccion y filtrado de B.2 y
B.3 no estan reescritos en el arnes: se leen **del texto de este documento** y se ejecutan tal cual, de modo que lo que
el operador copia es lo que se probo. Resultados en la seccion D.

## B.1 Precondiciones

1. Autorizacion escrita del responsable; ventana sin migraciones ni despliegues en curso
   (`pg_dump` toma bloqueos de lectura que pueden hacer esperar un `ALTER TABLE`).
2. Imagen de respaldo fija ya presente en el servidor (`docker image inspect`; sin descargas de
   ultimo momento), con `pg_dump` >= version del servidor PostgreSQL.
3. Un **bucket temporal nuevo** para el ensayo y una **clave de aplicacion nueva** limitada a ese
   bucket; una **contrasena de restic nueva y unica** (`openssl rand -base64 32`), guardada solo
   en el gestor de secretos.
4. Credenciales de Storage por protocolo S3 (`BACKUP_STORAGE_S3_*`) con permiso de lectura.
   Las claves S3 de Supabase Storage suelen ser amplias; usar una clave creada para esta
   operacion y revocarla al terminar.
5. Espacio para el volcado y los objetos en el servidor (el trabajo usa un directorio temporal
   del contenedor) y en el equipo de ensayo.
6. Lugar de custodia: equipo de ensayo con **disco cifrado** (BitLocker/LUKS), acceso restringido
   y sin sincronizacion a la nube.

## B.2 Configuracion redactada (los secretos de produccion no entran al respaldo)

`run-backup.sh` copia `/config-source/.env.external` al snapshot. En este ensayo se monta en esa
ruta una **copia redactada**, no el archivo real (las credenciales de ejecucion llegan por
`--env-file`, no por esa copia):

```text
awk -F= '/^[A-Za-z0-9_]+=/ { if ($1 ~ /(SECRET|PASS|TOKEN|KEY|CREDENTIAL|DATABASE_URL|DIRECT_URL|_URL$|ENDPOINT|BUCKET|HOST|DOMAIN|ORIGIN|EMAIL|_USER$)/) { print $1"="; next } } { print }' .env.external > env.external.redactada
# Debe imprimir 0:
grep -E -c '^[A-Za-z0-9_]*(SECRET|PASS|TOKEN|KEY|CREDENTIAL)[A-Za-z0-9_]*=.+' env.external.redactada
```

Se conservan modos, etiquetas de imagen, puertos e `RUNLY_INSTANCE_ID` (sirven para saber con
que version se levanto la instalacion); se vacian secretos, URLs, buckets, hosts, dominios y
correos. Un nombre de variable inesperado puede escapar a la regla: revisar el archivo a ojo
antes de usarlo.

## B.3 Ejecutar el respaldo (un contenedor efimero)

Mismas fuentes que el servicio del producto, pero con repositorio y contrasena propios. Para que
**ninguna variable de respaldo de produccion pueda colarse** (ni el repositorio, ni la
contrasena de restic), el archivo de entorno que se pasa al contenedor se filtra primero y las
variables de respaldo se entregan solo desde el entorno del operador:

```text
# 1. Entorno de la base y de la instancia, SIN variables de respaldo ni de correo.
grep -v -E '^(BACKUP_|RESTIC_|SMTP_)' .env.external > env.sin-respaldo
# Debe imprimir 0 (si imprime otro numero, detener):
grep -c -E '^(BACKUP_|RESTIC_|SMTP_)' env.sin-respaldo

# 2. Las variables del ensayo se exportan desde el gestor de secretos en esta sesion
#    (BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY,
#     RESTIC_PASSWORD, BACKUP_STORAGE_S3_ENDPOINT, BACKUP_STORAGE_S3_ACCESS_KEY_ID,
#     BACKUP_STORAGE_S3_SECRET_ACCESS_KEY): del bucket y la clave temporales.
docker run --rm --name runly-respaldo-ensayo \
  --env-file env.sin-respaldo \
  -e BACKUP_S3_ENDPOINT -e BACKUP_S3_BUCKET -e BACKUP_S3_ACCESS_KEY_ID -e BACKUP_S3_SECRET_ACCESS_KEY \
  -e RESTIC_PASSWORD -e BACKUP_STORAGE_S3_ENDPOINT -e BACKUP_STORAGE_S3_ACCESS_KEY_ID \
  -e BACKUP_STORAGE_S3_SECRET_ACCESS_KEY -e BACKUP_COVERAGE_MODE=complete \
  -v "$PWD/env.external.redactada:/config-source/.env.external:ro" \
  -v "$PWD/custom-modules:/modules-source:ro" \
  <imagen de respaldo fija> ./run-backup.sh
```

`-e NOMBRE` sin valor toma el valor del entorno del proceso del operador (exportado desde el
gestor): no queda escrito en la linea de comandos ni en el historial. No usar `docker inspect`
sin filtrar para "comprobar": imprime los valores del entorno. Si hace falta confirmar, listar
solo los nombres (`... --format '{{range .Config.Env}}{{println .}}{{end}}' | cut -d= -f1`).
`run-backup.sh` termina con `restic forget --prune`: sobre un repositorio nuevo no borra nada.

**Por que tambien se quita `SMTP_*`** (observado en el ensayo): si el trabajo falla, `run-backup.sh` intenta enviar un
correo de alerta con el SMTP del entorno a `RUNLY_SUPPORT_EMAIL` o, si no existe, a la direccion de soporte por
defecto. Con el SMTP de produccion en el entorno, un fallo del ensayo enviaria un correo real desde produccion. Sin
`SMTP_HOST` el trabajo solo registra `cannot send failure alert` y sigue.

El trabajo termina con `[backup] ... backup run complete (complete)` o falla sin publicar un
snapshot completo.

## B.4 Roles y datos que `pg_dump` no incluye (auditoria)

Con la misma red y variables de la base, en solo lectura:

```text
# Roles del cluster SIN contrasenas (no sirve para restaurar claves; sirve para comparar).
pg_dumpall --roles-only --no-role-passwords -f roles.sql
# Configuracion por rol/base y extensiones (consultas de lectura).
psql -XAt -c "SELECT rolname, rolsuper, rolcanlogin, rolbypassrls FROM pg_roles ORDER BY 1" > roles-atributos.txt
psql -XAt -c "SELECT * FROM pg_db_role_setting" > roles-config.txt
psql -XAt -c "SELECT extname, extversion FROM pg_extension ORDER BY 1" > extensiones.txt
psql -XAt -c "SELECT migration_name, finished_at IS NOT NULL FROM _prisma_migrations ORDER BY 1" > migraciones.txt
```

Estos archivos no contienen contrasenas ni datos de negocio; se cifran junto al resto (B.5).
Los roles estandar de Supabase vienen con el stack nuevo; de Runly solo hace falta
`runly_studio_socket` (lo crean las migraciones y el SQL del propietario). Cualquier otro rol
personalizado que aparezca en `roles-atributos.txt` debe revisarse antes de restaurar.

## B.5 Verificar el respaldo recien creado (sin tocar produccion)

Desde el equipo de ensayo, con una credencial de **solo lectura** del bucket temporal:

1. `inspect` (A.1): el snapshot aparece con cobertura `complete-declared`.
2. `extract` a una carpeta nueva en el volumen cifrado, y `assess`: cobertura completa y SHA-256
   del manifiesto correctos. `restic restore --verify` ya comprueba el contenido restaurado.
3. Guardar fuera del snapshot (cifrado con una clave del operador, p. ej. `age` o `gpg`) los
   archivos de B.4 y las huellas del manifiesto.
4. Anotar: fecha del snapshot (edad de los datos), version de PostgreSQL, tamano, numero de
   objetos por bucket (todo viene en `backup-manifest.json` y `storage-metadata.json`).

## B.6 Traslado y custodia

- Camino: produccion -> repositorio restic cifrado en el bucket temporal -> equipo de ensayo. No
  hay copia directa del servidor al equipo; el servidor solo escribe en el bucket temporal.
- Cifrado en transito: HTTPS (`runly-recovery.mjs` rechaza HTTP salvo loopback); para la base,
  la conexion que ya usa la instalacion (`sslmode` segun su `DATABASE_URL`).
- Cifrado en reposo: restic (AES-256 con autenticacion) con la contrasena unica; en el equipo de
  ensayo, disco cifrado. La contrasena del ensayo nunca viaja junto al archivo ni al correo.
- Al terminar el ensayo: revocar la clave del bucket temporal, borrar el bucket, destruir el
  directorio extraido y los volumenes de la replica, y registrar la destruccion. La replica
  contiene datos personales reales: mismos controles que produccion hasta su borrado.

---

# Parte 3: restauracion en la replica, consistencia y aislamiento

Se ejecuta con un respaldo obtenido por la Parte 1 (existente) o la Parte 2 (nuevo). Antes de
empezar, la maquina de ensayo no debe tener ninguna credencial de produccion.

## C.1 Aislamiento de red (antes de arrancar nada que ejecute tareas)

1. Crear una red Docker **interna** para todos los servicios de la replica:
   `docker network create --internal runly-ensayo`. Una red interna no tiene puerta de enlace:
   sus contenedores no alcanzan Internet, la red local ni el anfitrion.
2. Servicios (base, Auth, Realtime, Storage, Kong, API, Worker, Web) solo en esa red. Para usar la
   replica desde el navegador, un unico contenedor "frontal" (proxy inverso sin credenciales de
   aplicacion) conectado a la red interna y a una red normal, que publica **solo en
   `127.0.0.1`**.
3. Comprobaciones **obligatorias antes de arrancar API, Worker o cualquier servicio con tareas**
   (desde un contenedor de la red interna con la imagen de la API), todas deben fallar:
   - `fetch('https://example.com')`;
   - resolver un nombre publico (DNS);
   - conectar con el dominio de produccion, con su direccion, con los rangos privados
     (RFC 1918: los tres bloques de redes locales) y con la puerta de enlace del anfitrion.
   Si cualquiera responde, **detener**: la replica tiene salida.
4. En un anfitrion Linux dedicado anadir ademas una regla de salida `DOCKER-USER` que descarte
   el trafico de la subred de la replica; en Docker Desktop, la red interna es la barrera y,
   para datos reales, preferir una maquina virtual sin ruta de salida.

## C.2 Credenciales y claves exclusivas de la replica

- Stack Supabase nuevo con **todas** sus claves propias (JWT, anon, service role, contrasenas de
  base, propietario de Storage = rol de la base de la replica). Ningun valor sale del `config/`
  del respaldo ni de produccion.
- **Esto neutraliza por construccion datos cifrados de la copia**: la contrasena SMTP guardada
  en la base se cifra con una clave derivada de `JWT_SECRET`
  (`apps/api/src/services/smtp-service.js`); las claves VAPID de web push, con
  `SUPABASE_SERVICE_ROLE_KEY` o `JWT_SECRET` (`web-push-service.js`); los tokens de Google, con
  `GOOGLE_OAUTH_ENCRYPTION_KEY` (`google-token-crypto.js`). Con claves distintas esos
  valores **no se pueden descifrar**: la replica no puede enviar correo, push ni llamar a Google
  en nombre de nadie aunque tuviera salida. Efecto en el ensayo: esas funciones fallaran;
  registrarlas como "inertes por diseno", no como fallos de la actualizacion. **Nunca** copiar
  esas claves de produccion a la replica. Comprobado (D): el valor cifrado no se descifra con la clave de la replica y
  si con la clave original guardada en el respaldo integral.
- **Las claves nuevas NO neutralizan todo.** No cubren las URLs ni los webhooks, las credenciales guardadas en claro,
  las automatizaciones, los calendarios de ejecucion, las colas de entrega pendientes ni las tablas de modulos propios.
  En el ensayo la auditoria de la copia encontro ocho capacidades activas y credenciales en claro (una clave de API en
  una tabla de un modulo, otra en `instance_config`, un encabezado `Authorization` dentro de una automatizacion). Por eso
  C.5 es obligatoria y el aislamiento de red (C.1) es la garantia que no depende de que la auditoria sea exhaustiva.
- `RUNLY_INSTANCE_ID` propio y distinto del de produccion; `BACKUP_MODE=disabled`.
- Aplicar `node scripts/rehearsal/replica-guard.mjs --print-overrides` al entorno de la replica y
  verificar con `replica-guard.mjs --env-file=...` (sale con error si algo apunta fuera o lleva una
  credencial real; imprime solo nombres). Ahora tambien apaga MCP (`RUNLY_MCP_ENABLED=false`).

## C.3 Restaurar (probado: orden y comandos efectivos)

Orden que funciono de punta a punta (detalle y comandos literales en
`BACKUP_RESTORE_REHEARSAL_COMMANDS.md`). Cualquier otro orden dio errores o una replica mas abierta que el origen.

1. Extraer en carpeta nueva del volumen cifrado (`extract`, luego `assess`). Si el respaldo es el
   **integral**, mover `config/` a una carpeta aparte con acceso restringido y borrar la extraccion;
   **nunca** apuntar la replica a ese archivo.
2. Levantar **solo la base** del Supabase nuevo (misma version que produccion). No arrancar Auth, Storage,
   Realtime ni Kong todavia: los servicios crean y migran sus propios esquemas, y un `DROP` sobre tablas en uso
   es innecesario.
3. **Roles** (propietario del cluster, `supabase_admin`): aplicar del volcado `--roles-only --no-role-passwords`
   solo las sentencias de los roles que la replica **no** tiene (`scripts/rehearsal/lib/roles.mjs`,
   `missingRoleStatements`). Sin este paso `pg_restore` falla con `role "..." does not exist` (observado con los roles
   propios de la instalacion y con `supabase_realtime_admin`, que lo crea el servicio Realtime al arrancar y por eso no
   existe en una base recien levantada). Nunca se toca un rol existente.
4. **Vaciar los privilegios por defecto de la replica** (`scripts/rehearsal/lib/privileges.mjs`,
   `resetDefaultPrivileges`). Un Supabase nuevo concede por defecto todo a `anon` y `authenticated` sobre cada tabla nueva
   de `public`; `pg_restore` crea las tablas bajo esos privilegios y el volcado solo **anade** `GRANT`, nunca quita los de
   fabrica. Observado sin este paso: la replica tenia 4.840 privilegios de mas (`anon` y `authenticated` con todos los
   privilegios en las 304 tablas de `public`), mientras que el origen no daba ninguno a `anon`. Con el vaciado, el volcado
   reinstala los privilegios por defecto y las ACL del origen y el resumen de ACL de la replica coincide con el del origen.
5. `pg_restore --clean --if-exists -N _realtime --dbname postgres /restore/db.dump` con la imagen de respaldo fija,
   como `supabase_admin` (para que se apliquen los propietarios de los esquemas `auth` y `storage`), en la red de la
   replica y con la contrasena **de la replica** por entorno. `-N _realtime` deja que Realtime cree su propio inquilino
   (el original lleva claves cifradas del servicio de origen). Resultado observado: salida 0 y **cero** lineas de error.
   Si hay errores, clasificar cada uno contra un restore de control; ninguno se oculta.
6. Levantar Auth, Rest, Realtime, Storage y Kong de la replica.
7. **Objetos de Storage**: tras el paso 5 las filas de `storage.objects` ya existen pero los archivos no. Sin precaucion,
   `rclone copy` ve "el objeto ya esta" y pide una copia en el servidor (`CopyObject`), que Storage responde con 500.
   Subir con `--no-check-dest` (via el endpoint S3 de la replica y las claves S3 **de la replica**, conservando
   `<bucket>/<ruta>`). El endpoint S3 debe usar exactamente el host de `STORAGE_PUBLIC_URL` de esa replica (ver B.3).
8. Tomar el inventario de la replica y compararlo con el del origen (`C.4`).

## C.4 Verificaciones de consistencia entre base y objetos

Todas de solo lectura en la replica, antes de neutralizar y antes de actualizar.

1. **Objetos vs manifiesto**: el SHA-256 de cada objeto descargado de la replica (inventario 0)
   debe ser igual al `sha256` de `backup-manifest.json` para `storage/<bucket>/<ruta>`; ni un
   objeto de mas ni de menos, y los mismos buckets (`storage-metadata.json`).
2. **`storage.objects` vs archivos**: cada fila tiene su archivo (lo cubre el punto 1: ninguno
   `UNREADABLE`) y el tamano coincide con `metadata->>'size'`.
3. **Archivos de la aplicacion vs Storage** (`file_asset` enlaza `bucket` y `object_key`):
   ```sql
   -- registros activos sin objeto
   SELECT f.id, f.bucket FROM file_asset f
   LEFT JOIN storage.objects o ON o.bucket_id = f.bucket AND o.name = f.object_key
   WHERE f.enabled AND o.id IS NULL;
   -- tamano distinto
   SELECT f.id FROM file_asset f JOIN storage.objects o ON o.bucket_id = f.bucket AND o.name = f.object_key
   WHERE f.size_bytes <> (o.metadata->>'size')::bigint;
   ```
   Se espera cero filas; cada fila se explica una a una (puede ser previa al respaldo).
4. **Notas** (no ejecutado en el ensayo; queda para la copia real): con la imagen de la API certificada, el inventario de solo lectura de Notes
   (`node apps/api/scripts/notes-storage-preflight.mjs --inventory --output=<ruta privada>` con
   las variables de la replica) compara las referencias de imagen en notas, Y.Doc y lienzos con los
   objetos; no mueve ni borra nada.
5. **Identidad, permisos y privilegios** (comprobado): conteos y resumenes semanticos de usuarios, empresas, membresias y
   concesiones, resumen de los hashes de acceso (`auth.users`, sin exponerlos), roles y membresias de roles, resumen de las ACL de
   todos los objetos y privilegios por defecto (`scripts/rehearsal/lib/inventory.mjs`), contra la fecha del snapshot (no contra produccion en
   vivo: la base sigue cambiando; el volcado es una instantanea consistente).
6. **Migraciones**: `_prisma_migrations` define si la replica esta en estado previo o
   intermedio (con `20261028011349_notes_private_images` y
   `20261211000000_studio_retired_asset_lineage`).

No se ejecuta el inventario completo contra produccion: calcula un hash por tabla y es costoso. Los puntos 1, 2, 3 y 5 se
ejecutaron en el ensayo (inventario identico: 304 tablas, 226 migraciones, 19 roles, 7 objetos, 0 huerfanos).

## C.5 Neutralizacion en la copia (nunca en el respaldo)

Orden: **red bloqueada y verificada (C.1) -> claves propias (C.2) -> datos**. El aislamiento de red
es la garantia fuerte; la neutralizacion de datos es una segunda capa para evitar reintentos y
ruido.

- Implementado y probado en `scripts/rehearsal/lib/audit-data.mjs` (auditoria de solo lectura, sin imprimir valores) y
  `neutralize.mjs` (una transaccion, solo la replica, con "compuerta": API y Worker no arrancan mientras quede una capacidad
  activa o un hallazgo sin revisar). Con la base restaurada y la API/Worker detenidos, usar el inventario (`externalReach`) para
  listar las tablas con alcance externo (entregas de notificaciones, tokens push/FCM,
  suscripciones, conexiones de calendario y de modulo, eventos de webhook, tareas y automatizaciones
  programadas) y las claves de `instance_config` relacionadas.
- Escribir un archivo SQL revisado por el responsable que, **solo en la replica**, cancele entregas
  pendientes, vacie tokens y suscripciones, deshabilite automatizaciones, tareas programadas y
  webhooks, y anule credenciales de conexion. Guardar el archivo y su efecto (filas afectadas) en
  el expediente del ensayo. El inventario base del ensayo se toma **despues** de esta
  neutralizacion y se compara con el inventario 0 para saber exactamente que cambio.
- No se modifican filas de negocio (notas, archivos, usuarios, empresas, permisos).

## C.6 Garantias de que el ensayo no puede afectar a produccion

| Control | Como se comprueba |
|---|---|
| Sin ruta de red a produccion ni a Internet | Pruebas de C.1 (todas deben fallar) antes de arrancar servicios con tareas |
| Sin credenciales de produccion en el equipo | `replica-guard`; busqueda de las claves en el gestor y en `config/` movido aparte; claves de la replica generadas nuevas |
| Los datos cifrados con claves de produccion son inertes | C.2: claves distintas; se comprueba intentando una accion de correo/push en la replica y viendo que falla al descifrar |
| La replica no escribe en los respaldos de produccion | `BACKUP_MODE=disabled`, `RUNLY_INSTANCE_ID` distinto, sin claves de respaldo en su entorno |
| El respaldo original no se altera | Solo se lee con `--no-lock`; el ensayo usa el bucket temporal; `restic restore --verify` |
| Una sola direccion de datos | Produccion -> bucket temporal (cifrado) -> equipo de ensayo; nada vuelve |
| Salida de logs | Los scripts de este repositorio imprimen nombres, nunca valores |
| Parada de emergencia | `docker network rm runly-ensayo` y `docker compose down -v` en el proyecto del ensayo; revocar la clave del bucket temporal |

## C.7 Despues

Continuar con el plan del ensayo (`EXTERNAL_UPDATE_REHEARSAL_PLAN.md`, Fase 3): primero la
actualizacion **sin** credencial de propietario, comparando inventarios; despues, desde un estado
restaurado conocido, con la credencial exclusiva de la replica; luego la interrupcion controlada
y las metricas.

---

# Seccion D. Resultados del Paso 0: ensayo local de respaldo y recuperacion (2026-10-28)

Todo con recursos desechables propios: dos instalaciones Supabase independientes (origen y replica), un MinIO local con
credenciales generadas, Docker en esta maquina. Sin produccion, sin SSH, sin credenciales reales, sin publicar nada.

## D.1 Que se ejecuto

| Elemento | Valor |
|---|---|
| Arnes | `scripts/rehearsal/verify-backup-restore.mjs` (etapas `source`, `prepare`, `backup`, `verify`, `diagnostic`, `roles`, `replica`, `audit`, `isolation`, `failures`) |
| Resultado final (ejecucion `r4`, mas la etapa `diagnostic`) | **63 de 64 comprobaciones superadas, 1 hallazgo del producto, 0 fallos** |
| API y Worker certificados usados para la instalacion y la recuperacion | `runly-notifications:api-40e1b6b0a6d6` (`sha256:42101cf2c44162522a4dd1c83b4b0ad96df9c8ceb589b8f3388415a28247766a`) y `worker-40e1b6b0a6d6` (`sha256:d08b38102dad335fe02d7256840de4ab10941fc7ee51be3b6d7adf7e90dc3537`) |
| Imagen de respaldo | construida del commit `8bf95a479d43` con `infra/docker/backup.Dockerfile` (`sha256:53826b29f7fbc70515140829e0a070ddd2c99f73c3229c9205e41d2bc4402056`; `postgres:17-alpine`, restic, rclone) |
| Destino S3 | `minio/minio:latest` (imagen `14cea493d9a3`; **version sin fijar**) |
| Origen | esquema certificado (226 migraciones), 2 empresas, 4 usuarios, 719 concesiones, 304 tablas publicas, 4 buckets con 7 objetos (PNG, PDF, binario de 3 MB, archivo vacio, texto, JPG; nombres con espacios, parentesis y `+`), un modulo propio instalado (con carpeta `.staging` que no debe respaldarse), una tabla de integracion propia, un rol de base propio con login y contrasena, y datos de integraciones (automatizacion con webhook, entrega en cola, push, FCM, OAuth de Google, SMTP cifrado, claves en claro) |
| Comandos efectivos | `BACKUP_RESTORE_REHEARSAL_COMMANDS.md` (generado del registro de la ejecucion, secretos y datos locales sustituidos) |

## D.2 Que se probo, requisito por requisito

| Requisito | Resultado | Comprobacion |
|---|---|---|
| Instalacion representativa con datos testigo | 304 tablas, 7 objetos, 19 roles | `source-installation` |
| Flujo real de respaldo hacia restic en MinIO con credenciales generadas | `run-backup.sh` completa; un respaldo completo, uno solo de base y uno heredado conviven | `backup-complete-1`, `backup-database-only`, `backup-legacy-snapshot` |
| Cifrado | contrasena incorrecta rechazada; la de otro repositorio tambien; sin texto en claro (testigo, PDF, cabecera `PGDMP`) en los archivos del repositorio y la misma busqueda si los encuentra en la copia descifrada | `encryption` |
| Manifiesto y hashes | 13 archivos: SHA-256 y tamano recalculados de forma independiente, sin archivos de mas | `manifest-hashes` |
| Cobertura de PostgreSQL | 337 tablas en el volcado (esquemas public, auth y storage) y los datos de las 24 tablas publicas con filas | `database-coverage` |
| Cobertura de Storage | los 7 objetos con los bytes originales (hash del fixture, no del manifiesto) | `storage-bytes`, `manifest-coverage` |
| Modulos y configuracion | arbol del modulo identico; `.staging` excluido; configuracion redactada sin ningun secreto | `modules-tree`, `config-is-redacted` |
| Retencion y clasificacion | completo, solo base y heredado clasificados; la retencion respeta los dos ultimos; **no poda** (H1) | `inspect-classification`, `backup-retention-scope`, `backup-retention-effective` |
| Restauracion en una segunda instalacion independiente | 0 errores de `pg_restore`; inventario identico (304 tablas con digest de contenido, 226 migraciones, 19 roles, membresias, resumen de ACL, usuarios de autenticacion, buckets, SHA-256 de cada objeto); 0 asociaciones huerfanas; un usuario restaurado inicia sesion con su contrasena original | `restore-database`, `restore-comparison`, `restore-associations`, `restore-login` |
| Roles globales sin contrasenas | `pg_dumpall --roles-only --no-role-passwords` lista los 19 roles y ninguna clausula `PASSWORD`; como control, sin la opcion el superusuario obtiene 8 | `roles-dump-no-passwords`, `roles-flag-control` |
| Fallos simulados (ninguno se reporta como completo y recuperable) | respaldo interrumpido tras la subida (solo un snapshot pendiente), interrumpido durante el volcado (nada publicado), objeto faltante en el origen (se niega), archivo alterado y archivo borrado en la extraccion, repositorio corrupto (`check --read-data` y `restore --verify` fallan), credencial incorrecta, snapshot solo de base, volcado ilegible (no restaura nada), datos dañados (restauracion parcial: 304 tablas y 28 diferencias) y roles ausentes (restauracion parcial: 15 errores) | `fail-*` |
| Aislamiento antes de arrancar API y Worker | prueba negativa: con una red normal el gate se niega y no se crea ningun contenedor; control positivo: la misma sonda en una red normal si llega al "servicio de produccion" simulado y a Internet; en la red interna no llega a nada (Internet, DNS, servicio en el anfitrion, contenedor de "produccion"), y desde dentro de la API en ejecucion tampoco | `isolation-*`, `api-egress-blocked` |
| Las claves nuevas no neutralizan todo | la auditoria encontro 8 capacidades activas y credenciales en claro; el gate se cierra; una tabla de modulo que ninguna lista conoce lo mantiene cerrado hasta que se revisa; el respaldo y el origen no cambian | `audit-*`, `gate-*`, `neutralize-known`, `backup-and-source-untouched` |
| Redactado frente a integro | dos repositorios con contrasenas distintas; el redactado no contiene ningun secreto; el integro si, y se mueve a una carpeta aparte; el valor cifrado solo se descifra con la clave original | `integral-vs-redacted`, `secrets-stay-outside` |
| Aplicacion recuperada | la API certificada arranca solo tras preparar Storage; con el Worker en la red interna, un usuario restaurado inicia sesion y lista las notas restauradas | `api-*`, `worker-isolated`, `recovered-app-works` |
| Diagnostico de solo lectura del runbook | presencia de variables sin valores, `verify-backup.sh` (`[verify] OK: verified complete snapshot within 36 hours`) y `inspect`; el repositorio queda identico antes y despues (18 objetos, mismo nombre, tamano y fecha) | `diagnostic-*` |

## D.3 Hallazgos

Del producto (no corregidos: el candidato esta congelado; se listan para decidirlos):

- **H1 La retencion no poda nunca.** `restic forget` agrupa por `host,paths` por defecto y cada ejecucion respalda un
  directorio temporal distinto (`/tmp/tmp.XXXX`), asi que cada snapshot es su propio grupo y `--keep-daily` jamas elimina
  ninguno. Observado con `BACKUP_RETENTION_DAYS=1`: dos snapshots completos conviven. Consecuencia: crecimiento sin limite del
  repositorio (coste), no perdida de datos. Correccion propuesta: `--group-by host,tags` en `apps/backup/run-backup.sh`.
- **H6 `assess` solo valida la cabecera del volcado** (`databaseValidation: header-only`, `installationRecovered: false`).
  Una extraccion "completa" no demuestra que PostgreSQL se pueda restaurar; solo una restauracion lo hace.
- **H7 La CLI muestra un snapshot pendiente como `legacy-unknown`** (por la lectura del codigo: solo conoce las
  etiquetas completa y solo base). Un respaldo interrumpido y uno antiguo se ven igual.
- **H8 Con un secreto S3 incorrecto, restic reintenta la firma rechazada con esperas crecientes** y la CLI parece colgada
  (sin respuesta durante mas de un minuto). Cancelar la orden no es un fallo de red del servidor.
- **H9 El Worker, con su comando por defecto (`pnpm --filter @runly/worker start`), necesita Internet al arrancar** porque corepack
  descarga pnpm. Sin red falla (`registry.npmjs.org`). Arrancar `src/index.js` directamente evita la dependencia.
- **H10 Supabase Storage rechaza claves de objeto con caracteres no ASCII** (`Invalid key`); admite espacios, parentesis y `+`.

Del procedimiento (corregidos en este documento):

- **H2 La replica quedaba mas abierta que el origen.** Un Supabase nuevo concede por defecto todo a `anon` y `authenticated`
  sobre cada tabla nueva; `pg_restore` crea las tablas bajo esos privilegios y el volcado solo anade `GRANT`. Observado: 4.840
  privilegios de mas (todos sobre 304 tablas), mientras el origen no daba ninguno a `anon`. Correccion: vaciar los privilegios por
  defecto antes de restaurar (C.3, paso 4). Con ella el resumen de ACL coincide.
- **H3 Storage: tras `pg_restore` las filas existen pero no los archivos.** `rclone copy` vio los objetos "ya presentes" y pidio
  `CopyObject`, que Storage responde con 500. Correccion: `--no-check-dest` (C.3, paso 7).
- **H4 El host del endpoint S3 debe ser el de `STORAGE_PUBLIC_URL`.** Storage firma con ese host, no con el que recibe; cualquier otro
  produce `SignatureDoesNotMatch` (lo reprodujo hasta el CLI oficial de AWS).
- **H5 El contenedor efimero intentaba enviar un correo de alerta al fallar**, con el SMTP del entorno. Correccion: filtrar
  `SMTP_*` junto con `BACKUP_*` y `RESTIC_*` (B.3).
- **H12 `supabase_realtime_admin` no existe en una base recien levantada** (lo crea el servicio Realtime) y el volcado concede
  permisos a ese rol. Correccion: aplicar del volcado de roles los que falten (C.3, paso 3).

Esperado y confirmado: la API certificada se niega a arrancar sobre el Storage restaurado sin proteger
(`NOTES_STORAGE_OWNER_PREPARATION_REQUIRED`), por lo que la preparacion del propietario es el primer paso de la actualizacion.

## D.4 Redactado frente a integro (no confundirlos)

| | Respaldo redactado (ensayo) | Respaldo integro (recuperacion real) |
|---|---|---|
| Para que sirve | probar el procedimiento y ensayar la actualizacion en una replica | reconstruir una instalacion destruida |
| Configuracion que contiene | solo modos, puertos y etiquetas de imagen (secretos, URLs, buckets, hosts y correos vaciados) | el `.env.external` original con todos sus secretos |
| Repositorio | propio, con contrasena de restic unica | otro repositorio y otra contrasena |
| Donde puede estar | equipo de ensayo con disco cifrado | solo en custodia, **fuera de cualquier replica** |
| Por que existen los dos | el primero no arrastra secretos de produccion | el segundo conserva las claves que hacen legibles los valores cifrados de la base (la contrasena SMTP, las claves de push y los tokens de Google) |

Comprobado: ni la configuracion del respaldo redactado ni el entorno de la replica contienen ningun secreto del origen, y la
clave original del respaldo integro descifra el valor guardado mientras la de la replica no.

## D.5 Reproducir

`node scripts/rehearsal/verify-backup-restore.mjs --run=<id> --api-image=... --worker-image=... --backup-image=... --stage=all`
(unos 40 minutos). Deja un informe en `.artifacts/rehearsal/run-<id>/report.json` y los recursos desechables vivos hasta que se
borren (instalaciones, MinIO y redes). Pruebas unitarias de las piezas: `node --test scripts/rehearsal/__tests__/*.test.js`.

## D.6 Lo que este ensayo NO demuestra (pendiente)

- Nada contra Backblaze B2 ni contra el Supabase real: versiones, volumen, latencia y permisos reales pueden diferir. MinIO
  se uso con `latest` sin fijar; las versiones de Supabase fueron las del Installer (PostgreSQL 17, storage-api 1.60.4).
- Datos pequenos (13 archivos en el respaldo, 7 objetos, 3 MB): no mide tiempos, memoria, coste de `restic check` ni de la
  extraccion en un repositorio grande, ni la duracion de la ventana de `pg_dump`.
- El origen estaba en reposo: la consistencia "no atomica" con trafico en vivo (un objeto subido durante la copia) no se probo.
- Docker Desktop en Windows: la red `--internal` demostro el bloqueo frente a un servicio de "produccion" simulado, no frente a una
  red real ni a un anfitrion Linux con reglas de firewall. Para datos reales sigue siendo preferible una maquina sin ruta de salida.
- La actualizacion con el Installer `.6` no se ejecuto sobre la replica; solo la preparacion de Storage y el arranque de la API.
  El inventario de Notes (`notes-storage-preflight --inventory`) tampoco.
- El Worker se arranco directamente (H9), sin tareas encoladas ni proveedores.
- No se probo el trabajo programado (`supercronic`), la ausencia de ejecucion ni un monitor externo; ni la rotacion de claves.
- La recuperacion real con el respaldo integro (reinstalar con las claves originales) no se ejecuto de punta a punta; solo se
  comprobo que la clave original recupera el valor cifrado. La custodia fue una carpeta aparte, no un gestor de secretos.
- No se comparan `ALTER ROLE ... SET` ni opciones a nivel de base de datos.
- El ensayo se detuvo y reanudo varias veces por una interrupcion del equipo; el resultado citado es de una ejecucion limpia
  completa (`r4`) mas la etapa de diagnostico sobre el mismo estado.

## D.7 Dictamen

**GO para iniciar el diagnostico de solo lectura de los respaldos existentes en la instancia external (Parte 1).** Sigue
**sin autorizar** la generacion de un respaldo (Parte 2), la restauracion con datos reales y cualquier cambio en produccion.

Motivos: las tres ordenes de la Parte 1 se ejecutaron en positivo y en negativo; no escriben nada (el repositorio quedo
identico); el formato de salida no incluye valores; y el comportamiento ante un respaldo parcial, pendiente, corrupto o con
credenciales erroneas es negar, no aprobar.

Condiciones para ese diagnostico:

1. Empezar por A.1 desde el equipo del operador con una credencial de **solo lectura**; usar A.2 en el servidor solo si no hay
   kit, y solo las ordenes listadas (presencia de variables, estado del contenedor, `verify-backup.sh`).
2. Compartir unicamente las salidas marcadas como seguras; ningun valor de variable, endpoint, bucket ni id de instancia.
3. Si `inspect` no responde en un minuto con una credencial S3 que se sospecha incorrecta, cancelarlo (H8): no es un fallo
   del servidor.
4. Que el resultado "no hay respaldo recuperable" es un resultado valido, no un incidente: lleva a la Parte 2, que requiere
   una autorizacion aparte.
5. La imagen de respaldo del servidor puede ser anterior a la del ensayo (si carece de `backup-coverage.mjs`, sus snapshots
   son `legacy-unknown`).

Antes de autorizar la Parte 2 conviene decidir H1, repetir este ensayo con la version exacta de Supabase de produccion y
con el volumen real de objetos, y fijar la version de MinIO si se vuelve a usar.

# Resumen de lo que necesito del responsable

1. ¿Existe `BACKUP_MODE=enabled` en la external real? (A.2, punto 1, es seguro de compartir).
2. ¿Se conserva el kit de recuperacion (endpoint/bucket/instancia/clave de lectura/contrasena de
   restic)? Si no, hay que ir a la Parte 2.
3. Autorizacion explicita para la Parte 2, si hace falta, y quien ejecuta cada paso en el
   servidor.
4. Un bucket y una clave temporales, una maquina de ensayo con disco cifrado y red interna, y la
   version exacta de PostgreSQL/Supabase de produccion.
5. ¿Hay copias del proveedor (base de datos o disco) que sirvan como fuente alternativa?
