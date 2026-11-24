# RUNLY PLATFORM STABILIZATION — F1A: resultados de seguridad

- SHA auditado en F0: `87b01501c4467998c3be2f901a3cc03e063ff5b4` (informe `docs/audits/RUNLY_PLATFORM_AUDIT_2026-11.md`, preservado sin cambios en el commit local `8241c674f`).
- Base de F1A: `main` @ `40162675ac9163b294997d9d2c682c31ac8eeffc` (2026-11-23). Entre la base y el final de F1A entraron commits de otras sesiones (`0a3c6409a`, `fd16dc513`); no forman parte de esta fase y no se tocaron.
- Commits locales de F1A (sin push, sin PR, sin despliegue): `8241c674f` (F0), `1f9821e33` (P0-01), `9730401e9` (regresiones), `08d5e2841` (dependencias), `02e0b0887` (PostgREST), más el de este documento.
- Entorno: estación Windows 11, Node 22, Docker 29. Instancias desechables: Supabase completo en Docker (`scripts/fixtures/studio/supabase-stack.mjs`) con todas las migraciones y el seed, nunca la base habitual ni los puertos 4010/5173.
- Sin cambios de producción. Ninguna migración se aplicó fuera de las instancias desechables.

Estados usados: **CONTENIDO** (la vía de riesgo está cerrada en el código local y verificada en instancia desechable, pero quedan pasos operativos), **CORREGIDO LOCALMENTE** (corrección completa en el árbol local), **VERIFICADO EN STAGING** y **CERRADO EN PRODUCCIÓN**. Ningún hallazgo alcanza todavía los dos últimos.

## 1. Resumen

| Tema | Resultado | Estado |
|---|---|---|
| P0-01 Ejecución de código de módulos por administrador de empresa | Confirmado y contenido: toda vía que instala código exige una autoridad explícita; ZIP y catálogo no oficial solo para el propietario de la plataforma | **CONTENIDO** |
| P0-02 Exposición de datos por PostgREST | Hipótesis de F0 **refutada** en instancia representativa: 0 tablas de negocio legibles con la clave anon. Hallazgo real distinto: historial de migraciones escribible con la clave anon | P0-02 **descartado como P0**; nuevo P1-C1 **CORREGIDO LOCALMENTE** |
| Dependencias críticas | Hono 4.13.7 → 4.13.21, @hono/node-server → 1.19.18/19, zod 4.4.3 → 4.6.7; sin bypass de autenticación por variantes de ruta | **CORREGIDO LOCALMENTE** |
| Regresiones de seguridad (checkout, 500 vs 403, catálogo RBAC) | Causa raíz: mocks/stubs desactualizados, no fallos de producción; corregidos sin debilitar aserciones (se añadieron) | **CORREGIDO LOCALMENTE** |
| Contenedor como root | Diseño de transición documentado; no implementado (rompería volúmenes existentes) | Pendiente F1B |

Los P0 **no se declaran cerrados**: falta staging, el diagnóstico SQL en cada instalación real y la revisión de módulos instalados antes del cambio.

## 2. A — Preservación del diagnóstico

- Informe F0 versionado tal cual se entregó (`8241c674f`), pasa `pnpm check:privacy` sin hallazgos nuevos (40 preexistentes, todos IPv4 de ejemplo en tests/docs).
- F0 contenía una afirmación que F1A corrige (P0-02, ver §4). No se editó el informe F0; la corrección vive aquí.
- Workspace al iniciar F1A: solo `docs/audits/` sin versionar. Los cambios de otras sesiones que aparecieron durante la fase no se incorporaron a ningún commit de F1A.
- Evidencias crudas (logs de pruebas, JSON de sondas, salida de diagnósticos) quedaron fuera del repositorio porque contienen nombres de proyecto y rutas locales; este documento recoge solo resultados sanitizados.

## 3. B — P0-01: ejecución de código de módulos

### 3.1 Recorrido reconstruido

Un paquete de módulo es JavaScript. Hay tres momentos de ejecución en el proceso de la API, con el cliente Prisma global y todo el entorno:

1. **Staging** (antes de instalar): `module-package-staging-service.js` hace `import()` de `module.manifest.js`, `models/` y `views/` (`module-discovery-service.js:198`). Subir o *revisar* un ZIP ya ejecuta su código. Esto F0 no lo había señalado: el riesgo empezaba antes de instalar.
2. **Discovery / bootstrap / sync / restore de backup**: vuelven a importar el manifiesto del disco (`module-lifecycle-service.js`, `module-package-wiring-service.js:86`).
3. **Route loader**: `factory({ prisma, ... })` de `api/index.js` (`route-loader-service.js:293,400`) en cada arranque y recarga.

Los componentes (`components/index.js`) se compilan con el bundler y se ejecutan en el **navegador** de quien abra el módulo, no en el servidor.

Única puerta de entrada de bytes al disco: `publishZip()`/`checkZip()` de `module-package-service.js`. Llamadores (antes de F1A, todos sin distinción de rol más allá de un permiso):

### 3.2 Matriz de vías de ejecución y autorizaciones

| Vía | Quién podía antes | Origen del código | Ahora (F1A) | Evidencia |
|---|---|---|---|---|
| `POST /modules/:key/upload` (ZIP, Developer Mode) | Cualquiera con `core.modules.upload` (todo admin de empresa lo tiene) | Arbitrario (cliente) | Solo propietario de la plataforma; 403 `MODULE_CODE_AUTHORITY_REQUIRED` antes de leer el cuerpo | `routes/modules.js:2779`; test `modules-upload-route.test.js`; E2E |
| `POST /modules/:key/upload/check` | Igual | Arbitrario; también se importaba en staging | Igual que upload | `routes/modules.js:2565`; E2E |
| Module Builder `POST /module-builder/projects/:id/publish` | `core.modules.builder` + `core.modules.create` | Generado por `compileDefinition` en el servidor | Se conserva para admins de empresa con autoridad `builder-compiler` | `module-builder-service.js:326`; E2E "declarative Builder module still publishes" |
| Builder en modo desarrollador (proyecto *detached*) | Remitía a upload | Arbitrario | Hereda la puerta de upload (propietario) | `module-builder-service.js:309` |
| Catálogo v1 `POST /module-catalog/:key/install|update` | Solo `core.modules.manage` (ni siquiera autoridad de instancia) | Firmado; las claves extra (`catalog.publicKeys`) son configurables | Exige autoridad de instancia; firma oficial fijada → permitido; cualquier otra clave → propietario | `catalog-routes.js:67,75`; `catalog-service.js:159`; `catalog-security.test.js` |
| Marketplace / catálogo v2 `install|update` | Autoridad de instancia (admin de empresa) | Oficial (clave fijada), comunidad o *managed* (claves que configura un admin) | Oficial → autoridad de instancia; comunidad/managed → propietario | `catalog-v2-service.js:411`; `catalog-v2.test.js` |
| `PUT /module-catalog/v2/source` (feeds y claves managed) | Autoridad de instancia | Define confianza no oficial | Sin cambio: ya no basta para instalar código no oficial | Riesgo residual R-3 |
| `POST /modules/install`, `/sync`, `/:key/enable`, `retry-install`, restore de backup | Permisos de módulos | Código ya presente en disco | Sin cambio: solo reejecuta lo que ya pasó por una vía autorizada; los paquetes previos al cambio se revisan con el diagnóstico de procedencia | §3.4 |
| Arranque (route loader) | Proceso interno | Disco | Sin cambio (proceso interno) | `route-loader-service.js` |
| MCP de Runly (`apps/api/src/mcp`) | Usuario vía MCP | No existe herramienta de instalación/subida de módulos | No aplica (verificado por búsqueda) | `git grep` sin coincidencias de upload/publish en `mcp/` |
| Developer Hub (`runly_custom_compile`, artifacts) | Desarrolladores del Hub | Construye ZIP fuera de la instancia | El ZIP solo entra a una instancia por upload o catálogo → mismas puertas | — |

