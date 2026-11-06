---
viewKey: /purchases/settings
title: Configuración
summary: Qué etapas usa tu empresa, en qué orden y cuándo son obligatorias.
---
La configuración define el proceso de compras de tu empresa.

- Elige una configuración lista (Simple, Básico, Compras con Inventario o Completo) o Personalizado; la vista previa muestra el flujo resultante.
- Activa o desactiva capacidades: solicitudes, cotizaciones, aprobaciones, órdenes, recepciones, facturas, pagos y relación con inventario. Lo desactivado desaparece del menú y de las pantallas.
- Para cada etapa elige un modo: Obligatoria, Opcional, Condicional o Desactivada.
- Agrega políticas para las etapas condicionales, por ejemplo "montos mayores a 50,000 requieren aprobación" o "más de 10,000 requieren tres cotizaciones".
- Solo quien tiene el permiso para configurar el flujo de compras puede guardar cambios.
- En "Numeración de folios" defines el formato de cada documento, por ejemplo OC-{AAAA}-{N:4} para OC-2026-0012. {N} es el consecutivo (obligatorio), {AAAA} y {AA} el año, {MM} el mes. El formato solo se usa cuando el folio se deja vacío; déjalo en blanco para volver al predeterminado.

### Control documental

Si tu empresa solo necesita llevar el registro de que documentos respaldan cada compra (sin importes ni pagos), usa **Usar Control documental**:

- Las nuevas ordenes y facturas se registran solo con su referencia (por ejemplo el folio de la factura), su fecha, los documentos relacionados y los activos. No piden importes, pagos ni recepciones.
- Solicitudes, cotizaciones, aprobaciones, recepciones y pagos dejan de ofrecerse. Lo ya registrado no cambia.
- **Inicio** muestra cuantas referencias hay y cuales faltan por completar. Completar una referencia queda auditado, igual que cualquier correccion.
- Desde el formulario de un activo de Inventario puedes registrar una referencia nueva; Runly sugiere primero las parecidas para evitar duplicados.
- La importacion financiera (MirAI o ChatGPT/Claude) no esta disponible en este modo.
- **Volver al modo financiero** reactiva importes y pagos con la plantilla Basico (puedes cambiarla despues). Las referencias documentales ya registradas siguen siendo documentales.
