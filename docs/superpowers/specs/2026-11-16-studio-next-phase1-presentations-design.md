# Studio Next Fase 1 — Presentaciones

Estado: propuesta, pendiente de aprobación. Base `96c53baac`. Antes de
implementar hace falta el plan en `docs/superpowers/plans/`. Arquitectura,
decisiones D1–D11 y riesgos R1–R10:
[diseño técnico](../../architecture/studio-next-technical-design.md).

## Objetivo

Presentar a pantalla completa cualquier diseño multipágina desde el editor, con
navegación, duración por diapositiva, transición de entrada y reproducción
automática, sin comprometer diseños, exportaciones ni colaboración existentes.

## Fuera de alcance

Animaciones de objeto en la UI (Fase 2), línea de tiempo y keyframes (Fase 3),
exportaciones animadas o PPTX, enlace público, notas del presentador, vista de
presentador en dos pantallas, audio, *wake lock* de pantalla y ajustes de
reproducción guardados en el documento (bucle y reproducción automática son
opciones del reproductor).

## 1. Contrato v8

### 1.1 Campos

Se añade el contrato v8 **completo** del diseño técnico (D3), aunque esta fase
solo edite `page.slide`:

- Página: `slide { duration?, transition? { type, duration, easing } }`.
- Objeto: `enter`, `exit`, `emphasis`, `keyframes`. Se validan y conservan, pero
  ninguna UI de Fase 1 los escribe. MCP y la importación ya pueden traerlos.

Canonicalización: `slide` vacío se omite; `transition.type === 'none'` con
duración 0 se guarda tal cual (es una elección explícita del usuario).

### 1.2 Versión

`validateDocument` emite `schemaVersion: 8` si la entrada es ≥ 8 o el resultado
contiene algún campo v8; si no, `7`. v1–v6 siguen normalizándose a 7. Los campos
v8 no exigen `schemaVersion >= 8` en la entrada.

### 1.3 Archivos del contrato

| Archivo | Cambio |
| --- | --- |
| `packages/studio-interchange/src/studio/motion.js` (nuevo) | `SLIDE_LIMITS`, `MOTION_LIMITS`, `SLIDE_TRANSITIONS`, `ENTER_EXIT_PRESETS`, `EMPHASIS_PRESETS`, `EASINGS`; `validateSlide`, `validateMotion`, `usesV8`; `easing(name, x)`, `transitionAt(transition, progress)`, `slideTimeline(scene)`, `presentationSequence(document)`. Sin `sceneAt` (Fase 2) |
| `packages/studio-interchange/src/studio/document.js` | `STUDIO_SCHEMA_VERSION = 8`; aceptar 8 en `validateScene`; copiar `slide` en la página y `enter`/`exit`/`emphasis`/`keyframes` en el objeto mediante `motion.js`; versión mínima (1.2); límites totales de efectos y keyframes en `validateDocument` |
| `apps/shared/studio/motion.js` (nuevo) | Reexportación de 2 líneas, igual que `document.js` |
| `apps/shared/studio/operations.js` | `PAGE_KEYS += slide`; `OBJECT_KEYS += enter exit emphasis keyframes` |
| `apps/shared/studio/protocol.js` | `STUDIO_PROTOCOL_VERSION = 4`; `STUDIO_MIN_CLIENT_PROTOCOL = 3` |
| `packages/studio-interchange/src/write.js` | Si el documento usa campos v8: proyectar a v7 sin esos campos y añadir una pérdida legible («Se omitieron duraciones, transiciones y animaciones: el paquete portable v1 no las admite»). `formatVersion` sigue en 1 |
| `packages/studio-interchange/src/index.js` y `package.json` `exports` | Exponer `./studio/motion` |

`addPage` del adaptador no copia `slide` (una página nueva empieza con valores
por defecto); `duplicatePage` sí lo conserva porque clona `page`. Ambos
comportamientos son los deseados y quedan cubiertos por pruebas.

## 2. API y SQL

