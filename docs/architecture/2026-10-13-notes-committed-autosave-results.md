# Notes: callback de guardado y render confirmado

Date: 2026-10-13
Scope: local lifecycle correction; no operational acceptance.
Implementation: 4c282078; planning: 408f1cff.
Spec/plan: 2026-10-13-notes-committed-autosave-design.md / 2026-10-13-notes-committed-autosave.md.

NoteEditorSurface ya no publica flushSave durante render. Un ref estable,
declarado antes del callback, recibe su valor mediante useCommitRefValue en
layout effect. Cleanup pasivo, debounce, guardas, SDK y payloads conservan su
comportamiento. El ref también sigue disponible para la solicitud de rerun
cuando termina un guardado en curso. No hubo dependencias, schema, provider,
datos o API modificados.

React advierte que refs escritos durante render pueden producir resultados
impredecibles. La actualización en efecto ocurre durante commit; un render
suspendido no publica su callback. Fuentes: [useRef](https://react.dev/reference/react/useRef),
[useLayoutEffect](https://react.dev/reference/react/useLayoutEffect).

## Evidencia

El fixture Chrome usa el hook de producto, React development, Suspense,
startTransition y StrictMode. Observa explícitamente el render suspendido y
comprueba que la UI confirmada sigue montada antes del unmount. Con la escritura
original, los escenarios suspended y strict llaman al callback descartado:
tres escenarios pasan y dos fallan, con fallo adicional del test padre
(node:test: tres pass/tres fail). Con la corrección pasan los cinco escenarios
y el padre: 6/6.

Los otros escenarios comprueban que un commit publica el callback nuevo sin
flush prematuro, cada key desmontada usa su callback y una microtask usa el
callback confirmado. El timeout cancelado se observa durante un intervalo
mayor que su plazo, sin invocación posterior.

La suite final de Notes y los dos fixtures Chrome terminó con 158 pass,
cero fail, cero skip, 20.54 s. Build web pasó en 5.10 s; sigue la advertencia
existente de chunks grandes. No se repitieron suites generales API/shared.

React Doctor 0.9.18 completó los dos archivos afectados sin checks omitidos:
cero errores y cinco advertencias previas (complejidad, componente grande,
dependencias de metadatos de usuario y dos de accesibilidad). El ajuste final
declara el ref antes de flushSave para evitar una dependencia circular y
conservar la estabilidad reconocida por exhaustive-deps; una variante
provisional generaba una advertencia adicional y no se conservó. La herramienta
advirtió que Node 22.12 está por debajo del mínimo de alguno de sus paquetes;
el scan terminó completo. No se habilitaron score remoto, supply chain externo,
hooks, issues o CI.

Privacidad y secretos: 4,359 archivos revisados, cero hallazgos; Gitleaks 8.30.1
sin leaks en snapshot de archivos, sin scan histórico. Whitespace pasa.

## Límites y pendientes

El harness replica el cleanup/debounce del editor y usa el hook real; no monta
NoteEditorSurface completo ni verifica solicitudes SDK de autoguardado. Las
pruebas existentes de Notes usan fixtures, no un proveedor vivo. No se afirma
que se haya perdido contenido en producción ni que este cambio resuelva toda
la recuperación de guardados: request en curso durante desmontaje, destrucción
del Y.Doc, retries, keepalive y errores de red necesitan pruebas propias.

Quedan las cinco advertencias, aceptación de colaboración/imágenes reales y
27 alertas de dependencias de la revisión anterior. CI reproducible, B2 real
y transporte empresarial continúan diferidos. Sin publicación o despliegue.
