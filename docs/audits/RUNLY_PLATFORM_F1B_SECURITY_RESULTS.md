# RUNLY PLATFORM STABILIZATION — F1B: resultados (etapa 1: F1B.0–F1B.2)

- Base: `main` @ `c755e2f4e9aad59e36c5688d0fb8cc44f089758f` (cierre de F1A), árbol limpio al iniciar.
- Cambios concurrentes de otras sesiones entre F1A y F1B, no incorporados ni tocados: `9e390a20b` (adopción de Atlas 0.11.0), `0a3c6409a`, `88912b51b`, `fd16dc513` (SVG).
- Commits locales de esta etapa (sin push, sin PR, sin despliegue): `164353d6d` (dos escapes del Builder), `cb66b2eac` (cuarentena), `0cf92866f` (suites versionadas y CI), más el de esta documentación.
- Alcance pedido para esta entrega: ejecutar F1B.0, F1B.1 y F1B.2 y presentar el diseño (F1B.3, F1B.4) para revisión **antes** de migrar el runtime. F1B.5–F1B.8 no se implementaron en esta etapa (§9).
- Estados: CONTENIDO / CORREGIDO LOCALMENTE / VERIFICADO EN STAGING / CERRADO EN PRODUCCIÓN. Nada alcanza todavía los dos últimos.

## 1. Resumen

| Tema | Resultado | Estado |
|---|---|---|
| F1B.0 Revalidación de F1A | Las autoridades no se pueden falsificar desde el cliente. **El Builder sí permitía ejecutar código en el servidor** por dos vías (valor por defecto de un campo y `extensions`), las dos ya cerradas | CORREGIDO LOCALMENTE |
| F1B.1 Módulos previos a F1A | Todo código de módulo instalado se ejecuta solo si sus bytes exactos están autorizados; lo demás queda en **cuarentena** sin tocar datos. Inventario y herramienta de operador | CONTENIDO |
| F1B.2 Threat model | `docs/architecture/2026-11-23-rme3-threat-model.md` | Para revisión |
| F1B.3 ADR | `docs/architecture/adr-secure-module-runtime.md`: recomienda modelo híbrido (declarativo por defecto + contenedores para código + iframe aislado) | Propuesto |
| F1B.4 Capability Gateway | `docs/architecture/2026-11-23-rme3-capability-gateway-contract.md` | Borrador; PoC después de aceptar el ADR |
| P0-01 | Contenido en el código local, verificado en instancia desechable con la API real | **CONTENIDO**, no cerrado |
| P0-02 / C1 | Sin cambios respecto de F1A; ahora con verificación versionada | CORREGIDO LOCALMENTE |

## 2. F1B.0 — Revalidación de F1A

### 2.1 Estado registrado

SHA de partida `c755e2f4e`, árbol limpio, cuatro commits ajenos intercalados (arriba). La migración `20270114000000_postgrest_migration_history_lockdown` es la última en orden lexicográfico (sigue a `20270113000000_website_orders`), sigue la convención del repositorio de fechas futuras y solo ejecuta `REVOKE` (idempotente; si en una instancia el rol que migra no es dueño de la tabla, PostgreSQL avisa en lugar de fallar).

### 2.2 ¿Se pueden falsificar las autoridades?

| Autoridad | Origen | ¿Lo controla el cliente? | Evidencia |
|---|---|---|---|
| `platform-owner` | `tenantContext.isPlatformOwner`, calculado de `instance_config.platform_owner_profile_id` | No. Solo lo escriben `/setup/initialize` (409 si ya está inicializado) y la transferencia del propietario, que exige ser el propietario y limpia la caché de contexto | `index.js:1298`, `lib/platform-owner.js:100`, `routes/platform-owner-routes.js:22` |
| `builder-compiler` | Constante en `module-builder-service.js` | No, pero dependía de que el compilador no emitiera valores del cliente como código (ver 2.3) | `module-builder-service.js` |
| `runly-official-signature` | Verificación contra la clave oficial fijada en el binario | No; las claves *managed/community* nunca producen `official: true` | `catalog-trust-store.js:3-16` |

