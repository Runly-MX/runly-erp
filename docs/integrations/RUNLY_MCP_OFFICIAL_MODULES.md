# MCP de módulos oficiales

El registro de `apps/api/src/mcp/registry.js` declara herramientas, esquemas Zod,
scopes, políticas de aprobación y operaciones por dominio. `adapters/` construye
adaptadores a servicios y capacidades compartidas con HTTP/MirAI. El transporte
en `server.js` consume el registro; no conoce la lógica de cada módulo.
Inventario conserva contratos, nombres, propuestas y resultados anteriores.

El [catálogo generado](RUNLY_MCP_CATALOG.md) detalla herramientas, operaciones y
permisos. Hay 59 herramientas en total (el conteo exacto está fijado en `domain-contracts.test.js`). Los
dominios con escritura publican tres herramientas semánticas por módulo:
`runly_<dominio>_query`, `runly_<dominio>_prepare`, `runly_<dominio>_commit`.
Las dos primeras reciben `companyId` y `request: { operation, input }`; el commit
recibe `companyId` y `proposalId`. `runly_module_schema` proporciona los esquemas
de operaciones que la persona puede ejecutar. `runly_modules_list` devuelve un
resumen sin repetir esquemas completos. Los resultados de los dominios nuevos
usan `{ data: { operation, result } }`.

## Consentimiento y seguridad

Los dominios con escritura tienen scopes `<dominio>:read` y `<dominio>:write`;
los de solo consulta únicamente `<dominio>:read`. `runly:read` no
concede acceso a datos de otro dominio. Los tokens anteriores conservan sus
scopes y las doce herramientas base. Refresh no permite ampliar scopes.
Para habilitar nuevos dominios, reconectar ChatGPT/Inspector y aprobar un nuevo
consentimiento. Si el cliente conserva un registro DCR limitado a los scopes
anteriores, borrar ese registro para esta conexión y registrar de nuevo.

El módulo debe estar instalado, habilitado para la empresa y accesible por el
permiso de su manifest, además de los permisos de la operación. Se admiten claves
legacy `atlas.*` equivalentes sin migrarlas. Cada servicio conserva sus reglas
de propiedad, acceso compartido y relaciones. Los recursos privados no pasan
a ser públicos por pertenecer a la empresa.

Las propuestas duran diez minutos y fijan módulo, empresa, usuario, conexión,
operación, datos, relaciones resueltas y efectos. El motor revalida el recurso,
la propuesta y los permisos al revisar, aprobar y ejecutar. Un rechazo es
terminal. Si un recurso o relación cambia antes de que la persona decida (por
ejemplo, otra propuesta del mismo lote cambió al supervisor o al registro
destino de un adjunto), la revisión vuelve a resolver la misma entrada del
asistente, guarda y muestra los valores actuales con un aviso, y eso es lo que
se aprueba. Un cambio posterior a la aprobación o al rechazo sigue invalidando
la propuesta: hay que prepararla y aprobarla de nuevo.
Se bloquean autorización y propuesta; el commit usa transacción serializable.
Solo se reintentan conflictos de serialización cuya transacción fue revertida.
No se reintentan fallos arbitrarios. Altas financieras, presupuestos y cambios
explícitos de cuenta vinculada requieren una confirmación adicional en la web.
Cada adaptador con escrituras declara `sensitive` (booleano o función por
operación); el registro rechaza adaptadores que no lo declaren.
También se exige en Proyectos y Calendario: sus efectos existentes pueden
encolar notificaciones en el ERP, correo y web push según las preferencias.
La web muestra los efectos y los destinatarios resueltos antes de aprobar;
MCP no entrega notificaciones directamente ni usa proveedores externos.
Repetir prepare con los mismos datos y versión devuelve la misma propuesta;
repetir commit devuelve el mismo resultado y no duplica escrituras ni auditoría.

## Límites de dominio

- RH acepta `userProfileId` explícito y muestra cuenta, ID y correo al aprobar.
  Busca duplicados de empleado y valida empresa, elegibilidad, jerarquía y
  relaciones mediante `hr-service`. No resuelve identidades ambiguas por nombre.
- Flota permite vehículos y pólizas mediante sus servicios, además de consultas
  de conductores, documentos y reportes operativos paginados. El contrato actual
  no modela kilometraje editable ni un plan general de mantenimiento: no se
  inventan campos u operaciones. Las consultas reflejan estados y seguros reales.
- Notas permite búsqueda/contenido, carpetas/etiquetas, creación y cambio de
  título/carpeta. No expone reemplazo ni append de contenido existente: el
  servicio Yjs fusiona updates binarios, pero falta un contrato semántico que
  convierta texto en una edición ProseMirror y sincronice sus espejos HTML/texto.
  No se descartan estados colaborativos para simular esa función.
