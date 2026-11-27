# Runly Platform Stabilization: Release Candidate RC1

Fecha: 2026-11-25. Alcance de esta intervención: preparar un candidato identificable y decidir, con evidencia, si es apto para staging. Sin push, PR, publicación, despliegue ni etiqueta.

## Veredictos

| Destino | Veredicto | Por qué |
|---|---|---|
| Desarrollo local | **APTO** | Gates fast y release en verde; suites de seguridad 166/166; imágenes construidas y arrancadas; sync, Website y backup verificados contra bases desechables. |
| Staging controlado | **APTO CON CONDICIONES** | Condiciones C1 a C5 abajo y la corrección de CI de la sección 18 (Quality Gates está en rojo en GitHub hasta publicarla). Ninguna es un defecto conocido del candidato; son comprobaciones que dependen de infraestructura o decisiones que no se podían ejecutar aquí. |
| Producción | **NO APTO todavía** | Faltan: ensayo de actualización desde la versión desplegada con una copia de sus datos, memoria y rendimiento en navegador con datos reales de pruebas, pruebas en teléfonos reales, CI de GitHub sobre el SHA y la validación real del sandbox del Hub. |
| Distribución comercial | **NO APTO** | Revisión jurídica pendiente (GPL de `ffmpeg-core.wasm`, GPL del paquete `country-state-city` y datos ODbL, 112 paquetes sin archivo de licencia, sonidos, logos y modelos sin procedencia registrada, SBOM de contenedores). Una aprobación técnica para staging no implica aprobación jurídica. |

Condiciones para staging:

- **C1.** Desplegar solo desde el SHA `e57d7f817` e imágenes `adbfdbb108cf`, con `RUNLY_INSTALLER_REF` fijo. **Nunca desde `main`**: el remoto ya contiene la consolidación de Content Intelligence y su migración `20270116` (sección 18).
- **C2.** Orden ERP, luego paquetes compartidos, luego Hub (sección 10). No actualizar el Hub hasta ejecutar su sandbox real.
- **C3.** Con los secretos y la base de staging, repetir el arranque de las imágenes y el ensayo de actualización con una copia de los datos de staging, no de producción.
- **C4.** Tratar como **no aceptadas** las capacidades offline listadas en la sección 6 como limitadas.
- **C5.** Ejecutar en teléfonos reales la lista de la sección 14 antes de abrir el staging a usuarios.

## 1. SHA candidato y repositorios

| Repositorio | SHA | Estado |
|---|---|---|
| Runly ERP, código del candidato (imágenes) | `adbfdbb10` (`adbfdbb108cf`) | Todos los commits de esta intervención son propios |
| Runly ERP, SHA de staging definitivo | `e57d7f817` (el HEAD `a6f4675f2` citado antes ya incluía código de otra sesión; ver sección 18) | Después de `adbfdbb10` solo cambian pruebas, scripts de CI y documentación; **ningún archivo de `apps/*/src` fuera de pruebas** (verificado con `git diff --name-only adbfdbb10 HEAD`). Las imágenes siguen siendo válidas |
| Atlas Web Builder | `893d34c`, `v0.11.1` | Limpio. Sin cambios en esta intervención |
| Runly Developer Hub | `1f1e864` | Contiene mi sincronización de documentación `adc6924`; el resto son commits de otra sesión |
| runly-web | `e96f4dc` | Contiene mi sincronización de ayuda |

Paquetes compartidos: React y React DOM 19.3.1, `lucide-react` 1.59.0, Atlas 0.11.1 en ERP y Hub, sin `latest` (puerta de política en verde). No se tocaron `package.json` ni `pnpm-lock.yaml`.

## 2. Alcance exacto y trabajo concurrente

- **Dentro del candidato:** todo lo confirmado en `adbfdbb10`, incluida la migración `20270115000000_content_intelligence` (confirmada en `1bc2b5a78`, anterior a esta intervención) y su código.
- **Fuera del candidato (trabajo de otra sesión, sin confirmar):** migración `20270116000000_content_intelligence_consolidation`, `apps/content-worker/*`, cambios en `services/content-intelligence/*`, `ContentIntelligenceSettings.jsx`, visores de Files (`AdvancedFileViewer`, `PDFViewer`), `lib/supabase-public-url.js` y `services/website-origin-guard.js`. No se revirtieron, ni se incorporaron, ni se incluyeron en las imágenes (se construyen con `git archive` del commit). Si la consolidación debe entrar al RC, hay que confirmarla y repetir imágenes, migraciones y las pruebas de Content Intelligence.
- Ningún commit de esta intervención usó `git commit -a`. Un incidente anterior (un `commit -a` que arrastró archivos ajenos) se deshizo con un reset suave de mi propio commit antes de continuar.

## 3. Imágenes (construidas desde `adbfdbb10`, `git archive`, sin tocar tags `-latest`, nada subido)

| Imagen | Etiqueta local | ID | Tamaño | Verificación |
|---|---|---|---|---|
| API | `runly-notifications:api-adbfdbb108cf` | `32d4d8794f7b` | 2.58 GB | `verify-nonroot-image.mjs` **5/5**: instalación limpia (uid/gid 10001, sin capacidades efectivas), actualización desde un volumen propiedad de root con datos conservados, enlace simbólico en el volumen detiene el arranque sin cambios, arranque directo como no root, y **arranque real con migraciones, seed y `/health` sobre una base desechable** |
| Worker | `runly-notifications:worker-adbfdbb108cf` | `94a6a0890f4e` | 2.54 GB | Ejecuta como uid 10001 con `CapEff` 0. No se arrancó con base de datos (el worker necesita el stack completo): **construida y comprobado el usuario, sin prueba de arranque funcional** |
| Web | `runly-notifications:web-adbfdbb108cf` | `0873a407f7d2` | 281 MB | Arranca con una API simulada en la misma red: `/` 302, enlace profundo SPA 200, `runtime-config.js` vacío por defecto (la configuración se inyecta en tiempo de ejecución). Sin la API la compuerta de administración de Website devuelve 500 (comportamiento esperado: depende del servicio `api`) |

