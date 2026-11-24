# RUNLY ERP — F0: Auditoría integral de plataforma (2026-11)

- Referencia: `main` @ `87b01501c4467998c3be2f901a3cc03e063ff5b4` (2026-11-23), árbol limpio.
- Alcance: diagnóstico. No se corrigió código funcional, no se hizo commit/push/deploy.
- Entorno de medición: estación de desarrollo Windows 11, Node v22, pnpm 9.15.0. Sin acceso a base de datos real ni a producción.
- Convención de confianza: **Confirmado** = reproducido con comando o leído en código con cadena completa; **Probable** = evidencia parcial; **Por verificar** = hipótesis con prueba de verificación propuesta.

---

## 1. Resumen ejecutivo

| Área | Estado | Hallazgo dominante |
|---|---|---|
| Arquitectura | Amarillo | Monolito API (Hono) con módulos cargados *in-process*; 23 archivos > 1000 líneas, 7 > 1500 |
| Seguridad | **Rojo** | Un administrador de empresa puede ejecutar código arbitrario en el servidor (ZIP de módulo) |
| Rendimiento | Amarillo/Rojo móvil | El shell autenticado arrastra 8.8 MB raw / 2.4 MB gzip de JS estático |
| Calidad / CI | **Rojo** | CI no ejecuta tests, lint ni build; 31 tests fallan en `main`, varios de seguridad |
| Operaciones | Amarillo | Backups implementados, nunca restaurados contra un entorno real; sin observabilidad estructurada |
| Legal | Amarillo | Dependencias GPL (country-state-city GPL-3.0, @ffmpeg/core GPL-2.0+) distribuidas en un producto propietario |
| RME3 / Builder | Amarillo | Motor rico; el Builder no cubre eventos/consumes, workflows, validaciones ni permisos por registro |

**Recomendación: NO GO para ampliar RME3 (Module Builder o capacidades de motor) hasta cerrar P0-01 y P0-02, y GO CON CONDICIONES después** (ver §9).

### Mediciones clave

| Métrica | Valor | Comando |
|---|---|---|
| Archivos versionados | 7715 | `git ls-files \| wc -l` |
| Líneas JS/JSX/MJS versionadas | ~667 800 | `git ls-files '*.js' '*.jsx' '*.mjs' \| xargs cat \| wc -l` |
| Migraciones Prisma | 299 | `ls prisma/migrations` |
| Modelos Prisma | 344 | `grep -c '^model ' prisma/schema.prisma` |
| Vulnerabilidades (pnpm audit) | 2 critical, 30 high, 39 moderate, 9 low (1621 deps) | `pnpm audit --json` |
| Tests | 6735 tests: 6687 pass, **31 fail**, 17 skipped (379 s) | `node --test` con globs `apps/ packages/ scripts/ infra/` |
| Lint | 1 error (5926 archivos) | `npx eslint .` |
| Build web | OK en 8.4 s | `vite build --outDir <scratch>` |
| JS total producción | 39.7 MB (771 archivos), CSS 0.9 MB, dist 124 MB | `find … stat` |
| Carga inicial (pre-login) | 1.0 MB raw / 278 KB gzip | cierre estático de `index-*.js` |
| Shell autenticado (`AppEntry`) | 8.8 MB raw / 2.4 MB gzip, 129 chunks | cierre estático de `AppEntry-*.js` |

---

## 2. Inventario

### 2.1 Aplicaciones y paquetes

| Workspace | Nombre | Rol | Deps prod | Depende de (workspace) |
|---|---|---|---|---|
| apps/api | @runly/api | API Hono, lógica de negocio, MCP, carga de módulos | 53 | core, module-engine, module-compiler, validators, preview-runtime, studio-interchange |
| apps/desktop | @runly/desktop | React + Vite + Tauri 2 (web, Windows, Android, iOS) | 78 | core, offline, sdk, ui, module-compiler, preview-runtime, website-blocks, studio-interchange |
| apps/worker | @runly/worker | Jobs en segundo plano | 5 | core |
| apps/backup, dwg, transcriber, tts | contenedores opcionales | backup restic, DWG→DXF, Whisper, Piper | — | — |
| packages/core | @runly/core | registro de módulos, bus de eventos | 0 | — |
| packages/module-engine | @runly/module-engine | primitivas RME3, SQL, contratos | 2 | core |
| packages/module-compiler | @runly/module-compiler | ModuleDefinition → paquete ZIP, inspección estática | 3 | module-engine |
| packages/ui | @runly/ui | componentes compartidos (barrel de 445 líneas) | 39 | core |
| packages/sdk | @runly/sdk | cliente API (archivo único de 3333 líneas) | 0 | — |
| packages/validators | @runly/validators | Zod compartido (1095 líneas en index.js) | 1 | — |
| packages/offline, preview-runtime, studio-interchange, website-blocks, storefront-sdk | soporte | — | — | — |

Observación: existen alias duplicados `@atlas/*` → `@runly/*` en `package.json` raíz, `apps/desktop`, `apps/worker` y en 15 archivos fuente. Es deuda de migración de marca que duplica rutas de resolución.

### 2.2 Tests por área (1156 archivos de test)

apps/api 575 · apps/desktop 314 · packages/ui 49 · module-compiler 29 · scripts/tests 28 · infra/installer 22 · sdk 22 · module-engine 18 · apps/shared 16 · offline 14 · resto < 12.

Hay 30+ suites `*-postgres.test.js` que solo corren con una base local desechable (`*_TEST_DATABASE_URL`, `RUN_CROSS_TENANT_TESTS=1`). **No se ejecutaron en esta auditoría** y ninguna corre en CI.

### 2.3 CI/CD (`.github/workflows/`)

| Workflow | Disparador | Qué hace |
|---|---|---|
| uuid-policy.yml | push / PR | `node scripts/enforce-uuid-policy.mjs` |
| supabase-schema-ownership-policy.yml | push / PR | `node scripts/enforce-supabase-schema-ownership-policy.mjs` |
| shared-packages.yml | manual | tests dirigidos de 3 paquetes + publicación controlada |

No existe ningún workflow que ejecute la suite de tests, lint, build, `pnpm audit`, escaneo de secretos ni checks de privacidad en push/PR.

---

## 3. Matriz de hallazgos

Severidad: **P0** bloqueante (compromiso de datos/seguridad multiempresa), **P1** alto (arreglar antes de ampliar), **P2** medio (planificar), **P3** bajo/higiene.