Roles distinguidos: **administrador de empresa** (`runly.admin`, recibe todos los permisos activos), **administrador de sistema** (`system.admin` global), **propietario de la plataforma** (`InstanceConfig.platform_owner_profile_id`, `tenantContext.isPlatformOwner`), **procesos internos** (arranque, Builder compiler, verificación de firma oficial). Solo el propietario puede autorizar código arbitrario; ni el admin de empresa ni el rol `system.admin` bastan.

### 3.3 Contención implementada (fail-closed)

- `apps/api/src/lib/module-code-authority.js`: tres autoridades válidas (`platform-owner`, `builder-compiler`, `runly-official-signature`).
- `stageZipPackage()` rechaza con 403 cualquier llamada sin una autoridad válida **antes de escribir o importar nada** (`module-package-staging-service.js:136`); `publishZip()`/`checkZip()` repiten la verificación (`module-package-service.js:45`). Un llamador nuevo que olvide declarar autoridad falla cerrado.
- La autoridad usada queda en el audit `core.module.package.upload` (`codeAuthority`).
- No depende de manifiesto, firma de terceros, extensión ni inspección estática: la decisión es de identidad (propietario) o de origen interno (compilador, clave oficial fijada en el binario). No se usa Node VM.

Verificación:

- Unitaria: `module-package-staging-service.test.js` sube un ZIP con un manifiesto "canario" inocuo que solo escribiría un archivo si se importara; con autoridades `undefined`, `null`, `''`, `company-admin`, `PLATFORM-OWNER` responde 403, el canario no existe y no queda staging.
- Catálogo: admin de empresa instalando paquete no oficial → 403 y nada publicado (`catalog-security.test.js`, `catalog-v2.test.js`); paquete oficial instalado por admin de empresa → permitido.
- E2E en instancia desechable con la API real (`.e2e/f1a-module-authority-e2e.mjs`, local, no versionado): 8/8 PASS — admin de empresa: upload 403 y upload/check 403 sin ejecutar el canario; catálogo v2 no instala nada sin feed verificado; propietario: upload 200; admin de empresa publica un módulo Builder (plantilla `simple-crud`) 200; `/modules` y `/runtime/modules` 200; admin A no puede seleccionar la empresa B; admin A solo ve contactos de A.

Estado: **CONTENIDO**. Falta staging y revisar los módulos ya instalados.

### 3.4 Módulos instalados previamente

`scripts/security/module-provenance-diagnostic.sql` (solo lectura) lista cada `custom.*` con proyecto Builder (y si está *detached*), instalación por catálogo (oficial o no), número de subidas previas a la puerta y la última autoridad registrada, con veredicto `OK_AFTER_GATE`, `BUILDER_ONLY`, `OFFICIAL_CATALOG` o `REVIEW_CODE`. Validado en instancia desechable (un módulo con subida previa a la puerta sale como `REVIEW_CODE`). Todo `REVIEW_CODE` requiere revisar a mano `modules/custom/<key>/` antes de cerrar P0-01; hasta entonces ese código sigue cargándose al arrancar.

### 3.5 Contenedor como root: diseño de transición (no implementado)

Observado: `infra/docker/api.Dockerfile` no declara `USER`; el API escribe en `/app/modules/custom` (bind mount `./custom-modules` del instalador), `/app/apps/api/bundles` y temporales. Cambiar a `USER node` hoy rompería instalaciones cuyo bind mount pertenece a root.

Transición propuesta (F1B): (1) imagen con `USER node` (uid 1000) y `chown` de `/app/apps/api/bundles`; (2) el instalador hace `chown -R 1000:1000 custom-modules` antes de recrear el contenedor y lo verifica; (3) `read_only: true` con `tmpfs` para `/tmp` y volúmenes explícitos solo para módulos y bundles; (4) `cap_drop: [ALL]`, `no-new-privileges`; (5) prueba de humo del instalador que publique un módulo Builder y uno por ZIP con el usuario no privilegiado. Limita el daño de un módulo autorizado pero malicioso; no sustituye el aislamiento de F1B.

