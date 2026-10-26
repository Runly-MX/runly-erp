# Studio — certificación conjunta RC2

## Identidad y alcance

Candidato de producto: **3fc081b31347de55fdbdbc52e0dea9e0e90f6c51**.
Contiene c5f22aee, la UI de 5c52d00a y las correcciones de integración eb9eb2e5.
API, Web nginx y Worker se construyeron desde el mismo archivo Git y declaran
ese SHA en org.opencontainers.image.revision. RC1 **32fe936c permanece congelada**.

La certificación utiliza una sola ejecución completa nueva, con Supabase
desechable, Auth real, Storage, Realtime e identidades sintéticas. No se suman
los resultados anteriores de c5f22aee, el ensayo UI separado ni la primera pasada
cuya comprobación de dark mode resultó insuficiente. El harness corregido está
versionado hasta e73cc41a; sus cambios posteriores solo afectan pruebas/build
local, no el producto contenido en las tres imágenes.

| Imagen local runly-studio-rc2:3fc081b3-* | ID |
| --- | --- |
| api | sha256:7f1877367e95f5160a1d9c2bc3f673fce88b81721418f6e10d5ab37bb78320b2 |
| web | sha256:f26182807cf2d7d2aa19c9721e3c5207c84d865521fe1cf2bc3a94e2d18801a7 |
| worker | sha256:6930fde57c019d6875fd0cf49c20b06962cff64c293858defe83287c5ff3cb00 |

Solo local y directamente en main. Sin SSH, VPS, publicación de imágenes,
despliegues, escrituras en bases compartidas ni modificación de cambios ajenos.
La configuración habitual de conexión no se carga. Cada entorno verifica su
identidad antes de escribir y elimina únicamente sus propios volúmenes al cerrar.

## Resultado conjunto

**GO para RC2 conjunta local aislada de 3fc081b3: 74 comprobaciones E2E
aprobadas, cero fallos y cero omisiones.** La integración de ambas sesiones queda
cerrada para este candidato. No se afirma validación de una base compartida ni
del MCP global completo, y no se publica ni despliega.

Evidencia local: **.artifacts/studio/runly-studio-e2e-079b2790addf/rc2-result.json**.
El JSON declara phase=all y passed=true y conserva SHA, IDs de imágenes,
resultados por suite, medidas SQL/PDF y compatibilidad; junto a él están logs,
descargas, rasterizados y capturas de las seis combinaciones de pantalla/tema.

| Grupos de la misma ejecución | Cantidad |
| --- | ---: |
| Operaciones, permisos, historial, recuperación, plantillas y MCP abierto | 13 |
| Degradados | 4 |
| Fotografías | 4 |
| Fotos dentro de formas | 5 |
| Exportación, colaboración concurrente y cancelación de original privado | 6 |
| Recibos y reconexión tras reinicio | 2 |
| UI final: presencia, selecciones, estados, permisos, descargas y responsive | 33 |
| Compatibilidad API/Web | 3 |
| Arranque/migraciones, nginx/bundle, PDF independiente y Worker | 4 |
| **Total** | **74** |

Son las 40 comprobaciones anteriores **repetidas**, las 33 de la UI final
**repetidas** y una comprobación nueva de cancelación sobre un original privado.
Los mensajes resumen no se cuentan otra vez.

Regresión automatizada actual: **1,408 pruebas, 1,407 aprobadas, cero fallos y
una omisión preexistente**, 148 suites. Incluye Studio, Canvas, Notes, POS,
Projects, Files, SDK/UI, paquetes compartidos, JWT, SQL, historial y plantillas.
Los totales unitarios y E2E se presentan separados, sin sumar ejecuciones solapadas.

## Reproducir

Desde main, con Docker local y las dependencias del repositorio instaladas:

    node scripts/build-studio-rc2.mjs --revision=3fc081b31347de55fdbdbc52e0dea9e0e90f6c51
    node scripts/verify-studio-rc2.mjs --revision=3fc081b31347de55fdbdbc52e0dea9e0e90f6c51
    node scripts/verify-studio-local.mjs --tests-only

El builder usa git archive, el contexto Docker local comprobado y su builder
integrado; no usa ramas, worktrees ni el directorio de trabajo como contexto
de compilación. Solo carga imágenes locales. Una reconstrucción con IDs distintos
requiere repetir la certificación; los IDs anteriores identifican lo ensayado.

El recorrido antes ignorado está ahora en scripts/fixtures/studio/final-ui.mjs
y se integra en verify-studio-rc2.mjs. No requiere archivos de .e2e ni secretos
versionados. Los entrypoints antiguos de browser/colaboración utilizan las
suites canónicas del protocolo incremental. Resources, Creative y Composition
esperan sincronización automática; presencia es un group con avatares y escala
usa radios. Los botones históricos permanecen únicamente en pruebas explícitas
de RC1/compatibilidad. No se restauraron controles retirados.