Ninguna ruta escribe en `instance_config` una clave elegida por el cliente (revisadas todas las escrituras con clave dinámica). Los cuerpos de las rutas de catálogo solo aceptan campos fijos, y el `tenant` se pasa después del *spread*. Riesgo residual: la caché de contexto se limpia solo en el proceso que atiende la transferencia; con varias réplicas de la API, el propietario anterior conserva hasta 300 s su autoridad.

### 2.3 Hallazgo crítico: el Builder permitía ejecutar código en el servidor

El compilador del Builder es una autoridad de código, así que ningún valor de una definición puede convertirse en código. Una prueba de *fuzzing* nueva (`builder-compiler-injection.test.js`) reemplaza cada valor de texto de cada plantilla del Builder por cargas que rompen cualquier contexto salvo una cadena entre comillas, compila y analiza cada archivo generado con esbuild. Encontró dos vías, confirmadas con pruebas inocuas:

| Vía | Causa | Prueba inocua | Impacto | Corrección |
|---|---|---|---|---|
| `entities[].fields[].default` | Se emitía como `'${valor}'` en `models/*.model.js`, que la API importa al hacer staging | Un default `x' + String(globalThis.__f1b = 'executed') + '` compiló y **se ejecutó al importar** | Cualquiera con `core.modules.builder` (todo admin de empresa) ejecutaba código en el servidor con la autoridad `builder-compiler`: anulaba la contención de F1A | `JSON.stringify` (`templates/model.js`) |
| `pwa.shortName` | Solo se validaba la longitud (14) y se emitía entre comillas simples en `module.manifest.js` | Se acepta y aparece sin escapar | Ruptura de literal limitada a 14 caracteres | `JSON.stringify` (`templates/manifest.js`) |
| `definition.extensions` | `PATCH /module-builder/projects/:id` guardaba lo que enviara el cliente; al publicar se emitía `views/<x>.custom.js`, que el staging importa | Una vista `.custom.js` con un marcador **se ejecutó durante el staging** (aunque luego el paquete fallara la validación) | Mismo impacto que la primera vía; además, componentes React arbitrarios en el navegador de usuarios de otras empresas | El editor solo puede conservar o quitar archivos de extensión ya registrados; al publicar se exige que cada archivo coincida con el hash registrado cuando el propietario subió el ZIP (`module-builder-package-sync.js`, `module-builder-service.js`) |

Verificación: fuzz 7/7 (6 plantillas + regresión exacta), `module-builder-extensions-guard.test.js` 3/3 (agregar, modificar, conservar en otro orden, quitar uno a uno, quitar todo), suites del Builder y del compilador 190/190, y en instancia desechable con la API real: `PATCH` con extensiones → 403 sin ejecutar el canario; default con comilla publicado → no se ejecuta.

Consecuencia operativa: un proyecto que ya tenía extensiones antes de este cambio no tiene registro de hashes y **no podrá publicarse** hasta que el propietario vuelva a subir su ZIP (falla cerrado). El Hub publica `@runly/module-compiler`: hay que republicar el paquete compartido para que los ZIP generados por el Hub usen la emisión corregida.

### 2.4 Clasificación de las pruebas que siguen fallando

Corrida completa al final de la etapa: ver §7. Las fallas restantes son todas preexistentes a F1A/F1B y ninguna es de seguridad de módulos:

| Grupo | Pruebas | Causa | Tipo |
|---|---|---|---|
| Suites de PostgreSQL | 5 archivos `website-*-postgres.test.js` | Necesitan una base de pruebas configurada (`*_TEST_DATABASE_URL`); sin ella el archivo termina con error | Entorno |
| Navegador | `marketplace-browser`, `prosemirror-clipboard-security`, `website-atlas-public-browser` | Playwright/fixtures de navegador; la de Atlas exige revisar la adopción de Atlas 0.11.0 de otra sesión | Entorno / otra sesión |
| Herramientas en Windows | `docker-shared-sources`, `shared-consumer-registry` (2) | `tar -czf` y `build-push --dry-run` en Windows | Plataforma |
| Catálogos generados desactualizados | `module-runtime-catalog`, `help-capabilities`, `pwa-identities` (icono `PanelsTopLeft`), `runly-module-registration`, `storefront-capture-foundation-contract`, `files-visibility` (tipo `TicketEvent`) | Contratos/catálogos que no se regeneraron tras cambios de producto | Deriva de contrato |
| Mocks desactualizados | `contacts-proposal-module` (2), `call-transcript-analysis-service` | `prisma.runlyModule.findMany is not a function`: mismo patrón corregido en F1A en otras pruebas | Prueba |
| Contrato MCP | `domain-contracts` ("Publicar expone páginas") | La matriz de sensibilidad del adaptador MCP difiere de la confirmación web | Revisar en F1B.8 (afecta a la confirmación humana de acciones MCP) |
| UI | `area-tree-resize` | Cálculo del ancho de un panel de inventario | Producto |

### 2.5 Suites versionadas (F1B.0.8)

- `pnpm test:security`: 14 archivos de pruebas unitarias de F1A/F1B (128 pruebas). Corre en cada push y PR mediante `.github/workflows/security-gates.yml`.
- `scripts/security/verify-module-security.mjs` (Docker, API real): 13 comprobaciones. Resultado: **13/13 PASS**.
- `scripts/security/verify-postgrest-exposure.mjs` (Docker): 7 comprobaciones. Resultado: **7/7 PASS** (0 de 390 relaciones servidas a anon; authenticated solo las 8 tablas de Realtime).
- Ambas verificaciones pueden lanzarse a mano desde el mismo workflow (`workflow_dispatch`). Usan su propio Supabase en Docker, sin secretos ni bases reales.

## 3. F1B.1 — Módulos instalados antes de F1A: confianza y cuarentena

### 3.1 Recorrido de ejecución revisado

Código de módulo instalado se importa en estos puntos; todos pasan ahora por `assertModuleCodeTrusted()`:

| Punto | Archivo | Proceso |
|---|---|---|
| Manifiesto, modelos, vistas (discovery, sync, install, restore) | `module-discovery-service.js` (`importLocalModule`) | API |
| `api/index.js`, `api/public.js`, `components/index.js` (también se importa en el servidor para registrarse), conexiones | `lib/module-import-revision.js` (`importModuleFile`) | API |
| `api/automations.js` | `automation-worker-service.js` | Worker |
| `api/events.js` | `domain-events/dispatcher.js` | Worker |
| `seed.js`, `teardown.js` | `module-lifecycle-service.js` | API |
| Bundle del navegador | `GET /modules/:key/bundle.js|css` (423 en cuarentena) | API → navegador |

No se tocaron: copias de staging/backups/vistas previas (ya pasaron la autoridad de staging), migraciones de datos (vienen del paquete en staging), código oficial (`apps/api`).

### 3.2 Modelo de confianza

