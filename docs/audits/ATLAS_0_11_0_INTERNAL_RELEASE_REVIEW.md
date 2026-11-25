# Atlas Web Builder 0.11.0: revisión interna de release

Resultado: **APTO CON CONDICIONES.** Esto resuelve el bloqueo de `0ff88dc90` desde el lado del código de Atlas; las condiciones son de orden de publicación y de seguimiento, no defectos de Atlas. No se modificó el repositorio de Atlas ni la lista de versiones revisadas de ERP como sustituto de esta revisión.

Revisor: la misma sesión que mantiene ERP, con acceso al repositorio fuente de Atlas (somos responsables de ambos). Fecha: 2026-11-24.

## 1. Procedencia (verificada)

| Elemento | Valor |
|---|---|
| Repositorio Atlas | `atlas-web-builder`, rama `main`, commit `c08de3e`, workspace limpio, sin commits posteriores al tag |
| Tag | `v0.11.0` apunta al mismo commit |
| Paquete consumido por ERP | `@raulbellosom/atlas-web-builder@0.11.0` (`apps/desktop/package.json`, overrides de `package.json`, `pnpm-lock.yaml`) |
| Reconstrucción | Worktree aislado en `v0.11.0`, `pnpm install --frozen-lockfile`, `pnpm build` |
| **Resultado** | `dist/atlas-web-builder.js`, `.cjs` y `style.css` **idénticos byte a byte (SHA-256)** a los del paquete instalado por ERP (476 336 / 345 590 / 82 488 bytes) |

El paquete instalado desde el lockfile y el código fuente corresponden. No se pudo verificar sin red que el registro sirva exactamente ese artefacto hoy (se comparó el instalado, con la integridad `sha512` del lockfile, no una descarga nueva).

## 2. Alcance real del cambio (0.10.0 a 0.11.0)

15 archivos, +268/-45 líneas: `AudioBlock` nuevo, `VideoBlock.file`, campos `video`/`audio` (`MediaField`), selector de biblioteca por tipo y `blob:` admitido como URL de medios. Sin cambios de dependencias (solo la versión). El resto del paquete (sanitización, efectos, formularios, comercio) es el de 0.10.0, ya adoptado.

## 3. Seguridad

Pruebas propias de Atlas en `v0.11.0`: **53 archivos, 327 pruebas, todas pasan.** Pruebas de ERP sobre la integración 0.11.0: `website-av-install` y `studio-interchange website-av` 9/9; la prueba «published Atlas renders responsive geometry in the real ERP public runtime and SSR» pasa en HEAD (en el baseline fallaba, probablemente por la versión resuelta; ver consolidación §3).

| Área | Hallazgo |
|---|---|
| Sumideros HTML | Solo dos `dangerouslySetInnerHTML` en todo `src/`: `SafeRichText` (DOMPurify con lista cerrada `b i em strong u a br p ul ol li span`, atributos `href title target rel`, sin `style` ni `data-*`; en SSR cae a texto sin etiquetas) y `EffectsWrapper` (`<style>` de hover/pressed) |
| `EffectsWrapper` | Cada valor que entra al CSS pasa por una función de saneamiento con listas cerradas o rangos numéricos (`sanitizeHover`, `sanitizePressed`, `sanitizeKenBurns`, `sanitizeParallax`, `sanitizeFilter`, `sanitizeTransform`); el identificador del bloque se escapa. Un documento manipulado no puede cerrar la etiqueta `<style>` |
| `eval`, `new Function`, `document.write`, `javascript:` como destino, `postMessage`, `window.open`, `srcDoc` | Ninguno en el código de Atlas |
| Red y almacenamiento | Atlas no usa `fetch`, XHR, WebSocket ni cookies. El único almacenamiento es el adaptador opcional de carrito (`localStorageAdapter`) que el host elige |
| CSS personalizado | No existe (no hay campo de CSS libre) |
| URLs | Cada bloque valida con lista de protocolos: medios `https?: / blob:`; enlaces `https?: mailto: tel: / #`; `data:image/` solo para imágenes de tarjeta |
| Nuevo en 0.11.0 | `AudioBlock` y `VideoBlock.file` solo reproducen con `<audio>`/`<video>` nativo y `src` validado; nunca como embed. El póster pasa la misma validación |
| Formularios, comercio y sesiones de cliente | **No viven en Atlas**: son bloques y servicios de ERP (`packages/website-blocks`, `services/external-identity`). Se revisaron en F1A/F1B y en el análisis de cookies de la consolidación; no son parte del 0.11.0 |

