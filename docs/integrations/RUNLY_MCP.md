# Runly MCP integrado

Compatibilidad OAuth con Inspector 2.11.0, auditoría DCR y procedimiento de
actualización: [RUNLY_MCP_OAUTH_COMPATIBILITY.md](RUNLY_MCP_OAUTH_COMPATIBILITY.md).

Runly hospeda `/mcp` en la API Hono existente. Utiliza el SDK oficial
`@modelcontextprotocol/sdk` 1.32.1 y Streamable HTTP sin sesiones, con respuestas
JSON. El SDK procesa inicialización, negociación de versión, validación JSON-RPC,
listado e invocación de herramientas. No requiere otro servicio permanente,
un modelo de IA ni una conexión con Developer Hub.

## Arquitectura y decisiones

- `apps/api/src/mcp/router.js`: descubrimiento OAuth, transporte, cuotas,
  validación de host y origen, límites de cuerpo y correlation IDs.
- `oauth.js`: clientes públicos DCR, authorization code con PKCE S256,
  consentimiento por empresa, expiración, refresh rotativo y revocación.
- `access.js`: perfiles y membresías vigentes, permisos efectivos por empresa,
  instalación y habilitación del módulo mediante los servicios existentes.
- `capabilities.js`: adaptador determinista de Inventario y descubrimiento RME3.
- `server.js`: contratos de entrada/salida y anotaciones MCP.
- `state.js` y la tabla core `mcp_state`: persistencia transaccional y bloqueos.
- `services/capabilities/inventory-{actions,queries}.js`: capacidades compartidas
  con MirAI. Las rutas anteriores conservan adaptadores compatibles.
- `McpConnectionScreen.jsx`, en `/app/mcp`: consentimiento, revisión completa de
  propuestas y revocación de conexiones con la sesión habitual de Runly.

La auditoría encontró que las consultas de MirAI ya utilizaban
`buildInventoryWhere` y `createInventoryAccess`, mientras que sus acciones
utilizaban `createInventoryChatActions` y `createInventoryService`. MCP conserva
estas reglas: las altas resuelven catálogos, revisan duplicados y adquieren el
bloqueo transaccional de intake; las ediciones utilizan `updateItem`. HTTP sigue
utilizando ese mismo servicio. No se exponen eliminación, bajas, asignaciones ni
operaciones masivas destructivas. El filtro `unassigned` se agregó a la consulta
compartida para buscar equipos sin responsable.

## Identidad, scopes y permisos

El cliente descubre `/.well-known/oauth-protected-resource/mcp` y
`/.well-known/oauth-authorization-server`. `/mcp` responde `401` con
`WWW-Authenticate` si falta un token MCP válido. También existe metadata de
recurso en `/.well-known/oauth-protected-resource`.

El registro DCR está en `/mcp/oauth/register`; admite clientes públicos con
`token_endpoint_auth_method: none`. Acepta redirects HTTPS o loopback HTTP,
sin fragmentos ni credenciales, con coincidencia exacta. El nombre de cliente
es información no verificada y se indica así en el consentimiento. No hay CIMD
ni flujos client credentials o tokens fijos de desarrollo.

La autorización exige `resource` igual a la URL MCP configurada, PKCE S256 y
redirect registrado. Se conserva `state`; las respuestas incluyen `iss` conforme
a RFC 9207. La persona inicia sesión mediante el sistema existente, revisa los
scopes y selecciona empresas. Cada conexión queda limitada a esas empresas.

| Scope | Acceso |
| --- | --- |
| `runly:read` | Identidad mínima, empresas y esquemas de módulos |
| `inventory:read` | Búsqueda, detalle, catálogos y resumen |
| `inventory:write` | Preparar y ejecutar altas y ediciones aprobadas |

Además del scope, Inventario exige `inventory.access`, módulo habilitado y
`inventory.item.read`. Las ediciones requieren `inventory.item.update`; las altas
requieren `inventory.item.create` y, por cada acción de catálogo o campo,
`inventory.catalog.manage` o `inventory.customfield.manage`. Se respetan los
administradores y permisos adicionales existentes por empresa. Los scopes no
otorgan permisos ERP que el usuario no tenga.