Secretos: las variables de entorno de las tres imágenes no contienen valores sensibles; un escaneo de patrones (`sk_live`, `service_role`, JWT) solo encontró un texto de ayuda de la interfaz y fixtures sintéticos de pruebas. Pendiente: arranque con los secretos reales de staging y readiness del worker.

## 4. Pruebas ejecutadas

| Prueba | Resultado |
|---|---|
| Gate fast y gate release (`run-gates.mjs`) | Verdes. Release: lint, privacidad, alcance por empresa, política de dependencias, UUID, esquema Supabase, guards de rendimiento (fuente y bundle; cierre estático del login 520 KB gzip frente a 580 KB), contract tests, build web, suites de seguridad |
| Suites de seguridad (`pnpm test:security`) | **166/166** (gateway, supervisor, confianza y cuarentena de módulos, staging de paquetes, rutas de módulos, RBAC granular) |
| Website contra PostgreSQL 18 desechable (`scripts/test-website-postgres.mjs`) | **86/86** (5 suites). Antes fallaban 4: el arnés no aplicaba las migraciones posteriores (pedidos, alertas de Growth, ruta de páginas borradas), ni construía el runtime público, y una prueba de catálogo asumía el modo antiguo de selección (los sitios nuevos usan selección explícita). Se corrigieron arnés y prueba; no se redujo ninguna aserción |
| Sync offline contra PostgreSQL 18 desechable (`scripts/test-sync-postgres.mjs`) | **9/9** (sección 6) |
| Estudio: prueba de navegador del Marketplace | Pasa (Chromium). Era una regresión real: abrir una tarjeta dejaba el diálogo vacío (sección 12) |
| Validación de audio/video (`studio-interchange`) | 22 casos rechazados, pasan; el Hub usa este mismo validador |
| Privacidad | 9/9 con la nueva excepción exacta por línea para los textos de licencia |
| Realtime autorizado | 7/7 |
| Recuperación (`scripts/recovery`) | 16/16 unitarias; integración S3 (MinIO + restic) **1/1 ejecutada** con `pnpm test:recovery-s3` (sección 18: el "silencio" era un skip con exit 0) |
| Suite general (una sola vez, sobre el árbol de trabajo) | **6916 pruebas: 6894 aprobadas, 0 fallidas, 22 omitidas**; 0 nombres fallidos; la línea base de fallos conocidos quedó **vacía** (sección 15) |

Bloqueadas por infraestructura: sandbox real del Hub (necesita un manifiesto de paquetes compartidos de un árbol limpio), integración S3 de recuperación, CI de GitHub, dispositivos físicos.

## 5. Seguridad

- **Cuarentena, instalación, módulos no confiables, bundles no autorizados, staging de paquetes, RBAC granular:** cubiertos por las 166 pruebas de seguridad y por las comprobaciones HTTP de F3 (423 para un módulo en cuarentena).
- **Secure Runtime:** sigue experimental y apagado por defecto (prueba `integration-flag`); el supervisor de código personalizado no se activó. No se inició otra etapa.
- **Revocación y aislamiento multiempresa en sync:** con base real, otra empresa nunca aparece en el caché local y una solicitud sin pertenencia (resolución de empresa que rechaza) recibe 403 sin ninguna lectura de datos (`sync-postgres.test.js`).
- **Rollback seguro:** el rollback debe volver solo a una imagen que contenga los cierres de F1B (usuario no root, cuarentena sin registro de confianza, permisos). Las imágenes anteriores a `e73cdf3ad` (las `runly-candidate:*-e73cdf3ad` sí son el piso válido; la redacción previa decía "y anteriores" por error) no deben usarse como destino de rollback sin reabrir esa revisión.
- **No verificado en esta intervención:** recuperación autorizada de módulos y suscripciones Realtime por empresa contra una API real; el segundo usuario para revocación en caliente.

## 6. Integridad de sincronización offline

Contra PostgreSQL 18 real, con el servicio real, el cliente real (`SyncEngine` y Dexie con `fake-indexeddb`) y la serialización JSON del cable:

| Caso | Resultado |
|---|---|
| Precisión de `updated_at` de las 14 tablas sincronizadas | `timestamp(3)` (milisegundos): las fechas JS ida y vuelta son exactas, la igualdad del cursor es sólida |
| 610 filas más otra entidad más reciente | Todas entregadas |
| **1200 filas con el mismo `updatedAt`** (antes: solo 500, sin error) | 1200 en 3 páginas con cursor compuesto |
| Dos entidades truncadas a la vez con tiempos intercalados | 700 + 650 completas |
| 10 700 filas (más que el tope de 20 páginas) | Primer pull `complete:false`, 10 000 filas, cursor persistido; un motor nuevo sobre la misma base local termina con 10 700 |
| Interrupción de red a mitad | La página 1 queda confirmada atómicamente (500); al reanudar se completa (1300) |
| Pull incremental, cambio local pendiente, cursor ISO antiguo | Solo viaja el cambio (≤ 4 filas); el registro con cambio local pendiente no se sobrescribe; un cliente que envía el cursor simple recibe solo lo posterior |
| Otra empresa y solicitud no autorizada | Sin contaminación; 403 sin leer datos |
| Calendarios deshabilitados | Llegan como `deleted:true` y se retiran del caché local |

**No ejecutado:** Chromium con IndexedDB real (se usó `fake-indexeddb`), push seguido de pull con mutaciones reales del servidor, cambio de empresa con interfaz.

