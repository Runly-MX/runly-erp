# Studio v7 — documentos multipágina

Estado: diseño validado contra HEAD a8382926, previo a implementación. RC1
32fe936c y RC2 3fc081b3 son referencias congeladas, no certifican este cambio.
Solo main/local, sin bases compartidas, despliegues ni publicación.

## Contrato y decisión de compatibilidad

Se conserva la primera página en page/objects y se añade additionalPages, una
cola ordenada de escenas {page,objects}. Cada page lleva id estable y nombre
opcional. La colección completa es [primera, ...additionalPages]; NO se guarda
otra copia de la primera ni un orden independiente. Reordenar cambia la cabeza
y la cola, conservando IDs. documentPages/listPages abstraen esta representación.

Se evaluó pages[]: es uniforme, pero rompería a la vez todas las proyecciones
SQL, primitivas gráficas y ayudas existentes. Cabeza/cola conserva un único
estado canónico y permite evolucionar el renderer existente sin alias mágicos,
serializadores especiales ni un segundo editor. No se ofrece un campo pages
redundante. La UI futura debe usar listPages, no interpretar additionalPages.

    {schemaVersion:7,unit:'px',
      page:{id:'page-1',width:1080,height:1920,background:'#ffffff'},objects:[],
      additionalPages:[{page:{id:'page-2',width:1920,height:1080,background:'#ffffff'},objects:[]}]}

v1–v6 se normalizan lógicamente con page-1 y cola vacía, sin UPDATE masivo.
Nuevas escrituras usan protocolo 3. HTTP y guard SQL bloquean protocolo 2 al
modificar v7 y cualquier downgrade. Migración aditiva, jamás cambiar SQL histórico.

Presupuestos: 24 páginas, 500 objetos/página, 2000/documento, 4 MB JSON UTF-8,
100 FileAsset distintos. Dimensiones 32–4096 px. IDs de objetos únicos globales;
un groupId solo pertenece a una página. UUID de tablas siguen generados por DB;
IDs de páginas/objetos son identificadores de contenido, no filas ORM.

## Operaciones y colaboración

Operaciones gráficas llevan pageId. Tipos estructurales: addPage, duplicatePage,
removePage, pageOrder, transferObjects; patchPage modifica propiedades, no id.
duplicatePage recibe newId y deriva IDs de objetos/grupos determinísticamente;
el broadcast efectivo contiene la nueva escena completa. Mover mantiene IDs,
copiar los regenera; no se permite partir un grupo involuntariamente.

Las operaciones antiguas sin pageId solo apuntan al ID lógico page-1, nunca al
índice cero que pueda cambiar. Esto permite consultar/reintentar recibos antiguos
sin modificar el digest del lote incierto. Un ID eliminado no se reutiliza por
acciones automáticas. Editar una página eliminada es no-op, sin recrearla; se
conserva la copia local antes de reconciliar. Eliminar la última página no la
borra; el editor explica el rechazo y el servidor mantiene el invariante.

Secuencia SQL global y recibos actor/empresa/diseño/sesión/lote existentes. No
hay CRDT. Páginas distintas no exigen revisión global para enviar operaciones.
MCP puede escribir documentos v7 y se documentan comandos de página aprobados.
Undo/redo condiciona propiedades y página objetivo; no borra una página añadida
por el usuario si después otro colaborador la modificó.

## Renderer y selección

Una instancia Fabric activa, sobre la escena de la página elegida. Un wrapper
del motor conserva documento global, historial, viewport/selección por página y
cola de cambios. Cambiar espera flush, sin cancelar sincronización. Si una página
desaparece, elige la primera existente y conserva el trabajo no confirmado.

Volver restaura solamente IDs aún existentes y visibles; no recrea selección
eliminada. Un clic primario en el fondo fuera del papel quita la selección y
termina edición de texto. No cambia JSON, revisión ni historial; no intercepta
controles, diálogos, barras, pan, zoom o muestreo de color.

Miniaturas: renderer fiel bajo demanda, una tarea auxiliar a la vez, salida
256 px, caché LRU de 8 blobs/2 MiB. Invalidación por contenido de página, no por
revisión global; nunca rasterizar todas al modificar una. Se liberan recursos
auxiliares. Autorización antes/después y destrucción de caché al cerrar el editor.
Foto decodificada: 25 MP por escena, máximo dos escenas simultáneas (activa y
auxiliar). No se conservan canvases completos de todas las páginas.

## Exportación progresiva

PNG/JPG: página activa o pageId explícito; límites RC2 y cancelación conservados.
PDF: todas o subconjunto de IDs, orden del documento, RGB/CMYK rasterizado a
300 ppp, dimensiones/sangrado/cajas/marcas por página. No PDF/X ni vectores.

Job efímero autorizado por actor/empresa/diseño/revisión: crear, subir una página,
finalizar o cancelar. Un upload/bitmap a la vez; Sharp/pdf-lib reutilizados.
Máximo 24 páginas, 32 MP/página, 256 MP acumulados y 64 MiB de PDF codificado.
Un job por proceso, TTL inactivo 60 s y absoluto 5 min. No persistir bitmaps ni
jobs en SQL. Reautorizar recursos/revisión antes/después de cada etapa; una
revocación o modificación invalida el conjunto, sin entregar PDF parcial.
No prometer preempción de CPU nativa. Multiinstancia futura requiere afinidad
o almacenamiento de jobs compartido: no se despliega esa infraestructura aquí.

## Integración y aceptación

Sin panel nuevo ni rediseño visual. Integraciones mínimas: estado de página activa,
query pageId, metadatos de presencia por página y resumen multipágina al exportar.
Se documentan list/select/add/duplicate/remove/reorder/rename/transfer/thumbnail/
exportRange para la UI. Home usa la primera escena como portada; plantillas y
créditos recorren todas las páginas y autorizan todas las referencias Files.

Pruebas: normalización, cinco páginas, IDs/límites, primitivas/selección, historial
selectivo, colaboración cruzada, eliminación y duplicación concurrentes, MCP,
offline/reconexión/revocación, Files, plantillas, PDF con orientación mixta y
reapertura. SQL únicamente en PostgreSQL/Supabase Docker desechable. Regresión
Canvas/Notes/POS/SDK y privacidad. No atribuir a v7 el GO histórico de RC2.
