# Content Intelligence V1: revisión de seguridad (etapa 4D)

Alcance: todo el código de Content Intelligence desde su primera implementación hasta `08ebc346f`
(API, worker Python, cola, scheduler, Resource Governor, políticas, migraciones, índices, Storage, derivados, visor,
búsqueda, coordenadas, PDF buscables, histórico, instalación opcional y scripts de certificación).
Todo se verificó en el laboratorio aislado (`runly-content-*`, loopback, usuarios `*.example.test`, documentos sintéticos).
Nada de esto es una certificación: ver `CONTENT_INTELLIGENCE_V1_RELEASE_CANDIDATE.md` para las clasificaciones y compuertas.

## 1. Hallazgos

Severidad por exposición real, no por apariencia. «Corregido» significa corregido y verificado con prueba o flujo del laboratorio.

| ID | Sev. | Área | Hallazgo | Exposición real | Estado |
|---|---|---|---|---|---|
| F-01 | P1 | Worker / visor | `pdftoppm` ignoraba el CropBox mientras el visor (pdf.js) lo respeta: en PDF con CropBox distinto del MediaBox el overlay y la capa de texto del PDF buscable quedaban desplazados (97 px medidos en el caso de prueba). Es corrupción silenciosa de coordenadas, no fuga | Todo PDF escaneado con CropBox | Corregido (`-cropbox`); prueba con MediaBox/CropBox/rotación 0-270 contra verdad por maquetación |
| F-02 | P1 | PDF buscable | En páginas escaneadas con texto girado (p. ej. `/Rotate 270`) la capa de texto se escribía horizontal sobre cajas verticales: seleccionar/copiar daba texto ilegible aunque «se encontraba» | PDF buscables de escaneos girados | Corregido (orientación del texto guardada y matriz de texto rotada); prueba con 5 geometrías |
| F-03 | P2 | Despliegue | El worker compartía red con base de datos y demás servicios (sin credenciales, pero con alcance de red) | Un parser comprometido podía sondear la red interna | Corregido: red `content-private` interna con solo la API; `compose config` verificado |
| F-04 | P2 | API | Las rutas `/content/admin/company*` respondían 500 (no 403) a un miembro sin administración: el middleware envolvente descartaba la respuesta del guardián | Sin acceso indebido, pero un 500 oculta el control y ensucia alertas | Corregido y cubierto por el flujo de identidades reales |
| F-05 | P2 | Derivados | Objetos de Storage huérfanos: borrado en cascada del archivo, purga concurrente con la generación y fallo tras subir el objeto | Retención indebida de documentos derivados | Corregido: tabla de drenaje alimentada por trigger, solo se borran objetos nombrados; ningún borrado por prefijo |
| F-06 | P2 | Worker | Errores de librerías (`OSError` por PNG truncado, etc.) salían de `extract` sin código; el resultado seguro dependía de un `except Exception: pass` | Resultado correcto por casualidad | Corregido: `extract` envuelve y devuelve siempre `ProcessingError` con código estable |
| F-07 | P2 | PDF | PDF cifrado o con contraseña terminaban en `PARSER` indistinguible; con restricciones `Encrypted: yes` se procesaba | Ninguna elusión; mensaje impreciso | Corregido: `ENCRYPTED` (copia) y `UNSUPPORTED` (lectura); nunca se descifra |
| F-08 | P2 | PDF buscable | Capa de texto en Windows-1252: el resto se sustituía por `?` | Corrupción silenciosa de texto | Corregido: código por página + `ToUnicode`; lo que no cabe (más de 190 símbolos distintos en una página) se cuenta y se informa, nunca se sustituye |
| F-09 | P2 | Rendimiento | La paginación del histórico recorría la clave primaria a través de las filas de todas las empresas | Costo proporcional al número de inquilinos en cada pasada | Corregido con índice parcial `(entity_id, id) WHERE enabled`; medido 245 → 10 buffers con 50 empresas |
| F-10 | P2 | Worker (4C) | El análisis de imagen sobrescribía las dimensiones del lienzo en imágenes rotadas | Overlays desalineados | Corregido en 4C con prueba de regresión |
| F-11 | P2 | Derivados | Un archivo desactivado perdía su copia buscable aunque la política de producto es no borrar en silencio | Pérdida de resultado | Corregido: solo se elimina por revisión nueva, purga explícita o eliminación definitiva; nunca se sirve mientras el archivo está desactivado |
| F-12 | P2 | Visor | HEIC no se mostraba en Chrome/Firefox (el visor no pasaba por la variante de imagen existente) | Solo experiencia | Corregido reutilizando el servicio de transformación de imágenes; verificado en Chromium y Firefox |
| F-13 | P2 | Cadena de suministro | Bibliotecas nativas de HEIC (libheif, libde265, x265) sin evaluar por Scout | Superficie de decodificadores con historial de errores de memoria | Mitigado: HEIC es una capacidad explícita **apagada por defecto** (`RUNLY_CONTENT_HEIC=off`); con ella apagada las bibliotecas no se cargan. Evaluación pendiente: ver §3 |
| F-14 | P3 | Documentación | 4C decía que los PDF buscables «se eliminan al desactivar el servicio»; la frase correcta es archivo desactivado / revisión nueva | Confusión | Corregida |
| F-15 | P3 | API | Documento de 30 páginas: 896 KB al abrir | Rendimiento | Corregido en 4C (presupuesto 1500 palabras) |

