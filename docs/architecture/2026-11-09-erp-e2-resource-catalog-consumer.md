# ERP E2 — consumidor del catálogo de recursos de Marketplace

**Fecha:** 2026-11-09. **Alcance:** leer y verificar criptográficamente el feed de recursos del Developer Hub y descargar paquetes públicos con transporte acotado. **No** instala, aplica ni valida el contenido de un paquete (E3 y los validadores de E1b), no tiene UI, no fija claves de producción.
Contratos: `RESOURCE_FEED_CONTRACT_V1`, `DEC-X1`, `ERP_E1A_ACK` y `HUB_E1A_CLOSURE` del Hub.

## Servicio

`apps/api/src/services/catalog/resource-catalog-service.js` → `createResourceCatalogService({ prisma, readBytes, trust, now, runlyVersion })`. Configuración: `catalog.resources.url` (https o `file://` local; **sin valor por omisión**, no hay feed activo).

| Método | Qué hace |
|---|---|
| `refresh()` | Descarga (≤ 4 MiB), valida estructura, verifica firma del snapshot y de **cada** release, aplica anti-rollback y persiste. Ante cualquier fallo conserva la última copia verificada y devuelve `alert` con el código; sin copia previa lanza `ResourceFeedError` |
| `status()`, `list()`, `get()`, `inspect()` | Lectura sobre la copia verificada (se **reverifica** en cada lectura). Cada recurso trae `trust`, `availability`, `revocation`, `eligible` y `blockedBy[]` |
| `downloadPackage(resourceKey, version, { acknowledgeStale })` | Solo si el recurso es `eligible`; URL relativa `packages/<sha256>` resuelta contra el feed verificado (mismo origen y directorio); tope de bytes por tipo; longitud y SHA-256 exactos; si algo difiere, `RESOURCE_PACKAGE_MISMATCH` |

No existe método de instalación ni de aplicación.

## Reglas implementadas

- **Estructura cerrada:** envelope, snapshot (10 claves), entrada (21 claves), `trust.keys`, publicadores y revocaciones con claves exactas; `access:"public"` únicamente; `resourceKey = <ns>.<slug>` con `ns` según el tipo (`custom.*` rechazado); `size ≤ máximo del tipo` (26 214 400 / 204 800 / 26 214 400 / 262 144); mismo `sha256` ⇒ mismo `size`; `packageUrl = packages/<sha256>`; validez ≤ 7 días; ≤ 4 MiB.
- **Firmas Ed25519 con dominios propios** (`runly.catalog.resources.v1.{release,snapshot}\n`). Los cinco dominios con prefijo son distintos y sin prefijo mutuo, y la declaración v1 `key@version:sha256` no puede empezar por ninguno (comprobado al cargar el módulo y en pruebas). La firma de una release inválida **rechaza todo el snapshot**; una release firmada por una clave no confiable/revocada/retirada se lista como `untrusted` y no es elegible.
- **Confianza `resource`:** nueva categoría del `catalog-trust-store`, con claves ancladas en `catalog-resource-public-key.js` (**vacía**: ninguna clave de producción). Una clave presente en el feed nunca se acepta por sí sola; el feed solo puede restringir (revocar/retirar). Una clave `resource` no puede coincidir con una oficial/comunitaria ni ser administrada como `managed`.
- **Anti-rollback:** marca de agua propia `resource:runly-resources-v1` en `catalog.sequence.highWater` (persistente; sobrevive reinicios); rollback, equivocación y cadena rota se rechazan con `RESOURCE_FEED_ROLLBACK` / `RESOURCE_FEED_CHAIN_INVALID`.
- **Caducidad y frescura (normativas):** un snapshot con `validUntil` vencido nunca se acepta ni se ofrece; < 24 h elegible; 24–72 h solo con `acknowledgeStale: true`; > 72 h no elegible; vista en caché hasta 30 días.
- **Revocaciones** por release, publicador y clave (las de clave se acumulan y persisten; un snapshot no puede ser verificado por una clave que él mismo revoca).

## Compatibilidad con los catálogos existentes

Oficial v1, snapshot oficial y comunitario v2 **no se modificaron**: comparten solo el almacén de marca de agua (otro dominio) y la caché por URL. Cambios en archivos compartidos: `catalog-trust-store.js` añade la categoría `resource` (las funciones de módulos no la aceptan); las 60 pruebas de catálogo previas y las 2 de rutas pasan sin cambios.

## Pruebas

`__tests__/resource-catalog.test.js` usa los vectores reales del Hub (copia con huella en `fixtures/README.md`) y la clave de prueba pública para re-firmar y aislar cada regla: los 14 casos negativos (N1–N14), dominios cruzados, claves no ancladas o ancladas en otra categoría, revocaciones, rollback tras reinicio, equivocación, caducidad, frescura, caché de 30 días, offline, URLs inseguras (incluida la dirección privada real), tamaños por tipo, longitud y hash.
