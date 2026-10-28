# Runly: certificacion integrada y Release Candidate (local)

Fecha: 2026-10-28. Alcance: exclusivamente local (Docker y Supabase desechables).
No se uso SSH, VPS, credenciales de produccion, publicacion de imagenes ni
`update-local.sh` / `update-external.sh`. No se publico ni desplego nada.

Este documento certifica la integracion, no introduce funcionalidades. Las unicas
modificaciones de codigo de esta pasada son correcciones de fixtures de prueba
(seccion 2).

## 1. SHA certificado e imagenes

Candidato: `330e4a71204990cc6b5bd7f4dfdfe20bd08a8296` (rama `main`, arbol limpio al
congelarlo). Las tres imagenes se construyeron con `scripts/build-local-api-image.mjs
--ref=<SHA>` (archivo `git archive` del SHA, sin cambios locales).

| Imagen | Tag local | Digest (id) |
|---|---|---|
| API | `runly-notifications:api-330e4a712049` | `sha256:de6655e51930cb01faa3e7611dd5ad8ff054cf93538c0f42d46e84cb02576322` |
| Worker | `runly-notifications:worker-330e4a712049` | `sha256:d2121ecefad9e4ad57da500954b55735f6ac17e9e88a9d19065a86bbfee2882c` |
| Web | `runly-notifications:web-330e4a712049` | `sha256:cdf17d8397367de3cbca39f205c7ea97dff9033ac8952700add652a767b3564c` |

Los alias `runly-studio:rc-…`, `runly-notes-private:rc-…` y `runly-notes-private:api-…`
apuntan a la misma imagen API (mismo id `de6655e51930`): los scripts de prueba validan
el nombre del repositorio de la imagen, por lo que se re-etiqueto sin reconstruir.

Version del Installer (`infra/installer/release-files.json`): `2026.10.28.5`.
Version de `package.json`: `0.1.0` (sin cambios). Edicion: Jaguar.

Compatibilidad entre componentes: API, Worker y Web salen del mismo SHA; el Installer
del mismo SHA los orquesta (los 8 escenarios del apartado 3 los usan juntos).

Commit posterior: `bf16ccd1e` modifica unicamente scripts de prueba
(`scripts/measure-studio-realtime.mjs`, `scripts/verify-user-isolation.mjs`) y
`.gitignore`. Las imagenes se construyeron en `330e4a712`; el codigo de producto de
`bf16ccd1e` es identico al del candidato.

## 2. Correcciones indispensables de fixtures (no de producto)

| Fixture | Problema | Correccion |
|---|---|---|
| `measure-studio-realtime.mjs` | La API del candidato no arrancaba (`NOTES_STORAGE_OWNER_PREPARATION_REQUIRED`): el fixture no preparaba el propietario de Storage. El control de seguridad nuevo funcionaba como se disena. | Prepara el propietario desechable en `--phase=after`, igual que los demas fixtures. |
| `verify-user-isolation.mjs` | El stub de Supabase era anterior a la migracion `20261210000000_studio_realtime_ephemeral` (faltaban `auth.sessions` y el rol `runly_studio_socket` con `USAGE` en `realtime`). | Se anaden ambos al bootstrap del stub. |

## 3. Instalaciones y actualizaciones (imagenes del candidato)

`scripts/verify-notes-installer-e2e.mjs` con las tres imagenes del candidato. Ejecuta
los `setup-local.mjs` / `setup-external.mjs` reales sobre pilas desechables con puertos
libres. Resultado: 8 de 8 PASS.

| Caso | Tipo | Resultado |
|---|---|---|
| local-existing-upgrade | Local, instalacion existente (imagen previa, buckets publicos, nota e imagen testigo) | PASS |
| local-fresh | Local nueva | PASS |
| external-owner-available | External con credencial de propietario | PASS |
| external-no-owner-prepared | External sin credencial, Storage preparado | PASS |
| external-no-owner-unprepared | External sin credencial, Storage sin preparar | PASS (el installer se detiene antes de reemplazar contenedores) |
| external-bad-owner-credential | Credencial de propietario incorrecta | PASS (falla sin exponer la credencial) |
| external-partial-preparation | Preparacion parcial (politica sin guard o viceversa) | PASS (falla cerrado) |
| external-regression-to-unsafe | Storage preparado que regresa a estado inseguro | PASS (falla cerrado) |

