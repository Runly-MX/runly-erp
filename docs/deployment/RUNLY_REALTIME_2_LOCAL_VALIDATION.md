# Runly Realtime 2 — validación local

Fecha: 2026-10-27. **NO GO para publicación aislada.** Hay mejoras medidas y
pruebas de colaboración satisfactorias, pero Storage permite descargar sin sesión
una imagen subida a una nota privada. Además, la matriz de dispositivos y fallas
descrita abajo no está completa. No se desplegó ni publicó nada.

## Identificación y alcance

- SHA inicial: `c5498bd3873c2f9067643fc8b018dbcc0c44b828` (main limpio).
- SHA final de código y harness: `d2cb2ec57db6a30d77de53ae217d88ed60e97aa2`.
- Este informe se incorpora después en un commit exclusivamente documental;
  `git log -1 --format=%H -- docs/deployment/RUNLY_REALTIME_2_LOCAL_VALIDATION.md`
  identifica ese commit sin una autorreferencia imposible de su propio hash.
- Se preservaron los commits concurrentes `e405b981` y `262e505e` de Studio.
- Pila Docker nueva por corrida: Auth, PG, Realtime, Storage, gateway y API;
  identidades reales de Auth. Marcador de entorno y comprobación de motor local
  antes de escribir. Ningún acceso remoto o a bases compartidas.
- Sin migraciones nuevas, cambios de migraciones aplicadas, roles socket nuevos,
  servidor WS adicional, Redis ni cambios de defaults del Installer.

Spec previa: [diseño](../superpowers/specs/2026-10-27-runly-realtime-2-design.md).
Plan: [etapas y evidencia](../superpowers/plans/2026-10-27-runly-realtime-2.md).

## Método y límites de interpretación

`scripts/measure-realtime-2.mjs` ejecuta Playwright sobre implementaciones reales,
no una simulación de red. La medición principal usa hooks/proveedores de producción
en una página liviana. Canvas mueve el puntero a 62,5 intentos/s, throttle de 120 ms
y omisión cuando no hay peers. Notes introduce 20 transacciones locales/s por
editor; Chat envía un mensaje/s por usuario con dos consumidores de hooks
(principal/flotante) y RealtimeProvider. El envío del benchmark Chat usa SDK real;
la prueba UI separada usa el composer y su mutation hook.

Las tablas muestran conteos brutos de ventanas programadas de 60 s con drenaje de
aproximadamente 0,5 s (duración real 60,51–60,54 s); no son porcentajes garantizados
para producción ni promedios de repeticiones estadísticas. CPU significa segundos
acumulados del cgroup, no porcentaje de un núcleo. HTTP incluye autorización y
Presence, pero excluye la carga inicial, contada aparte. WS suma frames entrantes
y salientes de todos los navegadores, incluyendo fanout y heartbeat; no es una
cantidad de cambios únicos. Las capturas CDP no miden el tráfico API→Realtime.

`pg_stat_statements` separa llamadas con una clasificación textual heurística en
lectura/escritura/autorización/otras. No es un conteo de filas ni de IO físico:
funciones SQL y BEGIN/COMMIT pueden quedar en otras; una consulta puede ejercer
varias funciones. El delta es del PG completo de la pila, con Auth/Realtime y
mantenimiento de fondo; no atribuirlo íntegramente al módulo o a Realtime.
Estadísticas de tablas pueden retrasarse; los artefactos conservan ambos contadores.
No se midió por separado el overhead del sampler: está incluido en CPU/SQL.

Memoria de cgroup incluye más que RSS (cachés/páginas compartidas). El heap del
navegador proviene de performance.memory y depende de GC. No hubo muestreo de heap
de Node; se informa como desconocido. RSS de Node se añadió a las pruebas finales,
por lo que no hay comparación inicial/final de RSS equivalente para 60 s.
HTTP p50/p95 mide requestFinished del conjunto de endpoints, no latencia de entrega
de mensajes o pulsación→pintado. La latencia de cursor es observación en el hook;
el render visual se comprobó aparte, sin cronómetro de píxel.

## Arquitectura antes y después

La API sigue siendo autoridad para persistencia. El cliente global instala
`authorizedRealtime.js`: los envíos de topics protegidos pasan por
`POST /realtime/broadcast`; recibir usa sockets privados con sufijo `@revision`.
GET `/realtime/revision` cada 10 s por canal comparte peticiones coincidentes en
vuelo. Presence sigue usando HTTP/SQL, heartbeat de 10 s y TTL de 35 s. No se
consiguió el patrón sin escrituras de Presence de Studio, ni se copiaron sus roles.

