# Runly Platform Stabilization: Release Candidate RC1

Fecha: 2026-11-25. Alcance de esta intervención: preparar un candidato identificable y decidir, con evidencia, si es apto para staging. Sin push, PR, publicación, despliegue ni etiqueta.

## Veredictos

| Destino | Veredicto | Por qué |
|---|---|---|
| Desarrollo local | **APTO** | Gates fast y release en verde; suites de seguridad 166/166; imágenes construidas y arrancadas; sync, Website y backup verificados contra bases desechables. |
| Staging controlado | **APTO CON CONDICIONES** | Condiciones C1 a C5 abajo. Ninguna es un defecto conocido del candidato; son comprobaciones que dependen de infraestructura o decisiones que no se podían ejecutar aquí. |
| Producción | **NO APTO todavía** | Faltan: ensayo de actualización desde la versión desplegada con una copia de sus datos, memoria y rendimiento en navegador con datos reales de pruebas, pruebas en teléfonos reales, CI de GitHub sobre el SHA y la validación real del sandbox del Hub. |
| Distribución comercial | **NO APTO** | Revisión jurídica pendiente (GPL de `ffmpeg-core.wasm`, GPL del paquete `country-state-city` y datos ODbL, 112 paquetes sin archivo de licencia, sonidos, logos y modelos sin procedencia registrada, SBOM de contenedores). Una aprobación técnica para staging no implica aprobación jurídica. |

Condiciones para staging:

- **C1.** Desplegar solo desde el SHA confirmado (sección 1), sin los trabajos concurrentes sin confirmar (Content Intelligence consolidación).
- **C2.** Orden ERP, luego paquetes compartidos, luego Hub (sección 10). No actualizar el Hub hasta ejecutar su sandbox real.
- **C3.** Con los secretos y la base de staging, repetir el arranque de las imágenes y el ensayo de actualización con una copia de los datos de staging, no de producción.
- **C4.** Tratar como **no aceptadas** las capacidades offline listadas en la sección 6 como limitadas.
- **C5.** Ejecutar en teléfonos reales la lista de la sección 14 antes de abrir el staging a usuarios.

## 1. SHA candidato y repositorios

| Repositorio | SHA | Estado |
|---|---|---|
| Runly ERP, código del candidato (imágenes) | `adbfdbb10` (`adbfdbb108cf`) | Todos los commits de esta intervención son propios |
| Runly ERP, HEAD tras las correcciones de CI y documentación | ver sección 17 | Después de `adbfdbb10` solo cambian pruebas, scripts de CI y documentación; **ningún archivo de `apps/*/src` fuera de pruebas** (verificado con `git diff --name-only adbfdbb10 HEAD`). Las imágenes siguen siendo válidas |
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
| Recuperación (`scripts/recovery`) | 16/16 unitarias; la integración S3 (MinIO + restic) **no pudo ejecutarse**: termina en silencio antes de crear contenedores, defecto del arnés no investigado |
| Suite general (una sola vez, sobre el árbol de trabajo) | **6916 pruebas: 6894 aprobadas, 0 fallidas, 22 omitidas**; 0 nombres fallidos; la línea base de fallos conocidos quedó **vacía** (sección 15) |

Bloqueadas por infraestructura: sandbox real del Hub (necesita un manifiesto de paquetes compartidos de un árbol limpio), integración S3 de recuperación, CI de GitHub, dispositivos físicos.

## 5. Seguridad

- **Cuarentena, instalación, módulos no confiables, bundles no autorizados, staging de paquetes, RBAC granular:** cubiertos por las 166 pruebas de seguridad y por las comprobaciones HTTP de F3 (423 para un módulo en cuarentena).
- **Secure Runtime:** sigue experimental y apagado por defecto (prueba `integration-flag`); el supervisor de código personalizado no se activó. No se inició otra etapa.
- **Revocación y aislamiento multiempresa en sync:** con base real, otra empresa nunca aparece en el caché local y una solicitud sin pertenencia (resolución de empresa que rechaza) recibe 403 sin ninguna lectura de datos (`sync-postgres.test.js`).
- **Rollback seguro:** el rollback debe volver solo a una imagen que contenga los cierres de F1B (usuario no root, cuarentena sin registro de confianza, permisos). Las imágenes anteriores a `e73cdf3ad` (`runly-candidate:*-e73cdf3ad` y anteriores) no deben usarse como destino de rollback sin reabrir esa revisión.
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
| Integración S3 de recuperación | Recuperación probada | Depurar el arnés (termina en silencio) |

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
