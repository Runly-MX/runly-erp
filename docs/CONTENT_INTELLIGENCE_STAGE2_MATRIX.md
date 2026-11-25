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

| Plan original / etapa | Capacidad | Estado al iniciar | Estado al cerrar | Evidencia y límite |
|---|---|---|---|---|
| Principios | OFF opcional, sin GPU/coste por documento/nube, originales intactos | Implementado y verificado | Implementado y verificado | Ver RESULTS: cobertura y límites explícitos. |
| 0 / A | Auditoría de Archivos, versiones, permisos y puntos de integración | Implementado parcialmente | Implementado parcialmente | Ver RESULTS: cobertura y límites explícitos. |
| 0 / G | Baseline CPU/RAM/latencia/búsqueda del ERP completo | Pendiente | Implementado parcialmente | Laboratorio real; SLO y operación prolongada sin certificar. |
| 1 / A | Servicio transversal y contratos internos, sin colas ni Storage duplicados | Implementado y verificado | Implementado y verificado | Ver RESULTS: cobertura y límites explícitos. |
| 1 / A | Observabilidad, extensibilidad y worker remoto autenticado | Implementado parcialmente | Implementado parcialmente | Ver RESULTS: cobertura y límites explícitos. |
| 2 / K | Worker opcional/ausente, sin descargas ni colas ilimitadas | Implementado y verificado | Implementado y verificado | Ver RESULTS: cobertura y límites explícitos. |
| 2 / E | OFF/LIGHT/SMART/DEDICATED/CUSTOM, calidad independiente | Implementado parcialmente | Implementado parcialmente | Ver RESULTS: cobertura y límites explícitos. |
| 2 / E | Configuración solicitada, física y efectiva; recomendaciones | Implementado parcialmente | Implementado parcialmente | Ver RESULTS: cobertura y límites explícitos. |
| 3 / D | JPEG/PNG/WebP/TIFF | Implementado y verificado | Implementado y verificado | Ver RESULTS: cobertura y límites explícitos. |
| 3 / D | HEIC/HEIF seguro si viable | Pendiente | Pendiente | No se añade dependencia ni se anuncia soporte. |
| 3 / D | PDF digital/escaneado/híbrido por página sin duplicados | Implementado parcialmente | Implementado parcialmente | Ver RESULTS: cobertura y límites explícitos. |
| 3 / D | PDF rotado/multipágina/protegido/dañado/vacío/límites | Implementado parcialmente | Implementado parcialmente | Ver RESULTS: cobertura y límites explícitos. |
| 3 / D | DOCX/XLSX/PPTX con secciones/hojas/celdas/diapositivas | Implementado parcialmente | Implementado parcialmente | Ver RESULTS: cobertura y límites explícitos. |
| 3 / D | TXT/CSV/Markdown/XML/JSON/SVG seguros | Implementado y verificado | Implementado y verificado | Ver RESULTS: cobertura y límites explícitos. |
| 4 / C | EXIF/rotación/deskew/contraste/resolución/escalado | Implementado y verificado | Implementado y verificado | Ver RESULTS: cobertura y límites explícitos. |
| 4 / C | Ruido/binarización adaptativa/bordes/segmentación | Implementado parcialmente | Implementado parcialmente | Ver RESULTS: cobertura y límites explícitos. |
| 4 / C | Perspectiva/regiones cuando viable | Pendiente | Pendiente | No se añade dependencia ni se anuncia soporte. |
| 4 / C | Español/inglés/combinado y modelos reproducibles | Implementado y verificado | Implementado y verificado | Ver RESULTS: cobertura y límites explícitos. |
| 4 / C | Tres modos y selección por indicadores verificables | Implementado parcialmente | Implementado parcialmente | Ver RESULTS: cobertura y límites explícitos. |
| 4 / C | Series/tags/modelos/RFC/folios/importes/fechas sin sustituir caracteres | Implementado parcialmente | Implementado parcialmente | Ver RESULTS: cobertura y límites explícitos. |
| 4 / H | Texto/página/coordenadas/confianza/modelo y transformación inversa | Implementado parcialmente | Implementado parcialmente | Ver RESULTS: cobertura y límites explícitos. |
| 4,12 / C | Corpus representativo/CER/WER/exactitud/recuperación/CPU/RAM/latencia | Implementado parcialmente | Implementado parcialmente | Ver RESULTS: cobertura y límites explícitos. |
| 5 / F | Cola durable/idempotencia/deduplicación/prioridades/backoff | Implementado y verificado | Implementado y verificado | Ver RESULTS: cobertura y límites explícitos. |
| 5 / F | Leases/heartbeat/reinicio/cancelación/pausa/reanudación/fallo final | Implementado y verificado | Implementado y verificado | Ver RESULTS: cobertura y límites explícitos. |
| 5 / F | Unidades acotadas y progreso/checkpoints reutilizables de página | Implementado parcialmente | Implementado y verificado | PostgreSQL: idempotencia, lease perdido y resumeUnits; Python: salto de páginas. |
| 5 / F | Concurrencia justa, nuevos e histórico sin inanición | Implementado parcialmente | Implementado parcialmente | Ver RESULTS: cobertura y límites explícitos. |
| 5 / G | CPU/RAM/PIDs/hilos/tmp/plazos/tamaño/píxeles/páginas | Implementado parcialmente | Implementado parcialmente | Ver RESULTS: cobertura y límites explícitos. |
| 5 / G | Presión fiable/histéresis/recuperación, prioridad del ERP | Implementado parcialmente | Implementado parcialmente | Ver RESULTS: cobertura y límites explícitos. |
| 6 / F | Histórico previo, cursores/lotes/cola acotada/reinicio/reconciliación | Implementado parcialmente | Implementado parcialmente | Ver RESULTS: cobertura y límites explícitos. |
| 6 / F | Filtros empresa/carpeta/MIME/fechas/nunca/fallidos/calidad/motor | Implementado parcialmente | Implementado parcialmente | Política/API/UI; calendario y presupuestos con pruebas automatizadas. |
| 6 / F | Elegibles/activos/finales/omitidos/vacíos/ritmo/actividad/ETA sin count repetido | Implementado parcialmente | Implementado parcialmente | Ver RESULTS: cobertura y límites explícitos. |
| 7 / H | Identidad/revisión/motor/idiomas/texto/normalización/referencias | Implementado parcialmente | Implementado parcialmente | Ver RESULTS: cobertura y límites explícitos. |
| 7 / H | FTS/GIN/frases/acentos/mayúsculas/prefijos | Implementado y verificado | Implementado y verificado | Ver RESULTS: cobertura y límites explícitos. |
| 7 / H | Nombre/metadatos/etiquetas/contenido/OCR y filtros existentes | Implementado parcialmente | Implementado parcialmente | Ver RESULTS: cobertura y límites explícitos. |
| 7 / H | Ranking exacto/subcadenas/fuzzy controlado | Pendiente | Implementado parcialmente | Exacto antes de aproximado; cursor cifrado; sin subcadenas arbitrarias. |
| 7 / H | Snippets/página/motivo/cursor, sin conteos privados | Implementado parcialmente | Implementado parcialmente | Ver RESULTS: cobertura y límites explícitos. |
| 7 / G | EXPLAIN selectivo/coste/escritura/crecimiento/escala | Pendiente | Implementado parcialmente | Laboratorio real; SLO y operación prolongada sin certificar. |
| 8 / H | Buscador integrado/estados reales/coincidencias discretas | Implementado parcialmente | Implementado parcialmente | Ver RESULTS: cobertura y límites explícitos. |
| 8 / H | Reconocer/ver/copiar/reprocesar/alta/cancelar/descargar texto | Implementado y verificado | Implementado y verificado | Ver RESULTS: cobertura y límites explícitos. |
| 8 / H | PDF buscable opcional seguro | Pendiente | Pendiente | No se añade dependencia ni se anuncia soporte. |
| 8 / H | Buscar/navegar/resaltar/seleccionar texto en visor imagen/PDF | Implementado parcialmente | Implementado parcialmente | E2E real PNG/PDF, cuatro anchos, oscuro, teclado y táctil; faltan documentos complejos. |
| 8 / H | Overlays con EXIF/zoom/pan/rotación/resize/táctil | Pendiente | Implementado parcialmente | E2E real PNG/PDF, cuatro anchos, oscuro, teclado y táctil; faltan documentos complejos. |
| 8 / J | QA 1440/768/390/320, temas/teclado/táctil, capturas reales | Pendiente | Implementado parcialmente | E2E real PNG/PDF, cuatro anchos, oscuro, teclado y táctil; faltan documentos complejos. |
| 9 / E | Administración persistente instancia/empresa/usuario | Implementado parcialmente | Implementado parcialmente | Ver RESULTS: cobertura y límites explícitos. |
| 9 / E | Worker/motor/heartbeat/idiomas/modelos/límites | Implementado parcialmente | Implementado parcialmente | Ver RESULTS: cobertura y límites explícitos. |
| 9 / E | Controles digital/OCR imagen/PDF/manual/automático/tipos/calendario | Implementado parcialmente | Implementado parcialmente | Política/API/UI; calendario y presupuestos con pruebas automatizadas. |
| 9 / E | CPU/RAM/concurrencia/hilos/plazos/reintentos/retención | Implementado parcialmente | Implementado parcialmente | Política/API/UI; calendario y presupuestos con pruebas automatizadas. |
| 9 / E | Cola/recursos/errores/ritmo/derivados/índices/histórico | Implementado parcialmente | Implementado parcialmente | Ver RESULTS: cobertura y límites explícitos. |
| 9 / E | Activar/OFF/pausar/reanudar/reintentar/reprocesar/cancelar/purgar | Implementado parcialmente | Implementado parcialmente | Ver RESULTS: cobertura y límites explícitos. |
| 9 / I | Auditoría y conservación/desactivación independiente de búsqueda | Implementado y verificado | Implementado y verificado | Ver RESULTS: cobertura y límites explícitos. |
| 10 / I | ACL vigente en texto/snippets/coordenadas/visor/procesamiento/exportación | Implementado parcialmente | Implementado parcialmente | Ver RESULTS: cobertura y límites explícitos. |
| 10 / I | Empresas/revocación/propietario/carpeta/eliminar/restaurar/revisión/ID | Implementado y verificado | Implementado y verificado | Ver RESULTS: cobertura y límites explícitos. |
| 10 / I | Enlaces/concurrencia/caches/logs/métricas/RLS reales | Implementado parcialmente | Implementado parcialmente | Ver RESULTS: cobertura y límites explícitos. |
| 10 / B | SBOM/CVE, paquete/versión/fix/exposición/antes-después | Pendiente | Implementado parcialmente | 50 a 1 CVE; cobertura nativa manual, ver SECURITY. |
| 10 / B | Firmas/ZIP bombs/XML externo/macros/código/recursos remotos | Implementado parcialmente | Implementado parcialmente | Ver RESULTS: cobertura y límites explícitos. |
| 10 / B | No root/capabilities/tmp/plazos/memoria/PIDs/red/credenciales/limpieza | Implementado parcialmente | Implementado parcialmente | Ver RESULTS: cobertura y límites explícitos. |
| 11 / H | Búsqueda global si viable y contratos autorizados para otros módulos | Implementado parcialmente | Implementado parcialmente | Ver RESULTS: cobertura y límites explícitos. |
| 11 | No escribir datos empresariales reconocidos automáticamente | Implementado y verificado | Implementado y verificado | Ver RESULTS: cobertura y límites explícitos. |
| 11 | QR/barras/clasificación/manuscritos/semántica/LLM/proveedores externos | No aplicable: extensiones futuras, fuera de V1 | No aplicable: extensiones futuras, fuera de V1 | Extensión fuera de V1. |
| 12 / L | Node/Python/integración/DB/E2E/seguridad/Archivos/admin/instalación | Implementado parcialmente | Implementado parcialmente | Ver RESULTS: cobertura y límites explícitos. |
| 12 / F | Histórico mixto/caídas/Storage/operación prolongada | Pendiente | Implementado parcialmente | Laboratorio real; SLO y operación prolongada sin certificar. |
| 12 / G | ERP real: seis escenarios, tres presupuestos, p50/p95/p99 y objetivo <10% | Pendiente | Implementado parcialmente | Laboratorio real; SLO y operación prolongada sin certificar. |
| 13 / K | Migración aditiva/actualización segura/sin backfill inesperado | Implementado y verificado | Implementado y verificado | Ver RESULTS: cobertura y límites explícitos. |
| 13 / K | Instalación/activación/modelos/administración/operación/API/rollback | Implementado parcialmente | Implementado parcialmente | Ver RESULTS: cobertura y límites explícitos. |
| 13 / L | RC integral y clasificación con evidencia | Pendiente | Implementado parcialmente | Laboratorio real; SLO y operación prolongada sin certificar. |

La evidencia sintética previa no se equipara a un ERP completo probado. La tabla
de cierre en RESULTS indicará los cambios de estado y los bloqueos restantes.

Cierre 2026-11-25: APTO PARA PRUEBAS AISLADAS; V1 incompleta. Los commits
concurrentes 616f1b4bb, af38e0a6e y da7f50f5d incluyeron partes de esta
consolidación mientras se trabajaba. Se preserva su historia.
