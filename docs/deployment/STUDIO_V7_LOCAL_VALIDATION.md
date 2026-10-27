# Studio v7 — validación local de la base multipágina

Fecha: 2026-10-26. Estado: **GO local para la base multipágina v7**.
No es una autorización de publicación ni sustituye la certificación histórica RC2.

Commit de producto y pruebas: `342d24ea5d5d0434f7317d8c906105ad383d8a9a`.
API, Web y Worker se construyen con `git archive` de ese mismo commit, etiquetas
locales `runly-studio-v7:342d24ea-{api,web,worker}` y revisión OCI verificada.
No se reutilizan resultados RC2 como certificación de v7. RC1 `32fe936c` y el
corte conjunto RC2 `3fc081b31347de55fdbdbc52e0dea9e0e90f6c51` permanecen intactos.

| Imagen | ID local verificado |
|---|---|
| API | `sha256:ca3ab4f9e11c6ae2dcc0e2affdc0f7c2fc6100a4951bec15809500ceb5eec745` |
| Web | `sha256:13d8ffde18bb9451e5a3ebe33eed7067964673ad681fbf86cf11dc4d97aadc5b` |
| Worker | `sha256:1c18bce9de7783c222665221b2a80cd55a89b4fc6149fbbda4504b5783d45c76` |

## Reproducir

Requisitos: Docker local con las imágenes del stack de prueba disponibles,
dependencias del repositorio, Chrome/Playwright y Python con PyMuPDF.

```sh
node scripts/verify-studio-local.mjs --tests-only
node scripts/verify-studio-browser.mjs
node scripts/test-runly-mcp.mjs
node scripts/build-studio-v7.mjs --revision=342d24ea5d5d0434f7317d8c906105ad383d8a9a
node scripts/verify-studio-v7.mjs --revision=342d24ea5d5d0434f7317d8c906105ad383d8a9a --phase=all
pnpm check:privacy
```

El ejecutor integral crea Supabase desechable con Auth, Storage y Realtime reales,
usuarios y empresas sintéticos, puertos de loopback y volúmenes propios. Comprueba
la identidad de la base antes de migrar/sembrar. El arranque normal aplica el SQL
del commit; compara historial/checksums con Git y las imágenes. Al finalizar
destruye exclusivamente el stack creado. No carga la configuración de la base
habitual. Los resultados y capturas quedan en `.artifacts/studio/` ignorado.

## Contrato y funciones

- Documento `schemaVersion:7`, unidad `px`; primera escena en `page`/`objects` y
  colección ordenada restante en `additionalPages:[{page,objects}]`. Identidad
  estable en `page.id`; objetos únicos globalmente y grupos de una sola página.
- Conversión lógica v1–v6 a `page-1`, sin reescritura masiva. El escritor v6 no
  puede sobrescribir v7. Protocolo nuevo: **3**.
- Añadir, duplicar, eliminar, ordenar, renombrar, modificar propiedades y copiar/
  mover grupos completos entre páginas. Duplicar regenera IDs; la última página
  se conserva. Las operaciones apuntan a `pageId`, no a la posición.
- Un canvas interactivo. Selección y viewport por página durante la sesión;
  cambios pendientes se vacían antes de cambiar. Historial selectivo y copias
  de recuperación ante eliminación concurrente/revocación. Es secuenciación de
  operaciones con recibos idempotentes, no CRDT.
- Clic primario fuera del papel quita selección y termina la edición del texto,
  sin añadir historial ni guardados. Se conserva el manejo de mano/Espacio/botón
  central, encuadre y gestos táctiles.
- Miniaturas fieles diferidas, caché privada por instancia con huellas SHA-256;
  otra página editada no invalida la miniatura. Se reautoriza también un acierto
  de caché y se libera al destruir el editor.
- Plantillas personales/empresariales copian todas las páginas y referencias
  autorizadas, sin depender de futuras ediciones de la plantilla. El contrato
  común se aplica también a las plantillas Runly.
- PNG/JPG de la página activa; PDF de todas las páginas o subconjunto en orden
  documental, RGB/CMYK genérico a 300 ppp, sangrado y marcas. Render/conversión
  progresivos, sin cargar todos los bitmaps a la vez. PDF rasterizado, no PDF/X.
- Cancelación HTTP y entre etapas, incluida la carga fotográfica de una página
  inactiva. No se promete interrumpir CPU síncrona Fabric/Sharp; se retiene el
  turno hasta que termina. No se mutan originales ni sincronización al cancelar.
- API/SDK para páginas y trabajos PDF; MCP `studio_apply_changes` conserva el
  prepare/aprobación/commit. MirAI y MCP consultan la misma guía v7.

Contrato para integrar la UI:
[`studio-editor-ui-contract.md`](../architecture/studio-editor-ui-contract.md).
Diseño y secuencia:
[`spec`](../superpowers/specs/2026-10-26-studio-multipage-design.md),
[`plan`](../superpowers/plans/2026-10-26-studio-multipage.md).

## Límites

