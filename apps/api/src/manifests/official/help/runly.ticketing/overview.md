---
title: Boletos
summary: Eventos con funciones, boletos gratuitos y de taquilla con QR, página pública, envío por correo y control de acceso sin sobreventa.
---
Boletos sirve para organizar eventos con una o varias **funciones** (fecha, hora y lugares de la sala), entregar **boletos con código QR** y controlar la entrada. Los lugares de cada función los cuida el motor de Reservaciones: nunca se emiten más boletos que lugares, aunque mucha gente pida al mismo tiempo.

### Cómo se organiza

- **Evento**: título, descripción, lugar, portada y condiciones (máximo por orden, nombre de cada asistente, transferencias).
- **Funciones**: cada presentación con su fecha, hora y lugares. Puedes **moverla** (los boletos siguen siendo válidos y su QR no cambia) o **cancelarla** cuando ya no tiene boletos vigentes.
- **Tipos de boleto**: gratuitos o con precio. Los gratuitos se obtienen en taquilla o en la página pública; los de precio se cobran en Caja.
- **Equipo**: administradores, taquilleros y quienes solo consultan.

### Página pública

En **Publicación** activas **Publicar el evento** y **Entregar boletos gratuitos en línea**. La página (`.../app/p/boletos/tu-evento`) muestra la portada, las funciones, los tipos de boleto con su disponibilidad y las condiciones. Tus asistentes eligen función y cantidad, escriben su nombre y correo, aceptan las condiciones y reciben sus boletos al instante, sin crear cuenta. Los boletos con precio se indican como «se compra en taquilla»: todavía no hay cobro en línea.

Usa **Vista previa** para revisar la página antes de publicarla, **Compartir** para mandar el enlace y **Código de inserción** para mostrarla en otro sitio. Solo los **sitios autorizados** (y tus sitios de Runly Website) pueden mostrarla dentro de su página.

### Correos, reenvío y reemisión

- Al emitirse, el comprador recibe por correo todos sus boletos con su QR; si escribió el correo de un asistente, ese asistente recibe también el suyo.
- **Reenviar** manda **el mismo QR** otra vez (por ejemplo, si borraron el correo). No cambia nada del boleto. El comprador puede hacerlo desde su enlace «Ver mis boletos» y el equipo desde la orden.
- **Reemitir** crea un **QR nuevo** y el anterior deja de servir. Úsalo si un QR se perdió o se compartió por error.
- **Transferir** cambia el titular (si el evento lo permite) y también reemplaza el QR.
- Los boletos emitidos antes de los envíos por correo no se pueden reenviar: hay que reemitirlos.

### Integraciones

- **Runly Website**: el bloque **Evento con boletos** muestra un evento publicado como tarjeta, portal integrado, botón o enlace.
- **Calendario**: cada función aparece en el calendario del equipo del evento y se actualiza si la mueves o la cancelas. Los asistentes no aparecen en Calendario.
- **Automatizaciones**: puedes reaccionar cuando se emite, cancela, reemite o transfiere un boleto, y cuando alguien entra. Los eventos solo llevan identificadores y estados, nunca nombres, correos ni códigos.

### Control de acceso

En **Control de acceso** eliges la función y lees el QR con la cámara, o escribes el folio del boleto. Cada boleto entra una sola vez.