- PFM separa carteras accesibles y presupuestos propios. No permite usar carteras
  que reflejan cuentas Ledger para registrar movimientos nativos. Presupuestos
  exigen categoría propia y una cartera accesible, si se especifica.
- Ledger usa acceso de lectura/escritura de cada cuenta, categorías y servicios
  de movimientos. No expone importación con IA, pagos ni transferencias externas.
- Proyectos conserva roles individuales de proyecto y validación de asignados;
  no basta con un permiso empresarial. La creación/edición de proyectos y tareas
  pasa por sus servicios y efectos internos existentes.
- Calendario permite agenda interna, creación y reprogramación con comprobación
  de propietario/EDITOR/MANAGER. Agregar participantes a eventos existentes
  exige propietario/MANAGER, IDs explícitos de miembros activos y confirmación
  de destinatarios. Se reutiliza el mismo servicio y efecto de invitación HTTP.
  No se expone eliminación de participantes ni RSVP en nombre de otra persona.
  Los calendarios con source Google y los eventos
  vinculados a otro módulo no se modifican mediante MCP.

No hay nuevas tablas, variables, migraciones, SQL arbitrario, borrado genérico ni
pagos o llamadas externas desde los adaptadores. Las pruebas utilizan PostgreSQL temporal y datos sintéticos,
incluyendo funciones de acceso y tablas de Notas de las migraciones existentes;
no aplican DDL a la base configurada en `.env`.

## Cobertura entregada

Cada fila con escritura añade `runly_<dominio>_query`, `_prepare` y `_commit`.
Las filas de solo lectura añaden únicamente `_query`. Inventario mantiene sus
ocho herramientas especializadas y las cuatro de identidad/descubrimiento.
Archivos utiliza `runly_files_query` y las dos herramientas específicas
`runly_files_import_prepare`/`runly_files_import_commit` con file params nativos.
El catálogo es la referencia exacta de permisos por operación; el scope no
sustituye el permiso ERP ni la ACL individual.

| Dominio | Operaciones reales | Scopes adicionales |
| --- | --- | --- |
| `hr` | Buscar/consultar empleados y relaciones; usuarios elegibles por ID, departamentos y puestos; crear/editar empleados y vínculos | `hr:read`, `hr:write` |
| `fleet` | Vehículos, conductores, reportes, documentos y seguros; crear/editar vehículos y pólizas | `fleet:read`, `fleet:write` |
| `notes` | Buscar/leer contenido, carpetas y etiquetas; crear nota y editar título/carpeta conservando Yjs | `notes:read`, `notes:write` |
| `pfm` | Carteras, movimientos, categorías, presupuestos y resúmenes; crear/editar movimientos nativos y presupuestos propios | `pfm:read`, `pfm:write` |
| `ledger` | Cuentas accesibles, transacciones, categorías, grupos y resúmenes; crear/editar transacciones | `ledger:read`, `ledger:write` |
| `projects` | Proyectos, miembros, tareas, responsables, estados y dependencias; crear/editar proyectos y tareas, asignar y cambiar estado | `projects:read`, `projects:write` |
| `calendar` | Calendarios, agenda, participantes y disponibilidad; crear/editar/reprogramar eventos internos y agregar participantes | `calendar:read`, `calendar:write` |
| `contacts` | Buscar/consultar y crear/editar contactos | `contacts:read`, `contacts:write` |
| `purchases` | Consultas de solicitudes, proveedores, órdenes, facturas y pendientes; crear borrador de solicitud y decidir una aprobación existente si el workflow lo permite | `purchases:read`, `purchases:write` |
| `canvas` | Consultar boards/hotspots autorizados; crear board y editar hotspot conservando escena/geometría | `canvas:read`, `canvas:write` |
| `website` | Resumen del sitio, catálogo de bloques con guía de diseño, borradores en formato `sections` e imágenes públicas; configurar sitio/tema, guardar hasta 12 borradores por propuesta y publicar páginas (sensible). Las páginas quedan editables en el builder | `website:read`, `website:write` |
| `catalog` | Productos, detalle con variantes y categorías; crear/editar productos y crear categorías. Solo imágenes PUBLIC de la empresa; publicar un producto es sensible | `catalog:read`, `catalog:write` |
| `lms` | Cursos (estado, conteos, enlace compartido), curso con secciones y lecciones, lección completa, preguntas de examen en forma de autoría, alumnos con avance (`lms.enrollment.manage`) y plantillas de certificado; crear/editar cursos, publicar/despublicar/archivar (publicar y archivar son sensibles), secciones (incluido `free` y eliminar solo vacías, sensible), orden completo de secciones y lecciones, lecciones `text`/`embed`/`quiz`/`assignment` con settings, desactivar lecciones, preguntas de los nueve tipos (crear hasta 50, editar, quitar, ordenar) y `lms.section.build` (sección con hasta 20 lecciones y sus preguntas en una propuesta). Video subido y archivos se agregan en la app; no califica, no emite certificados ni gestiona enlaces o invitaciones | `lms:read`, `lms:write` |
| `attendance` | Consultas de asistencia, jornadas y horas extra; no registra entradas/salidas | `attendance:read` |
| `files`, `documents` | Consultar metadatos con ACL existente; importar originales a 30 destinos de los 20 módulos MCP (`lms.course` como referencia privada); `website.site` y `catalog.product` guardan imágenes públicas con URL permanente. Adjuntos nativos o referencias privadas claramente diferenciados, con aprobación | `files:read`, `files:write`, `documents:read` más scope del destino |
| `identity` | Buscar perfiles activos de la empresa para referencias explícitas; no crea usuarios ni modifica roles | `identity:read` |
| `activity` | Actividad propia y paginada en la empresa consentida | `activity:read` |
| `chat` | Metadatos de conversaciones propias de la empresa; sin mensajes, adjuntos ni envíos | `chat:read` |

