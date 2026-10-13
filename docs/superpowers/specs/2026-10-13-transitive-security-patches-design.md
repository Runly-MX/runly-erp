# Parches transitivos de mapas, clipboard y utilidades

Date: 2026-10-13
Status: Complete (local verification)
Program: docs/superpowers/plans/2026-10-12-runly-stabilization.md, Task 3.

## 1. Feature title

Corregir source-map-js, prosemirror-view y las copias vulnerables de lodash-es.

## 2. Status

Trabajo local autorizado por «ok entonces continuemos», sobre el siguiente bloque de parches compatibles. CI, B2 real y transporte empresarial conservan su aplazamiento.

## 3. Context

La última auditoría registra 34 alertas, 17 altas, en 14 familias. source-map-js 1.2.1 llega por Tailwind/PostCSS; prosemirror-view 1.41.9 por Tiptap; lodash-es 4.17.21 por el parser Mermaid/Excalidraw. Ya existe una copia lodash-es 4.18.1 en el lockfile.

## 4. Problem

Los consumidores resuelven versiones afectadas por validación insuficiente de mapas indexados, atributos de contexto del clipboard y claves/path segments de utilidades. La topología no demuestra explotación de una pantalla Runly.

## 5. Goals

1. Actualizar sólo estas familias y referencias de peers necesarias.
2. Reproducir comportamientos negativos de los advisories y preservar contratos normales.
3. Verificar frozen install, build y consumidores afectados; registrar todas las alertas restantes.

## 6. Non-goals

No upgrade Tiptap, Excalidraw, Prisma, React, cambios de documento persistido, autenticación, release o CI. No ejecutar comandos, exfiltrar información o usar datos reales en los fixtures.

## 7. User stories

Como mantenedor quiero dependencias transitivas corregidas con evidencia de compatibilidad para poder revisar y revertir cada familia por separado.

## 8. UX requirements

Conservar edición, pegado ordinario y renderizado actuales. Los fixtures usan Chrome local y documentos sintéticos; no añaden pantallas del producto.

## 9. Routes/screens

N/A: no rutas o pantallas nuevas.

## 10. Data model

N/A: sin modelos nuevos o modificados.

## 11. Prisma impact

N/A: no esquema, migración, consulta o upgrade Prisma.

## 12. API contract

N/A: no endpoint nuevo. La compilación CSS conserva su contrato.

## 13. Service contract

Mantener APIs de SourceMapConsumer/Generator/Node, utilidades lodash y EditorView. ProseMirror debe descartar contexto clipboard con atributos inválidos y admitir el contexto válido.

## 14. SDK impact

N/A: no cambio de SDK o exports compartidos.

## 15. Module manifest

N/A: no módulo RME3, claves o manifiesto nuevo.

## 16. Views/pages

N/A: no cambios declarativos o componentes React de producto.

## 17. Navigation

N/A: sin cambios.

## 18. RBAC/permissions

Sin cambios. No cuentas, tokens o sesión de cliente en los fixtures.

## 19. Multi-company behavior

Sin cambios. Esta etapa no acepta transporte empresarial ni aislamiento de DB.

## 20. Files/storage impact

Fixtures, bundles y tarballs de revisión en temporales privados. Limpieza restringida al directorio temporal creado por la herramienta. Sin archivos de cliente.

## 21. Export/import requirements

Probar mapas válidos y pegado de texto/HTML, edición y serialización. El consumidor lodash se resuelve a través del padre afectado, no desde una copia segura ajena.

## 22. Audit log requirements

Resumen Markdown y JSON sanitizados por versión/commit, baseline y resultados. Paths sólo relativos a paquetes; no logs privados, direcciones o credenciales en tracked files.

## 23. Edge cases

Offsets no enteros/no finitos/negativos/excesivos y suma de offsets anidados; contextos clipboard con atributo string válido o array inválido; imports con identificador inválido y paths de unset/omit con segmentos envueltos en arrays. Prototipos sintéticos y limpieza en finally.

## 24. Risks

Los overrides deben limitarse a rangos vulnerables y versiones exactas corregidas: source-map-js@<1.2.2 → 1.2.2; prosemirror-view@<1.42.3 → 1.42.3; lodash-es@<4.18.0 → 4.18.1 ya instalada. Preservar todas las demás resoluciones. Revisar dependencias nuevas y los peers de colaboración. Un fixture aislado no acepta todos los plugins del editor ni colaboración real.

## 25. Acceptance criteria

1. Baseline negativa reproducida; contratos normales pasan antes y después.
2. Frozen install pasa y lockfile sin upgrades ajenos.
3. Auditoría ya no identifica estas tres familias; alertas restantes siguen abiertas.
4. Browser clipboard, bundling web y suites dirigidas de consumidores pasan; cualquier fallo se investiga y conserva en evidencia.

## 26. Verification plan

node:test sobre copias efectivas, esbuild del fixture de editor y Chrome con tráfico externo bloqueado; compilación CSS/escenarios normales, frozen install sin scripts, audit, build web, pruebas Notes/Canvas/compiler/runtime pertinentes, privacidad/secrets y whitespace. Bounds y omisiones explícitos; sin DB/hardware real.

## 27. Rollback plan

Revertir commit de la familia y reinstalar lockfile anterior; reaparece su alerta. No rollback de datos.

## 28. Future enhancements

Tiptap/core, tooling Prisma y upgrades SMTP/CSV/UUID continúan como scopes separados. Readiness, autenticación y recuperación MirAI siguen pendientes.

Verified: 2026-10-13. Tres commits de familia; 15/15 tests dirigidos, frozen installs, build web, API 2365 pass/2 skip y shared 1617 pass/7 skip, sin fallos. Audit 29 sigue abierto. Evidencia completa en transitive-security-results.md/.json.

Primary references: [source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q), [ProseMirror](https://github.com/advisories/GHSA-c8x8-7fp4-3x9w), [lodash template](https://github.com/advisories/GHSA-r5fr-rjxr-66jc), [lodash paths](https://github.com/advisories/GHSA-f23m-r3pf-42rh).