### 3.6 Arquitectura futura de aislamiento

Ver §10 (plan F1B). Inmediata = puerta de autoridad (arriba). Futura = el código de módulos no corre en el proceso de la API.

## 4. C — P0-02: exposición por PostgREST

### 4.1 Método

Instancia desechable representativa: Supabase self-hosted del instalador (db, auth, rest, realtime, storage, kong) + `prisma migrate deploy` de las 298 migraciones + seed + dos empresas ficticias con un usuario en A y un contacto en cada una. Luego:

1. `scripts/security/postgrest-exposure-diagnostic.sql` (solo lectura, transacción `READ ONLY`, sin datos de filas): roles y esquemas usables, herencia de roles, grants efectivos (`has_table_privilege`) por relación, RLS/FORCE RLS, políticas `USING (true)`, grants por columna, default privileges, funciones ejecutables (RPC) y SECURITY DEFINER, buckets y políticas de Storage, publicación y políticas de Realtime, integridad del historial de migraciones.
2. Sondas HTTP reales por Kong → PostgREST a las 390 relaciones de `public`, con la clave anon y con un JWT `authenticated` de un usuario de la empresa A (solo estado y número de filas).

Harness local: `.e2e/f1a-postgrest-exposure.mjs`.

### 4.2 Corrección de F0

F0 infirió exposición amplia contando 392 `CREATE TABLE` contra 92 `ENABLE RLS`. Era una inferencia incorrecta: la migración `20260919140000_user_resource_isolation` recorre todas las tablas de `public` con un bloque `DO` (que la búsqueda de F0 no detectó), habilita RLS y revoca `PUBLIC, anon, authenticated`, y además ejecuta `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES` para el rol que migra. La exclusión explícita fue `_prisma_migrations`.

### 4.3 Matriz efectiva de acceso PostgreSQL (instancia desechable)

| Superficie | anon (antes) | authenticated (antes) | anon (después) | authenticated (después) |
|---|---|---|---|---|
| Relaciones de `public` con HTTP 200 | 1 de 390 | 9 de 390 | 0 | 8 |
| Relaciones con filas devueltas | `_prisma_migrations` (298 filas) | `_prisma_migrations` | ninguna | ninguna |
| Tablas de negocio (company, contact, user_profile, instance_config...) | 401 | 401/403 | 401 | 401/403 |
| Lectura cruzada: usuario de A pide contactos de B | — | 403 | — | 403 |
| Escritura anon en `contact` | 401 | — | 401 | — |
| **Escritura anon en `_prisma_migrations`** | **201, fila guardada** | permitida | 401, nada guardado | sin grant |
| RPC `runly_canvas_user_access` (SECURITY DEFINER, recibe user id arbitrario) | 200 | 200 | 401 | 200 (lo usa la política de canvas) |
| RPC `company_is_member`, `notes_realtime_is_public` | 200 | 200 | 200 | 200 |
| Las 8 tablas de Realtime (`chat_*`, `notification`, `call*`) | sin grant | SELECT con RLS y políticas de participante | sin grant | igual |
| Storage | sin buckets en instancia nueva | — | — | — |

Detalle (sección 4 del diagnóstico): las 8 tablas de Realtime tienen RLS, 2–4 políticas y ninguna política `USING (true)`. Default privileges: el rol `postgres` ya no concede tablas en `public` (solo secuencias y funciones); `supabase_admin` sigue concediendo todo en `public` a anon/authenticated para objetos que él cree (riesgo residual R-5). Realtime: las políticas que incluyen `anon` son `note_canvas_receive`, `note_ydoc_receive` (requieren nota pública o acceso autenticado y revisión vigente) y `runly_realtime_server_writes` (`WITH CHECK false`).

### 4.4 Hallazgo P1-C1 (nuevo, confirmado en instancia desechable)