**Borrados duros.** No existe infraestructura de tombstones, change log ni soft-delete uniforme reutilizable. Solo calendarios y eventos propagan eliminaciones (soft-delete por `enabled`). Una solución pequeña requiere una tabla nueva y disparadores `AFTER DELETE` en 14 tablas más una migración: es un cambio de esquema y de protocolo, fuera del alcance del RC. **Capacidades offline que no deben considerarse aceptadas:** el borrado duro de contactos, empleados, departamentos, puestos, vehículos, conductores, productos, categorías y las cuatro entidades de Ledger; los registros se retiran del caché solo al cambiar de empresa o limpiar datos. Las entidades con `enabled` llegan con `data.enabled=false` y la interfaz offline debe filtrarlas; no se verificó cada pantalla.

## 7. Migraciones

- La imagen de la API aplicó todas las migraciones del árbol confirmado sobre una base vacía, con seed y `/health` (`verify-nonroot-image`).
- `verify-migration-history.mjs` (reproduce las dos variantes históricas en un contenedor local) pasa.
- Website aplicó 20 migraciones propias, con la prueba de inyección de fallo que revierte (S1 a S4 y FormScope).
- **No ensayado:** actualización desde el esquema de la versión actualmente desplegada con una copia de sus datos (condición C3). La migración `20270115` de Content Intelligence entra al candidato; la `20270116` de consolidación **no**.

## 8. Backup y restauración (solo datos de prueba)

Dos contenedores PostgreSQL 18 desechables: se sembraron 1 empresa, 1500 departamentos y 200 contactos sobre el esquema completo de Prisma, se hizo `pg_dump -Fc` (933 576 bytes, 2125 entradas de índice), se restauró con `pg_restore --exit-on-error` en una instancia vacía y se comparó: mismas cantidades de filas, **301 claves foráneas y 1095 índices idénticos**, 0 huérfanos y checksum de todas las filas de `hr_department` igual.

Límites: no se probó la ruta S3 con restic (la integración falla en el arnés), la restauración de archivos de almacenamiento ni el arranque de la API sobre la base restaurada. Las restauraciones sobre una instancia real requieren aceptación externa.

## 9. Rendimiento

**No hubo medición nueva en navegador**: no hay stack de autenticación propio y no se usaron datos reales. Se conserva lo medido en F3.1 a F3.4 y los guards deterministas (cierre del login 520 KB gzip, solicitudes de `/blueprints` y `/runtime/modules` con `slim`). Cambios de este Bloque que afectan el rendimiento: `sync/pull` ahora devuelve cursores compuestos y el primer sync se difiere 4 s con prioridad para el push. Sin afirmaciones de latencia.

## 10. Compatibilidad ERP, Atlas y Hub

Atlas 0.11.1 en ambos, catálogos registrados. El validador compartido rechaza todo valor de audio y video que no sea `asset:<sha256>` (22 casos). **Pendiente: ejecutarlo a través del sandbox real del Hub.** `prepare-marketplace-validator.mjs` exige un manifiesto de paquetes compartidos de un árbol limpio (`dirty:false`) y el árbol de ERP tiene cambios de otra sesión.

Orden de actualización: (1) ERP (API, worker, web); (2) paquetes compartidos desde el SHA ya publicado de ERP; (3) Hub, con su sandbox preparado; (4) solo entonces habilitar plantillas con audio y video. El Hub nunca antes que ERP.

## 11. Estado legal y SBOM (no es una declaración de cumplimiento)

| Tema | Estado |
|---|---|
| SBOM CycloneDX | `docs/sbom/runly-npm-prod.cdx.json` (1323 versiones con hash), `docs/sbom/runly-desktop-cargo.cdx.json` (**625 crates con licencia declarada**; 5 MPL-2.0, 2 con LGPL-2.1 como alternativa OR, 1 CDLA-Permissive-2.0) |
| Avisos | `docs/THIRD_PARTY_NOTICES.md` (resumen, 28 versiones npm a revisar, fuentes, activos sin procedencia) y `docs/THIRD_PARTY_LICENSE_TEXTS.md` (555 textos de licencia o NOTICE, verbatim) |
| Correos de autores | Los textos se conservan **sin alterar**. En lugar de editarlos, la puerta de privacidad exime solo las líneas exactas (por sha256) registradas por el generador, solo en ese archivo; una línea modificada u otra dirección sigue siendo un hallazgo (prueba incluida) |
| `country-state-city` | Código GPL-3.0 y datos ODbL-1.0. Servicio geográfico preparado e **inactivo**: la deriva de datos respecto al paquete (477 estados y 52 565 nombres de ciudad) exige una migración compatible antes de activarlo |
| `ffmpeg-core.wasm` | Compilado con `--enable-gpl` (x264, x265, libvpx, LAME...). Solo el MP4 de respaldo de Studio necesita componente GPL. **No se sustituyó.** Decisión técnica propuesta: núcleo LGPL propio y WebCodecs como ruta principal |
| Sin inventariar | Contenedores (imagen base y paquetes del sistema), binarios finales, Atlas y Hub completos, 112 paquetes npm sin archivo de licencia, sonidos, logos de módulos, `og-image.png`, modelos Piper |

Para revisión legal: obligaciones de fuente correspondiente del binario GPL; si cargarlo como archivo aparte basta como agregación; patentes de H.264 y AAC; alcance de «compartir igual» de la ODbL para archivos derivados por país; MPL-2.0 en cinco crates; `Apache-2.0 AND LGPL-3.0-or-later` en `@img/sharp-win32-x64`; textos y avisos exigidos por cada licencia en la distribución de escritorio y PWA.

## 12. Defectos corregidos en el programa (con evidencia)

