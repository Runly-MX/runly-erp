# Content Intelligence: matriz de consolidación

Inicio 2026-11-25: Git limpio en `main`, referencia `1bc2b5a78`. Se preservan los
cuatro commits posteriores de auditoría (auth, Realtime, sync y animaciones).
Una sola cola OCR, Storage y autorización existentes. La cola general de
automatizaciones tiene otro contrato y no ejecuta parsers: no se fusiona.

Deuda confirmada antes de editar: temporales del hijo sobreviven SIGKILL, faltan
checkpoints por página, consultas repetidas en claim y por resultado, métricas
sin intentos, sin calendario, PDF digital corto rasterizado innecesariamente,
ausencia de dimensiones verificables para overlays y búsqueda sin ranking.
No se cambia una migración entregada. La imagen inicial, SBOM y CVE se conservan.

| Plan original / etapa | Capacidad | Estado al iniciar |
|---|---|---|
| Principios | OFF opcional, sin GPU/coste por documento/nube, originales intactos | Implementado y verificado |
| 0 / A | Auditoría de Archivos, versiones, permisos y puntos de integración | Implementado parcialmente |
| 0 / G | Baseline CPU/RAM/latencia/búsqueda del ERP completo | Pendiente |
| 1 / A | Servicio transversal y contratos internos, sin colas ni Storage duplicados | Implementado y verificado |
| 1 / A | Observabilidad, extensibilidad y worker remoto autenticado | Implementado parcialmente |
| 2 / K | Worker opcional/ausente, sin descargas ni colas ilimitadas | Implementado y verificado |
| 2 / E | OFF/LIGHT/SMART/DEDICATED/CUSTOM, calidad independiente | Implementado parcialmente |
| 2 / E | Configuración solicitada, física y efectiva; recomendaciones | Implementado parcialmente |
| 3 / D | JPEG/PNG/WebP/TIFF | Implementado y verificado |
| 3 / D | HEIC/HEIF seguro si viable | Pendiente |
| 3 / D | PDF digital/escaneado/híbrido por página sin duplicados | Implementado parcialmente |
| 3 / D | PDF rotado/multipágina/protegido/dañado/vacío/límites | Implementado parcialmente |
| 3 / D | DOCX/XLSX/PPTX con secciones/hojas/celdas/diapositivas | Implementado parcialmente |
| 3 / D | TXT/CSV/Markdown/XML/JSON/SVG seguros | Implementado y verificado |
| 4 / C | EXIF/rotación/deskew/contraste/resolución/escalado | Implementado y verificado |
| 4 / C | Ruido/binarización adaptativa/bordes/segmentación | Implementado parcialmente |
| 4 / C | Perspectiva/regiones cuando viable | Pendiente |
| 4 / C | Español/inglés/combinado y modelos reproducibles | Implementado y verificado |
| 4 / C | Tres modos y selección por indicadores verificables | Implementado parcialmente |
| 4 / C | Series/tags/modelos/RFC/folios/importes/fechas sin sustituir caracteres | Implementado parcialmente |
| 4 / H | Texto/página/coordenadas/confianza/modelo y transformación inversa | Implementado parcialmente |
| 4,12 / C | Corpus representativo/CER/WER/exactitud/recuperación/CPU/RAM/latencia | Implementado parcialmente |
| 5 / F | Cola durable/idempotencia/deduplicación/prioridades/backoff | Implementado y verificado |
| 5 / F | Leases/heartbeat/reinicio/cancelación/pausa/reanudación/fallo final | Implementado y verificado |
| 5 / F | Unidades acotadas y progreso/checkpoints reutilizables de página | Implementado parcialmente |
| 5 / F | Concurrencia justa, nuevos e histórico sin inanición | Implementado parcialmente |
| 5 / G | CPU/RAM/PIDs/hilos/tmp/plazos/tamaño/píxeles/páginas | Implementado parcialmente |
| 5 / G | Presión fiable/histéresis/recuperación, prioridad del ERP | Implementado parcialmente |
| 6 / F | Histórico previo, cursores/lotes/cola acotada/reinicio/reconciliación | Implementado parcialmente |
| 6 / F | Filtros empresa/carpeta/MIME/fechas/nunca/fallidos/calidad/motor | Implementado parcialmente |
| 6 / F | Elegibles/activos/finales/omitidos/vacíos/ritmo/actividad/ETA sin count repetido | Implementado parcialmente |
| 7 / H | Identidad/revisión/motor/idiomas/texto/normalización/referencias | Implementado parcialmente |
| 7 / H | FTS/GIN/frases/acentos/mayúsculas/prefijos | Implementado y verificado |
| 7 / H | Nombre/metadatos/etiquetas/contenido/OCR y filtros existentes | Implementado parcialmente |
| 7 / H | Ranking exacto/subcadenas/fuzzy controlado | Pendiente |
| 7 / H | Snippets/página/motivo/cursor, sin conteos privados | Implementado parcialmente |
| 7 / G | EXPLAIN selectivo/coste/escritura/crecimiento/escala | Pendiente |
| 8 / H | Buscador integrado/estados reales/coincidencias discretas | Implementado parcialmente |
| 8 / H | Reconocer/ver/copiar/reprocesar/alta/cancelar/descargar texto | Implementado y verificado |
| 8 / H | PDF buscable opcional seguro | Pendiente |
| 8 / H | Buscar/navegar/resaltar/seleccionar texto en visor imagen/PDF | Implementado parcialmente |
| 8 / H | Overlays con EXIF/zoom/pan/rotación/resize/táctil | Pendiente |
| 8 / J | QA 1440/768/390/320, temas/teclado/táctil, capturas reales | Pendiente |
| 9 / E | Administración persistente instancia/empresa/usuario | Implementado parcialmente |
| 9 / E | Worker/motor/heartbeat/idiomas/modelos/límites | Implementado parcialmente |
| 9 / E | Controles digital/OCR imagen/PDF/manual/automático/tipos/calendario | Implementado parcialmente |
| 9 / E | CPU/RAM/concurrencia/hilos/plazos/reintentos/retención | Implementado parcialmente |
| 9 / E | Cola/recursos/errores/ritmo/derivados/índices/histórico | Implementado parcialmente |
| 9 / E | Activar/OFF/pausar/reanudar/reintentar/reprocesar/cancelar/purgar | Implementado parcialmente |
| 9 / I | Auditoría y conservación/desactivación independiente de búsqueda | Implementado y verificado |
| 10 / I | ACL vigente en texto/snippets/coordenadas/visor/procesamiento/exportación | Implementado parcialmente |
| 10 / I | Empresas/revocación/propietario/carpeta/eliminar/restaurar/revisión/ID | Implementado y verificado |
| 10 / I | Enlaces/concurrencia/caches/logs/métricas/RLS reales | Implementado parcialmente |
| 10 / B | SBOM/CVE, paquete/versión/fix/exposición/antes-después | Pendiente |
| 10 / B | Firmas/ZIP bombs/XML externo/macros/código/recursos remotos | Implementado parcialmente |
| 10 / B | No root/capabilities/tmp/plazos/memoria/PIDs/red/credenciales/limpieza | Implementado parcialmente |
| 11 / H | Búsqueda global si viable y contratos autorizados para otros módulos | Implementado parcialmente |
| 11 | No escribir datos empresariales reconocidos automáticamente | Implementado y verificado |
| 11 | QR/barras/clasificación/manuscritos/semántica/LLM/proveedores externos | No aplicable: extensiones futuras, fuera de V1 |
| 12 / L | Node/Python/integración/DB/E2E/seguridad/Archivos/admin/instalación | Implementado parcialmente |
| 12 / F | Histórico mixto/caídas/Storage/operación prolongada | Pendiente |
| 12 / G | ERP real: seis escenarios, tres presupuestos, p50/p95/p99 y objetivo <10% | Pendiente |
| 13 / K | Migración aditiva/actualización segura/sin backfill inesperado | Implementado y verificado |
| 13 / K | Instalación/activación/modelos/administración/operación/API/rollback | Implementado parcialmente |
| 13 / L | RC integral y clasificación con evidencia | Pendiente |

La evidencia sintética previa no se equipara a un ERP completo probado. La tabla
de cierre en RESULTS indicará los cambios de estado y los bloqueos restantes.