| ID | Sev | Área | Título | Confianza |
|---|---|---|---|---|
| P0-01 | P0 | Seguridad | Admin de empresa ejecuta código arbitrario en la API vía ZIP de módulo | Confirmado (lectura de código) |
| P0-02 | P0 | Seguridad | Posible exposición PostgREST de tablas `public` sin RLS con la anon key | Por verificar |
| P1-01 | P1 | Seguridad | Hono 4.13.7 en runtime: advisories de bypass de middleware `*` | Confirmado (versión) / Probable (explotabilidad) |
| P1-02 | P1 | Seguridad | nodemailer 8.0.10 y zod 4.4.3 vulnerables en runtime | Confirmado (versión) |
| P1-03 | P1 | Calidad | CI no ejecuta tests/lint/build; 31 tests fallan en `main` | Confirmado |
| P1-04 | P1 | Calidad/Seg | Tests de seguridad rotos: precio de checkout, autorización runtime, catálogo RBAC | Confirmado |
| P1-05 | P1 | Rendimiento | Shell autenticado carga 2.4 MB gzip de JS estático | Confirmado |
| P1-06 | P1 | Operaciones | Restauración de backup nunca ejecutada contra un entorno real; RPO/RTO sin definir | Confirmado (doc propia) |
| P1-07 | P1 | Legal | country-state-city (GPL-3.0) empaquetado en el frontend distribuido | Confirmado (licencia) |
| P1-08 | P1 | Legal | @ffmpeg/core (GPL-2.0-or-later) distribuido como wasm | Confirmado (licencia) |
| P2-01 | P2 | Seguridad | CORS refleja cualquier origen con `credentials: true` | Confirmado / impacto bajo hoy |
| P2-02 | P2 | Seguridad | Verificación JWT local sin `aud`/`role`; tokens de invitado firmados con el mismo secreto | Confirmado / mitigado |
| P2-03 | P2 | Seguridad | Revocación de sesión y permisos con latencia de hasta 5 min (cachés en proceso) | Confirmado |
| P2-04 | P2 | Seguridad | Contenedor API sin `USER` (root) e imágenes base sin digest | Confirmado |
| P2-05 | P2 | Seguridad | Rangos `latest` en dependencias de producción | Confirmado |
| P2-06 | P2 | Seguridad | Script advisor descarga SQL de `main` remoto y lo ejecuta con credenciales de DB | Confirmado |
| P2-07 | P2 | Seguridad | Tipo de archivo en uploads basado en MIME/extensión declarados | Probable |
| P2-08 | P2 | Seguridad | fabric 6.9.1 (XSS en exportación SVG), xmldom 0.1.31 sin versión parcheada | Confirmado (versión) |
| P2-09 | P2 | Arquitectura | Monolitos: `index.js` 2756, `routes/modules.js` 2876, `sdk/index.js` 3333 líneas | Confirmado |
| P2-10 | P2 | Arquitectura | Caché y estado en proceso: impide escalar a más de una réplica de API | Confirmado |
| P2-11 | P2 | Arquitectura | Contratos duplicados engine↔API mantenidos con comentarios "keep in sync" | Confirmado (con fallos de test como evidencia) |
| P2-12 | P2 | Rendimiento | `ui-vendor` agrupa tiptap + radix + lucide + sonner (1.7 MB) | Confirmado |
| P2-13 | P2 | Rendimiento | ~130 sitios de polling / `setInterval`, intervalos de 5–8 s | Confirmado (conteo) / impacto por medir |
| P2-14 | P2 | Calidad | ESLint solo aplica reglas propias; react-hooks desactivado | Confirmado |
| P2-15 | P2 | Operaciones | Sin observabilidad estructurada (411 `console.*` en API, sin métricas/trazas) | Confirmado |
| P2-16 | P2 | Seguridad | Escaneo de secretos no ejecutable: Gitleaks no instalado; 40 hallazgos de política de privacidad | Confirmado |
| P2-17 | P2 | RME3 | Builder no expone eventos/consumes, workflows, validaciones ni permisos por registro | Confirmado |
| P3-01 | P3 | Seguridad | Vulnerabilidades solo en tooling (tar vía canvas, prisma CLI: mysql2, effect, deepmerge-ts) | Confirmado |
| P3-02 | P3 | Seguridad | Tamaño descomprimido del ZIP se valida con el encabezado declarado | Probable |
| P3-03 | P3 | Seguridad | Dependencias Rust (Tauri) no auditadas | Confirmado (falta de evidencia) |
| P3-04 | P3 | Arquitectura | Alias `@atlas/*` duplicados | Confirmado |
| P3-05 | P3 | Calidad | 23 archivos > 1000 líneas incumplen la regla de tamaño | Confirmado |

---

## 4. Detalle de hallazgos

### P0-01 — Ejecución de código arbitrario en el servidor por un administrador de empresa

- **Qué se observó.** La subida de módulos acepta un ZIP con `api/index.js` escrito a mano y lo importa en el proceso de la API, pasándole el cliente Prisma sin restricción de empresa.
- **Evidencia (cadena completa):**
  1. `apps/api/src/lib/tenant-context.js:15`: `COMPANY_ADMIN_ROLE_KEYS = new Set(["runly.admin"])`.
  2. `apps/api/src/index.js:547-548`: un rol admin de empresa recibe **todas** las claves de permiso activas (`getAllActivePermissionKeys()`), y `index.js:609` deja pasar cualquier `requirePermission` si `tenant.isAdmin`.
  3. `apps/api/src/routes/modules.js:2769-2803`: `POST /modules/:key/upload` exige solo `core.modules.upload`. No hay comprobación de propietario de plataforma: `grep isPlatformOwner` no aparece en `routes/modules.js`, `builder-routes.js` ni `module-package-service.js`.
  4. `apps/api/src/services/module-package-staging-service.js:223` solo detecta si existe `api/index.js`; no rechaza código no generado por el compilador. El "modo desarrollador" es una función prevista (`routes/modules.js:2804-2806`).
  5. `apps/api/src/services/route-loader-service.js:388-404`: `importModuleFile(apiPath)` y `factory({ prisma, ... })`. El código corre con el Prisma global (todas las empresas), `process.env` (SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET, DATABASE_URL) y el sistema de archivos.
  6. Agravante: `infra/docker/api.Dockerfile` no declara `USER`, así que el proceso corre como root dentro del contenedor (P2-04).
- **Impacto.** En una instancia con varias empresas, el admin de cualquiera de ellas puede leer o modificar los datos de todas, exfiltrar secretos y persistir código. En una instancia de una sola empresa el admin ya es dueño de la instalación y el riesgo es mucho menor.
- **Confianza.** Confirmado por lectura de código. No se explotó.
- **Solución sugerida.** (a) Restringir `upload`, `upload/check`, publicación de catálogo y el modo desarrollador del Builder al propietario de plataforma (`isPlatformOwner`) y quitar `core.modules.*` del conjunto que se concede a `runly.admin`. (b) A medio plazo, aislar el código de módulos: proceso o worker separado con un rol de DB limitado por empresa (RLS + `SET app.company_id`), sin `process.env` completo. (c) Contenedor no-root.
- **Verificación.** Test de integración: un usuario `runly.admin` sin propiedad de plataforma recibe 403 en `POST /modules/x/upload` y `/upload/check`; el propietario de plataforma recibe 200. Más un test de contrato que impida volver a conceder `core.modules.upload` a roles de empresa.