| Defecto | Corrección |
|---|---|
| Sync pierde filas con más de 500 por entidad o con empates de `updatedAt` (reproducido: 100 de 610; 700 empatadas devolvían 500) | Cursor compuesto aditivo, motor que drena `hasMore`, persistencia por página, `complete:false` sin marcar sincronizado, registros con cambios locales no se sobrescriben, tombstones de calendario |
| Suite general daba verde sin ejecutarse cuando la lista de archivos superaba el límite de Windows (**falso positivo detectado**) | El ejecutor trabaja por lotes de 100, suma los totales y falla si un lote no devuelve resumen |
| La suite lanzaba orquestadores de laboratorio (`scripts/test-*.mjs`) que levantan pilas Docker | Excluidos de la suite general; se ejecutan con sus comandos propios. (Mi ejecución dejó dos pilas Supabase desechables que eliminé, sin tocar contenedores ajenos) |
| Prueba de Marketplace de Studio: el diálogo abierto desde una tarjeta quedaba vacío, sin forma de iniciar la revisión (regresión del diálogo de una pantalla) | Tarjeta del recurso y botón «Revisar» explícito; la prueba conserva todas sus aserciones |
| 4 fallos de Website con PostgreSQL | Arnés al día (migraciones, runtime público); prueba de catálogo con selección explícita, ahora verifica además que un producto no incluido permanece oculto |
| Suites de Postgres fallaban al importar sin su base | Se omiten sin la variable de su contenedor; se ejecutan completas con su script |
| Notificaciones, perfil y reduced-motion (Bloque B) | Ver `RUNLY_PERFORMANCE_F3_4_RESULTS.md` |

## 13. Bloqueadores restantes

| Bloqueador | Para qué destino | Acotado a |
|---|---|---|
| Ensayo de actualización con copia de datos de staging | Staging y producción | C3 |
| Sandbox real del Hub (árbol limpio y manifiesto de paquetes) | Hub y publicación de plantillas con audio y video | Preparar `MARKETPLACE_VALIDATOR_ROOT` desde un árbol limpio |
| Content Intelligence consolidación: confirmar si entra | Alcance del RC | Decisión de la otra sesión |
| Borrados duros offline | Capacidad offline aceptada | Diseño en sección 6 (tabla `sync_tombstone` y disparadores) |
| Memoria y rendimiento en navegador con datos de pruebas | Producción | Una pila de pruebas con autenticación |
| Teléfonos reales | Producción | Sección 14 |
| GitHub Actions sobre el SHA | Producción | Sección 15 |
| Revisión jurídica y SBOM de contenedores | Distribución comercial | Sección 11 |
| ~~Integración S3 de recuperación~~ | Resuelto (sección 18) | Pasa; falta restaurar archivos y arrancar la API sobre la base restaurada |

## 14. Pruebas físicas para tus teléfonos

1. PWA: instalar desde el navegador, abrir sin red, volver a abrir con red y comprobar que sincroniza sin duplicar registros.
2. Iniciar sesión, abrir Home y tres módulos; el menú lateral abre y cierra sin saltos y la navegación responde al tacto.
3. Tabla larga (contactos o inventario): desplazar rápido, buscar escribiendo y seleccionar filas; sin congelamientos.
4. Formularios con selectores y modales: el teclado no tapa el botón de guardar y el modal conserva su cabecera y pie fijos.
5. Calendario y Chat: abrir, escribir y recibir una notificación con la app en segundo plano.
6. Modo avión: abrir un módulo offline (contactos), editar un registro, volver a conectar y comprobar que se sube una sola vez.
7. Cambiar de empresa (si tienes dos): los datos no se mezclan y no aparece información de la otra empresa sin red.
8. Reducir movimiento en los ajustes del sistema: sin animaciones de rebote ni destellos, los indicadores de carga siguen visibles.
9. Studio: abrir una tarjeta del Marketplace; debe mostrar la plantilla y el botón Revisar.
10. Batería y temperatura tras 10 minutos de uso continuo.

## 15. Suite general y GitHub Actions

Suite general (`node scripts/ci/full-suite-baseline.mjs`, 6 lotes de 100 archivos, sin los orquestadores de laboratorio): **6916 pruebas, 6894 aprobadas, 0 fallidas, 22 omitidas, exit 0**. Corrió sobre el árbol de trabajo, es decir, incluye los cambios sin confirmar de la otra sesión de Content Intelligence, que no produjeron fallos. Omitidas (22): pruebas que se saltan por su propia condición (no se desglosaron una a una). Las 5 suites de PostgreSQL de Website y la de sync contra PostgreSQL se **saltan sin su base** (cuentan como archivos que terminan sin fallo, no como cobertura) y se ejecutan completas con sus scripts: Website 86/86 y sync 9/9.

**Historia de la línea base:** los 37 fallos históricos pasaron a 0. 30 se corrigieron en el Bloque A, 2 más (catálogo del runtime y Marketplace de Studio) en el Bloque C y este, y las 5 suites de Postgres de Website se ejecutan ahora de verdad contra su contenedor. `docs/audits/evidence/suite-failures-baseline.txt` queda vacío: cualquier fallo futuro es una regresión.

`quality-gates.yml` ejecuta `run-gates.mjs fast` en cada pull request y push a `main`, y `release` por ejecución manual o etiqueta `v*`, con `full_suite` opcional. Corresponde al candidato: los mismos comandos pasaron localmente. **No se ha ejecutado en GitHub.**

## 16. Comandos propuestos (no ejecutados)

Sincronizar y ejecutar CI, en este orden, sin etiqueta pública hasta tu autorización:

```text
git -C <erp> status --short           # confirmar que solo quedan archivos ajenos conocidos
git -C <erp> push origin main         # dispara quality-gates (fast); luego Actions > Quality Gates > Run workflow > tier=release, full_suite=true
git -C <atlas> push origin main       # solo si hubiera commits locales (hoy ninguno)
git -C <hub> push origin main         # después de ERP y de ejecutar su sandbox
git -C <runly-web> push origin main
```

Despliegue de staging (a ejecutar por ti en el servidor): construir o publicar las imágenes del SHA confirmado con `pnpm docker:release` desde una copia limpia, y actualizar con `./update-local.sh`. Nunca `-latest` sin comprobar el SHA.

## 17. Rollback y commits

Rollback: (1) detener la actualización antes de migrar si el chequeo previo falla; (2) respaldo diario verificado antes de actualizar; (3) volver a las imágenes anteriores **que contengan los cierres de seguridad de F1B** y restaurar la base del respaldo, porque las migraciones son hacia adelante y no se deshacen; (4) no volver a una versión anterior a `e73cdf3ad`; (5) Atlas y Hub se revierten después de ERP en orden inverso al de actualización y solo a una combinación de la matriz ERP-Atlas-Hub con catálogos registrados en ambos.

