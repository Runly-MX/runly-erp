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