### P0-02 — Posible exposición de tablas `public` sin RLS vía PostgREST (por verificar)

- **Qué se observó.** `infra/installer/supabase/docker-compose.supabase.yml:118,299` expone `PGRST_DB_SCHEMAS: public,graphql_public`. Las migraciones crean 392 tablas y solo hay 92 sentencias `ENABLE ROW LEVEL SECURITY` (58 migraciones). Los `REVOKE … FROM anon, authenticated` son por tabla o por función (p. ej. `20260911000000_multi_tenant_schema_hardening:52`, `20270109100000_lms_rls_hardening`), no un `ALTER DEFAULT PRIVILEGES` global. El frontend incluye `@supabase/supabase-js` con la anon key. La API se conecta con un rol que salta RLS, así que el aislamiento depende del código de la aplicación.
- **Impacto si se confirma.** Con la anon key pública y los grants por defecto de Supabase, `GET /rest/v1/<tabla>` podría devolver filas de todas las empresas.
- **Confianza.** Por verificar: depende de los privilegios por defecto reales de la instancia, que no se inspeccionaron.
- **Verificación (solo lectura, en cada instancia):**
  ```sql
  SELECT c.relname,
         c.relrowsecurity AS rls,
         has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
         has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_select
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND NOT c.relrowsecurity
    AND (has_table_privilege('anon', c.oid, 'SELECT') OR has_table_privilege('authenticated', c.oid, 'SELECT'));
  ```
  Si devuelve filas, es P0 confirmado.
- **Solución sugerida.** Una migración forward que haga `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated`, más `ALTER DEFAULT PRIVILEGES … REVOKE`, y otorgar explícitamente solo lo que Realtime/Storage necesitan. Añadir la consulta anterior como test en CI contra una base desechable.

### P1-01 — Hono 4.13.7 en runtime de la API

- **Evidencia.** `apps/api/node_modules/hono` → `.pnpm/hono@4.13.7` (`apps/api/package.json:37` `^4.13.7`). Advisories que aplican (`pnpm audit`): "RegExpRouter skips wildcard middleware for some route sets and for paths with an encoded line terminator" (<=4.13.15), "`mount()` can forward a path that bypasses middleware scoped inside the mount prefix", y "`validator('form')` skips validation for multipart with extra parameters".
- **Impacto.** La autenticación se aplica con `secured.use("*", authMiddleware)` (`index.js:2590-2595`) y `app.use('*', …)`. Un bypass del middleware comodín sería un bypass de autenticación. La explotabilidad concreta con este conjunto de rutas no se probó.
- **Confianza.** Versión confirmada; explotabilidad probable, no reproducida.
- **Solución.** Subir `hono` a >=4.13.16 y `@hono/node-server` a >=2.1.3 en `apps/api` y en el override raíz.
- **Verificación.** `pnpm why hono` muestra solo versiones >=4.13.16, y un test que llame a una ruta protegida con `%0A`/`%0D` en la ruta y espere 401.

### P1-02 — nodemailer 8.0.10 y zod 4.4.3

- **Evidencia.** `apps/api > nodemailer@8.0.10`: 14 advisories, entre ellos DoS cuadrático en `addressparser`, bypass de la lista de dominios permitidos por IDN y comentarios RFC 5322, y reutilización de la caché DNS/TLS `servername` entre transportes ("cross-tenant SMTP credential disclosure", <10.0.2). `. > zod@4.4.3`: "exhaust memory validating oversized constrained collections" (<4.6.6). `apps/api` usa zod 4.6.7 (`"zod": "latest"`), pero la raíz y `@runly/validators` resuelven 4.4.3.
- **Impacto.** El envío de correo depende de direcciones que introducen los usuarios (invitaciones, automatizaciones `email.send`). El advisory de caché TLS es relevante si cada empresa configura su propio SMTP. La memoria de zod afecta a la validación de entradas públicas.
- **Solución.** nodemailer >=10.1.4 (major: revisar la API) y zod >=4.6.6 en la raíz.
- **Verificación.** Un `pnpm audit --prod` limpio para estos paquetes, más los tests de correo existentes.

### P1-03 — CI sin puertas de calidad y `main` en rojo

- **Evidencia.** §2.3. La suite completa da 31 fallos (§2 Mediciones). `npx eslint .` da 1 error (`scripts/verify-bookings-rooms.mjs:34`, `toISOString().slice`, commit ce24be120 del 2026-11-21).
- **Agrupación de fallos (causa observada):**
  - Mocks desactualizados tras cambios recientes: `prisma.companyModule.findMany is not a function` (`module-runtime-routes.test.js`, `public-catalog-router.test.js`), y checkout con 500 tras el commit de pedidos 139591897.
  - Catálogos desincronizados: `rbac-granular-contract.test.js` (8 permisos sin catálogo: `website.domains.manage`, `website.forms.*`, `website.submissions.*`, `bookings.reserve`), `module-runtime-catalog.test.js`, `help-capabilities.test.js`, `files-visibility.test.js` (`TicketEvent`), `pwa-identities.test.js` (icono `PanelsTopLeft`), `runly-module-registration.test.js`.
  - Postgres sin runner: 5 suites `website-*-postgres.test.js` lanzan `Disposable runner required` en lugar de quedar en skip.
  - Entorno Windows: `shared-consumer-registry.test.mjs` (`tar: Cannot connect to C:`), `docker-shared-sources.test.mjs`, `installer-devkit-snapshot.test.js`, `runly-env-config.test.js`.
  - Otros: `storefront-capture-foundation-contract.test.js` (fallo preexistente ya documentado en CLAUDE.md), `marketplace-browser.test.js` (13 s, UI), `area-tree-resize.test.js`, `prosemirror-clipboard-security.test.mjs`, `domain-contracts.test.js` (MCP), `call-transcript-analysis-service.test.js`, `contacts-proposal-module.test.js`.
- **Impacto.** Ninguna regresión se detecta automáticamente, y los tests de seguridad ya no protegen (P1-04).
- **Solución.** Un workflow `ci.yml` en push/PR con `pnpm install --frozen-lockfile`, `pnpm lint`, `node --test` (globs), `vite build` y `pnpm audit --prod --audit-level=high` con allowlist documentada. Opcional: un job con Postgres de servicio para las suites `*-postgres`. Las suites Postgres deben hacer `skip` en vez de `throw` cuando falta su variable.
- **Verificación.** El workflow corre en verde en `main` y una PR con un test roto queda bloqueada.

