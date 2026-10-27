# Runly Realtime 2 — diseño y auditoría local

Fecha: 2026-10-27. Base: `c5498bd3873c2f9067643fc8b018dbcc0c44b828`, main limpio.
Estado: investigación y medición; ninguna cifra de Studio es una medición de estos módulos.

## Contrato y restricciones

Solo Docker local desechable, con Auth, PostgreSQL, Realtime y Storage propios.
Sin despliegue, publicación, conexión remota, migraciones de instalaciones existentes,
cambios de políticas aplicadas ni credenciales de Studio. Conservar API para persistencia,
carga y recuperación; Y.js sigue siendo el CRDT de Notes.

## Arquitectura efectiva encontrada

`supabase.js` instala `authorizeRealtimeClient` en el cliente global. Para los topics
protegidos, `.send()` es POST `/realtime/broadcast`, no Broadcast directo del navegador.
El wrapper consulta `/realtime/revision` cada 10 s por canal (comparte únicamente la
solicitud que coincida en vuelo). Presence usa POST `/realtime/presence`, UPSERT por
usuario/topic, roster SQL y autorización de cada integrante; caduca en 35 s.
Varias pestañas de una cuenta comparten fila; una salida puede borrar la otra.
Cada canal tiene propietario, timer y socket; varios consumidores del mismo topic
pueden destruirse entre sí cuando eliminan un supuesto canal obsoleto.

La migración `20260920010000_realtime_revocation` bloquea INSERT de clientes en
`realtime.messages`; exige sufijo `@revision` para recibir. Los cambios de permisos
rotan la revisión. No quitar esta protección para ganar rendimiento. Auth renueva JWT
en el cliente global; el relay obtiene la sesión al enviar. La revisión pública no
contiene contenido. La lectura anónima de Notes depende de publicación vigente.

`realtime-broadcaster.js` mantiene `FOR SHARE` de la revisión y la transacción Prisma
durante fetch a Realtime. Esto coordina envío y revocación; sacar fetch sin más abre
una carrera de confidencialidad. No hay timeout explícito de fetch. Se debe medir
espera de red y ocupación de conexión antes de rediseñar el contrato.

| Dominio | Canales/eventos | Persistencia y recuperación | Implementación correcta | Diagnóstico y riesgo |
|---|---|---|---|---|
| Canvas | `canvas:board:<id>`; `cursor`, `canvas.changed`; Presence | API de Board/objetos; deltas por revisión; TanStack Query | Throttle 120 ms, omite cursor si está solo, deltas selectivos, revisiones y cola de mutaciones | Cada cursor cruza Hono y autorización SQL. Estado remoto en hook produce renders. Timer trailing sin cancelación. Relay admite nombres de evento Canvas arbitrarios de un editor: auditar autoridad de `canvas.changed`. |
| Notes texto | `note:ydoc:<id>`; `ydoc.update`, `awareness.update` | GET Y.Doc, merge CRDT con CAS (5 intentos), delta de guardado y missing update; HTML legado | Base64 en chunks, IME gate, evita eco remoto, guardado incremental, merge idempotente | Broadcast completo en cada SUBSCRIBED; cada transacción local produce HTTP. Eliminar snapshot sin handshake puede perder cambios offline. Awareness no es contenido persistente. |
| Notes gráfico | `note:canvas:<id>`; `scene.delta/full/request/files/layers`, `pointer` | API escena, reconciliación Excalidraw por versión | Guard de hidratación, delta 200 ms, capas/archivos separados | Pointer 50 ms por HTTP; request responde desde cada editor y join ofrece snapshot. No optimizar full snapshots sin verificar orden, archivos y reconciliación del editor. |
| Chat | `chat:messages:<id>` Postgres Changes; `chat:presence:<id>` typing; `user:<id>:events`, company y conv | Mensaje por API; lista cada 30 s; refetch por visibilidad y Broadcast | Presence ya compartida con refcount; typing expira a 4 s; notificaciones deduplicadas; API hidrata adjuntos/citas | `subscribeToMessages` y helpers Broadcast borran canal activo de otro consumidor. Lista se invalida en provider y en cada hook; INSERT + Broadcast + mutation vuelven a invalidar. No quitar Postgres Changes sin cubrir UPDATE/DELETE. |

## Identidad, acceso y compatibilidad

Canvas cursor recibe actorId del relay autenticado; typing recibe userId y displayName
del servidor. Presence ignora identidad del cliente y consulta perfiles. Notes reenvía
payload tal cual: awareness/pointer son datos de cliente, no identidad certificada.
No afirmar que acceso al canal autentica los campos de Notes. Dueño/editor/lector,
otra empresa, revocado, deshabilitado, anónimo y público requieren pruebas reales.

RLS de acceso, funciones `runly_*_user_access`, revisión y relay son parte del contrato.
Nuevo frontend debe funcionar con API anterior; preferir cambios locales de ciclo de
vida/coalescing que no cambien eventos. Invitados usan tokens propios, no sesión de
personal. Widget, inbox y llamadas necesitan auditoría y regresión separadas. Conservar
polling de recuperación de llamadas y LiveKit. No prometer revocación instantánea:
medir sockets antiguos, rotación y ventana residual.

## Contrato de medición

Artefactos ignorados en `.artifacts/realtime-2/`; nada de tokens ni datos reales en docs.
Registrar SHA fuente, imagen API, duración real, fase, dominio y usuarios. Separar join,
reposo e interacción; tráfico HTTP por método/path, bytes de cuerpo y transferencia,
frames y bytes WS, CPU acumulada API/PG/Realtime, memoria contenedores/heap navegador,
latencia p50/p95, tablas modificadas y pg_stat_statements por categoría. Medir el propio
overhead del sampler; valores ausentes son null, nunca cero inferido.

Escenarios: 1/2/5/10, opcional 20; 60 s por tráfico, 10–30 min para retención; red
inestable, pestañas duplicadas/ocultas, multiempresa, reconexión, concurrencia y
revocación. Un harness de transportes no valida por sí solo editores, render del Board,
notificaciones o persistencia de UI: señalar esos límites en el informe.

## Decisiones condicionadas a resultados

No servidor WS/Redis, rol nuevo ni cambio de Installer por uniformidad. Primera opción:
reutilizar canales con refcount y reducir llamadas repetidas conservando autorización.
State vectors requieren handshake compatible y recuperación probada, incluida lectura
pública sin emisión anónima. Outbox requiere demostrar necesidad y preservar revocación.
Completar la línea base y matriz antes de modificar producción; detener cada etapa si
la integridad no pasa. GO exige evidencia integral, no solo tests unitarios.