- Observado: `_prisma_migrations` conserva los grants por defecto de Supabase: con la clave anon pública se puede leer el historial completo y **insertar o modificar filas**.
- Evidencia: `POST /rest/v1/_prisma_migrations` con la clave anon → 201 y la fila existe; diagnóstico §4/§5 (INSERT/UPDATE para anon y authenticated, sin RLS).
- Impacto: integridad del despliegue. El repositorio es público y los nombres de migraciones futuras son predecibles: un tercero puede marcar por adelantado una migración (p. ej. una de seguridad) como aplicada y `prisma migrate deploy` la saltaría, o dejar filas inconclusas que bloqueen despliegues. Lectura: inventario de funciones y fechas de la instancia.
- Confianza: alta en la instancia desechable; en instalaciones reales depende de sus grants (usar el diagnóstico §11).
- Solución: migración `20270114000000_postgrest_migration_history_lockdown` (revoca todo sobre `_prisma_migrations` a PUBLIC/anon/authenticated y EXECUTE de anon sobre `runly_canvas_user_access`). Prisma migra como dueño de la tabla y no necesita esos grants; Realtime conserva sus funciones.
- Verificación: sonda posterior (tabla 4.3, columna "después"), E2E de la API real arrancada sobre la base migrada con esta migración, y diagnóstico §11 (`anon_can_insert = f`, 0 checksums no Prisma, 0 filas inconclusas).
- Estado: **CORREGIDO LOCALMENTE**. En instalaciones existentes, antes de aplicar la migración, revisar el §11 del diagnóstico: una fila con checksum no hexadecimal de 64 caracteres o un nombre que no exista en `prisma/migrations` del release indica manipulación previa.

### 4.5 Verificación de cada instalación real

```
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f scripts/security/postgrest-exposure-diagnostic.sql
```

Criterio para cerrar en cada instancia: §3 sin `select_without_rls` salvo cero; §4 sin `EXPOSED_NO_RLS`, `EXPOSED_VIEW_REVIEW` ni `RLS_PERMISSIVE_TRUE`; §6 sin default privileges de tablas a anon/authenticated para el rol que crea tablas (incluido el rol de la ORM de RME3); §11 con `anon_can_insert = f` y sin filas sospechosas. Si el rol de `DATABASE_URL` de una instancia no es el que corrió la migración de aislamiento, sus default privileges pueden seguir concediendo acceso a tablas nuevas de módulos RME3: el diagnóstico lo muestra en §6.

## 5. D — Dependencias

Auditoría `pnpm audit` contra el lockfile actual. Antes: 2 critical, 30 high, 39 moderate, 9 low. Después: 2 critical, 29 high, 28 moderate, 7 low. `--prod` da lo mismo porque Prisma CLI y otras herramientas están en `dependencies`; la tabla separa por alcance real.

| Paquete | Severidad | Alcance | Explotabilidad en Runly | Acción |
|---|---|---|---|---|
| hono 4.13.7 | moderate/low (6) | Ejecución, todo el tráfico | Saltos de middleware comodín/`mount`, validación multipart. No reproducido con el patrón real `mountWithAuth` en 4.13.7 ni en 4.13.21 (test de 29 variantes) | **Actualizado a 4.13.21** |
| @hono/node-server 1.19.17 | moderate | Ejecución | Barra invertida como separador; `serveStatic` (no usado por la API) | **1.19.18/1.19.19**; el aviso restante es de `serveStatic`, no usado |
| zod 4.4.3 | high | Ejecución, validación de cuerpos | Agotamiento de memoria con colecciones restringidas enormes | **Actualizado a 4.6.7** |
| nodemailer 8.0.10 | high/moderate (14) | Ejecución (correo) | DoS por direcciones manipuladas, desvío de dominio, caché DNS compartida entre transportes SMTP de varias empresas | **No actualizado**: salto mayor 8→10/11, requiere revisar `smtp-service.js` y probar envíos; F1B |
| xmldom 0.1.31 (vía docxtemplater-image-module-free) | critical/high | Ejecución (plantillas DOCX) | Depende de si se procesan DOCX subidos por usuarios; sin versión parcheada en la rama 0.1 | F1B: evaluar alcance y reemplazar el módulo de imágenes |
| body-parser (vía @modelcontextprotocol/sdk → express) | high | Ejecución (servidor MCP) | Expuesto si el MCP está activo | F1B: subir el SDK de MCP |
| tar, effect, deepmerge-ts, mysql2, fast-uri (vía prisma CLI) | critical/high | Instalación y migración | Solo durante `migrate`/build con artefactos confiables | Seguir a Prisma; sin acción en tiempo de ejecución |
| fabric, image-size, katex, dompurify (escritorio) | high/low | Navegador | Contenido de usuario en lienzos y presentaciones | F1B, frontend |
| csv-parse, uuid, fast-xml-parser | moderate/low | Ejecución | Entradas de importación | F1B |