### P1-04 — Tests de seguridad rotos

- `apps/api/src/routes/website/__tests__/checkout-routes.test.js:72,92`: "ignores a tampered client price and charges the real catalog price" y "validates variant belongs to the product" devuelven 500 (se esperaba 200). La garantía de que el precio sale del catálogo **no está verificada** en el código actual. No se afirma que haya un bug en producción.
- `apps/api/src/routes/__tests__/module-runtime-routes.test.js:4`: "declared runtime invocation … delegates tenant authorization" devuelve 500 (se esperaba 403).
- `rbac-granular-contract.test.js:61`: 8 permisos declarados en manifiestos que no están en `PERMISSION_CATALOG`. Puede dejar pantallas sin permiso asignable o depender del bypass de admin.
- `mcp/__tests__/domain-contracts.test.js`: "sensibilidad declarada por adaptador: misma matriz que la confirmación web" falla, así que el contrato de confirmación de acciones sensibles del MCP no está verificado.
- **Solución.** Arreglar los mocks y catálogos y añadirlos a CI (P1-03). Para checkout, además, un test postgres de extremo a extremo.
- **Verificación.** Los cuatro tests pasan y forman parte del job obligatorio.

### P1-05 — Peso del shell autenticado

- **Evidencia (build de producción, cierre de imports estáticos, sin contar `import()` dinámicos):**
  - Pre-login (`index-*.js`): 12 archivos, 1 006 424 B raw / 277 817 B gzip. react-vendor 628 KB, supabase-vendor 195 KB.
  - `AppEntry-*.js` (shell tras login): 129 archivos, **8 799 716 B raw / 2 412 436 B gzip**. Mayores: `src-*.js` 2.04 MB (barrel `@runly/ui`, contiene `RunlyTable`, `ConfirmDialog`, etc.), `ui-vendor` 1.72 MB, `runlyBlocks` 0.80 MB, `AppEntry` 0.61 MB, `pdf-*` 0.39 MB, `PieChart` (recharts) 0.34 MB, `atlas-web-builder` 0.34 MB, `NoteEditor` 0.12 MB.
  - `AppEntry` importa estáticamente `NoteEditor`, `RunlySiteFrame`, `atlas-web-builder`, `runlyBlocks`, `PieChart`, `NewMeetingDialog`, `FileSharingDialog`, `CallsProvider`, `usePurchases`, `useWebsite`, entre otros (lista de `from"./…"` en el chunk).
  - Correcto: `country-state-city` (8 MB) sí carga de forma diferida (`packages/ui/src/lib/geoData.js:13-29`); `ffmpeg-core.wasm` (32 MB) y las fuentes Studio son estáticos bajo demanda.
- **Impacto.** En un Android de gama media con 4G, parsear y evaluar ~8.8 MB de JS antes de la primera pantalla útil es el cuello de botella más probable. Esto **no se midió en dispositivo**; ver el protocolo en §6.
- **Solución.** (a) Sacar del grafo estático de `AppEntry` todo lo que es de pantalla (notas, website, compras, llamadas, gráficas) mediante `lazy()`. (b) Romper el barrel `@runly/ui` con imports por subruta o `sideEffects: false` + ESM puro y verificar el tree-shaking. (c) Separar `ui-vendor`: tiptap en su propio chunk.
- **Verificación.** Script de cierre estático (`closure.mjs`, §8) en CI con presupuesto: `AppEntry` <= 900 KB gzip en la primera iteración.

### P1-06 — Recuperación ante desastre no demostrada

- **Evidencia.** `docs/deployment/backup-acceptance.md:4`: "implementation verified with synthetic infrastructure; real B2/Supabase acceptance pending". Todo el checklist de ensayo real (líneas 52-65) está sin marcar. Las líneas 67-80 dicen que no se localizó el kit de recuperación (contraseña restic original) y que "the code is not sufficient evidence of recovery".
- **Impacto.** Ante una pérdida de datos no hay evidencia de que se pueda restaurar, ni RPO/RTO acordados.
- **Solución.** Ejecutar el ensayo documentado en un entorno aislado, registrar tiempos y fijar RPO/RTO. Añadir monitorización independiente que detecte un backup ausente.
- **Verificación.** El checklist queda marcado con `Verified: YYYY-MM-DD (...)` según la convención del repo.

### P1-07 / P1-08 — Licencias copyleft en el producto distribuido

Ver la matriz legal (§7).

### P2-01 — CORS reflexivo con credenciales

- `apps/api/src/index.js:913-914`: `origin: (origin) => origin || "*", credentials: true`.
- Hoy el impacto es bajo, porque la API autentica con `Authorization: Bearer`, que un tercer origen no puede leer. Las cookies existentes (`services/external-identity/auth-router.js:35` `rx_session` `SameSite=Lax`, y la cookie de preview en `routes/website/preview-routes.js:31`) no viajan en `fetch` cross-site con Lax.
- Riesgo latente: cualquier endpoint futuro autenticado por cookie quedaría legible desde cualquier origen.
- **Solución.** Una lista de orígenes permitidos (app, dominios de sitios publicados, esquemas Tauri/Capacitor) y `credentials` solo donde haga falta.
- **Verificación.** Un test que envíe `Origin: https://evil.example` y compruebe que no hay `Access-Control-Allow-Origin` reflejado.

### P2-02 — Verificación JWT local

- `apps/api/src/services/jwt-verification.js:35-71` comprueba firma HS256, `exp` y `nbf`, pero no `aud` ni `role`. `routes/chat/guest-service.js:24-31` firma tokens de invitado con el mismo `SUPABASE_JWT_SECRET`, con `sub = guestSessionId` y `role: "authenticated"`.
- Mitigación vigente: `services/company-access-policy.js:24-28` exige membresías activas para ese `sub`, y un invitado no tiene ninguna (403). Las rutas `BOOTSTRAP` (`/user/me`, `/memberships/me`, …) sí se alcanzan con ese token.
- **Solución.** Rechazar en el middleware los tokens con `guest_session_id` o con `role` distinto de `authenticated`, y exigir `aud === 'authenticated'`.
- **Verificación.** Un test unitario de `createAuthMiddleware` con un token de invitado que espere 401.

### P2-03 — Latencia de revocación

- `auth-middleware.js:59-62`: la verificación local no consulta revocación y cachea la identidad hasta 300 s. `lib/cache.js:10`: `USER_CONTEXT: 300`.
- Un usuario desactivado o con sesión cerrada sigue operando hasta que vence el token (1 h por defecto en Supabase). Los cambios de membresía dependen de `cacheDel` explícitos.
- **Solución.** Comprobar `session_id` contra `auth.sessions` en rutas sensibles o acortar la vida del token, e invalidar `user_ctx:*` en todas las escrituras de membresía, rol y grant.
- **Verificación.** Test: desactivar un perfil hace que la siguiente petición devuelva 403 en menos de N segundos.

