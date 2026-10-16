# Verificación local de Runly MCP

Verificación del 16 de octubre de 2026. Implementación y configuración descritas
en [RUNLY_MCP.md](RUNLY_MCP.md).

## Ampliación de módulos oficiales

La [entrega transversal](RUNLY_MCP_OFFICIAL_MODULES.md) y su
[catálogo generado](RUNLY_MCP_CATALOG.md) amplían la base descrita abajo.

| Comprobación final | Resultado |
| --- | --- |
| `RUNLY_MCP_TEST_INSPECTOR=true pnpm test:mcp` | 118 aprobadas, 0 fallos, 0 omitidas; PostgreSQL 18 efímero, operaciones de negocio reales, OAuth propio de Inspector 2.11.0, 48 herramientas y regresión de las 12 anteriores |
| Servicios compartidos de dominios | 739 pruebas: 738 aprobadas, 1 omitida y 0 fallos; la omitida es una integración Files que requiere su propio entorno PostgreSQL |
| Navegador MCP + runtimeConfig | 3 aprobadas; origen del frontend, consentir/rechazar/revocar, propuestas y confirmación sensible independiente por propuesta |
| `pnpm lint` | Correcto |
| `pnpm check:company-scope` | Correcto |
| `pnpm build` | Correcto; workspace y build local del host Windows/instalador, sin publicar assets |
| `pnpm --filter @runly/desktop build:web` | Correcto; advertencia de tamaño de chunks existente |
| React Doctor | 86/100, sin errores; 15 avisos de mantenimiento/performance (API `.strict()` compatible con Zod 4, búsqueda y escrituras secuenciales en la misma transacción) |
| `pnpm check:privacy` | Sin hallazgos |
| `pnpm check:secrets` | Sin hallazgos; Gitleaks sobre snapshot del árbol público con redacción activada |

Selección reproducible de pruebas de los servicios compartidos (PowerShell):

```powershell
$domainTests = @(rg --files apps/api/src/routes -g '*.test.js' | Where-Object { $_ -match '[/\\](hr|fleet|notes|pfm|ledger|projects|calendar|contacts|purchases|canvas|attendance)[/\\]__tests__[/\\]' -and $_ -notmatch '(integration|e2e|realtime)' })
$sharedTests = @(rg --files apps/api/src/services/__tests__ -g '*.test.js' | Where-Object { $_ -match '[/\\](hr-service|files-|contacts-service|purchases-core|purchase-(policies|numbering|relations|receipts))' })
node --test --test-concurrency=4 @domainTests @sharedTests apps/api/src/routes/chat/__tests__/chat-service.test.js
```

Los conteos no se suman con las comprobaciones históricas: son selecciones con
posibles intersecciones. No se probó una cuenta comercial de ChatGPT ni se tocó
el VPS. No hay migraciones nuevas para esta ampliación; los requisitos originales
de activación y URLs siguen aplicando a quien todavía no haya instalado MCP.

## Resultados de la implementación inicial (histórico)

| Comprobación | Resultado |
| --- | --- |
| `RUNLY_MCP_TEST_INSPECTOR=true pnpm test:mcp` | 25 pruebas aprobadas, sin omisiones; PostgreSQL temporal, Hono, SDK e Inspector CLI 2.11.0 con OAuth propio |
| Selección de Inventario/MirAI mediante `node --test` | 80 pruebas aprobadas |
| Selección de autenticación, contexto empresarial, módulos y manifiestos | 61 pruebas aprobadas |
| `pnpm --filter @runly/module-engine test` | 147 aprobadas, 1 omitida, 0 fallos |
| `pnpm lint` | Aprobado |
| `pnpm build` | Aprobado, incluye host nativo Windows; no se publicó el instalador |
| `pnpm --filter @runly/desktop build:web` | Aprobado; advertencia de tamaños de bundles |
| `pnpm exec prisma validate` y `pnpm db:generate` | Aprobados |
| `pnpm check:privacy` | Sin hallazgos |
| `pnpm check:company-scope` | Aprobado después de revisar las excepciones concretas existentes |
| `pnpm check:secrets` con Gitleaks 8.30.1 | Sin hallazgos |
| `nginx -t` para ambos archivos del frontend/instalador | Aprobados en contenedores temporales |
| React Doctor | 84/100; sin incidencias informadas en los archivos revisados |