Cada caso verifica (no se acepta solo `/health`): lecturas anonimas denegadas por URL
publica, por endpoint de objeto y por render; listado anonimo vacio; bytes originales
de la imagen testigo y nota intactos; `note_image_binding` con la imagen historica;
repeticion idempotente.

Matriz solicitada y cobertura:

| Requisito | Cubierto por |
|---|---|
| Instalacion local nueva | local-fresh |
| Actualizacion local existente | local-existing-upgrade |
| Instalacion external preparada | external-no-owner-prepared |
| Actualizacion external existente | external-owner-available / external-no-owner-prepared (parten de base con datos) |
| Credencial de propietario ausente | external-no-owner-prepared / -unprepared |
| Storage no preparado / preparado | external-no-owner-unprepared / -prepared |
| Permisos faltantes | external-bad-owner-credential, external-partial-preparation |
| Actualizacion repetida | repeticion idempotente dentro de cada caso |
| Preservacion de datos testigo | nota e imagen testigo verificadas en cada caso |
| Recuperacion de una actualizacion interrumpida | **Cobertura parcial**: external-partial-preparation y external-regression-to-unsafe cubren un estado intermedio/inseguro; no se mato el proceso del installer a mitad de ejecucion. |

Regresion de Notes con el candidato (`runly-notes-private:api-330e4a712049`):
`verify-notes-private-storage.mjs` instalacion nueva PASS; con `--upgrade --ui` PASS
(imagenes historicas, Excalidraw con manifiesto historico, nota publica y Excalidraw
publico sin abrir Storage, previews autorizados).

## 4. Integracion Realtime con identidades reales

Todas las pruebas usan Supabase Auth/Realtime/Storage desechables, JWT reales y
Chrome via Playwright.

### Studio
`measure-studio-realtime.mjs --security --e2e`:
- Seguridad PASS: socket real solo entra a su scope efimero exacto; Auth/anon/otro
  diseno/reuso de tokens de API denegados; politica global restrictiva sin cambios;
  legacy live sigue autorizado; VIEWER obtiene capacidad efimera pero no persiste.
- E2E PASS: cursores (109 ms), presencia/salida (24 ms), multipagina, multiples
  pestanas, MCP con aprobacion y commit real, coexistencia protocolo viejo/nuevo,
  reconexion tras 30 s (17,1 s), refresco de token, caida solo de API, revocacion
  (cierre de canales en 20,2 s dentro del lease), cambio de diseno y desmontaje sin
  fugas de canales ni participantes, 0 peticiones `/live`.
- Plantillas, guardado y exportacion: cubiertos por la suite Node (Studio) y los
  verificadores de interchange existentes; **no se reejecutaron en navegador** en esta
  certificacion.

### Canvas, Notes, Chat
`measure-realtime-2.mjs --ui --security --strict` (Notes, 2 usuarios), 2 de 2 PASS,
`releaseBlockers: []`: el cliente no puede falsificar `canvas changed`; awareness
verificado y suplantacion rechazada; sockets cerrados/revocados sin actualizaciones;
`privateNoteImagePubliclyReadable: false`; rotacion de autorizacion bloqueada ~770 ms
bajo latencia inyectada de 750 ms (barrera `FOR SHARE` intacta).
Cubre Y.js, Tiptap (edicion remota), Excalidraw, imagenes privadas, autosave,
recarga/reconexion y revocacion.

**Hallazgo**: la primera ejecucion combinada (4 modulos, 1/5/10 usuarios) fallo una vez
en `UI_TIMEOUT: Tiptap remote edit` (limite de 15 s). Se repitio dos veces con la
misma configuracion minima y paso ambas. No se aislo la causa raiz; se clasifica como
intermitencia bajo carga (riesgo residual R4). Chat (mensajes, adjuntos, typing,
presence, contadores, chat flotante, invitados, senales de llamadas) se ejercito en
`chat-ui` (mensajes, contadores, conversaciones) y por la suite Node; **adjuntos,
invitados y senales de llamada no se reejecutaron en navegador** con el candidato.