Sin hallazgos P0. Sin exposición cruzada entre empresas, sin acceso no autorizado a derivados y sin pérdida de originales en ninguna de las pruebas.

### Residuos aceptados (documentados, no corregidos)

| ID | Tema | Detalle |
|---|---|---|
| R-01 | URL firmada de derivados | Capacidad portadora de 60 s: quien la tenga, de cualquier empresa, la usa dentro de la ventana (medido: 200 antes de expirar, 400 a los 66 s). No se revoca al reemplazar el archivo ni al retirar un permiso. Se mantiene 60 s |
| R-02 | Cierre de sesión | El token de acceso sigue siendo válido hasta su expiración (laboratorio: `GOTRUE_JWT_EXP=3600` s); el refresh token sí queda revocado. Es el comportamiento de plataforma, no específico de este módulo |
| R-03 | giflib (CVE-2024-45993, CVE-2026-23868) | Presente por dependencia de leptonica. No alcanzable: ver §2 |
| R-04 | Bibliotecas nativas de HEIC | Sin certificar; ver §3 |

## 2. Vulnerabilidades antes y después

Docker Scout, `docker scout cves` sobre las imágenes locales (SARIF en `audits/content-intelligence-stage4d/`):

| Imagen | Críticas | Altas | Medias | Paquetes |
|---|---|---|---|---|
| Etapa 2 (337 MB) | 0 | 1 | 2 | 58 |
| Etapa 4C/4D (377 MB) | 0 | 1 | 2 | 61 |

| CVE | Componente / versión | Severidad | Exposición | Versión corregida | Estado final |
|---|---|---|---|---|---|
| CVE-2026-107891 | musl 1.2.6-r3 | Alta según Scout (NVD «unknown») | `regcomp` con expresión regular hostil; ni Tesseract ni Poppler ni Python del worker compilan expresiones del documento | Tracker de Alpine: **3.24 corregido en 1.2.6-r3** (r6 es solo `edge`) | Falso positivo de Scout (compara con `edge`); versión instalada ya corregida |
| CVE-2024-45993 | giflib 5.2.2-r2 | Sin asignar | Desbordamiento en la utilidad `gif2rgb`, no en la biblioteca; el worker nunca la ejecuta | Solo `edge` (6.1.3) | Aceptado: sin versión corregida en 3.24; no alcanzable |
| CVE-2026-23868 | giflib 5.2.2-r2 | Sin asignar | Doble liberación en `GifMakeSavedImage` (edición de GIF); el worker entrega a Tesseract únicamente el PNG que él mismo escribe con Pillow, nunca un GIF del usuario | Solo `edge` (6.1.3) | Aceptado: sin versión corregida en 3.24; no alcanzable |

