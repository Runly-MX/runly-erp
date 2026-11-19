---
title: Reservaciones
summary: Sistemas de reservaciones de la empresa con servicios, horarios, recursos compartidos, citas individuales y sesiones con cupo, sin dobles reservaciones.
---
Reservaciones sirve para administrar citas y lugares en sesiones: consultorios, salas, clases, mesas, equipos o cualquier servicio con horario. Cada empresa puede tener varios **sistemas de reservaciones**, cada uno con sus propios servicios, horarios, equipo y políticas.

### Cómo se organiza

- **Sistemas**: los sistemas que puedes ver, con su modalidad, zona horaria, tu rol y las próximas reservaciones. Entra a uno para configurarlo.
- **Agenda**: la ocupación de un sistema por día, semana o mes, con filtros de servicio, recurso y estado.
- **Reservaciones**: la lista con búsqueda por cliente, filtros de fechas, estado, servicio y recurso, y exportación a Excel.
- **Recursos**: las personas, salas, equipos y mesas que se pueden reservar. Un recurso puede servir a varios sistemas y nunca se reserva dos veces al mismo tiempo, aunque esté en sistemas distintos.

### Roles en cada sistema

- **Administrador**: configura el sistema (servicios, recursos, horarios, excepciones, sesiones, equipo y políticas) y opera reservaciones.
- **Agente**: crea, confirma, rechaza, reprograma, cancela y marca reservaciones como completadas o no presentadas.
- **Lector**: consulta la agenda y las reservaciones, sin cambiar nada.

Al agregar a una persona a un sistema obtiene acceso a Reservaciones; al quitarla del último sistema lo pierde. Los administradores de la empresa ven todos los sistemas. Para crear sistemas y administrar recursos se necesita el permiso **Crear sistemas y recursos de reservaciones**.

### Configurar un sistema

1. En **Sistemas**, usa **Nuevo sistema**: nombre, identificador, modalidad (interno, online o híbrido) y zona horaria.
2. En **Recursos** (del sistema), marca qué personas, salas o equipos usa.
3. En **Servicios**, define lo que se reserva: duración, buffer previo y posterior, cada cuánto se ofrecen horarios y qué recursos lo atienden. Un servicio es una **cita individual** (ocupa un recurso) o una **sesión con cupo** (varias personas comparten una sesión programada).
4. En **Disponibilidad**, captura el horario semanal. Varios horarios en un mismo día marcan los descansos (por ejemplo 09:00 a 13:00 y 14:00 a 18:00). Cada horario puede tener vigencia (desde y hasta). Agrega **excepciones** para días festivos, bloqueos de un recurso o aperturas extra, y programa las **sesiones** de los servicios con cupo.
5. En **Configuración**, ajusta la anticipación mínima, hasta cuántos días se puede reservar y si las reservaciones requieren aprobación.

Todos los horarios se capturan y se muestran en la zona horaria del sistema, también en los cambios de horario de verano.

### Registrar y operar reservaciones

Con **Nueva reservación** eliges el servicio, la fecha y un horario libre. Los horarios que se muestran los calcula el motor de reservaciones con los horarios, excepciones, buffers y reservaciones existentes. Al guardar se vuelve a validar todo: si alguien tomó ese horario un instante antes, verás "Ese horario acaba de ocuparse" y podrás elegir otro. Puedes vincular un contacto o registrar solo el nombre, correo y teléfono del cliente.

En el detalle de una reservación aparecen solo las acciones válidas para su estado: confirmar o rechazar una pendiente, cancelar, reprogramar, y marcar como completada o no presentada cuando ya empezó. Cancelar, rechazar o marcar como no presentada libera el horario. Cada cambio queda en el **historial** con quién lo hizo y cuándo.

### Estados

Pendiente (espera aprobación y aparta el horario), Confirmada, Cancelada, Rechazada, Completada, No presentada y Expirada (una pendiente que no se confirmó a tiempo).

### Reservas online

En la pestaña **Reservas online** de un sistema activas **Publicar este sistema** y creas **páginas públicas**: una general o una por servicio, con su dirección (`.../app/p/reservar/tu-pagina`), servicios visibles, ubicación, indicaciones, políticas de cancelación, reprogramación y puntualidad, aviso de privacidad y color. Usa **Vista previa** para revisarla antes de publicarla y **Copiar enlace** para compartirla.

Tus clientes reservan sin crear cuenta: eligen servicio, fecha y hora libres, escriben sus datos, aceptan las políticas y reciben un folio y un correo con un **enlace personal** para consultar, reprogramar o cancelar. Si el sistema requiere aprobación, la reservación queda pendiente hasta que alguien del equipo la confirme.

En **Configuración** defines hasta cuántas horas antes el cliente puede cancelar o reprogramar en línea; tu equipo siempre puede hacerlo desde el ERP. Si cambias las políticas, los clientes nuevos deben aceptarlas de nuevo.

Desactivar la publicación no borra nada: los clientes conservan el acceso a lo que ya reservaron (consultar y cancelar), pero no se aceptan reservaciones nuevas. Si un cliente perdió o compartió su enlace, abre la reservación y usa **Enviar nuevo enlace al cliente**: el anterior deja de funcionar.

### Compartir e integrar

En cada página pública, **Compartir e integrar** te da tres formas de llevarla a tus clientes:

- **Enlace directo**, para redes sociales, WhatsApp, correo o un código QR.
- **Calendario integrado**: un código para pegar en tu sitio web. El calendario se muestra dentro de tu página y ajusta su altura al contenido.
- **Botón de reservación**: abre las reservaciones en una pestaña nueva. Funciona en cualquier sitio.

Por seguridad, el calendario integrado solo se muestra en los **sitios autorizados** que agregues ahí (por ejemplo `https://www.tunegocio.com`); en cualquier otro sitio el navegador lo bloquea. Tus sitios publicados con Runly Website ya están autorizados. En **Runly Website** también puedes usar el bloque **Reservaciones**: eliges la página (y, si quieres, un servicio) y cómo mostrarla: calendario integrado, botón o enlace.

Sin importar por dónde llegue, cada reservación usa los mismos horarios, reglas y validaciones de este sistema.

### Calendario y Automatizaciones

Cada reservación pendiente o confirmada aparece en **Calendario**, en un calendario "Reservaciones · nombre del sistema" que ven las personas del sistema. Se actualiza al reprogramar, confirmar, completar o marcar como no presentada, y desaparece al cancelar, rechazar o vencer. No incluye el correo, teléfono ni comentarios del cliente. Calendario solo refleja las reservaciones: los cambios se hacen en Reservaciones (el evento tiene el enlace **Abrir reservación**), y borrar un evento no libera el horario.

En **Automatizaciones** puedes usar como disparador cuando una reservación se crea, se confirma, se reprograma, se cancela, se rechaza, se completa, no se presenta el cliente o vence.
