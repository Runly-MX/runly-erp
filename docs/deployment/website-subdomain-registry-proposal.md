# Registro global de subdominios de Website

## Estado

| Elemento | Estado |
|---|---|
| Arquitectura centralizada para múltiples instalaciones | Dirección aprobada |
| Núcleo del registro (servicio, API firmada, operador, auditoría) | **Implementado y probado en laboratorio**, en el Developer Hub (rama `website-subdomain-registry`) |
| Integración Website (reservar, comprobar, activar, liberar, estado, sincronía) | **Implementada y probada en laboratorio** (rama `website-registry`) |
| Seguridad del registro (rotación de claves, revocación, límites por IP e instalación, anti-repetición, auditoría sin secretos) | **Implementada y probada en laboratorio** (Hub) |
| Runly Edge (enrutamiento público hostname -> instalación -> release) | **Implementado y probado en laboratorio** (Hub, `apps/edge`) |
| Dos instalaciones ERP reales con registro y Edge | **Probado en laboratorio** (`pnpm test:website:multi`, 10 comprobaciones) |
| Despliegue del registro y del Edge, DNS wildcard, certificados reales | **No autorizado** y no realizado |
| Dominio registrable independiente para ZIP | Aprobado conceptualmente; sin seleccionar ni comprar |

Objetivo vigente: subdominios automáticos `<slug>.sites.runly.mx` para empresas de múltiples instalaciones de Runly, con unicidad global. La distribución real todavía no funciona: faltan el despliegue del registro, el edge y DNS/TLS (ver "Dependencias y bloqueos").

## Garantías de propagación y de disponibilidad (política explícita)

| Situación | Garantía |
|---|---|
| Registro alcanzable | Una suspensión, revocación o cambio de readiness llega al Edge en `EDGE_CACHE_TTL_MS` (30 s) y al espejo local de cada instalación en `RUNLY_REGISTRY_SYNC_MS` (60 s, antes 5 min). |
| Registro inaccesible | El Edge sigue sirviendo solo rutas que el registro confirmó como servidas, como máximo `EDGE_MAX_STALE_MS` (15 min); después responde 503. Nunca sirve desde datos viejos un nombre que no estaba servido. Cada instalación sirve los nombres gestionados por el registro hasta `RUNLY_REGISTRY_MAX_STALE_MS` (24 h) desde la última sincronía completa; después los trata como inexistentes (404) hasta volver a sincronizar. |
| Nombres históricos (`registry_managed=false`) | No dependen del registro nunca. |
| Reservas nuevas con el registro caído | Fallan con 503 `registry_unavailable`; nunca se asignan localmente. |
| Silencio de una instalación | No libera ningún nombre. |

Así ninguna decisión de seguridad queda obsoleta indefinidamente, y un corte breve del registro no tumba sitios legítimos.

## Dónde vive el registro

En el **Runly Developer Hub**, el servicio central que ya existe (Hono, PostgreSQL, administración de plataforma con `hub.is_platform_admin`, migraciones y respaldo propios). No se crea otro sistema. Un registro dentro de una instalación no sería global, y la unicidad local fue precisamente el defecto anterior (`reserve()` solo era único en cada base).

Archivos en el Hub: `supabase/migrations/20261103000000_subdomain_registry.sql`, `packages/contracts/registry.js` (contrato compartido), `apps/api/src/services/registry/{service,routes}.js`, montaje y rutas de operador en `apps/api/src/app.js`, pruebas en `tests/registry/` (`pnpm test:registry`) y `scripts/registry-lab-server.mjs`.

## Modelo

Tablas `hub.registry_*`: `namespaces` (raíz, `ready`, `executable_content`), `installations` (clave pública Ed25519, estado), `names` (hostname único global, instalación, referencias opacas de empresa y sitio, estado, versión), `requests` (idempotencia), `nonces` (anti-replay), `reserved` (nombres reservados por operadores) y `audit` (solo anexión). Restricciones en la base de datos:

- `UNIQUE(hostname)` decide cualquier carrera; ninguna lógica de aplicación la sustituye.
- Los nombres no se borran nunca (disparador); la identidad de un nombre es inmutable.
- La auditoría no admite UPDATE ni DELETE.
- Un namespace bajo `runly.mx` no puede marcarse `executable_content` (CHECK): el contenido ejecutable no confiable no puede vivir allí.
- El rol de ejecución no tiene DELETE sobre nombres ni auditoría; RLS activo.

Estados: `pending` (reservado, aún no sirve), `assigned` (activo), `suspended` (reversible por operador), `revoked` (terminal para instalaciones), `quarantined` (liberado; 90 días reservado a su titular).

## API de instalaciones (`/registry/v1`)