Commits de ERP de esta intervención (y la anterior), del más reciente al más antiguo: ver `git log 1bc2b5a78..HEAD`; los de este Bloque son `adbfdbb10` (sync PostgreSQL), `09d9cbd9a` (arnés Website), `381a6279b` (Marketplace de Studio), `a9640c146` (SBOM de Rust) y el commit de CI y privacidad posterior. En otros repositorios: runly-web `e96f4dc`, Hub `adc6924`, Atlas ninguno.

## 18. Preparación de staging (segunda intervención, 2026-11-25)

Procedimientos completos en `docs/deployment/RUNLY_RC1_STAGING_RUNBOOK.md`. Resumen de hallazgos:

**SHA definitivo: `e57d7f8171ab2347d58591adb30516bcb075a308`.** Es `adbfdbb10` más tres commits que solo tocan pruebas, scripts de CI, SBOM y docs (`git diff --name-only adbfdbb10 e57d7f817`: ningún archivo de `apps/*/src` ni de `packages` fuera de pruebas, ni `prisma`, ni `infra`). Sus imágenes siguen siendo las de `adbfdbb108cf`. **Corrección a la sección 1:** el HEAD `a6f4675f2` que cité como "solo docs" ya incluía `f22ca6f16` y `8943a404f` (código de la otra sesión); el último commit sin esos cambios es `e57d7f817`.

**Hallazgo: el remoto ya tiene la consolidación.** `git ls-remote origin main` devuelve `28079331e` (local = remoto; runly-web, Hub y Atlas también coinciden). La migración `20270116` y el código de consolidación están en `origin/main`. Se mantienen fuera del candidato por SHA e imagen, no por falta de push.

**Hallazgo: Quality Gates está en rojo en GitHub** (ejecuciones sobre `28079331e`, `ea1675b23` y `1bc2b5a78`). Fallan tres pruebas de instalador (`installer-release.test.js`: "upgrades the reused November release", local y externo, y "legacy scripts upgrade together") porque `actions/checkout` hace un clon de profundidad 1 y las pruebas leen versiones anteriores con `git show <sha>:<ruta>`. Reproducido con un clon `--depth 1` (3 fallos) y corregido con `fetch-depth: 0` (11/11). **Sin publicar**: el cambio en `.github/workflows/quality-gates.yml` está solo local. Security Gates, UUID Policy y Supabase Schema Ownership pasan. El resto del gate fast (lint, privacidad, alcance por empresa, dependencias, UUID, esquema, guards de rendimiento) pasó en CI.

Gate fast en un árbol limpio del SHA (worktree aislado, `node_modules` enlazados): 8/8 en verde. Una prueba (devkit del instalador) falló solo por saltos de línea CRLF de `core.autocrlf=true` en Windows; con checkout LF pasa. En Linux (CI) no ocurre.

### Las 22 pruebas omitidas

Todas se omiten por su propia condición; ninguna se forzó ni se eliminó. No se repitió la suite general: se ejecutó solo el conjunto de archivos con condiciones de omisión (unas 55 suites), que confirma la clasificación. El conteo exacto de 22 depende de las variables de entorno que tenía la corrida general y no se reprodujo.

| Clase | Pruebas | Variable o dependencia | Relevancia |
|---|---|---|---|
| PostgreSQL desechable | Bookings (9 archivos), Ticketing (5), Catalog y Commerce (5), Studio (2), compilador de listas, preflight de esquema, Connections (2), Trash, Office, Purchases (4), Content Intelligence (5) | `*_TEST_DATABASE_URL` o `DATABASE_URL` | **Integridad de datos.** Website y Sync sí se ejecutaron (86/86, 9/9). Las demás **no se ejecutaron en este RC**: ejecutarlas en staging |
| PostgreSQL, seguridad y aislamiento | `user-isolation.integration` (aislamiento por empresa y recurso), `company-deletion.integration`, `files-workspace`, `cross-tenant-security` (`RUN_CROSS_TENANT_TESTS=1`, contra una base viva) | misma | **Seguridad e integridad.** Sin evidencia de ejecución en este RC |
| Servicios externos | MCP integrado e Inspector (URL real), worker Docker de contenido, migración de MirAI (`RUN_MIRAI_MIGRATION_TEST`) | servidor, Docker, red | No bloquean; el MCP real requiere una conexión desde ChatGPT o Claude |
| Navegador | pantalla MCP, formularios de empresa y SMTP, visitante de chat, plantillas de Website en navegador, rendimiento en teléfono | Chromium o Playwright (`RUN_VISITOR_BROWSER_TESTS`) | UI; no bloquean |
| Infraestructura Docker | pipeline de backup y frescura (`RUN_BACKUP_PIPELINE_TESTS=1`), recuperación S3 (`RUN_RECOVERY_S3_TESTS=1`) | Docker, imágenes locales | **Recuperación.** S3: ejecutada y pasa (abajo). Pipeline de backup: no ejecutada en este RC |

**Ninguna es bloqueador de staging**: los casos de integridad de Website, sync y backup se ejecutaron con sus propias bases. **Para producción** son bloqueadores las de seguridad y aislamiento sin evidencia (`user-isolation`, `company-deletion`, `files-workspace`, `cross-tenant`) y el pipeline de backup, hasta ejecutarlas contra la base de staging.

### Arnés de recuperación S3

**No era un defecto de propagación de errores, de inicialización ni de detección de Docker.** La prueba `recovery-s3.integration.test.mjs` se salta a sí misma salvo que `RUN_RECOVERY_S3_TESTS=1`, y `node --test` sale con 0 cuando una prueba se omite (`# skipped 1`, sin crear contenedores). Es el mismo patrón del falso positivo de la suite general. Con la variable y las imágenes locales (`runly-backup-recovery:verification`, `minio/minio`, `postgres:17-alpine`) la prueba **pasa en 50 s**: extracción de snapshots completos y heredados, restauración de un volcado en PostgreSQL aislado, repositorio sin cambios (solo lectura) y rechazo de credenciales incorrectas sin filtrarlas.

