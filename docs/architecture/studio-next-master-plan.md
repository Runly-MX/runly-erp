# Studio Next: plan maestro

Estado: Fase 0 cerrada el 2026-11-16 (auditoría estática y arquitectura). Las
fases 1 a 8 no han empezado.

Studio Next convierte `runly.studio` en el **origen común** de diseños y sus
animaciones. Presentación, video, GIF, PowerPoint y Website son destinos que se
generan desde el mismo documento editable. No se crean editores paralelos.

- Diseño técnico, hallazgos verificados y decisiones D1–D11:
  [studio-next-technical-design.md](studio-next-technical-design.md)
- Fases, archivos, pruebas y criterios de cierre:
  [studio-next-implementation-roadmap.md](studio-next-implementation-roadmap.md)
- Primera entrega ejecutable:
  [spec de Fase 1](../superpowers/specs/2026-11-16-studio-next-phase1-presentations-design.md)

Se conservan como fuentes vigentes, sin duplicarlas aquí: la
[arquitectura de Studio](runly-studio-architecture.md), el
[ADR del renderer](adr-runly-studio-renderer.md), el
[contrato de UI](studio-editor-ui-contract.md) y el
[plan maestro histórico](../superpowers/plans/runly-studio-master-plan.md), cuyas
fases 0–6 describen la construcción del editor actual y no se reabren.

## Punto de partida verificado

Studio ya tiene editor Fabric 6.9.1, documentos multipágina v7 (24 páginas),
seis tipos gráficos, grupos, degradados, rellenos de foto, PNG/JPG/PDF/ZPL,
creación masiva, colaboración en tiempo real por operaciones con historial
selectivo, plantillas, colecciones, marketplace y paquete `.runlystudio`
compartido con Developer Hub mediante `@runly/studio-interchange`.

No tiene modelo temporal, reproductor, animaciones ni exportaciones animadas,
PPTX o Website. El contrato descarta propiedades desconocidas en tres listas
blancas (validador, `OBJECT_KEYS`, `PAGE_KEYS`), y un cliente antiguo puede borrar
campos nuevos al sincronizar. Por eso la evolución empieza por el contrato.

## Principios

1. **Un documento, muchos destinos.** Las animaciones son datos declarativos
   (milisegundos enteros, presets acotados), no código, fotogramas ni JSON Fabric.
2. **Una función de tiempo.** `sceneAt(documento, página, t)` es pura y vive en
   el paquete compartido. Editor, reproductor, video, GIF, PPTX y Website la
   consumen. Ningún efecto se implementa solo en React o en Fabric.
3. **Compatibilidad monótona.** v8 se emite solo cuando un diseño usa campos v8;
   los diseños estáticos siguen en v7 y los existentes no se reescriben.
4. **Seguridad heredada.** Mismos permisos, reautorización de imágenes y
   presupuestos que las exportaciones actuales. Nada se publica automáticamente.
5. **Entregas verticales y verificables.** Cada fase termina con evidencia en
   navegador real y sin regresión en exportaciones, plantillas ni colaboración.

## Fases

| Fase | Resultado | Depende de | Repos |
| --- | --- | --- | --- |
| 0 | Auditoría, arquitectura, plan y spec de Fase 1 | — | runly-erp (docs) |
| 1 | Contrato v8 completo + protocolo 4 + presentación a pantalla completa con duración, transiciones de diapositiva y reproducción automática | 0 | runly-erp |
| 2 | Motor `motion.js` en uso + `motion-renderer` + efectos de entrada, salida y énfasis por objeto, con previsualización | 1 | runly-erp |
| 3 | Línea de tiempo y keyframes en el editor; colaboración y undo sobre efectos | 2 | runly-erp |
| 4 | Exportación WebM/MP4 (WebCodecs + respaldo ffmpeg.wasm) y GIF | 2 (3 para keyframes) | runly-erp |
| 5 | Exportación PPTX editable, con transiciones y avance automático | 1 (fallbacks de 2) | runly-erp |
| 6 | Paquete portable v2 + Developer Hub con plantillas animadas | 2 | runly-erp, runly-developer-hub |
| 7 | «Enviar a Website»: borrador Atlas editable desde una página Studio | 2 | runly-erp |
| 8 | Cierre: rendimiento, accesibilidad, ayuda, MCP, validación de instalador y release candidate | 1–7 | runly-erp, runly-developer-hub |

Las fases 4, 5, 6 y 7 son independientes entre sí una vez cerrada la 2 (la 5 solo
necesita la 1 para su primer corte) y pueden ordenarse por prioridad comercial.

runly-web no requiere cambios. Si una fase modifica `docs/developers/*.md`, se
aplica la cadena de documentación del repositorio (generar ZIP, sincronizar web y
Hub).

## Puertas de avance

Cada fase necesita, antes de implementarse, una spec aprobada en
`docs/superpowers/specs/` y un plan en `docs/superpowers/plans/`
(`docs/spec-driven-development.md`). Para cerrarla hace falta:

- Pruebas dirigidas de contrato, motor y API en verde, con el comando y la fecha.
- Prueba de navegador real con la empresa de pruebas local, dos sesiones cuando
  haya colaboración.
- Regresión de PNG/JPG/PDF, plantillas, MCP y colaboración sin cambios.
- Documentos v1–v7 abiertos y guardados sin pérdida.
- `pnpm check:privacy` y límite de 1000 líneas por archivo.
- Las casillas `[x]` solo con `Verified: YYYY-MM-DD (...)`.

Migraciones, despliegues, publicación de paquetes npm, cambios en el Hub y
releases requieren autorización explícita en cada fase.

## Decisiones que requieren autorización

| Decisión | Recomendación | Fase |
| --- | --- | --- |
| v8 con versión mínima y monótona, protocolo 4 aceptando clientes 3 en diseños v7 | Aprobar (alternativa: cambio estricto como v7, que bloquea a todos los clientes antiguos) | 1 |
| Contrato v8 completo (también efectos de objeto) desde Fase 1 | Aprobar: evita una v9 y la pérdida de efectos por clientes de Fase 1 | 1 |
| Aplicar la migración `studio_v8_protocol` en la base local y en las instalaciones | Autorizar al cerrar Fase 1 | 1 |
| Muxer para WebCodecs (nueva dependencia; verificar licencia y mantenimiento) | Decidir en el spike de Fase 4 | 4 |
| `pptxgenjs` como generador (nueva dependencia, MIT) | Decidir en el spike de Fase 5 | 5 |
| Publicar `@runly/studio-interchange` v8 y actualizar el Hub | Autorizar en Fase 6 | 6 |
| Enlace público de presentación | Fuera de alcance; requiere spec propia | posterior |
| Render de video en servidor | Fuera de alcance mientras basten los presupuestos del navegador | posterior |