## Reconexión y autorización

| Situación | Comportamiento comprobado |
| --- | --- |
| Sincronizado | Operaciones confirmadas; el canal puede anunciar por separado que está reconectando |
| Sincronizando | Lote pendiente y trabajo nuevo separados; no se descarta trabajo al llegar cambios de otros |
| Sin conexión | Reintento autorizado con backoff; al volver la red se consulta estado/recibo antes de reproducir |
| Error al sincronizar | Copia y cola conservadas; la UI ofrece **Recargar Studio**, sin fingir que resync desbloquea una sesión rechazada |
| Storage temporal al exportar | Error sanitizado; una nueva descarga obtiene autorización/original fresco, sin modificar el archivo |
| Fallo de render al aplicar cambios remotos | Escena previa y copia conservadas; la recarga vuelve a comprobar recursos y permisos |
| Conflicto recuperable | Archivo local independiente del autosave; recuperación explícita sobre estado actual, sin resucitar objetos eliminados |
| Revocación 401/403/404 | Se suspende la cola; online/resync no reenvían operaciones. Si se pierde lectura/presencia, se detiene también el canal. Recargar comprueba permisos antes de enviar |

La prueba UI provoca un rechazo 400 y verifica que la recarga explícita confirma
el cambio pendiente en el servidor. No se acepta una nota de que el botón no
funciona como resultado aprobado. Los tests 401/403 verifican también cambios
nuevos después del rechazo, ausencia de nuevos envíos y conservación de la cola.
La revocación real y el descenso a lector se ensayan entre identidades distintas.

El ensayo offline/reload bloquea explícitamente POST de cambios, verifica que la
revisión no avance antes de recargar y luego confirma exactamente una aplicación
tras el reintento autorizado. Comprueba conectividad real antes de navegar; una
repetición acotada solo contempla net::ERR_FAILED de navegación, nunca errores
de autorización ni aserciones de datos.

## Cancelación efectiva y límites

AbortController se propaga desde DesignEditor a las consultas de autorización,
la carga temporal del original mediante Fabric, el SDK y la petición HTTP del PDF.
También se aborta al desmontar el editor. Se comprueba la señal entre etapas y
antes de descargar; un trabajo cancelado no puede sustituir el aviso de otro
trabajo ni descargar tarde.

Cancelar la espera de sincronización **no cancela la sincronización independiente**.
La cancelación deja intactos documento, revisión y bytes originales de Storage.
El doble clic no crea un segundo trabajo. Un test con un cliente HTTP real
desconectado verifica que el servidor observa el aborto antes de la autorización
final; otros tests verifican aborto del pipeline y liberación de su turno.

Fabric toCanvasElement/toBlob y libvips no ofrecen preempción fiable del trabajo
CPU ya iniciado. Ese trabajo puede terminar; no se inicia la siguiente etapa,
se libera lienzo/stream y se descarta el resultado. El turno PDF permanece ocupado
hasta terminar la etapa nativa, evitando multiplicar decodificadores tras cancelar.
Las fuentes compartidas pueden seguir cargándose aunque se cancele la espera.

| Recurso | Presupuesto |
| --- | --- |
| PNG/JPG | 80 MP, 16,384 px por lado; escala exacta o rechazo explícito |
| PDF | 32 MP y 16,384 px por lado a 300 ppp |
| Entrada/respuesta PDF | 64 MiB; el multipart tiene además límite HTTP de 64 MiB |
| Concurrencia PDF | Un trabajo por proceso; otro recibe 429 |
| Fotos decodificadas del editor | 25 MP agregados, 8,192 px por lado |

Son presupuestos de píxeles, no un límite absoluto de RSS: un buffer RGBA de
80 MP ocupa unos 305 MiB y uno de 32 MP unos 122 MiB, además de copias/codificadores.

## Exportación y UI final

PNG/JPG ×1/×2/×3: tamaños anunciados y archivos decodificados coinciden
(600×400, 1200×800, 1800×1200). Se verifican alfa PNG, gradientes, Lato local,
grupos, foto enmascarada y elementos fuera de página. El renderer también prueba
4,096² reales y rechaza ×3 sin reducción silenciosa. La UI anuncia los excesos,
deshabilita Descargar y vuelve a habilitarlo al elegir una escala válida.

PDF RGB y DeviceCMYK: 1946×1321 píxeles a **300.0206 ppp** efectivos, corte
158.75×105.8333 mm, sangrado de 3 mm y marcas fuera del BleedBox. PyMuPDF inspecciona
y rasteriza ambos archivos, incluidas TrimBox/BleedBox, orientación y aplanado.
Las muestras independientes tienen error máximo de canal 1 en RGB y 21 en CMYK
(tolerancias previas 5/25). Se rechazan resolución falsa, entrada malformada,
orientación EXIF y medidas excesivas; la autorización se repite después de procesar.