Protección de autenticación contra variantes de ruta: `apps/api/src/__tests__/auth-route-variants.test.js` replica `mountWithAuth` con la misma versión de Hono y prueba 29 variantes (mayúsculas, dobles barras, `%6D`, `%0A`, `%E2%80%A8`, `..`, `;`, `%2F`, barra invertida, parámetros, rutas anidadas y comodín): ninguna llega a un handler sin credenciales. Hallazgo colateral: Hono convierte el `use('*')` del sub-app en middleware `/*` del padre, así que toda ruta registrada después del primer `mountWithAuth` en `index.js` exige token (falla cerrado; una ruta pública añadida debajo quedaría bloqueada sin aviso). Ahora hay un test que documenta ese comportamiento.

Estado: **CORREGIDO LOCALMENTE** para Hono y zod; nodemailer, xmldom y el SDK de MCP quedan como bloqueadores de F1B.

## 6. E — Regresiones de seguridad

| Prueba | Causa raíz | Corrección | ¿Fallo en producción? |
|---|---|---|---|
| Checkout ignora precio manipulado / variante pertenece al producto (500) | `139591897` hizo que checkout cree el pedido antes del pago (`orders.place`); el test no inyectaba el servicio de pedidos y el falso Prisma rechazaba esa consulta | Stub del servicio de pedidos; **nueva aserción**: el pedido guardado lleva precio, moneda y nombre del catálogo, no del cliente | No: el código sigue derivando precio del catálogo (`checkout-routes.js:46-84`) |
| Invocación de runtime 500 en vez de 403/404 (2 tests) | `company-module-service` pasó a `companyModule.findMany` (módulos custom opt-in por empresa); el mock solo tenía `findFirst` | Mock con la forma actual; **nueva aserción**: una empresa que nunca habilitó el módulo recibe 404 | No |
| Catálogo público por empresa (2 tests) | Búsqueda de empresa cambió a `company.findFirst({ slug, enabled: true })` y la consulta de categorías ahora une `website_site` | Mock actualizado (solo empresas habilitadas) | No |
| 8 permisos sin catálogo RBAC | `website.domains.manage`, `website.forms.*` (4), `website.submissions.*` (2), `bookings.reserve` declarados en manifiestos sin entrada en `PERMISSION_CATALOG` | Entradas añadidas con nombre y descripción en español | Sí, menor: no aparecían como permisos asignables con nombre; los admins los tenían por expansión |

No se deshabilitó ni se debilitó ninguna prueba; todas las expectativas originales se mantienen.

## 7. F — Criterios de aceptación

