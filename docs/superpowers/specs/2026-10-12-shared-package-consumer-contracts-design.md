# Consumidor aislado de paquetes Runly

Date: 2026-10-12
Status: In Progress
Program: docs/superpowers/plans/2026-10-12-runly-stabilization.md (Task 5)

## 1. Feature title

Verificar paquetes compartidos en un consumidor externo aislado.

## 2. Status

In Progress. El usuario autorizó continuar autónomamente el trabajo local el 2026-10-12 y difirió CI. Este alcance ejecuta Task 5 sin publicación, cambios del Hub o credenciales.

## 3. Context

ERP usa workspace:* y seis paquetes se preparan como @runly-mx con versiones source de SHA completo y aliases lógicos. La preparación actual valida archivos/imports, pero no demuestra instalación y uso fuera del monorepo.

## 4. Problem

Un paquete puede compilar dentro del ERP gracias a hoisting, fuentes hermanas o runtimes duplicados y fallar en un consumidor independiente. La preparación de seis paquetes desde 5f9066dc pasó, pero todavía falta esta prueba.

## 5. Goals

1. Instalar las seis tarballs verificadas con aliases exactos mediante un registro temporal local, fuera del repositorio.
2. Probar Node/compiler/SDK y JSX/CSS/preview en navegador real sin fuentes del ERP.
3. Probar aliases Atlas soportados y una única copia React/ReactDOM/Query.
4. Reinstalar desde lockfile congelado en una segunda carpeta limpia.

## 6. Non-goals

No migrar ERP a dependencias de registry, modificar Hub, publicar, editar workflows CI, usar GitHub credentials, declarar aceptación de registry real o ejecutar módulos externos no revisados.

## 7. User stories

Como mantenedor quiero validar un set de paquetes de un SHA exacto en un proyecto independiente para coordinar consumo y rollback con evidencia.

## 8. UX requirements

Fixture local con texto español y controles @runly/ui existentes; no interfaz de producto nueva. Se verifican renderer/preview y componentes, sin flujo de usuario real.

## 9. Routes/screens

Solo servidor fixture en 127.0.0.1 con puerto efímero; sin rutas o API de producción.

## 10. Data model

Resultado de verificación: revision, package identities/integrities, instalación/frozen reinstall, Node/browser/build, resolución de singletons y límites. Sin modelos persistentes.

## 11. Prisma impact

Sin modelos, migraciones o URLs DB.

## 12. API contract

CLI verify:shared-consumer --manifest <prepared-manifest.json>; validar schema 3, seis identidades, SHA y digests antes de servir tarballs. Registro efímero permite solo GET/HEAD de metadata/tarballs allowlisted; no PUT/publicación.

## 13. SDK contract

Firmas existentes. Fixture verifies company headers y rechazo de JSON tardío usando fetch fake; no API real.

## 14. Validator contract

Validar argumentos, nombres base de tarballs, identidad exacta, ausencia de paths fuera del staging y checksums; no confiar en un archivo de inventario contradictorio. Artifacts deben provenir del pack propio revisado.

## 15. Module manifest impact

Sin nuevas fuentes en modules/custom. Compiler genera un módulo ficticio en memoria; conserva identidad/PWA/RME3 y comprueba contrato del bundle/ZIP.

## 16. Navigation impact

Sin navegación de producto; comprobar export de renderer/preview y sesión local.

## 17. Blueprint impact

Fixture de TABLE/FORM declarativo o renderer mínimo; no instalar módulos ni blueprints.

## 18. RBAC/permissions

Sin nuevas claves. Fixture no pretende aceptación de permisos ERP.

## 19. Multi-company behavior

SDK fake cambia A→B durante JSON y debe rechazar; fixture sin usuarios/company reales.

## 20. Files/storage impact

Carpetas temporales propias, nuevas y fuera del repo, sin symlinks a fuente. Cleanup acotado a esas carpetas y servidores/procesos propios. Env allowlisted/sin credenciales; npmrc de usuario vacío y scripts de instalación deshabilitados.

## 21. Export/import requirements

Tarballs desde SHA exacto y manifest digests; local registry emula metadata npm necesaria. Frozen consumer usa lockfile generado con aliases npm, sin file/workspace links. No publicar ese lockfile como pin del Hub.

## 22. Audit log requirements

Evidencia sanitizada de tareas y revision, no secretos ni logs de entorno.

## 23. Edge cases

Manifest inválido, checksum alterado, artifact path traversal, aliases divergent, runtime duplicado, export faltante, browser errors, timeout/abort y frozen install que busca fuente o registry privado real.

## 24. Risks

Registro local no prueba permisos GitHub ni artefactos publicados. Dependencias públicas flotantes quedan registradas en lockfile fixture y singletons se fijan a versiones del host; no confundirlo con un upgrade. Construcción puede descubrir imports no declarados: actualizar spec/map antes de corregir paquete y añadir regresión. No iniciar datos/servicios reales.

## 25. Acceptance criteria

1. Consumer instala seis versiones source exactas sin workspace/source sibling o auth.
2. Node contracts y JSX/CSS build y navegador pasan desde node_modules consumer.
3. Aliases lógicos/Atlas resuelven a mismos módulos; React/ReactDOM/Query a una sola implementación.
4. Segunda carpeta limpia con frozen lockfile pasa los mismos contratos.
5. Manifest/tarball inválidos fallan antes de instalar; no mutación de registry/proyecto real.

## 26. Verification plan

Unit tests de validación y servidor; ejecutar pack desde clean SHA y CLI consumer con pnpm/Chrome local; test release policy, privacy/secrets y diff check. Pruebas de registry real permanecen pendientes.

## 27. Rollback plan

Revertir código fixture/CLI/docs; sin datos o packages remotos. Mantener ERP workspace imports.

## 28. Future enhancements

Conectar gate a CI después de autorización para retomar CI; consumo real de GitHub con lectura existente, actualización coordinada Hub, build Docker limpio y runtime peer policy.