Corrección: `scripts/test-recovery-s3.mjs` (`pnpm test:recovery-s3`) activa la puerta y **falla** si hay omitidas, fallidas, canceladas, sin resumen o menos de una aprobada (`scripts/lib/node-test-summary.mjs`, con prueba dirigida `scripts/__tests__/node-test-summary.test.mjs`). Ejecutado: "recovery S3 integration executed: 1 passed". Pendiente: restaurar archivos de Storage y arrancar la API sobre la base restaurada.

### Sandbox del Hub

Manifiesto de paquetes compartidos construido desde un árbol limpio de `e57d7f817` (`dirty:false`, 8 paquetes) y validador preparado con ese manifiesto. Pruebas dirigidas con `MARKETPLACE_VALIDATOR_ROOT` y `HUB_TEST_INTERCHANGE_DIR` (AudioBlock, `VideoBlock.file`, recursos `asset:` declarados, URLs prohibidas, importación, validación y la tubería de 126 MiB de audio y video; archivos `website-av-pipeline`, `website-capabilities`, `marketplace-validation`, wiring e instalación): **34/35**. La que falla fija la revisión del corpus inmutable (`a448509`) a la del validador: el corpus no cambia, así que ese pin se incumple por diseño con cualquier otro SHA. Se repitió el mismo bucle de casos sin el pin: **17/17 con el resultado esperado y el mismo digest**. No se publicó ninguna plantilla ni paquete. Mejora sugerida (repo del Hub, no hecha): separar la revisión del corpus de la del validador en esa prueba.

### Offline, GitHub Actions, legal

Detalle en el runbook (secciones 4, 7 y 8). Borrados duros: no se propagan, pero la edición offline de un registro borrado recibe `NOT_FOUND` del servidor y no lo resucita (`sync-push-service.js`); el riesgo es mostrar datos borrados sin conexión, y el RC no promete borrados exactos offline. Workflow: permisos mínimos (`contents: read`), `pnpm install --frozen-lockfile --ignore-scripts`, Node 22, pnpm 9.15.0, sin caché a propósito, y propaga errores (`run-gates` sale con 1 si falla una compuerta); las acciones no están fijadas por SHA (endurecimiento pendiente). Paquetes del sistema de las tres imágenes en `docs/audits/evidence/container-packages-adbfdbb108cf.txt`.

### Release: fallo de la imagen DWG

`docker buildx` terminó con `error reading from server: EOF` durante `make -j"$(nproc)"` de LibreDWG: el daemon de BuildKit murió, no fue la red ni el tarball (la descarga ya había terminado). Docker dispone de unos 5 GB y la máquina tiene 16 núcleos; LibreDWG genera fuentes C enormes y `-j16` agota la memoria del builder (causa inferida de esas cifras; no se reprodujo el fallo con `-j16`). Corrección: `make -j2` en `infra/docker/dwg.Dockerfile`. Verificado: el `docker build` local de la imagen completa termina bien en 617 s y `dwg2dxf --version` responde `0.13.3`. La imagen `dwg-latest` **no** se publicó desde aquí: repetir `pnpm docker:release:dwg`.

### Veredicto de preparación para staging

**LISTO PARA EJECUTAR EN STAGING, con condiciones.** Cumple: SHA y artefactos fijados, gate fast verde en árbol limpio, validador del Hub preparado y probado, recuperación S3 ejecutada y blindada contra el falso positivo, procedimientos de actualización y rollback con su piso de seguridad, e inventario legal. Condiciones antes de abrir el staging a usuarios: (1) publicar la corrección de `quality-gates.yml` y ver Actions en verde; (2) ejecutar en staging las pruebas de seguridad y aislamiento omitidas y el pipeline de backup; (3) ensayo de actualización con copia de datos (C3); (4) comprobaciones offline en navegador; (5) repetir `pnpm docker:release:dwg`. Siguiente paso: ejecutar el candidato en staging, no otra auditoría.

### Commits de esta intervención

Ver `git log e57d7f817..HEAD` filtrando `rc1`: un único commit de ERP con el arnés S3, la corrección de CI, `make -j2`, el runbook y estos documentos. Ningún cambio en runly-web, Hub ni Atlas (el worktree `_rc/erp` y el validador `_rc/validator` son temporales y están fuera de los repositorios).

## 19. Sincronizacion remota y revision RC1-r1 (2026-11-26)

- `origin/main`: `28079331e` a `64e6389a8` (push normal). Ramas publicadas: `rc/rc1` = `e57d7f817` (RC1 original, recuperable) y `rc/rc1-r1` = `9e637d98a` (RC1 mas un commit que solo cambia `.github/workflows`; el codigo de las imagenes `adbfdbb108cf` no cambia).
- GitHub Actions: Quality Gates tier release verde en `main` (45854778857) y en `rc/rc1-r1` (45854773067); Security, UUID y Schema Ownership verdes en main, `rc/rc1` y `rc/rc1-r1`. El Quality Gates anterior de main (45652909456) fallaba por el clon superficial (`fetch-depth`).
- Hub: la prueba de revision del corpus pasa con la raiz fijada (16/16); solo falla si `MARKETPLACE_VALIDATOR_ROOT` apunta a otra revision. Sin cambios en el Hub.
- DWG: `make -j2` esta en `origin/main`; no hay imagen atribuible a un SHA en esta maquina. Comandos de staging, rollback y pendientes: `docs/deployment/RUNLY_RC1_STAGING_RUNBOOK.md` seccion 9.

## 20. Ejecucion de staging local (2026-11-26/27)

