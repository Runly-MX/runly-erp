# OAuth: compatibilidad con MCP Inspector 2.11.0

## Causa y reproducción

El esquema de registro rechazaba `application_type` como clave desconocida.
La regresión `oauth.test.js` falló antes de corregirlo con el payload publicado
de Inspector. Se verificó el paquete npm y el
[proveedor del tag 2.11.0](https://github.com/modelcontextprotocol/inspector/blob/2.11.0/core/auth/providers.ts),
commit `074b8108f340590268f2900741403755e923a11c`.

Sus metadatos iniciales son los siguientes. Al descubrir Runly, Inspector envía
los scopes anunciados por el recurso; el callback usa un puerto efímero en la prueba.

```json
{
  "redirect_uris": ["http://127.0.0.1:6276/oauth/callback"],
  "token_endpoint_auth_method": "none",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "client_name": "MCP Inspector",
  "client_uri": "https://github.com/modelcontextprotocol/inspector",
  "scope": "",
  "application_type": "native"
}
```

La prueba HTTP ejecuta el CLI real fijado a `@modelcontextprotocol/inspector@2.11.0`
y captura su registro. Comprueba igualdad con estos campos, sustituyendo solo
el callback y el scope descubierto. No inyecta tokens ni sustituye el cliente,
SDK, DCR, PKCE o intercambio de tokens de Inspector.

## Contrato auditado

Referencias: [RFC 7591, secciones 2 y 3](https://www.rfc-editor.org/rfc/rfc7591),
[RFC 6749, secciones 3 y 6](https://www.rfc-editor.org/rfc/rfc6749),
[MCP 2026-07-28: autorización](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
y [registro / SEP-837](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration).

| Área | Comportamiento |
| --- | --- |
| `application_type` | Acepta `native` y `web`; opcional para clientes anteriores. Otros valores producen `invalid_client_metadata`. |
| Metadatos RFC 7591 | Valida nombres, redirects, método de autenticación, grants, response types, scope, contacts, URLs informativas, software ID y versión. Límites de longitud y cantidad. |
| Extensiones | RFC 7591 exige ignorar metadatos desconocidos. Se proyectan únicamente campos reconocidos antes de aplicar el esquema estricto. Los descartados no se guardan, devuelven, descargan ni convierten en permisos. |
| Claves/identidad externas | `jwks`, `jwks_uri`, `software_statement`, metadatos localizados y extensiones no implementadas se ignoran. No habilitan autenticación JWT ni clientes confidenciales. El único método anunciado y admitido es `none`. |
| Grants | Solo código con PKCE S256, response type `code` y refresh opcional. Rechaza combinaciones inconsistentes y grants duplicados. Omitir grants usa `authorization_code`, predeterminado de RFC 7591. |
| Redirects | HTTPS o HTTP exclusivamente loopback; comparación exacta con el registro. Rechaza fragmentos, credenciales, wildcard y caracteres de control. El tipo de aplicación no relaja esa política. |
| Errores DCR | HTTP 400, `invalid_client_metadata` o `invalid_redirect_uri`. Sin valores del cliente en respuesta ni diagnósticos. |
| Autorización | Ignora extensiones OAuth desconocidas, incluido `prompt`; siempre exige consentimiento web. Sin scope usa `runly:read`. Valida scopes conocidos y el límite declarado por el cliente. |
| Canje | Ignora extensiones desconocidas; valida cliente, código, redirect, PKCE, uso único y recurso exacto. Recurso incorrecto: `invalid_target`; grant no soportado: `unsupported_grant_type`. |
| Refresh | Solo se emite si el cliente lo declaró. Rotación, revocación por reutilización y scope opcional: permite reducir, nunca ampliar los scopes del refresh anterior. Cada access token conserva sus propios scopes efectivos. |
| Parámetros HTTP | Duplicados rechazados; vacíos tratados como omitidos en query/form. DCR exige JSON, token/revoke formulario. Respuestas con `Cache-Control: no-store` y `Pragma: no-cache`. |
| Diagnóstico interno | `mcp.http` conserva correlation ID, estado y código; validación añade hasta 20 pares campo/tipo de fallo. Sin mensajes crudos de Zod, valores, headers, códigos OAuth, verificadores, tokens o nombres de extensiones desconocidas. |

Runly es un servidor OAuth para su recurso MCP, sin proveedor OIDC. No anuncia
`offline_access`, autenticación JWT, esquemas privados de callback ni CIMD.
La especificación actual conserva DCR aunque favorece CIMD; este cambio mantiene
el mecanismo anunciado por Runly. No certifica todas las extensiones OAuth/OIDC.
`prompt=none` no elimina el consentimiento obligatorio.

Grants/clientes existentes conservan su estado. Registros antiguos con refresh
declarado continúan funcionando. Los tokens anteriores a este cambio usan los
scopes originales del grant. No hay cambio de esquema ni migración nueva.

## Validación local

```bash
RUNLY_MCP_TEST_INSPECTOR=true pnpm test:mcp
pnpm lint
pnpm check:privacy
pnpm check:secrets
```

En PowerShell, establecer `$env:RUNLY_MCP_TEST_INSPECTOR='true'` antes de ejecutar
`pnpm test:mcp`. Gitleaks debe estar disponible en PATH para el último control.

La suite usa PostgreSQL temporal aislado, API HTTP real e Inspector con almacén
OAuth temporal propio. Automatiza el navegador: visita autorización, aprueba
consentimiento con una identidad sintética a través del middleware web real y
entrega el callback al listener de Inspector. Un adaptador de terminal permite
su modo interactivo en CI con apertura de navegador desactivada. Después ejecuta
`runly_whoami` y comprueba las 12 herramientas usando las credenciales obtenidas
por Inspector. Incluye SDK oficial, clientes sin refresh, reducción de scopes,
PKCE incorrecto, replay, aislamiento, permisos y diagnósticos sanitizados.

No representa una sesión manual contra el login Supabase de una instancia ni
una prueba de su proxy HTTPS. No se accede al VPS durante esta validación.

## Actualización de una instancia existente

1. Incorporar este commit en la distribución API. Desde código fuente:
   `git pull --ff-only origin main`, `pnpm install --frozen-lockfile` y reiniciar
   el proceso API mediante el supervisor habitual.
2. Para Docker, primero debe existir una imagen API con este commit, construida
   y publicada por el proceso de release autorizado. Este trabajo no construye
   ni publica imágenes. Actualizar scripts o descargar una imagen anterior no
   incorpora la corrección de OAuth.
3. Cuando esa imagen esté disponible, ejecutar el actualizador habitual desde
   la carpeta de instalación: `bash update-local.sh` en local/embedded o
   `bash update-external.sh` en external. Conservan archivos de entorno, datos
   y volúmenes y sincronizan variables faltantes con el mecanismo existente.
   No reinicializar ni resetear la instalación. Este parche no agrega variables
   ni exige migraciones adicionales.
4. En Inspector 2.11.0, conectar a la URL HTTPS configurada de `/mcp` usando
   Streamable HTTP y OAuth. Si quedó un registro incompleto, limpiar su estado
   OAuth para ese servidor y registrar de nuevo. Mantener el origen real de
   Inspector permitido en la configuración existente al usar el cliente web.
5. Autorizar con una sesión web válida, seleccionar empresas y aprobar.
   Verificar `tools/list` (12 herramientas) y `tools/call` para `runly_whoami`
   con argumentos `{}`. Ante un fallo, buscar el correlation ID en el log API;
   los detalles de validación permanecen internos.

No se ejecutó este procedimiento sobre una instancia existente.
