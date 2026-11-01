# Runly Commerce Recovery — cierre de integración de Catálogo

Fecha: 2026-11-01. Alcance: D36, integración real de Catálogo con C1/C5 y clasificación/corrección de D31–D35. No se implementa POS Tienda ni se inicia fase 3.

## Estado y commits

**Estado final: APTO.** D36 corregido en backend, persistencia y navegador comprobados, regresiones satisfactorias y sin bloqueos conocidos de integridad de severidad alta o crítica en el alcance autorizado.

Base inicial limpia `de5d2ed7d`, con `0d0a160e3` presente. Durante el trabajo se incorporó el commit de galería `a94de57f7`; se preservaron sus cambios y los de Claude. Se trabajó en `main`, sin ramas, worktrees, SSH, push, despliegues ni datos de producción. Los cambios de interfaz se limitan al transporte, permisos y guardado necesarios; no se sustituyen pantallas ni se rediseñan flujos.

Commit de implementación: **5e7be9697eec1242fdb2fbfad36b22400e07129e**. El commit documental posterior contiene este único informe; su hash se obtiene con `git log -1 --format=%H -- docs/superpowers/plans/2026-11-01-commerce-catalog-integration-results.md`. El hash del cierre y el estado del árbol se verifican al entregar; queda limpio después de ambos commits.

## D36: causa, corrección y persistencia

