# Contrato de relaciones y acceso a datos del runtime declarativo (F1B Stage 4)

Estado: experimental (`RUNLY_SECURE_RUNTIME=experimental`). Implementación: `apps/api/src/secure-runtime/`. Verificación: `scripts/security/verify-relations-contract.mjs` y `verify-declarative-data-compat.mjs` (PostgreSQL real, dos empresas).

## Principio

Un módulo declarativo no recibe tablas ni Prisma. Todo acceso pasa por el Capability Gateway, que deriva empresa, usuario y permisos de la sesión del host. Hay un solo contrato para todas las entidades de Runly; no existe un adaptador por módulo.

## Datos del propio módulo

| Origen | Almacén | Notas |
|---|---|---|
| Módulo convertido desde el Builder | Sus tablas RME3 existentes (`rme3-table-store.js`) | Mismos IDs, sin copia ni segunda fuente de verdad. Borrado lógico con `enabled = false` |
| Módulo declarativo nuevo | Esquema `runly_secure_runtime` (`stores.js`) | Se crea solo con el flag activo. Borrado lógico con `deleted_at` |

Operaciones: `records.query` (paginación, búsqueda, orden, filtros), `records.list`, `records.get`, `records.create`, `records.update`, `records.transition`, `records.delete`, `records.restore`.

- Solo se puede buscar, ordenar o filtrar por campos declarados; el resto se rechaza (422).
- `records.delete` es siempre baja lógica, con permiso `delete` de la entidad. `records.restore` exige ese mismo permiso. La fila nunca se elimina.
- Concurrencia optimista: `expectedVersion` (versión numérica, o `updated_at` en tablas RME3).
- Una fachada REST (`rest-facade.js`) entrega la forma que ya consume la UI compartida (`{ data, pagination }`, filas planas). Los blueprints llevan `apiPath = <entidad>` y `RunlyTable`, `RunlyForm` y `RunlyDetail` se usan sin cambios. Cada petición REST sigue el mismo camino que `/call`: token, permisos, cuota, auditoría.

## Relaciones entre entidades del mismo módulo

`target: "entity:<clave>"`. Se resuelven con el mismo almacén y el mismo filtro de empresa. Un registro eliminado no se resuelve.

## Relaciones con entidades de Runly (contrato extensible)

`target: "external:<tipo>"`, donde `<tipo>` existe en el catálogo `EXTERNAL_RELATION_TARGETS` (`@runly/module-compiler`) y está en la lista revisada `DECLARATIVE_EXTERNAL_TYPES` (`declarative/schema.js`). Hoy: `contact`, `hr_employee`, `inventory_item`. `runly.contacts:contact` (v1) sigue aceptado y equivale a `external:contact`.

Operaciones: `relations.resolve` (por IDs) y `relations.search` (texto, `limit` ≤ 50). Las dos pasan por `createRelationTargetsService`, es decir, por el resolvedor del módulo dueño:

| Control | Quién lo aplica |
|---|---|
| Capacidad `relations.resolve` aprobada por el propietario | Gateway |
| Permiso de lectura del módulo consumidor | Gateway (antes de cuota e idempotencia) |
| Campo declarado como relación externa | Gateway (si no, 422) |
| Módulo de destino instalado, habilitado y activo para la empresa | `host-services.js` (si no, 409 `RELATION_TARGET_UNAVAILABLE`) |
| Permiso del usuario sobre el destino (por ejemplo `hr.employee.read`) | Servicio del módulo dueño, con la identidad del usuario |
| Visibilidad propia del destino (por ejemplo áreas de inventario) | Servicio del módulo dueño |
| Empresa | Servicio del módulo dueño y filtro del host |
| Registro eliminado | Filtro del host con la columna de borrado lógico del catálogo de confianza |
| Campos visibles | Solo `id`, `label` y `subtitle` salen hacia el módulo |

Comportamiento observado (PostgreSQL real):

- `resolve` sin permiso sobre el destino devuelve una lista vacía: no se filtra ni la existencia. `search` sin permiso responde 403.
- Un destino deshabilitado para la empresa o en estado no instalado responde 409.
- Revocar el permiso se aplica en la siguiente llamada.
- Hallazgo corregido en esta fase: el resolvedor de RR.HH. devolvía empleados dados de baja por ID; el host ahora los filtra con el criterio de borrado lógico del catálogo.

## Cómo añadir un tipo

1. Debe existir en `EXTERNAL_RELATION_TARGETS` con su permiso, módulo y columna de borrado lógico.
2. Añadirlo a `DECLARATIVE_EXTERNAL_TYPES` tras revisar que el resolvedor respeta permiso, empresa y visibilidad.
3. Añadir su caso a `verify-relations-contract.mjs`.

Nunca se habilita una tabla arbitraria. Los destinos sensibles (`ledger_account`, `file`) siguen fuera de la lista; la conversión los clasifica como `review`.

## Límites conocidos

- `relations.search` no tiene cursor: solo `limit`. La paginación completa de resultados de relación no existe.
- La verificación del renderer es contractual (peticiones y respuestas que lee `RunlyTable`/`RunlyForm`) y a nivel HTTP. No se probó el renderizado en un navegador contra la fachada.
- Archivos: `files.attach` responde 409 sobre tablas RME3; los adjuntos siguen con las rutas existentes.