Las vulnerabilidades de `fabric` e `image-size` de Studio son hallazgos de plataforma independientes: no se tocaron ni se mezclaron en estos commits.
Una ausencia de hallazgos de Scout no demuestra ausencia de vulnerabilidades: Scout no ve Tesseract/Poppler compilados ni las bibliotecas de la rueda de HEIC.

## 3. Bibliotecas nativas de HEIC (pillow-heif 1.9.0)

Rueda instalada: `pillow_heif-1.9.0-cp313-cp313-musllinux_1_2_x86_64.whl`, SHA-256
`77af8c21abb27d559dfd425f3e535ce38faab20ddc520189b7e796bc878c7cc6` (aarch64: `00246de68fc788b4468f8ac2f8b76a789ec3a68215923429b1630105645178f8`).
La rueda incluye su propio SBOM (`auditwheel.cdx.json`) y `LICENSES_bundled.txt` (copiados a la evidencia).

| Componente | Versión verificada | Origen verificable | SHA-256 del archivo cargado | Licencia | ¿Se carga al decodificar? |
|---|---|---|---|---|---|
| libheif | 1.23.7 | tag `v1.23.7` de strukturag/libheif | `6c8dad6d…044316a` | LGPL-3 | Sí |
| libde265 | 1.1.3 (decodificador HEVC) | tag `v1.1.3` de strukturag/libde265 | `bf5630b8…b5da5b04` | LGPL-3 | Sí |
| x265 | 4.3 | tag `4.3` de Multicoreware/x265 | `76cb0b06…a954a6eb` | GPL-2 | **Sí** (dependencia de enlace dinámico de libheif; el codificador nunca se invoca; no se puede retirar sin recompilar: sin él `import` falla) |
| libgcc / libstdc++ | 14.2.0-r6 (Alpine, empaquetados) | auditwheel | `42b5f2c8…`, `28c43a1f…` | GPL-3 con excepción | Sí |
| `_pillow_heif` (extensión) | 1.9.0 | rueda | `ad291c6e…ca86fa` | BSD-3 | Sí |

Opciones de compilación observadas (`pillow_heif.libheif_info()`): decodificador `libde265`, codificadores `x265` y `mask`, **AVIF vacío**
(sin aom/dav1d). Superficie de ataque real: contenedor ISO-BMFF de libheif + decodificador HEVC de libde265.
Mitigaciones activas: usuario sin privilegios, sin capacidades Linux, sin red (red interna solo hacia la API), sistema de archivos de solo lectura,
`/tmp` sin ejecución, límite de memoria por proceso (`RLIMIT_AS`) y de tiempo con muerte del grupo de procesos, píxeles comprobados en la cabecera antes de
decodificar, solo la imagen principal, sin miniaturas ni auxiliares.

Contraste con avisos públicos (búsqueda del 2026-11-26):
- libde265: los CVE de 2026 consultados (p. ej. CVE-2026-45382/45383, CVE-2026-49346, CVE-2026-54240/54241) se corrigen en 1.0.19, 1.1.0 o 1.1.1; **1.1.3 es posterior**.
  No encontré un aviso que cite 1.1.3 específicamente.
- libheif: 1.23.7 figura como versión de corrección de seguridad (Fedora, Debian 1.23.7-2). **CVE-2026-62291 aparece sin versión corregida** (Red Hat: estado NEW):
  riesgo abierto sobre una de las bibliotecas cargadas.
- x265 4.3: sin avisos consultados; **no evaluado**.
- Parches de distribución/backports: esta rueda no los usa (compila desde upstream), así que los números de versión de upstream son los relevantes.

