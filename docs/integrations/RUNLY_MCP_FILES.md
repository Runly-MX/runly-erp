# Originales adjuntos al chat → Runly

El MCP incorpora `runly_files_import_prepare` y `runly_files_import_commit`.
Permiten guardar imágenes/PDF/XML originales y asociarlos a registros existentes
de los 17 módulos expuestos por MCP, mediante 27 tipos de destino explícitos.
No se vuelve a crear el registro para agregar archivos.

## Destinos nativos y referencias privadas

La propuesta distingue el efecto que se ejecutará:

| Módulo | Destinos nativos: aparecen en el panel existente |
| --- | --- |
| Inventario | Activos: `inventory.item` |
| RH | Empleados: `hr.employee` |
| Flota | Vehículos, conductores y reportes: `fleet.vehicle`, `fleet.driver`, `fleet.report` |
| Compras | Solicitudes, cotizaciones, órdenes, facturas y recepciones: `purchases.request`, `.quote`, `.order`, `.invoice`, `.receipt` |
| Contactos | `contacts.contact` |
| Proyectos | Tareas: `projects.task` |
| Canvas | Boards y hotspots: `canvas.board`, `canvas.hotspot` |

RH, Contactos, Compras y tareas usan el mismo `FileAsset` y
`metadata.sourceEntityId` de sus paneles. Inventario, Flota y Canvas además
ejecutan el servicio de asociación original. Flota puede usar la primera imagen
como foto del conductor si carece de una; la propuesta lo informa y conserva una
foto existente.

Los demás destinos guardan una **referencia privada en Archivos**, con
`metadata.mcpTarget = { type, id }`. No inventan una asociación visible en su
interfaz ni modifican el registro:

- Proyecto completo: `projects.project` (las tareas sí son nativas).
- Notas: `notes.note`; conserva contenido y estado Yjs.
- PFM: `pfm.wallet`, `pfm.movement`; no modifica saldos ni reconoce tickets.
- Ledger: `ledger.account`, `ledger.transaction`; no importa movimientos.
- Calendario: `calendar.event`; no envía invitaciones ni modifica proveedores.
- Asistencia: `attendance.person`; no cambia fotos ni registra entradas/salidas.
- Identidad: `identity.profile`; no cambia avatar, cuenta ni permisos.
- Actividad propia: `activity.entry`.
- Aprendizaje: `lms.course` (`lms.course.manage`); no crea lecciones de video ni de archivo, que se suben en la app.
- Chat: `chat.conversation`, solo conversaciones propias de la empresa. **No
  publica mensajes ni agrega adjuntos al historial de mensajes enviados**.
- Documentos/Archivos: `documents.file`, `files.file`, archivos existentes
  accesibles para la persona.

Las referencias no heredan automáticamente los colaboradores del registro:
permanecen restringidas al propietario o a quienes reciban acceso mediante
Archivos. Consultarlas por destino también exige poder leer el registro. No se
presentan como adjuntos nativos.

Consultar `runly_files_query` con `request.operation = files_attachment_targets`
para obtener destinos disponibles, modo y `canImport`. Se filtran por empresa,
módulos, permisos, scopes y capacidades activas de Compras. La operación
`files_record_attachments` recibe `{ target: { type, id }, page?, limit? }` y lista
metadatos sin URLs firmadas. El [catálogo generado](RUNLY_MCP_CATALOG.md) detalla
permisos y scopes exactos.

## Conexión y permisos

Autorizar el nuevo scope `files:write` mediante un consentimiento nuevo. Un refresh
de un token anterior no amplía sus scopes. Una asociación nativa también necesita
`<dominio>:write`; una referencia privada necesita `<dominio>:read`. Las consultas
usan `files:read` y `<dominio>:read`. Se verifican membresía activa, empresa consentida, módulo
Archivos habilitado, `files.assets.create` y `files.assets.read`; si se indica
`itemId`, además Inventario habilitado y `inventory.item.read`/`inventory.item.update`.
Con `target` se exige de igual forma el módulo y permiso específico del catálogo,
además de roles por proyecto/board y propiedad o acceso compartido del recurso.
No se deduce una empresa a partir de la sesión del ERP.

