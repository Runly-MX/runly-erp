# Notificaciones Realtime 3.0: validacion local

Fecha: 2026-10-28. Solo local, Supabase y Storage desechables, sin despliegue ni
publicacion. SHA inicial: `9a2286893f46`. SHA final probado: `1ef3c3ca1ef1`
(imagen de API de la remedicion final `runly-notifications:api-1ef3c3ca1ef1`; la
primera medicion "despues" uso `5b9e1722fb83`). Web compilada desde el arbol de
cada commit. Diseno y plan: `docs/superpowers/specs|plans/2026-10-27-notifications-*`.

## Dictamen

**GO local para el modulo de Notificaciones, con un costo cuantificado en rafagas.**
No es un GO global de Runly: el cierre de seguridad de Notes sigue siendo
"GO condicionado" (ver `NOTES_PRIVATE_STORAGE_SECURITY_CLOSURE.md`).

| Objetivo | Resultado medido |
|---|---|
| Aparicion visible en la campana | p95 de 27-28 s a 0,07-0,31 s (1, 5 y 10 usuarios) |
| HTTP de notificaciones en reposo | de 2,6 / 13 / 26 por minuto (1/5/10 usuarios) a 0 |
| SQL en reposo | -49 % (1 usuario), -25 % (5), -14 % (10) |
| CPU PostgreSQL en reposo | de 1,0 / 1,0 / 1,4 s a 0,4 / 0,6 / 0,9 s por ventana de 45 s |
| Avisos perdidos | 0 en todos los escenarios |
| Toasts duplicados | 0 (9 avisos = 9 toasts por pagina; dos pestanas = 1 toast cada una) |
| Seguridad (12 comprobaciones x 3 corridas) | 0 fallos |
| Rafaga de 100 avisos | cuesta mas CPU (ver "Costo") |

## Arquitectura anterior

- La campana lanzaba dos consultas `list` cada 30 s por pestana (lista de 15 filas
  y otra de `limit 1` solo para contar), y cada `list` ejecutaba 3 `COUNT`.
- `notification.new` solo se emitia desde la instancia de `NotificationService`
  creada en `index.js` (chat, comparticion de notas). Calendario, proyectos,
  ledger, inventario, crecimiento, formularios, automatizaciones y
  `POST /notifications/publish` crean el servicio sin broadcaster: esos avisos
  solo llegaban por el polling de 30 s o por push.
- Un canal `postgres_changes` sobre `notification` invalidaba lo mismo, pero la
  tabla no esta en la publicacion `supabase_realtime` en ninguna migracion y Realtime
  responde "Unable to subscribe to changes": nunca entrego nada.
- La deduplicacion entre Broadcast y Service Worker usaba titulo mas cuerpo.

## Arquitectura nueva

- Persistencia (API y PostgreSQL) es la fuente de verdad. El broadcast es una pista.
- `GET /notifications/summary`: una consulta agrupada devuelve contadores y el id
  del ultimo no leido. `list` usa la misma consulta (antes 3 `COUNT`) y acepta
  `counts=0`.
- Un broadcaster diferido compartido hace que todo productor emita `notification.new`
  tras confirmar la transaccion. El payload lleva `notificationId` y `count` de cada
  destinatario, y el productor ya no espera el envio.
- La campana pide solo el resumen (latido de 120 s con la pestana visible), carga
  filas solo con el panel abierto, suma 1 de forma idempotente al llegar el evento y
  siempre confirma con el servidor (primer refresco inmediato y uno final por rafaga,
  maximo uno por segundo). Marcar leido es optimista, con rollback y reconciliacion.
- Reconciliacion por HTTP al volver a unirse al canal del usuario, al volver a
  visible y al recuperar la red.
- Identidad de deduplicacion `n:<notificationId>:<count>` compartida por Broadcast,
  Service Worker y push; FCM lleva `notificationId`.
- Se retira la suscripcion `postgres_changes` inoperante.
- Worker de entregas: los pases ociosos ya no consultan la URL base y el rescate de
  filas en `sending` se limita a uno por minuto y canal. La reclamacion atomica, los
  reintentos y la ausencia de transacciones largas ya eran correctos y no se tocaron.
- Barrera `FOR SHARE` del broadcaster: sin cambios. Es la garantia de orden y
  revocacion y no se demostro una alternativa equivalente.

## Metodologia

Runner `scripts/measure-notifications.mjs`: pila Supabase desechable, imagen de API
construida desde un commit exacto (`scripts/build-local-api-image.mjs`), web real
compilada, Chrome con Playwright, 1/5/10 usuarios, ventana de 45 s. Mide peticiones
por ruta, SQL (`pg_stat_statements`), frames WebSocket (CDP), CPU por cgroup de API,
PostgreSQL y Realtime, latencia visible con un observador en pagina y toasts. Las tres
corridas: `before` (`9a2286893f46`), `after` (`5b9e1722fb83`) y `after2`
(`1ef3c3ca1ef1`, final). Las tablas usan `before` y `after2`.

## Resultados (before / after2)

