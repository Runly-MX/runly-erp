# Content Intelligence: consolidación y evidencia

Evaluación: 2026-11-25. **APTO PARA PRUEBAS AISLADAS. V1 incompleta.**
No se hizo push, publicación de imágenes ni despliegue operativo. Todo el ERP
utilizado en esta etapa es un laboratorio aislado, con empresa y usuarios sintéticos.

## Resultado ejecutivo

Se consolidó la integración existente, sin duplicar Storage, autorización,
configuración ni cola. Ahora hay checkpoints por página, reanudación, controles
administrativos ampliados, horarios, presupuestos, retención, estadísticas reales,
modelos reproducibles, búsqueda con ranking y coincidencia aproximada limitada,
y overlays del visor de imagen/PDF. La reducción de hallazgos del escáner es real,
pero su cobertura de los componentes compilados es incompleta y se declara.

El ERP con Auth y Storage reales pasó el recorrido de navegador. La carga de
18 escenarios no certificó el objetivo de degradación p95 inferior al 10%.
No corresponde elevar la clasificación a staging ni generar un RC integral.

## Requisitos, cambios y arquitectura

La [matriz completa](CONTENT_INTELLIGENCE_STAGE2_MATRIX.md) mantiene estados al
inicio/cierre y límites de evidencia. Las instrucciones completas de instalación,
administración, actualización y rollback están en
[CONTENT_INTELLIGENCE_V1.md](CONTENT_INTELLIGENCE_V1.md).

Una sola API Hono autoriza el archivo vigente mediante FilesService. PostgreSQL
conserva políticas, trabajos, leases, páginas, intentos, cursores y totales. Un
worker Python por proceso descarga solo el original autorizado mediante lease;
no recibe credenciales DB/Storage. Tesseract/Poppler se ejecutan localmente.
React usa el SDK y los componentes compartidos. Los archivos originales permanecen intactos.

Cambios principales:

- El proceso padre posee los temporales y mata/recolecta el grupo de parsers.
- Checkpoints idempotentes por unidad, fingerprint de pipeline y `resumeUnits`.
- RLIMIT_AS heredado, cgroups, CPU media, histéresis, límites de tmp/PIDs/hilos y
  pausa por presión del proceso API. No se mide presión del host ni PostgreSQL.
- Presupuestos y switches se intersectan entre instancia y empresa; perfiles y
  calidad son independientes. Protocolos de worker antiguos no reciben trabajos.
- Ventanas con zona horaria/medianoche, cuotas diarias, retención acotada,
  filtros históricos por tipo/carpeta/fecha/estado/confianza/motor/calidad.
- Totales por trigger, historial reciente y métricas por intento; índices para
  actualización reciente y finalización, sin conteos completos en cada dashboard.
- Ranking exacto antes de prefijos y variantes de un solo carácter en identificadores.
  Cursor cifrado, temporal y ligado al usuario/empresa/consulta; snippets en lote.
  La autorización central aún hace consultas por candidato (máximo 50).
- Visor con texto seleccionable, copia/descarga, búsqueda/navegación, rectángulos
  OCR, zoom y rotación compartidos; sin posiciones inventadas para texto sin cajas.

El laboratorio descubrió y corrigió dos fallos de integración no cubiertos por el
router aislado: el filtro de dominios bloqueaba el DNS interno del worker, y el
backend intentaba descargar usando la URL pública reescrita de Storage. El prefijo
operativo conserva autenticación dedicada; la URL de Storage se convierte al origen
interno configurado únicamente para la descarga backend. Se añadieron regresiones.

## Seguridad y dependencias

[Informe por CVE/paquete, alcance y mitigación](audits/content-intelligence-stage2/SECURITY.md),
[datos estructurados](audits/content-intelligence-stage2/vulnerabilities.json) y
[SBOM SPDX](audits/content-intelligence-stage2/sbom.spdx.json).

Antes: 50 CVE únicos altos/críticos, 77 hallazgos SARIF, 295 paquetes detectados.
Después: un CVE alto, cero críticos reportados, 58 paquetes detectados por Scout.
Sin exclusiones. Scout no detectó Tesseract/Poppler compilados: el SBOM los añade
con fuente/hash y **no presenta esa adición como análisis de vulnerabilidades**.
Las bibliotecas integradas en wheels también requieren revisión adicional.