El PDF es **rasterizado**, con conversión CMYK genérica. **No es PDF/X certificado**,
no incorpora el perfil ICC de una imprenta concreta ni conserva vectores editables.
La UI lo explica. La revocación impide una nueva descarga; no borra los píxeles
que un cliente recibió legítimamente antes.

La UI se ensaya en 1440/820/390 px, claro y oscuro, con teclado y movimiento
reducido. La preferencia se establece mediante runly-theme y se comprueba el tema
efectivo tras cargar, evitando capturas claras etiquetadas como oscuras.
Se comprueban ausencia de desbordamiento, lienzo utilizable, diálogo dentro de
la ventana, colores/nombres de presencia, selección remota y su tamaño al hacer zoom.
Cambios de A o de MCP mientras B exporta rechazan la revisión obsoleta; el lector
autorizado puede exportar. Se revisan visualmente capturas y PDF rasterizados.

## Compatibilidad y migraciones

| Combinación | Resultado |
| --- | --- |
| API RC1 con base protegida v6 | Su UPDATE se rechaza por SQL (500 en esa API antigua); JSON/revisión intactos |
| Web nueva con API RC1 | Detecta protocolo ausente, conserva cola y no envía POST de operaciones |
| Web RC1 con API nueva | PUT sin handshake recibe 426 |
| Pestaña antigua sin notificaciones durante actualización | 426 real; borrador conservado tras dos recargas con la Web nueva |
| Downgrade explícito v6 → v5 | 409; el contenido v6 permanece |
| upsert anterior con protocolo 2 | Sigue admitido con su semántica histórica |

**Cero migraciones nuevas en esta integración.** Las 221 migraciones existentes
se aplican solamente en la base desechable; checksums coinciden con la imagen y
SQL normalizado con Git. Se conserva el guard aditivo de protocolo ya existente.
No se altera SQL histórico, _prisma_migrations ni se usa migrate resolve.
La futura actualización debe coordinar guard/API/Web/Worker; no retirar el guard
para permitir que un escritor antiguo degrade v6.

## Recibos y rendimiento

Se repiten medición SQL, consulta indexada y reinicio real de API con recibos
sintéticos fechados 400 días atrás. El primer lote devuelve su ack original sin
incrementar la revisión ni reaplicarse. Esto no equivale a 400 días reales de uso.

| Perfil (un actor/diseño) | Segundos / eventos locales / lotes | Lotes/s | Metadata media (B) | Commit p95 (ms) | Consulta HTTP (ms) |
| --- | --- | ---: | ---: | ---: | ---: |
| Texto completo continuo | 120.0 / 4658 / 1214 | 10.12 | 462.6 | 31.4 | 7.9 |
| Soltar arrastre | 15.1 / 15 / 15 | 0.99 | 436 | 36.9 | 11.4 |
| Transformación de 200 objetos | 15.1 / 72 / 72 | 4.77 | 1851.1 | 37.5 | 8.8 |

Los tres planes usan studio_operation_receipt_identity; SQL medido
0.022/0.026/0.030 ms. El payload usa pg_column_size(metadata), con compresión,
sin todo el overhead de heap/TOAST/índices. Ocho horas al ritmo observado
extrapolan 134.8/12.5/254.5 MB decimales de metadata por perfil. No son ocho horas
observadas ni una prueba de capacidad multiusuario o promesa de latencia.

La política sigue sin purga temporal: las colas no tienen una caducidad demostrada.
Los recibos deben excluirse de cualquier retención externa de AuditLog. Antes de
escalar una instalación permanente hay que presupuestar almacenamiento y diseñar
recibos compactos/épocas que preserven idempotencia. La prueba local está acotada
y se elimina como entorno completo; no se debilita el protocolo para ahorrar disco.

## Reservas independientes y cierre

MCP global repetido con PostgreSQL 18 desechable: **207 casos, 188 aprobados,
17 fallidos heredados y dos omisiones**. Comparación de nombres contra el control:
cero fallos nuevos y cero eliminados. Son 14 hojas y tres padres: fixture de Notes
sin parent_note_id y casos dependientes, Projects sin parámetro project y Documents
hub no inicializado. No se declara aprobado el MCP global. El recorrido Studio
MCP/OAuth/aprobación y los casos Studio/MirAI propios sí se verifican por separado.

Lint dirigido aprobado. React Doctor: **81/100, cero errores**, con advertencias
de complejidad y otras preexistentes; se corrigieron updater impuro y rol de botón.
pnpm check:privacy conserva **67 hallazgos fuera de esta entrega**. La inspección
de los 30 archivos propios, incluidos informes y fixtures, terminó con **cero
hallazgos**. No se eliminaron atribuciones ni se alteraron archivos ajenos para
silenciar el control global.

No se inició evolución mayor del JSON/documento ni preview transitorio de arrastre.
Esta entrega cierra integración y certificación local; no publica ni despliega.