### Notificaciones
`measure-notifications.mjs` (1/5/10 usuarios, escenarios A, C, D, E, F, H, J, S):
broadcast inmediato a campana, inbox, dos pestanas, caida de Realtime con
recuperacion, seguridad con identidades reales (0 fallos de 12 verificaciones por
corrida, 3 corridas), 0 avisos perdidos. Lecturas, contadores, preferencias, DND,
dedupe y worker con proveedores simulados: suites unitarias (11 de
`notificationSync`, dedupe, servicio, worker); DND y push/FCM reales **no** se
validaron end to end.

## 5. Seguridad

| Verificacion | Resultado |
|---|---|
| Aislamiento entre empresas contra PostgreSQL (`user-isolation.integration`, bootstrap limpio con todas las migraciones) | 14 de 14 PASS (Studio, Canvas, Notes, Chat, Calendario, finanzas personales, MirAI, archivos) |
| Studio: otro diseno, anon, reuso de tokens, revocacion | PASS |
| Notificaciones ajenas / canales de otra empresa | `S_security` 0 fallos (3 corridas por tamano) |
| Notas e imagenes privadas | lectura anonima denegada (URL publica, objeto, render, listado) en el E2E del installer (8 casos) y en las regresiones de Notes (nueva y con actualizacion) |
| Sesiones expiradas / revocaciones | Studio (lease 30 s, expiracion verificada), Canvas/Notes (cierre de sockets), Chat |
| RLS y politicas de Storage | sin cambios; politica RESTRICTIVE `runly_notes_private_images_v1` y trigger guard verificados de solo lectura por el installer |

## 6. Rendimiento (candidato)

Ventanas comparables a `RUNLY_REALTIME_2_LOCAL_VALIDATION.md` (60 s, actividad
activa). CPU en segundos por ventana; "certificado" es la cifra "despues" de ese
informe. Mediciones unicas por celda, no promedios estadisticos.

| Modulo | Usuarios | CPU total candidato | CPU total certificado |
|---|---:|---:|---:|
| Canvas | 1 / 5 / 10 | 1,11 / 27,9 / 50,0 | 1,20 / 29,59 / 62,65 |
| Notes | 1 / 5 / 10 | 9,7 / 34,4 / 65,4 | 11,24 / 41,81 / 77,18 |
| Chat (chat-ui) | 1 / 5 / 10 | 9,4 / 47,4 / 123,2 | 14,28 / 102,13 / 208,30 |

Canvas y Notes conservan o mejoran la reduccion. Chat: la comparacion no es
equivalente (el informe certificado usa el modo "Chat hooks"; aqui el modo `chat-ui`),
por lo que solo se concluye que no se observa deterioro. Errores HTTP: 0 en todas las
celdas.

Studio (30 s, `--phase=after`, sin `--security`): 0 peticiones `live` por minuto y 0
escrituras de presencia; SQL con 10 usuarios 297 llamadas en 30 s frente a 77.980 en
60 s de la linea base; p95 de entrega 15,9 a 68 ms (537 ms en el primer escenario de
conexion, `cursor-1`). Ventana distinta de la certificada: mejora conservada, no
comparacion estricta.

### Notificaciones (45 s por escenario)

| Metrica | 1 usuario | 5 usuarios | 10 usuarios |
|---|---:|---:|---:|
| Nueve avisos, p95 de aparicion en campana | 73 ms | 171 / 183 ms | 352 / 492 ms |
| Linea base previa (p95) | 26,7 s | 26,9 s | 28,1 s |
| Reposo: llamadas SQL por ventana | 132 | 674 | 1.623 |
| Reposo: CPU API / PG / Realtime (s) | 0,13 / 0,42 / 0,17 | 0,76 / 0,58 / 0,20 | 0,91 / 0,94 / 0,20 |
| Dos pestanas, p95 | n/a | n/a | 466 ms |
| Caida de Realtime, p95 de recuperacion | 275 ms | 10,1 s (valor atipico) y 184 ms (repeticion) | 0 ms (p50 y p95 sobre 10 muestras) |
| Avisos perdidos / toasts duplicados | 0 / 0 | 0 / 0 | 0 / 0 |