El contrato nativo documentado por OpenAI utiliza un campo superior `files`,
declarado en `_meta["openai/fileParams"]`, con objetos
`{ download_url, file_id, mime_type?, file_name? }`. Ambas herramientas declaran
los cuatro campos y requieren solo los dos primeros en cada objeto. Fuente:
[referencia de archivos de ChatGPT](https://developers.openai.com/plugins/reference#file-apis).
No necesita una API key de OpenAI ni subir archivos al API de Files de OpenAI.

1. Adjuntar las fotografías al chat y pedir guardarlas o vincularlas al activo.
2. El cliente debe entregar referencias reales de los originales a la herramienta.
   `prepare` recibe `{ companyId, target?: { type, id }, files }`; por ejemplo,
   `{ type: "fleet.vehicle", id: "..." }` o `{ type: "purchases.invoice", id: "..." }`.
   `itemId` conserva compatibilidad como alias de `inventory.item`; no se combina
   con `target`. Sin destino guarda archivos privados independientes.
3. Runly descarga temporalmente los bytes, verifica límites/tipo y calcula SHA-256.
   Muestra destino, nombres, tamaños y huellas en `/app/mcp?proposal=...`.
   Todavía no escribe archivos en Storage.
4. La persona aprueba o rechaza esa propuesta en Runly; caduca a los diez minutos.
5. `commit` recibe `{ companyId, proposalId, files }`. El cliente vuelve a enviar
   referencias vigentes de los mismos originales; sus bytes deben coincidir.
6. Runly guarda mediante `filesService.upload`, ejecuta el adaptador autorizado
   y devuelve IDs, `target`, `mode`, enlace de archivo/panel y `recordLink`.
   Las propuestas anteriores de Inventario sin `destination` siguen siendo válidas.

Un cliente que no entregue archivos al MCP no puede transferirlos solo porque el
modelo describa la imagen. En ese caso hay que habilitar/refrescar el contrato de
herramientas del cliente y reenviar los originales; nunca inventar URLs, reconstruir
una foto ni afirmar que se guardó si no hay recibo con IDs. El servidor valida el
contrato nativo; la entrega desde una cuenta concreta de ChatGPT requiere probar
esa cuenta después de publicar la API. No se declara esa prueba como realizada.

## Límites y seguridad

- JPEG, PNG, GIF, WebP, PDF y XML UTF-8, sin conversión. Máximo cinco archivos por propuesta,
  10 MB por archivo y 30 MB en conjunto. El tipo se obtiene de la firma binaria;
  si el cliente declara otro tipo, se rechaza. XML no admite DTD, entidades ni
  contenido activo; no ejecuta reconocimiento fiscal ni cambios financieros.
  Office, SVG, HEIC y ZIP no están
  habilitados por esta operación.
- Descargas HTTPS con límite de bytes real y timeout, DNS validado y fijado a la
  conexión, rechazo de direcciones privadas/loopback y redirecciones inseguras.
  Se reutiliza el downloader existente de Catálogo, sin enviar credenciales ERP
  u OpenAI. No se guardan URLs firmadas, cuerpos binarios ni credenciales en
  `mcp_state`, resultados o auditoría.
- Archivos sin destino y de modo `private-reference` son privados/restringidos al
  propietario con la ACL del servicio. Los adjuntos nativos usan el acceso al módulo/registro existente;
  no se crean enlaces públicos ni se publican en el bucket web.
- Antes de guardar se revalidan autorización, permisos, destino y huellas. El
  commit bloquea grant y propuesta, y conserva el bloqueo de activo/slots de
  Inventario. Metadatos, relaciones, auditoría y
  recibo se confirman en la misma transacción; los reintentos devuelven el recibo
  sin volver a descargar/subir. Un lote fallido revierte sus registros y compensa
  los objetos nuevos sin referencias; nunca borra objetos confirmados ante una
  respuesta de commit perdida. Revalida permisos tras los efectos del servicio;
  una retirada durante la carga revierte el lote. Los efectos propios como la
  foto inicial de un conductor no invalidan su propio commit.
- Storage y PostgreSQL no comparten una transacción distribuida. Si el proceso
  termina abruptamente o Storage no admite la limpieza, puede quedar un objeto
  sin referencia. No se publicará ni quedará asociado a un registro; corresponde
  al mantenimiento de huérfanos, sin borrar archivos que sí tengan `FileAsset`.

Se reutiliza el cliente Storage privado existente, `upsert: false` y sus límites.
No se cambian buckets, RLS, tablas, credenciales ni variables de entorno.

## Verificación y actualización

`RUNLY_MCP_TEST_INSPECTOR=true pnpm test:mcp` pasó 163 pruebas sin omisiones ni
fallos. Incluye los 27 destinos, relaciones nativas de Flota/tareas/Canvas y
consultas de los paneles de RH/Compras/Contactos; referencias privadas, roles
VIEWER, recursos privados ajenos, módulos deshabilitados, workflow de Compras,
XML sin modificar la factura, revocación durante la carga y propuestas antiguas.
También cubre originales y hashes, tres
asociaciones reales en PostgreSQL, aprobación/rechazo/caducidad, permisos,
empresa ajena, conflictos, llamadas concurrentes, recibo idempotente, privacidad
de cargas independientes y compensación de fallos parciales. Storage se simula
en su frontera SDK y se comparan los bytes recibidos por el servicio real; no se
usaron credenciales ni archivos de una instancia desplegada. Inspector 2.11.0
verifica OAuth y los descriptores nativos en `tools/list` (50 herramientas).

Las pruebas unitarias también comprueban stream grande sin Content-Length,
DNS fijado y rechazo de redirección privada/downgrade. El downloader conserva
sus pruebas originales de Catálogo.

Solo cambia la imagen **`raulbellosom/runlyerp:api-latest`** para esta corrección.
Después de publicarla, actualizar con `bash ./update-local.sh` o
`bash ./update-external.sh` en el directorio instalado. Reconectar/refrescar la
app de ChatGPT, consentir `files:write` y los scopes de los destinos necesarios,
y comprobar que aparecen las dos
herramientas con file params. Las doce herramientas antiguas siguen funcionando
con sus scopes anteriores. No se publicaron imágenes ni se modificó el VPS.
