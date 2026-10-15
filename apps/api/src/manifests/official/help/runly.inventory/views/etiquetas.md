---
viewKey: /inventory/labels
title: Etiquetas
summary: Imprime etiquetas con codigo QR para tus equipos, en PDF para cualquier impresora o en ZPL para impresoras Zebra.
---
Etiquetas reune en una sola pantalla la cola de impresion, la vista previa y la configuracion de plantilla e impresora.

- **Cola**: busca equipos por folio, nombre o serie, o seleccionalos en **Inventario** y usa **Imprimir etiquetas**. Cada fila tiene su cantidad; **Aplicar a todos** copia una cantidad a toda la cola. Cada equipo muestra si ya esta etiquetado y cuantas veces.
- **Vista previa**: se actualiza sola con la primera etiqueta de la cola, tal como se imprimira.
- **Plantilla**: elige el tamano (50 x 25, 60 x 40, 100 x 50 mm o personalizado), la distribucion (QR a la izquierda, QR arriba o solo texto), los campos y su orden, y las opciones del QR. Los cambios se imprimen aunque no los guardes; con el permiso **Gestionar etiquetas de inventario** puedes guardarlos, crear plantillas nuevas y elegir la predeterminada.
- **Contenido del QR**: por defecto es un enlace al equipo, que sigue siendo valido aunque cambien sus datos. La opcion de datos incluidos guarda folio, serie y modelo como texto y puede quedar desactualizada.
- **Impresoras**: sin impresora guardada, **Imprimir** abre un PDF para el dialogo de impresion del sistema (imprime al tamano real). Una impresora ZPL descarga un archivo `.zpl`. La impresion directa por red o Bluetooth estara disponible en la app.
- **Descargar**: PDF o ZPL con todas las etiquetas, o PNG con la primera.
- **Historial**: cada impresion o descarga (PDF o ZPL) queda registrada en el equipo; la ficha del equipo muestra la seccion **Etiqueta / QR** con la ultima impresion y el historial. Si un equipo ya tenia etiqueta, Runly te pide confirmar la reimpresion.
- En **Inventario**, la columna **Etiqueta** y el filtro **Etiqueta: Sin etiquetar** muestran que equipos faltan por etiquetar.