| Criterio | Estado | Evidencia |
|---|---|---|
| Pruebas negativas de acceso entre dos empresas | Cumplido (desechable) | E2E: admin A no puede seleccionar B; solo ve contactos de A; PostgREST: usuario A → contactos de B 403 |
| Admin de empresa incapaz de introducir código ejecutable no autorizado | Cumplido (desechable) | E2E upload/check 403 sin ejecutar canario; tests de staging y catálogo |
| Instalación declarativa legítima conservada | Cumplido (desechable) | E2E: publicación Builder 200 como admin de empresa |
| Módulos oficiales operativos | Cumplido (desechable) | E2E `/modules`, `/runtime/modules` 200; catálogo oficial instalable por admin (tests) |
| Validación de vías alternativas de instalación | Cumplido | Matriz §3.2; todos los llamadores de `publishZip` declaran autoridad (búsqueda en todo el repo) |
| Evidencia de grants efectivos de PostgreSQL | Cumplido (desechable) | §4.3; diagnóstico SQL listo para cada instancia real |
| Pruebas de autenticación y autorización | Cumplido | `auth-route-variants.test.js` (3/3), suites de módulos/catálogo, RBAC 43/43 |
| Auditoría de dependencias actualizada | Cumplido | §5 |
| Lint y suites relacionadas ejecutadas | Cumplido con salvedad | Lint: 1 error preexistente (`scripts/verify-bookings-rooms.mjs:34`, ajeno). Suite completa: ver §8 |
| Sin nuevas regresiones confirmadas | Cumplido | §8: la única falla nueva viene de la adopción de Atlas 0.11.0 de otra sesión |
| Sin cambios de producción | Cumplido | Solo commits locales; migraciones aplicadas únicamente en instancias desechables |

## 8. Antes / después

| Medición | Antes | Después |
|---|---|---|
| Suite completa (`node --test` apps/packages/scripts, sin suites de Postgres) | 31 fallas (F0 en `87b01501c`) | 22 fallas, 6417 pass, 12 skipped en 6451 |
| Fallas de seguridad de E | 7 | 0 |
| Fallas nuevas | — | 1: `website-atlas-public-browser.test.mjs` ("Builder version 0.11.0 requires an explicitly reviewed runtime update"), introducida por la adopción de Atlas 0.11.0 de otra sesión, no por F1A |
| Suites de módulos, catálogo, checkout y auth | 144/148 (sin checkout ni auth) | 160/160 (149 módulos/catálogo + 8 checkout + 3 auth) |
| Admin de empresa sube ZIP | 200, código ejecutado en staging | 403, no se ejecuta |
| anon escribe `_prisma_migrations` | 201 | 401 |
| Relaciones legibles con la clave anon | 1 | 0 |
| `pnpm audit` | 2C / 30H / 39M / 9L | 2C / 29H / 28M / 7L |

Las 21 fallas restantes ya existían en F0 (catálogos generados desactualizados, iconos PWA, tests de navegador, registro de consumidores compartidos, suites de Postgres sin base configurada) y están fuera del alcance de seguridad de F1A.

## 9. Riesgos residuales y bloqueadores

| ID | Riesgo | Severidad | Bloquea cerrar |
|---|---|---|---|
| R-1 | Código de módulos autorizados sigue corriendo en el proceso de la API con Prisma global y todo el entorno | P1 | P0-01 definitivo (F1B) |
| R-2 | Módulos subidos antes de la puerta siguen cargándose al arrancar hasta revisarlos (`REVIEW_CODE`) | P0 hasta revisar | P0-01 en cada instancia |
| R-3 | Un admin de empresa sigue pudiendo cambiar feeds/claves managed y revocar claves (no ejecuta código, sí afecta a la instancia) | P2 | — |
| R-4 | Componentes React de módulos (Builder o ZIP) corren en el navegador de usuarios de otras empresas que habiliten el módulo | P2 | F1B |
| R-5 | `supabase_admin` mantiene default privileges amplios en `public` | P3 | — |
| R-6 | Funciones SECURITY DEFINER que devuelven booleanos ejecutables por anon/authenticated (oráculos de pertenencia con UUID v7 que hay que adivinar); `chat_guest_is_member` con `search_path=public` | P3 | — |
| R-7 | Superficie de inyección del compilador del Builder no se sometió a fuzzing (`JSON.stringify` en la emisión) | P2 | F1B |
| R-8 | nodemailer, xmldom y SDK de MCP vulnerables en tiempo de ejecución | P1 | F1B |
| R-9 | El contenedor de la API corre como root | P1 | F1B |
| R-10 | El propietario de la plataforma no tiene aviso en la UI: el admin de empresa ve el 403 con mensaje, pero el botón sigue visible | P3 | — |
| R-11 | Instancias sin propietario registrado quedan sin nadie que pueda subir ZIP (falla cerrado; se asigna transfiriendo la propiedad) | Operativo | — |
| B-1 | Sin staging: nada está VERIFICADO EN STAGING | — | Cualquier cierre |
| B-2 | Diagnósticos SQL sin ejecutar en instalaciones reales | — | P0-02 y C1 en producción |

