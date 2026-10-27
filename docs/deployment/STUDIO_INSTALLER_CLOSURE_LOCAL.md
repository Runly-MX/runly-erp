# Studio Realtime: instalación, actualización y recuperación

El cierre conserva Presence/Broadcast, las firmas por sesión y el rol aislado
`runly_studio_socket`. No cambia el transporte, el SDK, la UI ni migraciones
históricas. Los cambios de esta entrega se limitan al Installer, su distribución,
la declaración de compatibilidad de imágenes y las verificaciones locales.

## Instalaciones y preparación

| Caso | Comportamiento del Installer corregido |
| --- | --- |
| Local selfhosted nuevo | Prepara el rol como propietario antes de Prisma; el init SQL también cubre volúmenes nuevos. |
| Local selfhosted existente | Ejecuta la preparación incluso cuando ya existe el volumen. No depende del init. |
| External nuevo o existente, rol preparado | Continúa con la conexión habitual; no necesita otra credencial. |
| External con cuenta autorizada | Prepara el rol en una transacción mediante la conexión configurada. |
| External sin permisos suficientes | Se detiene antes de Prisma, identifica CREATE ROLE o USAGE WITH GRANT OPTION faltante e indica el SQL que debe ejecutar el propietario. |
| Supabase selfhosted separado | Puede prepararse una vez en su servidor o mediante una conexión autorizada temporal desde Runly. No requiere siempre SSH. |
| P3009 conocido | Diagnóstico de solo lectura y recuperación explícita; no se resuelve automáticamente en cada update. |
| Fallo desconocido, checksum distinto u objetos parciales | Se detiene sin cambiar el historial. Requiere revisión propia. |
| Imagen antigua sin contrato o SQL distinto | Se detiene antes de iniciar Prisma. No sustituye la versión elegida por latest. |

Las instalaciones external restringidas requieren preparación **una vez por
base**, también en instalaciones nuevas. El updater no puede concederse permisos
que PostgreSQL le niega. Tras la preparación, la conexión de aplicación basta
para las actualizaciones siguientes; la credencial de propietario puede retirarse.

`cli-dev` conserva su modo y utiliza el preflight por conexión. Su recuperación
por conexión admite `studio-realtime-external.mjs --env-file=.env.local`.
No se presenta como entorno productivo certificado.

## Por qué se conserva el rol aislado

La sustitución mínima por `authenticated` no es equivalente. En este repositorio
`runly_realtime_server_writes` es una política RESTRICTIVE con `WITH CHECK(false)`
para `authenticated` y `anon`. Una política permisiva de Studio se combina con
esa restricción y no permite escribir. La prueba Docker crea una política
temporal limitada al topic de Studio, intenta el INSERT como `authenticated` y
confirma el rechazo; revierte toda la prueba.

Usar la sesión ordinaria además no conserva el alcance de una capacidad efímera:
esa sesión autoriza las operaciones persistentes normales del usuario mediante
la API. Un JWT derivado con `role=authenticated` tampoco hereda automáticamente
el aislamiento de un rol sin membresías; comparte la superficie de políticas de
ese rol y exige auditarla, además de modificar la restricción global.

Los canales privados y las firmas verificables protegen acceso e identidad, pero
no sustituyen los privilegios SQL ni la caducidad y revocación de la capacidad.
No se ha demostrado aquí una alternativa con las mismas garantías manteniendo
intactas las políticas globales. Por ello se conserva la arquitectura ya probada:

- JWT de socket sin `sub`, limitado a diseño/empresa/sesión/epoch y 30 segundos.
- RLS de socket separada, comprobación de sesión y permisos efectivos.
- Firmas por sesión, comprobación de alcance, caducidad y protección contra replay.
- Operaciones persistentes por API; Broadcast no se convierte en un canal de comandos.
- Restricciones y políticas anteriores de Notes, Canvas y demás módulos intactas.