Los access tokens son opacos, duran 15 minutos y se almacenan únicamente como
hash SHA-256. Su registro está vinculado al recurso MCP y a una autorización
persistente. No se aceptan JWT de Supabase en `/mcp`. La sesión web de Supabase
solo sirve para consentimiento, revisión y revocación; la service role nunca
representa al usuario MCP. El refresh y la autorización duran hasta 30 días;
el refresh rota, invalida el access token anterior y revoca toda la conexión si
se reutiliza. Los códigos duran dos minutos y se consumen una vez.

Se vuelven a consultar perfil, membresías, permisos, empresa y módulo. La pérdida
de acceso bloquea operaciones sin esperar la expiración del token. Revocar una
conexión invalida todos sus access y refresh tokens. RLS está habilitado sin
políticas públicas en `mcp_state`, con privilegios retirados a `anon` y
`authenticated`. El rol de conexión de la API debe tener acceso a la tabla, como
al resto de tablas core.

## Herramientas

Todas devuelven contenido de texto JSON y `structuredContent: { data: ... }` con
esquema de salida. Las entradas rechazan propiedades desconocidas. Los errores
de herramienta incluyen código, mensaje y correlation ID, con `isError: true`;
los errores de autenticación HTTP utilizan `401` o `403` según corresponda.

| Herramienta | Parámetros |
| --- | --- |
| `runly_whoami` | Ninguno |
| `runly_companies_list` | Ninguno; solo empresas consentidas y accesibles |
| `runly_modules_list` | `companyId` |
| `runly_module_schema` | `companyId`, `moduleKey` |
| `runly_inventory_search` | `companyId`, `filters`, `page` (1–10000), `limit` (1–50, predeterminado 30) |
| `runly_inventory_get` | `companyId`, `itemId` |
| `runly_inventory_catalogs` | `companyId`, `search` opcional; hasta 50 por catálogo |
| `runly_inventory_summary` | `companyId`, `filters` opcional; conteos exactos y hasta 40 grupos |
| `runly_inventory_create_prepare` | `companyId`, `plan: { actions: [{ kind, data }] }`, máximo 20 acciones |
| `runly_inventory_create_commit` | `companyId`, `proposalId` |
| `runly_inventory_update_prepare` | `companyId`, `changes: { itemId, ...campos }` |
| `runly_inventory_update_commit` | `companyId`, `proposalId` |

Los filtros admitidos provienen de `inventoryFiltersSchema`: `search`,
`serialNumber`, `assetTag`, `folio`, `partNumber`, `model`, `modelId`, `brandId`,
`categoryId`, `locationId`, `assignedToId`, `conditionId`, `status`, `adminStatus`,
fechas `createdFrom/To`, `purchaseFrom/To`, `labeled` y `unassigned`.
El resumen también acepta `missingSerial`. Las referencias se obtienen de los
catálogos; no se interpretan nombres ambiguos como identificadores.

Ejemplo: laptops Dell sin responsable:

```json
{"companyId":"<empresa-autorizada>","filters":{"brandId":"<marca-Dell>","categoryId":"<tipo-Laptop>","unassigned":true},"page":1,"limit":30}
```

Las acciones de alta permiten `brand`, `category`, `location`, `model`,
`customField` e `item` según el contrato de intake existente. Las referencias de
un `item` se indican por `brandName`, `categoryName` y `locationName`. Ejemplo:

```json
{
  "companyId": "<empresa-autorizada>",
  "plan": {"actions": [{"kind": "item", "data": {
    "name": "Laptop Dell Latitude 5440", "brandName": "Dell",
    "categoryName": "Laptop", "locationName": "Sistemas",
    "model": "Latitude 5440", "serialNumber": "ABC123"
  }}]}
}
```

Los catálogos deben existir sin ambigüedad o estar incluidos en la propuesta.
Las ediciones admiten `name`, `status` (`available` o `maintenance`), `location`,
`serialNumber`, `assetTag`, `notes`, `model`, `purchaseDate` y `warrantyExpiry`.

## Confirmación de escrituras

1. `prepare` valida permisos, datos y duplicados y devuelve vista previa,
   propuesta completa, `proposalId`, `approvalUrl` y vigencia de diez minutos.
