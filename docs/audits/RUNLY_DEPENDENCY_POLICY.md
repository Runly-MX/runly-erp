# Política de dependencias del ecosistema Runly

Fecha: 2026-11-24. Estado: política definida; puerta `pnpm check:deps` activa; aplicada a ERP (los repositorios de Atlas y del Hub no se tocaron).

## 1. Qué se encontró

- 18 especificadores `latest` en 6 manifiestos de ERP (`react`, `react-dom`, `lucide-react`, `vite`, `@vitejs/plugin-react`, `zod`, `zustand`, `@tanstack/react-query`, `postcss`, `autoprefixer`, `@tauri-apps/cli`, `clsx`, `concurrently`).
- `pnpm install --lockfile-only` sobre un commit **sin ningún cambio de manifiesto** reescribía el lockfile (254 líneas añadidas, 227 eliminadas): movía rolldown de 1.2.13 a 1.2.19 y `lucide-react`, entre otros. Cualquier instalación no congelada podía cambiar el bundler y las bibliotecas del mismo commit.
- Incluso con todo congelado, `pnpm install --lockfile-only` no es idempotente: reescribió 12 líneas de la resolución de pares de Excalidraw (`immer` 11.1.8 a 10.2.0) en una ejecución y no en otra. **Regenerar el lockfile entero no es una operación segura en este repositorio.**
- Peers de `@runly/ui` en `latest`; React declarado con rangos distintos por paquete (ver matriz de React).

## 2. Política

| Tipo de paquete | Regla |
|---|---|
| Aplicaciones (`apps/*`) y raíz | Versiones **exactas** para todo lo que afecta al bundle o al entorno de ejecución: React, React DOM, React Query, Vite y su plugin, Zustand, Zod, Lucide, herramientas de build. Nunca `latest`, `*`, `next` ni `canary` |
| Bibliotecas publicables (`packages/*`) | **Rangos de compatibilidad explícitos y acotados** en `peerDependencies` (p. ej. React `>=19.2.5 <20`); versión exacta en `devDependencies` para probar contra una sola versión conocida |
| Excepciones deliberadas | `storefront-sdk` mantiene React 18.3.1 en desarrollo porque se publica para sitios con React 18; se documenta en la matriz |
| Lockfile | Versionado, un único `pnpm-lock.yaml`, instalación de CI siempre con `--frozen-lockfile` |
| Cambios de versión | Pequeños, uno por grupo, con justificación y evidencia (build, pruebas, comparación de bundle). **No** se regenera el lockfile completo: se edita de forma acotada o se revisa cada hunk |
| Actualizaciones de seguridad | Deliberadas y registradas; no llegan por la resolución de `latest` |
| Releases | Identificados por SHA (el Hub ya fija los paquetes de ERP por SHA) |
| `overrides` globales | No se añaden sin revisar las restricciones de cada consumidor |

## 3. Puerta

`pnpm check:deps` (`scripts/check-dependency-policy.mjs`) falla si algún `package.json` versionado declara `latest`, `*`, `next` o `canary` en cualquier campo de dependencias. Es determinista. Estado actual: **OK, 16 manifiestos**.

## 4. Cambios aplicados (cada uno verificado)

| Commit | Cambio | Evidencia |
|---|---|---|
| `df74f17a3` | Congelar los 18 `latest` a lo que el lockfile ya resolvía; peers de `@runly/ui` acotados | Lockfile: solo 18 líneas de especificador; build desde los manifiestos congelados **idéntico byte a byte** al anterior (1486 de 1486 archivos) |
| `3663b8e20` | React y React DOM 19.3.1 en `ui`, `offline` y `preview-runtime` | Solo desaparecen del lockfile las versiones de React 19.2.5, 19.2.7 y 19.3.0 y `scheduler 0.27.0`; ningún otro paquete cambia de versión. JS crítico del login 606 KB frente a 611 KB; 913 pruebas de `packages/*` pasan |

## 5. Lucide: dos versiones en el lockfile

`lucide-react` 1.59.0 (apps y `@runly/ui`) y 1.78.0 (dependencia de Atlas Web Builder). **En el bundle de ERP solo hay una copia (1.59.0)**: `apps/desktop/vite.config.js` fuerza la resolución de `lucide-react` a la copia de la aplicación con un alias. La versión 1.78.0 es un superconjunto estricto de nombres exportados (7235 frente a 6470; cero eliminados o renombrados), así que una futura unificación hacia arriba no rompería identificadores; **no se hace ahora** (sin beneficio medido y con riesgo de cambios visuales en iconos concretos). El shim de módulos RME3 exporta los 6470 nombres de 1.59.0.

## 6. Pendiente

- Hub y Atlas: aplicar la misma política en sus repositorios (el Hub fija paquetes por SHA y Atlas 0.10.0).
- Añadir `engines`/`.nvmrc` para Node.
- Dependencias de pares autoinstaladas (`auto-install-peers`): su resolución cambió entre ejecuciones; evaluar fijarlas.
