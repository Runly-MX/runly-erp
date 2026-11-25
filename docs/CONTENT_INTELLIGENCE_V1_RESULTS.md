# Content Intelligence: evidencia del checkpoint

Fecha de evaluación: 2026-11-25. Clasificación: **APTO PARA PRUEBAS** con corpus
sintético en entorno aislado. **V1 no está completa ni es apta para producción**.

## Resultado funcional

Se implementó y ejecutó el circuito real: archivo histórico registrado en
PostgreSQL, autorización, descubrimiento paginado, trabajo persistente, worker
Docker no root, descarga mediante lease, OCR local, almacenamiento de páginas y
búsqueda HTTP por `ABC123XYZ`. No se alteró el original ni su revisión. El Storage
del ensayo es una fixture binaria local, no un bucket operativo. La API usa el
servicio real de permisos de Archivos; la identidad del ensayo es sintética.
Esto es E2E del backend/worker, no E2E de login, navegador o Supabase Storage real.

Las nueve pruebas Node pasan, incluida integración PostgreSQL y Docker. Sus
aserciones cubren OFF, activación persistente, ausencia de worker, duplicados,
concurrencia, tokens de lease incorrectos/antiguos, recuperación, cancelación,
progreso monotónico, versiones, deshabilitación/restauración, empresas distintas,
compartición revocada, carpeta movida, propietario cambiado, traslado de empresa,
backfill y purga. Los tokens multibyte incorrectos producen 401, no un fallo de
comparación de buffers. Se aplicó la migración real en PostgreSQL 18 aislado.
No se aplicaron migraciones a una instalación existente.

Las trece pruebas Python pasan: etiqueta, tres modos, rotación 90°, inclinación y
bajo contraste, español/inglés, imagen vacía, PDF digital/escaneado/híbrido,
límite de páginas y estado parcial, LIGHT sin OCR, TXT/CSV/Markdown/JSON/SVG,
DOCX/XLSX/PPTX, timeout, ZIP bomb, entidades XML (incluido UTF-16), límites de
archivo/píxeles, firmas incompatibles y plazo duro del grupo de procesos. Los ejemplos Office son paquetes mínimos
sintéticos; aún faltan documentos complejos de aplicaciones reales.

## OCR medido

En la etiqueta canónica, los tres modos recuperaron exactamente `ABC123XYZ`.
CER: 0.0188679; WER: 0.1111111, calculados con distancia de edición sobre el
ground truth del generador. Es una muestra pequeña; no representa precisión
universal. La etiqueta inclinada y la girada también recuperaron esa serie.

Texto real del ensayo equilibrado:

```text
RUNLY INVENTARIO
Service Tag ABC123XYZ
Numero de serie OO 11 S5 B8 Z2
Factura MXN 1250.50 Fecha 2026-11-25
```

El ground truth contiene `O0 I1`, por lo que `OO 11` son errores reales y se
conservan. Una etiqueta adicional rasterizada desde SVG con otra tipografía
produjo `ABCI23XYZ` en lugar de `ABC123XYZ`, incluso usando el modelo best.
No se sustituyeron caracteres para hacer pasar la búsqueda. El E2E usa el corpus
canónico reproducible; ese caso tipográfico queda como limitación de calidad.

La primera rasterización del PDF a 2400 px también produjo una serie incorrecta.
Se aumentó la resolución dentro del presupuesto y se recortan solo márgenes
vacíos grandes, manteniendo offsets inversos. El corpus final de PDF pasa.
Los modelos best no redujeron CER/WER de la etiqueta canónica; no se promete
que el perfil de alta precisión mejore cada documento.

## Recursos y lote histórico

Pruebas reales con cuotas de contenedor y red deshabilitada para el corpus
(doce pruebas en esta medición; la comprobación de plazo duro se añadió después):

| CPU worker | RAM límite | Suite (12 pruebas) | Etiqueta rápido/equilibrado/alta (s) | RSS Python máximo |
|---:|---:|---:|---|---:|
| 0.25 | 512 MiB | 30.875 s | 1.067 / 2.045 / 2.637 | 148408 KiB |
| 0.5 | 1024 MiB | 15.328 s | 0.623 / 1.052 / 1.253 | 149836 KiB |
| 1 | 2048 MiB | 8.601 s | 0.314 / 0.577 / 0.722 | 149564 KiB |

El mayor RSS de un hijo nativo fue aproximadamente 150000 KiB. No se dispone de
`memory.peak` en el cgroup de este entorno: esos RSS no son una medición de la
suma máxima simultánea de todos los procesos. Docker impuso las cuotas indicadas;
los ensayos terminaron sin OOM. Las cuotas del worker no equivalen a haber probado
el ERP completo en servidores 2 CPU/4 GB, 4 CPU/8 GB y 8 CPU/16 GB. Los demás
procesos y PostgreSQL se ejecutaron fuera de esos presupuestos y compartieron host.

El lote histórico de **1,000 archivos TXT**, con cuatro workers y concurrencia
global cuatro, terminó en **149.088 segundos**: aproximadamente 6.71 archivos/s.
Se observaron como máximo **20 trabajos pendientes o activos**, el límite fijado.
Un worker tenía 1 CPU/1 GiB y los otros tres 0.25 CPU/512 MiB cada uno.
La consulta de estadísticas durante ese lote tuvo p95 4.4914 ms; **no es la
latencia p95 del ERP**. La primera ejecución con un worker agotó el plazo de
220 segundos y no completó el lote; se preserva ese fallo metodológico aquí.