### P2-04 — Contenedores

- `infra/docker/api.Dockerfile`, `worker.Dockerfile`, `transcriber.Dockerfile` y `tts.Dockerfile` no tienen `USER`; solo `dwg.Dockerfile:29` lo declara.
- Las imágenes base se referencian por tag móvil (`node:22-alpine`, `nginx:alpine`, `python:3.11-slim`) sin digest.
- **Solución.** Usuario no-root y `FROM …@sha256:` con renovación automatizada.

### P2-05 — Rangos `latest`

- `apps/desktop/package.json`: `react`, `react-dom`, `@tanstack/react-query`, `lucide-react`, `zustand` en `latest`. `apps/api/package.json:64`: `"zod": "latest"`. Raíz: `concurrently: latest`.
- El lockfile mitiga el riesgo mientras se use `--frozen-lockfile`, pero cualquier `pnpm update` o lockfile regenerado puede saltar de major.
- **Solución.** Fijar rangos `^x.y.z`.

### P2-06 — SQL remoto sin fijar

- `scripts/check-supabase-advisor-equivalent.mjs:8-25` descarga `splinter.sql` desde la rama `main` de un repositorio público y lo ejecuta con las credenciales de `DATABASE_URL`. Un cambio upstream ejecutaría SQL arbitrario con privilegios de administrador.
- **Solución.** Vendorizar el archivo con hash o fijar un commit SHA y verificar su sha256.

### P2-07 — Validación de tipo de archivo

- `apps/api/src/services/files-service.js:10` limita a 10 MB, y `isAllowedMimeType` (`:179`) decide por MIME y extensión. No se encontró detección por firma (magic bytes) en `files-service.js`.
- **Confianza.** Probable. Conviene confirmar si Storage sirve con `Content-Type` declarado y `Content-Disposition`.
- **Solución.** Detección por contenido para tipos renderizables (SVG/HTML), y servir con `Content-Disposition: attachment` y `X-Content-Type-Options: nosniff`.

### P2-08 — fabric y xmldom

- `apps/desktop > fabric@6.9.1`: Stored XSS vía SVG export (<7.2.0) e inyección por colorStops (<7.4.0). Es relevante si se exportan o reimportan SVG de diseños compartidos.
- `docxtemplater-image-module-free@1.1.1 > xmldom@0.1.31`: 20 advisories sin versión parcheada en `xmldom` (el paquete se renombró a `@xmldom/xmldom`). Se usa en `services/document-templates/docx-template.js` y `pptx-template.js` sobre plantillas que suben los usuarios.
- **Solución.** fabric >=7.4.0 (major), y sustituir el módulo de imágenes o forzar `@xmldom/xmldom` mediante override, más tests de plantillas.

### P2-09 / P3-05 — Archivos monolíticos

> 1500 líneas: `packages/sdk/src/index.js` 3333, `apps/api/src/routes/modules.js` 2876, `apps/api/src/index.js` 2756 (CLAUDE.md lo registraba en 2306, así que ha crecido), `apps/api/src/permission-catalog.js` 2324, `chat-service.test.js` 2210, `manifests/official/core-modules.js` 1828, `module-lifecycle-service.js` 1558. Hay 16 archivos más entre 1000 y 1500 (lista en §8).

### P2-10 — Estado en proceso

- `apps/api/src/lib/cache.js:1-5`: `NodeCache`, "Single-process Hono API — no Redis needed".
- A esto se suman `_userContextInFlight` (`index.js:368`), los locks de módulos en el filesystem y el `fs.watch` del bundler.
- **Impacto.** La API es un punto único de fallo y no escala horizontalmente sin incoherencias en caché o permisos.
- **Solución.** Documentarlo como límite explícito; preparar la interfaz de caché sobre Redis antes de añadir réplicas.

### P2-11 — Contratos duplicados

- `packages/module-engine/src/event-catalog.js:39`, `service-contracts.js:5` y `date-sources.js:4` declaran "Keep in sync with apps/api/src/...".
- Los fallos de `module-runtime-catalog.test.js`, `rbac-granular-contract.test.js` y `help-capabilities.test.js` muestran esa deriva en la práctica.
- **Solución.** Una sola fuente (el engine) que la API importe, más un test generador en CI.

### P2-12 — `ui-vendor`

- `apps/desktop/vite.config.js` (manualChunks, ~líneas 226-251) agrupa `@radix-ui`, `@tiptap`, `lucide-react` y `sonner`. Lo importan 303 chunks, así que cualquier pantalla que use un icono descarga tiptap/ProseMirror (1.72 MB raw / 482 KB gzip).
- **Solución.** Dar a tiptap su propio grupo.
- **Verificación.** `ui-vendor` < 400 KB raw.

### P2-13 — Polling

- 130 sitios con `setInterval`/`refetchInterval` en `apps/desktop/src` y `packages/ui/src`. Hay intervalos de 5 000 y 8 000 ms (4 sitios cada uno).
- El impacto en batería y red móvil no se midió.
- **Solución.** Inventariarlos, aplicar `refetchIntervalInBackground: false`, y usar Realtime donde ya existe canal.

### P2-14 — Lint efectivo

- `eslint.config.js` no incluye `js.configs.recommended`, y las reglas `react-hooks/*` están registradas como no-op (líneas 32-41).
- Hoy solo se detectan `toISOString().slice/split` y `<button>` sin `type`. No se detectan variables sin definir, imports muertos ni violaciones de hooks.
- **Solución.** Activar `recommended` y `eslint-plugin-react-hooks` en modo warning y bajar los avisos por lotes.

### P2-15 — Observabilidad

- No hay `@sentry`, OpenTelemetry, pino, winston ni `prom-client` en ningún `package.json`. Se cuentan 411 `console.*` en `apps/api/src` fuera de tests.
- Existe `/health` con readiness (`index.js:903-906`).
- **Solución.** Logger estructurado con `requestId` y `companyId`, métricas básicas (latencia, 5xx, cola de jobs) y alertas sobre backup y worker.

### P2-16 — Controles de secretos y privacidad