- Registro `instance_config["module.trust.<key>"]`: `state` (`trusted`/`quarantined`), `trustedHashes` (últimos 10, para permitir rollback y restauración de backups de revisiones autorizadas), `authority`, actor, fecha y motivo.
- Se escribe al publicar un paquete que pasó una autoridad de código (después del intercambio y antes de recargar), o por decisión del propietario.
- Se ejecuta solo si el hash de los bytes en disco (excluyendo `.bundle`, `node_modules`, `.git`) está en `trustedHashes`. Cualquier otro caso es cuarentena, con motivo: `NO_TRUST_RECORD`, `CODE_CHANGED_SINCE_TRUSTED` o el motivo del propietario.
- Cuarentena = el código no se importa, no se montan sus rutas, no se sirve su bundle. **No** cambia `runly_module`, `company_module`, tablas, filas ni permisos. Solo un intento explícito de instalar o reintentar instalar un módulo en cuarentena lo deja en `ERROR`, que es reversible y conserva las tablas.
- Recuperación autorizada:
  1. Volver a publicar desde el Builder (admin de empresa, autoridad `builder-compiler`).
  2. Reinstalar desde el catálogo oficial.
  3. Que el propietario apruebe tras revisar el código (`POST /modules/:key/trust`).
  4. En una instancia sin propietario, que el operador del servidor apruebe con `node scripts/security/module-trust.mjs approve <key> --reviewed`.
- El gate se configura al arrancar la API y el worker; `module-trust-contract.test.js` falla si alguno deja de hacerlo o si un punto de importación pierde el gate.

### 3.3 Inventario

`node scripts/security/module-trust.mjs inventory [--json]` (solo lectura; nunca importa código de módulos): por cada `custom.*`/`community.*` reporta estado e instalación, empresas que lo usan, procedencia (Builder, *detached*, archivos de extensión, catálogo oficial o no y su sha256), registro de confianza, hash en disco y si coincide, código backend (`api/*.js`, `seed.js`, `teardown.js`), frontend (`components/index.js`, bundle), archivos importados por el servidor, migraciones, capacidades consumidas (`consumes`) y veredicto:

| Veredicto | Significado | Acción |
|---|---|---|
| `TRUSTED` | Bytes autorizados | Ninguna |
| `REPUBLISH_FROM_BUILDER` | Proyecto Builder no *detached* y sin extensiones | Un admin lo vuelve a publicar |
| `REINSTALL_FROM_OFFICIAL_CATALOG` | Instalado del catálogo oficial | Reinstalar/actualizar desde el catálogo |
| `OWNER_CODE_REVIEW` | Procedencia desconocida, ZIP previo, *detached* o con extensiones | El propietario revisa `modules/custom/<key>/` y aprueba o deja en cuarentena |
| `NO_CODE_ON_DISK` | Fila en base sin código | Revisar; no se ejecuta nada |

Complemento SQL de F1A: `scripts/security/module-provenance-diagnostic.sql`.

### 3.4 Matriz de compatibilidad de módulos

| Tipo de módulo | Tras F1B.1 | Qué hacer en una instancia existente |
|---|---|---|
| Oficial (`apps/api`) | Sin cambios | — |
| Oficial del catálogo (instalado como `custom.*`) | Cuarentena hasta reinstalar | Reinstalar desde el catálogo oficial |
| Builder publicado antes de F1B, sin extensiones | Cuarentena | Volver a publicar (un clic de un admin) |
| Builder con pantallas React | Cuarentena; publicar exige que el propietario vuelva a subir el ZIP | Propietario sube el ZIP de nuevo |
| Builder *detached* / ZIP de desarrollador | Cuarentena | Revisión del propietario o reinstalación del ZIP por el propietario |
| Catálogo comunidad/managed | Cuarentena | Reinstalación por el propietario |
| Publicado después de F1A por una autoridad | `TRUSTED` | — |

### 3.5 Verificación de flujos

| Flujo | Resultado | Evidencia |
|---|---|---|
| Discovery y bootstrap | Módulo previo en cuarentena al arrancar, ningún canario ejecutado | E2E 13/13; log `quarantined (NO_TRUST_RECORD)` |
| Reinstalación / actualización | Publicar con autoridad registra los nuevos bytes y levanta la cuarentena | E2E (propietario, Builder) |
| Rollback / restauración de backup | Permitido si la revisión estaba entre las últimas 10 autorizadas | `module-trust.test.js` |
| Cambio en disco | Vuelve a cuarentena | `module-trust.test.js` |
| Importación ZIP | Puerta de F1A + registro de confianza | E2E |
| Marketplace | Instalación por `publishZip` con autoridad → registro | Pruebas de catálogo + diseño |
| MCP | No tiene herramientas de instalación ni de código de módulos | Búsqueda en `apps/api/src/mcp` |
| Datos | Fila del módulo, `company_module` y tablas intactos en cuarentena | E2E |