El CVE final es musl CVE-2026-107891. Scout indica r6; el
[tracker oficial de Alpine](https://security.alpinelinux.org/vuln/CVE-2026-107891)
identifica 1.2.6-r3 corregido en Alpine 3.24 y r6 en edge. Se conserva la discrepancia.
La imagen API del laboratorio tiene 81 CVE altos/críticos propios; el JSON distingue
intersecciones. No se atribuyen todos esos hallazgos al worker ni se afirma haber
corregido la seguridad completa del ERP.

Imagen multistage Alpine 3.24, Python 3.13.18, Pillow 13.0.0, Tesseract 5.5.4,
Poppler 26.11.0. Fuentes/modelos fijados por hash; sin descargas al ejecutar.
Se retiraron pip, SQLite y herramientas de compilación del runtime. No se añadieron
OpenCV, HEIC ni dependencias npm de producción. Se preservan licencias nativas.
Solo se verificó ejecución amd64; arm64 requiere validación propia.

Verificado: UID 10001, capabilities vacías, no-new-privileges, filesystem de solo
lectura, tmpfs 256 MiB, 64 PIDs, cgroups, plazos, ZIP bombs, XML externo/UTF-16,
píxeles y limpieza tras SIGKILL. Image.open restringe plugins a JPEG/PNG/WebP/TIFF.
El worker no tiene socket Docker. Compose no implementa un firewall de salida:
eso continúa siendo responsabilidad de infraestructura.

## Reconocimiento y formatos

[Resultados por caso y comparación](audits/content-intelligence-stage2/OCR.md).
Doce casos sintéticos, tres modos, 36 extracciones con ground truth. En 1 CPU/1 GiB:

| Modo | CER medio | WER medio | Identificadores exactos | Tiempo de 12 casos |
|---|---:|---:|---:|---:|
| Rápido | 11.774% | 12.857% | 16/19 | 5.982 s |
| Equilibrado | 0.146% | 1.190% | 18/19 | 10.793 s |
| Alta precisión | 0.146% | 1.190% | 19/19 | 13.615 s |

Los promedios son por caso, incluida la imagen vacía. Alta precisión recuperó un
identificador adicional; no mejoró CER/WER medio ni la etiqueta canónica. Se
conservan errores O/0 e I/1 del texto original. No se promete superioridad universal.
RSS máximo por proceso: aproximadamente 73 MiB rápido/equilibrado y 81 MiB alta;
no es el pico agregado simultáneo del contenedor. El JSON incluye CPU y segundas pasadas.

Se verificaron JPEG/PNG/WebP/TIFF, EXIF, imágenes vacías, rotación/inclinación,
PDF digital/escaneado/híbrido entre páginas, DOCX/XLSX/PPTX mínimos, TXT/CSV/MD,
XML/JSON/SVG y límites. PDF con cualquier texto extraíble ya no se rasteriza por
tener menos de 20 caracteres. No se duplica OCR/texto digital entre páginas.
Un encabezado digital sobre una imagen escaneada en la misma página todavía puede
ocultar texto de la imagen: no se anuncia detección híbrida por regiones.
No hay HEIC, perspectiva avanzada ni PDF buscable derivado. Office complejo,
documentos protegidos y fotografías de campo necesitan un corpus adicional.

## Recursos y benchmarks del ERP

[Metodología, tabla completa y límites](audits/content-intelligence-stage2/BENCHMARK.md).
Se midieron 18 escenarios (2/4, 4/8 y 8/16 CPU/GB), con nueve contenedores acotados,
seis endpoints reales y 24 muestras por endpoint después de calentamiento.
Sin worker, instalado inactivo, nuevos, histórico, alta precisión y presión artificial.
El JSON incluye p50/p95/p99, errores, throughput, snapshots CPU/RAM, conexiones,
tamaño de DB e índices. Sin errores HTTP en esa carga. Inventario/Compras/POS no
tienen una población empresarial representativa; no se certifica capacidad real.

El p95 de Archivos, por ejemplo, pasó de 28.4 a 49.1 ms durante archivos nuevos en el
presupuesto 8/16. Otras rondas fueron mejores que la base. No se ocultan esos picos
ni se interpreta una muestra pequeña como cumplimiento del SLO <10%.
Una ronda previa asignó solo 128 MiB a Storage y provocó un reinicio; se descartó
como comparación y se corrigió el reparto del laboratorio. No es un OOM del worker.

Consumo depende del documento y calidad, no solo del perfil. OFF no requiere worker;
LIGHT limita la concurrencia/hilos a uno y evita OCR automático; SMART/CUSTOM permiten
presupuestos conservadores; DEDICATED no crea contenedores ni amplía cuotas físicas.
Un proceso ejecuta un trabajo. La prueba masiva usa cuatro workers explícitos;
el perfil por sí solo no aporta ese paralelismo.

## Histórico y recuperación

La prueba anterior de 149.088 s fueron 1,000 TXT, **cero documentos con OCR**, cuatro
workers y cola máxima 20. Su consulta de estadísticas p95 4.49 ms no era p95 del ERP.
No es una referencia de velocidad para fotografías ni PDF escaneados.

El [lote mixto real](audits/content-intelligence-stage2/HISTORICAL.md) finalizó
1,000 archivos: 585 con OCR y 415 digitales; cero fallidos, parciales u omitidos.
Cola máxima 20, cuatro workers de 0.5 CPU/1 GiB y 753.154 s de procesamiento y
recuperación, incluyendo pausa/reanudación y actualización/reinicios del worker.
No es una medición pura de velocidad de una única versión.

La evidencia de esta etapa incluye pausa/reanudación, filtros, recuperación de
leases, checkpoints, originales previos a activación, cancelación y revalidación
de revisión/empresa/objeto. Los resultados del lote mixto y sus interrupciones se
registran en el anexo de cierre. No se afirma haber probado días de funcionamiento.

## UX, responsive y accesibilidad

Playwright ejecutó login real, guardado/persistencia de políticas, subida a Storage,
OCR, búsqueda solo por serie y visor. Cuatro anchos: 1440, 768, 390 y 320 px, sin
overflow horizontal de documento en las comprobaciones. Se verificó foco de teclado
en el diálogo, modo oscuro y contexto móvil con `hasTouch` y taps reales.
Los rectángulos comparten geometría con imagen/canvas después de zoom/rotación.
No se sustituye esto por snapshots de componentes o solo build.

Capturas reales del laboratorio:

- [Administración escritorio](audits/content-intelligence-stage2/screenshots/settings-1440.png),
  [móvil](audits/content-intelligence-stage2/screenshots/settings-390.png),
  [320 px](audits/content-intelligence-stage2/screenshots/settings-320.png).
- [Visor escritorio](audits/content-intelligence-stage2/screenshots/viewer-1440.png),
  [móvil](audits/content-intelligence-stage2/screenshots/viewer-390.png),
  [oscuro y rotado](audits/content-intelligence-stage2/screenshots/viewer-dark-rotated.png),
  [táctil](audits/content-intelligence-stage2/screenshots/viewer-touch-390.png).
- [JPEG con EXIF](audits/content-intelligence-stage2/screenshots/exif-viewer-390.png),
  [PDF rotado escritorio](audits/content-intelligence-stage2/screenshots/pdf-rotated-1440.png),
  [PDF móvil](audits/content-intelligence-stage2/screenshots/pdf-rotated-390.png).

No se verificaron todas las combinaciones de navegador, lectores de pantalla,
archivos complejos y gestos multitáctiles. TIFF multipágina muestra la primera imagen.

## Regresión, privacidad y límites de salida

19 pruebas Node de Content Intelligence/overlays aprobadas, incluida PostgreSQL y
Docker; 17 pruebas Python aprobadas, con EXIF, limpieza y deuda de CPU.
La suite de seguridad general aprobó 166 pruebas. Build web y lint de los archivos
afectados aprobados. React Doctor informó advertencias de complejidad, índices de
claves y encadenamiento de efectos; no se presenta un score global como garantía.
Privacidad del repositorio se verifica antes de los commits; los informes públicos
omiten correos de proveedores del SBOM y no incluyen secretos ni sesiones.

Migración nueva: `20270116000000_content_intelligence_consolidation`, aditiva.
Se probó en PostgreSQL aislado; la migración original entregada queda intacta.
La base sin OCR sigue independiente del overlay. Instalar/actualizar exige nuevas
imágenes API/web/worker y aplicar migraciones; no se inicia histórico automáticamente.
Rollback conservador verificado: guardar OFF, detener worker y conservar API/web
actuales y tablas. Bajar a API/worker de la primera etapa requiere restaurar
políticas y función SQL compatibles; esa reversión binaria no está verificada.
No borrar originales ni hacer rollback SQL destructivo sin un backup verificado.

Pendientes que impiden staging/producción: SLO, ensayo prolongado, cobertura de
seguridad nativa/vendorizada, corpus real, búsqueda/ACL a gran escala, PDF/Office
complejos y matriz completa de accesibilidad/gestos. La matriz conserva otros
pendientes funcionales. El estado final de Git y commits se registra en el anexo.

## Estabilización final (2026-11-25, tercera ronda)

**Migración `20270116000000_content_intelligence_consolidation`:** el commit
`f22ca6f16` (sha256 `4a4792df...`) fue editado por `51f54127a` (sha256 `7f55e99f...`,
solo la condición del governor `IN ('ready','paused')`). `_prisma_migrations` de la
base persistente de desarrollo no la contiene; solo los laboratorios desechables
aplicaron la primera versión y se recrean. No se reescribe ni se añade otra migración;
si algún entorno persistente la aplicó con el hash anterior, necesita una migración
forward con `CREATE OR REPLACE` de esa función. No verificado en entornos fuera de este equipo.

**Auditoría `pnpm audit --prod`** ([JSON](audits/content-intelligence-stage2/pnpm-audit-prod.json)):
1 crítico, 14 altos, ninguno en OCR/API/worker. `tar` (crítico+altos) llega por
`fabric>canvas/jsdom`, dependencias de Node no empaquetadas en el navegador ni usadas
en runtime; `fabric` <7.2 (XSS en exportación SVG) y `image-size` (DoS en pptxgenjs)
son de Studio y requieren salto mayor de versión: deuda abierta de Studio, sin
mitigación aplicada. `mysql2`, `effect`, `deepmerge-ts` provienen del CLI de Prisma
(sin MySQL en uso). No se suprimió ni se bajó severidad de nada. El CVE musl del
worker sigue como en la sección de seguridad.

**Rendimiento:** ver la ronda A/B intercalada en BENCHMARK.md. SLO <10% no demostrado.

### Veredictos por ambiente

| Ambiente | Veredicto |
|---|---|
| Desarrollo local | APTO |
| Pruebas aisladas | APTO |
| Staging | NO APTO: SLO sin demostrar, sin corpus real, sin operación prolongada, sin ensayo de instalación/actualización en VPS |
| Producción piloto | NO APTO |
| Producción general | NO APTO |

No realizado en esta ronda (no se simula): corpus real de fotografías/facturas,
operación sostenida de horas/días, reinicios de ERP/Postgres/Storage durante carga,
dispositivo táctil físico, ensayo en staging real y corrección de las CVE de Studio.
Política de activación recomendada: Nivel 0 por defecto; Nivel 1 (una empresa, concurrencia 1,
sin histórico masivo) solo tras staging; Nivel 2 después de medir en host dedicado.

## Certificación local autónoma (2026-11-26, laptop de desarrollo)

Alcance de esta ronda: verificación automatizada en el laboratorio aislado ya
existente (`runly-content-*`). No hubo push, despliegue ni cambios fuera del
laboratorio. Los resultados son evidencia de laboratorio compartido, no de producción.

Realizado y verificado:

- Regresión nueva en PostgreSQL real (`postgres.test.js`, 6 pruebas activas, 0 fallos):
  heartbeat vencido cuenta como worker ausente (sin trabajos creados ni reclamados),
  solicitudes duplicadas simultáneas producen un solo trabajo, un archivo eliminado
  durante el procesamiento rechaza el resultado y no deja texto derivado, y el texto
  reconocido de otra empresa no es buscable. Se suman a las pruebas previas de
  revocación, carpetas, propietario, cambio de empresa y cursores ligados a usuario/consulta.
- 11 pruebas Node de servicio aprobadas (7 omitidas por requerir Docker/entorno) y
  17 pruebas Python del worker aprobadas dentro de la imagen `runly-content-test`.
- Reinicio de la base del laboratorio con el API en marcha: el API siguió en ejecución
  sin reinicios y `/health` volvió a 200 en 7 s. **Limitación:** `/health` no consulta la
  base, así que esto no demuestra recuperación de consultas; queda sin certificar.

Bloqueado o no realizado (con motivo):

| Área | Estado | Motivo |
|---|---|---|
| Operación prolongada y benchmarks nuevos | BLOQUEADO | Con 31.6 GB totales solo había 2.8 GB libres y contenedores de otros proyectos activos; repetir A/B contaminaría la medición y degradaría el equipo. No se ajustó el Governor. |
| Corpus ampliado (perspectiva, reflejos, facturas multipágina) | No realizado | Requiere generador de imágenes en la imagen del worker; el corpus de 12 casos sigue siendo el vigente. |
| Reinicios de worker/Storage durante carga, backfill interrumpido | No realizado | Sin script de orquestación; solo se cubren a nivel de servicio (leases, checkpoints). |
| Instalación nueva vs. actualización desde versión anterior | No realizado | Sin laboratorio de dos versiones. |
| Matriz visual 1280 px y claro/oscuro completo | No realizado | Playwright existente cubre 1440/768/390/320 en la ronda anterior. |

### Gates por dimensión

| Dimensión | Veredicto |
|---|---|
| Funcionalidad, permisos y aislamiento | APTO CON CONDICIONES (laboratorio; sin RLS/Storage reales con dos usuarios en esta ronda) |
| Seguridad | APTO CON CONDICIONES (sin cambios; CVE musl y deuda de Studio vigentes) |
| Precisión | APTO CON CONDICIONES (solo corpus sintético) |
| Resiliencia | NO APTO para certificar (parcial) |
| Rendimiento, operación prolongada, instalación, actualización | BLOQUEADO / sin evidencia nueva |

Ambientes: desarrollo local y laboratorio aislado APTO; staging, piloto y producción NO APTO.

Próximos pasos que sí necesitan al propietario: un host dedicado con memoria libre para
repetir A/B y la operación sostenida, y fotografías reales autorizadas para el corpus.

## Etapa 3: cierre funcional y herramientas de certificación (2026-11-26)

Laptop de desarrollo (Docker con 4.8 GB). Sin push ni despliegue.

### Ejecutado y verificado

- Corpus sintético reproducible (`apps/content-worker/corpus.py`, semilla fija, tamaños
  smoke/standard/extended, ground truth y transformaciones por archivo, `--real DIR` para
  fotografías autorizadas fuera de Git) y evaluador (`evaluate.py`: CER, WER, identificadores
  exactos, recall/precisión de búsqueda, tiempo, RSS, segundas pasadas).
- Corpus Standard (104 archivos, 96 con texto, imagen `runly-content-test`, 2 CPU / 3 GB), sintético:

| Modo | CER | WER | Ids exactos | Recall búsqueda | s medio | 2das pasadas |
|---|---|---|---|---|---|---|
| fast | 0.082 | 0.130 | 0.846 | 0.818 | 0.36 | 0 |
| balanced | 0.063 | 0.103 | 0.875 | 0.852 | 0.62 | 4 |
| accurate | 0.050 | 0.086 | 0.952 | 0.943 | 0.69 | 9 |

  Por tipo, la ganancia de `accurate` está en etiquetas de dispositivo con transformaciones
  (CER 0.169 a 0.115) y facturas (0.127 a 0.000). En el corpus Smoke (12 casos limpios)
  `accurate` fue peor que `fast` (CER 0.021 vs 0.011): el corpus era demasiado fácil y no
  separa los modos. La superioridad de alta precisión solo está respaldada por Standard
  sintético; no por fotografías reales. Documentos Office muestran CER 0.042 en los tres modos
  (sin investigar; el texto extraído difiere del verdadero en un detalle de formato).
  Resultados: `docs/audits/content-intelligence-stage3/`.
- Resource Governor: la decisión se extrajo a `governor_decision` (función pura) con 7 pruebas
  deterministas: sin límites cgroup, disco lleno, histéresis de memoria y CPU, métrica no
  disponible, deuda de CPU y contenedor menor al solicitado. 17 pruebas previas del worker siguen aprobadas.
- Estado operativo exclusivo en Administración (`operationalState`, 8 pruebas Node de política
  aprobadas): desactivado, worker no instalado, desconectado, pausado manualmente, fuera de
  horario, pausado por recursos, operativo. No se verificó en navegador esta ronda.
- Driver de certificación `scripts/content-certification/run.mjs`: lista, preflight de
  recursos (verificado: omite con motivo en este equipo), guardas de aislamiento, informes JSON/MD.

### Preparado, NO ejecutado

Escenarios `erp-ab`, `historical`, `e2e-browser`, `worker-restart`, `postgres-restart`,
`storage-interrupt`, `backfill-pause-resume`, `soak`, perfiles 2x4/4x8/8x16, corpus Extended,
RLS/Storage reales con dos usuarios, instalación nueva/actualización/rollback con dos versiones.
Los de interrupción solo se comprobaron con `node --check`: pueden contener errores de primera
ejecución. Runbook: `CONTENT_INTELLIGENCE_CERTIFICATION_RUNBOOK.md`.

### Pendiente de implementación (sin cambios esta ronda)

HEIC/HEIF, corrección de perspectiva en el worker, PDF buscable, ETA de histórico, vulnerabilidades
de Studio (`fabric`, `image-size`), CVE musl del worker; no se re-escaneó la imagen.

### Clasificación

Estado funcional: **Candidato funcional pendiente de certificación**.
Estado operativo: **APTO PARA PRUEBAS AISLADAS** (sin cambios; la evidencia nueva no lo eleva).

## Etapa 4A: administración e indexación histórica autónoma (2026-11-26)

Laboratorio aislado existente (API en 4059, UI de laboratorio en 5188, worker `runly-content-stage2:candidate`
con 1 CPU / 1 GB). Sin push ni despliegue.

### Auditoría: lo que ya existía
Controles de política con validación Zod estricta y recorte por la instancia (`effectivePolicy`): perfil, calidad,
idiomas, OCR automático/manual/imagen/PDF, extracción digital, concurrencia, hilos, memoria, CPU, límites de archivo,
páginas, píxeles, timeout, reintentos, horarios, cola máxima, retención. Todos llegan al worker mediante el snapshot
del trabajo. Políticas por empresa que no pueden ampliar la instancia. Descubrimiento histórico con cursor persistente
en `runly_content.backfill`, lotes de 10, tope por empresa (`maxPending`) y global (4000), prioridad 10 para nuevos y 40
para histórico con envejecimiento, pausa/reanudación/cancelación. El descubrimiento corre dentro de `claim`, es decir
lo impulsa el worker: sin worker no se crean trabajos nuevos (la cola no crece) y al reconectarse continúa desde el cursor.
Hilo de ejecución sin intervención periódica ni pantalla abierta.

### Completado en esta etapa
- `status` incluye `history` (elegibles, recorridos, encolados, omitidos, progreso, ETA) y última actividad.
  El conteo de elegibles es acotado (tope 50 000, "más de N" si se excede), con los mismos filtros del recorrido y
  caché de 60 s. Progreso y ETA son `null` si el denominador es solo una cota o hay menos de 20 intentos / 60 s de
  muestra; la ETA no considera horarios ni pausas y la interfaz lo dice.
- Purga en lotes de 500 trabajos con auditoría de inicio y fin (antes: un solo `DELETE` en una transacción); cancela
  el recorrido; nunca toca originales. Sigue separada de apagar OCR (`profile OFF`/`paused`) y de `searchEnabled`.
- Interfaz: progreso histórico con barra y ETA, última actividad, botón "Reintentar fallidos" (SDK `contentIntelligence.retry`
  sobre la ruta existente) y sondeo de 15 s solo con actividad (60 s en reposo; TanStack no sondea en pestaña oculta).
- Contratos: `GET /content/admin/{instance,company}` añade `history`, `rate.firstActivity` y `operational`;
  `POST /content/admin/purge` devuelve `removedJobs`. Sin migración nueva, sin dependencias nuevas.

### Evidencia del flujo vertical
`scripts/content-certification/vertical-historical.mjs`, API real de Archivos y Content, worker real, PostgreSQL y
Storage del laboratorio, imágenes con texto único renderizado solo dentro de la imagen (nombre sin texto reconocible).
Dos ejecuciones; la segunda reinició API y worker durante el recorrido. Todas las comprobaciones pasaron:
archivos subidos con OCR apagado no crean trabajos; la activación (una vez) genera trabajos sola; la cola con límite 4
llegó como máximo a 4; al pausar el recorrido no avanza el cursor (6→6, 17→17); el cursor sobrevive al reinicio
(16→16, estado `running`); la reanudación termina en `done`; los 11 archivos terminan `done`; la fotografía se encuentra
por texto que solo existe dentro de ella; la imagen subida a mitad del histórico se indexa y se encuentra; un archivo
de otra empresa (misma cadena de búsqueda, insertado directo en la base) no aparece. Resultado: `docs/audits/content-intelligence-stage4/vertical-historical.json`.
Cerrar la pantalla no es una condición del script (solo API, sin navegador): el desacople se deduce de que el
descubrimiento lo ejecuta el worker; no se probó un navegador cerrándose.

### Validación visual
Capturas reales con Chromium contra la UI de laboratorio (`docs/audits/content-intelligence-stage4/screenshots/`):
worker ausente 1440 claro y 390 oscuro; worker conectado 1440 claro/oscuro, 390 claro y 320 oscuro; sin desbordamiento
horizontal en ninguna. Es la sección de **instancia** (badge "Operativo", límites físicos observados). No se capturó
la sección de empresa con el nuevo panel de progreso histórico ni los estados de error ni un usuario sin permisos.

### Bloqueos y pendientes
No verificado: panel histórico de empresa en navegador, permisos administrativos de UI con un usuario no admin,
versión sustituida durante OCR / carpeta movida / URL firmada vencida (cubiertos por pruebas PostgreSQL de la ronda
anterior, no repetidos aquí), dos empresas reales con RLS/Storage (la segunda empresa fue una fila SQL), escala
(el lote es de 10 archivos por reclamación; con miles de archivos el ritmo depende del worker, no medido),
`discover` ejecuta consultas en cada `claim` (sin medir su costo con millones de filas).
Vulnerabilidades: sin dependencias nuevas; los componentes modificados (servicio API, SDK, interfaz) no se ven
afectados por las alertas ya registradas (CVE musl del worker, `fabric`/`image-size` de Studio): sin cambios.

### Clasificación
Funcional: **Candidato funcional pendiente de certificación** (la administración y el histórico autónomo están
verificados en laboratorio; falta certificación a escala y UI de empresa).
Operativo: **APTO PARA PRUEBAS AISLADAS**.

## Etapa 4B: búsqueda, visor y selección de texto (2026-11-26)

Laboratorio aislado (API 4059, UI de laboratorio 5188, worker real, PostgreSQL y Storage del laboratorio). Sin push ni despliegue.

### Auditoría inicial (lo que ya existía en `8943a404f` y etapas previas)
Búsqueda por contenido en Archivos (`searchIn`, fragmento resaltado y referencia solo en la vista de lista; en cuadrícula
solo un chip "OCR · referencia"), panel lateral de texto con búsqueda, copiar/descargar texto, reprocesar y alta precisión,
estados (`LABELS`), y una capa SVG que dibujaba únicamente las coincidencias sobre imagen y PDF dentro del visor existente
(`AdvancedFileViewer`/`PDFViewer`, que ya aplican zoom, pan y rotación por CSS). Ausentes: modo de texto con selección,
copiar selección, término de búsqueda conservado al abrir el archivo, coincidencias de frases/identificadores partidos,
carga de coordenadas por página, aviso de resultados sin coordenadas.

### Completado
- **Contrato de coordenadas.** Cada página guarda `engine.canvas = {width,height,coordinateSpace:"exif-oriented-image"}` y
  palabras `{text,x,y,width,height,confidence}` en ese lienzo (imagen original ya orientada por EXIF; el worker invierte
  recorte, escala y rotación del preprocesamiento antes de guardar). La capa SVG usa el lienzo como `viewBox`, de modo que
  zoom, pan, rotación y tamaño los aplica el visor y no hay desplazamientos manuales. `canvasMatches` solo dibuja si el
  bitmap mostrado tiene la proporción del lienzo; sin `canvas` (resultados antiguos) no se dibuja nada y el panel avisa y
  ofrece reprocesar (no hay reindexación masiva).
- **Modo de texto** (botón ScanText en la barra del visor, `textMode` en `AdvancedFileViewer`): muestra todas las palabras
  (hasta 2 500 nodos; más allá, solo coincidencias/selección), clic o toque alterna una palabra, doble clic la línea,
  Ctrl/Cmd+C copia, Ctrl/Cmd+A todo, Escape limpia; el panel ofrece "Copiar selección", "Seleccionar todo" y "Limpiar"
  (alternativa táctil/teclado). El texto copiado es exactamente el OCR almacenado; los saltos de línea se infieren por geometría.
  Desactivar el modo deja solo el resaltado de coincidencias. No hay un nodo enfocable por palabra.
- **Búsqueda en el visor** (`findMatches`): sin acentos/mayúsculas, identificador exacto dentro de una palabra, frases partidas en
  varias palabras consecutivas, conteo y navegación por coincidencia (no por palabra), tope de 1 000. El término de la búsqueda de
  Archivos llega al visor (`initialQuery`).
- **Cuadrícula**: el chip de coincidencia muestra el fragmento con el término resaltado (2 líneas, empieza junto a la coincidencia).
- **API**: `GET /content/files/:id` limita las palabras a 20 000 acumuladas; las páginas restantes devuelven `wordCount` y
  `wordsOmitted`, y `?unit=N` entrega las de esa página (la capa las pide sola). SDK `result(id, token, unit, signal)` cancelable.
  Sin migración ni dependencias nuevas.

### Evidencia
- Pruebas deterministas de coordenadas/selección/búsqueda: `content-overlay.test.js`, 8 aprobadas (con las demás de Archivos y
  Content: 27 ejecutadas, 20 aprobadas, 7 omitidas por requerir Docker).
- Flujo vertical en navegador real (`vertical-viewer.mjs`, `docs/audits/content-intelligence-stage4b/vertical-viewer.json`), todo aprobado:
  foto cuyo nombre no contiene el texto, indexada por el worker; aparece en la búsqueda; el fragmento resalta el identificador;
  el visor conserva el término y marca la coincidencia; la posición del overlay coincide con las coordenadas OCR (error 0.0 px)
  al abrir, con zoom in/out, rotado 90° y 180° y tras cambiar el tamaño de ventana; el modo de texto muestra 6/6 palabras; la
  selección copia `FCW…A07` idéntico al OCR (portapapeles real); apagar/encender el modo funciona; la búsqueda interna
  mueve el resaltado; dos pulsaciones de "Alta precisión" dejan un solo trabajo; sin desbordamiento horizontal a 390 px.
- Flujo PDF escaneado de 3 páginas (`vertical-pdf.mjs`): coincidencia en página 2 con coordenadas, carga por página, búsqueda
  muestra el PDF, el visor salta a esa página y resalta.
- Privacidad: una sesión válida con una empresa a la que no pertenece no obtiene texto, coordenadas ni búsqueda (rechazo del
  middleware). Las pruebas PostgreSQL de rondas anteriores cubren revocación, carpetas, propietario, eliminación y versión.
- Capturas: `docs/audits/content-intelligence-stage4b/screenshots/` (búsqueda en cuadrícula 1440, visor con overlay, rotado,
  modo de texto, panel tras reprocesar, modo de texto 390 px, PDF búsqueda y visor).

### No ejecutado / limitaciones
- Dos usuarios reales con RLS y Storage: no hay segundo usuario en el laboratorio; el rechazo se probó con una empresa ajena.
  Compartidos, movimientos y sustitución de versión en la UI no se repitieron.
- Matriz visual incompleta: solo 1440 y 390 en claro; sin 1280/768/320, sin modo oscuro, sin lista, sin estados error/sin texto/
  worker caído/sin permisos en el visor, sin toque físico ni teclado más allá de Ctrl+C simulado. La captura móvil muestra el panel
  en estado "Pendiente" (reprocesamiento en curso): el modo de texto en móvil no se capturó con resultado disponible.
- La selección de texto es por palabra/línea mediante clic o toque, no por arrastre (no hay selección nativa del navegador).
- Overlay del PDF verificado por presencia y salto de página, sin medir geometría ni rotación de PDF; DOCX/XLSX/PPTX muestran
  referencias pero no se probaron en el visor. Rotación del usuario en imagen sí medida; EXIF cubierto por la prueba anterior de la etapa 2.
- Ranking (exacto antes que aproximado) ya existía; no se re-midió en esta ronda. Sin medición de rendimiento del visor
  (FPS, memoria) ni EXPLAIN de la consulta modificada; el chunk de Archivos pesa 128 kB (38 kB gzip) y el visor no se carga en el login.
- Vulnerabilidades: sin dependencias nuevas; sin cambios respecto al registro anterior.

### Clasificación
Funcional: **Candidato funcional pendiente de certificación**. Operativo: **APTO PARA PRUEBAS AISLADAS**.

## Etapa 4C: formatos, reconocimiento avanzado y PDF buscables (2026-11-26)

Clasificación sin cambios: funcional «candidato pendiente de certificación»; operativo «APTO PARA PRUEBAS AISLADAS»;
staging y producción «NO APTO». Todo se midió en el laboratorio aislado (`runly-content-*`, loopback) con corpus sintético
y reproducible. No hubo fotografías reales, corpus Extended, anfitrión dedicado ni usuarios reales con RLS.
Evidencia en `audits/content-intelligence-stage4c/`.

### Cambios
1. HEIC/HEIF por contenido (`pillow-heif` 1.9.0) y migración `20270117000000` de admisión de cola.
2. Office: referencias reales (hojas por nombre, encabezados y pies de DOCX, filas de tabla) y orden numérico de hojas.
3. Selección entre lecturas sin preferir longitud ni confianza media: se penalizan identificadores corruptos (`FCWQUG4YR|3`),
   las pasadas extra se lanzan solo ante indicios y una orientación OSD dudosa se resuelve leyendo ambas orientaciones.
4. Candidato de rectificación proyectiva (solo si la lectura es débil) con `polygon` por palabra.
5. PDF buscables: migración `20270118000000`, 8 rutas y acción en el panel.
6. Presupuesto de coordenadas al abrir (20 000 → 1500 palabras), selección por arrastre y polígonos en el visor.

### Cobertura real de formatos
Ver «Formatos admitidos» en `CONTENT_INTELLIGENCE_V1.md`. Probado: HEIC del corpus (con y sin inclinación), HEIC dañado
(`PARSER`, 3 intentos), tipo declarado `octet-stream` (unitaria), AVIF rechazado (unitaria), límite de píxeles por cabecera (unitaria).
No probado: rotación `irot` de un iPhone real (el codificador de pillow-heif no la escribe; se confía en libheif), HEIC de varias
imágenes, HDR de 10 bits y HEIC en un navegador.

### Office (CER 0.042)
Causa: el extractor de XLSX antepone la referencia de celda (`A1: valor`) y el ground truth del corpus no la declaraba.
Es representación, no contenido perdido (DOCX y PPTX daban 0.000). El extractor no se alteró para ocultarlo: la referencia
se documentó como contrato y el corpus ahora la declara. El resultado original sigue en `audits/content-intelligence-stage3/`.
En Standard (16 archivos Office comparables) el CER pasa de 0.200 a 0.000, lo que incluye DOCX nuevos con encabezado y tabla
que la versión anterior no leía completos. Búsqueda por contenido ausente del nombre verificada para DOCX, XLSX, PPTX y un encabezado DOCX.

### Reconocimiento: comparativa en el conjunto común
Solo archivos que ambas versiones procesan sin error (HEIC excluido: la anterior no lo admite). Celdas: CER / identificadores exactos.
`comparison-standard.md`, `comparison-heldout.md` y `comparison-smoke.md` desglosan por tipo y dificultad.

| OCR, 104 archivos comunes | balanced antes | balanced después | accurate antes | accurate después | fast |
|---|---|---|---|---|---|
| Standard, semilla 20261126 (se ajustó el umbral OSD) | 0.128 / 0.795 | 0.099 / 0.830 | 0.122 / 0.839 | 0.095 / 0.875 | sin cambio (0.207 / 0.696) |
| Held-out, semilla 20270105 (no usada para ajustar) | 0.116 / 0.830 | 0.099 / 0.866 | 0.105 / 0.786 | 0.094 / 0.804 | sin cambio (0.203 / 0.732) |

Costo: +1–3 % de tiempo por archivo (Standard: balanced 1.28 → 1.29 s, accurate 1.54 → 1.56 s); segundas pasadas de accurate 33 → 40; RSS máximo 137 MiB sin cambio.
La mejora está sobre todo en `small-label` (CER 0.237 → 0.000 al evitar un giro de 180° espurio de OSD) y en `perspective-label`
(identificadores 0.750 → 0.875 en Standard; 0.625 → 1.000 en held-out, balanced).
Sin mejora: `glare-shadow` (reflejos y sombras: CER 0.72 y ids 0.125 en Standard) y `device-label` con transformaciones fuertes; `pdf-scanned` conserva CER 0.089.
En Smoke (12 archivos, n pequeño) accurate pasa de 0.062 a 0.060 y de ids 0.846 a 0.923.
El umbral OSD de 0.6 se fijó con el corpus Standard y se contrastó con el held-out. Un umbral solo rompía un PDF girado y escaso,
por eso la orientación dudosa se resuelve comparando ambas lecturas.

### Perspectiva y geometría medida
- Rectificación aplicada en 3 de unas 480 lecturas Standard. Es una heurística de región dominante (sin OpenCV), no un detector general.
  No se aplica si la lectura original ya es buena, que es lo habitual en las fotos con perspectiva del corpus.
- `persp-001` (rectificada, palabras con polígono): el overlay queda a 0.2 px del eje de la línea real (alto de línea 26.4 px) y dentro del polígono verdadero,
  calculado desde la homografía de generación y no desde el OCR.
- PDF escaneado de 3 páginas con marcador de posición conocida por maquetación: error del overlay 0.0 pt en vertical y 6.9 pt en horizontal,
  idéntico en carga inicial, zoom, 90°/180°/270° y cambio de tamaño; la caja del overlay coincide con el canvas renderizado (0.0 px).
  El desfase horizontal constante es el borde izquierdo de la caja de palabra de Tesseract (162.1 pt frente a 155.2 pt medidos por tinta), no la transformación.
- CropBox y MediaBox no se probaron por separado: solo `/Rotate` 90 y MediaBox 600×800.

### PDF buscables (laboratorio, 18/18)
PDF escaneado de 3 páginas: copia de 286 KB (original 122 KB; se re-rasteriza a ≤2400 px), generada en unos 7 s incluyendo la cola.
Poppler, independiente del generador, encuentra el identificador solo en la página 2, con la caja de palabra a 1 pt en vertical de la verdad medida por tinta,
y el render de la página 2 difiere en 0.5 % de píxeles. PDF con `/Rotate 90`: la copia tiene el tamaño visible 800×600 y texto.
Original intacto (sha256 y tamaño). Descarga con URL firmada y autorización por empresa (otra empresa: denegado).
Una segunda solicitud no crea otra copia, un archivo desactivado no sirve copia y el perfil OFF impide generar. El `/tmp` del worker queda vacío.
No probado: PDF cifrado (no se fabricó uno; la rama `ENCRYPTED` solo está cubierta por revisión), PDF firmado real, PDF de cientos de páginas,
otro visor distinto de poppler, el límite de 64 MiB y la muerte del worker durante la generación.

### Visor, selección y visual
Arrastre con ratón: selecciona palabras consecutivas sin desplazar la página y copia exactamente el OCR guardado.
Toque en móvil (390 px) con resultado disponible y modo de texto: selección por palabra.
Capturas: 1440/1280/768/390/320 en claro y 1440/390/320 en oscuro; cuadrícula, lista, visor con modo de texto, PDF (768/390/320), perspectiva,
resultado antiguo sin coordenadas, sin texto y error. Sin desbordamiento horizontal en los 8 visores medidos.
Solo se inspeccionaron a ojo dos capturas. La lista en 1280/768/390/320 oscuro y el oscuro de 1280/768 no se capturaron.

### Transferencia
Documento sintético de 30 páginas × 400 palabras: apertura 896 165 B → 100 175 B (4 páginas con coordenadas); `?unit=7` 38 437 B.
Las claves de caché incluyen usuario, empresa, archivo y revisión, y no se retienen (`gcTime: 0`).

### Dependencias, imagen y seguridad
Imagen del worker 337 305 096 B → 376 759 216 B (+39.5 MB: pillow-heif, libheif, libde265, x265, `pdfseparate` y `pdfunite`).
Docker Scout: 0 críticas, 1 alta (musl CVE-2026-107891) y 2 medias (giflib), idéntico a antes; paquetes 58 → 61.
Scout no ve las bibliotecas nativas empaquetadas en la rueda (libheif 1.23.7, libde265 1.1.3, x265 4.3): su exposición a CVE no está evaluada.
libde265 es un decodificador HEVC con historial de errores de memoria. Mitigación: usuario sin privilegios, sin red, sistema de archivos de solo lectura,
límites de memoria y tiempo por trabajo en proceso aislado y píxeles comprobados en la cabecera. Pendiente para la auditoría 4D.
LGPL-3 (libheif, libde265) y GPL-2 (x265, no invocado): conservar avisos.

### Pruebas
Worker: 28 pruebas OK (nuevas: Office estructurado, HEIC con límites y fallos, PDF buscable alineado, lienzo con orientación).
API y visor: 27 (20 pasan, 7 omitidas por requerir Docker). Flujos de laboratorio: formatos 14/14 (3 corridas), buscable 18/18, geometría 21/21. Build web correcto.
Defectos propios corregidos durante la etapa: el análisis de imagen sobrescribía las dimensiones del lienzo en imágenes rotadas (lo detectó el PDF girado),
el giro OSD espurio y marcadores de prueba con glifos ambiguos (I/l, Q/O) que volvían inestables los flujos.

### Limitaciones y pendiente
Reflejos, sombras y etiquetas pequeñas siguen débiles; sin OpenCV la perspectiva es limitada; sin corpus Extended ni fotos reales;
HEIC no se visualiza en Chrome/Firefox; la capa PDF solo admite Windows-1252; la copia buscable re-rasteriza las páginas escaneadas;
certificación integral, dos usuarios reales con RLS y anfitrión dedicado siguen pendientes.