- `pnpm check:secrets` termina con "Instala Gitleaks": el escaneo no se ejecutó.
- `pnpm check:privacy` da 40 hallazgos, todos `non-example-ipv4` en tests y docs de proxies de confianza (`infra/installer/lib/trusted-proxies.test.mjs` 20, `apps/api/src/lib/__tests__/client-ip.test.js` 17, `docs/deployment/trusted-proxies.md` 2, `trusted-proxies.mjs` 1). Probablemente son rangos privados de ejemplo: hay que revisarlos o agregarlos a la allowlist.
- `pnpm check:company-scope` falla con 14 entradas de "peticiones sin transporte empresarial" (p. ej. `runly.inventory/lib/guest-api.js`, `runly.growth/components/MonitorConnectionDialog.jsx`).
- Escaneo manual de patrones (JWT, `sk_live_`, `gsk_`, `tvly-`, AKIA, claves privadas PEM, `ghp_`): 0 archivos. Todas las URLs `postgres://` con contraseña apuntan a localhost, contenedores o placeholders.
- **Solución.** Instalar Gitleaks en CI, cerrar o allowlistear los hallazgos y revisar las 14 entradas de company-scope.

### P3-01 — Vulnerabilidades de tooling

- `tar@6.2.1` (vía `fabric > canvas > @mapbox/node-pre-gyp`, 1 critical + 9 high) solo se usa al instalar binarios nativos de `canvas` (dependencia Node opcional de fabric, no se ejecuta en el navegador).
- `mysql2`, `effect`, `deepmerge-ts`, `@hono/node-server` y `fast-uri` llegan por `prisma` → `@prisma/dev`/`@prisma/config` (CLI).
- `image-size` (vía pptxgenjs) y `katex` (vía excalidraw) también aparecen.
- **Solución.** Actualizar cuando haya versión, con un registro de aceptación de riesgo en el repo.

### P3-02 — Límite de descompresión del ZIP

- `apps/api/src/services/module-upload-service.js:114` suma `entry._data?.uncompressedSize`, el tamaño declarado en el encabezado. Un ZIP con tamaños falsos podría superar el límite al descomprimir en `:133`.
- El impacto está acotado por `MAX_COMPRESSED_BYTES` y por el permiso requerido.
- **Solución.** Contar bytes reales durante la descompresión en stream.

### P3-03 — Rust/Tauri

- `apps/desktop/src-tauri/Cargo.toml`: tauri 2.11.5, plugins y `reqwest` 0.12. No hay evidencia de `cargo audit` ni `cargo deny`, y no se ejecutó en esta auditoría.

---

## 5. Arquitectura: evaluación

- **Separación.** Es correcta en lo esencial: el frontend no accede a la DB salvo Realtime/Storage vía supabase-js, la API es la autoridad y los validadores Zod se comparten. Las violaciones son (a) el código de módulos dentro del proceso de la API con Prisma global (P0-01), (b) el aislamiento multiempresa solo en la capa de aplicación (P0-02), y (c) un SDK de 3333 líneas en un solo archivo.
- **Grafo de paquetes.** Acíclico a nivel de workspace (core ← module-engine ← module-compiler; core ← ui ← preview-runtime). No se ejecutó un detector de ciclos a nivel de archivo (madge no está instalado): **por verificar**.
- **Puntos únicos de fallo.** Un único proceso de API con caché en memoria; el sistema de archivos local como almacén del código de módulos (`ATLAS_MODULES_DIR`); una única instancia Supabase autoalojada.
- **Acoplamiento.** `apps/api/src/index.js` sigue registrando ~45 routers y lógica inline (`/public/blueprints`, `/public/modules`, `/public/site/*`). El mantenimiento del regex `API_PREFIX_RE` (`index.js:2574`) es manual y frágil: cada nuevo prefijo de API que se olvide ahí se sirve como HTML del sitio.

---

## 6. Rendimiento: protocolo reproducible en dispositivos reales

No se midió en dispositivos. Protocolo propuesto:

1. **Build fijo.** `pnpm --filter @runly/desktop build:web` en el SHA auditado, servido con la misma configuración nginx del instalador (`infra/installer/nginx/spa.conf`), sobre HTTPS.
2. **Dispositivos.** Un Android de gama media (4 GB RAM, Chrome estable) y un iPhone de 2–3 generaciones atrás (Safari). Batería > 50 %, sin ahorro de energía.
3. **Red.** Wi-Fi real y perfil 4G; en el Android, Chrome DevTools remoto con "Fast 4G" para tener comparabilidad.
4. **Escenarios (5 repeticiones, caché fría y caché caliente):** (a) login → Home usable; (b) Home → Inventario → detalle; (c) Home → Chat → conversación; (d) Studio abrir diseño; (e) 10 minutos en Home inactiva (red y CPU en segundo plano).
5. **Métricas.** LCP, INP y TBT del trace de Performance (Android vía `chrome://inspect`, iOS vía Web Inspector de Safari); bytes JS transferidos y evaluados (pestaña Network y Coverage); heap JS al minuto 0 y al minuto 10; número de peticiones por minuto en reposo.
6. **Criterio.** Registrar la mediana y el p75 en `docs/deployment/perf-baseline-2026-11.md` con el SHA. Cada optimización de P1-05/P2-12/P2-13 repite el protocolo.

---

## 7. Matriz de riesgos legales y licencias

Inventario: `pnpm licenses list --prod --json` da 1154 paquetes de producción: MIT 915, ISC 92, Apache-2.0 73, BSD-3 33, BSD-2 10, otros 31. Los paquetes propios están marcados `UNLICENSED` (propietario).