## 10. Plan F1B — aislamiento permanente de módulos

Objetivo: que ningún módulo, autorizado o no, pueda leer datos de otra empresa ni el entorno de la API.

1. **Proceso separado por módulo** (o por instancia de módulos): `api/index.js` corre en un worker sin `process.env` de la API, sin red de salida por defecto y sin credenciales de base de datos. Criterio: un módulo que intenta leer `process.env.DATABASE_URL` o abrir un socket falla; prueba con canario.
2. **Acceso a datos por capacidades**: el worker recibe un cliente RPC limitado a su esquema/tablas y a la empresa de la petición (el `companyId` lo pone el host, no el módulo). Rol de PostgreSQL por módulo con grants solo sobre sus tablas y RLS por `company_id`. Criterio: consulta a tabla core o a otra empresa → error; test de dos empresas.
3. **Servicios del ERP por contrato**: el módulo llama a servicios declarados (`consumes`) a través del host, que aplica permisos del usuario. Criterio: servicio no declarado → 403.
4. **Staging sin ejecución**: manifiestos, modelos y vistas en formato de datos (JSON/ModuleDefinition) o evaluados dentro del worker aislado, nunca `import()` en la API. Criterio: subir un paquete con canario no ejecuta nada en el proceso de la API.
5. **Contenedor no privilegiado** (§3.5) y sistema de archivos de solo lectura salvo volúmenes de módulos y bundles.
6. **Componentes de navegador**: servir bundles de módulos desde un origen aislado (subdominio sin cookies/tokens) o iframe con `sandbox`, con CSP. Criterio: un componente no puede leer el token de sesión del ERP.
7. **Dependencias**: nodemailer ≥ 10.1.4 con pruebas de envío; reemplazar `docxtemplater-image-module-free`; subir `@modelcontextprotocol/sdk`.
8. **Revisión de instalaciones**: ejecutar ambos diagnósticos en cada instancia, revisar todo `REVIEW_CODE`, aplicar la migración C1 en staging y luego producción.
9. **Staging**: entorno con datos sintéticos de dos empresas donde se repitan el E2E y las sondas PostgREST de F1A antes de cada release; solo entonces marcar VERIFICADO EN STAGING.

Dependencias: 1 → 2 → 3; 4 depende de 1; 6 es independiente; 8 y 9 condicionan cualquier cierre. La recomendación de F0 sigue vigente: **NO GO** para ampliar RME3 hasta completar 1–4 y 8–9.

## 11. Cómo reproducir

```
node --test apps/api/src/services/__tests__/module-package-staging-service.test.js apps/api/src/routes/__tests__/modules-upload-route.test.js "apps/api/src/services/catalog/__tests__/*.test.js" apps/api/src/__tests__/auth-route-variants.test.js
node --test apps/api/src/routes/website/__tests__/checkout-routes.test.js apps/api/src/routes/__tests__/module-runtime-routes.test.js apps/api/src/routes/__tests__/public-catalog-router.test.js apps/api/src/services/__tests__/rbac-granular-contract.test.js
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f scripts/security/postgrest-exposure-diagnostic.sql
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f scripts/security/module-provenance-diagnostic.sql
```

Los harness de instancia desechable (`.e2e/f1a-postgrest-exposure.mjs`, `.e2e/f1a-module-authority-e2e.mjs`) son locales y no se versionan, igual que el resto de `.e2e/`; requieren Docker y crean y destruyen su propio Supabase.
