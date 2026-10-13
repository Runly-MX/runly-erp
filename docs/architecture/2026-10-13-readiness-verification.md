# Readiness API y estado de alertas

Date: 2026-10-13
Planning: 92272d82.
Implementation: 6de59edd.
Spec/plan: 2026-10-13-api-readiness-design.md / 2026-10-13-api-readiness.md.
Scope: local implementation and simulated verification; operational acceptance pending.

## Readiness

Service con deadline de 1,500 ms, cache corta y una única operación DB
subyacente. El adaptador usa el pgPool de la API, destruye el cliente propio
al abortar y libera adquisiciones tardías sin lanzar queries. El flight sigue
retenido tras timeout hasta que la operación termina, evitando acumular
sondeos. Un resultado tardío no transforma la respuesta vencida en verde.

/health conserva su payload sin consultar dependencias; /ready devuelve
200/503 con estados genéricos y no-store. Ambos se registran antes de delegación
de módulos. Bootstrap completo y registro de rutas sin ERROR determinan la
señal runtime; shutdown la revoca. No se alteró Compose ni tráfico desplegado.
Ver [contrato operativo](../deployment/api-health.md).

Los 18 tests dirigidos pasan: HTTP y HEAD con Hono real, 100 requests
coalescidas, cache/recuperación, runtime perdido durante la espera, errores
sanitizados, deadline con promesa colgada, rechazo tardío manejado y liberación
única de clientes. Pool/adquisición/query son simulados; no hubo DB real.
El wiring de index se verifica por contrato de source, sin importar el entry
point que conecta dependencias. SELECT 1 no acepta schema, permisos ERP,
provisión core, Storage/Auth o todos los módulos. Errores suprimidos de bundles,
componentes y public routes no forman parte de esta señal. El estado ERROR
obsoleto puede conservar rojo hasta reload/unload/reinicio.

Barrido API final: 2,406 tests, 2,404 pass, dos skip, cero fail/cancelled,
220.83 s; sin flags de DB real. Los skips no son aceptación. node --check de
index y whitespace pasan. Privacidad/secrets: 4,375 archivos, cero hallazgos;
Gitleaks 8.30.1 sin leaks en snapshot de archivos, sin scan histórico.

## Auditoría de dependencias confirmada

`pnpm audit --json` se ejecutó de nuevo sobre el lockfile actual: **27 alertas**,
cero críticas, 13 altas, 13 moderadas, una baja. Diez familias, sin excepciones
aceptadas. Este scope no modifica dependencias ni reduce ese contador. Una
alerta de paquete instalado no demuestra por sí sola explotación en Runly.

| Familia pendiente | Severidades presentes | Trabajo siguiente |
|---|---|---|
| @hono/node-server | Moderada | Distinguir la copia transitiva alertada del adaptador API directo ya posterior al parche |
| uuid | Moderada | Contratos legacy/ESM y consumidores antes de cambio major |
| fast-uri | Alta/moderada | Consumers de validación URI y parsers; parche con regresiones |
| valibot | Moderada | Validadores usados por el padre; fixtures de schemas |
| deepmerge-ts | Alta | Superficies de merge y compatibilidad de major |
| mysql2 | Alta/moderada | Padre que lo distribuye y alcance real de driver opcional |
| nodemailer | Alta/moderada | SMTP, parsing/direcciones/adjuntos; upgrade major coordinado |
| csv-parse | Moderada | Contratos de importación y límites de entradas; upgrade major |
| braces | Alta | Padres de glob/compilación; el audit no declara versión parcheada instalable |
| katex | Baja | Render y límites de fórmulas, compatible con consumidores |

La tabla agrupa familias, no suma advisories: una familia puede presentar
varias alertas y caminos. El conteo es el metadata de audit. No se adoptó
`audit fix --force`, se ocultaron advisories o se verificó alcance remoto.
Las siguientes correcciones necesitan scopes y commits propios; las versiones
compatibles se priorizan, las major requieren fixtures de sus consumidores.

Los caminos de audit observados para Hono 1.19.11, fast-uri 3.1.2 y Valibot
1.2.0 incluyen @prisma/dev 0.24.3; fast-uri aparece vía @prisma/streams-local
y Ajv. Katex 0.16.47 aparece vía Excalidraw/Mermaid. Identificar un padre no
demuestra que el código vulnerable sólo se use en desarrollo, ni acepta una
excepción: uso runtime/CLI y entrada alcanzable requieren verificación propia.

## Pendientes operativos

Readiness local no demuestra la revisión desplegada ni comportamiento de DB
real bajo fallos. Falta observar la imagen/instancia, integración del sondeo y
señales de worker, backups y capacidades opcionales. MirAI recovery y Notes
durable siguen scopes independientes. CI reproducible, simulacro B2 real y
correcciones de transporte empresarial continúan diferidos. Sin publicación,
despliegue, credenciales o migraciones.
