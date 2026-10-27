# Studio: retirada de diseños y diagnóstico del catálogo

Validación exclusivamente local con datos sintéticos y Docker desechable. No se
publicaron imágenes, no se desplegó ni se accedió a servidores del usuario. El
trabajo no modifica archivos del Installer ni migraciones históricas.

## Eliminar un diseño

`DELETE /studio/designs/:id` recibe `{ "revision": 1 }` y exige sesión, empresa
activa, `studio.view`, `studio.edit` y propiedad efectiva. Un administrador de
empresa no adquiere propiedad implícita. Los colaboradores no pueden eliminar.
Una revisión antigua devuelve 409; un diseño inaccesible o retirado devuelve 404.
El SDK expone `studio.deleteDesign(id, revision, token)` con el mismo contexto de
autenticación y empresa que el resto de Studio.

La transacción toma los bloqueos de autorización y del diseño, conserva el JSON,
marca `enabled=false`, incrementa la revisión y registra `studio.design.delete`.
Dos eliminaciones simultáneas producen una retirada y una auditoría. Se conserva
la fila, sus colaboradores, assets, referencias de plantilla e historial. No se
borra ningún original de Files ni se añade eliminación en cascada.

El cambio de `enabled` utiliza el trigger existente de época de autorización.
Las operaciones nuevas, `/changes`, las renovaciones de colaboración y las nuevas
URLs de imágenes se deniegan desde la confirmación de la transacción. Las sesiones
abiertas se cierran conforme a la concesión efímera existente, de hasta 30 s; una
capacidad de imagen ya emitida conserva su caducidad existente de hasta 60 s. No
se promete borrar píxeles que otro cliente ya descargó. La UI informa que el diseño
ya no está disponible y permite descargar el borrador pendiente en JSON, sin bytes
de imágenes ni tokens. Si falla el almacenamiento local, lo advierte.

Las tarjetas autorizadas ofrecen el menú **Eliminar diseño** y `ConfirmDialog`.
Cancelar no llama al endpoint. El éxito solo se muestra tras respuesta del servidor.
Se eliminan entradas de caché de las páginas, filtros y Recientes de esa empresa y
usuario. Si queda vacía una página posterior, se retrocede. La lista también se
actualiza por foco y cada 30 s mientras está activa, para retiros en otra sesión.
Se mantiene un único lugar para eliminar, en la tarjeta, sin duplicarlo en el editor.

### Conservación de copias e imágenes

La migración nueva `20261211000000_studio_retired_asset_lineage` evita que retirar
el origen rompa una copia independiente que ya tenía acceso a sus imágenes.
`can_access` sigue rechazando un diseño retirado como entrada directa. Solo la
recursión interna de referencias puede recorrer un origen retirado, conservando
las comprobaciones de empresa, membresía, permisos, colaborador, archivo habilitado
y profundidad máxima. Compartir una copia con alguien sin acceso al origen no
otorga ese acceso. Revocar la membresía o el archivo continúa revocando su uso.

El helper `reference_access` es privado, con `search_path=''` y sin EXECUTE para
PUBLIC, anon, authenticated, service_role o el rol de socket. No cambia RLS ni
propiedad de esquemas internos de Supabase. Las plantillas personales/publicadas
y sus copias materializadas conservan su comportamiento existente. Debe aplicarse
esta migración nueva antes de usar la retirada; no exige reescribir documentos ni
marcar migraciones históricas como aplicadas. Fue creada con Supabase CLI y
secuenciada tras las migraciones existentes.

## Qué produjo los 504 reproducidos

Se comparó el transporte anterior desde el host y una imagen API local: Iconify
respondió en aproximadamente 182–185 ms; las búsquedas de fotos e ilustraciones de
Openverse terminaron exactamente al límite local de 15 000 ms. DNS, TCP y TLS
habían finalizado, pero no llegó una cabecera HTTP. La causa comprobada del **504
reproducido** es el temporizador del cliente HTTPS esperando la respuesta de
Openverse. No fue una respuesta HTTP 504 del proveedor ni un timeout de Nginx en
esa ruta directa.

El nuevo diagnóstico separa ese caso como `CATALOG_HEADERS_TIMEOUT`, alrededor de
5,1 s, manteniendo el presupuesto total. En este Docker también se comprobó falta
de salida IPv6 (`ENETUNREACH`); IPv4 respondió para Iconify y los originales
públicos. La búsqueda Openverse siguió sin enviar cabeceras por IPv4. La misma
fase se reprodujo en el host, incluso con rutas forzadas. Por ello **no se atribuye
el bloqueo de Openverse exclusivamente a IPv6**, ni se afirma que el servidor del
usuario tenga esta misma causa. La causa dentro del proveedor, WAF o tránsito
posterior al TLS no quedó determinada. No se reprodujo una caída pública de
Iconify. Los bloqueos externos se comunican y no se presentan como resultados vacíos.

### Transporte y límites