`EXPLAIN (ANALYZE, BUFFERS)` de una búsqueda presente en los 1,000 documentos
eligió Seq Scan y tardó 0.228 ms, con 40 bloques en caché. Esa consulta no es
selectiva; no demuestra el rendimiento de GIN a escala. Faltan planes de consultas
selectivas, crecimiento de índices y corpus mixtos mucho mayores.

No se obtuvo una línea base del ERP antes del cambio porque no había API/web
operativas de prueba. No se midieron p50/p95/p99 del ERP, subidas reales,
latencia sin worker frente a OCR/backfill, ni el objetivo de degradación <10%.
No se inventan resultados para esos requisitos pendientes.

## Seguridad y dependencias

Docker Scout v1.24.0 indexó 295 paquetes y notificó **50 vulnerabilidades únicas
altas/críticas**, con 77 resultados SARIF repartidos en siete identidades de
paquete. Pillow aparece como paquete Debian y como paquete PyPI; no son siete
componentes necesariamente independientes. Se necesita comprobar aplicabilidad y
backports antes de cualquier uso con documentos operativos.

| Identidad reportada | CVE únicas reportadas para esa identidad |
|---|---:|
| Pillow Debian 11.1.0-5+deb13u4 | 27 |
| Pillow PyPI 11.1.0 (misma instalación detectada) | 41 |
| OpenSSL Debian 3.5.9-1~deb13u1 | 3 |
| libxml2 Debian con parches de distribución | 2 |
| Expat Debian 2.9.0-1~deb13u1 | 2 |
| Poppler Debian 25.03.0-5+deb13u4 | 1 |
| Tesseract Debian 5.5.0-1 | 1 |

Las cantidades por fila se superponen. No se descartaron alertas como falsos
positivos sin comprobarlas. Los límites de contenedor reducen el alcance de un
parser fallido, pero no resuelven esas vulnerabilidades. La imagen no queda
aprobada para producción por usar Debian estable.

El aislamiento comprobado es el de rutas y visibilidad de archivos. Faltan pruebas
contra una instalación real de Supabase/RLS, enlaces compartidos, firewall de
egress, fallos de disco y reinicio del host completo. El worker no tiene claves de
DB/Storage, no es root y no recibe permisos administrativos de usuario.

## Estado por fase

| Fase | Estado real |
|---|---|
| 0 Auditoría/línea base | Auditoría de puntos de integración y plan escritos; baseline ERP pendiente |
| 1 Arquitectura | Servicio transversal, contratos internos y separación API/worker funcionales |
| 2 Opcionalidad/perfiles | OFF y políticas funcionales, overlays fuente/instalador validados; imagen no publicada |
| 3 Extracción | Formatos prioritarios del corpus funcionales; HEIC no soportado |
| 4 Precisión | Pipeline adaptativo y modelos reproducibles; calidad limitada, perspectiva/regiones pendientes |
| 5 Cola/recursos | Cola, límites, leases, reintentos, cancelación y reparto probados; horarios/presupuestos por tiempo y checkpoints de página pendientes |
| 6 Histórico | Cursor persistente, lotes, límite y lote de 1000 probados; filtros de calidad/motor/fallos, estimaciones y estadísticas completas pendientes |
| 7 Búsqueda | FTS, prefijos, frases, normalización, cursor y ACL funcionales; ranking, subcadenas/fuzzy y escala pendientes |
| 8 Archivos UX | Integrado en buscador, snippets resaltados y panel de texto; QA visual, capturas y overlays pendientes |
| 9 Administración | Políticas persistentes por ámbito y monitoreo básico; controles avanzados/estadísticas pendientes |
| 10 Seguridad | Aislamiento central probado; alertas nativas sin resolver bloquean producción |
| 11 Integraciones | Factory interna documentada; búsqueda global y consumidores de otros módulos no implementados |
| 12 QA/rendimiento | Pruebas Node/Python, Docker y lote reales; faltan navegador, Storage real y benchmarks ERP completos |
| 13 Instalación/cierre | Migración aditiva, overlays y manual de rollback listos; publicación y actualización real no ejecutadas |

## Frontend y comprobaciones

La compilación Vite completa pasó. ESLint de los archivos nuevos pasó. El primer
escaneo React Doctor no incluía todos los archivos sin añadir a Git. El escaneo
final informó **78/100 y nueve advertencias**, sin errores: bucles con awaits,
consultas independientes secuenciales, búsqueda sobre listas pequeñas, estado
editable inicializado desde props, claves de fragmentos por posición y complejidad
del panel. Los awaits de escritura son deliberadamente secuenciales dentro de
transacciones y lotes acotados; no se paralelizaron mutaciones de cola para
silenciar el analizador. Se corrigieron sus avisos de API Zod obsoleta. El control de
privacidad pasó sin hallazgos después de excluir del versionado los artefactos
locales de build/corpus. Un primer control detectó valores de configuración del
build local; esos archivos nunca se prepararon para commit ni se publicaron.

No hay capturas de Archivos o administración ni validación de controles en
navegador. Un build correcto no se presenta como validación de UX. Las salidas
locales de pruebas, corpus, SARIF y builds quedan en `.artifacts/content-intelligence/`
(ignorado), y el corpus puede regenerarse desde el código versionado.

Los cambios se mantienen en `main`; no se crearon ramas/worktrees y no se hizo
push ni despliegue. Los SHA y el estado final de Git se entregan en la respuesta
de cierre para evitar que este informe necesite referenciar su propio commit.
