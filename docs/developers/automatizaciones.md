---
title: Automatizaciones del Constructor
summary: Cómo un módulo hecho con el Constructor crea o actualiza registros en Calendario, Notificaciones, Contactos, Inventario, Proyectos, Libro de cuentas, Flota y más al guardar un registro o cuando pasa algo en otro módulo, sin programar.
order: 4.4
---
Una **automatización** dice: «cuando pase esto, haz aquello en otro módulo». Por ejemplo: al crear una orden de servicio, agendar la visita en el Calendario; al cerrar la orden, avisar a quien la cerró; cuando un vehículo entra a mantenimiento, crear el contacto del taller.

Debajo usa los mismos [servicios entre módulos](/documentacion/desarrolladores/servicios-y-eventos) que un módulo programado a mano: tu módulo nunca toca las tablas de otro módulo; todo pasa por el código del módulo dueño, con sus validaciones y su bitácora.

## Crear una automatización

En el Constructor, pestaña **Automatizaciones** > *Nueva automatización*:

1. **Cuándo**
   - *Cuando se guarda un registro de este módulo*: elige la entidad y el momento (*Al crear*, *Al actualizar* o *Al crear o actualizar*).
   - *Cuando pasa algo en otro módulo*: elige el evento (por ejemplo, «Se actualizó un vehículo de la flota»).
   - *En un horario*: cada hora, día, semana (con día) o mes (con día del 1 al 28) a la hora que elijas, en la zona horaria de la instancia. Opcionalmente, *Para cada registro de* una entidad de tu módulo: la automatización corre una vez por cada registro que cumpla las condiciones (hasta 200 por ejecución).
2. **Solo si** (opcional): hasta 5 condiciones sobre un campo del registro o un dato del evento; deben cumplirse **todas**. Operadores: *Es igual a*, *Es distinto de*, *Contiene* (texto, sin distinguir mayúsculas), *Es mayor que*, *Es menor que*, *Tiene valor* y *Cambió* (solo al actualizar).
3. **Qué hacer**: una o más acciones (hasta 5 pasos) en otros módulos (crear un evento de calendario, enviar una notificación, crear o actualizar un contacto, registrar un movimiento…). Los pasos corren **en orden**. Entre dos acciones puedes agregar una **espera** (de 1 minuto a 30 días, hasta 2 por automatización): los pasos que siguen corren después, en segundo plano. Con *Si un paso falla, seguir con los siguientes* activado, un fallo no detiene los pasos que siguen; sin él (por defecto), los pasos restantes se omiten.
4. **Datos que se envían**: para cada dato de cada acción, de dónde sale su valor.

| Origen | Qué envía |
|---|---|
| Valor fijo | El valor que escribes (texto, número, lista separada por comas, sí/no). |
| Campo del registro / Dato del evento | El valor de ese campo del registro guardado, o ese dato del evento. |
| Texto con campos | Texto con campos entre llaves dobles: `Visita {{folio}} — {{cliente}}`. |
| Id del registro | El id del registro guardado (o el del registro del sistema, en un evento). |
| Usuario que guarda | La persona que guardó el registro (por ejemplo, como destinatario de una notificación). Solo al guardar un registro. |

Los datos de un paso solo pueden venir del registro o evento que dispara la automatización, no del resultado de un paso anterior. Los datos marcados *Obligatorio* deben tener origen. Runly agrega solo el origen (`sourceEntityId`, para que el evento o la notificación sepan de qué registro vienen) y la protección contra duplicados.

## Qué pasa al guardar

- La automatización corre **después** de guardar. Si falla (por ejemplo, el usuario no tiene permiso en el Calendario), **el registro se guarda igual** y la respuesta incluye el resultado:

```json
{ "data": { "id": "…", "folio": "OS-7" }, "automations": [{ "key": "agendar_visita", "ok": false, "error": "No tienes permiso para \"Crear eventos de calendario\"." }] }
```

- Corre con los permisos de **la persona que guarda**: si no puede crear eventos en el Calendario, la automatización tampoco.
- Al crear, la misma automatización no se repite para el mismo registro aunque la petición se reintente. Cada paso tiene su propia protección contra duplicados, así que un evento reintentado no repite los pasos que ya salieron bien.

## Automatizaciones por eventos del sistema

Corren en segundo plano unos segundos después del cambio, **sin una persona**. Por eso solo ofrecen las acciones que no necesitan a alguien detrás: notificaciones, contactos, artículos de inventario, actualizar tareas. Si fallan se reintentan (hasta 8 veces, con espera creciente) y nunca crean duplicados por el mismo evento.

