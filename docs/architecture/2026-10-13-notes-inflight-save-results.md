# Notes: guardados en curso y desmontaje

Date: 2026-10-13
Planning: 9d6839bd; extraction: cf73a259; fix: 1b7305ed.
Spec/plan: 2026-10-13-notes-inflight-save-design.md / 2026-10-13-notes-inflight-save.md.
Status: verified locally; real persistence acceptance pending.

## Cambio

flushNoteSave ejecuta la ruta extraída que usa NoteEditorSurface. Cuando hay
otro envío activo, el flush captura primero los bytes Y.Doc desde el vector
confirmado y después solicita rerun. Un ref por instancia conserva el payload
pendiente; un fallo lo restaura si no existe uno más reciente. Un diff nuevo
incluye los cambios anteriores no confirmados y puede sustituir el pendiente.
Los envíos siguen serializados, Y.Doc primero y HTML después.

useNoteSaveOnUnmount cancela el debounce y solicita flush en layout cleanup,
antes del cleanup pasivo del engine padre. El callback sigue publicándose sólo
en commit mediante useCommitRefValue. Una respuesta tardía no actualiza el
vector del provider ni aplica catch-up si Y.Doc está destruido. Con documento
activo, el comportamiento de convergencia se conserva.

El indicador dirty sigue visible al keepalive existente mientras el envío
espera y tras un fallo. No se cambió el handler keepalive, SDK, provider,
contrato API, autorización, transporte empresarial, schema o dependencias.
React documenta el cleanup al desmontar y el coste de trabajo síncrono en
layout effects: [useLayoutEffect](https://react.dev/reference/react/useLayoutEffect).

## Evidencia

| Etapa | Resultado |
|---|---|
| Extracción del flujo original | Cinco tests pasan antes del fix |
| Baseline de regresiones | Cinco pass/tres fail: acceso a store destruido, update tardío y payload fallido ausente |
| Tests dirigidos finales | 16/16, incluyendo nueve de flujo, fixture teardown y seis del callback |
| Suite Notes + tres fixtures Chrome | 168 pass, cero fail/skip, 21.58 s |
| Build web | Pasa en 5.35 s; advertencia existente de chunks grandes |
| React Doctor 0.9.18 | Completo, sin checks omitidos, cero errores/cinco warnings previos |

Los tests Node usan Y.Doc reales, SDK inyectado y promesas controladas, sin
proveedor o servidor real. En el baseline se observaron cinco accesos al store
después de destruir el doc; esto no demuestra pérdida de datos en producción.
La corrección verifica cero accesos posteriores, dos payloads que convergen
en el documento de servidor simulado y el snapshot HTML más nuevo.

Otros casos verifican guardas, orden Y/HTML, catch-up activo, invalidación de
cache, fallo HTML sin sobrescribir una edición nueva, fallo Y con conservación
del payload más nuevo y ausencia de loop automático. Sólo se ejecuta el rerun
solicitado; un nuevo intento explícito del fixture puede enviar los bytes
conservados aun sin documento vivo. Dos instancias conservan sus IDs/tokens y
estado separados; esto no constituye aceptación de aislamiento HTTP.

Chrome usa hooks y helper de producto con un owner React cuyo cleanup pasivo
destruye el doc. Comprueba bytes capturados antes de destruirlo, envío Y/HTML
posterior correcto, cero accesos al doc destruido y timer cancelado. No monta
NoteEditor completo, pero ejecuta su ruta de flush real, a diferencia del
fixture anterior que sólo verificaba callbacks. Suspense/StrictMode siguen
pasando con el hook de salida real. Peticiones externas bloqueadas.

React Doctor conserva warnings de complejidad, componente grande, metadatos
de usuario y dos de accesibilidad. Sin score remoto/supply chain externo,
hooks, issues o CI. El CLI completó el scan pese a advertencias de engine por
Node 22.12; no se acepta compatibilidad universal de la herramienta. No se
repitieron suites generales API/shared o audit: las 27 alertas anteriores
permanecen abiertas y no hubo cambio de lockfile.

Privacidad/secrets: 4,367 archivos revisados, cero hallazgos; Gitleaks 8.30.1
sin leaks en snapshot de archivos (sin scan histórico). Whitespace pasa.

Changelog Supabase y removeChannel revisados, sin cambio de APIs/proveedor:
[documentación](https://supabase.com/docs/reference/javascript/removechannel).

## Límites y pendientes

La cola es volátil. Si el último envío falla después de navegar, los bytes
pueden quedar en una instancia ya inaccesible al usuario; este cambio no
introduce UI de recuperación ni persistencia durable. Cerrar el proceso,
requests colgados, revocación de sesión, cambios de compañía, retries con
timeout/backoff, deduplicación HTML y recuperación offline siguen abiertos.

Keepalive sigue con su implementación anterior: cap compartido, orden frente
a envíos normales y reconocimiento de vectores requieren pruebas propias.
Codificar bytes ocurre de forma síncrona; el fixture es pequeño, sin benchmark
representativo de notas grandes. No se afirma entrega garantizada o red real
aceptada. Provider/reconexión, imágenes reales y cinco warnings previos quedan
pendientes. B2 real, CI reproducible y correcciones de transporte empresarial
siguen diferidos. No publicación, despliegue o cambios en datos reales.