Observaciones de endurecimiento (sin explotación conocida, sin cambio de código):
1. La expresión `^(https?:|\/|blob:)` también acepta `//host/...` (URL relativa al protocolo). Para `src` de audio/video equivale a una URL externa, que ya se permite con `https:`; no ejecuta código. Se anota para endurecer cuando se toque ese archivo.
2. Un `blob:` en un documento publicado no resuelve para los visitantes (es una URL de la sesión del editor): es inocuo pero mostraría un reproductor roto. Una búsqueda en `apps/api/src` no encontró ninguna referencia a `blob:`: **no hay rechazo explícito** en la API; los campos de audio y video se resuelven desde `asset:<sha>` de la biblioteca en la importación de plantillas, pero no se probó el caso de un documento con `blob:` guardado a mano.
3. Los tipos de archivo que acepta el cliente (`image|video|audio`) no son un control de seguridad; la validación real de MIME, tamaño y contenido es del servidor de ERP. No se re-auditó en esta revisión.

## 4. Compatibilidad

| Contrato | Resultado |
|---|---|
| ERP: catálogo 0.11.0 | Registrado (`builder-catalogs/0.11.0.json` y `0.11.0-erp.json`). Los 30 bloques base de Atlas coinciden con el catálogo en tipo y campos; la única diferencia aparente (`vector` en `ImageBlock`) es una propiedad por defecto, no un campo. `ComponentRefBlock` solo existe en Atlas por diseño (no entra en `baseBlocks`) |
| Plantillas anteriores | Las pruebas de ERP «Atlas catalogs preserve old ZIPs...» pasan en HEAD |
| SSR, hidratación y responsive | Cubiertos por las pruebas de Atlas y por la prueba de ERP citada |
| **Developer Hub** | **Desalineado:** el Hub fija `@raulbellosom/atlas-web-builder@0.10.0` y paquetes de ERP del SHA `fd16dc513`. No conoce `AudioBlock` ni los campos `audio`/`video`. Condición 1 |

No se ejecutó el barrido de navegador de Atlas (`verify-phase2-browser`, `verify-motion-responsive`, matriz Chromium/WebKit) en esta sesión: condición 4.

## 5. Distribución y rendimiento

| Aspecto | Hallazgo |
|---|---|
| Exports | `.`, `./styles`, `./package.json`; un solo ESM (476 KB sin comprimir) más CJS; **no hay entrada separada para el renderer público** |
| `sideEffects` | `["**/*.css"]`: correcto; no se conoce inicialización por importación |
| Peer deps | `react` y `react-dom` `>=18.0.0` (rango muy ancho; ver la matriz de React) |
| Dependencias | `@dnd-kit/*`, 4 paquetes Radix, `clsx`, `dompurify`, `immer`, `lucide-react` (registro de 49 iconos), `nanoid`, `zundo`, `zustand` |
| ERP no descarga Atlas sin usar Website | **Verificado:** tras F3.2, `atlas-web-builder` y `runlyBlocks` no están en el cierre estático de `AppEntry`, `AuthenticatedShell` ni `HomeScreen` |
| Runtime público construido por ERP (`build-website-public-runtime.mjs`) | `entry.js` **1.14 MB / 329 KB gzip**. Composición: `packages/website-blocks` (ERP) 611 KB, `react-dom` 205 KB, **Atlas 166 KB**, DOMPurify 29 KB, lucide 15 KB. No incluye `zundo` pero **arrastra ~35 KB de dependencias de editor** (`@dnd-kit/core` 11 KB, Radix tooltip/popper/dismissable-layer, floating-ui). El peso dominante es el paquete de bloques de ERP, no Atlas |

## 6. Condiciones para publicar con 0.11.0

1. **Orden coordinado:** Hub antes que cualquier exportación de plantillas con audio o video. El Hub debe subir a `0.11.0`, registrar los catálogos 0.11.0 y reanclar sus paquetes de ERP al SHA publicado. Sin eso rechazará o degradará documentos con `AudioBlock`.
2. Comprobar que la validación de publicación de ERP rechaza `blob:` y URLs no permitidas en `file` de audio/video (observación 2).
3. Seguimiento de rendimiento (no bloquea): separar el renderer público de Atlas del editor con una entrada propia y aligerar `website-blocks`.
4. Ejecutar el barrido de navegador de Atlas (Chromium/WebKit) antes de publicar; no se hizo aquí.
5. Mantener el aviso del propio Atlas: el catálogo cambia y hay que registrarlo en el host antes de adoptar la versión (ERP ya lo hizo; falta el Hub).

## 7. Qué cambia en el bloqueo

`0ff88dc90` deja de ser un bloqueador sin evidencia: la versión consumida corresponde al código fuente y no se encontraron defectos de seguridad en lo nuevo. Quedan **condiciones de publicación** (1, 2 y 4), que pasan a la lista de aceptación F1C. No se requiere una nueva versión de Atlas.