Las búsquedas nuevas paginadas limitan la página a 50 registros. Las consultas
semánticas reutilizadas mantienen sus filtros/límites originales; no representan
una exportación completa. `calendar_events_page` requiere fechas ISO con offset
y un rango máximo de 62 días. El calendario conserva la interpretación de fechas
y zona horaria de sus servicios existentes; es preferible enviar un offset explícito.

## Auditoría adicional y operaciones excluidas

Se revisaron las fronteras de servicios, rutas y permisos de los otros módulos
oficiales. No se registraron operaciones sin un adaptador confiable:

| Área | Resultado de la revisión |
| --- | --- |
| POS (`pos-*-service`) | Ventas, cobros, caja, cocina y reservas afectan dinero/operación. Requieren propuestas y autorizaciones específicas; no se exponen como CRUD genérico. |
| Website (`website-service`, `checkout-routes`) | Publicación afecta contenido público y checkout llama a Stripe. Publicar, cobrar y administrar claves permanecen fuera del contrato MCP. |
| Catálogo (`catalog-*-service`) | Publicación y stock son contratos distintos de Inventario de activos. No se equiparan ni se habilita modificación de stock por una capacidad de Inventario. |
| Growth (`growth-lead-service`, `growth-analytics-service`) | Hay consultas útiles futuras; leads/formularios y analítica tienen límites por sitio, asignado y datos personales. Quedan sin herramientas hasta diseñar su proyección y scopes específicos. |
| Notifications (`notification-service`, delivery worker) | No se habilita publicación libre. Solo se mantienen los efectos compartidos de las operaciones aprobadas y sus preferencias existentes. |
| Company, Core, Platform Settings | Empresas autorizadas ya se descubren con las herramientas base. No se exponen secretos, configuración de infraestructura, administración universal ni elevación de permisos. |

Tampoco se incorporan envío de chat, lectura de mensajes privados ajenos,
descargas firmadas, compras que reciban stock o ejecuten pagos, importaciones IA,
operaciones bancarias, escritura de inversiones ni borrado definitivo. Las
consultas disponibles de cada módulo son únicamente las del catálogo generado.
Agregar texto a una nota colaborativa existente y actualizar kilometraje siguen
bloqueados por los contratos de dominio descritos arriba, no por falta de scope.

## Extensión RME3 futura

`mcp.version=1` continúa como metadata de descubrimiento, con opt-in y permisos.
Nunca autoriza acceso a tablas ni ejecución de código subido por un módulo.
La siguiente versión deberá declarar capacidades explícitas con identificador
estable, esquemas de entrada/salida, scope, permisos de lectura/escritura,
resolución de empresa/recurso, política de aprobación y efectos. Su adaptador
deberá estar revisado y registrado por el servidor, usando servicios autorizados.
No se implementa un ejecutor de `handler` del manifest ni SQL/CRUD por nombre.

## Verificación y reproducción

Las pruebas viven en `apps/api/src/mcp/__tests__/official-domains.js`,
`domain-contracts.test.js` y la suite de integración existente. El runner crea
PostgreSQL 18 efímero con `--tmpfs`, nombre de base de prueba y puerto loopback;
ejecuta DDL solo allí y elimina el contenedor al terminar. Notas y Chat utilizan
sus migraciones y funciones de acceso originales. Los datos son sintéticos.