Las cifras con dos valores son dos corridas independientes del candidato (`rc` y
`rc2`). El p95 de 10,1 s con 5 usuarios en la caida de Realtime no se reprodujo en la
repeticion (184 ms); queda registrado como valor atipico no explicado (R3). El CPU de
Realtime en el escenario J es invalido (contador reiniciado al reiniciar el
contenedor, sale negativo) y no se usa.

Los valores del p95 son algo mayores que los del informe de Notificaciones (67, 170,
305 ms) pero del mismo orden y 50 a 80 veces menores que la linea base.

### Rafaga de 100 avisos a 10 usuarios (1.000 entregas)

| Corrida | CPU API | CPU PG | CPU Realtime | SQL | Ultimo aviso visible (p95) |
|---|---:|---:|---:|---:|---:|
| Linea base previa | 3,7 s | 6,7 s | 0,3 s | n/d | 27,5 s |
| Informe de Notificaciones | 9,3 s | 16,6 s | 4,2 s | n/d | 10,6 s |
| Candidato `rc` | 12,3 s | 23,8 s | 6,5 s | 18.159 | 14,7 s |
| Candidato `rc2` | 12,3 s | 21,1 s | 5,3 s | 18.634 | 14,2 s |

El candidato cuesta mas CPU en rafagas que la linea base previa (PG 3,1 a 3,5 veces,
API 3,3 veces, Realtime 18 a 22 veces) y entre 27 y 43 % mas PG que mi medicion
anterior, con una latencia visible de 14 s (anterior 10,6 s; linea base 27,5 s). Las
dos corridas del candidato son consistentes entre si; la diferencia con la medicion
anterior no se aislo (carga del equipo vs. cambio de codigo). Con 5 usuarios: 5,6 a
6,3 s visibles, PG 4,8 a 5,9 s; con 1 usuario: 2,2 s.

Causa: cada aviso se emite por Broadcast privado a cada destinatario; en una rafaga
de N avisos a U usuarios son N x U escrituras en `realtime.messages` y N x U
autorizaciones. Agrupar eventos por destinatario (un evento "hay novedades" con
coalescencia de 100 a 250 ms, y recuperacion por `/notifications/summary`) reduciria
el costo sin tocar la seguridad. **No se implemento**: no hay bloqueo de estabilidad
ni de seguridad (0 perdidos, 0 duplicados, sin errores, seguridad intacta). Clasificado
como mejora posterior, prioridad media; solo importa para empresas que emiten rafagas
de cientos de avisos.

### No medido en esta certificacion
Memoria (RSS) y fugas de conexiones no se midieron de forma equivalente (el informe
Realtime 2 tampoco tiene comparacion RSS inicial/final para 60 s); CPU y memoria del
Worker; 20 usuarios y 1.000 notificaciones; PWA movil suspendida.

## 7. Pruebas generales

| Gate | Resultado |
|---|---|
| Suite Node completa (950 archivos `*.test.js` / `*.test.mjs` rastreados, lotes de 80, concurrencia 4) | 5.700 pruebas: 5.674 PASS, 11 FAIL, 15 SKIP, 0 canceladas, 0 todo (5.674 + 11 + 15 = 5.700) |
| `pnpm lint` | exit 0 |
| `pnpm --filter @runly/desktop build:web` | exit 0 |
| Imagenes Docker API / Worker / Web | construidas |
| Installer E2E (candidato) | 8 de 8 |
| Aislamiento entre empresas contra PostgreSQL | 14 de 14 |
| `pnpm test:mcp` | **208 pruebas: 189 PASS, 17 FAIL, 2 SKIP** (ver abajo) |
| Regresiones Files / SDK | incluidas en la suite Node (sin fallos nuevos) |

