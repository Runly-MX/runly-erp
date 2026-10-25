---
title: Automatizaciones del Constructor
summary: Cómo un módulo hecho con el Constructor crea o actualiza registros en Calendario, Notificaciones, Contactos, Inventario, Proyectos, Libro de cuentas, Flota y más al guardar un registro o cuando pasa algo en otro módulo, sin programar.
order: 4.4
---
Una **automatización** dice: «cuando pase esto, haz aquello en otro módulo». Por ejemplo: al crear una orden de servicio, agendar la visita en el Calendario; al cerrar la orden, avisar a quien la cerró; cuando un vehículo entra a mantenimiento, crear el contacto del taller.

Debajo usa los mismos [servicios entre módulos](/documentacion/desarrolladores/servicios-y-eventos) que un módulo programado a mano: tu módulo nunca toca las tablas de otro módulo; todo pasa por el código del módulo dueño, con sus validaciones y su bitácora.

## Dos vistas: Flujo y Formulario

Cada automatización se puede editar de dos maneras, y las dos modifican lo mismo (el interruptor **Flujo | Formulario** está en la tarjeta; se recuerda tu elección):

- **Flujo** (por omisión): la automatización como un hilo vertical, del disparador al último paso. La línea continua es lo que corre al momento; después de una espera o una aprobación la línea se vuelve punteada y gris: ahí todo corre en segundo plano. Toca o haz clic en un paso para editarlo (en pantallas anchas se edita en un panel a la derecha; en pantallas pequeñas se abre desde abajo). Agrega pasos con el **+** entre pasos o con la fila «Agregar un paso»; reordena arrastrando el asa o con `Alt` + flechas; quita un paso desde el panel o con `Supr`, y puedes deshacerlo desde el aviso. Las opciones que no se pueden usar en ese lugar aparecen desactivadas con la razón.
- **Formulario**: los mismos datos en una lista de campos.

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

## Probar una automatización

El botón **Probar** de cada automatización abre un diálogo donde escribes datos de ejemplo. Muestra si se cumplen las condiciones y, para cada paso, los datos exactos que enviaría (con los problemas que tendría contra el servicio). **No ejecuta nada ni guarda ningún dato**: es una simulación en tu navegador.

## Llamar a una URL

El paso **Llamar a una URL** envía los datos a un servidor externo (por ejemplo, un webhook de otra herramienta):

```json
{ "type": "http", "method": "POST", "url": "https://hooks.ejemplo.com/runly", "body": { "folio": { "from": "field", "field": "folio" } } }
```

- Método `POST`, `PUT` o `PATCH`; la dirección es **fija**, `https`, sin usuario, contraseña ni puerto. Los datos (`body`) usan los mismos orígenes que las acciones.
- El servidor recibe un JSON `{ module, automation, companyId, idempotencyKey, data }` con los encabezados `X-Runly-Idempotency-Key` (para que el receptor evite duplicados) y `X-Runly-Signature: sha256=<HMAC-SHA256 del cuerpo>`. No se pueden definir encabezados propios, porque una definición la ve cualquiera que use el Constructor y no debe llevar credenciales.
- Solo funciona con **destinos permitidos**: un administrador (`core.modules.manage`) los registra en el botón *Destinos permitidos* de la pestaña. Si el servidor no está en la lista, el paso falla con un mensaje claro y la ejecución queda en el Historial.
- Seguridad: se rechazan direcciones internas o privadas (también si el nombre se resuelve a una), no se siguen redirecciones, hay un límite de 10 segundos y 64 KB, y cualquier respuesta que no sea 2xx cuenta como fallo del paso.
- Se puede usar en cualquier disparador y después de una espera.

## Pedir aprobación

El paso **Pedir aprobación** detiene la automatización hasta que una persona decida:

```json
{ "type": "approval", "approvers": ["<id de usuario>"], "message": "Aprobar la orden {{folio}}" }
```