Instancia `runly-rc1-staging` en `D:\RacoonDevs\runly-rc1-staging`, instalada con el Installer fijado a `9e637d98a` (verificado 2026.11.24.1), imagenes locales del RC, Supabase propio (red `runly-rc1-staging_default`, base sin puerto publicado), datos sinteticos, LiveKit desactivado. Nada de la otra sesion se toco (9 contenedores `runly-content-*` y el resto intactos).

**Defectos encontrados en el RC (3 corregidos en codigo, ninguno empujado):**

| Defecto | Evidencia | Estado |
|---|---|---|
| El Installer ejecuta `pnpm db:migrate` (= `prisma migrate deploy && prisma generate`) y con la imagen de la API sin root falla con EACCES al regenerar el cliente: la instalacion y la actualizacion del RC no terminan | `install.log`: migraciones aplicadas y luego `EACCES ... .prisma` | Corregido en `ecfa517a5` (`prisma migrate deploy`, version del Installer 2026.11.26.1; 115 pruebas del Installer en verde). **Requiere publicar el Installer (nuevo SHA) antes de usar `update-local.sh` con estas imagenes** |
| `GET /sync/pull` solo comprobaba pertenencia a la empresa: un miembro sin `contacts.contacts.read` (o sin HR, flota, catalogo, ledger, calendario) descargaba esos registros | usuario sin permiso: 500 contactos; tras el arreglo 0 y, con permiso concedido, 500; tras revocar, 0 con el mismo token | Corregido en `3ae266cf5` con prueba. Es **bloqueador de produccion** si no entra |
| `manageable()` de Files Workspace incluye `hrProfileEmployees`, relacion que ya no existe en `FileAsset`: renombrar, compartir o eliminar documentos propios falla con error de Prisma | `files-workspace.test.js` en la imagen del RC | Corregido en `cccd9ddc8` |

Las imagenes web y worker no cambian. La API de staging corre `runly-rc1-fix:api-3ae266cf5` (imagen del RC mas esos tres archivos, `sha256:4027a8ea...`); el RC puro de la API tiene los dos defectos de codigo. Un RC1-r2 limpio exige reconstruir la API y publicar el Installer.

**Pruebas (en la imagen del RC salvo indicacion):**

| Prueba | Resultado |
|---|---|
| `user-isolation.integration` | 13/14; la G falla porque el sustituto de la prueba no crea `website_domain` (parte publica del sitio), la parte de calendario antes de la falla pasa. Defecto de la prueba, no de aislamiento |
| `company-deletion.integration` | 9/9 |
| `files-workspace` | 6/8 tras el arreglo; 1 espera 403 donde el codigo responde 404 (equivalente en seguridad) y 1 depende de ese primer paso. Pruebas desactualizadas, abiertas |
| `test:security` (21 archivos) | 151/152; la restante lee `apps/worker` que no existe en la imagen de la API |
| Sincronizacion offline PostgreSQL (arbol de trabajo) | 9/9 |
| Recuperacion S3 | 1/1 |
| Ensayo de backup y restauracion | 60/64; hallazgo real: la retencion no poda (`forget` agrupa por host y ruta temporal distinta, cada corrida es su grupo); 3 fallos del arnes de replica (compuerta de hosts externos en `blueprint`/`runly_module`, API aislada sin sanar, aplicacion recuperada con 404 en notas) sin diagnosticar |
| Contrato HTTP (dos empresas) | 13/14; falla "company B tiene otra representacion" porque ambas empresas tienen los mismos 29 modulos |
| Worker | 621 eventos del outbox, 621 procesados (`processed_at`) |
| Navegador desktop 1440 | login 2 s, sesion restaurada, 12 modulos abren sin errores de consola ni respuestas >= 400, heap 30 a 68 MB |
| Navegador movil 390 (Pixel 7, tactil) | 9 pantallas sin desbordamiento horizontal, heap 31 a 53 MB |
| IndexedDB real | sincronizacion de 602 filas (mas de 500 por entidad); cortada tras la primera pagina (501) y reanudada a 602 unicas sin duplicados; cambio de empresa: B muestra 20 filas y ninguna de A; otro usuario sin permiso ve 0 |
| Revocacion de permisos | `/contacts` 403 y `/sync/pull` 0 registros de inmediato con el mismo token |

**Limites observados (no corregidos):** cerrar sesion borra la boveda pero **no** los registros de IndexedDB (siguen por usuario y empresa en el dispositivo); la web no carga sin conexion (sin service worker, el modo sin conexion es de escritorio); por HTTP fuera de localhost el navegador no es contexto seguro y la app falla tras iniciar sesion (`crypto.randomUUID`), asi que el telefono necesita HTTPS; la raiz `/` de la web redirige a `http://host/app/` sin el puerto (usar `/app/`); la verificacion de salud del Installer ignora `RUNLY_API_HOST_PORT` de `.env` y marca fallo con un puerto distinto de 4010 aunque la API este sana.

**Pendientes:** actualizacion desde la version desplegada (hay que identificarla), telefono fisico por HTTPS, memoria en dispositivo real, Tauri, revision juridica, SBOM de contenedores, diagnostico de los tres fallos del ensayo de backup y la retencion.

**Veredicto:** APTO PARA STAGING con los tres arreglos aplicados a la API; **no apto para produccion** hasta reconstruir la API, publicar el Installer corregido y cerrar la retencion de backup y las pruebas desactualizadas.

## 21. RC1-r2 (2026-11-27): cierre tecnico y aceptacion automatizada

**Candidato:** `rc/rc1-r2` = `148a236f76974064ba94b6d3c50f60a540c46402`, sobre `rc/rc1-r1` (`9e637d98a`). Tres commits: `c8aff4ed4` (correcciones), `264cf7043` (manifiesto del Installer 2026.11.26.2) y `148a236f7` (solo `scripts/rehearsal`, sin efecto en imagenes). No contiene Content Intelligence ni otros trabajos de `main`. **Estado remoto:** publicado con push normal; `origin/main` no se toco (la otra sesion tiene commits locales sin publicar mezclados con los propios; las correcciones estan tambien en `main` local y se integran con `git merge rc/rc1-r2`).