### Reconciliacion con "4.323 / 4.310 / 7"
El conteo anterior (4.323 pruebas, 4.310 aprobadas, 7 fallidas) correspondia a una
lista de archivos mas corta. Las 6 pruebas restantes de ese conteo (4.323 - 4.310 - 7)
no se pueden identificar retroactivamente: eran omitidas u otro estado. La ejecucion
actual si esta contabilizada al 100 %: 15 omitidas, todas con condicion propia de
omision en el codigo (`RUN_CROSS_TENANT_TESTS`, `DATABASE_URL` ausente, Docker o
variables de entorno), por ejemplo "cross-tenant security", "applyConnectionWrites
against PostgreSQL", "schema evolution against PostgreSQL" y pruebas de UI sin
navegador. Varias de esas condiciones se cubren en otra via en esta certificacion
(aislamiento contra PostgreSQL 14/14, Studio contra PostgreSQL desechable). No se
agrego ningun skip.

### Fallos heredados: linea base reproducible
Se extrajo `133a897210e3` (commit anterior al primer cambio de este trabajo) con
`git archive` en un directorio temporal bajo el repositorio (node_modules enlazados) y
se ejecutaron los 9 archivos que fallan. Resultado: **fallan exactamente los mismos 9
archivos y las mismas 11 pruebas** en la linea base y en el candidato.

| Archivo | Pruebas | Causa observada |
|---|---:|---|
| `calls/__tests__/contacts-proposal-module.test.js` | 2 | heredada (Contacts) |
| `calls/__tests__/call-transcript-analysis-service.test.js` | 1 | heredada |
| `__tests__/public-website-capture-config.test.js` | 1 | heredada |
| `__tests__/module-runtime-routes.test.js` | 2 | espera 404, recibe 500 |
| `services/__tests__/module-runtime-catalog.test.js` | 1 | catalogo de runtime desactualizado (`generate-module-runtime-catalog.mjs`) |
| `scripts/__tests__/installer-devkit-snapshot.test.js` | 1 | snapshot del devkit desactualizado respecto a `@runly/ui` |
| `scripts/__tests__/runly-env-config.test.js` | 1 | los `bootstrap-*.sh/.ps1` no referencian `lib/env-compat.mjs` (origen `134766907`/`c204d5cea`) |
| `scripts/tests/docker-shared-sources.test.mjs` | 1 | la copia temporal no incluye `scripts/generate-installer-release.mjs` (origen `c204d5cea`) |
| `scripts/tests/prosemirror-clipboard-security.test.mjs` | 1 | prueba de navegador, falla en este entorno |

Los dos fallos heredados de Contacts siguen contabilizados (primera fila).

### `test:mcp`: 17 fallos
Causa verificada: `column n.parent_note_id does not exist` (Postgres `42703`). El
runner (`scripts/test-runly-mcp.mjs`) crea la base con `prisma db push` desde
`schema.prisma`, pero las columnas de subpaginas de Notes (`parent_note_id`) solo
existen en la migracion `20261117000000_notes_references_and_subpages`. Tanto el codigo
que usa esas columnas (`23395cbc5`) como el runner (`d9acfe6e0`) estan en el commit
`133a8972` (anteriores a este trabajo). **No se reejecuto `test:mcp` en el
baseline**; la clasificacion se basa en la causa y en el historial, no en una
ejecucion comparativa. Afecta a las herramientas `notes_*`, `projects_workload`,
`projects_time_summary`, `documents_kinds` y `documents_templates`, y a las pruebas
integradas que las usan. Recomendacion: cambiar el runner a `prisma migrate deploy`,
o dejar de modelar esas columnas fuera del esquema. No es un bloqueo del candidato,
pero deja sin cobertura automatica de integracion la capa MCP de Notes.

### Otros hallazgos
- `packages/sdk/src/domains/chat.js` define `assignOperator` dos veces (lineas 421 y
  479); la segunda sobrescribe a la primera (esbuild avisa `duplicate-object-key`).
  No se modifico: es una correccion de producto fuera de alcance. Hay que decidir cual
  firma es la correcta.

## 8. Compatibilidad y condiciones de actualizacion