| Recurso | Límite |
|---|---|
| Páginas | 24 |
| Objetos | 500/página, 2.000/documento |
| JSON | 4.000.000 bytes UTF-8 |
| FileAssets distintos | 100/documento |
| Lados de página | 32–4096 px |
| Fotos decodificadas | 25 MP/escena; activa + como máximo una auxiliar |
| Miniaturas | 256 px; ocho blobs/2 MiB por instancia |
| PDF | 32 MP/página, 256 MP acumulados, 64 MiB |
| Trabajo PDF | Uno/proceso; 60 s inactivo, cinco minutos totales |

Los límites globales se comprueban antes de mutar Fabric, además de validarse en
la API. Se probó que exceder 2.000 objetos o colisionar con IDs/grupos de otra
página deja intacto el canvas.

## Resultados

- Regresión aislada: **1.421 pruebas; 1.420 aprobadas, una omisión existente,
  cero fallos**, 148 suites. Incluye Studio, Canvas, Notes, POS, paquetes
  compartidos, SDK, permisos, Files y Realtime.
- Chrome/Fabric: batería existente y casos v7 de selección por página, cinco
  páginas, undo/redo, eliminación, cuotas globales, miniaturas, caché privada,
  cancelación de foto inactiva y actualización atómica de varias páginas.
- MCP global: **208 pruebas; 189 aprobadas, 17 fallos heredados y dos omisiones**.
  Los nombres de los 17 fallos coinciden exactamente con el control anterior:
  ninguno añadido ni eliminado. Los casos Studio, incluido v7/MirAI, pasan.
- React Doctor: 80/100, ocho avisos, sin errores. El único aviso clasificado
  como bug está en un archivo Chat de otra sesión; no se modifica. Los avisos
  restantes incluyen búsquedas acotadas y etapas deliberadamente secuenciales.
- Privacidad global: 67 hallazgos previos; cero hallazgos en los archivos propios
  del cambio. El chequeo global no queda limpio por esos hallazgos anteriores.
- E2E integral: **76 grupos aprobados en una sola ejecución completa** del corte
  indicado, sin sumar los ensayos interrumpidos ni otros snapshots.

| Grupo E2E | Comprobaciones |
|---|---:|
| Multipágina: dos navegadores reales, Realtime, offline/borrado, MCP, plantillas/Files, PNG/JPG/PDF, revocación y clic fuera | 8 |
| Colaboración, recibos, plantillas y seguridad existentes | 13 |
| Degradados | 4 |
| Fotografías | 4 |
| Fotografías dentro de formas | 5 |
| Exportación y cancelación existentes | 6 |
| Recibos prolongados y reinicio | 2 |
| UI final, accesibilidad, móvil/escritorio, claro/oscuro | 33 |
| Compatibilidad SQL v6/v7 y downgrade | 1 |

La misma ejecución verificó **222 migraciones** con checksums de la imagen y SQL
normalizado coincidente con Git, Web nginx con configuración aislada/sin secretos
de servidor y Worker arrancado desde el mismo SHA. El stack se eliminó al terminar.
Evidencia local ignorada:
`.artifacts/studio/runly-studio-e2e-a4bd782c5136/v7-result.json` (`passed:true`).
Las capturas están en su subcarpeta `final-ui/`; los PDF son `v7-pdf-rgb.pdf` y
`v7-pdf-cmyk.pdf`. PyMuPDF verificó las cinco páginas, orientación, colores, foto
privada y tamaño de raster; se revisó visualmente la hoja de contacto y la UI móvil
oscura. Ambas variantes conservan TrimBox/BleedBox y marcas.

Medición sintética de recibos: escritura durante 120,1 s, 1.265 lotes, p95 34,2 ms;
arrastre confirmado: 15 lotes, p95 47,6 ms; grupos de 200 elementos: 72 lotes,
p95 38,7 ms. La búsqueda usa el índice de identidad de recibo. Un recibo envejecido
400 días se conserva tras reiniciar la API y responde sin reaplicar el lote.
Se mantiene la política existente de no purgar recibos: el crecimiento medido
requiere dimensionar almacenamiento; estas cifras no son una garantía productiva.
Cinco cambios entre páginas simples en Chrome: 5,8 ms en el fixture; no extrapolar
a fotografías de máxima resolución.

## Migración y límites de la entrega

Migración aditiva: `20261208000000_studio_multipage_protocol`. Protege diseños y
plantillas v7, permite protocolo 2/3 sobre v6 y añade identidad de página a
presencia. No se alteran migraciones históricas ni `_prisma_migrations`.
Únicamente se aplica en las bases desechables de prueba. **La base habitual no
se ha actualizado**: activar estas escrituras exige la migración en una base
local autorizada y API/Web compatibles.

No se añade un panel de páginas ni se rediseña la interfaz. La siguiente entrega
puede conectar los controles existentes a las APIs documentadas, añadir navegación
de páginas/miniaturas y selector de rango. La URL con `pageId` permite abrir una
página ahora. Los trabajos PDF son efímeros por proceso: varias instancias
necesitan afinidad; tras reiniciar se repite la exportación. No se certifica PDF/X
ni color ICC de imprenta.

Todo se realiza en `main`, sin worktrees. Se conservan los cambios ajenos. No hay
SSH, VPS, despliegues ni publicación de imágenes.
