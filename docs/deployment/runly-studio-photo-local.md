# Studio — validación local del motor fotográfico

La entrega se realizó directamente en main, sin ramas ni worktrees. Todas las
escrituras de integración utilizaron proyectos Docker desechables con marcador
de identidad comprobado. No se accedió a servidores, base compartida, datos
empresariales ni publicación de imágenes. Los cambios concurrentes de UI,
tipografías, plantillas y MCP se conservaron separados.

## Implementación disponible

- Diálogo compartido de edición: Studio opta por exportar desde el original,
  crea una copia privada en Files y cambia una sola referencia del diseño.
  El propietario original no se modifica. Los errores conservan la composición.
- Marcos no destructivos: rectángulo, redondeado, círculo, elipse, arco, estrella
  y triángulo; cover/contain, centrado, recorte, zoom, desplazamiento, giro y
  volteo internos. La transformación exterior del marco es independiente.
- Opacidad, bordes, radio, sombra y ajustes de brillo, contraste, saturación,
  gris, sepia y blur, persistidos en JSON v4. Los ajustes no crean archivos y los
  gestos pueden agruparse en un paso de historial.
- Variantes tipográficas con archivos reales; párrafos, espaciado, interlineado,
  subrayado y tachado; líneas/polilíneas con flechas y trazos; grupos planos;
  importación SVG monocroma con gramática cerrada y licencia local sin verificar.
- Autorización de originales y copias basada en el diseño actual y en eventos
  de copia escritos por el servidor, con ciclo/profundidad acotados. Permite
  undo/redo tras guardar sin conceder acceso genérico a Files ni a otro diseño.

El contrato de integración y los límites están en
`docs/architecture/studio-editor-ui-contract.md`. No se añadieron migraciones
SQL para estas capacidades. Los documentos v1/v2/v3 se actualizan lógicamente.

## Evidencia reproducible

| Ejecución | Resultado |
| --- | --- |
| `node scripts/verify-studio-local.mjs --tests-only` | 1336 pruebas aprobadas; 1 omitida por la condición conocida de Files en el runner reducido |
| `node scripts/verify-studio-browser.mjs` | Renderer real: 7 máscaras, encuadre, ajustes, reemplazo, carreras de selección, grupos, líneas, SVG y tipografía; PNG/JPG idénticos tras reabrir |
| `node scripts/verify-studio-photo-dialog.mjs` | Diálogo React real, giro, comparación y guardado: Studio conserva 2400 px; modo predeterminado Files/Notes conserva 1800 px |
| `node scripts/verify-studio-supabase.mjs --source-ref=4bc2f505` | 36 grupos aprobados: 33 de Studio y 3 de copias; Auth, Postgres, Realtime y Storage reales y desechables |
| `node scripts/verify-studio-supabase.mjs --photos-only` | 4 grupos aprobados con el backend posterior: copia privada, undo/redo tras guardar, persistencia, separación de empresas y permisos |
| ESLint | Sin errores en los cambios del motor, API, integración y runners |
| Build web | Aprobado; Studio y Fabric continúan cargándose bajo demanda |

La prueba enfocada verifica además que un colaborador no pueda abrir el original
por Files, que otro diseño no pueda reutilizar la capacidad y que PostgREST
rechace escribir un evento de autorización falso. El test unitario cubre
revocación durante subida y fallo de Storage. La suite general comprueba caída
real de Storage, expiración de firmas, revocación y entrega de revisiones por
WebSocket. Las pruebas no sustituyen proveedores reales por fixtures para estas
comprobaciones de identidad, permisos y almacenamiento.

El API del ensayo final se construyó localmente desde un archivo Git del commit
`f37cd09e`, sin checkout, para evitar incluir trabajo backend concurrente sin
terminar. `--source-ref` permite igualmente compilar las fuentes web
commiteadas en memoria mientras otra sesión modifica la UI. No crea ramas ni
worktrees. El runner normal sigue probando el filesystem actual por defecto.

Artefactos ignorados en `.artifacts/studio/`: `photo-unit-regression.log`,
`photo-lineage-unit.log`, `photo-renderer.log`, `renderer-result.json`,
`photo-dialog/result.json`, `photo-supabase-committed.log`,
`photo-history-supabase.log` y sus proyectos `runly-studio-e2e-*` con resultados,
capturas y limpieza. Los contenedores y volúmenes de prueba se retiraron.

## Rendimiento y límites

En el snapshot verificado, los 12 chunks iniciales suman 751417 bytes
(210006 gzip). Studio ocupa 463082 bytes (139335 gzip) en un chunk diferido.
Como referencia, la validación previa registraba 751230 bytes iniciales y 434996
para Studio: +187 bytes iniciales y +28086 diferidos. No son promedios de un
benchmark estadístico ni incluyen el trabajo visual concurrente posterior.

El renderer sintético de 500 objetos abrió en 24 ms y exportó en 159.7 ms en una
ejecución local. Treinta actualizaciones fusionadas de un slider sobre la imagen
pequeña de prueba tardaron 5.5 ms. Estas cifras no garantizan el mismo tiempo en
fotografías de 25 MP: filtros CPU complejos pueden producir latencia y requieren
perfilado adicional. El límite del documento acota imágenes decodificadas, pero
Canvas y el navegador todavía pueden usar varios cientos de MiB.

Los grupos persistentes son planos: movimiento conjunto, selección, duplicación
y separación. El escalado/giro conjunto y grupos anidados quedan bloqueados.
El SVG admite un subconjunto monocromo; no hay conversión raster alternativa.
La prueba compartida cubre el diálogo y su modo anterior, no cada combinación
de anotaciones/retocadores de Files y Notes.

## Quitar fondo

Se ejecutó el prototipo local con ilustración sintética y retrato público de
NASA. Produce PNG con alfa, conserva el original y admite cancelación. No hay
función productiva `removeBackground`, endpoint ni descarga automática.

Los resultados y el bloqueo de calidad/recursos están en
`docs/architecture/studio-background-removal-evaluation.md`: aproximadamente
5.2 GiB de RSS y 12–16 s de inferencia CPU, además de un fallo de selección del
casco en el retrato. Se necesita aislamiento nativo y una evaluación más amplia
antes de conectar esta función a la UI y confirmar una copia mediante Files.

## Comprobaciones de calidad generales

React Doctor terminó sin errores (85/100 y 16 advertencias sobre la integración
actual). Se corrigió la escritura de una referencia durante render en el puente
fotográfico y se eliminaron las búsquedas repetidas añadidas al motor. Quedan
advertencias de complejidad, rendimiento y ciclos de estado, incluidas las de UI
concurrente; no se ocultaron mediante reglas de exclusión.

La comprobación global de privacidad reporta 65 hallazgos: 64 previos y uno en
el aviso legal de una fuente añadida por otra sesión. No se alteraron avisos de
licencia. Los archivos propios se revisaron sin introducir direcciones,
credenciales, correos personales ni rutas de estación de trabajo.
