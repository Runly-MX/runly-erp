# Studio Next Fase 2 — motor de animación (plan)

Base: `9e803d2c1` (cierre técnico de Fase 1). Fuentes:
[diseño técnico](../../architecture/studio-next-technical-design.md) (D3–D6),
[hoja de ruta](../../architecture/studio-next-implementation-roadmap.md), spec y plan de
Fase 1. Aprobado por el usuario el 2026-11-16, incluido el recorte temporal sin alterar
datos. Sin línea de tiempo con pistas, keyframes gráficos ni exportadores (Fase 3/4).

## Correspondencia con el código

| Necesidad | Código existente | Decisión |
| --- | --- | --- |
| Contrato | `motion.js` ya valida `enter`/`exit`/`emphasis`/`keyframes` (Fase 1) | Sin cambios de contrato; solo evaluación |
| Actualizar objetos sin reconstruir | `applyDocument` → `setItem` en sitio cuando `inPlace` | Nuevo `renderFrame(scene)` en el editor de página: posición/ángulo/opacidad/visibilidad directas; `setItem` solo si cambia el tamaño. Sin validación, historial, eventos ni sincronización |
| Renderer aislado | `renderPage` crea un editor de página de solo lectura auxiliar | Nuevo `editor.createPlayer(element, pageId, document)` con la autorización de imágenes del editor |
| Guardar efectos | `editor.patch` (fusiona y valida; rechaza objetos bloqueados) y `patchMany` en el workspace | La UI usa `patch` (un paso de historial) y `patchMany` para grupos |
| Reproductor | `usePresentation` + `slide-frames` (Fase 1) | Diapositivas sin efectos de objeto siguen con imagen; con efectos usan el reproductor vivo |

## Reglas de evaluación (`sceneAt(document, pageId, t, {reducedMotion})`)

- Devuelve `{page, objects}` estático: mismos objetos y orden, sin campos de animación,
  números redondeados a 1e-4. Nunca muta el documento. Mismo documento y `t` ⇒ mismo JSON.
- `t` se recorta a `[0, duración de la diapositiva]`; los datos no cambian.
- Geometría del contrato: `x,y` esquina superior izquierda, rotación en grados alrededor de
  esa esquina. Tamaño visual = `width × scaleX` (texto, línea) o `width`.
- Orden: base → keyframes (x, y, rotation, opacity absolutos; scale multiplicador) →
  entrada → énfasis → salida. Desplazamientos se suman, opacidad y escala se multiplican,
  rotaciones se suman.
- Pivote de escala/rotación de efectos: centro visual del objeto, o centro de la caja del
  grupo (geometría base) si tiene `groupId`. El resultado se traduce a `x,y` equivalentes.
- Ventanas: antes del `delay` de la entrada el objeto está oculto; después de terminar la
  salida, oculto. Fuera de su ventana un efecto vale su estado de reposo.
- Keyframes: pista por propiedad; antes del primero se mantiene el primero, después del
  último el último; curva del keyframe de destino (lineal por defecto).
- Objetos ocultos no se animan; bloqueados sí (el bloqueo es de edición).
- Movimiento reducido: entradas y salidas sin movimiento (aparecen/desaparecen en su
  ventana), sin énfasis, keyframes escalonados.
- Límites de salida: x/y ±16384, tamaño ≥ 1, scaleX/scaleY 0.02–8, opacidad 0–1,
  rotación en (−360, 360).

## Archivos

- `packages/studio-interchange/src/studio/motion.js`: `sceneAt`, `objectHasMotion`,
  `sceneHasMotion`, `slideTiming`.
- `apps/shared/studio/motion.test.js` (amplía): vectores dorados, determinismo, pivote,
  composición, ventanas, recorte, reducido, grupos.
- `apps/desktop/.../lib/fabric-adapter.js`: `renderFrame` (editor de página) y
  `createPlayer` (editor externo). Debe quedar < 1000 líneas.
- `apps/desktop/.../lib/presentation-state.js`: reloj de animación (`motionTime`, congelado
  al pausar) separado del avance automático.