2. La persona abre `approvalUrl`, inicia sesión y revisa los datos en Runly.
   La API de aprobación exige una sesión web; el token MCP no puede aprobar.
3. Después de aprobar, el cliente llama a `commit` con el mismo `companyId` y
   `proposalId`. Un booleano enviado al MCP no concede autorización.
4. El servidor bloquea autorización y propuesta, revisa permisos y condiciones
   otra vez y ejecuta las operaciones existentes dentro de una transacción.
5. El resultado y consumo de la propuesta se guardan en la misma transacción.
   Reintentar durante la vigencia devuelve el resultado guardado. Si una edición
   cambió desde la preparación, se exige una propuesta nueva.

La vinculación incluye usuario, empresa, conexión OAuth, acción, argumentos y
caducidad. Los resultados de alta incluyen IDs, nombres, números de activo y
enlace de Inventario. Las operaciones escriben audit logs con actor y cliente;
los logs de transporte solo contienen herramienta, estado y correlation ID.

## Configuración y ejecución local

Los instaladores sincronizan las declaraciones de configuración automáticamente.
`setup-local.mjs` usa `.env.local.example` para completar `.env.local`; esto cubre
Supabase local/embedded y el modo CLI. `setup-external.mjs` usa
`.env.external.example`, tanto en la actualización normal como con `--up-only`.
Los bootstraps locales Bash y PowerShell descargan también la plantilla vigente.
Los wrappers `update-local.sh` y `update-external.sh` continúan utilizando estos
flujos; no ejecutan un reset para incorporar variables.

La utilidad existente `infra/installer/lib/env-compat.mjs` agrega únicamente
declaraciones faltantes y deja sus valores vacíos. Nunca copia credenciales o
hosts de ejemplo a una instalación existente. Conserva valores explícitamente
vacíos, comillas, comentarios y ajustes MCP personalizados durante la
regeneración local y de `.env` para Compose. No modifica bases, volúmenes ni
contenedores para sincronizar variables. Docker recibe MCP desde el `env_file`
correspondiente (`.env.local` o `.env.external`), no necesita duplicarlo en el
archivo `.env` usado para interpolación de Compose.

Para agregar futuras variables basta declararlas en la plantilla del entorno;
la siguiente instalación/actualización agrega las que falten sin nuevos cambios
en el sincronizador. En desarrollo del repositorio, el paso existente
`scripts/start-office-dev.mjs`, ejecutado por `pnpm dev` y `pnpm dev:tauri`,
completa las declaraciones faltantes de `.env` si existe, o de `.env.local` si es
el único archivo, usando `.env.example` y sin cambiar sus valores. Conserva
`.env.local` como capa de overrides cuando existe `.env`, para no ocultar valores
heredados con declaraciones vacías.

Las plantillas dejan MCP deshabilitado y sus URLs vacías. Una actualización no
activa MCP automáticamente. Si `RUNLY_MCP_ENABLED=true` pero faltan URLs o son
inválidas, la API omite el servicio y registra un diagnóstico con los nombres
de las variables, sin imprimir valores privados. El resto del ERP puede iniciar.

La sincronización puede verificarse sin iniciar instalaciones ni contenedores:

```bash
node --test infra/installer/lib/env-sync.test.mjs infra/installer/lib/env-compat.test.mjs infra/installer/__tests__/livekit-node-ip-env.test.js apps/api/src/mcp/__tests__/config.test.js
```

Agregar a un `.env` ignorado, conservando la configuración actual:

```dotenv
RUNLY_MCP_ENABLED=true
RUNLY_MCP_PUBLIC_URL=http://localhost:4010/mcp
RUNLY_MCP_WEB_URL=http://localhost:5173
RUNLY_MCP_ALLOWED_ORIGINS=http://localhost:6274
```

`RUNLY_MCP_WEB_URL` es el origen del frontend, sin ruta salvo `/app` opcional.
La URL MCP debe terminar exactamente en `/mcp`. Las URLs remotas exigen HTTPS;
HTTP se admite solo en localhost/loopback. Los orígenes adicionales son una lista
exacta separada por comas; nunca se usa wildcard. No se confía en Host u Origin
arbitrarios, ni en IPs enviadas mediante headers de forwarding.