- Va entre dos acciones, solo uno por automatización, con 1 a 5 personas de la empresa. Los pasos que le siguen corren en segundo plano, como después de una espera.
- Las personas elegidas reciben una notificación y ven la solicitud en **Inicio > Aprobaciones**, donde pueden **Aprobar** o **Rechazar** (con motivo opcional). Basta una decisión; después ya no se puede cambiar.
- Aprobar continúa la ejecución; rechazar la termina como *Rechazada* y los pasos restantes no se ejecutan. Si nadie decide en 7 días, la ejecución se cancela. Cada decisión queda en la bitácora de auditoría.
- Por API: `GET /automation-approvals/mine` y `POST /automation-approvals/:id/decide` con `{ "decision": "approve" | "reject", "comment" }`.

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

## Automatizaciones de la empresa (sin módulo)

No hace falta crear un módulo para automatizar: en **Runly Core > Automatizaciones** un administrador (`core.modules.manage`) crea automatizaciones que pertenecen a la empresa activa. Usan las mismas tarjetas, condiciones, pasos, esperas, aprobaciones, llamadas HTTP, *Probar* e *Historial* que las del Constructor, con estas diferencias:

- El disparador es **un evento del sistema** (los de la tabla de arriba) o **un horario** sin registros. No existe «cuando se guarda un registro» porque no hay una entidad de por medio.
- Los pasos solo ofrecen las acciones que no necesitan a una persona detrás, porque todo corre en segundo plano.
- Cada automatización se guarda por separado con su botón **Guardar**; si tiene errores, se muestran debajo de la tarjeta. Guardar autoriza los servicios que usa para esa empresa (y quita los que ya no se usan). Hasta 50 por empresa.
- El Historial y las esperas pendientes se consultan con la clave `system.automations`: `GET /modules/system.automations/automation-runs` y `.../automation-jobs`.

Por API: `GET|POST /automations`, `PUT|DELETE /automations/:key` y `GET /automations/catalog`, con el mismo formato de `automations[]` de una definición (`key`, `label`, `enabled`, `trigger`, `steps`, `onError`).

## Autorización al publicar

La pestaña muestra qué servicios usará el módulo. Al **publicar**:

- Si puedes administrar módulos (`core.modules.manage`), publicar los autoriza.
- Si no, el diálogo avisa que quedan **pendientes** y un administrador los autoriza en **Módulos > detalle del módulo**. Mientras tanto la automatización responde `service_not_granted`.

Al quitar una automatización y volver a publicar, se retira la autorización del servicio que ya no se usa. Lo que ya creó en otros módulos se conserva.

## En el paquete

El Constructor genera `api/automations.js` (las automatizaciones y su lógica), `api/events.js` (si hay automatizaciones por eventos) y agrega `consumes` y `events.subscribes` al manifiesto. No los edites a mano: se reescriben al publicar. En [modo desarrollador](/documentacion/desarrolladores/flujo-zip) el módulo ya es código: usa los servicios directamente.

Formato en la definición (`automations`): `trigger.when` es una condición o una lista de condiciones; `steps` es la lista de acciones (`{ service, args }`) y `onError` es `"stop"` (por defecto) o `"continue"`. El formato anterior con una sola `action` se sigue aceptando y se trata como un paso. No se puede usar `action` y `steps` a la vez.

Un disparador por horario se declara así: `trigger: { type: 'schedule', every: 'hour' | 'day' | 'week' | 'month', at: '08:00', weekday: 1, day: 15, entity?, when? }` (`at` no aplica a `every: 'hour'`; `weekday` 0 = domingo; `day` de 1 a 28). Una espera es un paso `{ type: 'delay', amount: 3, unit: 'minutes' | 'hours' | 'days' }`; esperas y aprobaciones no pueden ser el primer ni el último paso ni ir una junto a otra. El manifiesto del módulo lista los horarios en `schedules`.

Límites: hasta 20 automatizaciones por módulo, 5 pasos (las esperas cuentan) y 5 condiciones por disparador, 2 esperas y 1 aprobación por automatización, y 20 datos por llamada HTTP.