- `apps/desktop/.../components/present/MotionStage.jsx` (nuevo): monta el reproductor,
  dibuja `sceneAt` en cada fotograma, publica estadísticas de fotograma.
- `components/present/usePresentation.js` y `PresentationOverlay.jsx`: diapositivas vivas,
  captura de la saliente para la transición.
- `components/editor/animation/AnimationPanel.jsx` (nuevo): entrada, salida, énfasis,
  duración, retraso, curva, repeticiones, quitar, previsualizar.
- `components/editor/animation/AnimationPreviewDialog.jsx` (nuevo): reproducción de la
  página con Play/Pausa y deslizador de tiempo.
- `StudioInspector.jsx` / `StudioWorkspace.jsx`: entrada «Animación» y panel contextual.
- Ayuda del módulo.
- `scripts/verify-studio-motion.mjs` (nuevo, reutiliza `present-stack.mjs`).

## Pruebas

Unitarias (`node --test`): motor completo. Navegador (`verify-studio-motion.mjs`): animar
desde el panel, guardar/reabrir, deshacer/rehacer, dos usuarios con entrada y salida del
mismo objeto, fotogramas en tiempos conocidos (deslizador), igualdad de píxeles entre la
página animada en reposo y la misma página estática, reproducción en Presentar con
movimiento reducido, rendimiento (FPS, coste por fotograma, memoria tras ciclos de
apertura/cierre). Regresión: `verify-studio-presentations.mjs`.

## Commits

1. Motor (`sceneAt` + pruebas). 2. Renderer y reproductor vivo. 3. Panel y previsualización.
4. E2E, rendimiento y documentación.

## Resultado (2026-11-16)

Implementado según este plan. Desviaciones:

- `sceneAt` no oculta un objeto por opacidad 0: solo por las ventanas de entrada/salida; y
  solo escribe `opacity` si el diseño la tiene o difiere de 1, para que un objeto en reposo
  sea idéntico a su diseño.
- La animación corre en cada diapositiva mostrada aunque la reproducción automática esté
  apagada; «Pausar» congela también la animación (`motionTime` en `presentation-state.js`).
- Al salir de una diapositiva animada se copian sus píxeles (`captureFrame`) para la
  transición; el reproductor vivo se crea al llegar y se destruye al salir (uno a la vez).
- «Aparecer»/«Desaparecer» en la UI son `fade` con duración 0: no hay preset nuevo.

Evidencia:

- [x] Motor: `apps/shared/studio/motion-scene.test.js` (8 pruebas, fotograma de referencia a
  1234 ms comprobado a mano) y `motion.test.js`; `node --test` de Studio 88/88.
  Verified: 2026-11-16
- [x] Navegador: `node scripts/verify-studio-motion.mjs --api-image=<etiqueta>` 14/14 en stack
  Supabase desechable (animar desde el panel, deshacer/rehacer, reabrir, grupo, dos usuarios,
  cliente protocolo 3 bloqueado, fotogramas a 0/500/1500/3500/4000 ms, reproducción en vivo y
  pausa, igualdad de píxeles con la página estática, movimiento reducido, rendimiento y
  memoria). Capturas en `.artifacts/studio/motion/`. Verified: 2026-11-16
- [x] Regresión de Fase 1: `scripts/verify-studio-presentations.mjs`. Verified: 2026-11-16

Rendimiento medido (Chrome headless en el equipo de desarrollo, página de 100 objetos con 40
efectos, 2 fotos privadas y un grupo): `renderFrame` medio 2,2–2,6 ms, máximo 15,9–26,7 ms;
116–134 callbacks de rAF por segundo (headless sin vsync) y 0 fotogramas de más de 34 ms en 3 s;
heap +0,5/+0,9 MiB tras 5 ciclos de abrir y cerrar; todos los canvas liberados. No es una
medida de 60 FPS en dispositivos reales: falta medir en un teléfono y en Tauri.

Sin verificar: iPhone/Android físicos, Tauri/WebView2, GPU de gama baja.