La [migración oficial de Zod 4](https://zod.dev/v4/changelog#defaults-applied-within-optional-fields) documenta que los defaults se evalúan dentro de propiedades opcionales. `createVariantSchema.omit({stock:true}).partial()` heredaba `option_values:{}` y `price:0`; por ello, un PATCH de SKU reemplazaba la combinación y desactivaba la herencia de precio.

Se definió `updateVariantSchema` con campos de actualización explícitos y sin defaults. No depende del esquema de creación. Resultado comprobado: `parse({sku:'X'})` devuelve únicamente `{sku:'X'}`. El servicio sigue distinguiendo propiedad ausente de valor explícito y actualiza únicamente los campos presentes.

| Entrada PATCH | Semántica |
|---|---|
| Campo omitido | Conserva el valor almacenado, incluida la política de precio |
| `sku:null`, `barcode:null`, `compare_price:null`, `cover_asset_id:null` | Borra el valor opcional correspondiente |
| `price:null` | Activa herencia del precio del producto; conserva el indicador explícito |
| `price:0` | Precio propio válido en cero, sin herencia |
| `option_values:{...}` | Reemplaza explícitamente la combinación completa; no modifica SKU, barcode o precio |
| `option_values:{}` | Vacía la combinación sólo si se envía expresamente |
| `{}` | No modifica fila, revisión, opciones o precio |
| Tipo inválido, precio negativo, stock u otro campo no admitido | 400, sin escritura |

En los esquemas análogos se encontró el mismo defecto en la posición de categoría. Se quitó su default de actualización y se comprobó en PostgreSQL que cambiar sólo nombre conserva `position:7`. El esquema de actualización de producto ya era explícito y no heredaba defaults; el de opciones también. Se corrigió el acceso a errores de categorías a `.issues`, válido en Zod 4. No se refactorizaron validadores ajenos a Catálogo.

La regresión usa API real del router y PostgreSQL desechable: SKU aislado, barcode aislado, combinación explícita, herencia conservada, cero propio, cambio propio↔heredado, PATCH vacío y cuerpos inválidos. Después de cada operación se vuelve a leer la fila persistida, además de comprobar las respuestas.

En `VariantGrid` se retiró el workaround de reenviar siempre `option_values` y `price`. Ahora envía sólo los campos editados y la revisión. La acción masiva de heredar envía sólo `price:null` más revisión. El navegador comprueba el cuerpo del PATCH de SKU sin precio/opciones y después realiza una lectura fresca del servidor: combinación «Chica», SKU nuevo y `price_inherited:true` permanecen correctos.

## Resultado D31–D35

| ID | Severidad e impacto evaluados | Resolución |
|---|---|---|
| D31 | Alta: usuarios legítimos de Catálogo no podían elegir sucursal ni utilizar la vista transversal de existencias sin permisos POS | Corregido con proyecciones de lectura de Catálogo, limitadas a empresa/sucursal. No se concede administración ni permiso operativo POS |
| D32 | Media: faltan filtros servidor por stockState/hasUnallocated y total global sin asignar; aumenta el trabajo con catálogos grandes | Diferido a administración/optimización, fase 5. No bloquea consulta paginada, saldo por fila, ficha ni asignación obligatoria. No se inventa un total global calculando una página en React |
| D33 | Alta: la comparación de React dejaba una ventana entre GET y PATCH; dos clientes podían sobrescribirse | Corregido con revisión monotónica, precondición obligatoria y comprobación bajo bloqueo de fila en PostgreSQL. Una carrera con la misma revisión produce una escritura y un conflicto |
| D34 | Baja, mejora funcional: no hay escritura de política POS específica por variante | Diferido explícitamente a una ampliación posterior de disponibilidad. La v1 aprobada hereda del producto/sucursal y conserva bloqueos antiguos. No era requisito obligatorio de fase 2 |
| D35 | Alta: una respuesta perdida en alta de variante podía repetirse sin identidad persistente; en productos el slug no recuperaba con certeza el resultado | Corregido: altas de producto y variante exigen clave persistente. Fila, stock inicial, auditoría y respuesta se confirman juntos. Repetir clave/body devuelve el mismo ID; cambiar body con esa clave falla |

No queda un bloqueo crítico o alto conocido de integridad de los recorridos autorizados. D32 y D34 no se presentan como implementados.

## Contratos y compatibilidad

### Lecturas de Catálogo sin administración POS

Todas usan `catalog.products.read` y la empresa activa validada por el middleware:

- `GET /catalog/outlets`: sólo sucursales activas de esa empresa, `{data:[{id,name,mode}]}`.
- `GET /catalog/commercial-defaults`: proyección `{data:{currency,defaultTaxRate,pricesIncludeTax}}`, o null si falta configuración. No expone otras preferencias administrativas.
- `GET /catalog/sellables` y `GET /catalog/sellables/:id/variants`: mismos parámetros, DTO, paginación y validaciones de C1; sucursal ajena devuelve 404.
- SDK: `catalogCommerce.outlets`, `defaults`, `sellables` y `variants`.

Los hooks existentes de Catálogo consumen estas rutas. Las rutas `/pos/v2/*` conservan sus permisos operativos; no se amplían con permisos de Catálogo. La vista de existencias y el filtro POS siguen exigiendo elegir una sucursal explícita. No se concede `pos.settings.manage` ni un equivalente administrativo.

### Edición concurrente

Producto y variante agregan `revision` entera, inicial 1. La migración aditiva `20261101210000_catalog_write_integrity` instala triggers que incrementan la revisión en cualquier actualización, incluidos escritores antiguos, stock y disponibilidad. `updated_at` también avanza de forma monotónica, evitando colisiones de milisegundo en precondiciones históricas de sync. No se recalculan precios, saldos o documentos anteriores.

PATCH de producto/variante admite `expectedVersion` positiva. El servidor bloquea la fila de la empresa/producto correcto, compara y aplica en una sola transacción, con auditoría. Sin precondición en un PATCH no vacío: 428 `PRECONDITION_REQUIRED`; revisión obsoleta: 409 `CATALOG_VERSION_CONFLICT`. PATCH vacío sigue siendo lectura sin modificaciones. Las respuestas de estas rutas históricas conservan `{error:string,code}`; las rutas comerciales nuevas conservan `{error:{code,message},requestId}`.

SDK conserva las firmas anteriores y agrega último argumento `{expectedVersion}`. Los formularios deben pasar la revisión de su snapshot para detectar edición obsoleta. Cuando un consumidor antiguo del SDK no la proporciona, éste lee el registro y adjunta su revisión, cerrando la ventana de esa lectura/escritura; esa ayuda no reconstruye el snapshot de un formulario antiguo. Si el servidor no entrega revisión, el SDK bloquea la escritura con 428, evitando volver al backend vulnerable.

`useProductSave` mantiene el diálogo «Recargar / Guardar los míos» y su comparación por campos. También envía la revisión de la lectura comprobada; si llega otro cambio entre lectura y escritura, el servidor rechaza. «Guardar los míos» relee la revisión actual y vuelve a comprobarla al escribir: no existe un bypass de concurrencia en el servidor. Las variantes envían la revisión de la fila mostrada, incluida la operación masiva.

### Altas y sincronización

`POST /catalog/products` y `POST /catalog/products/:id/variants` mantienen cuerpos y envolturas, y ahora requieren `Idempotency-Key` ASCII visible de 16–128 caracteres. Sin clave: 428 `IDEMPOTENCY_REQUIRED`. Misma clave con otro body: 409 `IDEMPOTENCY_CONFLICT`. La clave representa un intento lógico y debe conservarse tras una respuesta perdida; otro intento deliberado usa otra clave.

SDK: `catalog.createProduct(data,token,{idempotencyKey})` y `catalog.createVariant(productId,data,token,{idempotencyKey})`. No genera una clave nueva al reintentar ni encola estas escrituras offline. Los puntos de alta de Claude conservan claves por cuerpo durante el intento. Se retiró la inferencia anterior de «probablemente ya se creó»: el reintento recupera el resultado confirmado.

La exigencia de clave/precondición endurece las escrituras directas anteriores. Los clientes externos deben actualizarse; reciben 428 en lugar de duplicar o sobrescribir silenciosamente. Deben actualizarse backend y consumidores antes de habilitar escrituras de una instalación. Las lecturas y los datos anteriores permanecen compatibles.

`/sync/push` conserva permisos CRUD, ambas identidades `runly.catalog`/`atlas.catalog`, formato de resultados y replays históricos registrados en `SyncMutationLog`. Nuevas escrituras de producto pasan por comandos persistentes y validación de Catálogo; conservan `recordId` offline cuando está presente. Se admiten campos camelCase previos, convertidos al contrato validado. UPDATE requiere `expectedVersion` o el `clientUpdatedAt` histórico; se comprueba bajo el mismo bloqueo. Conflicto devuelve `CONFLICT` con registro actual de la empresa. Se preservan las restricciones de stock/empresa del sync. El resto de entidades/módulos no cambia de implementación.

No se aplicó reparación automática a variantes que pudieran haber sido dañadas antes: un cero propio o una combinación vacía también pueden ser legítimos. No se comprobó corrupción de datos de una instalación real; cualquier recuperación histórica requiere evidencia verificable.

## Validación técnica y navegador

| Ejecución | Resultado |
|---|---|
| `node scripts/test-commerce-postgres.mjs` | **160/160**, 29 suites, cero fallos/skips. PostgreSQL 18 desechable; migraciones Commerce vigentes; regresiones Catálogo, POS, Commerce, sync, manifiesto y SDK. Incluye siete escenarios PostgreSQL nuevos de integración y las carreras anteriores financieras/stock |
| `node --test packages/sdk/src/__tests__/*.test.js apps/desktop/src/modules/runly.catalog/lib/__tests__/*.test.js apps/desktop/src/lib/__tests__/brandTheme.test.js` | **91/91**, sin fallos/skips |
| Prisma validate y generate | Correctos |
| ESLint de Catálogo, sync, SDK, frontend afectado y pruebas nuevas | Correcto |
| `pnpm check:uuid-policy` | Correcto |
| `pnpm rbac:verify-catalog` | 349 permisos, cero faltantes/sobrantes |
| React Doctor `--verbose --diff` | **90/100**, sin errores; cuatro advertencias: await secuencial de sync, await de subida de imágenes y dos recomendaciones semánticas de galería. No se modifica el trabajo concurrente de galería para resolverlas |
| `git diff --check` | Correcto |
| `pnpm check:privacy` | Exit 1 por los mismos **67 hallazgos anteriores**. Los 25 archivos de implementación de este cierre pasan individualmente sin hallazgos; el informe se revisa por separado |
| E2E final | **90/90** en la pasada final, con sync autenticado; cero errores de página/5xx, build web local correcto |

Se reutilizó `.e2e/catalog-commerce-ui.mjs` mediante la copia local `.e2e/catalog-integration-validation.mjs`, agregando los casos de cuerpo PATCH, usuario sólo de Catálogo, alta con respuesta perdida y sync autenticado. La copia permite preservar el procedimiento compartido que se amplió con galería durante este trabajo. Son utilidades locales ignoradas, no nuevos endpoints ni pantallas de prueba.

El stack E2E usa PostgreSQL/Supabase desechable, todas las migraciones vigentes, seed sintético, API del árbol y web compilada localmente en puertos propios. Incluye login real de usuarios sintéticos, permisos reales, API HTTP real y navegador. Se conservan imágenes de verificación local en `.e2e/shots/catalog-commerce/`.

Recorridos verificados: listado/paginación, nombre/SKU/barcode, alta con impuesto/moneda y stock local, edición y conflicto, variante heredada y precio propio, lectura fresca tras SKU, publicación web independiente, excepción POS por sucursal, asignación «Sin asignar», movimientos, salida insuficiente, reintento de stock, galería, usuario lector, usuario sólo de Catálogo y recuperación de alta sin duplicación. La sincronización autenticada se verifica con dos reintentos concurrentes y una revisión obsoleta.

Las comprobaciones visuales cubren 390, 768, 1024 y 1440 px, claro/oscuro, contraste y ausencia de desbordamiento horizontal en listado, Venta y Existencias. No se probaron dispositivo táctil físico, banco, impresora ni producción.

Hubo ejecuciones intermedias fallidas, no computadas como aprobadas: el procedimiento de galería enviaba teclas sin esperar la activación del drag y se estabilizó con esperas entre eventos; una aserción de replay comparaba JSON serializado en lugar de objetos y fallaba por el orden de claves de JSONB. Se corrigieron las comprobaciones locales, sin sustituir la galería ni alterar el resultado esperado. También se detectó y corrigió la consulta de claves ASCII contra la columna UUID del registro histórico de sync; el código actual sólo consulta ese registro cuando la clave tiene formato UUID, y usa los comandos nuevos en los demás casos.

## Riesgos restantes y recomendación

Pendientes sin bloqueo alto de Catálogo: filtros/totales globales D32 (media, fase 5), escritura de disponibilidad específica por variante D34 (baja, ampliación posterior), advertencias de React Doctor, conciliación particular de históricos y actualización coordinada de clientes que escriban sin claves/revisión. La verificación local no certifica publicación; los hallazgos globales de privacidad siguen pendientes fuera de este cierre.

Se recomienda solicitar autorización explícita para fase 3 una vez aceptado este cierre: integrar POS Tienda con C0/C1/C2/C3/C4/C5/C8 reales y completar C7 según el plan, usando claves estables y revisiones. No reutilizar consultas administrativas para vender, no adelantar Cocina/fase 4 y no presentar una impresora o proveedor bancario como verificados. No se inició esa fase.