| Dominio | Antes | Después y contratos conservados |
|---|---|---|
| Relay compartido | Transacción con FOR SHARE durante HTTP; authorize usaba Prisma global y pedía otra conexión | authorize recibe la misma transacción; conserva bloqueo y orden de revocación, reduce dependencia del pool |
| Canvas | Estado React por cursor; timer trailing sin cancelación; cache podía quedar atrás al rejoin | Store efímero por sesión, pintura por RAF y expiración; cancela timers; reconcilia Board/objetos/links/versiones al rejoin |
| Canvas persistente | API, revisiones, cola optimista y deltas autorizados | Se conserva. El relay del navegador solo permite cursor; canvas.changed queda reservado al backend |
| Notes texto | Un HTTP por update local y reenvío de roster awareness | Y.mergeUpdates con ventana máxima de 80 ms y flush a 256 KiB; awareness solo propio, sin ecos de expiración; sigue siendo CRDT |
| Notes identidad | Awareness/pointer podían declarar identidad ajena | Relay normaliza identidad autenticada y nombre, omite avatar no verificado; Web nueva con API antigua usa nombre genérico |
| Notes recuperación | GET Y.Doc, full-state al conectar, CAS/deltas de save independientes | Se conserva. No se cambió persistencia/IME/HTML ni se introdujo handshake incompatible |
| Excalidraw | Cada request provocaba respuestas full; full tardío podía rebobinar versión local | ReconcileElements oficial, conserva archivos; jitter 150–499 ms y cancelación solo con cobertura de elementos/tombstones/archivos/capas/appState |
| Chat | Un consumidor podía eliminar canal ajeno; PG Changes, Broadcast y varios listeners invalidaban lo mismo | Suscripciones con refcount y dueño de sesión; wildcard de Broadcast registrado antes del join; invalidaciones agrupadas 40 ms, sin cancelar fetch en vuelo |
| Chat recuperación | Polling mensajes 30 s, visibilidad/focus, señales de llamadas | Conservados; rejoin de PG Changes reconcilia mensajes/lista. No se migró a Broadcast exclusivo |
| Chat typing | El helper permitía un envío por tecla | Heartbeat máximo uno/s por canal compartido, false inmediato, fuentes por consumidor y expiración existente de 4 s |

Topics conservados: `canvas:board:<id>`, `note:ydoc:<id>`, `note:canvas:<id>`,
`chat:presence:<id>`, `chat:conv:<id>`, `user:<id>:events` y company events.
`chat:messages:<id>` transporta Postgres Changes de chat_messages; no se le convierte
en canal empresarial de mensajes privados. Notes mantiene ydoc.update y
awareness.update; Excalidraw mantiene scene.delta/full/request/files/layers y pointer.

## Cuellos de botella y decisiones

- La saturación de Notes con diez usuarios fue perjudicial: documentos divergentes,
  158 errores broadcastToChannel en la base y timeouts de transacción. No era ahorro.
- Canvas tenía un problema de render aun manteniendo idéntico tráfico de cursores:
  con cinco peers, el consumidor del hook pasó de aproximadamente 1.916 renders a
  10; con diez, de 4.257 a 10 (incluye renders de Presence). No es un perfil completo
  de todos los componentes del Board.
- Chat tenía cascadas verificadas de invalidación y propiedad incorrecta de canales.
  Dos consumidores reales recibieron el mismo evento una vez cada uno; al cerrar
  uno, el otro siguió recibiendo. Un handler Broadcast añadido por un consumidor
  tardío también recibió su evento. No se eliminó el fallback de recuperación.
- Ya eran adecuados los CRDT, guardado incremental/CAS, protección de hidratación
  de escenas, revisiones de Canvas, typing efímero, deduplicación de notificaciones
  y separación de llamadas. Se mantuvieron.
- Se descartó sacar fetch del bloqueo sin un protocolo de revocación equivalente.
  Con 750 ms de demora HTTP inyectada, una rotación esperó 766–776 ms en las pruebas
  finales. La transacción sigue ocupando una conexión durante la red; es un límite,
  no un problema eliminado. No hay outbox ni entrega duradera de eventos efímeros.
- Se descartó suprimir el full-state Y.js o imponer state vectors nuevos sin una
  transición demostrada para lectores públicos/clientes abiertos. Se retuvo recovery.
- No se hizo una migración Chat Postgres Changes→Broadcast: no hay un A/B aislado
  suficiente para demostrar su ventaja conservando UPDATE/DELETE y recuperación.
  Este experimento queda pendiente; no se atribuye a esa migración ningún ahorro.
