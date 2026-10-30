---
viewKey: /purchases/invoices
title: Facturas
summary: Facturas de proveedor, sus conceptos, archivos y estado de pago.
---
Las facturas registran lo que el proveedor te cobra.

- Filtra por estado (Borrador, Por aprobar, Por pagar, Pago parcial, Pagada o Cancelada), busca por folio o filtra por proveedor.
- "Nueva factura" abre el editor con proveedor, folio, fechas de emisión y vencimiento, conceptos y totales.
- Una factura se relaciona con una sola orden (una orden sí puede tener varias facturas); al relacionarla, Runly propone heredar los activos de la orden.
- Adjunta el PDF y el XML en la pestaña Archivos.
- Registra pagos totales o parciales con fecha, referencia y método. Los pagos no se editan: si uno está mal, se reversa con motivo y el original queda en el historial.
- El detalle muestra total, pagado y saldo pendiente, el vencimiento y, a un lado, el "Siguiente paso" (por ejemplo, pagar el saldo antes de la fecha o qué requisito de la política lo impide).
- Pestañas: Pagos (primero, con cada pago y reverso), Conceptos, Inventario, Archivos e Historial (correcciones y actividad).
- Desde la ficha de un activo, "Crear factura" abre este editor con el activo ya relacionado.
- Ya registrada, "Corregir datos" permite corregir el folio del proveedor, las observaciones y la fecha de vencimiento (mientras tiene saldo), con motivo e historial. El UUID fiscal, el proveedor, la moneda y los importes no se corrigen: cancela y registra el comprobante correcto. Requiere el permiso "Corregir facturas registradas".