HTTP y SQL son por minuto; CPU son segundos acumulados en la ventana del escenario.

| Usuarios | Escenario | HTTP notif. | SQL | CPU API | CPU DB | CPU Realtime | Frames WS | Latencia p50 / p95 (ms) |
|---|---|---|---|---|---|---|---|---|
| 1 | Reposo, campana cerrada | 2,6 / 0 | 338 / 172 | 0,2 / 0,1 | 1,0 / 0,4 | 0,4 / 0,2 | 5 / 2 | - |
| 1 | 9 avisos en 45 s | 3,7 / 7,4 | 448 / 409 | 0,3 / 0,4 | 1,2 / 0,6 | 0,5 / 0,3 | 6 / 15 | 16579 / 26652 -> 27 / 67 |
| 1 | Dos pestanas, 1 aviso | 2,2 / 2,2 | 670 / 1458 | 0,6 / 0,2 | 1,1 / 0,3 | 0,4 / 0,1 | 4 / 3 | 28431 -> 83 |
| 1 | Caida de Realtime | 4,1 / 6,3 | 649 / 3475 | 0,2 / 0,4 | 0,7 / 0,2 | n/v | 9 / 6 | 18868 -> 266 |
| 5 | Reposo, campana cerrada | 13,0 / 0 | 1136 / 850 | 0,8 / 0,7 | 1,0 / 0,6 | 0,4 / 0,2 | 16 / 12 | - |
| 5 | 9 avisos en 45 s | 18,4 / 36,8 | 1426 / 1693 | 1,1 / 1,8 | 1,9 / 1,2 | 0,5 / 0,4 | 30 / 75 | 16787 / 26867 -> 52 / 170 |
| 5 | Caida de Realtime | 21,0 / 31,5 | 2013 / 14382 | 0,7 / 0,2 | 1,0 / 0,4 | n/v | 45 / 30 | 17339 / 18010 -> 173 / 185 |
| 10 | Reposo, campana cerrada | 26,0 / 0 | 2397 / 2050 | 1,1 / 1,4 | 1,4 / 0,9 | 0,3 / 0,2 | 34 / 34 | - |
| 10 | 9 avisos en 45 s | 42,4 / 73,4 | 3089 / 3565 | 2,4 / 2,3 | 3,1 / 2,2 | 0,5 / 0,6 | 60 / 150 | 16104 / 28069 -> 83 / 305 |
| 10 | Dos pestanas, 1 aviso | 41,0 / 21,9 | 2989 / 11213 | 1,9 / 0,9 | 2,1 / 0,8 | 0,4 / 0,2 | 40 / 30 | 28434 -> 287 |
| 10 | Caida de Realtime | 41,7 / 61,5 | 4224 / 28341 | 1,0 / 0,4 | 2,0 / 0,8 | n/v | 90 / 60 | 15926 / 17651 -> 13 / 60 |
| 10 | Rafaga de 100 avisos | 41,2 / 575,5 | 14476 / 88857 | 3,7 / 9,3 | 6,7 / 16,6 | 0,3 / 4,2 | 20 / 1000 | 25775 / 27528 -> 10396 / 10608 |

`n/v`: no valido (el contenedor de Realtime se reinicia en ese escenario, su delta de
CPU no es comparable). Tabla completa por usuarios y escenario:
`node scripts/summarize-notifications.mjs <antes> <despues>`.

Latencia p95 final de aparicion de una notificacion en la campana: **67 ms (1 usuario),
170 ms (5) y 305 ms (10)** en el escenario de nueve avisos; la rafaga de 100 avisos a
10 usuarios (1.000 entregas) tarda 10,6 s en estar completa en pantalla (antes 27,5 s,
limitada por el polling).

Recuperacion tras perder Realtime: los 10 usuarios ven los 3 avisos emitidos durante la
caida en p50 13 ms / p95 60 ms medidos desde que el servicio vuelve (la reconexion del
cliente reconcilia con HTTP). Antes: 16 / 18 s por el polling.

## Costo

El tiempo real tiene un precio por evento:

- **Rafagas:** cada notificacion se entrega por Broadcast privado, que Realtime persiste
  en `realtime.messages` (unas 2 inserciones y 2 `SAVEPOINT` por entrega), y cada
  destinatario autoriza su entrega. Con 100 avisos a 10 usuarios la CPU de PostgreSQL pasa
  de 6,7 a 16,6 s, la de API de 3,7 a 9,3 s y la de Realtime de 0,3 a 4,2 s, y las
  peticiones de refresco de la campana suben a un maximo de 1 por segundo y pestana.
  Parte de esa diferencia es que el trabajo ocurre en 15 s en vez de 29 s. Retirar la
  espera del productor (`bead1f8e`) la redujo respecto de la primera medicion
  (PostgreSQL 20,2 s, API 11,8 s, Realtime 5,4 s). No se implemento agrupar eventos por
  destinatario en el servidor; es la siguiente optimizacion si las rafagas importan.