Los controles iniciales encontraron una IP ficticia fuera de los rangos de
documentación en una prueba de Bluetooth y once usos de fetch aún no registrados
en el verificador empresarial. La IP se sustituyó por RFC 5737. Se revisaron los
once archivos: eran transportes con empresa explícita, descargas firmadas o
capacidades públicas. Se agregaron excepciones por archivo con su motivo, sin
excluir carpetas ni relajar el aislamiento de la API.

La suite de Inventario/MirAI seleccionada:

```bash
node --test apps/api/src/routes/inventory/__tests__/inventory-mirai.test.js apps/api/src/services/__tests__/inventory-chat-actions.test.js apps/api/src/services/__tests__/inventory-service.test.js apps/api/src/services/__tests__/inventory-tenant-isolation.test.js apps/api/src/services/__tests__/inventory-access-query.test.js apps/api/src/services/__tests__/inventory-search-service.test.js
```

La selección de identidad y módulos:

```bash
node --test apps/api/src/services/__tests__/auth-middleware.test.js apps/api/src/services/__tests__/auth-login-service.test.js apps/api/src/lib/__tests__/tenant-context.test.js apps/api/src/services/__tests__/company-module-service.test.js packages/module-engine/src/__tests__/define-module.test.js
```

Los grupos se superponen parcialmente; no representan un conteo único de toda
la suite del monorepo.

## Evidencia funcional

- Descubrimiento OAuth, DCR, PKCE, consentimiento y canje con el proveedor del
  SDK oficial; posterior consulta autenticada contra el endpoint HTTP.
- Inspector CLI 2.11.0 completó DCR, PKCE, autorización y canje de tokens sin
  bearer preinyectado; ejecutó `runly_whoami` y listó las 12 herramientas.
  Metadatos reales capturados y alcance descritos en la
  [auditoría OAuth](RUNLY_MCP_OAUTH_COMPATIBILITY.md).
- Una alta aprobada creó un activo real con catálogos, serie, folio y audit log.
  Dos commits simultáneos produjeron un solo activo y el mismo resultado.
- La ruta HTTP actual de Inventario pudo leer el activo creado por MCP.
- Una edición aprobada modificó el registro y la ruta HTTP reflejó el cambio.
- Un fallo después de iniciar una propuesta con catálogo y campo personalizado
  revirtió todos los registros de esa transacción.
- Se rechazaron empresa ajena, registro ajeno, permisos retirados, módulo
  deshabilitado, tokens incorrectos, scopes insuficientes, propuestas vencidas
  u obsoletas, aprobación con token MCP y reutilización de refresh tokens.
- Se verificaron validación de entradas, versiones/headers de transporte,
  orígenes, cuotas, cuerpo máximo, RLS y ausencia de privilegios anónimos.
- RME3 permaneció oculto sin opt-in o habilitación por empresa; solo se
  descubrieron entidades con permiso y nunca se crearon herramientas CRUD.

## Alcance del entorno

Las escrituras se realizaron en PostgreSQL 18 con datos sintéticos de desarrollo
y almacenamiento temporal. La sesión web de prueba utiliza un JWT firmado de
fixture a través del middleware real. No se probó un inicio de sesión manual
contra Supabase de una instalación existente ni una cuenta comercial de ChatGPT
o Claude. Inspector y el SDK no requieren esas cuentas.

La base configurada en el workspace no recibió migraciones ni datos de prueba.
No se desplegaron VPS, imágenes Docker ni releases. La habilitación en una
instalación existente requiere aplicar la migración aditiva, configurar las URLs
y activar la variable MCP según la guía; no se cambiaron sus `.env` privados.

La escritura universal RME3 y el acceso genérico a sus registros permanecen fuera
del contrato inicial. Los clientes y planes comerciales pueden limitar qué
herramientas permiten conectar o ejecutar. La suite no acredita esas opciones
de cuenta ni reemplaza la validación del despliegue HTTPS de cada instancia.