```powershell
$env:RUNLY_MCP_TEST_INSPECTOR = 'true'
pnpm test:mcp
pnpm lint
pnpm build
pnpm --filter @runly/desktop build:web
pnpm check:privacy
pnpm check:secrets
$env:RUNLY_BROWSER_TEST_MODULE = (Resolve-Path node_modules/playwright/index.mjs).Path
node --test apps/desktop/src/app/__tests__/mcp-connection-browser.test.js apps/desktop/src/lib/__tests__/runtimeConfig.test.js
node scripts/generate-mcp-catalog.mjs
```

La suite MCP verifica lectura autorizada/denegada, empresa, scopes, módulo
deshabilitado, membresía desactivada, permisos generales/individuales y recursos
privados/compartidos. Ejecuta altas y ediciones reales aprobadas, rechazos,
revocación, conflictos, commits concurrentes e idempotencia. Además comprueba
presupuestos, pólizas, tareas con asignado/estado, borrador de compra, hotspot,
participantes de calendario, relaciones de RR. HH., categorías contables ajenas
y preservación de bytes Yjs. El registro valida esquemas y limita la superficie
a 59 herramientas; no es la única evidencia de funcionamiento. `lms-adapter.test.js` ejecuta el runtime y el acceso MCP reales sobre un doble en memoria de Prisma para Aprendizaje.

Inspector CLI 2.11.0 realiza OAuth real con DCR/PKCE, consentimiento web de fixture
y token exchange, inicializa MCP, lista las 50 herramientas con los nuevos
scopes y ejecuta `runly_whoami`. El SDK oficial consulta los dominios por HTTP.
La conexión antigua conserva sus 12 herramientas y refresh no amplía scopes.
La sesión web de las pruebas usa JWT firmado a través del middleware real.
No se afirma una reconexión manual con una cuenta comercial de ChatGPT ni una
prueba sobre una instancia existente: esta entrega no despliega servidores.

Los resultados finales se registran en la [verificación](RUNLY_MCP_VERIFICATION.md).

## Publicación y actualización posterior

Esta ampliación no cambia el esquema de producción ni las variables MCP. Usa
la tabla `mcp_state` existente; conserva el procesamiento de propuestas antiguas
de Inventario y guarda las nuevas de dominio con versión 2. La
[importación de originales del chat](RUNLY_MCP_FILES.md) usa propuestas versión 3
y el nuevo scope `files:write`. No modifica archivos `.env`.

Publicar después de revisar, desde el checkout actualizado (comando **no ejecutado**
durante esta entrega):

```bash
node infra/docker/build-push.mjs --api --web
```

Imágenes necesarias: `raulbellosom/runlyerp:api-latest` y
`raulbellosom/runlyerp:web-latest`. API contiene los adaptadores/servicios;
web contiene scopes, efectos y confirmación sensible. No se requieren nuevas
imágenes de base de datos, transcriber, TTS ni backup. Worker no incorpora rutas
MCP ni nuevos tipos de jobs; los avisos usan su contrato existente. El detector
automático de builds puede marcar worker por compartir el árbol `apps/api`,
pero este cambio no necesita un worker distinto para ejecutar MCP.

En el directorio **existente del instalador** de cada instancia, después de que
las imágenes estén publicadas:

```bash
# Instalación local, también Supabase integrado/embedded:
bash ./update-local.sh
# Instalación con Supabase external:
bash ./update-external.sh
```

Si una instalación antigua todavía no tiene el alias de actualización:

```bash
# Elegir solo el correspondiente al modo de la instancia:
curl -fsSLo update-local.sh https://raw.githubusercontent.com/Runly-MX/runly-erp/main/infra/installer/update-local.sh
bash ./update-local.sh
# O bien:
curl -fsSLo update-external.sh https://raw.githubusercontent.com/Runly-MX/runly-erp/main/infra/installer/update-external.sh
bash ./update-external.sh
```

Los actualizadores refrescan scripts/Compose y utilizan el flujo normal de
pull, migración aditiva/seed y recreación. Conservan los archivos de entorno,
volúmenes y módulos propios. No usar reset, `down -v` ni una instalación nueva.
No se ejecutaron estos comandos contra un VPS, ni se publicaron imágenes.

Tras actualizar, comprobar las URLs OAuth públicas de la instancia y reconectar
la app en ChatGPT web. Eliminar/desconectar la autorización anterior para esta
conexión, crearla usando la misma URL pública `/mcp`, iniciar sesión en Runly,
seleccionar empresas y consentir solo los scopes necesarios. Si el cliente
reutiliza un registro DCR con scopes antiguos, registrarlo de nuevo. Verificar
`runly_whoami`, empresas, módulos y esquema; después preparar una operación,
abrir su `approvalUrl`, revisar y confirmar en Runly y pedir el commit. Una
ampliación no se obtiene refrescando un token antiguo.