- **Storage de Notes con propietario**: el bucket `runly-notes` pasa a privado con
  politica RESTRICTIVE y trigger guard. La politica y el trigger requieren el
  propietario del esquema `storage`. En instalaciones locales con Supabase
  autoalojado el installer lo ejecuta con `supabase_admin` (`notes-private-storage-owner.sql`).
  En external hay que proporcionar la credencial de propietario (solo por entorno,
  nunca por argumentos) o haber preparado Storage antes. Sin eso el installer **se
  detiene antes de reemplazar contenedores** y la API del candidato tampoco arranca.
- **Periodo de mantenimiento**: aplicar con Notes sin escrituras activas. El proceso
  inventaria referencias antiguas y las enlaza (`note_image_binding`); notas abiertas
  durante la migracion deben recargarse.
- **URLs antiguas de imagenes**: las URLs publicas directas de Storage dejan de
  funcionar para siempre (bucket privado). Las imagenes se sirven por la ruta
  autorizada de la API; las notas publicas resuelven sus imagenes sin abrir Storage.
  Copias o enlaces que alguien ya descargo o guardo mientras el bucket era publico no
  se pueden retirar.
- **Frontend anterior y caches**: la API sigue aceptando el protocolo anterior de
  Studio (coexistencia verificada). Un frontend viejo no tiene el handler de resumen
  ni el dedupe por id de notificacion: seguira funcionando con polling, pero con
  duplicados mas probables. Service Worker: el nuevo `sw-notifications.js` publica
  `count`; un SW viejo en cache lo omite y la deduplicacion cae a `dk:`/contenido
  (cubierto por pruebas unitarias, no por E2E con SW real). Recomendado: publicar Web
  y API juntas y forzar la actualizacion del SW.
- **Imagenes compatibles**: API, Worker y Web del mismo SHA con el installer
  `2026.10.28.5`; no mezclar con imagenes anteriores a `17a5b0561` (la API vieja no
  conoce el guard de Storage).
- **Supabase Cloud y proveedores gestionados**: no se probo. Si el proveedor no deja
  crear politicas/triggers en el esquema `storage`, la preparacion con propietario es
  imposible y el despliegue queda en NO GO para esa configuracion.
- **Supabase CLI de desarrollo**: no certificado; solo aplica `--verify` y se detiene
  si Storage no esta preparado.

## 9. Riesgos residuales

| Id | Riesgo | Gravedad | Mitigacion |
|---|---|---|---|
| R1 | Rafagas de avisos: coste PG/API/Realtime elevado | Media (solo bajo rafagas) | Agrupar por destinatario (mejora posterior, prioridad media) |
| R2 | `test:mcp` rojo por incompatibilidad runner/esquema | Media (pierde cobertura) | Runner con migraciones |
| R3 | Valor atipico de 10,1 s en recuperacion de Realtime (5 usuarios), no reproducido | Baja | Repetir en el ensayo en clon |
| R4 | Fallo intermitente de UI "Tiptap remote edit" (1 de 3 corridas, bajo carga) | Baja a media | Repetir en el ensayo; investigar si reaparece |
| R5 | 11 pruebas heredadas rojas (9 archivos) | Baja (identicas en la linea base) | Limpieza independiente |
| R6 | `assignOperator` duplicado en el SDK de Chat | Baja | Decidir firma correcta |
| R7 | Memoria/conexiones, Worker CPU, 20 usuarios no medidos | Media (desconocido) | Medir en el ensayo |
| R8 | Imagenes ya descargadas con el bucket publico no recuperables | Inherente | Comunicar al cliente |

## 10. Funcionalidades no probadas

Push/FCM real y Tauri; PWA movil; DND end to end; cambio de empresa en vivo; inbox
Playwright E2E; plantillas/guardado/exportacion de Studio en navegador; Chat con
adjuntos, invitados y senales de llamada en navegador; actualizacion interrumpida
(proceso matado a mitad del installer); `update-local.sh` / `update-external.sh`
ejecutados directamente; proveedor real y Supabase Cloud; 20 usuarios con 1.000
notificaciones; Worker CPU y memoria; `test:mcp` en la linea base.

## 11. Procedimiento de rollback seguro

1. Antes de actualizar: copia de seguridad de la base y del bucket `runly-notes`
   (incluidos los objetos), y registro de los tags/digests de las imagenes actuales.