## 4. F1B.2 — Threat model

Documento: `docs/architecture/2026-11-23-rme3-threat-model.md`. Distingue Core, oficiales, declarativos, Builder, extensiones, terceros con código, Developer Mode, admin de empresa, admin de sistema, propietario y operador. Cubre 17 amenazas. Siguen abiertas, por diseño, hasta el nuevo runtime:

- acceso a secretos del host (T6),
- lectura entre empresas por parte de un módulo confiable (T7),
- dependencias maliciosas (T10),
- agotamiento de recursos (T11),
- SSRF desde código de módulo (T12),
- robo de sesión desde componentes en el navegador (T15),
- exfiltración por servicios permitidos (T16).

Hallazgo de frontend confirmado (base de F1B.5): los bundles se importan con `import()` en el mismo contexto que la aplicación (`ModuleBundleLoader.jsx:23`), la sesión de Supabase se guarda en `localStorage` (`lib/supabase.js:62`) y la aplicación no envía CSP. Cualquier componente personalizado, aunque sea de confianza, puede leer el token del usuario y llamar a la API como él en todas sus empresas. El aislamiento del backend no protege esto.

## 5. F1B.3 / F1B.4 — Diseño para revisión

- ADR: `docs/architecture/adr-secure-module-runtime.md`. Compara cuatro opciones: A declarativo, B procesos con aislamiento del sistema operativo, C contenedores, D híbrido. Evalúa seguridad, latencia, memoria, operación, Windows/Linux/Docker, self-hosted, multiempresa y compatibilidad. **Recomienda D**: el Builder pasa a ser declarativo e interpretado por el host (sin JS de servidor generado), el código de terceros corre en un contenedor por módulo sin credenciales ni entorno del host, y los componentes se muestran en un iframe aislado con un puente. Incluye un plan de migración gradual en pasos M0–M6.
- Contrato del gateway: `docs/architecture/2026-11-23-rme3-capability-gateway-contract.md`.
  - Denegación por defecto.
  - Identidad del módulo atada al hash de confianza.
  - Contexto de empresa firmado por el host (nunca aceptado del módulo).
  - Permisos verificados en cada operación, cuotas, versionado `v1`, revocación ≤ 5 min, idempotencia y auditoría.
  - Diez capacidades: registros, relaciones, archivos, notificaciones, eventos, jobs, automatizaciones, HTTP con allowlist, secretos del módulo y auditoría.
  - Alcance de la PoC con seis pruebas de aceptación.

## 6. Procedimiento de aceptación en staging y producción

1. **Staging** (datos sintéticos, dos empresas):
   1. Desplegar la release.
   2. `prisma migrate deploy` (aplica `20270114000000`).
   3. Ejecutar `postgrest-exposure-diagnostic.sql` y `module-trust.mjs inventory`.
   4. Correr `verify-postgrest-exposure.mjs` y `verify-module-security.mjs` contra una copia desechable de la misma imagen.
   5. Recuperar cada módulo según §3.4 y comprobar que sus pantallas funcionan.
   6. Marcar **VERIFICADO EN STAGING** solo con todas las salidas guardadas.
2. **Producción, por instancia**:
   1. Antes de desplegar: `module-trust.mjs inventory` para conocer qué quedará en cuarentena, y avisar a las empresas afectadas.
   2. Respaldo.
   3. Desplegar.
   4. Ejecutar los diagnósticos SQL (§11 de `postgrest-exposure-diagnostic.sql`: sin filas sospechosas en el historial).
   5. Recuperar los módulos (republicar Builder, reinstalar oficiales, revisión del propietario).
   6. Repetir el inventario hasta que no quede ningún `OWNER_CODE_REVIEW` sin decidir.
   7. Solo entonces marcar **CERRADO EN PRODUCCIÓN** para esa instancia.