No se agregan privilegios globales a `anon`, `authenticated` ni `service_role`.
Las pruebas comparan todas las políticas previas de Realtime y comprueban que el
rol de socket no puede consultar las tablas de Notes o Canvas. No se afirma que
el rediseño con `authenticated` sea imposible; se descarta una sustitución no
demostrada para este cierre de mantenimiento.

Fuentes primarias: [autorización de Realtime](https://supabase.com/docs/guides/realtime/authorization),
[roles de PostgreSQL en Supabase](https://supabase.com/docs/guides/database/postgres/roles).
La documentación confirma que Realtime calcula autorización al conectar y que
el esquema tiene restricciones de propietario; no promete que el usuario
`postgres` de Supabase alojado pueda otorgar todos estos permisos.

## Distribución versionada

`release-files.json` declara el catálogo por modo y la versión. El generador
produce los cuatro bootstrap y `installer-release.json`, con SHA-256 por archivo
y huellas de versiones históricas para reconocer instalaciones anteriores.
Ejecutar `pnpm installer:manifest` tras cambiar archivos distribuidos y aumentar
la versión antes de distribuir contenido diferente bajo una versión ya instalada.
`pnpm installer:check` y `pnpm docker:release:check` rechazan hashes desactualizados.

Los wrappers resuelven una sola revisión de `Runly-MX/runly-erp` y descargan todo
por HTTPS desde ese SHA inmutable. `RUNLY_INSTALLER_REF` permite seleccionar un
SHA de 40 caracteres explícito. El bootstrap verifica el hash del downloader;
el downloader verifica todos los archivos antes de sustituir alguno. Se registra
versión, revisión, modo, hashes y contrato en `.runly-installer/state.json`.

Esto comprueba procedencia mediante el repositorio canónico y TLS, e integridad
mediante commit fijado y hashes. **No es una firma independiente del repositorio**:
la primera descarga del bootstrap confía en GitHub/TLS y en quienes pueden
publicar en ese repositorio. Una clave de firma externa sería un endurecimiento
adicional, no una propiedad que se afirme implementada.

La actualización prepara todos los archivos en staging, conserva copias privadas
y escribe un journal antes de aplicar. Un error revierte los scripts y metadatos;
una interrupción se recupera en el siguiente intento antes de descargar otra
versión. Un lock evita dos actualizaciones de scripts concurrentes. No se hace
rollback automático de migraciones ni del software de aplicación tras modificar
la base: ese procedimiento depende de compatibilidad y backups del operador.

Los reemplazos se hacen por rename en el mismo sistema de archivos. Si hubo una
edición local posterior a una interrupción, se conserva y se exige reconciliarla,
en lugar de restaurar ciegamente una copia anterior. Setup y recuperación usan
otro lock para impedir que se sustituyan scripts durante un deploy. Los enlaces
simbólicos, incluidos enlaces rotos, se rechazan en destinos administrados.
En Git Bash sobre Windows, un script antiguo abierto puede impedir su propio
rename: el lote falla y se revierte; hay que volver a iniciar desde el bootstrap
actualizado cuando termine ese proceso. No se modifica en sitio un script abierto.

Se conservan `.env`, `.env.local`, `.env.external`, secretos, módulos, archivos,
volúmenes y configuraciones generadas. No se borra contenido ajeno. Las versiones
elegidas de imágenes se leen del entorno y de los archivos del modo, incluyendo
aliases históricos. Un archivo distribuido modificado localmente se conserva y
detiene el update antes de aplicar el lote; no se sobrescribe a ciegas. Las
personalizaciones Compose deben mantenerse en `docker-compose.override.yml` o
`docker-compose.local.override.yml` / `docker-compose.external.override.yml`, que
el setup incorpora explícitamente. Un directorio vacío creado por un antiguo bind
mount ausente se puede sustituir por su archivo; uno no vacío se conserva y detiene.

### Imágenes y scripts compatibles

API, Worker y Web declaran `io.runly.installer.contract=studio-realtime-1`. El setup
inspecciona las tres imágenes, rechaza contratos ausentes/distintos y fija sus IDs
para ese despliegue. Guarda referencias elegidas e IDs en `images.json` dentro
del área privada del Installer. Una referencia mutable no puede cambiar de
contenido a mitad del mismo despliegue. La igualdad de contrato declara
compatibilidad, no exige que los tres servicios tengan el mismo commit; futuros
cambios incompatibles deben cambiar el contrato y sus pruebas.

El preflight verifica además el hash real del SQL efímero dentro de la imagen API.
Un label correcto no basta para aceptar una migración diferente. Los scripts de
recuperación admiten imágenes anteriores con el SQL original comprobado para no
obligar a publicar otra imagen solo para recuperar un intento fallido.

Publicar Docker **no publica el Installer**. Junto a las imágenes compatibles se
deben publicar en Git el manifiesto generado, el catálogo, el downloader, los
bootstrap, los wrappers y todos los archivos enumerados por el manifiesto. El
release Docker comprueba la generación e informa esta separación. No hace git
push por el operador. Durante la transición, scripts nuevos e imágenes antiguas
fallan de forma preventiva; la aplicación existente no se recrea antes de pasar
la comprobación de contrato. Mantener un commit compatible fijado permite
actualizaciones repetibles.

Los wrappers antiguos conocidos ya descargaban el bootstrap desde `main`, por lo
que adoptan el nuevo flujo cuando ese código se publique. Copias anteriores a
esa capacidad necesitan refrescar una vez el bootstrap por el canal canónico.
No se promete que un archivo arbitrario que nunca se actualiza pueda corregirse
solo. Ambos modos mantienen sus entradas y no se convierten entre sí.

## Diagnóstico, permisos y recuperación

Procedimiento completo y comandos: [recuperación de Studio](STUDIO_REALTIME_MIGRATION_RECOVERY.md).
External utiliza `DIRECT_URL`, o `DATABASE_URL` si no existe la primera. Puede
recibir una conexión autorizada en `.secrets/studio-admin.env`; se pasa solamente
a la tarea temporal de preparación y no a Prisma, API ni Worker. Se verifica que
host/puerto/base coincidan con la conexión efectiva. El archivo solo admite esa
variable, para impedir que redirija accidentalmente el destino de diagnóstico.
El error indica el privilegio faltante y el propietario del esquema.

Cuando Supabase está en una red Docker explícita, `RUNLY_MIGRATION_NETWORK` permite
conectar también los jobs temporales external a esa red. No adivina una red ni
un servidor real. Local resuelve la red efectiva desde Compose, incluyendo overrides.

Un P3009 solo se recupera si hay un único fallo pendiente de la migración exacta,
checksum LF/CRLF conocido, sin ejecución exitosa contradictoria ni checksum ajeno
en su historial, sin función ni políticas parciales y logs vacíos o del error
conocido. La transacción explícita explica por qué Prisma puede registrar logs
vacíos. Se prepara el permiso, se vuelve a consultar y se usa `--rolled-back`;
se conserva el intento y se reaplica el SQL real. Nunca se usa `--applied` para
ocultar SQL pendiente ni se borran filas de `_prisma_migrations`.

`--skip-migrate` y `--up-only` no evitan por sí solos la inicialización del
entrypoint API. Si no se configuró `RUNLY_SKIP_DB_INIT=1`, se hace una verificación
previa sin preparación automática y se exige ejecutar el setup normal si faltan
permisos. Así se evita trasladar el fallo de Prisma al arranque del contenedor.
Si el operador desactiva explícitamente ambas inicializaciones, conserva esa
decisión; no se ejecuta una recuperación escondida.

## Evidencia reproducible y límites

Todos los runners requieren Docker local y usan proyectos/volúmenes únicos,
credenciales sintéticas, marcadores de identidad y cleanup de su propio proyecto.
No se utilizaron SSH, VPS ni bases compartidas. Los logs y archivos sintéticos
quedan en el directorio ignorado `.artifacts/studio/`.

Resultado de las pruebas unitarias y regresiones de contrato: **153 aprobadas,
cero fallos y cero omitidas** (146 del Installer y siete del contrato/API Realtime).
ESLint de los archivos propios y `installer:check`: aprobados. El dry run de
release exige la generación vigente y selecciona API, Worker y Web para incorporar
el contrato, sin publicar nada. Privacidad global sigue reportando 67 hallazgos
preexistentes; la revisión de los archivos propios tiene cero hallazgos.

Los cuatro runners Docker terminan con éxito. Las pruebas de setup ejecutan
las entradas reales local/external dos veces, con Compose de producción. Se
incluye la corrección de un bloqueo adicional descubierto en la instalación
limpia: las declaraciones Firebase vacías de una sincronización antigua se
mantienen desactivadas; el default seguro `false` ya no se convierte en vacío.
No se inventan credenciales ni se activa esa integración opcional.

Las imágenes de prueba derivan localmente de las imágenes de aplicación ya
validadas `df739fe4`, añadiendo el contrato de prueba; no se recompiló la UI ni se
publicó una nueva imagen de producto en esta entrega. Los Dockerfiles de producto
declaran ese contrato para su próximo build real. La variante de SQL alterado
es otra imagen desechable y el preflight la rechaza antes de Prisma.

| Caso | Verificación |
| --- | --- |
| Base limpia local/external, rol ausente o preparado | `verify-studio-installer-clean.mjs`: preparación, todas las migraciones, seed y repetición. |
| Base antigua y P3009 conocido | `verify-studio-realtime-upgrade.mjs`: fallo original, diagnóstico, recuperación CLI y migración dos veces. |
| External autorizado/restringido y fallo desconocido | `verify-studio-realtime-external-upgrade.mjs`: no crea fallos evitables y no resuelve casos ajenos. |
| Setup completo y repetición | `verify-studio-installer-setup.mjs`: entradas reales con Compose de producción, imágenes locales y datos/archivo testigo. |
| Distribución y versiones incompatibles | Pruebas Installer: Bash/PowerShell, hashes alterados, procedencia fijada, modificaciones locales, lock, interrupción y rollback del lote. |

Las pruebas de actualización conservan datos testigo, archivos, checksums y
migraciones anteriores. Las nuevas pruebas no sustituyen una certificación en
Supabase Cloud: un proveedor puede restringir incluso las operaciones del
propietario disponible. No se modificó ni se volvió a certificar el rendimiento
del transporte; se mantienen las mediciones y límites del
[informe Realtime anterior](STUDIO_REALTIME_OPTIMIZATION_LOCAL.md), incluido que
veinte usuarios todavía no están aprobados.

Esta entrega no publica imágenes, scripts ni releases y no actualiza servidores.
La puesta en distribución y una validación en un proyecto alojado son acciones
posteriores; no se presentan como realizadas.

## Commits locales

- `098caabc`: preparación propietaria para volúmenes selfhosted existentes.
- `a4d6b7aa`: primer preflight y recuperación external.
- `c204d5ce`: distribución versionada, compatibilidad de imágenes, locks,
  preflight e historial reforzados y matriz de pruebas de este cierre.

Comandos principales de verificación:

```bash
node --test infra/installer/__tests__/*.test.js infra/installer/lib/*.test.mjs apps/api/src/routes/studio/studio-realtime.test.js apps/shared/studio/realtime.test.js
pnpm installer:check
pnpm docker:release:check
node scripts/verify-studio-installer-clean.mjs
node scripts/verify-studio-installer-setup.mjs
node scripts/verify-studio-realtime-upgrade.mjs
node scripts/verify-studio-realtime-external-upgrade.mjs
```
