---
viewKey: /inventory/custodies
title: Resguardos
summary: Entregas y devoluciones de equipo firmadas por el colaborador, con folio y documento en el formato de tu empresa.
---
Un resguardo es el documento formal con el que entregas (o recibes de vuelta) equipo a un colaborador: lleva folio, la lista de articulos, las firmas de quien recibe y de quien entrega, y se genera con la plantilla Word o Excel de tu empresa.

- **Crear**: elige el colaborador, el tipo (Entrega o Devolucion), la fecha, los articulos (hasta 200) y, si tienes varias, la plantilla. El folio se asigna solo: `RES-AAAA-NNNN` para entregas y `DEV-AAAA-NNNN` para devoluciones.
- **Firmar**: captura las firmas en pantalla, o usa **Enviar enlace de firma** para que el colaborador firme desde su celular. El enlace vence en 24 horas y solo muestra el folio, la fecha y la lista de articulos.
- **Completar**: al completar se registran las asignaciones (entrega) o las devoluciones con la fecha del resguardo, se genera el documento final (PDF cuando Office esta configurado; si no, el Word o Excel lleno), se adjunta a cada articulo y se envia por correo al colaborador si hay correo configurado.
- Una entrega solo se completa si cada articulo esta dado de alta y no esta asignado a otra persona; una devolucion, si cada articulo esta asignado a ese colaborador.
- Lo que se firmo no cambia: los datos de cada articulo se guardan al momento de firmar. Si cambias el colaborador o los articulos de un borrador, las firmas capturadas se descartan.
- Un resguardo completado no se edita: cancelalo con un motivo y crea uno nuevo. Cancelar no deshace las asignaciones; registra una devolucion si hace falta.

## Plantillas

En **Catalogos > Plantillas** sube tu formato en `.docx` o `.xlsx`. Las etiquetas van entre llaves dobles, por ejemplo `{{folio}}`. Al subir, la plantilla se valida: si esta mal formada se rechaza, y las etiquetas que no reconoce se muestran como advertencia. Si no subes ninguna, se usa un formato basico.

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
