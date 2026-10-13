# Registro de regresiones de estabilización

Date: 2026-10-12
Baseline source: a12cf8bb (antes de las correcciones de pruebas de esta etapa).
Owner: por asignar; ejecución y evidencia de esta revisión por el agente.

## Alcance ejecutado

Node 22.12.0, pnpm 9.15.0. Barridos con timeout 60000 ms, concurrencia 8 y
--test-force-exit. El último flag permite finalizar pese a handles abiertos;
la limpieza de procesos sigue pendiente. Los reportes TAP brutos quedaron en
el directorio temporal local, fuera de archivos versionados.

```powershell
node --test --test-timeout=60000 --test-concurrency=8 --test-force-exit "apps/api/src/**/*.test.js"
node --test --test-timeout=60000 --test-concurrency=8 --test-force-exit "packages/**/*.test.js" "apps/desktop/src/**/*.test.js" "scripts/__tests__/*.test.js" "infra/installer/__tests__/*.test.js"
```

API: 2363 tests, 2355 pass, 6 fail, 2 skip, 0 cancelled; 222.1 segundos.
Paquetes/frontend/scripts/instalador seleccionados: 1556 tests, 1547 pass,
2 fail, 7 skip, 0 cancelled; 190.2 segundos. Scaffolder ejecutado aparte:
13 tests, 11 pass, 2 fail antes de corregir.

Estos comandos no son una enumeración completa: excluyen pruebas .mjs,
scripts/scaffold (añadidos aparte), scripts/tests, Prisma y suites de Docker
opt-in fuera de esos patrones. Browser/DB requieren flags; no se activó
ninguno en los barridos. Los conteos corresponden al reporte Node; algunas
suites anuncian además sus grupos SQL omitidos. La prueba del panel de visitante
ya pasó explícitamente en la etapa anterior, pero aquí se omite por diseño.
No se usaron credenciales de despliegue ni se inició una instancia real.

## Clasificación y resolución

| Familia / archivo | Causa reproducida | Estado y evidencia |
|---|---|---|
| Growth — apps/api/src/manifests/official/__tests__/storefront-capture-foundation-contract.test.js | La lista exacta esperaba dos entradas; contratos posteriores agregaron Sitios conectados y Formularios | Resuelto, 34e308d6; 14/14 pruebas de manifiestos y RBAC 321/321. Sin cambio de navegación/producto |
| Layout condicional — packages/module-compiler/src/__tests__/conditional-layout.test.js | Regex antigua no admite nullable; schema vigente distingue create de update | Resuelto, 759e1fd7; 19/19 pruebas conditional/layout/nullable; ejecución del schema generado y controles de obligatoriedad. En update, los campos originalmente requeridos aún rechazan null |
| Scaffolder — scripts/scaffold/__tests__/e2e.test.js | Espera 13 en vez de 15 archivos e intenta node --check sobre Markdown | Resuelto, ba092bc4; 67/67 pruebas scaffolder, inventario exacto y sintaxis de los 12 .js; sin cambios de generador |
| Tasks/Projects — apps/api/src/routes/projects/__tests__/tasks-service.test.js | Dos mocks carecen de project.findUnique usado después de crear la tarea para publicar evento | Pendiente: actualizar fixture al contrato real y verificar evento/contexto, sin omitir autorización |
| Runtime — apps/api/src/services/__tests__/module-runtime-catalog.test.js | Catálogo de versiones y documento público generados divergen de instalación/generador | Pendiente: contrastar lockfile/resolución, regenerar y revisar cambios |
| QR — mismo archivo runtime | Busca mappings literales en vite.config.js; ahora se importan desde preview-runtime | Pendiente: probar contrato compartido y su integración efectiva con Vite/shims |
| Dev Kit — scripts/__tests__/installer-devkit-snapshot.test.js | Snapshot exportado no coincide con generador actual | Pendiente: regenerar con procedencia y revisar inventario/contrato/documentos |

Las filas de fallbacks/SDK del FODA original ya tienen correcciones previas y
no fallaron en estos barridos. No se clasifican los errores derivados de suites
contenedoras como defectos adicionales. No se ha repetido toda la regresión
después de estas correcciones: las suites dirigidas prueban cada alcance y los
resultados generales anteriores conservan su estado fallido.

## Dependencias y gates pendientes

pnpm audit --json: 45 alertas (1 critical, 22 high, 19 moderate, 3 low).
shell-quote 1.9.0 vía concurrently de desarrollo continúa siendo la crítica.
Clasificación completa de rutas alcanzables, parches y excepciones por responsable
queda pendiente; no se probó explotación ni se modificó lockfile en esta etapa.

Transporte empresarial: diferido por indicación del usuario el 2026-10-12;
los nueve hallazgos permanecen descritos en company-transport-findings. Simulacro
real B2 también diferido. CI general, secret scanning, gates de lint reales,
consumidores aislados de paquetes y aceptación operativa continúan abiertos.

Verified: 2026-10-12 (barridos y suites dirigidas anteriores; sin publicación,
despliegue, cambios de base o aceptación de infraestructura real).
