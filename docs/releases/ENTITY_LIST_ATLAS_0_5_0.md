# Candidato de listados y overlays con Atlas 0.5.0

Preparación local, sin push, publicación de paquetes ni despliegue.
Los commits `17da88b41` y `645769f37` ya estaban en main; se conservaron.

Los cinco archivos pendientes estaban limpios. El Combobox enfoca su disparador
antes de abrir el portal, para que WebKit mantenga el origen del foco del modal.
Las rutas generadas reciben `sortBy` y `sortDir`; el servicio usa parámetros
en expresiones CASE por columna, conservando tipos SQL y NULLS LAST. Los nombres
de columnas proceden del contrato validado, nunca de la petición. Sin orden
válido se conserva `entity.list.defaultSort` o la fecha de creación descendente;
el ID resuelve empates. Los campos sin orden SQL no ofrecen controles activos.

Atlas npm 0.5.0 queda fijado en API, desktop y website-blocks. El lock incorpora
su árbol de dependencias y conserva todas las resoluciones previas ajenas.
La instalación frozen, el build web y los builds del runtime público y SSR pasan.
El catálogo y los esquemas de módulos existentes conservan sus identidades.

Validación dirigida:

- Contrato, tres presentaciones (Productos, Facturas y Tickets), normalización,
  compilación, ZIP, inspección, filtros, formatos, etiquetas y colores.
- Rutas HTTP generadas contra PostgreSQL 17 desechable: orden decimal/fecha/texto,
  nulos, filtros, búsqueda, paginación, empresa, baja lógica e intentos de inyección.
  Se reproduce con `RUNLY_LIST_TEST_DATABASE_URL` apuntando a una base local de
  pruebas y `node --test packages/module-compiler/src/__tests__/entity-list-postgres.test.js`.
- Fixture de overlays del Hub con ocho paquetes del ERP en sandbox externo:
  Chromium, Firefox y WebKit × escritorio/tablet/móvil: 9/9, selección real.
- Editor Studio real y renderer del Playground en Chromium: modificar, guardar,
  reabrir y compilar tres listados distintos. Persistencia local del fixture;
  no certifica una sesión autenticada ni persistencia productiva.
- Lint dirigido sin errores; React Doctor informa una advertencia previa de
  exportación no componente en Combobox, sin errores nuevos.

`pnpm check:privacy` sigue fallando por 72 hallazgos previos ajenos a este cambio.
No se modifican esos archivos ni las reglas. Esto impide considerar la revisión
lista para compartir públicamente hasta resolver el gate.

El release se prepara con `pnpm release:shared` desde el commit limpio de esta
entrega. Genera los ocho TGZ, inventarios, SHA-256, integridad SHA-512 y procedencia
del SHA completo: core, module-engine, module-compiler, ui, sdk, preview-runtime,
studio-interchange y website-blocks. Es procedencia de contenido, no atestación
Sigstore. Las versiones Runly siguen `0.1.0-source.<SHA>`; Atlas conserva 0.5.0.

La publicación requiere autorización posterior y el workflow protegido
`shared-packages.yml`, environment `shared-packages`, revisión alcanzable desde
origin/main y variable de publicación habilitada. Después se adopta el manifiesto
publicado desde un Hub limpio con `pnpm shared:adopt --manifest <manifest.json>`.
Ese flujo verifica registro, los ocho paquetes, tres locks, instalaciones frozen
y build antes de escribir. No se adelantan aliases hacia versiones inexistentes.