- No se cambió Presence SQL, revisión global, polling de llamadas ni LiveKit sin
  evidencia y transición. Varias pestañas de la misma cuenta siguen compartiendo la
  fila SQL de Presence: la salida de una puede ocultar la otra hasta su heartbeat.

## Seguridad, revocación y bloqueo de publicación

Las pruebas reales comprobaron denegación a otra empresa, anónimo en recurso privado,
lector intentando escribir, cuenta deshabilitada y colaborador Canvas revocado.
JWT expirado fue rechazado; refresh real de Auth volvió a permitir el relay. RLS
rechazó joins privados de otra empresa y anónimo. Al publicar Notes se permitió join
anónimo lector, sin escritura; despublicar rotó revisión y negó el topic nuevo.
Canvas dejó de aceptar canvas.changed falsificado. Awareness recibió nombre e id
normalizados y rechazó atribución a otra cuenta. El clientID Y.js no se convierte en
una atestación criptográfica de sesión: no se promete impedir toda interferencia
efímera entre editores maliciosos.

Los invitados usan JWT/token propios: solo su conversación, sin acceso a API interna
ni conversación de otro invitado. Cierre y expiración niegan nuevas solicitudes y
el join al topic vigente. Un socket ya unido puede seguir con state=joined tras
revocación; rotar topics no equivale a expulsarlo instantáneamente. La prueba final
registra por separado un intervalo de observación del socket público revocado;
no se establece un límite universal de desconexión ni se ignoran paquetes en vuelo.

**Falla confirmada: PRIVATE_NOTE_IMAGES_PUBLIC.** La API inicializa `runly-notes`
con public=true y `/notes/presign-image` devuelve getPublicUrl. Se subió una imagen
PNG a una nota con is_public=false usando el upload firmado autorizado y se descargó
el objeto sin Authorization ni apikey desde el gateway desechable: HTTP 200 y bytes
idénticos. Es un problema previo de archivos, independiente de RLS de Realtime.
El runner devuelve passed=false y código de salida 1 por este bloqueo.

No se cambió a ciegas el bucket existente a privado: rompería URLs persistidas en
HTML/Y.Doc/escenas, notas públicas y clientes abiertos. Para resolverlo antes del GO
se requiere una transición probada: lectura autorizada por nota/compartición y ruta
pública ligada a publicación vigente; resolver URLs legadas y archivos de borrador;
migrar referencias sin persistir URLs firmadas; cerrar lectura anónima del bucket
legado y probar reapertura, subpáginas, imágenes de Excalidraw, publicar/despublicar y
clientes antiguos. Este trabajo no está implementado y no se declara mitigado.

## Recuperación, persistencia y compatibilidad

- Parada/arranque del contenedor real Realtime, cambios durante el corte: Canvas
  inicial no recuperó el objeto en 24,7 s; código nuevo lo recuperó en 4,766 s.
  Notes convergió en 6,758 s. Incluye backoff/rejoin, no solo tiempo de red.
- Abortar HTTP de Broadcast de un editor, editar ambos, guardar concurrentemente
  por API y reconectar conservó ambos cambios. El full-state de recuperación sigue
  siendo necesario; no hay log duradero de Broadcast.
- Dos saves concurrentes de Y.Doc (128.000 caracteres y update independiente),
  merge y reapertura conservaron ambos. Guardado del lector fue rechazado.
- Dos objetos Canvas distintos se editaron simultáneamente. Dos actualizaciones
  con la misma revisión produjeron exactamente un éxito y un conflicto. Delete y
  restore conservaron identidad. El editor visual comprobó creación, undo y redo
  sin borrar el objeto del otro usuario.
- Snapshot Excalidraw tardío reproducido: versión local 9 bajaba a 1; después
  permanece en 9. Metadatos de capas siguen sin revisión propia; no se garantiza
  convergencia universal de capas con edición concurrente y snapshots antiguos.
- API antigua + Web nueva y API nueva + Web antigua pasaron el escenario Notes de
  edición, save concurrente y recuperación. No es la matriz completa de clientes
  antiguos (widget, flotante, publicación durante actualización y móvil).
- identityProtocol=1 se anuncia en GET de revisión. API primero conserva protección
  para Web antigua; Web nueva con API antigua muestra Colaborador en awareness.
  Roster legado con identidades mezcladas puede rechazarse; updates propios nuevos
  continúan. No cambia el formato persistido ni hay privilegios SQL nuevos.
- Build API completo desde fuente archivada + archivos propios, lockfile congelado,
  instalación nueva/migraciones/seed y pruebas de seguridad/recovery ejecutadas.
  Build Web completo con configuración aislada también pasó. No se construyeron
  instaladores nativos ni se publicaron imágenes.