3. Reversión: volver a la imagen anterior restaura el comportamiento previo (los registros de confianza en `instance_config` se ignoran). No se borra ni se migra ningún dato de módulos.

## 7. Antes / después

| Medición | Antes (cierre F1A) | Después |
|---|---|---|
| Admin de empresa ejecuta código en el servidor vía Builder | **Sí** (default y extensiones) | No (fuzz + E2E) |
| Módulo instalado antes de F1A ejecuta código al arrancar | Sí | No (cuarentena, datos intactos) |
| Puntos de importación de código de módulo con gate | 0 | 6 (con prueba de contrato) |
| Suites de seguridad en CI | Ninguna | `pnpm test:security` en cada push/PR |
| Verificaciones E2E versionadas | 0 (harness locales) | 2 (13/13, 7/7) |
| Suite completa | 22 fallas en F1A (6451 pruebas) | 22 fallas, 6473 pass, 12 skipped de 6507; mismo conjunto que F1A, ninguna nueva |

## 8. Riesgos residuales y bloqueadores

| ID | Riesgo | Severidad | Siguiente paso |
|---|---|---|---|
| R-1 | Código autorizado sigue en el proceso de la API (secretos, Prisma global, event loop) | P1 | ADR (M1–M6) |
| R-2 | Componentes personalizados pueden leer la sesión del usuario | P1 | F1B.5 (iframe aislado + CSP) |
| R-3 | Al desplegar, módulos existentes quedan en cuarentena hasta recuperarlos | Operativo | Procedimiento §6; aviso a las empresas |
| R-4 | Proyectos Builder con extensiones previas no publican hasta que el propietario vuelva a subir el ZIP | Operativo | Comunicar; flujo de UX en F1B.8 |
| R-5 | La UI todavía no muestra el estado de confianza ni oculta acciones reservadas al propietario | P3 | F1B.8 |
| R-6 | El fuzz del compilador cubre los valores presentes en las plantillas; otros campos dependen del validador | P2 | Ampliar con definiciones de prueba de cada característica |
| R-7 | nodemailer, xmldom y el SDK de MCP siguen vulnerables | P1 | F1B.6 |
| R-8 | API y worker corren como root | P1 | F1B.7 |
| R-9 | Con varias réplicas de la API, la caché de contexto del propietario tarda hasta 300 s en invalidarse | P3 | Invalidación compartida |
| R-10 | Republicar `@runly/module-compiler` para el Hub | Operativo | Antes del siguiente release del Hub |
| B-1 | Sin staging: nada VERIFICADO EN STAGING | — | §6 |

## 9. Pendiente para la siguiente etapa (tras la revisión)

- F1B.4 PoC (M1), F1B.5 aislamiento del frontend, F1B.6 dependencias, F1B.7 contenedores no root, F1B.8 UX de confianza y recuperación.
- Criterios de F1B.9 que esta etapa ya cumple:
  - pruebas negativas entre dos empresas,
  - módulos antiguos impedidos de ejecutar,
  - Builder declarativo conservado,
  - módulos oficiales operativos,
  - autoridades no falsificables,
  - suites críticas versionadas,
  - lint (solo el error preexistente ajeno `scripts/verify-bookings-rooms.mjs:34`) y privacidad (40 hallazgos preexistentes, sin nuevos).
- Criterios de F1B.9 que quedan pendientes: PoC aislada sin Prisma ni secretos, límites de recursos, revisión de seguridad del frontend completa, dependencias críticas, API no root y build completo.

P0-01 sigue **CONTENIDO**, no cerrado. RME3 y Module Builder Next siguen en **NO GO**.