| Control | Comportamiento |
| --- | --- |
| Tiempo | DNS 2 s, TCP 2 s, TLS 2,5 s, cabeceras 5 s, descarga 5 s; siempre recortados al presupuesto restante |
| Presupuesto por operación | Búsqueda, detalle y miniatura 15 s; importación 30 s, compartidos por metadata, descarga, fallback y retry |
| Direcciones | Valida todas las respuestas DNS, rechaza mixtas con privadas, alterna familias y prueba como máximo cuatro direcciones públicas |
| Fallback | Solo fallos TCP/TLS; lookup fijado y asíncrono, familia explícita, SNI original, certificados obligatorios |
| Reintentos | Solo HTTP 502/503/504 real del proveedor, una vez con jitter de 100–249 ms, dentro del mismo presupuesto |
| Redirecciones | Hasta dos, con HTTPS, allowlist y nueva validación DNS en cada destino |
| Memoria | Metadata 256 KiB, originales 10 MiB, límites de píxeles y procesamiento existentes; destrucción de respuestas y sockets al fallar |
| Cancelación | Señal desde el cliente, temporizadores y listeners liberados; un DNS tardío no inicia otra petición |
| Colas | API 4 simultáneas y miniaturas 8 en backend; Files y catálogo tienen colas frontend separadas de 4, hasta 48 pendientes y espera máxima de 10 s |

No se amplió el timeout general a 60 s ni se deshabilitó TLS, SSRF, licencias,
autorización, allowlist o privacidad de Files. Se corrigió además el lookup fijado
síncrono: podía producir un error inmediato no manejado al construir el socket TLS
en una ruta IPv6 sin salida. Se conservan los listeners de error al destruir o
cambiar de intento. Las pruebas incluyen ese error tardío y el contrato asíncrono.

La UI limita búsquedas a 18 s, miniaturas a 26 s incluyendo cola y la petición de
importación al catálogo a 35 s. Eliminó el bucle automático de tres intentos por miniatura que multiplicaba
los reintentos del backend. El retry de una miniatura es explícito e independiente.
Fotos e ilustraciones conservan categorías distintas, paginación, metadata,
atribución y validación del original al importar a Files privado.

### Diagnóstico reutilizable de solo lectura

La imagen API incluye `scripts/diagnose-studio-catalog.mjs`. Sobre una imagen que
contenga este cambio, el operador puede ejecutar:

```sh
docker run --rm --read-only --cap-drop ALL --security-opt no-new-privileges \
  --entrypoint node "$API_IMAGE" scripts/diagnose-studio-catalog.mjs --families
```

`API_IMAGE` debe seleccionar una imagen revisada de esta versión. No requiere
`.env`, conexión a PostgreSQL ni credenciales. Consulta únicamente probes públicos
fijos de Iconify, Openverse, Wikimedia y Flickr; muestra DNS A/AAAA, familia,
dirección pública seleccionada, TCP, TLS/certificado/SNI, primera respuesta,
duraciones y códigos. Sin `--families` usa el fallback normal. No imprime cuerpos,
consultas, cabeceras, secretos o URLs firmadas. No ejecuta cambios en el sistema.
Los resultados de red pueden variar con el tiempo y entre instalaciones.

Cada solicitud del catálogo lleva `X-Runly-Catalog-Request` entre SDK y API; el
error del SDK conserva `catalogRequestId`. Un 504 de un proxy sin respuesta JSON
del backend no tiene el código de etapa de Studio: se debe correlacionar con el
log del proxy y el identificador. `CATALOG_UPSTREAM_504` conserva la diferencia
entre HTTP del proveedor y `CATALOG_*_TIMEOUT` local.

La instrumentación backend está desactivada por defecto. Activar temporalmente
`RUNLY_STUDIO_CATALOG_DIAGNOSTICS=1` emite como máximo un informe por minuto y
proceso, hasta 32 eventos, sin consulta, actor, empresa, tokens, cuerpos ni URLs
privadas. Registra entrada, autorización, operación, DNS, TCP/TLS, primer byte,
descarga, validación, procesamiento y salida con status/código e identificador.
Desactivar después de recoger la evidencia necesaria.

### Uso cuando el proveedor falla

La biblioteca distingue falta de conexión, timeout, cuota, proveedor no disponible,
licencia incompatible, resultado vacío, miniatura e importación fallidas. Archivos
sigue disponible independientemente de las miniaturas externas. La colección
inicial contiene ocho iconos Lucide editables, con búsqueda española/inglesa y
sin ninguna petición externa. Su geometría ocupa aproximadamente 3,8 KiB en el
backend; conserva el aviso íntegro ISC/MIT. Las colecciones remotas siguen
disponibles y no se aparenta que funcionen cuando fallan.

## Verificación reproducible

```sh
node scripts/build-studio-delete-catalog-local.mjs
node scripts/verify-studio-catalog-transport.mjs
node scripts/verify-studio-delete-catalog.mjs
```

