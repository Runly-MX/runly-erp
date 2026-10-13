# Parches compatibles de dependencias: resultado

Date: 2026-10-13
Base: 5c9f56dc; latest implementation: 05a97872.
Spec/plan: 2026-10-13-compatible-security-followup-design.md / 2026-10-13-compatible-security-followup.md.

## Cambios y evidencia por familia

| Familia | Revisión | Baseline → corregido | Audit | Commit |
|---|---|---|---|---|
| @hono/node-server transitivo | 1.19.11 → 1.19.17 ya usada por API | 2 pass/2 fail → 4/4 | 27 → 25 | 45b74cad |
| fast-uri de Ajv | 3.1.2 → 3.1.8 | 1 pass/7 fail → 8/8 | 25 → 17 | 9908761a |
| Valibot de Prisma dev | 1.2.0 → 1.4.2 | 1 pass/1 fail → 2/2 | 17 → 16 | 05a97872 |

Overrides exactos limitados al rango vulnerable; sin actualizar Prisma,
adaptador API directo, Ajv, Hono core o paquetes ajenos. Metadata npm confirma
targets e integridad; los peers actuales satisfacen los targets. Frozen install
sin scripts pasó después de cada familia. Comparación estructural de YAML y
package.json contra 5c9f56dc confirma que los demás paquetes, snapshots,
importers, overrides y campos del manifiesto permanecen iguales. Los payloads
de paquetes y referencias dentro del conjunto autorizado son los únicos
cambios de resolución. No se usó audit fix force.

## Contratos comprobados

Hono adapter se resuelve desde Prisma dev. Directorio temporal con archivos
sintéticos y guardas de rutas reproduce lectura del sentinel privado mediante
double slash y backslash codificado en Windows; el parche impide ambas. GET
normal, auth guard, HEAD, range y servidor HTTP loopback/puerto efímero pasan.
El target de borrado se valida por ruta real y prefijo propio. No se demostró
que el ERP exponga esos archivos o active serveStatic de esa copia.
[Slash](https://github.com/advisories/GHSA-92pp-h63x-v22m),
[Windows](https://github.com/advisories/GHSA-frvp-7c67-39w9).

fast-uri se resuelve por Prisma dev → streams-local → Ajv. Las pruebas cubren
autoridad con backslash, introducers relativos, IPv6 malformado, doble decoding
de host, scheme codificado, port inválido y case de host codificado. Las
entradas deben rechazarse o conservar interpretación compatible con WHATWG;
no se realiza ninguna petición a los hosts .test. Parse/resolve normales y
compilación real Ajv con $id/$ref, tipos/límites y campos adicionales pasan.
No se confirmó uso de fast-uri como guardia SSRF en Runly.
[Host case](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj); otros advisories
URI del audit guiaron casos sintéticos del test.

Valibot record genera errores para claves propias que coinciden con métodos
heredados; flatten produce arrays propios sin cambiar Object.prototype.
Schemas ordinarios, transforms y paths de error pasan; Prisma dev carga y
conserva su export de servidor, sin iniciar ese servidor. El baseline lanza
TypeError; no representa contaminación global del prototipo ni prueba que un
endpoint ERP exponga este flujo.
[Valibot](https://github.com/advisories/GHSA-5qjj-4xww-7phc).

Los 14 tests dirigidos finales pasan, cero skips en Windows. La prueba de
backslash explícitamente se omite fuera de Windows; eso no acepta otros hosts.
El baseline combinado fue 4 pass/10 fail, todos por las regresiones descritas.

Barridos finales tras los tres parches: API 2,404 pass/dos skip/cero fail
(2,406 tests, 228.69 s); shared/desktop/scripts/installer/scaffold 1,626 pass,
siete skip, cero fail (1,633 tests, 203.49 s). Sin flags de DB real. Skips no
equivalen a aceptación. Privacidad/secrets: 4,381 archivos revisados, cero
hallazgos; Gitleaks 8.30.1 sin leaks en snapshot, sin scan histórico. Whitespace
pasa. No hubo cambios React de producto ni nueva compilación web en este scope.

## Estado de seguridad y límites

Audit final: **16 alertas**, cero críticas, seis altas, nueve moderadas y una
baja. Quedan uuid, deepmerge-ts, mysql2, nodemailer, csv-parse, braces y katex.
Sin excepciones aceptadas. La reducción del contador no demuestra aceptación
de toda la seguridad, ni que las alertas restantes sean explotables.

No aceptación de Studio/CLI real, DB o tráfico de producción. Resolución,
load y fixtures de consumidores no ejecutan Prisma dev server o migraciones.
No hubo UI, SDK, schema, credenciales, publicación o despliegue. CI reproducible,
B2 real y correcciones de transporte empresarial siguen diferidos. MirAI
recovery, Notes durable y aceptación operativa de readiness permanecen scopes
independientes.