- Sin SQL nuevo, estas optimizaciones no requieren intervención manual de dueño de
  realtime. Pasaron los cinco tests Installer local/external; no se ejecutó un
  upgrade integral de una instalación existente ni se promete que resuelva Storage.

## Pruebas finales y cobertura pendiente

Suite conjunta Canvas/Notes/Chat y nuevo coalescer: **1.127 tests, 1.126 pass,
0 fail, 1 skip**. Infraestructura compartida (relay/acceso/wrapper): **11 pass**.
Regresión Studio: **84 tests, 83 pass, 1 skip**. Installer:
**5 pass, 0 fail**. ESLint sobre archivos propios pasó. React Doctor: 83/100,
una advertencia en DesignUnavailable.jsx de Studio de la sesión concurrente,
ningún hallazgo nuevo atribuido a estos cambios.

`pnpm check:privacy` completo falla con 67 hallazgos previos en archivos existentes
(fixtures SSRF con direcciones reservadas, licencia de fuente y documentos históricos,
entre otros). No se ocultaron ni modificaron cambios ajenos para hacer pasar el check.
La inspección de los archivos propios usa el mismo inspectFile y debe quedar sin
hallazgos antes del commit documental. Los artefactos completos son privados e
ignorados; no se copian tokens, logs de producción, direcciones ni rutas personales.

La prueba UI de producción pasó cuatro comprobaciones: cursor remoto pintado en
el Board completo; creación simultánea y undo/redo sin borrar el objeto del peer;
edición Tiptap compartida con autosave y reapertura; envío desde el composer Chat
real y recepción visible en el peer. Sin pageerror ni errores de broadcaster.
Sus capturas están en realtime-ui de la pila indicada por results.json. Los intentos
anteriores fallaron por localizadores del harness (apertura de nota y carrera de
reload con tarjeta oculta); se conservaron y no se cuentan como corridas satisfactorias.

No se ejecutaron veinte usuarios: la instalación observada permite 2.000 eventos/s,
2.000.000 bytes/s, 1.000 eventos Presence/s, 200 conexiones y 100 canales/cliente.
Fanout Notes de veinte escritores podría exceder el límite aun sin CPU saturada.
No se elevaron defaults para conseguir una cifra favorable.

Pendiente de validación integral: IME real/móvil, pegar/deshacer durante composición,
cierre abrupto del navegador con save en vuelo, PostgreSQL temporalmente caído,
PWA suspendida/push y LiveKit real, menciones/sonidos/notificaciones del sistema,
adjuntos Chat y moderación en GUI, widget antiguo y actualización con clientes
abiertos, edición concurrente de capas/archivos Excalidraw y sesiones prolongadas
de Chat/Canvas. Tests unitarios existentes cubren parte de estos contratos, pero no
sustituyen esas pruebas reales. El soak ejecutado fue Notes en reposo, no carga
prolongada de todos los módulos. **No se afirma completar toda la matriz solicitada.**

## CPU, HTTP, SQL, WS, memoria y latencia medidos

### Canvas

CPU en segundos por ventana. Cada celda: antes → después.

| Usuarios | API | PostgreSQL | Realtime | CPU total |
|---|---:|---:|---:|---:|
| 1 | 0.57 → 0.42 | 0.70 → 0.50 | 0.35 → 0.28 | 1.62 → 1.20 |
| 5 | 25.26 → 14.10 | 15.76 → 8.36 | 12.86 → 7.13 | 53.89 → 29.59 |
| 10 | 33.65 → 25.94 | 25.22 → 19.16 | 22.66 → 17.55 | 81.53 → 62.65 |

| Usuarios | HTTP total | Broadcast POST | GET conversaciones | GET mensajes | POST mensajes | Revisión GET | Presence POST |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | 12 → 12 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 6 → 6 | 6 → 6 |
| 5 | 2410 → 2410 | 2350 → 2350 | 0 → 0 | 0 → 0 | 0 → 0 | 30 → 30 | 30 → 30 |
| 10 | 4820 → 4820 | 4700 → 4700 | 0 → 0 | 0 → 0 | 0 → 0 | 60 → 60 | 60 → 60 |

Llamadas pg_stat_statements por clasificación (definiciones y limitaciones arriba).

| Usuarios | Lecturas | Escrituras | Autorización | Otras |
|---|---:|---:|---:|---:|
| 1 | 66 → 66 | 6 → 6 | 18 → 18 | 644 → 642 |
| 5 | 21288 → 21381 | 30 → 30 | 11954 → 11954 | 21799 → 21795 |
| 10 | 42794 → 42770 | 63 → 60 | 24256 → 24220 | 47556 → 47555 |

