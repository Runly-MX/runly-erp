# API: readiness acotado e independiente de liveness

Date: 2026-10-13
Status: Authorized autonomous local scope

## 1. Feature title

GET /ready verifica base y bootstrap del runtime dentro de un presupuesto.

## 2. Status

El usuario autorizó avanzar con readiness y revisar las alertas restantes. La auditoría actual conserva 27; no se afirma corregirlas en este scope.

## 3. Context

/health sólo responde con nombre/fechas. pgPool existente tiene connect timeout 30 s. routeLoader.initialize finaliza antes de serve, pero puede registrar ERROR de módulos sin lanzar. Graph/source y documentación pg consultados.

## 4. Problem

La respuesta liveness no distingue DB inaccesible o runtime con rutas fallidas. Un sondeo sin límites puede ocupar conexiones/esperas ante tráfico público.

## 5. Goals

Separar liveness de readiness. Responder 200/503 con estados genéricos, máximo un sondeo DB pendiente, deadline y cache corta; liberar clientes incluso si llegan tarde. Revalidar runtime antes de dar verde.

## 6. Non-goals

No cambiar healthchecks Compose/CI/tráfico desplegado. No comprobar Auth, Storage, LiveKit, workers, backup, schema completo, permisos de consultas ERP, bundles/componentes públicos o cada recorrido. Sin credenciales, DB real, migraciones o upgrades de dependencias.

## 7. User stories

Como operador, quiero distinguir un proceso vivo de una API no preparada sin provocar reinicios por un fallo de DB.

## 8. UX requirements

Sin UI. Respuestas pequeñas, sin destinos, mensajes de error, claves de módulos o stack traces; Cache-Control no-store.

## 9. Routes/screens

GET /health existente con mismo payload; GET /ready nuevo. Registrados antes del middleware de módulos para reservar el contrato operativo.

## 10. Data model

N/A; estado de sondeo/cache local al proceso.

## 11. Prisma impact

N/A; SELECT 1 usando pgPool existente. No schema/migraciones ni escritura.

## 12. API contract

/ready público: { ok: boolean, checks: { database: 'ready'|'unavailable'|'timeout'|'not_checked', runtime: 'ready'|'unavailable' } }. HTTP 200 sólo si ambos ready; 503 en otro caso. /health sigue 200 independiente de DB/runtime. HEAD usa comportamiento Hono de GET. Sin parámetros configurables por petición.

## 13. SDK contract

N/A; health() existente conservado.

## 14. Validator contract

Parámetros internos validados por factory: deadline entero positivo (default 1500 ms), cache success 1000 ms/failure 250 ms. No env nueva en esta etapa.

## 15. Module manifest impact

N/A; endpoints de plataforma. Bootstrap completo + routeStatus sin ERROR; MISSING_API válido para módulos sin API, UNLOADED válido. Estado desconocido falla cerrado. Errores suprimidos de bundles/componentes/public routes no quedan cubiertos.

## 16. Navigation impact

N/A.

## 17. Blueprint impact

N/A.

## 18. RBAC/permissions

Público deliberadamente para sondeos; información sanitizada y coalescing/cache locales. Sin modificar autorización ERP.

## 19. Multi-company behavior

Señal de instancia/proceso, no de compañía. No leer datos empresariales. Aislamiento de ERP no aceptado por SELECT 1.

## 20. Files/storage impact

N/A.

## 21. Export/import requirements

N/A.

## 22. Audit log requirements

N/A; no logs por sondeo o mensajes DB públicos.

## 23. Edge cases

DB reject/throw/hung, pool lleno/connect tardío, abort durante query, release único, error tardío sin unhandled rejection, request concurrentes, cache caducada, runtime perdido durante query/cache, shutdown. Retener el flight hasta que el sondeo subyacente termine: un connect colgado no acumula nuevos sondeos. Deadline responde timeout aunque no sea posible cancelar la adquisición inmediatamente.

## 24. Risks

SELECT 1 prueba conexión/query simple, no permisos/schema de ERP. Un ERROR obsoleto permanece rojo hasta unload/reload/reinicio; no alterar loader en este scope. Una conexión subyacente colgada conserva un flight rojo hasta resolverse; pgPool limita adquisición a 30 s. Timeout destruye el cliente propio, sin alterar el pool completo. Caché puede demorar detección DB hasta 1 s. Sin garantías de rendimiento bajo saturación/event loop bloqueado.

## 25. Acceptance criteria

DB correcta y runtime listo: 200. DB falla/lenta o runtime incompleto/ERROR: 503, sin error interno. /health sigue 200 sin consultar DB. Cien peticiones comparten una consulta. Timeout seguido de nuevas peticiones no crea más probes mientras el original sigue pendiente. Cliente tardío se libera sin query; abort destruye cliente activo una vez. Recuperación exige sondeo nuevo; resultado tardío no vuelve verde el timeout.

## 26. Verification plan

Node tests de service, pool simulado y Hono HTTP con fallos; integración de wiring por source contract sin importar index ni conectar DB. API regression suite sin opt-in real; privacy/secrets/whitespace. Audit actual registrado con familias, sin excepciones ni claim de reducción.

## 27. Rollback plan

Revert focalizado routes/service/integración; no migraciones o despliegue.

## 28. Future enhancements

Aceptación contra DB/imagen real, configuración por instalación, esquema/operaciones representativas, señales Auth/Storage/worker, errores runtime por capability, shutdown drain y observación externa. Dependencias tienen scopes separados; B2/CI/transporte diferidos conservados.

Fuentes primarias: [Pool](https://node-postgres.com/apis/pool), [Client](https://node-postgres.com/apis/client). Guías Supabase/Postgres aplicadas; sin cambios de versión o plataforma.
