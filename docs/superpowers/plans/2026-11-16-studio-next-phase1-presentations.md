# Studio Next Fase 1 — plan de implementación

Spec: [2026-11-16-studio-next-phase1-presentations-design.md](../specs/2026-11-16-studio-next-phase1-presentations-design.md).
Aprobado por el usuario el 2026-11-16 con condiciones (abajo). Base: `85c974ad3`.
Fuentes: [plan maestro](../../architecture/studio-next-master-plan.md),
[diseño técnico](../../architecture/studio-next-technical-design.md),
[hoja de ruta](../../architecture/studio-next-implementation-roadmap.md).

## Condiciones del usuario

- Un cliente de protocolo 3 sigue escribiendo diseños v7 y **nunca** escribe un
  diseño v8. Se comprueba dentro de la transacción que persiste, después del
  bloqueo de fila, contra la versión almacenada y la resultante (cubre la
  carrera v7→v8 entre clientes).
- El `.runlystudio` de un diseño con campos v8 exige una aceptación explícita
  (`acknowledgeMotionLoss: true`) y declara las pérdidas.
- La migración solo se aplica en PostgreSQL desechable. Sin Hub, runly-web,
  dependencias nuevas, push ni despliegue.

## Correspondencia con el código (verificado 2026-11-16)

| Spec | Código actual | Ajuste |
| --- | --- | --- |
| Cabecera del SDK | `packages/sdk/src/domains/studio.js` envía literal `'3'` | Literal `'4'` |
| Plantillas | `studio-templates-service.js` ya rechaza `input.document.schemaVersion < current` (409) y el trigger cubre `studio_template` | Solo `set_config` a `'4'`; sin chequeo de cabecera nuevo |
| Exportación del paquete | `interchange/service.js` `exportPackage` valida `{acknowledgeImageCopies: true}` estricto | Añadir `acknowledgeMotionLoss` opcional; el writer compartido lo exige si hay campos v8 |
| UI del paquete | `ExportDialog.jsx` recibe `packageExport` y pide una casilla | Segunda casilla cuando `packageExport.motionLoss` |
| `previewDocument` y `MarketplaceUseDialog` usan `schemaVersion: 7` | Construyen previsualizaciones de paquetes v1 (siempre v7) | Sin cambios |
| Última migración | `20270106100000_website_domain_primary` (otra sesión) | Nueva: `20270107000000_studio_v8_protocol` |

## Contratos

`packages/studio-interchange/src/studio/motion.js` (nuevo; reexportado en
`apps/shared/studio/motion.js` y `exports ./studio/motion`):

- Constantes: `SLIDE_LIMITS {minDuration 500, maxDuration 600000, defaultDuration 5000, maxTransition 3000}`,
  `MOTION_LIMITS {maxEffectDuration 10000, maxDelay 600000, keyframes 32, effects 2000, totalKeyframes 8000, repeat 20}`,
  `SLIDE_TRANSITIONS`, `ENTER_EXIT_PRESETS`, `EMPHASIS_PRESETS`, `EASINGS`, `KEYFRAME_PROPERTIES`.
- `validateSlide(value)` → copia limpia o error; `validateMotion(object)` → `{enter?, exit?, emphasis?, keyframes?}`.
- `usesV8(document)`, `projectV7(document)` → documento v7 sin campos v8 + `lost` booleano.
- `easing(name, x)`, `transitionAt(transition, progress, direction)`,
  `slideDuration(page)`, `presentationSequence(document)`.

`document.js`: versión 8, versión mínima monótona, límites totales.
`operations.js`: claves nuevas en `PAGE_KEYS`/`OBJECT_KEYS`.
`protocol.js`: `STUDIO_PROTOCOL_VERSION = 4`, `STUDIO_MIN_CLIENT_PROTOCOL = 3`,
`clientProtocol(header)` y `requireClientProtocol(protocol, ...versions)`.

Regla de `delay + duration ≤ duración de la diapositiva`: se valida en
`validateDocument` con la duración efectiva de la página del objeto.

## Migración

`20270107000000_studio_v8_protocol`: `CREATE OR REPLACE` de
`runly_studio.require_document_protocol()`. v ≥ 8 exige `'4'`; v7 `'3'|'4'`;
v6 `'2'|'3'|'4'`; bajada denegada. Triggers existentes intactos. Prueba en
PostgreSQL desechable aplicando la cadena completa de migraciones Studio.

## Secuencia y commits

1. Contrato: `motion.js`, `document.js`, `operations.js`, reexport, `exports`;
   pruebas `motion.test.js`, `document.test.js`, `operations.test.js`.
2. Paquete: `write.js` (proyección + aceptación); prueba en `interchange.test.js`.
   **Commit 1** (contrato + paquete).
3. API: `protocol.js`, middlewares, `studio-service.js` (`update`/`applyChanges`
   con protocolo de cliente), `studio-templates-service.js`, `/studio/protocol`,
   `studio-application.js`, `interchange/service.js`, SDK; pruebas de rutas y
   servicio.
4. Migración y prueba Postgres desechable. **Commit 2** (API + SQL).
5. UI: `SlideSettings.jsx`, `slide-frames.js`, `present/usePresentation.js`,
   `present/PresentationOverlay.jsx`, `StudioTopBar`, `StudioWorkspace`, casilla
   de pérdidas en `ExportDialog` y su envío en `studio-export.js`.
6. Ayuda del módulo. Build web. **Commit 3** (UI + ayuda).
7. E2E de navegador contra la API local en ejecución (sin reiniciarla) cuando la
   API cargue el código nuevo; si la base local no tiene la migración, las
   escrituras v8 fallarán en el trigger y se documenta como pendiente de
   autorización. **Commit 4** (cierre: resultados en la spec/hoja de ruta).

## Pruebas dirigidas

`node --test` sobre: `apps/shared/studio/motion.test.js`, `document.test.js`,
`operations.test.js`, `multipage.test.js`; `packages/studio-interchange/src/__tests__/`;
`apps/api/src/routes/studio/studio-routes.test.js` y las de interchange; la prueba
Postgres desechable si Docker está disponible; lógica pura del reproductor.
No se ejecutan suites globales.

## Criterios de aceptación

Los de la spec §6, más las condiciones del usuario arriba.