| ID | Componente | Licencia | Cómo se distribuye | Riesgo | Acción | ¿Revisión jurídica externa? |
|---|---|---|---|---|---|---|
| L-01 | country-state-city 3.2.1 | **GPL-3.0** | Empaquetado en el JS del frontend (web, Tauri Windows/Android/iOS) | Alto: obligación de licenciar la obra combinada bajo GPL-3.0 o retirar el componente | Sustituir por un dataset con licencia permisiva (p. ej. GeoNames CC-BY 4.0, con atribución) | Sí |
| L-02 | @ffmpeg/core 0.12.10 | **GPL-2.0-or-later** | `public/ffmpeg/ffmpeg-core.wasm` servido a navegadores y apps | Alto/medio: distribución de binario GPL; hay que ofrecer el código fuente correspondiente y valorar si el uso constituye obra combinada | Ofrecer fuente y aviso, o usar una build LGPL de ffmpeg | Sí |
| L-03 | @img/sharp-* (libvips) | Apache-2.0 AND LGPL-3.0-or-later | Imagen Docker de la API publicada en registro | Medio: LGPL exige permitir el reemplazo de la librería y dar avisos | Incluir avisos LGPL en la imagen y en el aviso de terceros | Recomendable |
| L-04 | jszip, pizzip | MIT OR GPL-3.0 | Frontend y API | Bajo: elegir MIT | Documentar la elección MIT | No |
| L-05 | xmldom 0.1.31 | LGPL-2.0 or MIT | API | Bajo (elegir MIT); el riesgo de seguridad está en P2-08 | — | No |
| L-06 | dompurify | MPL-2.0 OR Apache-2.0 | Frontend y API | Bajo | Elegir Apache-2.0 | No |
| L-07 | lightningcss, web-push | MPL-2.0 | Build y API | Bajo: copyleft por archivo, sin modificaciones | Aviso | No |
| L-08 | argparse | Python-2.0 | tooling | Bajo | — | No |
| L-09 | buffers 0.1.1, khroma 2.1.0 | Unknown | Transitivas | Medio: sin licencia declarada | Identificar la licencia real o sustituir | Sí, si no se aclara |
| L-10 | Fuentes Studio (31 familias) | OFL-1.1 (`apps/desktop/public/studio-fonts/*-OFL.txt`) | Servidas y embebidas en exportaciones | Bajo: OFL permite embebido; no se pueden vender solas | Mantener los OFL.txt; verificar `sources.json` | No |
| L-11 | Packs de ilustraciones (open-doodles, open-peeps) | CC0-1.0 (archivos LICENSE presentes) | API Studio | Bajo | — | No |
| L-12 | Iconos locales Studio | `apps/api/src/routes/studio/catalog/local-icons.LICENSE.txt` | API | Por verificar el contenido | Revisar | No |
| L-13 | Imágenes generadas por IA (`generated-images/`, sin versionar) y contenido de plantillas | Términos del proveedor | Plantillas de sitios | Medio: titularidad y términos de uso comercial | Registrar el proveedor y los términos por asset | Sí |
| L-14 | Ausencia de aviso de terceros (NOTICE / THIRD_PARTY) | — | Todos los artefactos | Medio: MIT, BSD y Apache exigen conservar avisos | Generar `THIRD_PARTY_NOTICES` en build web, imagen API e instaladores | No |
| L-15 | Dependencias Rust | No inventariadas | Apps nativas | Por verificar | `cargo deny check licenses` | — |

### Privacidad y tratamiento de datos (evidencia encontrada)

| Tema | Evidencia | Estado |
|---|---|---|
| Borrado de empresa | `services/company-deletion-*` (inventario, recursos, notificador), router `createCompanyDeletionRouter` (`index.js:923`), estados PENDING/PURGING/FAILED | Implementado. La completitud del borrado (Storage, backups, Realtime) no se verificó |
| Papelera y retención | spec `2026-10-04-trash-retention-conflicts-design.md` | Implementado según la spec, sin verificar aquí |
| Retención de backups | `backup-acceptance.md:27` (retención acotada a snapshots verificados) | Los backups conservan datos de empresas ya borradas: no hay política documentada de purga en backups |
| Exportación de datos del titular / portabilidad | No se encontró un endpoint de exportación integral por usuario o empresa | Brecha |
| Aviso de privacidad, derechos ARCO (LFPDPPP), consentimiento | Sin referencias en código ni docs (búsqueda `ARCO|LFPDPPP|aviso de privacidad`) | Brecha. Requiere revisión jurídica |
| Encargados (subprocesadores): Groq, Tavily, Google, Stripe, FCM, LiveKit, B2 | Integraciones presentes en código y CLAUDE.md | Sin un registro de subprocesadores ni DPA |
| Consentimiento para transcripción hospedada | Consentimiento registrado (spec 2026-11-01 transcription vocabulary) | Implementado para esa función |

**No se declara cumplimiento legal.** Las filas marcadas "Sí" y las brechas de privacidad requieren revisión de un abogado con competencia en LFPDPPP (México) y, si hay clientes en la UE, RGPD.

---

## 8. RME3 y Module Builder: motor contra interfaz

### Inventario del motor (`packages/module-engine`)

- **17 tipos de campo:** text, textarea, number, decimal, boolean, select, multiselect, date, datetime, email, phone, relation, file, json, markdown, color, richtext.
- **14 tipos de blueprint:** ENTITY, FORM, TABLE, DETAIL, PAGE, DASHBOARD, KANBAN, CARDS, CALENDAR, TIMELINE, REPORT, ACTION, RELATION, CUSTOM.
- **Conexiones:** `fields` y `related`, con políticas de borrado `cascade`, `setNull` y `restrict`. Widgets de dashboard: stat, chart, list.
- **44 servicios** entre módulos (inventory, contacts, projects, calendar, files, identity, calls, chat, notifications, purchases, hr, documents, ledger, fleet, pfm).
- **66 eventos de dominio**, más un manifiesto de IA, recursos públicos, integraciones, esquemas de diff y conversión de columnas, y un simulador de servicios.

### Lo que la interfaz y ModuleDefinition v1 permiten construir

- **Pestañas del Builder** (`apps/desktop/src/modules/runly.core/components/builder/`): General, Entidades/Campos (`FieldSheet`), Layout (`LayoutDesignerSheet`, reglas condicionales), Vistas (CRUD, Kanban, Records, Dashboard), Conexiones, Enlaces públicos, Permisos, Navegación, Automatizaciones (trigger, condiciones, pasos, loop, aprobación, http, webhook, consola de ejecuciones), Extensiones de código y Modo desarrollador.
- **Compilador:** `packages/module-compiler/src/definition.js:64-66` rechaza explícitamente `consumes` y `events` (`BUILDER_INTEGRATION_UNSUPPORTED`).

### Brechas (P2-17)

| Capacidad | Motor | Builder v1 | Restricción para módulos complejos |
|---|---|---|---|
| Suscripción a eventos de otros módulos (`consumes`, `events`) | Sí (manifiesto manual) | **No** (rechazado) | Solo con integración manual entre módulos |
| Máquina de estados / workflow con transiciones y permisos por transición | No como primitiva (solo automatizaciones) | No | Procesos de aprobación multi-etapa |
| Validaciones de campo (min/max, patrón, unicidad compuesta) | Parcial (`required`, `unique`) | No hay validaciones declarativas (0 coincidencias de `minLength|maxLength|pattern` fuera de automatizaciones) | Calidad de datos |
| Campos calculados / fórmulas | No | No | Totales, impuestos |
| Permisos por registro (propietario, equipo) | No | No (permisos por módulo y acción) | Multiusuario dentro de una empresa |
| Relaciones en Kanban, Records y Cards | Rechazado (`definition.js:322`, `records-views.js:68`) | No | Vistas con datos relacionados |
| FKs a nivel de DB y relaciones entre módulos | Parcial (conexiones a entidades de sistema) | Parcial | Pendiente en el backlog del Builder |
| Home widgets, tipos de documento, `listConfig` | Sí (`home-widgets.js`, `document-kinds.js`, `list-config.js`) | **Probable que no:** no se hallan editores en `builder/` (0 coincidencias) | Por verificar en la UI |
| Lógica de servidor propia | Sí (`api/index.js`) | Solo en modo desarrollador, que ejecuta en proceso (P0-01) | Aislamiento |
| i18n de etiquetas | No | No | Solo español |

