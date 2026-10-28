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
