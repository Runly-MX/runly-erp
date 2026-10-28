# Notes: cierre local de privacidad de imágenes

Base: `079e13aaf2ceca79cf97d958a90f87074fce901d`, main limpio. Código validado:
`9ffc8884`. Fecha local: 2026-10-27. Solo Docker desechable; no se accedió a
instalaciones existentes, no hubo despliegue ni publicación.

## Causa y alcance confirmado

HEAD creaba **runly-notes con public=true** en el arranque. Editor, portadas,
Excalidraw y append de MCP/MirAI guardaban el resultado de getPublicUrl. La URL
`/storage/v1/object/public/runly-notes/<key>` devolvía bytes sin Authorization ni
apikey aunque la nota tuviera is_public=false. Era una URL permanente, no un enlace
firmado temporal. La dificultad de adivinar el nombre no constituía autorización.

El código actual no crea atlas-notes; se soporta cuando exista como bucket legado.
La prueba de actualización creó ambos buckets públicos con datos testigo, reprodujo
HTTP 200 anónimo y los convirtió a privados sin cambiar nombres ni mover originales.
Publicar/despublicar notas antes no alteraba la exposición directa del bucket.

| Superficie | Antes | Corrección |
|---|---|---|
| Imagen de cuerpo / Y.Doc | URL pública guardada en src | Misma referencia, lectura autorizada y blob de visualización |
| Portada | cover_url pública | Misma referencia, imagen y visor usan bytes autorizados |
| Tarjeta / miniatura | src derivado del HTML y variante pública | Resolución por nota; no requiere un derivado público |
| Excalidraw | URL del manifiesto files | Hidrata bytes autorizados en memoria; conserva manifiesto y archivos |
| Copia / exportación | Dependía de poder descargar URL pública | Imágenes embebidas en clipboard y blobs ya cargados en JPG/PDF |
| MCP/MirAI append | Descarga externa y upload público | Upload privado; copia de recurso gestionado exige acceso al origen |

Files y Chat ya se inicializaban privados; Website y Storefront se inicializan
públicos por su función de publicación. No se cambiaron sus flags. Esto no es una
auditoría exhaustiva de cada recurso de esos módulos. La nueva política restringe
solo runly-notes y atlas-notes; no concede permisos sobre otros buckets.

## Modelo de autorización

- `note_image_binding` registra nota/bucket/key; no se expone a anon/authenticated.
  `note_image_storage_state` marca el inventario histórico completado. Son tablas
  adicionales de aplicación con RLS, sin modificar tablas ni migraciones históricas.
- GET `/notes/:id/media?src=<referencia>` exige JWT vigente, permiso de Notes y
  acceso efectivo a esa nota. Se revalida en cada solicitud; no basta conocer la URL.
- GET `/public/notes/:slug/media?src=<referencia>` exige slug vigente, publicación
  válida, nota no eliminada/trashed, asociación registrada y referencia presente en
  el contenido actual. No hay lectura pública global de Storage.
- El origen de una URL histórica no se contacta. Se extraen bucket y key y se usa
  únicamente Storage configurado. Los dos buckets están permitidos explícitamente;
  traversal y controles en keys se rechazan. El cliente elimina query/hash antes
  de enviar la referencia, para no reenviar tokens de URLs firmadas históricas.
- Respuesta de bytes con `Cache-Control: private, no-store` y `nosniff`; sin redirect
  ni emisión de URL firmada de lectura. Service Role permanece en el servidor.
- Lectura y publicación **no crean asociaciones nuevas**. Así un editor no puede
  inyectar la URL de otra nota y conseguir que el propietario la autorice al abrir.
  Pegado explícito usa POST `/notes/:id/images/attach`, con permiso de edición en
  destino, lectura en origen y límites de empresa. Valida todo antes del insert
  transaccional. Creación con imágenes de borrador también registra en transacción.