Conclusión: libheif y libde265 están en versiones recientes pero la evaluación de CVE es **incompleta** (CVE-2026-62291 abierto, x265 sin evaluar, sin escáner que vea las bibliotecas).
Por el requisito de la etapa, HEIC queda como capacidad explícita **apagada por defecto**; el resto del motor (JPEG/PNG/WebP/TIFF, PDF, Office, texto) no depende de ella.
Alternativas evaluadas: actualizar la rueda (1.9.0 es la última publicada), compilar libheif+libde265 sin x265 en la etapa de construcción (elimina 23 MB y la exposición GPL/encoder; trabajo de la etapa 5 con fijación por hash),
sustituir el decodificador (sin candidato mantenido en musl con la misma cobertura). Reactivar con `RUNLY_CONTENT_HEIC=on` solo tras cerrar CVE-2026-62291 y decidir sobre x265.

## 4. Aislamiento y endurecimiento del worker (verificado)

Contenedor con las banderas de producción (`--cap-drop ALL`, `no-new-privileges`, `--read-only`, `pids 64`, `512m`, `0.5 cpu`, `/tmp` `noexec,nosuid,nodev`, sin red):

| Comprobación | Resultado medido |
|---|---|
| Usuario | uid/gid 10001 |
| Capacidades efectivas | `CapEff: 0000000000000000`; `NoNewPrivs: 1`; seccomp activo (2) |
| Socket Docker | ausente |
| Escritura en `/app` y `/usr` | «Read-only file system» |
| Ejecutar desde `/tmp` | «Permission denied» |
| Salida de red | `URLError` |
| Credenciales en el entorno | solo la clave pública del intérprete de Python (`GPG_KEY`); ningún secreto |

Entradas hostiles (prueba unitaria `test_hostile_inputs_*` y las de etapas anteriores), todas terminan con código estable, sin red y sin ejecución:
PNG/JPEG truncados, PNG con cabecera de 60 000×60 000 (`LIMIT`), tipo declarado incorrecto, PDF con bytes aleatorios, archivo vacío, EXIF de 60 KB (se ignora),
SVG con referencia remota (solo texto, sin seguir el enlace), DOCM con `vbaProject.bin` (ni se lee ni se ejecuta), DOCX con 30 MB de XML (rechazado),
entidades XML, ZIP con expansión desproporcionada, PDF cifrado y con contraseña, tiempo máximo con muerte del grupo de procesos, y árbol temporal sin restos tras un fallo.
No se usaron muestras maliciosas reales. No probado: agotamiento real del `tmpfs` de 256 MiB (el gobernador pausa por disco bajo 100 MB; cubierto por prueba unitaria de la función pura, no de extremo a extremo).

## 5. Aislamiento con usuarios reales, RLS y Storage

`scripts/content-certification/vertical-isolation.mjs`: usuarios reales creados en el servicio de autenticación del laboratorio
(A: administrador, miembro, solo lectura; B: administrador), tokens reales, API HTTP real y Storage real. 32/32 comprobaciones superadas
(`audits/content-intelligence-stage4d/vertical-isolation.json`):

