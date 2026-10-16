---
viewKey: /inventory/labels
title: Etiquetas
summary: Selecciona activos, disena la etiqueta con vista previa en vivo e imprime en rollo, en hoja carta o por Bluetooth.
---
Etiquetas es un estudio en tres pasos: **Seleccionar** los activos, **Disenar** la etiqueta e **Imprimir**. En computadora los activos quedan a la izquierda y el diseno con la vista previa a la derecha; en el telefono la barra inferior cambia de paso y el boton del ojo muestra la etiqueta en cualquier momento.

- **Seleccionar**: la busqueda es la misma de **Inventario** (nombre, folio, serie, numero de activo, modelo, marca, tipo, ubicacion, asignado, factura, notas y campos personalizados). Si el texto coincide en un campo que no se ve, la fila dice en cual. Filtra por **Todas / Sin etiquetar / Etiquetadas**, tipo y ubicacion. Marca cada activo o usa la casilla superior para seleccionar todos los resultados (hasta 1000). Cada activo seleccionado tiene sus copias; **Solo seleccionados** muestra la seleccion, permite **Copias para todos** y **Quitar todos**. Tambien puedes llegar con equipos ya elegidos desde **Inventario** o **Escanear** con **Imprimir etiquetas**.
- **Plantilla**: Estandar, Compacta, Solo codigo y las tuyas aparecen como botones. Los cambios se imprimen aunque no los guardes; con el permiso **Gestionar etiquetas de inventario** puedes actualizar la plantilla, **Guardar como plantilla**, elegir la predeterminada o eliminarla.
- **Tamano e impresora**: elige la impresora (con su forma de envio) y el tamano del rollo: 50 x 25, 50 x 30, 60 x 40, 75 x 50, 100 x 50 mm o personalizado.
- **Composicion**: QR a la izquierda, QR arriba, Solo QR o Solo texto.
- **Contenido**: activa hasta 6 campos (folio, nombre, serie, modelo, ubicacion, empresa, numero de activo, tipo, marca, asignado a) y ordenalos arrastrando o con las flechas; el primero va destacado. **Mostrar nombre del campo** imprime "Serie: ABC" y **Tamano del texto** fija la letra (o la deja automatica).
- **Codigo QR** (avanzado): por defecto es un enlace a la pagina publica del equipo, que sigue valido aunque cambien sus datos. La opcion de datos incluidos guarda folio, serie y modelo como texto y puede quedar desactualizada.
- **Salida**: **Rollo** imprime una etiqueta por pagina al tamano exacto. **Hoja carta** acomoda las etiquetas en cuadricula (columnas, filas, separacion y margen, con dibujo de la hoja y **Llenar la hoja**); solo aplica al PDF, imprime al 100 % sin ajustar a la pagina.
- **Vista previa**: se genera en el servidor tal como se imprimira, a escala (**Ajustar**, **Real** o **200 %**); con varios activos usa las flechas para revisar cada etiqueta. Si el texto no cabe, aparece un aviso.
- **Imprimir**: sin impresora guardada abre un PDF para el dialogo del sistema. Una impresora ZPL descarga un `.zpl`; una de red descarga el archivo para enviarlo desde una computadora de la misma red; una Bluetooth imprime directo desde la app Android. **Descargar** genera PDF o ZPL con todas las etiquetas, o PNG con una.
- **Historial**: muestra las impresiones recientes (quien, cuando, plantilla, impresora y activos). **Reimprimir** carga esos activos con sus copias. Si un activo ya tenia etiqueta, Runly pide confirmar la reimpresion, que tambien queda registrada.
- El ultimo diseno usado se recuerda en este dispositivo para cada empresa.
- **Pagina publica** (con el permiso de gestion) define que datos muestra la pagina que abre el QR. **Impresoras** se administran desde el boton junto al selector de impresora.
