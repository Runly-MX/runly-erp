# Content Intelligence V1

Estado: implementación en validación. No autoriza despliegues ni procesamiento de datos operativos.

## Auditoría y decisiones

Archivos centraliza objetos en Supabase Storage, identidad empresarial en
`file_asset.entity_id`, revisiones en `content_revision`, y visibilidad efectiva en
`services/files/visibility.js`. Office conserva versiones independientes.
La lectura de derivados debe pasar por `filesService.getById` en cada solicitud:
ni la empresa, ni un enlace público, por sí solos autorizan consultar OCR.
El worker general ejecuta tareas operativas; OCR necesita aislamiento propio para
que las bibliotecas nativas no compitan dentro de ese proceso.

Se reutilizan PostgreSQL, Storage, Hono, permisos de Archivos, propietario de
plataforma, auditoría y componentes compartidos. No se añade Redis, otra base de
datos, GPU, LLM, ni proveedor remoto. Las tablas son de plataforma, gestionadas
por una migración SQL; no son tablas RME3 ni una aplicación de Marketplace.

## Arquitectura

API: política persistente de instancia y empresa, autorización, cola durable,
leases, búsqueda y descarga autorizada. Worker opcional: Python, Tesseract,
Poppler y Pillow, con originales de solo lectura y temporales por trabajo.
El worker se autentica con una clave operativa independiente; solo accede a
trabajos reclamados mediante leases y nunca recibe credenciales de Storage o DB.
Los tokens de lease se guardan como hashes. No se registran documentos ni texto.

OFF es el valor inicial. La activación requiere política de empresa explícita.
Sin heartbeat reciente no se generan trabajos automáticos. El reconciliador
recorre registros por cursor y lotes acotados, nunca buckets. Un trigger invalida
derivados al cambiar revisión, objeto, checksum o habilitación. La migración no
inicia OCR ni backfill. La cola tiene límites por empresa y globales.

Los índices FTS usan texto normalizado independiente del original. La búsqueda
pagina candidatos y aplica permisos actuales antes de devolver fragmentos; no
expone conteos previos a autorización. No se indexan textos completos con trigramas.

## Riesgos y criterios de aceptación

Los parsers nativos procesan entradas no confiables: contenedor no root, límites
físicos de CPU/RAM/PIDs/tmpfs, límites de archivo, páginas, píxeles, tiempo y XML/ZIP.
El backend no tiene acceso al socket Docker. La red del worker debe limitarse al
API en infraestructura; Compose por sí solo no equivale a una política de egress.
La instalación remota requiere TLS y red privada; no se anuncia descubrimiento
ni despliegue remoto automático.

Aceptar únicamente con evidencia de: funcionamiento OFF, OCR real español/inglés,
PDF digital/escaneado/híbrido, Office, persistencia/reinicio, leases vencidos,
cancelación, backfill acotado, búsquedas por serie, aislamiento y revocación.
El corpus sintético debe medir CER/WER y coincidencia exacta de identificadores.
Los presupuestos 2/4, 4/8 y 8/16 y el objetivo p95 <10% requieren benchmarks;
no se consideran validados por configurar límites de contenedor.

## Activación y rollback

Aplicar migraciones con el flujo habitual, actualizar API y web, instalar el
worker opcional y configurar su secreto fuera del repositorio. Activar primero
una empresa de prueba y después el histórico explícitamente. Para rollback:
OFF global, detener worker, mantener o desactivar búsqueda por separado, purgar
derivados con autorización y restaurar imágenes anteriores. Las tablas aditivas
pueden permanecer; no borrar originales ni versiones. Detalles y evidencia en
`docs/CONTENT_INTELLIGENCE_V1.md`.