1. Miembro de A lee texto y coordenadas y encuentra el archivo por contenido. 2. El administrador de B, con su empresa o declarando la de A, recibe 404/403; su búsqueda nunca contiene texto, fragmentos ni marcador de A, y no puede pedir OCR ni derivado.
3. Un miembro que pierde su membresía después de indexar es rechazado de inmediato. 4. Un archivo que pasa a `RESTRICTED` desaparece al instante del texto, coordenadas y búsqueda del miembro.
5-6. Una invitación pendiente no concede nada; aceptada, concede al instante; revocada, retira al instante.
7. Reemplazo de versión: el texto anterior no se presenta como vigente (estado `pending`, sin páginas), el derivado anterior responde 404 y la versión nueva se procesa sola.
8-9. Desactivar durante el procesamiento deja 0 trabajos y ningún texto; restaurar reprocesa desde cero. 11. Tras cerrar sesión el refresh token queda revocado (el token de acceso sigue vivo: R-02).
12. Identificadores inventados o mal formados, y `?unit=1;DROP`, rechazados sin detalle. 13. Un miembro de solo lectura no puede lanzar OCR; las rutas de administración de empresa e instancia devuelven 403; los tokens de usuario no sirven en rutas del worker.
14-15. URL firmada vencida: 400 a los 66 s; dentro de su ventana funciona para quien la tenga (R-01).
16. Purga concurrente con generación de PDF: 0 filas y 0 objetos pendientes de borrar tras el mantenimiento.
Los registros de la API durante toda la ejecución no contienen el texto reconocido ni el marcador.
No se probó: cambio de empresa con una solicitud en vuelo (cubierto solo por el encabezado de empresa por solicitud), cierre de sesión con el visor abierto en el navegador, ni comportamiento de RLS directo sobre PostgREST con tokens de usuario (la verificación `verify-postgrest-exposure` de la plataforma pasa 7/7 y el esquema `runly_content` no se expone).

## 6. Consistencia y ciclo de vida de derivados

- Cada derivado pertenece a (archivo, revisión, `object_key`); la finalización con un lease de una revisión anterior se rechaza (`leasedDerivative` exige la revisión vigente) y la subida condiciona la actualización a `state='processing'`; si la fila desapareció el objeto subido se elimina.
- Un trabajo OCR antiguo tampoco puede sobrescribir una versión nueva: el trigger de invalidación borra los trabajos al cambiar revisión/objeto/bucket/suma/empresa o al desactivar el archivo.
- Desactivar el procesamiento, desactivar la búsqueda y purgar son acciones distintas: la primera detiene trabajos nuevos y **no borra** resultados ni copias; la purga es explícita (`PURGAR`), autorizada y auditada (`purge.start`/`purge.done` con recuentos de trabajos y derivados).
- PostgreSQL ↔ Storage: todo borrado de fila de derivado (explícito, por revisión, purga o cascada) registra su objeto en `derivative_orphan` (solo claves `content-derivatives/%`) y se drena fuera de la transacción de la cola. No hay borrados por prefijo ni escaneos del bucket.
- Cubierto: objeto subido con transacción fallida, fila sin objeto (descarga responde error de firma), worker muerto antes de confirmar (el lease expira y vuelve a `pending`), reintento (sobrescribe la misma clave), eliminación de la empresa (cascada + drenaje), purga concurrente (verificada).
  No cubierto de extremo a extremo: caída de Storage durante el drenaje (se conserva la fila para el siguiente mantenimiento; verificado por revisión, no por prueba).

## 7. Cumplimiento de las compuertas de seguridad (laboratorio)

| Compuerta | Estado |
|---|---|
| P0/P1 de seguridad sin resolver | Ninguno abierto (F-01 y F-02 son de corrección, resueltos) |
| Exposición cruzada entre empresas | No observada (32 comprobaciones con identidades reales) |
| Acceso no autorizado a derivados | No observado |
| Bibliotecas nativas relevantes sin evaluar **y habilitadas** | HEIC apagado por defecto; no habilitado hasta evaluar |
| Vulnerabilidades altas explotables sin mitigación | Ninguna (la alta es falso positivo documentado) |
| Corrupción silenciosa de texto | No observada; la capa Unicode informa lo que no puede codificar |
| Resultados antiguos presentados como vigentes | No observado (flujo 7) |
| Pérdida de originales | No observada (tamaño/objeto/hash verificados) |
| Derivados incompletos presentados como correctos | No observado (`state='done'` solo tras confirmar subida) |

Estado de seguridad propuesto: **Pendiente de certificación** (laboratorio superado; HEIC sin certificar; sin host dedicado, sin pruebas de carga, sin RLS directo en PostgREST con tokens de usuario).
