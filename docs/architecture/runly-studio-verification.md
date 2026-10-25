# Runly Studio: pruebas y límites de verificación

## Integración posterior en main

Por instrucción del usuario, la entrega se trasladó directamente a `main`, sin
conflictos, después de los commits concurrentes hasta `8167d272`. Los commits
equivalentes en main son `d7df17c0`, `e910abad` y `0ea39c8e`. El flujo vigente
está en AGENTS.md: trabajar en main y commitear los cambios propios, sin ramas
de tarea ni worktrees. Las referencias a la rama aislada más abajo son históricas.

En main se repitió la instalación frozen, el build web y `pnpm test:studio`:
9 pruebas aprobadas, 0 fallidas y 1 integración SQL omitida por no configurar una
base desechable en esa repetición. La integración SQL de la entrega original
había aprobado las 7 pruebas indicadas en este informe. Los artefactos locales
de la ejecución anterior se conservaron en `.artifacts/` del workspace principal.

Fecha: 2026-10-25. Node 22.23.3, pnpm 9.15.0, Chrome headless y PostgreSQL 18 en contenedor local desechable. No se cargaron credenciales ni datos empresariales reales.

## Resultados

| Comprobación | Resultado |
| --- | --- |
| Baseline antes de código: core/engine, contratos compiler/release, Canvas, POS, Notes, API Canvas y Documents | 603 pruebas: 602 aprobadas, 0 fallidas, 1 omitida |
| Automatizaciones, layout/flow y compiler dirigidos | 108 aprobadas |
| Regresión ampliada tras cambios: core/engine/compiler/SDK, release/consumer, Studio, Canvas/importadores, POS, Notes, Documents y Automatizaciones | 920 pruebas: 919 aprobadas, 0 fallidas, 1 omitida |
| Servicio Studio con Prisma generado + PrismaPg + PostgreSQL desechable | 7 aprobadas, incluyendo subpruebas: acceso cruzado, conflicto atómico, assets, rollback de auditoría y permisos Data API |
| Renderer en navegador | Reapertura canónica idéntica, texto con escala no uniforme, formas e imagen; PNG de 640 × 480 y píxeles originales verificados |
| UI real + SDK + servicio + SQL | Crear diseño, texto modificado, formas redimensionadas, imagen original, guardar, recargar editable y descargar PNG de 1080 × 1080; sin pageerrors |
| UI visual | Capturas revisadas en escritorio 1440 px, móvil 375 px y tema oscuro; scroll de página/inspector y sin desbordamiento horizontal de documento |
| Build desktop web | Aprobado; StudioScreen lazy aproximadamente 305.75 kB / 93.88 kB gzip. Persisten avisos de chunks grandes ajenos a Studio |
| ESLint de archivos nuevos/cambiados dirigidos | Aprobado |
| React Doctor | 90/100, 5 archivos escaneados, sin issues informados en ese alcance |
| Catálogo de permisos | 341 permisos manifest/catalog, 0 faltantes y 0 extras |
| Instalación frozen | Aprobada; lock conserva resoluciones previas y añade Fabric con sus dependencias |
| Packs y consumidor independiente | Aprobados sobre `52093822644c53ea079a2a037a7840929af0c078`: seis tarballs, instalación limpia, reinstalación frozen, contratos Node, build y browser en ambas |

La suite final dirigida `pnpm test:studio`, con la variable de base desechable configurada, ejecutó 16 pruebas y aprobó las 16 sin omisiones. Se repitió el flujo UI después del ajuste final de los controles y también pasó.

## Distribución local comprobada

Se ejecutaron `pnpm release:shared` y `pnpm verify:shared-consumer --manifest .artifacts/shared-release/52093822644c53ea079a2a037a7840929af0c078/manifest.json`, sin el flag publish. La versión local de los artefactos es `0.1.0-source.52093822644c53ea079a2a037a7840929af0c078`.

La instalación independiente verificó integridad y exports; el fixture probó los cuatro métodos Studio del SDK mediante su alias. Ambas instalaciones resolvieron una única instancia de React, React DOM y Query, y cargaron CSS correctamente. Runtime fijado: React/React DOM 19.3.1 y Query 5.104.4. Se validaron 4651 inputs aislados por build. GitHub Packages real conserva estado `registryAcceptance: not-tested`; no hubo publicación ni consulta de versiones publicadas.

Una futura adopción externa deberá publicar el conjunto de seis paquetes desde un SHA revisado mediante el workflow protegido, después de autorización, y actualizar aliases exactos y lockfiles del consumidor. La vertical en el monorepo usa workspaces y no depende de esa publicación.

