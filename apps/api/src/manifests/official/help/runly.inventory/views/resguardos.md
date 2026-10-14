---
viewKey: /inventory/custodies
title: Resguardos
summary: Entregas y devoluciones de equipo firmadas por el colaborador, con folio y documento en el formato de tu empresa.
---
Un resguardo es el documento formal con el que entregas (o recibes de vuelta) equipo a un colaborador: lleva folio, la lista de articulos, las firmas de quien recibe y de quien entrega, y se genera con la plantilla Word o Excel de tu empresa.

- **Crear**: elige el tipo (Entrega o Devolucion) y el colaborador; despues, en el detalle, agrega los articulos (hasta 200), la fecha, las observaciones y, si tienes varias, la plantilla. El folio se asigna solo: `RES-AAAA-NNNN` para entregas y `DEV-AAAA-NNNN` para devoluciones.
- **Quien entrega**: por defecto eres tu. Para poner a otro usuario necesitas el permiso **Generar resguardos a nombre de otra persona**.
- **Firmar**: captura las firmas en pantalla, o usa **Enviar enlace de firma** para que el colaborador firme desde su celular; puedes enviarle el enlace por correo. El enlace (con la forma `/app/p/custody/...`) vence en 24 horas, se ve bien en el celular y muestra el folio, la fecha, el departamento y puesto del colaborador, quien entrega y la lista de articulos (nunca su numero de empleado ni su correo).
- **Firma guardada**: guarda tu firma en tu perfil para aplicarla con un clic como quien entrega. Si alguien con el permiso **Generar resguardos a nombre de otra persona** te pone como quien entrega, solo puede usar tu firma guardada si en tu perfil activaste **Permitir que otros usen mi firma**. Cada uso queda en la bitacora con quien la aplico. Borrar o cambiar tu firma guardada no modifica los resguardos ya firmados.
- **Se completa solo**: en cuanto el resguardo tiene las dos firmas (quien recibe y quien entrega, en cualquier orden, en pantalla, con firma guardada o desde el enlace), se completa automaticamente. Si no se puede completar (por ejemplo, un articulo ya esta asignado a otra persona), las firmas se conservan, el resguardo sigue pendiente y el detalle muestra el motivo; corrige lo indicado y usa **Completar**.
- **Completar**: al completar se registran las asignaciones (entrega) o las devoluciones con la fecha del resguardo, se genera el documento final (PDF cuando Office esta configurado; si no, el Word o Excel lleno), se adjunta a cada articulo y se envia por correo al colaborador si hay correo configurado.
- Una entrega solo se completa si cada articulo esta dado de alta y no esta asignado a otra persona; una devolucion, si cada articulo esta asignado a ese colaborador.
- **Editar**: mientras el resguardo esta en borrador o pendiente de firma puedes cambiar todo desde el detalle. Cambiar el tipo, el colaborador o los articulos descarta las firmas capturadas (el enlace de firma sigue vigente); cambiar quien entrega descarta solo su firma; las observaciones, la fecha y la plantilla no afectan las firmas.
- **Firmas visibles**: una firma ya capturada se muestra en su recuadro. La firma de quien recibe no se puede reemplazar una vez capturada; solo se descarta si cambias el tipo, el colaborador, los articulos o los datos de un articulo (Runly te pide confirmarlo). La de quien entrega se puede reemplazar con **Volver a firmar** mientras el resguardo no este completado.
- **Tamano de la firma**: todas las firmas se guardan recortadas a su trazo y con el mismo tamano, sin importar el dispositivo, asi se ven igual en el documento.
- **Corregir datos de un articulo**: en la tabla de articulos haz clic en una celda (Tipo / marca, Modelo, Serie, Etiqueta, Factura o Caracteristicas, por ejemplo "16 GB RAM, 512 GB SSD"), escribe y presiona Enter; Esc cancela. Las celdas editadas se marcan y conservan tu texto aunque el articulo cambie en el inventario; deja la celda vacia para volver al dato del articulo. Editar un articulo descarta las firmas capturadas.
- Lo que se firmo no cambia: los datos de cada articulo se guardan al momento de firmar.
- Un resguardo completado no se edita: cancelalo con un motivo y crea uno nuevo. Cancelar no deshace las asignaciones; registra una devolucion si hace falta.

## Plantillas

En **Catalogos > Plantillas** sube tu formato en `.docx` o `.xlsx`. Las etiquetas van entre llaves dobles, por ejemplo `{{folio}}`. Al subir, la plantilla se valida: si esta mal formada se rechaza, y las etiquetas que no reconoce se muestran como advertencia. Una plantilla sin ninguna etiqueta se acepta, pero con la advertencia de que el documento saldra sin datos; la lista de plantillas muestra cuantas etiquetas detecto cada una. Si no subes ninguna, se usa un formato basico.

Si subes tu formato en blanco (un Word sin etiquetas), usa **Sugerir etiquetas** en su fila: Runly reconoce los campos de tu propio formato (Fecha, Nombre, Numero de empleado, Area o Departamento, Puesto, Folio, Comentarios), la tabla de equipos por sus encabezados (Tipo / Marca, Modelo, Serie, Activo, Factura, Caracteristicas) y las firmas ("Recibi equipo", "Entrega"), y coloca las etiquetas en las celdas vacias que les corresponden. Te muestra que coloco y que no encontro; puedes **Descargar para revisar** en Word o **Aplicar a la plantilla** directamente. Tu archivo solo se reemplaza si eliges aplicar. Por ahora funciona con Word (.docx).

Para cambiar una plantilla, usa **Descargar** en su fila, editala en Word o Excel respetando las etiquetas y subela con **Reemplazar archivo**: conserva el nombre, si es predeterminada y los resguardos que la usan (los documentos ya generados no cambian). Si empiezas desde cero, **Descargar ejemplo** te da un formato basico con todas las etiquetas ya colocadas.

La lista de articulos es dinamica: escribe una sola fila con `{{#items}}` en la primera celda y `{{/items}}` en la ultima, y esa fila se repite por cada articulo. En Word conviene marcar la fila de titulos como "Repetir como fila de encabezado" y desmarcar "Permitir que las filas se dividan entre paginas" para que un resguardo largo pase bien a la segunda hoja.

| Etiqueta | Valor |
|---|---|
| `{{folio}}`, `{{date}}`, `{{kind}}` | Folio, fecha (dd/mm/aaaa) y tipo (Entrega o Devolucion) |
| `{{receiverName}}`, `{{receiverEmployeeNumber}}`, `{{receiverDepartment}}`, `{{receiverJobTitle}}`, `{{receiverEmail}}` | Datos del colaborador que recibe |
| `{{delivererName}}` | Quien entrega |
| `{{comments}}` | Observaciones |
| `{{company.name}}`, `{{company.legalName}}`, `{{company.taxId}}` | Datos de la empresa |
| `{{#items}}` ... `{{/items}}` | Repite el contenido por cada articulo. Dentro: `{{index}}`, `{{typeBrand}}`, `{{model}}`, `{{serialNumber}}`, `{{assetNumber}}`, `{{invoiceNumber}}`, `{{features}}`. Se rellenan al menos 2 filas |
| `{{%receiverSignature}}`, `{{%delivererSignature}}` | Imagen de la firma (220 x 88 px). En Word debe ir sola en su parrafo |

- **Word**: para repetir una fila de tabla, pon `{{#items}}` en la primera celda de la fila y `{{/items}}` en la ultima.
- **Excel**: la fila que contiene `{{#items}}` se repite por cada articulo (con su formato); el resto de las celdas se reemplazan en su lugar y las firmas se colocan en la celda de la etiqueta.