WS entrante/saliente agregado; frames/s usa duración real. HTTP transfer incluye cuerpos y overhead que expone CDP.

| Usuarios | Frames WS totales | Frames/s | Bytes WS totales | Bytes HTTP transfer | HTTP p50 ms | HTTP p95 ms |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 4 → 4 | 0.07 → 0.07 | 194 → 194 | 18474 → 18474 | 16.45 → 13.59 | 40.17 → 17.21 |
| 5 | 11772 → 11770 | 194.51 → 194.47 | 3933817 → 3933720 | 4827930 → 4827930 | 63.17 → 29.38 | 153.62 → 39.07 |
| 10 | 47054 → 47048 | 777.56 → 777.29 | 15733619 → 15733328 | 9720920 → 9720920 | 77.62 → 56.30 | 119.57 → 81.48 |

Memoria al final de cada ventana, MiB. Heap es media por pestaña; no RSS de Node.

| Usuarios | Cgroup API | Cgroup PG | Cgroup Realtime | Heap navegador | Canales/pestaña |
|---|---:|---:|---:|---:|---:|
| 1 | 214.34 → 196.41 | 193.60 → 203.14 | 194.38 → 177.07 | 5.97 → 6.66 | 1 → 1 |
| 5 | 316.27 → 270.30 | 247.47 → 252.39 | 200.09 → 182.18 | 6.71 → 8.30 | 1 → 1 |
| 10 | 537.14 → 426.48 | 266.66 → 290.89 | 205.25 → 186.10 | 7.84 → 7.34 | 1 → 1 |

Cursor observado p50/p95: 5 usuarios 48/103 → 28/37 ms; 10 usuarios 73/115 → 54/80 ms. HTTP y autorizaciones prácticamente iguales: el ahorro procede del pool/render y menor congestión, no de una migración de transporte. Las escrituras Presence continúan en 6/30/60 por ventana.

### Notes Y.js

CPU en segundos por ventana. Cada celda: antes → después.

| Usuarios | API | PostgreSQL | Realtime | CPU total |
|---|---:|---:|---:|---:|
| 1 | 10.68 → 5.78 | 9.22 → 3.47 | 4.95 → 1.98 | 24.85 → 11.24 |
| 5 | 50.75 → 16.75 | 55.39 → 15.51 | 34.30 → 9.55 | 140.44 → 41.81 |
| 10 | 29.97 → 26.64 | 32.62 → 30.74 | 23.42 → 19.80 | 86.01 → 77.18 |

| Usuarios | HTTP total | Broadcast POST | GET conversaciones | GET mensajes | POST mensajes | Revisión GET | Presence POST |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1210 → 609 | 1204 → 603 | 0 → 0 | 0 → 0 | 0 → 0 | 6 → 6 | 0 → 0 |
| 5 | 6042 → 3047 | 6012 → 3017 | 0 → 0 | 0 → 0 | 0 → 0 | 30 → 30 | 0 → 0 |
| 10 | 3344 → 6095 | 3326 → 6035 | 0 → 0 | 0 → 0 | 0 → 0 | 18 → 60 | 0 → 0 |

Llamadas pg_stat_statements por clasificación (definiciones y limitaciones arriba).

| Usuarios | Lecturas | Escrituras | Autorización | Otras |
|---|---:|---:|---:|---:|
| 1 | 10860 → 5446 | 0 → 0 | 6026 → 3021 | 25497 → 6066 |
| 5 | 43653 → 27175 | 0 → 0 | 30105 → 15125 | 71236 → 28939 |
| 10 | 11280 → 54316 | 0 → 0 | 16556 → 30245 | 58863 → 62209 |

WS entrante/saliente agregado; frames/s usa duración real. HTTP transfer incluye cuerpos y overhead que expone CDP.

| Usuarios | Frames WS totales | Frames/s | Bytes WS totales | Bytes HTTP transfer | HTTP p50 ms | HTTP p95 ms |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 1208 → 607 | 19.96 → 10.03 | 283806 → 149865 | 2357126 → 1190962 | 24.84 → 17.77 | 32.89 → 28.32 |
| 5 | 30080 → 15105 | 497.02 → 249.60 | 7076215 → 3745975 | 11780901 → 5964712 | 124.42 → 29.90 | 1036.16 → 41.95 |
| 10 | 32930 → 60390 | 543.96 → 997.84 | 7697000 → 14985090 | 6517588 → 11937404 | 25354.10 → 51.55 | 42695.84 → 72.04 |

