# Informe de reproducibilidad de builds

Fecha: 2026-11-24. SHA de los builds de verificación: `ca2d41e21` (código de la web) más el arreglo `2228fda0d`.

## 1. Resultado

| Pregunta | Respuesta |
|---|---|
| Dos instalaciones limpias independientes del mismo SHA, ¿producen el mismo build? | **Sí: categoría A, idéntico byte a byte** (1486 archivos, SHA-256 iguales) |
| ¿Por qué el mismo commit y lockfile daban cifras distintas? | **Causa raíz identificada: el `.env` de la raíz del repositorio contiene `NODE_ENV=development`**, y Vite lo lee (`envDir` es la raíz). Con él, el build empaqueta la versión de **desarrollo** de Excalidraw (`dev.js`) y reparte los chunks de otra forma |
| Efecto medido | +3.1 MB de JS sin comprimir (37 812 KB frente a 34 712 KB) y, en la ruta crítica del login, 687 KB frente a 611 KB |
| ¿Afectaba a las imágenes de producción? | **No.** `.dockerignore` excluye `.env` y el Dockerfile pasa los `VITE_*` como argumentos; el build de Docker equivale a «sin `.env`» |
| Arreglo | `apps/desktop/scripts/build-web.mjs` (`2228fda0d`): `build:web` lanza Vite con `NODE_ENV=production`. Verificado: con el mismo `.env`, 34 713 KB y chunks `prod` (idéntico a sin `.env`) |

Clasificación del conjunto: **A** para el mismo entorno de entrada; **B** (funcionalmente equivalente, diferencias explicables) entre `VITE_*` sin definir y definidos como cadenas vacías (los hash de archivo cambian, el contenido medido es el mismo: 611 KB de JS crítico en ambos); **C** no queda ninguna diferencia sin explicar entre los builds comparados, pero **algunas cifras históricas no se pueden atribuir con certeza** (ver §4).

## 2. Entorno comparado

| Elemento | Valor (todos los árboles de la comparación) |
|---|---|
| Lockfile | `pnpm-lock.yaml` SHA-256 `d13a9d13706d146a...` en el control, en los árboles limpios y en el candidato |
| Node / pnpm | 22.23.3 / 9.15.0 (`packageManager: pnpm@9.15.0`; no hay `engines` ni `.nvmrc`) |
| Sistema | Windows 11 x64 |
| Instalación | `pnpm install --frozen-lockfile --offline --ignore-scripts` |
| Vite | 8.3.4 (bundler Rolldown de Vite 8); `react` y `react-dom` 19.3.1 en `apps/desktop`; `lucide-react` 1.59.0 visible desde `@runly/ui` |
| Inventario `node_modules/.pnpm` | 1488 entradas, **idéntico** entre las instalaciones limpias nuevas, el árbol `fresh` y el árbol de control |
| Compresión usada al medir | gzip nivel 6 en el servidor de laboratorio (transferencia) y nivel 9 en el inventario de chunks; no son comparables entre sí |

El árbol de trabajo `headwt` **no era limpio**: tenía 86 paquetes extra en `node_modules/.pnpm` (restos del experimento de React revertido) frente a los 1488 de una instalación limpia.

## 3. Evidencia

| Comparación (mismo SHA `ca2d41e21`) | Resultado |
|---|---|
| Instalación limpia A frente a instalación limpia B | 1486 de 1486 archivos idénticos |
| Sin `.env` frente a `VITE_*` vacíos como en Docker | 1125 de 1846 nombres iguales (cambian hashes); 611 KB de JS crítico en ambos |
| Sin `.env` frente a con `.env` (`NODE_ENV=development`) | 34 712 frente a 37 812 KB sin comprimir; aparece `dev.js` de Excalidraw; 611 frente a 687 KB crítico |
| Con `.env` usando el nuevo `build:web` | 34 713 KB y chunks `prod` |
| Control `119eac8e9` construido dos veces sin `.env` | Idéntico entre sí (992 de 992 archivos) |
| Control `119eac8e9` con `.env` (árbol `fresh`) | 10 612 KB gzip total y 2398 KB de JS en el login, frente a 10 167 KB y 2207 KB sin `.env` |

Mecanismo no demostrado: por qué un `NODE_ENV=development` mueve además el reparto de chunks de React más allá de elegir las compilaciones de desarrollo. La corrección elimina la causa sin necesidad de entenderlo del todo.

## 4. Trazabilidad de las cifras históricas

Las cifras anteriores **no se modifican**; se explican:

| Cifra | Origen | Explicación |
|---|---|---|
| 2.4 MB de JS en F3.0 (Excalidraw `dev/`) | Build en el repositorio principal | **El hallazgo «Excalidraw usa `dist/dev/` en producción» era consecuencia del `.env` local**, no un defecto de la imagen de producción |
| 2207 KB control (A/B de F3.1 y F3.2) | Árbol de control sin `.env` | Correcta para un build sin `.env` (igual a Docker) |
| 2398 KB control de la sección 8 de F3.2 | Árbol `fresh` con `.env` | Inflada por el `.env` |
| 769 / 845 / 687 KB candidato | Árbol `headwt` (86 paquetes extra) y `fresh`; con `.env` en varios casos | Mezclan entorno contaminado y `.env`; **los números del A/B de 5 ejecuciones de F3.2 (769 KB) se midieron en un árbol que ya no se puede reconstruir** |
| **611 KB candidato** | `rb1`, instalación limpia, sin `.env`, SHA `ca2d41e21` | **Cifra de referencia actual**; equivale a un build de Docker |

Consecuencia: la reducción del JS crítico del login frente al control, en condiciones equivalentes a producción, es **2207 a 611 KB (-72 %)**, no la del informe anterior. Los A/B de 5 ejecuciones de F3.1 y F3.2 siguen siendo válidos como comparaciones relativas (ambos lados en el mismo entorno), pero sus valores absolutos deben leerse con el margen descrito. Hay que repetirlos con el candidato actual.

## 5. Recomendaciones y puertas

1. Medir y comparar siempre desde árboles limpios y sin `.env`, y anotar la huella (lockfile, inventario de `.pnpm`, variables `VITE_*`).
2. Puerta de CI: el build web no debe contener `dev-*.js` de Excalidraw ni `react-dom.development`; comparar el inventario de chunks con un presupuesto.
3. Añadir `engines` o `.nvmrc` para Node; hoy solo está fijado `pnpm`.
4. La política de `latest` (que mueve rolldown y `lucide-react` en cada instalación no congelada) se trata en el informe de política de dependencias.

## 6. Pendiente

- Repetir el A/B de 5 ejecuciones con el candidato actual en un árbol limpio.
- Averiguar si la diferencia entre `VITE_*` sin definir y vacíos tiene algún efecto funcional.
- Comprobar `react-dom.development` en builds con `.env` (no verificado).