En una base de desarrollo autorizada, aplicar migraciones pendientes mediante
el flujo habitual, sin reset:

```bash
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:migrate
pnpm dev:api
pnpm dev:frontend
```

Revisar primero el destino de `DIRECT_URL` antes de migrar. Deshabilitar con
`RUNLY_MCP_ENABLED=false`; no se montan las rutas MCP y la API/MirAI continúan.
Cada proceso requiere reinicio para cambiar esta configuración.

## Inspector y otros clientes

```bash
pnpm dlx @modelcontextprotocol/inspector
```

En Inspector elegir Streamable HTTP y `http://localhost:4010/mcp`. Usar el flujo
OAuth de descubrimiento y registro del cliente, autorizar en Runly y volver al
Inspector. Usar los redirects que publique ese cliente; el registro DCR los
conserva exactamente. No copiar tokens a archivos versionados.

Para Claude u otro cliente, agregar la URL como servidor MCP remoto con
Streamable HTTP y OAuth. El cliente debe admitir DCR para clientes públicos,
PKCE S256, resource indicators y abrir el consentimiento en el navegador. La
configuración específica depende del producto y versión del cliente.

En ChatGPT Web, utilizar la función de conexión privada a un servidor MCP que
esté habilitada para la cuenta o workspace e introducir la URL HTTPS pública.
Elegir DCR si la configuración ofrece métodos de identificación de cliente.
Completar el consentimiento de Runly y descubrir las herramientas. La
disponibilidad de conexiones privadas, modo desarrollador y herramientas de
escritura depende del plan, workspace y cliente. No se garantiza acceso desde
todas las cuentas. Para un servidor local, utilizar un túnel seguro compatible
o HTTPS accesible por el cliente y configurar su URL como recurso canónico;
no se instala ni inicia un túnel automáticamente.

El servidor no depende de publicar un plugin ni de aprobación pública de OpenAI.
No incluye componentes gráficos de ChatGPT. La aprobación de datos sigue en
Runly incluso si el cliente también solicita su propia confirmación.

Referencias oficiales consultadas:

- [SDK MCP y transporte](https://ts.sdk.modelcontextprotocol.io/server)
- [Autorización MCP](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector)
- [OAuth y clientes OpenAI](https://developers.openai.com/plugins/build/auth)
- [Conexión y pruebas en OpenAI](https://developers.openai.com/plugins/deploy/connect-chatgpt)

## Docker y HTTPS

La imagen API instala la dependencia desde el lockfile, copia el código y aplica
las migraciones core con su entrypoint habitual. Los ejemplos del instalador
incluyen las variables; `env_file` ya las pasa a la API. No hay un contenedor MCP
permanente adicional. En una instalación existente, actualizar las imágenes
aprobadas y agregar a su `.env` privado:

```dotenv
RUNLY_MCP_ENABLED=true
RUNLY_MCP_PUBLIC_URL=https://erp.example.com/mcp
RUNLY_MCP_WEB_URL=https://erp.example.com
RUNLY_MCP_ALLOWED_ORIGINS=
```

Al actualizar, recrear únicamente la API y el frontend si se necesita incorporar
la pantalla de aprobación o las reglas del proxy; conservar base y volúmenes:

```bash
docker compose up -d --no-deps api web
```

Los archivos Nginx del frontend y del instalador ya incluyen paso directo de
`/mcp`, `/mcp/*` y metadata OAuth hacia `api:4010`, sin la reescritura del sitio
público. Para un proxy HTTPS externo que ya tenga certificados configurados:

```nginx
location ~ ^/(mcp(?:/|$)|\.well-known/(oauth-protected-resource(?:/mcp)?|oauth-authorization-server)$) {
    proxy_pass http://127.0.0.1:4010;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header Authorization $http_authorization;
    proxy_buffering off;
    proxy_read_timeout 90s;
    client_max_body_size 64k;
}
```

Publicar también el frontend configurado. Validar Nginx con `nginx -t` antes de
recargarlo. Las cuotas distribuidas son 120 solicitudes/minuto por token,
60 anónimas/minuto por peer y 600/minuto por peer total; detrás de un proxy,
el peer corresponde al proxy. El límite de cuerpo es 64 KiB. En instalaciones
con muchos usuarios agregar controles de borde adecuados; los headers
`X-Forwarded-For` arbitrarios no cambian la cuota de la API.

No se desplegó esta implementación a servidores remotos ni se publicaron
imágenes Docker como parte del desarrollo.

## Revocación y diagnóstico

Abrir `/app/mcp`, localizar la aplicación y elegir **Revocar**. También existe
`POST /mcp/oauth/revoke` conforme a OAuth, con token y client ID. Las conexiones
no se comparten entre instancias: cada URL tiene sus clientes y autorizaciones.

| Síntoma | Revisión |
| --- | --- |
| `401 invalid_token` | Token MCP vigente, recurso correcto y conexión activa; no usar token web |
| `403 insufficient_scope` | Autorizar una conexión nueva con los scopes necesarios |
| `company_not_granted` | Empresa incluida en el consentimiento de esta conexión |
| `company_not_member` / `membership_revoked` | Membresía, perfil, rol y empresa activos |
| `permission_denied` / `module_unavailable` | Permisos actuales y módulo habilitado por empresa |
| `approval_required` | Abrir approvalUrl y aprobar con sesión web |
| `proposal_stale` | Volver a preparar después de cambios o conflictos |
| `invalid_grant` | Código/refresh/propuesta vencido, usado o revocado; reautorizar cuando proceda |
| `invalid_origin` / `invalid_host` | URLs canónicas, Host conservado y lista exacta de orígenes |
| `429` | Respetar `Retry-After`; revisar cuotas de API y proxy |
| `406` / `415` | Headers MCP Accept y Content-Type; utilizar el SDK oficial |
| `500` al habilitar | Migración core aplicada y cliente Prisma regenerado; revisar correlation ID |

## Contrato inicial RME3

Sin `manifest.mcp` no hay exposición automática. El contrato es opcional y no
modifica manifiestos existentes. Ejemplo de descubrimiento:

```js
mcp: {
  version: 1,
  entities: [{
    key: 'equipment',
    permission: 'custom.example.equipment.read',
    fields: {
      name: { type: 'string', description: 'Nombre del equipo' },
      year: { type: 'integer', nullable: true },
    },
  }],
}
```

Se valida estrictamente al descubrir, se filtran entidades según permisos y se
requiere módulo habilitado en la empresa. Tipos: string, number, integer y
boolean; máximo 30 entidades. El esquema publicado solo incluye los campos
declarados. Esta versión devuelve `discoveryOnly: true` y `operations: []`:
no ejecuta SQL ni lecturas genéricas o escrituras de módulos externos. Las
relaciones pueden seguir representadas por campos identificadores declarados;
su navegación y acciones necesitan contratos futuros de permisos y resolución.
La escritura RME3 universal queda reservada hasta contar con contratos de
acciones, aprobación e integridad probados por módulo.

## Pruebas reproducibles

```bash
pnpm test:mcp
```

Requiere Docker y la imagen `postgres:18-alpine`. Crea una base vacía en tmpfs,
aplica el esquema y prueba la migración aditiva, inicia Hono en un puerto libre,
usa el cliente oficial y detiene únicamente su contenedor temporal al terminar.
No usa `DATABASE_URL` ni `DIRECT_URL` del workspace para escribir datos. La
integración usa identidad web firmada de prueba con el middleware real;
las operaciones ERP, OAuth, HTTP, permisos y transacciones usan PostgreSQL real.
No representa una prueba manual de inicio de sesión contra el proveedor de
identidad de una instalación existente.

Para incluir Inspector CLI:

```powershell
$env:RUNLY_MCP_TEST_INSPECTOR='true'
pnpm test:mcp
```

La suite cubre descubrimiento, SDK y transporte, PKCE, códigos de un solo uso,
scopes, audience, expiración, refresh/replay, revocación, empresas, catálogos,
altas/ediciones reales, concurrencia idempotente, propuestas obsoletas, rollback,
permisos y RME3 opt-in. Los clientes comerciales se configuran por separado;
una prueba con Inspector no acredita acceso a una cuenta ChatGPT o Claude.