Memoria al final de cada ventana, MiB. Heap es media por pestaña; no RSS de Node.

| Usuarios | Cgroup API | Cgroup PG | Cgroup Realtime | Heap navegador | Canales/pestaña |
|---|---:|---:|---:|---:|---:|
| 1 | 654.81 → 248.20 | 198.66 → 209.04 | 208.89 → 182.01 | 6.76 → 7.68 | 1 → 1 |
| 5 | 657.43 → 278.46 | 250.56 → 253.59 | 209.87 → 185.68 | 8.51 → 8.60 | 1 → 1 |
| 10 | 658.94 → 591.16 | 251.72 → 290.84 | 209.07 → 190.56 | 14.37 → 8.82 | 1 → 1 |

**Base de diez usuarios fallida:** los 3.326 POST completados no representan toda la demanda; hubo divergencia y errores del pool. Después hubo 6.035 POST, convergencia y ningún error de broadcaster en esta corrida sana. No comparar el menor tráfico/SQL inicial como una ventaja. Los casos 1/5 sí convergieron antes y después. El batch añade hasta 80 ms antes del envío; no se midió pulsación→pintado p95 de Tiptap.

### Chat hooks

CPU en segundos por ventana. Cada celda: antes → después.

| Usuarios | API | PostgreSQL | Realtime | CPU total |
|---|---:|---:|---:|---:|
| 1 | 5.40 → 4.38 | 7.01 → 7.79 | 1.62 → 2.10 | 14.03 → 14.28 |
| 5 | 39.05 → 25.09 | 83.34 → 61.72 | 7.16 → 15.31 | 129.55 → 102.13 |
| 10 | 48.84 → 43.81 | 136.58 → 136.16 | 18.93 → 28.32 | 204.35 → 208.30 |

| Usuarios | HTTP total | Broadcast POST | GET conversaciones | GET mensajes | POST mensajes | Revisión GET | Presence POST |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | 391 → 213 | 0 → 0 | 215 → 93 | 104 → 48 | 59 → 60 | 6 → 6 | 7 → 6 |
| 5 | 9368 → 2263 | 0 → 0 | 6013 → 1027 | 2995 → 876 | 300 → 300 | 30 → 30 | 30 → 30 |
| 10 | 11586 → 6490 | 0 → 0 | 7499 → 3078 | 3675 → 2698 | 342 → 594 | 40 → 60 | 30 → 60 |

Llamadas pg_stat_statements por clasificación (definiciones y limitaciones arriba).

| Usuarios | Lecturas | Escrituras | Autorización | Otras |
|---|---:|---:|---:|---:|
| 1 | 4580 → 4120 | 420 → 726 | 2956 → 5109 | 4703 → 9003 |
| 5 | 81293 → 29812 | 2135 → 3635 | 27380 → 27985 | 22360 → 44604 |
| 10 | 67255 → 71865 | 4179 → 7249 | 48185 → 60008 | 48704 → 97654 |

WS entrante/saliente agregado; frames/s usa duración real. HTTP transfer incluye cuerpos y overhead que expone CDP.

| Usuarios | Frames WS totales | Frames/s | Bytes WS totales | Bytes HTTP transfer | HTTP p50 ms | HTTP p95 ms |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 134 → 130 | 2.21 → 2.15 | 131189 → 129711 | 3395397 → 1699084 | 22.75 → 16.84 | 70.75 → 47.40 |
| 5 | 4220 → 4220 | 69.73 → 69.74 | 3877095 → 3877110 | 111124087 → 29772236 | 159.94 → 54.70 | 420.66 → 280.42 |
| 10 | 9916 → 17180 | 163.83 → 283.91 | 8989909 → 15572981 | 135150151 → 90277216 | 30478.35 → 92.22 | 38228.95 → 290.79 |

Memoria al final de cada ventana, MiB. Heap es media por pestaña; no RSS de Node.

| Usuarios | Cgroup API | Cgroup PG | Cgroup Realtime | Heap navegador | Canales/pestaña |
|---|---:|---:|---:|---:|---:|
| 1 | 236.39 → 237.23 | 271.89 → 225.50 | 179.30 → 185.92 | 11.27 → 10.57 | 5 → 5 |
| 5 | 433.18 → 297.55 | 386.55 → 283.54 | 184.44 → 159.65 | 10.57 → 10.16 | 5 → 5 |
| 10 | 691.55 → 621.26 | 291.76 → 290.56 | 186.38 → 166.80 | 15.83 → 13.07 | 5 → 5 |