| Evento | Datos disponibles |
|---|---|
| Se creó / actualizó un artículo de inventario | `id`, `name` (y `assetTag` al crear) |
| Se creó un contacto | `id` |
| Se creó una tarea de proyecto | `id`, `projectId`, `title` |
| Se creó / actualizó / canceló un evento de calendario | `id`, `title`, `startAt`, `sourceModule`, `sourceEntityId` |
| Se subió un archivo a Archivos | `id`, `name`, `mimeType` |
| Se creó / actualizó un vehículo de la flota | `id`, `plate`, `status` |
| Se completó una tarea de proyecto | `id`, `projectId`, `title` |
| Se creó un colaborador | `id`, `firstName`, `lastName` |
| Se aprobó / emitió una orden de compra | `id`, `caseId`, `status` |
| Una persona completó un curso | `id`, `courseId`, `learnerId` |

## Esperas y horarios

Las esperas y los horarios los ejecuta el **worker** (el proceso en segundo plano de Runly), no la petición del usuario. Por eso:

- Los pasos **después de una espera** y los de una automatización **por horario** solo ofrecen acciones que no necesitan a una persona detrás (las mismas que las automatizaciones por eventos). El dato *Usuario que guarda* sí se puede usar después de una espera: se guarda al momento de esperar y solo aporta valores (por ejemplo, a quién notificar), no permisos.
- Al llegar a una espera se guarda una copia de los datos del registro (hasta 64 KB) y la ejecución queda **En espera** en el Historial con la fecha en que continúa. Se puede **cancelar la espera** desde el Historial; los pasos que siguen ya no se ejecutan. Si la espera falla, se reintenta hasta 8 veces con espera creciente.
- Cada paso conserva su protección contra duplicados: un reintento nunca repite pasos que ya salieron bien ni encola dos veces la misma espera.
- Un horario dispara a lo sumo **una vez** la última ocurrencia pendiente si el servidor estuvo apagado; nunca acumula una cola de ejecuciones atrasadas.
- Si el módulo o la empresa están desactivados cuando toca continuar, la espera se reintenta y se da por fallida pasadas 24 horas.
- Un módulo publicado antes de que existieran las esperas debe **volver a publicarse** para usarlas; mientras tanto la espera falla con ese aviso.

## Historial de ejecuciones

Cada vez que corre una automatización (al guardar un registro o por un evento) queda una fila en el **Historial** de la pestaña, una vez publicado el módulo: resultado (*Correcta*, *Parcial* si algún paso falló y otro salió bien, *Falló*, *En espera*, *Cancelada*), momento, duración, el error y el resultado de cada paso (ok, falló u omitido). Se puede filtrar por automatización y resultado, y se conservan 90 días. Consultarlo requiere poder administrar módulos. Por API: `GET /modules/:key/automation-runs?automation=&status=&limit=`; las esperas pendientes con `GET /modules/:key/automation-jobs` y se cancelan con `DELETE /modules/:key/automation-jobs/:id`.

## Autorización al publicar

La pestaña muestra qué servicios usará el módulo. Al **publicar**:

- Si puedes administrar módulos (`core.modules.manage`), publicar los autoriza.
- Si no, el diálogo avisa que quedan **pendientes** y un administrador los autoriza en **Módulos > detalle del módulo**. Mientras tanto la automatización responde `service_not_granted`.

Al quitar una automatización y volver a publicar, se retira la autorización del servicio que ya no se usa. Lo que ya creó en otros módulos se conserva.

## En el paquete

El Constructor genera `api/automations.js` (las automatizaciones y su lógica), `api/events.js` (si hay automatizaciones por eventos) y agrega `consumes` y `events.subscribes` al manifiesto. No los edites a mano: se reescriben al publicar. En [modo desarrollador](/documentacion/desarrolladores/flujo-zip) el módulo ya es código: usa los servicios directamente.

Formato en la definición (`automations`): `trigger.when` es una condición o una lista de condiciones; `steps` es la lista de acciones (`{ service, args }`) y `onError` es `"stop"` (por defecto) o `"continue"`. El formato anterior con una sola `action` se sigue aceptando y se trata como un paso. No se puede usar `action` y `steps` a la vez.

Un disparador por horario se declara así: `trigger: { type: 'schedule', every: 'hour' | 'day' | 'week' | 'month', at: '08:00', weekday: 1, day: 15, entity?, when? }` (`at` no aplica a `every: 'hour'`; `weekday` 0 = domingo; `day` de 1 a 28). Una espera es un paso `{ type: 'delay', amount: 3, unit: 'minutes' | 'hours' | 'days' }` que no puede ser el primero ni el último ni ir junto a otra espera. El manifiesto del módulo lista los horarios en `schedules`.

Límites: hasta 20 automatizaciones por módulo, 5 pasos (las esperas cuentan) y 5 condiciones por disparador, y 2 esperas por automatización.
