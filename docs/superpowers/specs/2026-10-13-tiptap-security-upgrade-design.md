# Actualización coordinada de Tiptap

Date: 2026-10-13
Status: Approved for autonomous local implementation
Program: docs/superpowers/plans/2026-10-12-runly-stabilization.md, Task 3.

## 1. Feature title

Actualizar la familia Tiptap a 3.30.5 con contratos del editor comprobados.

## 2. Status

Continuación autorizada de los parches de seguridad. CI, B2 real y transporte empresarial siguen diferidos.

## 3. Context

Último audit: 29 alertas, dos de @tiptap/core 3.27.1. Instalación: 43 paquetes Tiptap 3.27.1 y y-tiptap 3.0.5. Notes usa buildExtensions, ReactNodeViews, tablas, sugerencias y colaboración. Graph consultado; documentación/metadata primarias contrastadas.

## 4. Problem

mergeAttributes puede heredar atributos desde una propiedad JSON __proto__; parsers de atributos Markdown tienen coste cuadrático. Tenerlos instalados no demuestra explotación de Notes, cuyos schemas fijos descartan atributos desconocidos y no necesariamente usan esos parsers.

## 5. Goals

1. Todos los paquetes Tiptap coordinados en 3.30.5, sin peers mezclados.
2. Resolver mínimos nuevos: y-tiptap 3.0.7 y prosemirror-model 1.25.11; mantener prosemirror-view 1.42.3 y demás versiones.
3. Reproducir casos de seguridad y conservar editor, historial y sincronización Y.Doc local.

## 6. Non-goals

No cambios de documentos persistidos, schemas, permisos, React, SDK, proveedor Realtime/Supabase, API, release o CI. No aceptación de dos personas/redes o plugin de imágenes completo por un fixture lógico.

## 7. User stories

Como mantenedor quiero actualizar el editor y sus extensiones juntos sin perder compatibilidad de los documentos existentes.

## 8. UX requirements

Conservar pegado, formato, tablas, undo/redo y roundtrip. Fixtures locales con HTML sintético y tráfico externo bloqueado; no pantallas de producto nuevas.

## 9. Routes/screens

N/A: no rutas nuevas.

## 10. Data model

N/A: sin modelos modificados.

## 11. Prisma impact

N/A: sin schema/migración/consulta.

## 12. API contract

Sin cambio. Verificación de helpers públicos Tiptap y APIs de Editor/EditorView.

## 13. SDK contract

Sin cambios de SDK o imports lógicos Runly.

## 14. Validator contract

Regresión de mergeAttributes con propiedad JSON propia __proto__; no heredar onerror/data-canary. Parsers Markdown negativos ejecutados en procesos hijos con timeout y sin payload ejecutable. Contratos de atributos/class/style normales preservados.

## 15. Module manifest impact

N/A: no manifiesto RME3 modificado.

## 16. Navigation impact

N/A.

## 17. Blueprint impact

N/A.

## 18. RBAC/permissions

Sin cambios; fixtures no tienen cuentas, tokens o permisos reales.

## 19. Multi-company behavior

Sin cambios; no aceptación de aislamiento empresarial por este test.

## 20. Files/storage impact

Metadata/logs temporales locales; fixtures sin datos reales. Documents/notes guardados no se transforman.

## 21. Export/import requirements

Probar JSON/HTML roundtrip, atributos normales, pegado y Y.Doc local. Validar React/editor bundle y singletons; no migración automática de contenido.

## 22. Audit log requirements

Evidence Markdown/JSON de paquetes, versiones, tests y alertas restantes. Sin paths personales o logs privados tracked. No excepciones de seguridad aceptadas.

## 23. Edge cases

__proto__ propio vs atributos normales, parsers block/inline malformados con presupuesto de proceso, schemas clipboard, undo/redo en modo normal y colaboración sin doble historial; actualización entre dos Y.Doc en memoria y limpieza de Awareness.

## 24. Risks

La familia usa peers exactos; no actualizar sólo core. prosemirror-model nuevo mínimo afecta peers de su familia: resolver coherentemente sin duplicarlo. pnpm puede refrescar latest: reconstruir/revisar sólo bloques y referencias necesarios y comprobar YAML/manifiesto. React Doctor se usa como revisión y se distinguen advertencias preexistentes.

## 25. Acceptance criteria

1. Baseline de seguridad falla, controles normales pasan.
2. Frozen install pasa sin resoluciones ajenas; todos los 43 paquetes Tiptap en 3.30.5, y-tiptap 3.0.7.
3. Seguridad, clipboard/Notes y colaboración local pasan; build y regresión shared pertinentes pasan.
4. Audit sin @tiptap/core alertada; otras familias siguen abiertas.

## 26. Verification plan

node:test, child-process bounds, esbuild/Chrome reales con fixtures existentes ampliados, shared acotado, build web y React Doctor, privacidad/secrets/whitespace. No provider/DB/hardware reales. CSS excluido del fixture lógico; build comprueba estilos.

## 27. Rollback plan

Revertir commit de familia y frozen install anterior; reaparecen alertas. Sin rollback de datos.

## 28. Future enhancements

SMTP/CSV/tooling Prisma y otras familias con scope propio; readiness/MirAI y políticas de sesión abiertas. Colaboración real y UI de imágenes requieren aceptación aparte.

Sources: [mergeAttributes](https://github.com/advisories/GHSA-cp6q-959q-f8rh), [Markdown parsers](https://github.com/advisories/GHSA-j95f-988m-3j2f); manifests públicos npm de cada paquete 3.30.5 y y-tiptap 3.0.7.