El build genera etiquetas locales nuevas para API/Web/Worker desde un snapshot de
HEAD más los archivos propios declarados; no publica ni reemplaza imágenes base.
Excluye cambios ajenos sin commit en el archivo compartido de recursos. Las pruebas
usan nombres de proyecto aleatorios, puertos loopback, usuarios/empresas/imágenes
sintéticos y una identidad de base comprobada antes de migrar; eliminan únicamente
sus contenedores y volúmenes. Los resultados y capturas quedan en `.artifacts/`
ignorado. No se versionan direcciones reales ni logs de infraestructura.

La suite Node de Studio, catálogo, intercambio, SDK, UI, Realtime, Canvas y Notes
pasó 361 tests, sin fallos; un test PostgreSQL condicional existente se omite fuera
de su entorno. La suite desechable sí ejecuta SQL, migraciones, autorización y
Files reales y abre navegadores Playwright. El proveedor TLS Docker controlado
comprueba certificados, fallback de TLS bloqueado, cabeceras/descarga lentas,
redirect malicioso, límite de bytes, 429/502/504, JSON malformado y retry acotado.
Las pruebas unitarias completan DNS vacío, IPv6 sin salida, múltiples A,
cancelación, saturación, miniaturas corruptas y aislamiento entre colas.

La ejecución final de Node usó `--test-concurrency=2`: una ejecución con todos los
archivos paralelos y Docker activo expuso un timeout en un test de renovación
Realtime existente. No se modificó ese test ni se amplió su espera. El chequeo
de propiedad de esquemas Supabase y ESLint de los archivos propios pasaron.
React Doctor no reportó problemas en la UI de esta entrega; mantuvo dos avisos en
`ImageEditorPanels.jsx`, modificado por otra sesión. `pnpm check:privacy` reportó
67 hallazgos anteriores en otros archivos; la revisión específica de los 36
archivos propios encontró cero. Esos hallazgos globales no se presentan como resueltos.

Resultados públicos dentro de la imagen API local final, sin montajes de código
ni variables de instalación (`d622a193a8e7-api`, Node 22.23.4):

| Probe | IPv4 | Tiempo total | IPv6 forzado |
| --- | --- | --- | --- |
| Iconify búsqueda | HTTP 200 | 203 ms | CONNECT_FAILED, 12 ms |
| Openverse fotografía | HEADERS_TIMEOUT | 5096 ms | CONNECT_FAILED, 107 ms |
| Openverse ilustración | HEADERS_TIMEOUT | 5114 ms | CONNECT_FAILED, 9 ms |
| Wikimedia imagen pública | HTTP 200, 38 692 bytes | 181 ms | CONNECT_FAILED, 4 ms |
| Flickr origen público | HTTP 200 | 186 ms | CONNECT_FAILED, 10 ms |

La imagen final conserva también builds Web y Worker con el mismo sufijo local.
El snapshot usa HEAD `9a0da7bd` más los overlays propios declarados, aislando
cambios de otras sesiones; no es una imagen publicada. Los datos de red son una
muestra de esta máquina y no certifican disponibilidad futura del proveedor ni
la configuración de un servidor que no fue inspeccionado.

### Resultado integral final

La suite Docker/Playwright final terminó correctamente con las tres imágenes
anteriores, 225 migraciones aplicadas desde una base vacía y sin montar fuentes
de producto sobre los contenedores. Arrancó también el Worker. Comprobó:

- Propietario, lector, editor, administrador sin propiedad y otra empresa;
  revisión obsoleta y dos DELETE concurrentes con una sola auditoría.
- Documento, colaboradores, templates personal/publicado y copias conservados;
  acceso legítimo a imágenes de un origen retirado y denegación a un nuevo tercero.
- Bytes originales idénticos desde Files privado y permisos EXECUTE privados del
  helper SQL; exportación de la plantilla preservada a `.runlystudio`, preparación,
  confirmación e importación real con imágenes en la base desechable.
- Tres navegadores en el mismo diseño: retirada detectada en **20 275 ms**,
  cambios locales pendientes descargables y sin escritura posterior en el JSON
  del servidor. Reconexión de otro cliente offline después de la retirada con
  el mismo rechazo y conservación del borrador.
- Menú real de tarjeta, cancelar, confirmar, retirar la última fila de página 2
  y volver a página 1, filtro Míos y desaparición de una tarjeta retirada desde
  otra sesión por el refresco periódico.
- Iconos locales editables, error de proveedor explícito y recuperación,
  búsqueda de fotografías e ilustraciones e importación real a Files privado;
  ambas inserciones completadas y los dos objetos de imagen guardados.

Las capturas de retirada y recuperación del catálogo se revisaron visualmente.
El bloqueo público de búsquedas Openverse descrito arriba continúa: el simulador
demuestra la integración, no disponibilidad de ese proveedor externo.

## Commits

- `0e132441` — eliminación lógica, autorización, conservación de referencias,
  SDK/UI, transporte acotado, catálogo local, diagnóstico, documentación y pruebas.
- El cierre documental que añade esta referencia no cambia el producto ni los
  archivos concurrentes del Installer o de edición de imágenes.
