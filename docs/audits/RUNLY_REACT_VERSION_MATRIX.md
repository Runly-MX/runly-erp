# Matriz de versiones de React

Fecha: 2026-11-24. Estado: unificación aplicada en ERP (`82c7ff827`); Hub y Atlas no se tocaron.

## 1. Situación encontrada

| Paquete (ERP) | Declaración | Resuelto en el lockfile |
|---|---|---|
| `apps/desktop` | `react`, `react-dom`: `latest` | 19.3.1 |
| `apps/api` | `latest` | 19.3.1 |
| `packages/ui` | devDependencies `^19.2.5`; peer `latest` | 19.2.5 |
| `packages/offline` | dev y peer `^19.0.0` | 19.2.7 |
| `packages/preview-runtime` | solo peer `>=19 <20` (autoinstalado) | 19.3.0 |
| `packages/website-blocks` | peer `>=18` | 19.3.1 |
| `packages/storefront-sdk` | dev `^18.3.1`; peer `>=18` | 18.3.1 |

El lockfile tenía por tanto 19.2.5, 19.2.7, 19.3.0, 19.3.1 y 18.3.1. Causas: dos aplicaciones con `latest` (versión no fijada: depende del día en que se resolvió), tres paquetes con rangos distintos y un paquete sin dependencia de desarrollo propia que `pnpm` autoinstaló al azar del rango.

## 2. Qué instancias de React hay realmente en un mismo contexto

| Contexto de ejecución | Copias de React | Evidencia |
|---|---|---|
| ERP web (navegador) | **Una**: 19.3.1 | `resolve.dedupe: react, react-dom` en `apps/desktop/vite.config.js` fuerza una sola copia aunque `@runly/ui` resolviera otra. En el build limpio, `react.production.js` aparece en un solo chunk |
| Módulos RME3 en ERP | La del ERP | Usan los shims `ext-react*` que reexportan el React de la aplicación |
| Runtime público de Website (esbuild, `build-website-public-runtime.mjs`) | Una: 19.3.1 (se construye desde `apps/desktop`) | Medición de la composición del bundle: `react-dom` 205 KB y `react` 8 KB, una sola vez |
| SSR de Website (API) | 19.3.1 | La API declaraba `latest` y resolvía 19.3.1; coincide con el cliente publicado |
| Hub (vista previa) | Su propio React (`preview-runtime` pide 19.x) | Contexto aislado de ERP; no se modificó |
| Atlas | Peer `>=18.0.0`, sin copia propia | Sus pruebas cubren consumidores React 18 y 19 |
| `storefront-sdk` | 18.3.1 en pruebas, a propósito | Es un SDK que se publica para sitios con React 18; conservar su objetivo de prueba |

## 3. Decisión

**React y React DOM 19.3.1 exactos** en `apps/desktop`, `apps/api`, `packages/ui` (desarrollo), `packages/offline` (desarrollo) y `packages/preview-runtime` (nueva dependencia de desarrollo); en `@runly/ui` el peer pasa de `latest` a `>=19.2.5 <20`.

Por qué 19.3.1 y no «la mayor» ni la menor:
- Es la versión que ya ejecutan en producción la aplicación, la API (SSR) y el runtime público; bajar a 19.2.x cambiaría el comportamiento de lo que se entrega, y la hidratación de sitios publicados debe coincidir con el SSR.
- No hay una restricción de contrato que la excluya: todos los peers del ecosistema aceptan 19.x (`>=18`, `>=19 <20`, `^19`).
- No se eligió por ser la mayor: se eligió por ser la que el código entregado ya usa.

Verificación sobre la unificación: instalación limpia con `--frozen-lockfile`, build web (chunks equivalentes al anterior, mismo tamaño total dentro de la variación de nombres), 724 pruebas de `packages/*` (722 pasan, 0 fallan, 2 omitidas) y el smoke autenticado de 12 pantallas sin errores nuevos.

No verificado: Hub con React 19.3.1 (su propio árbol), módulos RME3 de terceros ya compilados contra una versión distinta, SSR e hidratación de un sitio publicado de extremo a extremo (solo cubiertos por las pruebas existentes), y colaboración/llamadas en navegador.

## 4. Por qué `editor-vendor` produjo el problema (documentado)

Experimento descartado (`239c62962`): un grupo manual `editor-vendor` (`@tiptap`, `prosemirror-*`, `yjs`, `y-*`, `lib0`) en `manualChunks`. Resultado medido en el build:

- El **React core, `jsx-runtime` y `react-dom` principal quedaron emitidos dentro de `editor-vendor`**, y no en `react-vendor`, a pesar de que la regla de `react-vendor` va antes en la función. El chunk `react-vendor` conservó `react-dom/client`, `react-router` y `scheduler`.
- Como casi cualquier chunk usa React, **554 chunks importaban `editor-vendor`** (185 KB de edición de texto) y el login volvía a descargarlo.
- **Corrección a lo dicho antes:** no era una segunda copia de React (la cadena `react.transitional.element` también aparece en `react-dom/client` y en `react-is`, por lo que no prueba duplicación). Era la **misma copia ubicada en el chunk equivocado**.
- La causa de fondo no está aislada: Rolldown agrupa módulos CommonJS envueltos (`react`, `react-dom`) por el grafo de dependencias de los grupos antes que por el patrón de ruta de `manualChunks`. Los módulos `@tiptap/react` dependen de `react`/`react-dom` y arrastraron su ubicación. Se resolvió **no agrupar** tiptap en `manualChunks`; hasta que se entienda la causa, no se reintroduce ningún grupo manual para editores (el comentario queda en `vite.config.js`).

## 5. Pendiente

- Alinear el Hub (React de `preview-runtime`, Atlas 0.10.0 a 0.11.0).
- Decidir si `@runly/ui` debe declarar React como peer sin dependencia de desarrollo propia en el Hub.
- Probar un módulo RME3 compilado antes del cambio contra el ERP nuevo (compatibilidad de shims).