Autenticación: `X-Runly-Installation`, `X-Runly-Timestamp` (±300 s), `X-Runly-Nonce` (un solo uso) y `X-Runly-Signature` (Ed25519 sobre método, ruta con consulta, marca de tiempo, nonce, SHA-256 del cuerpo y clave de idempotencia). Todo fallo de autenticación responde igual (401 `REGISTRY_AUTH_FAILED`). Las mutaciones exigen `Idempotency-Key`: misma clave y misma carga repiten la respuesta; misma clave con otra carga es 422.

| Operación | Efecto |
|---|---|
| `GET /availability?namespace&slug` | Disponibilidad; nunca revela quién ocupa un nombre |
| `POST /names` | Reserva `pending` con referencias opacas; re-reservar el mismo sitio es idempotente |
| `GET /names`, `GET /names/:hostname` | Solo nombres propios; ajenos son 404 |
| `POST /names/:hostname/activate` | `pending → assigned` si el namespace está listo (409 `NAMESPACE_NOT_READY` si no) |
| `POST /names/:hostname/release` | Cuarentena de 90 días; no aplica a nombres suspendidos o revocados |
| `POST /names/:hostname/rename` | Atómico: reserva el nuevo y deja el anterior en cuarentena con redirección |

Operador (`/api/v1/admin/registry/*`, administrador de plataforma): enrolar instalaciones, suspender o revocar una instalación (revocar suspende sus nombres), marcar un namespace listo, suspender, revocar, restaurar o reasignar un nombre con motivo obligatorio, añadir nombres reservados, ver nombres y auditoría.

Reglas de nombre (contrato compartido): 3 a 50 caracteres `[a-z0-9-]`, sin `--` ni punycode, lista reservada y prefijos del código, marcas protegidas con look-alikes (`str1pe`, `runlyshop`) y reservados añadidos por operadores. Límites por instalación: 500 nombres y 60 reservas por hora (configurables).

## Integración Website

- `POST /website/sites/:siteId/domains` reserva; `GET .../domains/availability?slug=`, `GET .../domains/:hostname`, `POST .../domains/:hostname/activate` y `.../release`. Permiso `website.domains.manage` (estado: `website.site.read`). SDK, cliente de escritorio y la pantalla Dominios incluyen comprobar disponibilidad, reservar, ver estado y activar.
- Sin registro configurado, un namespace real responde 409 `registry_required`; solo los `.test` de laboratorio conservan la asignación local anterior. Ninguna instalación finge ser global.
- La fila local de `website_domain` conserva la titularidad (inmutable) y refleja el estado del registro (`registry_managed`). Solo las filas gestionadas por el registro pueden cambiar `state` y `ready`; las históricas siguen siendo de solo anexión (migración `20261219120000`).
- Sincronía (`RUNLY_REGISTRY_SYNC_MS`, 5 min por defecto): copia suspensiones, revocaciones y disponibilidad del namespace. Solo actualiza filas que ya existen: no crea titularidad, no libera ni borra.
- Variables: `RUNLY_REGISTRY_URL`, `RUNLY_INSTALLATION_ID`, `RUNLY_INSTALLATION_PRIVATE_KEY`; la llave se genera con `node scripts/registry-installation-key.mjs --env-file .env.external` (no se imprime; se muestra la pública para enrolar).

## Claves, rotación y compromiso

Cada instalación puede tener hasta dos claves Ed25519 vivas. La rotación (`node scripts/registry-installation-key.mjs --env-file .env.external --rotate`) la firma una clave vigente, el registro acepta la nueva y mantiene la anterior durante una ventana de gracia (24 h por defecto, 60 s a 7 días); se reinicia la API con la nueva y luego `--revoke-previous` revoca la anterior. Una clave comprometida la revoca un operador al instante (incluso dentro de su gracia); si no queda ninguna clave válida, el operador verifica al titular por otro canal y enrola una nueva. La auditoría identifica la clave firmante por huella de 16 hex y nunca contiene claves ni firmas. La llave privada vive en el archivo de entorno del instalador (modo 600) o, preferentemente, en un archivo (`RUNLY_INSTALLATION_PRIVATE_KEY_FILE`) montado como secreto para que no quede en el entorno del contenedor; nunca se imprime, y una configuración inválida desactiva los subdominios sin impedir el arranque del ERP.

## Runly Edge