- **Con eventos espaciados:** cada evento provoca un refresco del resumen por pestana
  (nueve avisos: 73 contra 42 peticiones de notificaciones por minuto con 10 usuarios).
  El balance neto global es casi neutro (HTTP total +7 %, SQL +15 % en ese escenario con 10 usuarios) a
  cambio de latencia 100 a 300 veces menor.
- **En reposo y con la campana abierta hay ahorro neto.** El total de HTTP baja
  solo 10-20 % porque el resto de peticiones de fondo (presencia, revision, chat,
  membresias) no pertenece a este modulo.

En la caida de Realtime las consultas SQL por minuto suben mucho (28 mil contra 4 mil con
10 usuarios) porque la ventana medida es mucho mas corta (el cliente recupera en
segundos) y concentra la reconexion de los canales; no es un costo sostenido.

## Duplicados y deduplicacion

0 duplicados medidos: nueve avisos distintos producen 9 toasts en cada una de las 10
paginas; con dos pestanas del mismo usuario cada pestana muestra 1 toast por aviso.
Pruebas unitarias: Broadcast y push de la misma fila colapsan aunque cambie el texto;
dos avisos con texto igual no se mezclan; los mensajes sucesivos de un chat plegados en
una fila se distinguen por `count`.

## Seguridad (12 comprobaciones por corrida, 3 corridas, 0 fallos)

Resumen sin sesion denegado; usuario de otra empresa denegado y sin ver avisos de la
empresa A; publicar a un destinatario ajeno rechazado; usuario de otra empresa y cliente
anonimo no reciben nada del canal privado ajeno; el miembro ve su propio contador;
miembro revocado denegado de inmediato y sin nuevas notificaciones; token renovado
funciona; `notification` no esta en la publicacion `supabase_realtime`; `summary`
coincide con `list`. Ningun dato de un cliente (`count`, `notificationId`) se usa como
autoridad: el servidor emite ambos y el contador siempre se confirma con la API. No se
amplio el acceso a `notification` ni a `realtime.messages`.

## Regresiones

4.323 pruebas Node (API, SDK/paquetes, installer, utilidades de escritorio y worker):
4.310 pasan, 7 fallan. Las 7 fallas reproducen identicas con las versiones previas de
todos los archivos que modifique y son heredadas: `contacts-proposal-module` (2),
`call-transcript-analysis-service` (1), `public-website-capture-config` (1),
`module-runtime-routes` (2) y `module-runtime-catalog` (1). Notificaciones: 57 pruebas
de servicio/worker/publicador/digest, 11 de dedupe y sincronizacion de contadores.
Lint y build web: ver el cierre al final de este documento.

## No medido o no ejecutado

- CPU del Worker de entregas y su memoria: el runner no levanta el worker; solo hay
  pruebas unitarias (reclamacion, reintentos, filas en `sending`, simulacros de correo,
  Web Push y FCM). La memoria de los procesos no se midio.
- PWA movil suspendida y recuperada, Web Push y FCM reales, notificaciones nativas de
  Tauri/Android, DND y horarios silenciosos de extremo a extremo, cambio de empresa
  activa en vivo, Chat activo con mensajes frecuentes: no se midieron en navegador;
  cubiertos solo por pruebas unitarias y contratos.
- 20 usuarios y 1.000 notificaciones distribuidas: no ejecutados.
- E2E Playwright de la bandeja (`NotificationsInboxScreen`): no se ejecuto.
- Instalaciones antiguas del cliente: un cliente Web anterior sigue funcionando con
  el polling (el endpoint `list` conserva su contrato) pero no recibe `notificationId`
  en la deduplicacion.

## Compatibilidad e Installer

Sin migracion SQL nueva ni cambio de esquema. `list` conserva su respuesta; `summary` es
un endpoint nuevo; `counts=0` es opcional. El Installer no cambia por este trabajo. Los
cambios de Installer de esta sesion pertenecen al cierre de Notes.

## Riesgos y limites de medicion

Una sola corrida por configuracion, en una maquina de desarrollo con Docker; los CPU
son pequenos y ruidosos. Las comparaciones de CPU absolutas no se extrapolan a produccion.
El latido de 120 s acota cuanto puede tardar en verse un aviso cuyo broadcast se pierda
sin reconexion; en las pruebas no se perdio ninguno. El pico de CPU de Realtime en
rafagas es el principal costo a vigilar.

## Commits (desde `9a2286893f46`)

`c323e9c5` runner · `3cbb2e42` summary, identidad por destinatario y broadcast para
todo productor · `dd97e6e4` worker ocioso · `df128adf` campana, reconciliacion y retiro de
`postgres_changes` · `5b9e1722` seguridad en el runner · `3f2030f0` tabla antes/despues ·
`bead1f8e` productor sin espera · mas los commits del Installer de Notes (informados en
su documento).

## Reproduccion

```sh
node scripts/build-local-api-image.mjs
node scripts/measure-notifications.mjs --api-image=runly-notifications:api-<sha> --label=run --users=1,5,10
node scripts/summarize-notifications.mjs <carpeta-antes> <carpeta-despues>
```

En Git Bash/Windows anteponer `/c/Windows/System32` al PATH para que `tar` sea el de Windows.