Con cinco usuarios, las dos lecturas bajaron de 9.008 a 1.903 (78,9%). CPU total 129,55 → 102,13 s (21,2% menos), pero Realtime subió 7,16 → 15,31 s (113,8% más). Con uno, PG y Realtime aumentaron; no hay reducción universal. Con diez, la base saturó y completó 342 POST dentro de ventana frente a 594 después (600 finalmente asentados); SQL/escrituras/WS mayores después acompañan más trabajo completado. La caché final contiene los últimos 40 IDs autoritativos, únicos. No prueba cero eventos perdidos fuera del escenario. El motivo exacto del aumento de CPU de Realtime no se aisló; no atribuirlo causalmente a una sola mejora.

### Excalidraw: entrada de colaboradores y snapshot tardío

100 elementos, incorporación de 2/5/10 participantes y ventana posterior de 5 s en reposo; estos conteos son de join, no por minuto ni CPU bajo carga sostenida.

| Usuarios | scene.request | scene.full | Bytes HTTP cuerpos de join |
|---|---:|---:|---:|
| 2 | 2 → 2 | 3 → 2 | 123888 → 83047 |
| 5 | 5 → 5 | 15 → 9 | 617865 → 372672 |
| 10 | 10 → 10 | 55 → 11 | 2264961 → 464198 |

Con diez, 80% menos escenas completas en esta corrida; no se promete una única respuesta por request. La prueba de versión protege 9 frente a snapshot 1. No sustituye prueba de escenas grandes con imágenes y capas editadas simultáneamente.

### Chat typing: ráfaga separada

Cinco usuarios, 20 intentos/s por usuario, ventana 20 s (20,52 s real). Broadcast HTTP 1.843 → 100 (94,6% menos); revision/Presence 10/10 en ambos. CPU API 15,84 → 1,39 s, PG 14,05 → 1,14 s, Realtime 8,38 → 0,48 s. HTTP p50/p95 622,57/1.451,73 → 36,19/61,07 ms; no es tiempo de aparición del indicador. WS recibidos 9.247 → 505. Se probó por unidad el false inmediato y la independencia de consumidores. Con typing ya limitado a 1 Hz se conserva la frecuencia, no se reclama el ahorro de la ráfaga.

### Soak y RSS

Notes: dos usuarios en reposo durante 600,525 s, convergencia, un canal por pestaña al principio y al final, sin errores de navegador/HTTP/broadcaster. 120 GET revisión y 72 awareness.update; CPU API/PG/Realtime 2,34/4,70/3,19 s. Heap medio 6,62 → 6,54 MiB; cgroup API 290,7 → 179,4 MiB, PG 148,7 → 91,7 MiB, Realtime 172,7 → 106,3 MiB. No se observó crecimiento en esos dos puntos, pero no es un análisis de fuga ni un soak activo de todos los módulos.

RSS Node en prueba corta final Canvas/Notes/Chat de dos usuarios: alrededor de 257,8/261,1/263,9 MiB después de cada ventana. Heap Node desconocido. No se publican equivalencias entre RSS y memoria cgroup ni una reducción RSS antes/después no medida.

## Reproducción local y catálogo de evidencia

Requiere Docker local con las imágenes self-hosted usadas por el Installer,
dependencias pnpm y Chrome de Playwright. El build usa red para obtener dependencias
si no están cacheadas; los escenarios no usan servicios remotos. No cargar `.env`
de producción. Los builders archivan fuente en directorios ignorados, sin cambiar
de rama ni alterar el checkout de main. Las pilas se cierran en finally; sus logs,
credenciales efímeras, métricas y capturas quedan ignorados y no deben publicarse.

```powershell
node scripts/build-realtime-2-local.mjs --baseline
$image = node scripts/build-realtime-2-local.mjs --full
node scripts/build-realtime-2-web.mjs

node scripts/measure-realtime-2.mjs --phase=before --source-ref=c5498bd3873c2f9067643fc8b018dbcc0c44b828 --api-image=runly-realtime2:baseline-api --modules=canvas,notes,chat-ui --users=1,5,10 --seconds=60 --activity=active
node scripts/measure-realtime-2.mjs --phase=after --api-image=$image --modules=canvas,notes,chat-ui --users=1,5,10 --seconds=60 --activity=active
node scripts/measure-realtime-2.mjs --phase=after --api-image=$image --modules=notes-canvas --users=2,5,10 --seconds=5 --activity=idle --scene-regression
node scripts/measure-realtime-2.mjs --phase=after --api-image=$image --modules=chat --users=5 --seconds=20 --activity=active --typing-ms=50 --ownership
node scripts/measure-realtime-2.mjs --phase=after --api-image=$image --modules=canvas,notes,chat --users=2 --seconds=5 --activity=idle --ws-recovery --strict --recovery
node scripts/measure-realtime-2.mjs --phase=after --api-image=$image --modules=notes --users=2 --seconds=600 --activity=idle --recovery
node scripts/measure-realtime-2.mjs --phase=after --api-image=$image --modules=notes --users=2 --seconds=5 --activity=idle --ui
node scripts/measure-realtime-2.mjs --phase=after --api-image=$image --modules=chat --users=2 --seconds=5 --activity=idle --security
```

