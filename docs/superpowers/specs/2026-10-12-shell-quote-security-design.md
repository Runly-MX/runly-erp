# Parche de dependencia de desarrollo shell-quote

Date: 2026-10-12
Status: Complete
Program: docs/superpowers/plans/2026-10-12-runly-stabilization.md (Task 3)

## 1. Feature title

Aplicar el parche de shell-quote usado por concurrently de desarrollo.

## 2. Status

Complete. Task 3 de estabilización autorizado; alcance de una sola familia compatible. Verified: 2026-10-12 (baseline 1/2; después 10/10 dirigidas, frozen install sin scripts, CLI, audit 0 críticas/44 restantes, privacidad y whitespace).

## 3. Context

pnpm audit detecta shell-quote 1.9.0 vía concurrently 10.0.5; es la alerta crítica actual.

## 4. Problem

quote permite una combinación de comentario y terminador de línea que puede alterar el comando. No se ha demostrado entrada remota a esa ruta en Runly ni se ejecutará un payload.

## 5. Goals

1. Resolver la dependencia específica concurrently>shell-quote a 1.11.0.
2. Probar rechazo de terminadores tras comentario y compatibilidad de comandos ordinarios.
3. Reducir a cero esa alerta crítica sin actualizar otras familias.

## 6. Non-goals

No actualización general, upgrades major, modificación de scripts de ejecución, payload shell ejecutado, publicación, deploy o rotación de secretos.

## 7. User stories

Como desarrollador quiero que el coordinador de procesos use el parser corregido y mantenga los comandos de desarrollo existentes.

## 8. UX requirements

N/A: sin UI.

## 9. Routes/screens

N/A.

## 10. Data model

N/A.

## 11. Prisma impact

Sin cambios.

## 12. API contract

Sin cambios API.

## 13. SDK contract

Sin cambios.

## 14. Validator contract

La validación está en shell-quote 1.11.0; no agregar validadores de aplicación.

## 15. Module manifest impact

Sin cambios de módulo, PWA o permisos.

## 16. Navigation impact

N/A.

## 17. Blueprint impact

N/A.

## 18. RBAC/permissions

Sin cambios.

## 19. Multi-company behavior

Sin cambios.

## 20. Files/storage impact

Solo package.json, lockfile y prueba local. Sin datos de usuario.

## 21. Export/import requirements

N/A: no publicar paquetes; instalar dependencias sin ejecutar scripts de instalación.

## 22. Audit log requirements

Sin nuevas escrituras; evidencia privada del audit y resumen sanitizado.

## 23. Edge cases

LF, CR, U+2028/U+2029 después de token comentario; comandos con espacios/argumentos habituales y parse/quote roundtrip. Resolver la copia que realmente consume concurrently.

## 24. Risks

Overrides pueden refrescar dependencias ajenas: revisar diff y no aceptar cambios fuera de la familia. No afirmar ausencia de riesgo remoto porque sea tooling; el alcance observado no demuestra exposición de servidor.

## 25. Acceptance criteria

1. La regresión falla con 1.9.0 y pasa con 1.11.0 sin ejecutar comandos del payload.
2. Lockfile solo cambia override, shell-quote y vínculo de concurrently.
3. pnpm install congelado sin scripts reproduce instalación, audit deja de reportar GHSA-pqg4-j6r4-53mv y CLI concurrently conserva ayuda.

## 26. Verification plan

Prueba dirigida, tests de start-office-dev, concurrently --help, frozen install --ignore-scripts, pnpm audit --json, privacy y diff check. Suites generales ya pasaron antes; no atribuirlas a la versión instalada después.

## 27. Rollback plan

Revertir commit de override/lockfile y reinstalar congelado sin scripts; reintroduce alerta crítica y requiere decisión explícita.

## 28. Future enhancements

Parchear otras familias según matriz de riesgo y compatible/major; CI y secret tooling persistente. Fuente primaria: https://github.com/advisories/GHSA-pqg4-j6r4-53mv.