**GitHub Actions sobre `148a236f7`:** Quality Gates (tier release, run 46023889951), Security Gates, UUID Policy y Supabase Schema Ownership en verde; lo mismo sobre `264cf7043`. No se repitio localmente la suite de 6916 pruebas.

**Imagenes (construidas de `264cf7043`, secuencialmente, contrato `studio-realtime-1`):** API `runly-rc1r2:api-264cf704309c` `e4a20fc6a445`, worker `bfcb2674b508`, web `39f9c8c70fa4`, backup `e6161cc26dc2`. DWG no se reconstruyo. Nada se publico en registros. Staging corre estas imagenes (IDs verificados) sin archivos superpuestos; la imagen con parche manual se elimino.

**Correcciones:**

| Area | Cambio |
|---|---|
| `sync/pull` | solo sirve entidades con el permiso `*.read` del modulo (`3ae266cf5`) |
| `sync/push` | cada mutacion exige `*.create|update|delete` de su entidad; el resto responde `PERMISSION_DENIED` y el cliente la marca fallida, no se pierde en silencio |
| Offline al cerrar sesion o cambiar de usuario | se abortan las peticiones en vuelo, se borran registros, estado de sync y cache de la identidad anterior despues de que termine el trabajo en curso (una respuesta tardia no repuebla), se **conservan** las mutaciones pendientes y los conflictos, y al montar se limpian las bases de otras identidades (se borran si no tienen pendientes). Service workers existentes (kiosco, notificaciones) no guardan datos de API |
| Installer | `prisma migrate deploy` en lugar de `pnpm db:migrate` (imagen sin root); la verificacion de salud usa el puerto y bind reales (shell o `.env`) |
| Files Workspace | relacion `hrProfileEmployees` eliminada de `manageable()` |
| Web | la raiz `/` redirige a `/app/` relativo (conserva el puerto publicado; compatible con proxy TLS) |
| Backup | `restic forget --group-by host,tags` (la agrupacion por ruta temporal aleatoria impedia podar) |

**Contrato 403/404 (Files):** el propio archivo de pruebas ya aceptaba `[403, 404]` para pares sin invitacion; un archivo restringido que el usuario no ve se oculta (404) o se rechaza (403). Se alineo la invitacion pendiente y la comparticion revocada a ese conjunto; ninguna asercion se elimino, y las operaciones sobre un archivo visible siguen exigiendo 403 exacto. Pruebas de aislamiento: el sustituto del registro de dominios y el contexto de inquilino de las rutas de sitio se modelaron como exige el codigo actual (la historia de publicacion es de solo anexar y no admite filas reales de prueba); todas las aserciones se conservaron.

**Aceptacion tecnica automatizada (imagen API r2 salvo indicacion):** aislamiento de usuarios 14/14; eliminacion de empresas 9/9; Files Workspace 8/8; pruebas de permisos de sync y 114 de `@runly/offline` (con fake-indexeddb) en verde; instalador 115/115; **actualizacion real r1 a r2 con el Installer en `148a236f7` y las imagenes r2 termina con codigo 0** (migraciones, semilla, contenedores, salud con puertos no estandar) sin tocar contenedores a mano; ensayo de backup y restauracion **64/64** con 0 hallazgos (retencion verificada: se conserva un completo diario, se olvida el anterior, la restauracion posterior es integra), compuesto de una corrida completa mas la repeticion de los tres tramos corregidos sobre el mismo estado de corrida; worker: 621/621 eventos procesados, sin errores. Navegador real (Chromium) con IndexedDB y dos cuentas: sincronizacion de 602 filas; tras cerrar sesion 0 registros y 1 mutacion pendiente conservada; cierre de sesion con una descarga lenta en vuelo termina en 0 registros; el segundo usuario ve 0 y no hay datos del primero; revocacion con el mismo token efectiva de inmediato.

**Compatibilidad movil simulada (no es aceptacion fisica):** Chromium con Pixel 7 tactil (9 pantallas) y tableta 768 x 1024: sin desbordamiento horizontal, sin errores de consola ni respuestas >= 400, heap 28 a 66 MB. WebKit no esta instalado y no se instalo.

**Limites documentados:** un dispositivo desconectado conserva sus datos locales hasta que vuelve a conectarse o se cierra sesion (la revocacion de permisos solo se aplica al sincronizar); si un dispositivo se desconecta y pierde la sesion sin cerrar, la limpieza ocurre en el siguiente inicio de cualquier usuario. Borrados duros sin tombstone siguen sin reflejarse offline (sin cambios, fuera de alcance). La web no abre sin conexion.

**Pendientes abiertos:** `module-trust.test.js` "a change inside the module node_modules or a symlink..." falla dentro de las imagenes (r1 y r2) porque el detector barato (conteo, tamanos y mtime) no ve una reescritura del mismo tamano en el mismo tick de mtime y reutiliza el hash anterior: no es regresion, es una brecha de deteccion de manipulacion a evaluar; `repository privacy` local falla por `docs/audits/content-intelligence-stage4d/worker-image.spdx.json` (trabajo de otra sesion, no en r2); prueba de seguridad que lee `apps/worker` desde la imagen de la API.

**Separacion de aceptacion:** 1) tecnica automatizada: lo anterior; 2) fisica diferida: iPhone, Android, HTTPS en telefono, camara, PWA y llamadas; 3) juridica pendiente: licencias y avisos (seccion 11); 4) ensayo de actualizacion desde la version de produccion: sin ejecutar, requiere identificarla (el ensayo r1 a r2 fue entre candidatos); 5) mejoras futuras: tombstones, endurecimiento del detector de confianza de modulos, WebKit en CI, SBOM de contenedores.

**Veredicto:** APTO PARA STAGING con r2 (aceptacion automatizada completa); producion sigue pendiente de los puntos 2 a 4.