| Archivo | Cambio |
| --- | --- |
| `apps/api/src/routes/studio/index.js` | `/studio/protocol` devuelve `STUDIO_SCHEMA_VERSION` (hoy el literal 7). Los middlewares de `PUT` y `POST .../changes` aceptan cabecera `3` o `4`, rechazan cualquier otra con 426 y pasan el número al servicio |
| `apps/api/src/routes/studio/studio-service.js` | Los tres `set_config('runly.studio.protocol', …)` usan la constante 4. En `update` y `applyChanges`, después de bloquear la fila: si el cliente es 3 y la versión almacenada o la resultante es ≥ 8, lanzar `StudioError(…, 426, 'STUDIO_UPGRADE_REQUIRED')` |
| `apps/api/src/routes/studio/studio-templates-service.js` | Los dos `set_config` usan la constante; el mismo chequeo por cliente |
| `apps/api/src/routes/studio/studio-application.js` | `protocolVersion` desde la constante; el contrato expone `SLIDE_LIMITS` y las listas de transiciones |
| `prisma/migrations/<timestamp>_studio_v8_protocol/migration.sql` (nuevo; timestamp posterior a la última migración existente al implementar, porque otras sesiones siguen creando migraciones) | `CREATE OR REPLACE FUNCTION runly_studio.require_document_protocol()`: v ≥ 8 exige `'4'`; v7 admite `'3'` o `'4'`; v6 admite `'2'`, `'3'` o `'4'`; bajadas denegadas. Los triggers existentes no cambian |
| `packages/sdk/src/domains/studio.js` | Hoy envía el literal `'X-Runly-Studio-Protocol': '3'` en toda escritura. Pasa a `'4'`; si el SDK no puede importar `apps/shared`, se fija el literal y una prueba compara ambos valores |

No hay endpoints nuevos. Presentar es solo lectura y usa el documento que el
editor ya tiene sincronizado.

## 3. Interfaz

### 3.1 Componentes reutilizados

`StudioTopBar` (acción), panel lateral de página (`StudioWorkspace` sección
`page`, junto a `PageSettingsForm`), `editor.updatePage(id, set)`,
`editor.flush()`, `editor.exportPage(…)`, `editor.activePageId()`,
`documentPages`, y de `@runly/ui`: `Button`, `ToolButton`, `SelectField`,
`Slider` o `Input` numérico, `Tooltip`, `useIsMobile`, `cn`. Iconos Lucide
(`Play`, `Pause`, `ChevronLeft`, `ChevronRight`, `X`, `Repeat`).

### 3.2 Componentes nuevos

Directorio `apps/desktop/src/modules/runly.studio/components/present/`:

| Archivo | Responsabilidad | Tamaño previsto |
| --- | --- | --- |
| `PresentationOverlay.jsx` | Capa propia; `requestFullscreen` con respaldo `fixed inset-0 z-[60]`; diapositiva centrada con *letterbox* según la relación de aspecto de cada página; dos capas para la transición; controles que se ocultan tras 2,5 s sin actividad y reaparecen con el foco o el puntero; contador «3 / 8»; barra de progreso cuando la reproducción automática está activa | < 250 |
| `usePresentation.js` | Estado: índice, reproduciendo, bucle, progreso. Temporizador con `t = ahora − inicio` (sin deriva) y pausa que conserva el tiempo transcurrido; `next`, `prev`, `goTo`, `toggle`. Al terminar sin bucle se detiene en la última diapositiva | < 150 |
| `../../lib/slide-frames.js` | `createSlideFrames({ editor, document, viewport })`: rasteriza con `exportPage(id, 'png', 1, document, {scale, signal})` donde `scale = min(1, viewport/página) × devicePixelRatio` (tope 2), LRU de 3 blobs con object URLs revocadas, precarga de anterior y siguiente, cancelación con `AbortController` y `destroy()` | < 120 |

Directorio `components/editor/pages/`:

| Archivo | Responsabilidad |
| --- | --- |
| `SlideSettings.jsx` (nuevo) | Sección «Diapositiva» en el panel de página: duración en segundos (0,5–600, paso 0,5), transición (`SelectField`: Ninguna, Fundido, Deslizar ←/→/↑/↓, Zoom), duración de la transición (0–3 s) y «Aplicar a todas». Cada cambio confirmado es un único `updatePage`; «Aplicar a todas» es un solo lote (un paso de historial). Deshabilitado en solo lectura |

### 3.3 Integración en archivos existentes

| Archivo | Cambio |
| --- | --- |
| `components/editor/StudioTopBar.jsx` | Prop `onPresent`; botón «Presentar» (`Play`) en escritorio, junto a Compartir; entrada en el menú de teléfono |
| `components/StudioWorkspace.jsx` (425 líneas) | Estado `presenting`; `onPresent` hace `await editor.flush()`, toma la instantánea y monta `PresentationOverlay` con la página activa como inicio; añade `SlideSettings` a la sección `page`. Atajo `F5`/`Ctrl+Enter` = Presentar, limitado a la región del editor como los demás. Los atajos del editor se desactivan mientras se presenta |
| `apps/api/src/manifests/official/help/runly.studio` | Artículo «Presentar un diseño» |

### 3.4 Comportamiento del reproductor

- Teclado: `→`, `Espacio`, `PageDown`, `Enter` = siguiente; `←`, `PageUp`,
  `Retroceso` = anterior; `Inicio`/`Fin`; `K` = reproducir o pausar; `L` = bucle;
  `Esc` = salir (y al salir de pantalla completa nativa, se cierra el overlay).
- Puntero: clic en la mitad derecha avanza y en la izquierda retrocede; los
  controles no propagan el clic.
- Toque: deslizar horizontalmente más de 48 px cambia de diapositiva; tocar
  muestra los controles.
- Reproducción automática: desactivada al abrir, cada diapositiva dura
  `slide.duration ?? 5000`. Interactuar manualmente reinicia el tiempo de la
  diapositiva actual sin pausar.
- Transición: la de la diapositiva de llegada, compuesta con `transitionAt`; al
  retroceder se usa la misma transición invertida. Con
  `prefers-reduced-motion: reduce`, corte directo.
- Diapositiva no lista: se muestra la miniatura existente o un esqueleto y no se
  avanza automáticamente hasta tener el fotograma. Un error de imagen no cierra el
  reproductor: muestra la diapositiva con el aviso del editor y permite continuar.
- Cambios remotos durante la presentación: el reproductor sigue con la
  instantánea; un aviso discreto «El diseño cambió» ofrece actualizar, lo que
  invalida la caché de fotogramas.
- Página eliminada por otro colaborador mientras se presenta: sigue visible en la
  instantánea hasta actualizar.
- Accesibilidad: `role="dialog"`, `aria-modal`, `aria-label` con el nombre del
  diseño, región `aria-live="polite"` con «Diapositiva n de m», foco atrapado y
  devuelto al botón Presentar al salir, controles accesibles por teclado.

## 4. Pruebas mínimas

| Archivo | Casos |
| --- | --- |
| `apps/shared/studio/motion.test.js` (nuevo) | `validateSlide`: límites y valores desconocidos rechazados; `validateMotion`: presets, rangos, `delay + duration ≤ slide`, keyframes crecientes y propiedades permitidas; `easing` en 0, 0,5 y 1 para cada curva; `transitionAt` en 0 y 1 para cada tipo; `presentationSequence` con duraciones por defecto |
| `apps/shared/studio/document.test.js` | v7 sin campos v8 → 7; con `slide` → 8; v8 sin campos → 8 (monótono); v1–v6 → 7; objeto con `enter` se conserva tras validar; los totales de efectos y keyframes se respetan |
| `apps/shared/studio/operations.test.js` | `diffOps`/`applyOps` con `slide`; `patch` de `enter` y `exit` concurrentes en el mismo objeto convergen; `checkOps` acepta las claves nuevas y rechaza otras; `duplicatePage` conserva `slide` |
| `packages/studio-interchange/src/__tests__/interchange.test.js` | Diseño v7: paquete idéntico al actual; diseño v8: paquete v7 sin los campos y con la pérdida declarada |
| `apps/api/src/routes/studio/studio-routes.test.js` | Cabecera 3 sobre v7 = 200; 3 que convierte a v8 = 426; 3 sobre v8 = 426; 4 = 200; cabecera 2 = 426 |
| `apps/api/src/routes/studio/studio-postgres.test.js` | Trigger nuevo en PostgreSQL desechable: protocolo `'3'` sobre v8 denegado; `'4'` sobre v7 permitido; bajada 8→7 denegada |
| `apps/desktop/.../components/present/usePresentation.test.js` (nuevo, lógica pura extraída si hace falta) | Avance automático con reloj falso; pausa y reanudación sin deriva; bucle; final sin bucle |
| `.e2e/studio-present-ui.mjs` (nuevo, Playwright, empresa de pruebas local) | Crear diseño de 3 páginas, fijar duración y transición, reabrir, presentar, navegar con teclado, reproducción automática, salir con Esc; segunda sesión recibe los ajustes; teléfono con deslizamiento; `reducedMotion: 'reduce'` |