La última orden debe fallar con PRIVATE_NOTE_IMAGES_PUBLIC mientras persista el
hallazgo; no quitar la comprobación para obtener verde. Para comparar Excalidraw y
typing, repetir sus órdenes con phase=before, source-ref inicial y baseline-api.
Compatibilidad cruzada: baseline-api con fuente Web actual; imagen API nueva con
source-ref inicial. Ejecutar Notes, dos usuarios y --recovery en ambos casos.
`--strict` activa StrictMode en el harness Canvas/Chat. No sustituye todas las
transiciones de sesión/empresa en el producto.

Los artefactos están bajo `.artifacts/realtime-2/<corrida>/` (no versionados).
results.json contiene duración, imagen, SHA, sourceMode y hash del bundle cuando
corresponde. sourceMode=working tree identifica cambios todavía sin commit durante
el experimento; no implica que solo se ejecutó el SHA de HEAD. Las tablas anteriores
se extrajeron de estas corridas; hay un único ensayo por celda, sin intervalo de
confianza. Las pruebas finales usaron API construida con el Dockerfile completo,
no solamente el overlay rápido usado en iteración.

| Evidencia | Corrida |
|---|---|
| Canvas/Notes/typing, base 60 s | before-1793142812278 |
| Canvas posterior 60 s | after-1793143677393 |
| Notes posterior 60 s | after-1793144534798 |
| Chat mensajes base 1/5 | before-1793144266289 |
| Chat mensajes base 10 saturado | before-1793145480020 |
| Chat mensajes posterior 1/5/10 | after-1793145750108 |
| Typing ráfaga antes/después | before-1793145820244 / after-1793146085731 |
| Escenas antes/después | before-1793145139957 / after-1793145270107 |
| Soak Notes 10 minutos | after-1793145028123 |
| Corte WS de la base | before-1793146964756 |
| Corte WS/recovery/StrictMode con API completa | after-1793147384574 |
| API nueva + Web antigua | after-1793147237110 |
| API antigua + Web nueva | before-1793147237229 |
| Seguridad final con Storage y recepción posrevocación | after-1793148407231 |
| UI completa satisfactoria | after-1793148582204 |

En seguridad final el socket público anterior siguió unido durante el segundo
observado y recibió cero updates posrevocación; el owner sí pudo enviar al topic
vigente. El socket de invitado cerrado también conservó state=joined en la
observación. No se midió cuánto tarda en desaparecer cada socket antiguo.

Descartadas como evidencia de éxito: Chat base con roles de fixture incompletos
(403), escena con IDs regenerados por el fixture, expectativa de longitud que no
incluía texto anterior, colisión de posición de capa del fixture y localizadores UI
anteriores. Se corrigió la preparación; no se cambió producción para satisfacer
esas expectativas. La divergencia Notes y saturación Chat de la base sí son
resultados del código inicial, se conservan explícitamente como fallas.

## Commits y dictamen

| Commit | Cambio |
|---|---|
| 3a323d7e | Spec, plan, runner y línea base |
| 1ac64025 | Reutilización de autorización bloqueada y cursores Canvas |
| e64ddb49 | Batch CRDT e identidad de awareness |
| 977abee0 | Reconciliación de escenas y supresión de snapshots cubiertos |
| 22dd92b8 | Propiedad compartida de canales Chat y coalescing de refetch |
| 03345d0c | Recuperación de cache Canvas y limpieza de RAF |
| d2cb2ec5 | Harness ampliado: UI, seguridad, recovery, builds y Storage |

La inspección final con inspectFile revisó 49 archivos propios y encontró cero
hallazgos. El check global sigue fallando con los 67 previos; no se declara verde.

**NO GO.** Las mejoras de rendimiento quedan disponibles en main y sin migración
SQL. La autorización de Realtime no resuelve los archivos públicos de notas
privadas. Resolver esa transición, verificar los escenarios integrales pendientes
y repetir la matriz de seguridad son requisitos antes de considerar una release.
No se realizó publicación, despliegue ni modificación de instalaciones existentes.