**Conclusión técnica.** Ampliar el Builder sobre el modelo actual de ejecución multiplicaría la superficie de P0-01: cada capacidad de "lógica" nueva que no se pueda expresar de forma declarativa empuja al usuario al modo desarrollador. Antes hay que decidir el modelo de aislamiento.

### Anexo: archivos entre 1000 y 1500 líneas

`infra/installer/setup-local.mjs` 1493, `setup-external.mjs` 1260, `calls/__tests__/call-service.test.js` 1194, `manifests/official/feature-modules.js` 1187, `runly.chat/components/MessageComposer.jsx` 1178, `ChatMessageBubble.jsx` 1143, `packages/validators/src/index.js` 1095, `routes/chat/index.js` 1093, `runly.projects/components/TaskDetailPanel.jsx` 1084, `apps/api/src/public/runly-sdk.js` 1077, `services/hr-service.js` 1063, `routes/calls/call-service.js` 1047, `services/inventory-service.js` 1037, `public/runly-sdk-chat-widget.js` 1034, `shell/PublicWebsiteEntry.jsx` 1033, `packages/ui/src/runly-renderer/RunlyTable.jsx` 1017.

### Anexo: script de medición del cierre estático

Script usado para P1-05 (`node closure.mjs <dist/assets> <entry-chunk.js>`): recorre los `import … from "./x.js"` y `export … from "./x.js"` de los chunks y suma bytes raw y gzip nivel 9. Excluye los `import()` dinámicos. Conviene añadirlo a `scripts/` cuando se implemente el presupuesto de bundle.

---

## 9. Backlog de estabilización

| # | Tarea | Hallazgos | Depende de | Impacto | Criterio de aceptación |
|---|---|---|---|---|---|
| S1 | Verificar exposición PostgREST en cada instancia y aplicar un revoke global si procede | P0-02 | — | Crítico | La consulta de §4 devuelve 0 filas en todas las instancias; hay un test de CI con base desechable |
| S2 | Restringir la subida, el catálogo y el modo desarrollador al propietario de plataforma | P0-01 | — | Crítico | Tests 403/200 de §4; `runly.admin` ya no recibe `core.modules.*` |
| S3 | Workflow CI obligatorio (lint, test, build, audit) | P1-03 | — | Alto | La PR con un test roto queda bloqueada; `main` en verde |
| S4 | Arreglar los 31 tests y hacer `skip` en suites Postgres sin runner | P1-03, P1-04 | S3 | Alto | 0 fallos en Linux CI; los fallos solo-Windows se documentan |
| S5 | Actualizar hono, @hono/node-server, nodemailer y zod | P1-01, P1-02 | S3 | Alto | `pnpm audit --prod` sin high/critical en runtime de la API |
| S6 | Ensayo real de restauración y RPO/RTO | P1-06 | — | Alto | Checklist de `backup-acceptance.md` marcado con `Verified:` |
| S7 | Sustituir country-state-city y resolver ffmpeg; `THIRD_PARTY_NOTICES` | P1-07, P1-08, L-14 | Revisión jurídica | Alto | 0 dependencias GPL en artefactos distribuidos, o aprobación jurídica escrita |
| S8 | Presupuesto de bundle y división de `AppEntry`, barrel de ui y `ui-vendor` | P1-05, P2-12 | S3 | Alto (móvil) | `AppEntry` <= 900 KB gzip; protocolo §6 con mejora registrada |
| S9 | CORS por lista blanca; endurecer JWT (`aud`/`role`/guest) | P2-01, P2-02 | S3 | Medio | Tests de §4 |
| S10 | Contenedores no-root, digests, rangos fijos, splinter fijado | P2-04, P2-05, P2-06 | — | Medio | Escaneo de imagen sin root; sin `latest` en `package.json` |
| S11 | Gitleaks en CI y cierre de privacy/company-scope | P2-16 | S3 | Medio | `check:secrets`, `check:privacy` y `check:company-scope` en verde en CI |
| S12 | Logging estructurado, métricas y alerta de backup | P2-15 | — | Medio | Alerta probada al detener el job de backup |
| S13 | Lint `recommended` y react-hooks | P2-14 | S3 | Medio | Advertencias bajo un umbral pactado |
| S14 | Unificar contratos engine↔API | P2-11 | S4 | Medio | Sin comentarios "keep in sync"; test generador en CI |
| S15 | Partir `index.js`, `modules.js` y `sdk/index.js` | P2-09 | S3 | Medio | Todos < 1000 líneas, con boot real y suite verde |
| S16 | Decidir el modelo de aislamiento de módulos (proceso, rol DB, RLS por empresa) | P0-01, P2-10, P2-17 | S2 | Estratégico | Spec aprobada en `docs/superpowers/specs/` |
| S17 | Inventario legal y de privacidad: ARCO, subprocesadores, exportación, purga en backups | §7 | Asesoría externa | Medio/Alto | Documento revisado por asesor |
| S18 | Medición en Android/iPhone | §6 | S8 | Medio | Línea base publicada con SHA |

---

## 10. Recomendación para ampliar RME3

**NO GO inmediato → GO CON CONDICIONES.**

Condiciones para pasar a GO:

1. S1 y S2 cerrados (sin P0 abiertos).
2. S3, S4 y S5 cerrados: CI obligatorio en verde y sin vulnerabilidades high/critical de runtime.
3. S16 con spec aprobada. Ninguna capacidad nueva del Builder puede depender de ejecutar código del usuario dentro del proceso de la API.
4. S6 con al menos un ensayo de restauración real documentado antes de abrir el Builder a más clientes.

Las tareas de rendimiento (S8), legales (S7, S17) y de observabilidad (S12) pueden ir en paralelo a la ampliación una vez cumplidas las condiciones 1-3.

---

## 11. Límites de esta auditoría

- No se accedió a base de datos real, a producción ni a dispositivos: P0-02, la explotabilidad de P1-01 y todo el rendimiento en dispositivo quedan por verificar.
- No se ejecutaron las suites `*-postgres` ni `cross-tenant-security` (requieren base desechable), ni `cargo audit`, Gitleaks o un detector de ciclos a nivel de archivo.
- La suite se ejecutó en Windows; algunos fallos (tar y rutas de Docker) pueden ser específicos de esa plataforma.
- La revisión de seguridad fue dirigida (autenticación, tenancy, carga de módulos, SQL crudo por muestreo, uploads, webhooks, CORS y contenedores). No es una prueba de penetración. Se revisaron muestras de los 180 usos de `$queryRawUnsafe`/`$executeRawUnsafe`: usan identificadores validados (`IDENT`, `quoteIdentifier`) y valores parametrizados, sin inyección encontrada en la muestra.
