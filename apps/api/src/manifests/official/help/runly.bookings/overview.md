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

### Publicación online

La modalidad online o híbrida prepara el sistema para que los clientes reserven solos. El portal público todavía no está disponible; cuando llegue usará estos mismos servicios, horarios y políticas.