Regresión dirigida, no global: `node --test apps/shared/studio/` y
`packages/studio-interchange/src/__tests__/`, más las pruebas de rutas y del
servicio Postgres de Studio. Luego `pnpm --filter ./apps/desktop build:web` una
vez al final.

## 5. Secuencia de implementación

1. `motion.js` con validadores y funciones puras, más sus pruebas.
2. `document.js` con v8 y versión mínima; pruebas de documento.
3. `operations.js` con las claves nuevas; pruebas de operaciones.
4. Proyección en `write.js`; pruebas del paquete.
5. Protocolo 4: constantes, middlewares, chequeo en el servicio y los templates,
   `/studio/protocol`, contrato; pruebas de rutas.
6. Migración del trigger y su prueba en PostgreSQL desechable. **Aplicarla a la
   base local requiere autorización.**
7. `SlideSettings.jsx` e integración en el panel de página.
8. `slide-frames.js`, `usePresentation.js` y `PresentationOverlay.jsx`.
9. Botón en `StudioTopBar` y montaje en `StudioWorkspace`; atajos.
10. Artículo de ayuda.
11. E2E de navegador en escritorio y teléfono, dos sesiones; build web; privacidad.

Commits por bloque verificado (1–4 contrato, 5–6 API/SQL, 7–9 UI, 10–11 cierre).

## 6. Criterios de aceptación

- [ ] Un diseño de 3 o más páginas se presenta a pantalla completa desde el
  editor, empezando por la página activa, y se navega con teclado, clic y toque.
- [ ] La reproducción automática respeta la duración de cada diapositiva; pausa,
  reanudación y bucle funcionan sin deriva perceptible (menos de 100 ms por
  diapositiva).
- [ ] Las transiciones Ninguna, Fundido, Deslizar ×4 y Zoom se ven al avanzar, en
  sentido inverso al retroceder, y como corte con movimiento reducido.
- [ ] Duración y transición se guardan, sincronizan en vivo a otra sesión, se
  deshacen con un solo paso y se conservan al reabrir y al duplicar la página.
- [ ] Un diseño sin ajustes de diapositiva conserva `schemaVersion: 7` tras
  editarse; al fijar una duración pasa a 8 y no vuelve a 7.
- [ ] Un cliente de protocolo 3 sigue editando diseños v7 y recibe 426 con el
  borrador conservado sobre un diseño v8.
- [ ] Los campos `enter`, `exit`, `emphasis` y `keyframes` escritos por MCP
  sobreviven a una edición desde la UI de Fase 1.
- [ ] PNG, JPG, PDF, ZPL, creación masiva y plantillas sin cambios; el paquete
  `.runlystudio` de un diseño v8 se exporta como v1 con la pérdida declarada y
  Developer Hub lo acepta.
- [ ] Colaboradores de solo lectura pueden presentar pero no cambiar ajustes.
- [ ] Sin errores de consola; foco y lector de pantalla correctos; ningún archivo
  supera 1000 líneas; `pnpm check:privacy` sin hallazgos.
