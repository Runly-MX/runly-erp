# Studio: composición v6, validación local posterior a RC1

Fecha: 2026-10-26. Producto: `5202a72f3bbb2ba2a65af7457b3d9fa8476cc002`.
Trabajo en main; sin ramas/worktrees, publicación ni despliegue. RC1 y sus
imágenes siguen intactas. Ninguna escritura sobre la base habitual: las pruebas
SQL y E2E crean y destruyen sus propios proyectos Docker y volúmenes.

## Capacidades reales

| Área | Resultado |
| --- | --- |
| Documento | v6; lectura de v1–v5, sin migración SQL |
| Degradados | Lineal/radial, 2–12 stops editables, opacidad por punto y elemento, invertir/restablecer, conversión a sólido |
| Superficies | Rectángulos, elipses/círculos, vectores de un path cerrado relleno sin trazo, fondo |
| Fidelidad | JSON editable, miniaturas/Home/plantillas, clipboard, duplicación, historial, PNG/JPG y reapertura |
| Snapping | Movimiento real; centros/bordes de página/objetos, cuadrícula independiente, separación entre vecinos compatibles, Alt temporal, umbral de pantalla |
| Referencias | Índice por gesto; objetos ocultos y miembros propios excluidos, bloqueados como referencias inmóviles |
| Grid/reglas | Preferencias y coordenadas de overlay sincronizables con zoom/pan; no entran en documento/exportación |
| Grupos planos | Método atómico de giro, escala proporcional y traslación; alineación con página como conjunto, duplicar/desagrupar/undo/redo |
| MCP/MirAI | Guía v6, pintura válida en creación/plantillas y revisión manual de contraste sobre degradados |

Los contratos y métodos exactos están en
[`studio-editor-ui-contract.md`](../architecture/studio-editor-ui-contract.md).
Se modificó el renderer de miniaturas, sin reconstruir controles visuales. La UI
de degradados/guías/cuadrícula/reglas y los controles para `transformGroup` deben
conectar esas APIs; no se presentan como controles ya entregados.

## Verificación reproducible

- `node scripts/verify-studio-local.mjs --tests-only`: 1.348 pruebas,
  **1.347 aprobadas, 0 fallos, 1 skip previo**, 148 suites. Incluye Studio,
  Canvas, Notes, POS, Projects, paquetes compartidos, SDK, Files, Auth y Realtime.
- `node scripts/verify-studio-browser.mjs`: Chrome/Fabric/Canvas2D reales. Escena
  con lineal/radial, transparencia, opacidad general, formas rotadas, vector,
  texto sobre fondo degradado, máscara fotográfica, foto en forma y línea con
  extremos. PNG/JPG idénticos tras JSON/reapertura; desagrupar conserva PNG.
  Stops e historial de un gesto, clipboard, grupos y preferencias comprobados.
  Arrastre real a zoom 0.5/1/2 y Alt; guías se vacían al terminar.
- Oracle de píxeles interiores y miniatura: tolerancia máxima 2 por canal;
  diferencia observada 0. Se evitan bordes antialias en los puntos de comparación.
- Snapping con 500 referencias, construir índice y 1.000 consultas: **5.3 ms**
  en la ejecución registrada. Abrir 500 objetos: 25–44 ms; exportar PNG:
  157–206 ms en las ejecuciones observadas. Son mediciones locales, no garantías
  universales.
- `pnpm --filter @runly/desktop build:web` y ESLint de archivos de producción:
  aprobados. Bundle Studio 272.396 bytes / 81.413 gzip; Fabric sigue diferido y
  fuera del arranque. Revisión del bundle sin secretos de la infraestructura
  desechable. Se mantienen avisos generales de chunks grandes.
- API local desde `git archive` del producto, etiqueta
  `runly-studio-dev:5202a72f-api`, `buildx --load`; imagen inspeccionada localmente.
  Sin push y sin sobrescribir etiquetas RC1.
- `node scripts/verify-studio-supabase.mjs --api-image=runly-studio-dev:5202a72f-api --source-ref=5202a72f`:
  **45 grupos aprobados** con GoTrue, REST/RLS, Realtime, Storage, API y React
  reales. Auth/base/archivos 10, colaboración 7, recursos 4, composición 6,
  biblioteca creativa 6, fotografía 4, rellenos fotográficos 5, degradados 3.
  Incluye 409, revocación, denegaciones, caída/recuperación de Storage,
  plantillas personales/empresa y copias, proyecciones de miniaturas y v1–v5.
- El mismo runner con `--gradients-only`: **4 grupos aprobados**. Además de los
  tres casos de contrato, abre la lista React con la miniatura radial real,
  entra al editor autenticado y descarga PNG/JPG con oracle radial independiente
  (tolerancia 2/4 por canal). PNG idéntico tras recargar la página. Capturas y
  exportaciones inspeccionadas visualmente. Son **46 grupos distintos** entre
  la ejecución completa y la adicional; no se suman dos veces los tres comunes.
- `node scripts/test-runly-mcp.mjs`: 207 pruebas, **188 aprobadas, 17 fallos
  conocidos y 2 skips**. Nuevo caso v6 MCP/MirAI aprobado: aprobación requerida,
  crear/leer/plantilla, guía compartida y contraste conservador. No se ocultan ni
  se reclasifican los fallos globales descritos en
  [`runly-studio-geometry-local.md`](runly-studio-geometry-local.md).
- React Doctor: **89/100, sin incidencias** en el análisis final.
- `pnpm check:privacy`: conserva **65 hallazgos previos** del repositorio.
  Inspección explícita de los archivos de esta entrega: cero hallazgos.

Los JSON, capturas y logs reproducibles quedan bajo `.artifacts/studio/`,
ignorados por Git. Las credenciales sintéticas de cada stack tampoco se versionan.

## Límites y siguiente trabajo local

- Texto, trazos y bordes con degradado y pintura cónica: no implementados;
  se rechazan en lugar de simular fidelidad.
- Snapping durante resize: pendiente. Separación uniforme solo entre vecinos
  no solapados con coincidencia perpendicular; no hay distribución arbitraria.
- Los handles múltiples de Fabric mantienen escala/giro bloqueados. El método
  `transformGroup` sí es funcional y está probado con todos los tipos de objeto.
  Escala no uniforme global sobre miembros rotados produce sesgo no representable
  en v6; fotografías requerirían conservar la transformación externa en vez de
  recalcular cover/contain. No se añaden propiedades parciales ni anidación.
- Próxima etapa local: conectar los controles de UI, dibujar overlays con las
  referencias transitorias y ampliar la regresión visual de interacción. Después,
  evaluar matrices locales y árbol acíclico limitado para grupos anidados.
- No mezclar escritores v5/v6 en una publicación futura: un lector v5 rechaza v6
  y una escritura de un cliente antiguo puede perder pintura nueva. Sigue siendo
  necesaria una transición coordinada de API/clientes/cachés antes de publicar.

Esta entrega es desarrollo local; no declara una nueva RC ni reemplaza la
decisión documentada de RC1.