2. Si falla el gate de Storage: **no hay estado a deshacer**, el installer se detiene
   antes de reemplazar contenedores.
3. Si falla despues del arranque: volver a los tags anteriores de API/Worker/Web y
   `up -d`. Las migraciones Prisma aplicadas son inmutables y aditivas; no se
   revierten.
4. **No reabrir el bucket** como parte del rollback: la API anterior espera objetos
   accesibles por URL publica, pero reabrirlo expone imagenes privadas. Si se
   necesita la API anterior, mantener el bucket privado: las imagenes de notas no se
   mostraran hasta restaurar el candidato (degradacion aceptable frente a exposicion).
5. Si hay que restaurar objetos: usar la copia de seguridad del bucket; el binding en
   `note_image_binding` es independiente y se conserva.

## 12. Dictamen por configuracion

Niveles: (1) GO local del modulo; (2) GO local de la instalacion; (3) preparado para
ensayo en clon restaurado; (4) autorizado para despliegue real.
**El nivel 4 no se concede: requiere autorizacion explicita del responsable.**

| Configuracion | 1. Modulo | 2. Instalacion local | 3. Ensayo en clon | 4. Despliegue real |
|---|---|---|---|---|
| Studio | GO | GO | Preparado | No autorizado |
| Canvas | GO | GO | Preparado | No autorizado |
| Notes (incl. Storage privado) | GO | GO | Preparado | No autorizado |
| Chat | GO (con alcance de seccion 4) | GO | Preparado | No autorizado |
| Notificaciones | GO local, rafagas con coste cuantificado (R1) | GO | Preparado | No autorizado |
| Installer: local nueva / existente | GO | GO | Preparado | No autorizado |
| Installer: external con credencial de propietario | GO | GO | Preparado | No autorizado |
| Installer: external sin credencial, Storage ya preparado | GO | GO | Preparado | No autorizado |
| Installer: external sin credencial y sin preparar | NO GO | NO GO (se detiene por diseno) | No aplica | No autorizado |
| Proveedor gestionado sin acceso al esquema `storage` (p. ej. Supabase Cloud) | NO GO | NO GO | No aplica | No autorizado |
| Supabase CLI de desarrollo | No certificado | No certificado | No aplica | No autorizado |

Condiciones del nivel 3 (ensayo en clon restaurado): restaurar un clon de cada
instalacion real, ejecutar el installer del SHA candidato, repetir el gate de Storage,
medir memoria/conexiones/Worker, repetir R3 y R4, y confirmar las imagenes
historicas de Notes en el clon.

Este informe no declara un GO global ni autoriza ningun despliegue.

## 13. Reproduccion

Los scripts de apoyo de la corrida estan en `.artifacts/rc/` (ignorado por Git). Comandos
principales, todos con las imagenes del candidato:

```text
node scripts/build-local-api-image.mjs --ref=330e4a71204990cc6b5bd7f4dfdfe20bd08a8296 --kinds=api,worker,web
node scripts/verify-notes-installer-e2e.mjs --api-image=… --worker-image=… --web-image=…
node scripts/verify-notes-private-storage.mjs --api-image=runly-notes-private:api-330e4a712049 [--upgrade --ui]
node scripts/measure-studio-realtime.mjs --phase=after --api-image=runly-studio:rc-330e4a712049 --seconds=30 --security --e2e
node scripts/measure-realtime-2.mjs --phase=after --api-image=runly-notes-private:rc-330e4a712049 --modules=canvas,notes,chat-ui --users=1,5,10 --seconds=60 --activity=active
node scripts/measure-realtime-2.mjs --phase=after --api-image=… --modules=notes --users=2 --seconds=10 --ui --security --strict
node scripts/measure-notifications.mjs --api-image=runly-notifications:api-330e4a712049 --label=rc --users=1,5,10 --window=45
node scripts/verify-user-isolation.mjs
pnpm lint
pnpm --filter @runly/desktop build:web
pnpm test:mcp
```

Salidas completas: `.artifacts/rc/*.log`, `.artifacts/notifications/rc-*`,
`.artifacts/studio/realtime/rcbench*.json`.