La primera regresión tras instalar dependencias encontró 10 archivos de prueba que no podían importar Prisma porque faltaba generar el cliente en el worktree nuevo. Se ejecutó `pnpm db:generate` con una URL ficticia sin conexión a base y se repitió la suite; el resultado corregido es el indicado arriba. No se ocultó ni se eludió un fallo de código.

La prueba visual inicial cargó un CSS de otro chunk en el fixture; se corrigió el fixture para usar el CSS principal del build y se repitió antes de revisar capturas.

## Comandos reproducibles

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm db:generate
pnpm test:studio
pnpm --filter @runly/desktop build:web
pnpm verify:studio:browser
pnpm verify:studio:ui
pnpm rbac:verify-catalog
pnpm check:privacy
pnpm check:company-scope
```

`db:generate` únicamente genera cliente; no debe sustituirse por migrate/seed/reset. Las pruebas SQL/UI exigen `STUDIO_TEST_DATABASE_URL` explícita, hostname loopback y nombre de base `studio_verification`. No leen DATABASE_URL ni archivos .env. El servicio usa schemas separados por ejecución. Sin esa variable, la prueba SQL queda omitida y el script UI falla explícitamente. Para reproducir la verificación completa, crear una base desechable con ese nombre y los roles de test, nunca reutilizar una instalación existente.

La regresión ampliada usó `node --test` sobre estos conjuntos:

- `packages/{core,module-engine,module-compiler,sdk}/src/__tests__/*.test.js`.
- `scripts/tests/shared-package-release.test.mjs` y `shared-consumer-registry.test.mjs`.
- `apps/shared/studio/*.test.js` y `apps/api/src/routes/studio/*.test.js`.
- Canvas: `engine/*.test.js`, `lib/*.test.js`, `lib/libraryImport/*.test.js`, y todas las pruebas de rutas API Canvas.
- POS: `lib/*Objects.test.js`; Notes: `lib/__tests__/*.test.js`.
- Todas las pruebas de rutas Documents; core editor `lib/__tests__/*.test.js`; servicios `automation-*.test.js` y `system-automations-service.test.js`.

Los artefactos de navegador, capturas, JSON de medidas y logs se generan bajo `.artifacts/studio/`, ignorado por Git. No se copian logs de estación de trabajo a documentación pública.

## Política global heredada

`pnpm check:privacy` falla con 63 hallazgos en archivos previos, también reproducidos en el workspace original. `pnpm check:company-scope` falla con siete archivos previos de Inventario/LMS, también en el workspace original. No aparecen archivos Studio en esos informes. Los nuevos/cambiados se examinan adicionalmente mediante el inspector de privacidad del repositorio.

Estos checks globales permanecen rojos; no se reportan como aprobados ni se modifican sus allowlists para ocultarlos. La corrección de esos archivos debe coordinarse con sus responsables. El build de fixture también informa una clave assignOperator duplicada ya existente en el SDK de Chat; no se altera en esta entrega.

## Lo que no está demostrado

- Sesiones completas Canvas/POS/Notes contra auth, Realtime y Storage reales. Sus pruebas dirigidas y build pasan; eso limita el alcance de compatibilidad declarada.
- Login/cambio de empresa/revocación con usuarios reales en Studio. UI y SQL tienen fixtures de identidad y almacenamiento; el servicio sí usa Prisma real en su suite independiente.
- Presence, cursores, cambios entre usuarios, reconexión y edición concurrente colaborativa. Únicamente se ha demostrado rechazo de guardados con revisión obsoleta.
- Exportaciones JPG/SVG/PDF, transparencia, fuentes profesionales, perfiles de color, multipágina, grupos e historial.
- Render como servicio servidor, cargas sostenidas, memoria/FPS y percentiles de rendimiento.
- Estado de migraciones de una instalación, aceptación de GitHub Packages o paquetes ya publicados.

La siguiente validación de integración requiere un entorno de prueba autorizado con auth/Storage reales y los permisos sincronizados. La migración nueva fue aplicada únicamente dentro del contenedor desechable de verificación.

## Rama e integración

Commits de trabajo: `38fc5139` (plan/auditoría/arquitectura) y `52093822` (vertical y pruebas), rama `feat/runly-studio-foundation`. La evidencia de packs corresponde al segundo commit; el commit posterior solo actualiza documentación.

El workspace original avanzó en paralelo hasta `f87f844602c84006de1260dad45ba27315b53868` al comprobar el cierre, además de conservar cambios sin commit. Esos cambios no se mezclaron ni se certifican en esta rama. Antes de integrar, revisar la diferencia desde la base `f60c8ed8`, resolver cualquier solapamiento y repetir las suites afectadas. No se integró en main ni se hizo push.