- Upload nuevo registra pertenencia desde el servidor. El prefijo de borrador
  incluye al perfil que lo solicitó; no se confía en la identidad del navegador.
  Cambios de compañía/propietario no son campos admitidos por la API de edición de
  Notes; no se simuló un traslado de dominio no soportado.

El campo histórico de respuesta llamado publicUrl se conserva como referencia
duradera por compatibilidad del contrato. **Ya no concede acceso directo**. No se
guardan blobs de navegador ni capacidades temporales en HTML, Y.Doc o files.

Se mantiene el límite de bucket de 20 MiB y MIME image/*, y el límite MCP de 10 MiB
con firmas de archivo y SSRF para proveedores externos. PNG/JPEG/WebP/GIF se sirven
según firma, no según MIME declarado. SVG autocontenido y formatos que admite sharp
se rasterizan a PNG para visualización, con 40 millones de píxeles y timeout de 5 s.
SVG con entidades, recursos externos o contenido activo se rechaza. Los originales
no se reescriben; el inventario bloquea objetos ausentes/no renderizables en vez de
omitirlos silenciosamente. No se promete soportar todos los códecs históricos.

## Defensa de Storage y preparación por propietario

Bucket privado por sí solo no es suficiente si otra política permite lectura.
`runly_notes_private_images_v1` es RESTRICTIVE FOR ALL para anon/authenticated y
excluye ambos buckets. Se probó con otra política permisiva de lectura sobre esos
buckets: las rutas raw continuaron denegadas. Signed uploads autorizados siguen
funcionando; no se entrega Service Role al navegador.

Un trigger en storage.buckets rechaza que cualquiera de esos buckets pase a
public=true. Esto bloquea el UPDATE que ejecuta el API antiguo al arrancar: un
rollback de binario no puede reabrirlos inadvertidamente. El API nuevo verifica
definición/estado de política y trigger antes de servir; falla explícitamente si
faltan permisos de preparación o si las protecciones difieren.

La preparación que exige propiedad de storage.objects/storage.buckets se mantiene
**fuera de Prisma** en `prisma/prepare-notes-storage-owner.sql`. La migración Prisma
`20261028011349_notes_private_images` solo crea tablas de aplicación e índice. No
depende de ser dueño de realtime o storage, ni introduce un P3009 por esas DDL.
El preflight puede preparar protecciones usando una conexión de propietario
configurada explícitamente; después el API no necesita propiedad de Storage.

Se confirmó en la pila que la cuenta de aplicación podía preparar la política
pero no todo el guard de buckets. El primer intento sin preparación falló y quedó
registrado; el procedimiento corregido prepara con el dueño de Storage antes del
arranque. La prueba con rol sin propiedad verificó las protecciones ya preparadas,
y la ausencia de preparación produjo el error esperado. No se oculta este requisito
ni se afirma que toda instalación externa pueda actualizar sin ese paso.

## Inventario histórico e integridad

El preflight recorre HTML, atributos visibles del fragmento Y.Xml `default`,
portada/background y files del canvas. No hace reemplazos de cadenas ni escribe
en el CRDT. Inventaría también referencias de notas archivadas/eliminadas para
conservar originales, aunque su lectura siga denegada.

Se comprueba existencia en storage.objects y descarga real de cada objeto único,
límite de tamaño y posibilidad de renderizado. El informe privado incluye relación
nota/objeto, bytes y SHA-256. Detecta cruces de empresa, fuentes personales ajenas,
borradores legados ambiguos entre propietarios y recursos ausentes/no soportados.
Si hay problemas no marca el inventario como completado ni inicia el API. No hay
opción de ignorarlos y declarar la actualización exitosa.

Solo tras validar se registran asociaciones y marcador en una transacción; luego se
cierran los buckets. Reintentos usan claves únicas y ON CONFLICT, sin mover/borrar
objetos. Un fallo posterior al inventario permite retomar el cierre; no debe borrarse
el marcador para reinventariar documentos ya editados bajo el nuevo protocolo.

La prueba comparó bytes SHA-256 de Y.Doc antes/después de la transición, así como
HTML, portada y manifiesto/elementos: permanecieron idénticos. Descargó los originales
autorizados y comprobó igualdad de bytes. Las modificaciones posteriores de la
prueba fueron acciones explícitas de usuario/MirAI, no migraciones de contenido.

## Procedimiento de actualización

Estos pasos son para una futura operación autorizada; **no se ejecutaron sobre una
instalación existente**. Ejecutarlos primero en un clon restaurado de esa instalación.

1. Identificar imagen API/Web, conexión de aplicación, Storage configurado y ambos
   buckets reales. Detener escrituras de clientes antiguos durante la conmutación.
   Preparar rollback con código que conserve el proxy y las protecciones privadas.
2. Respaldar DB completa (incluidos esquemas de Notes, storage y políticas), objetos
   y configuración. Verificar restauración e inventario de bytes/hashes en un clon;
   conservar respaldo privado con control de acceso. Una copia de metadata sin
   objetos no es un respaldo completo. No eliminar originales ni backups al cambiar.
3. Con la imagen nueva, ejecutar el preflight de inventario en modo lectura antes
   de Prisma. Guardar el informe fuera del repositorio público:

   ```sh
   node apps/api/scripts/notes-storage-preflight.mjs --inventory --output=/private-ops/notes-images-inventory.json
   ```

   Requiere DATABASE_URL, SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY configurados en
   el entorno operativo. No hay destino remoto por defecto. Revisar cada problema
   y comprobar la referencia en el documento/objeto de origen; no asignar recursos
   de otra empresa para hacer pasar el check. Formatos no soportados requieren un
   decoder/transformación probado antes de continuar, conservando el original.
4. Antes de Prisma, preparar política y guard con el dueño de Storage. Configurar
   temporalmente RUNLY_NOTES_OWNER_DATABASE_URL en el entorno de esa operación:

   ```sh
   node apps/api/scripts/notes-storage-preflight.mjs --prepare-owner
   ```

   Alternativa controlada: ejecutar el SQL versionado con ese propietario. No usa
   credenciales desde el navegador. Retirar la conexión privilegiada del entorno
   del API después. Si el proveedor no permite esa preparación, **NO GO** para esa
   instalación; no debilitar políticas ni introducir DDL fallida en Prisma.
5. Aplicar las migraciones nuevas mediante el flujo habitual del Installer/Prisma.
   Arrancar API nueva; inventario y cierre son idempotentes y se verifican al inicio.
   Confirmar flags privados y protecciones antes de habilitar usuarios. Ante fallo,
   mantener mantenimiento y corregir la causa; no volver público el bucket.
6. Servir Web nueva y recargar clientes/PWA abiertos. El esquema persistido y las
   referencias antiguas se conservan, pero Web anterior no tiene el resolver y no
   podrá cargar directamente URLs públicas cerradas. No se promete compatibilidad
   visual simultánea con un binario que depende de lectura anónima permanente.
7. Repetir matriz owner/editor/lector/ajeno/otra empresa/anónimo, enlaces antiguos,
   variantes, publicación/despublicación, revocación y exportaciones. Probar también
   contra el gateway/CDN público efectivo y purgar cachés administradas. Solo entonces
   terminar mantenimiento y conservar informe/backup de la operación.

Recuperación: si se interrumpe, usar el mismo build y reintentar; las asociaciones
no se duplican. No revertir la migración borrando tablas ni quitar el guard como
rollback. Restaurar un backup antiguo solo en aislamiento, reaplicar preparación,
migraciones e inventario antes de exponerlo. Una restauración completa de DB antigua
también puede restaurar la configuración vulnerable y debe pasar el gate de nuevo.

## Revocación, capacidades y cachés

Despublicar, revocar colaboración, trash y eliminación lógica niegan nuevas lecturas
de la API. Ya no se emiten capacidades firmadas de lectura. Una solicitud autorizada
que ya estaba en vuelo puede terminar; no se midió un máximo universal de esa ventana.
Un blob ya descargado, captura, exportación o copia externa no puede retirarse.

Los uploads firmados existentes son capacidades temporales acotadas a una key
(TTL de Storage, normalmente dos horas); su emisión nueva exige edición, pero una
capacidad ya emitida puede completar ese upload hasta caducar. No permite leer ni
enumerar otras imágenes ni guardar contenido de la nota después de revocación.
URLs firmadas de lectura emitidas por versiones anteriores pueden seguir válidas
hasta su expiración: son distintas de la URL pública permanente. La prueba creó una
de un segundo, comprobó acceso y caducidad; el resolver nuevo no las devuelve.

Cachés externas pueden conservar imágenes que antes fueron públicas. Poner privado
el origen no elimina esas copias; verificar/purgar cachés administradas y comunicar
ese límite. No se afirma una recuperación retroactiva de confidencialidad.
Referencia: [modelo de buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)
y [descargas/capacidades firmadas](https://supabase.com/docs/guides/storage/serving/downloads).

## Validación reproducible y dictamen

Resultado (2026-10-27, código 9ffc8884, imagen runly-notes-private:full-api-fd71d6f0b653):
97/97 pruebas unitarias de Notes; verify-notes-private-storage en instalación nueva y
con --upgrade --ui (14 comprobaciones de API/Storage y 8 de GUI), todas aprobadas.
Commits: 81ee31a3 (lecturas autorizadas e histórico), 133a8972 (editores, previews y
exportaciones), 9ffc8884 (pegado síncrono, verificadores y endurecimiento de política).
No se re-ejecutaron regresiones completas de Files, Chat, Canvas y Studio: no comparten
el código modificado y sus buckets no se tocaron.
Artefactos completos privados en `.artifacts/studio/` y `.artifacts/realtime-2/`.
Los builders y runners no leen destinos del entorno de producción; verifican Docker
local, pila recién creada y marcador de DB. No compartir test.env ni logs completos.

```sh
node scripts/build-notes-private-storage.mjs --full
node scripts/verify-notes-private-storage.mjs --api-image=<imagen-local-generada>
node scripts/verify-notes-private-storage.mjs --api-image=<imagen-local-generada> --upgrade --ui
```

Upgrade aplica la migración nueva sobre la base anterior y prepara Storage con su
dueño antes del arranque. UI usa el build completo con configuración local aislada.
El proveedor externo de imagen del caso MirAI es un fixture; autorización, Storage,
append Y.Doc y persistencia son servicios reales. No se invocó un modelo de IA ni
se certificó el transporte completo de todas las herramientas MCP.

El viewport móvil es Chrome táctil de 390×844, con edición colaborativa real. No
equivale a una prueba en un APK físico o de composición IME del sistema operativo.
Las rutas render/image se solicitaron y no entregaron originales; el Installer
actual tiene ENABLE_IMAGE_TRANSFORMATION=false y no usa imgproxy. No se afirma
certificar un servidor imgproxy externo configurado de otra manera.

## Dictamen

**GO condicionado, solo local.** Ningún recurso de Notes es recuperable de forma anónima
con una URL pública permanente: ambos buckets son privados, la política restrictiva y el
trigger impiden reabrirlos, y las lecturas pasan por el API con revalidación. Condiciones:
preparación con el dueño de Storage (si el proveedor no la permite, NO GO en esa
instalación), ensayo previo en un clon restaurado y purga de cachés externas.

Riesgos residuales: copias ya descargadas o cacheadas, uploads firmados ya emitidos hasta
su caducidad, clientes Web antiguos sin resolver, y regresiones de Files, Chat, Canvas y
Studio pendientes de una corrida completa antes de producción.

## Certificacion del Installer con imagenes del HEAD (2026-10-28)

SHA probado: imagenes de API, Worker y Web construidas desde `5b9e1722fb83`
(`runly-notifications:{api,worker,web}-5b9e1722fb83`), con el Installer del arbol en
`1ef3c3ca1`. La regresion de Notes usa `runly-notes-private:full-api-205d2739ca05`
(HEAD `89f971d5`). Ninguna imagen anterior certifica codigo nuevo; la version previa
(`runly-realtime2:full-api-fa6f6d2a2877`) solo se usa como "instalacion existente".
Las imagenes se construyen con Git Bash/Windows anteponiendo `/c/Windows/System32` al PATH
para que `tar` sea el de Windows.

### Cambios

- El Installer ya no supone que Storage esta preparado. Antes de recrear ningun contenedor
  ejecuta, desde la imagen nueva, `node apps/api/scripts/notes-storage-preflight.mjs --verify`
  (solo lectura, cuenta de la aplicacion): politica restrictiva y guard de buckets con la
  definicion exacta. Si faltan y no hay propietario disponible, falla con
  `NOTES_STORAGE_NOT_PREPARED` y la instalacion existente sigue intacta. Un bucket aun
  publico antes del primer arranque se informa como pendiente (lo cierra la API nueva).
- Con `RUNLY_NOTES_OWNER_DATABASE_URL`, `--prepare-owner` se ejecuta antes del `--verify`.
  El valor viaja solo por entorno del proceso: no aparece en argumentos, logs ni errores
  (comprobado en la prueba de credencial incorrecta) ni llega al contenedor de la API.
- Despues de `/health` corre `--probe`: sube un objeto temporal y comprueba con
  peticiones anonimas reales la URL publica, el objeto, el render y el listado; cualquier
  200 hace fallar la instalacion. El objeto se elimina.
- La sonda de salud usa la direccion y el puerto publicados reales
  (`RUNLY_PUBLIC_BIND_ADDR`, `RUNLY_API_HOST_PORT`) y un temporizador normal.
- El gate corre en cada pasada de `setup-local` y `setup-external` (tambien con
  `--skip-migrate` y `--up-only`). `update-local.sh` y `update-external.sh` invocan esos
  scripts; no se ejecutaron directamente (descargan el Installer publicado).
- Manifiesto del Installer `2026.10.28.5`.

### Defectos del propio Installer encontrados por esta prueba E2E (corregidos)

1. La verificacion de salud sondeaba siempre `127.0.0.1:4010`: fallaba con otro puerto
   publicado.
2. `AbortSignal.timeout` usa un temporizador sin referencia: una peticion colgada hacia que
   `setup-local` terminara con codigo 0 sin veredicto ni banner. Ahora hay un temporizador
   normal y una prueba para ello.

### Resultados

Comando: `node scripts/verify-notes-installer-e2e.mjs --api-image=... --worker-image=...
--web-image=...`. Ejecuta los `setup-local.mjs` y `setup-external.mjs` reales con Compose de
produccion sobre pilas desechables y puertos libres (no toca los servidores de desarrollo).
Cada caso exitoso comprueba `/health`, que el propietario no llega al contenedor de la API,
que las lecturas anonimas (URL publica, objeto, render) no devuelven 200, que el bucket es
privado, que los bytes originales y el contenido de la nota quedan identicos, que la imagen
historica queda vinculada a su nota y que repetir el Installer es idempotente.

| Caso | Resultado |
|---|---|
| `local-existing-upgrade`: instalacion previa con bucket publico, nota e imagen | PASA |
| `local-fresh` | PASA |
| `external-owner-available` | PASA |
| `external-no-owner-prepared`: sin propietario, Storage ya preparado | PASA |
| `external-no-owner-unprepared`: sin propietario, Storage sin preparar | PASA: falla con `NOTES_STORAGE_NOT_PREPARED`, no arranca la API |
| `external-bad-owner-credential` | PASA: falla, la credencial no aparece en la salida |
| `external-partial-preparation`: solo la politica | PASA: falla |
| `external-regression-to-unsafe`: tras una instalacion buena se retira el guard y se abre el bucket | PASA: la actualizacion falla, no continua en silencio |

Regresion de Notes con la imagen del HEAD: `verify-notes-private-storage.mjs` (nueva) y con
`--upgrade --ui` pasan completos (matriz propietario/editor/lector/ajeno/otra empresa/anonimo,
publicacion y despublicacion, revocacion, URLs firmadas caducadas, fallo de Storage,
Y.js/Tiptap, Excalidraw, movil tactil, portadas, exportacion y flujo MirAI/MCP simulado).
Lint, `build:web` y las imagenes Docker de API, Worker y Web compilan. 4.323 pruebas Node:
4.310 pasan y las 7 que fallan son heredadas (ver el informe de Notificaciones).

### Dictamen por tipo de instalacion

| Tipo | Dictamen |
|---|---|
| Local con Supabase autohospedado (`setup-local`, `update-local.sh`) | GO local |
| External con conexion de propietario de Storage | GO local |
| External sin propietario y Storage ya preparado | GO local (se verifica, no se supone) |
| External sin propietario y Storage sin preparar o regresado | NO GO hasta preparar: el Installer se detiene antes de reemplazar contenedores |
| Supabase Cloud o proveedor que no permite crear politicas/triggers en `storage` | NO GO para esa configuracion; no se probo en un proveedor real |
| Local con Supabase CLI de desarrollo (no autohospedado) | No certificado: solo aplica `--verify`; sin preparacion el Installer se detiene |

### Limites

- Las copias de imagenes que se descargaron o quedaron en caches mientras el bucket era
  publico no se pueden retirar; hay que purgar las caches administradas y comunicarlo.
- No se probo un proveedor externo real ni `update-*.sh` descargando un Installer publicado.
- No se desplego, publico ni modifico ninguna instalacion real.
- Esto no convierte el GO local condicionado en un GO global de Runly: queda condicionado a
  ensayar primero en un clon restaurado de cada instalacion existente.

## Orden de actualizacion: el gate de Storage va antes de cualquier migracion (2026-10-28)

Installer `2026.10.28.6` (antes `2026.10.28.5`).

### Defecto

En una actualizacion real de `update-external.sh` el gate de Storage de Notes se
detuvo correctamente (`NOTES_STORAGE_NOT_PREPARED`: guard ausente y bucket publico),
pero `setup-external.mjs` ya habia ejecutado `prisma migrate deploy` y `db:seed`
(migraciones `20261028011349_notes_private_images` y
`20261211000000_studio_retired_asset_lineage`). La seguridad no se debilito (la API no
arranco ni se reemplazaron contenedores), pero la base quedo con el esquema nuevo y la
aplicacion antigua: una actualizacion parcial evitable, porque la condicion que
detuvo la operacion se puede verificar antes.

`setup-local.mjs` tenia el mismo orden (verificaba despues de migrar). En
autoalojado el SQL del propietario ya corria antes, pero el `--verify` quedaba
despues; en modo Supabase CLI no habia preparacion previa.

### Correccion

- `setup-external.mjs`: la preparacion con propietario (si hay credencial) y
  `--verify` se ejecutan **antes** de la comprobacion/preparacion de Studio Realtime,
  de `db:migrate`, de `db:seed` y del aprovisionamiento del transcriptor. Ocurre en
  todas las pasadas, tambien con `--skip-migrate` y `--up-only`.
- `setup-local.mjs`: el gate se movio antes de la segunda comprobacion de Studio y de
  las migraciones.
- `--verify` solo lee `storage.*` y los catalogos de Postgres
  (`inspectNotesStorage`), por lo que no necesita el esquema nuevo ni las tablas de
  Notes: puede correr sobre una base sin migrar.
- Sin cambios: `--probe` anonimo y `/health` despues del arranque; la politica
  RESTRICTIVE, el guard del bucket y RLS; la credencial de propietario sigue
  llegando solo por entorno (la E2E sigue comprobando que no aparece en la salida ni
  en el entorno del contenedor de la API).

Si el preflight falla (sin credencial suficiente, credencial incorrecta o
preparacion parcial) la operacion termina antes de tocar el esquema de la
aplicacion y antes de reemplazar contenedores.

### Recuperacion de una base ya migrada con el guard ausente

Es el estado que dejo la actualizacion fallida. La recuperacion es volver a ejecutar
el installer con la credencial del propietario (o aplicar
`prisma/prepare-notes-storage-owner.sql` como propietario): crea la politica y el guard
si faltan, es idempotente, no revierte migraciones y no toca datos. Las migraciones
Prisma aplicadas son inmutables y no se deshacen.

### Verificacion (bases y Supabase desechables, imagenes del SHA `330e4a712049`)

`scripts/verify-notes-installer-e2e.mjs`, 10 de 10 PASS:

| Caso | Resultado |
|---|---|
| local-existing-upgrade, local-fresh | PASS |
| external-owner-available, external-no-owner-prepared | PASS |
| external-no-owner-unprepared, external-bad-owner-credential, external-partial-preparation | PASS, y ahora comprueba que `_prisma_migrations`, el catalogo de columnas y las filas del seed son identicos antes y despues del fallo, y que la migracion de Notes sigue sin aplicarse |
| external-regression-to-unsafe | PASS: sobre una base ya migrada con guard ausente, el fallo no cambia el esquema; la repeticion con propietario recupera el guard y deja el bucket privado, sin migraciones nuevas ni cambios en la nota; una segunda recuperacion es idempotente |
| external-skip-migrate-unprepared | PASS (`--skip-migrate`) |
| external-up-only-unprepared | PASS (`--up-only`) |

Control negativo: con el `setup-external.mjs` anterior, `external-no-owner-unprepared`
**falla** con `a failed preflight must not migrate or seed`. Ademas una prueba
estatica (`infra/installer/__tests__/notes-storage-gate.test.js`) exige que el gate
aparezca antes de `db:migrate`, `db:seed` y la preparacion de Studio en ambos
installers, y una sola vez por pasada. Installer: 108 de 108.

### Compatibilidad Installer, imagenes y esquema

- Las imagenes del SHA `330e4a712049` llevan el contrato
  `io.runly.installer.contract=studio-realtime-1` (API, Worker y Web), el mismo que
  exige el installer (`INSTALLER_CONTRACT`); incluyen
  `apps/api/scripts/notes-storage-preflight.mjs`, `prisma/prepare-notes-storage-owner.sql`
  y migraciones hasta `20261211000000_studio_retired_asset_lineage`. La E2E las usa
  ademas con una capa de etiqueta propia.
- El gate se ejecuta **desde la imagen de la API**: una imagen anterior a
  `17a5b0561` no contiene el preflight y el gate falla cerrado (con el mensaje
  generico `NOTES_STORAGE_NOT_PREPARED`, que en ese caso no describe bien la causa).
  Nunca publicar el installer `2026.10.28.6` junto a imagenes anteriores a ese commit.
- El manifiesto del installer (`installer-release.json`) lo valida
  `build-push.mjs` en cada release; `node scripts/generate-installer-release.mjs
  --check` pasa.

### Antes de otra publicacion

1. Publicar installer e imagenes del mismo SHA (o posterior) con
   `pnpm docker:release`; no mezclar con imagenes antiguas.
2. Ensayar `update-external.sh` en un clon restaurado de la instancia afectada
   **con** credencial de propietario, y otra vez **sin** ella para confirmar que se
   detiene sin tocar el esquema.
3. En la instancia que quedo migrada con el guard ausente: aplicar la preparacion con
   el propietario antes de cualquier otra accion.

### Limites

No se ejecuto `update-external.sh` / `update-local.sh` directamente (descargan el
installer publicado), ni se accedio a instancias existentes; la reproduccion es con
bases desechables. El mensaje del gate para imagenes sin el preflight no se
diferencia aun del de Storage no preparado.
