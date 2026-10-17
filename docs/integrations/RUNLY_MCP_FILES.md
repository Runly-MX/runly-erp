# Originales adjuntos al chat → Runly

El MCP incorpora `runly_files_import_prepare` y `runly_files_import_commit`.
Permiten guardar imágenes/PDF originales en Archivos o adjuntarlos a un activo
existente de Inventario. No se vuelve a crear el activo para agregar fotografías.

## Conexión y permisos

Autorizar el nuevo scope `files:write` mediante un consentimiento nuevo. Un refresh
de un token anterior no amplía sus scopes. Para un activo también se necesita
`inventory:write`. Se verifican membresía activa, empresa consentida, módulo
Archivos habilitado, `files.assets.create` y `files.assets.read`; si se indica
`itemId`, además Inventario habilitado y `inventory.item.read`/`inventory.item.update`.
No se deduce una empresa a partir de la sesión del ERP.

El contrato nativo documentado por OpenAI utiliza un campo superior `files`,
declarado en `_meta["openai/fileParams"]`, con objetos
`{ download_url, file_id, mime_type?, file_name? }`. Ambas herramientas declaran
los cuatro campos y requieren solo los dos primeros en cada objeto. Fuente:
[referencia de archivos de ChatGPT](https://developers.openai.com/plugins/reference#file-apis).
No necesita una API key de OpenAI ni subir archivos al API de Files de OpenAI.

1. Adjuntar las fotografías al chat y pedir guardarlas o vincularlas al activo.
2. El cliente debe entregar referencias reales de los originales a la herramienta.
   `prepare` recibe `{ companyId, itemId?, files }`.
3. Runly descarga temporalmente los bytes, verifica límites/tipo y calcula SHA-256.
   Muestra destino, nombres, tamaños y huellas en `/app/mcp?proposal=...`.
   Todavía no escribe archivos en Storage.
4. La persona aprueba o rechaza esa propuesta en Runly; caduca a los diez minutos.
5. `commit` recibe `{ companyId, proposalId, files }`. El cliente vuelve a enviar
   referencias vigentes de los mismos originales; sus bytes deben coincidir.
6. Runly guarda los archivos mediante `filesService.upload`, los vincula mediante
   `inventoryService.addItemFile` si corresponde y devuelve sus IDs y enlace.

Un cliente que no entregue archivos al MCP no puede transferirlos solo porque el
modelo describa la imagen. En ese caso hay que habilitar/refrescar el contrato de
herramientas del cliente y reenviar los originales; nunca inventar URLs, reconstruir
una foto ni afirmar que se guardó si no hay recibo con IDs. El servidor valida el
contrato nativo; la entrega desde una cuenta concreta de ChatGPT requiere probar
esa cuenta después de publicar la API. No se declara esa prueba como realizada.

## Límites y seguridad

- JPEG, PNG, GIF, WebP y PDF, sin conversión. Máximo cinco archivos por propuesta,
  10 MB por archivo y 30 MB en conjunto. El tipo se obtiene de la firma binaria;
  si el cliente declara otro tipo, se rechaza. Office, SVG, HEIC y ZIP no están
  habilitados por esta operación.
- Descargas HTTPS con límite de bytes real y timeout, DNS validado y fijado a la
  conexión, rechazo de direcciones privadas/loopback y redirecciones inseguras.
  Se reutiliza el downloader existente de Catálogo, sin enviar credenciales ERP
  u OpenAI. No se guardan URLs firmadas, cuerpos binarios ni credenciales en
  `mcp_state`, resultados o auditoría.
- Archivos sin `itemId` son privados/restringidos al propietario con la ACL del
  servicio. Los adjuntos de Inventario usan el acceso al módulo/registro existente;
  no se crean enlaces públicos ni se publican en el bucket web.
- Antes de guardar se revalidan autorización, permisos, destino y huellas. El
  commit bloquea grant, propuesta y activo. Metadatos, relaciones, auditoría y
  recibo se confirman en la misma transacción; los reintentos devuelven el recibo
  sin volver a descargar/subir. Un lote fallido revierte sus registros y compensa
  los objetos nuevos sin referencias; nunca borra objetos confirmados ante una
  respuesta de commit perdida.
- Storage y PostgreSQL no comparten una transacción distribuida. Si el proceso
  termina abruptamente o Storage no admite la limpieza, puede quedar un objeto
  sin referencia. No se publicará ni quedará asociado a un registro; corresponde
  al mantenimiento de huérfanos, sin borrar archivos que sí tengan `FileAsset`.

Se reutiliza el cliente Storage privado existente, `upsert: false` y sus límites.
No se cambian buckets, RLS, tablas, credenciales ni variables de entorno.

## Verificación y actualización

`RUNLY_MCP_TEST_INSPECTOR=true pnpm test:mcp` cubre originales y hashes, tres
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
app de ChatGPT, consentir `files:write` y comprobar que aparecen las dos
herramientas con file params. Las doce herramientas antiguas siguen funcionando
con sus scopes anteriores. No se publicaron imágenes ni se modificó el VPS.