Componente de enrutamiento público, en el Hub (`apps/edge`): comparte contrato, límites y despliegue con el registro y no añade base de datos ni servicio de otra categoría. Resuelve `hostname -> instalación -> origen confiable`; cada instalación resuelve empresa, sitio y release activo. Solo usa el `Host` de la conexión (descarta `X-Forwarded-*`, `Forwarded`, `Authorization`), exige un solo `Host`, forma de origen y `<slug>.<namespace>`, y con TLS exige que el SNI coincida. El destino es únicamente el `origin_url` que un operador enroló (sin rutas ni credenciales; los destinos privados, loopback o de metadatos se rechazan, también por reenlace de DNS; no sigue redirecciones ni revela el origen). Cachea las decisiones con TTL, tolera la caída del registro con la política acotada anterior, aísla instalaciones desconectadas con un 502 genérico y un circuito breve, y registra sin consultas, cabeceras ni orígenes. Detalle en `docs/edge.md` del Hub.

## Contrato de resolución

`hostname → instalación → empresa → sitio → release`: el hostname es el de la conexión (`Host`; las cabeceras reenviadas se ignoran). El registro decide qué instalación es titular; la instalación resuelve empresa, sitio y release activo con su fila local. Un hostname no registrado, suspendido, revocado, liberado o sin infraestructura lista responde 404. Servir un sitio publicado **no llama al registro**: una caída del registro no lo afecta, y el silencio nunca libera un nombre.

## Aislamiento

`*.sites.runly.mx` es el objetivo comercial y puede ser `RUNLY_WEBSITE_NAMESPACE_ROOT`. No se autoriza servir allí contenido ejecutable no confiable, y no se cambió ninguna validación: `website-content-isolation.js` sigue rechazando raíces de contenido o vista previa bajo `runly.mx` o que comparten dominio registrable con el ERP. ZIP y vista previa usarán el dominio independiente aún por seleccionar, con comodín y certificado propios.

## Pruebas

Seguridad del registro (Hub, `pnpm test:registry`): 21 pruebas, incluidas rotación sin interrupción, revocación de una clave comprometida y recuperación, repetición de peticiones también tras una rotación, auditoría sin material de claves, tipos de principal (el Edge solo resuelve y nunca recibe empresa ni sitio) y límites por IP e instalación con proxies de confianza. Edge (Hub, `pnpm test:edge`): 11 pruebas, incluidas SSRF y reenlace de DNS, redirecciones, TLS con un certificado local, política de caducidad acotada e instalaciones desconectadas. Laboratorio multiinstalación (ERP, `pnpm test:website:multi`): dos ERP reales y desechables (cada uno con su Supabase/PostgreSQL y su API), un registro y el Edge; 10 comprobaciones: carreras reales por el mismo nombre entre ambas instalaciones, asociación a su sitio, resolución por el Edge, publicación, actualización y rollback, aislamiento y cabeceras falsificadas, rotación de clave en vivo, desconexión de una instalación, suspensión y restauración, caída del registro con recuperación, y revocación de una instalación.

Núcleo (Hub, 13 de las 21 pruebas de `pnpm test:registry`, PostgreSQL desechable con el rol real `hub_runtime`), entre ellas 30 rondas de carrera entre dos instalaciones con un único ganador, idempotencia concurrente, aislamiento entre instalaciones, ciclo completo, renombrado atómico, acciones de operador, auditoría inmutable, silencio sin liberación y la regla de `runly.mx`.

ERP (`pnpm test:website:registry`, API real con su laboratorio, registro real y una segunda instalación simulada con su propia llave): 11 comprobaciones: reserva pendiente que no sirve, 15 carreras REST contra cliente con un solo ganador y sin fila local para el perdedor, aislamiento entre instalaciones, empresas y lectores, idempotencia, validación, activación y resolución por hostname con cabeceras falsificadas, hostnames históricos intactos, caída y reinicio del registro con sitios sirviendo, suspensión y restauración por sincronía (incluida la disponibilidad del namespace), liberación y revocación de instalación. La segunda instalación es solo un cliente firmado, no un ERP completo.

## Dependencias y bloqueos

1. Desplegar el Hub con las migraciones y las rutas, y el Edge (no desplegados).
2. Un operador de plataforma debe enrolar cada instalación (clave pública) y marcar `ready` el namespace; hoy no hay interfaz de operador, solo API.
3. DNS wildcard y certificado wildcard reales para `*.sites.runly.mx` apuntando al Edge, y la plataforma donde correrá (el Edge está implementado y probado solo en laboratorio, con un certificado local). Cada instalación servida debe exponer su gateway público con una URL de origen estable que un operador registre.
4. Dominio independiente con wildcard y certificado para ZIP y vista previa.
5. Custodia operativa de las llaves (copias de seguridad cifradas, procedimiento de recuperación) y una interfaz para operadores (hoy solo API).
6. Pendiente de diseño: redirecciones 301 de nombres renombrados en el Edge, solicitud a la Public Suffix List, límites por instancia del Hub cuando haya varias réplicas (hoy son por proceso), y otros lectores locales de `website_domain` (formularios, vista previa) que no aplican la caducidad acotada.
