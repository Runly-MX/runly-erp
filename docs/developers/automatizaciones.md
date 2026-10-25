---
title: Automatizaciones del Constructor
summary: Cómo un módulo hecho con el Constructor crea o actualiza registros en Calendario, Notificaciones, Contactos, Inventario, Proyectos, Libro de cuentas, Flota y más al guardar un registro o cuando pasa algo en otro módulo, sin programar.
order: 4.4
---
Una **automatización** dice: «cuando pase esto, haz aquello en otro módulo». Por ejemplo: al crear una orden de servicio, agendar la visita en el Calendario; al cerrar la orden, avisar a quien la cerró; cuando un vehículo entra a mantenimiento, crear el contacto del taller.

Debajo usa los mismos [servicios entre módulos](/documentacion/desarrolladores/servicios-y-eventos) que un módulo programado a mano: tu módulo nunca toca las tablas de otro módulo; todo pasa por el código del módulo dueño, con sus validaciones y su bitácora.

## Dos vistas: Lienzo y Formulario

Cada automatización se puede editar de dos maneras, y las dos modifican lo mismo (el interruptor **Flujo | Formulario** está en la tarjeta; se recuerda tu elección):

- **Lienzo** (por omisión): la automatización como bloques conectados con flechas sobre una superficie que puedes mover y acercar (arrastra el fondo; `Ctrl` + rueda o pellizco para el zoom; **Ajustar** muestra todo). Las flechas que salen de una espera o una aprobación son punteadas: ahí todo corre en segundo plano. Haz clic o toca un bloque para editarlo (en pantallas anchas en un panel a la derecha; en pantallas pequeñas se abre desde abajo). Agrega bloques con el **+** de cada flecha, con el cuadro punteado del final o **arrastrando un bloque desde «Agregar bloque»** hasta un «+»; reordena arrastrando el asa del bloque o con `Alt` + flechas; quita un bloque desde el panel o con `Supr` y deshazlo desde el aviso. Lo que no se puede hacer en ese lugar aparece desactivado con la razón.
- **Formulario**: los mismos datos en una lista de campos.

## Crear una automatización

En el Constructor, pestaña **Automatizaciones** > *Nueva automatización*:

1. **Cuándo**
   - *Cuando se guarda un registro de este módulo*: elige la entidad y el momento (*Al crear*, *Al actualizar* o *Al crear o actualizar*).
   - *Cuando pasa algo en otro módulo*: elige el evento (por ejemplo, «Se actualizó un vehículo de la flota»).
   - *En un horario*: cada hora, día, semana (con día) o mes (con día del 1 al 28) a la hora que elijas, en la zona horaria de la instancia. Opcionalmente, *Para cada registro de* una entidad de tu módulo: la automatización corre una vez por cada registro que cumpla las condiciones (hasta 200 por ejecución).
2. **Solo si** (opcional): hasta 5 condiciones sobre un campo del registro o un dato del evento; deben cumplirse **todas**. Operadores: *Es igual a*, *Es distinto de*, *Contiene* (texto, sin distinguir mayúsculas), *Es mayor que*, *Es menor que*, *Tiene valor* y *Cambió* (solo al actualizar).
3. **Qué hacer**: una o más acciones (hasta 12 bloques) en otros módulos (crear un evento de calendario, enviar una notificación, crear o actualizar un contacto, registrar un movimiento…). Los pasos corren **en orden**. Entre dos acciones puedes agregar una **espera** (de 1 minuto a 30 días, hasta 2 por automatización): los pasos que siguen corren después, en segundo plano. Con *Si un paso falla, seguir con los siguientes* activado, un fallo no detiene los pasos que siguen; sin él (por defecto), los pasos restantes se omiten.
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

### Acomodar el lienzo

- **Mueve cualquier bloque** arrastrándolo para acomodar el lienzo a tu gusto; el orden del flujo no cambia (para eso se usa el asa del bloque). La disposición se guarda con la automatización y es solo visual.
- El botón **Disposición** (abajo a la izquierda) ofrece *Horizontal*, *Vertical* y *Ordenar* (vuelve a alinear los bloques). Por omisión, el lienzo elige horizontal o vertical según su ancho.
- El **panel de edición** se puede ensanchar arrastrando su borde izquierdo (o con las flechas del teclado) y con el botón *Ampliar panel*; recuerda el ancho que dejaste.

### Usar lo que devuelve un bloque

Cada bloque que crea o cambia algo devuelve datos (por ejemplo, *Crear contactos* devuelve su identificador, nombre, correo y teléfono). Los bloques que van **después** pueden usarlos como si fueran datos del disparador: en «Texto con datos» aparecen como botones *Insertar* («Paso 1 · Identificador») y en los textos se escriben como `{{paso1_id}}`, `{{paso1_name}}`... (el número es el del bloque). En «Un dato disponible» se eligen de la lista. Si una espera o una aprobación los separa, los datos se conservan.

### Consola de ejecución

El botón **Consola** muestra las últimas ejecuciones de la automatización. Al elegir una ves los **datos que llegaron**, y por cada bloque su resultado (correcto, con error, omitido o en espera), cuánto tardó, **qué datos envió**, qué devolvió y, si falló, el **error completo** (copiable). El bloque de cada ejecución seleccionada se marca en el lienzo con una insignia: ✓ correcto, ✗ con error, – omitido. Se actualiza sola mientras está abierta.

## Condiciones Sí / No (dividir el flujo)

Una **condición** parte el flujo en dos caminos: si se cumplen todas sus comprobaciones el flujo sigue por **«Sí»**, si no por **«No»**. Después, los dos caminos **se juntan** en el siguiente bloque. En el lienzo, el camino «Sí» se dibuja arriba (o a la izquierda en vertical) y el «No» abajo; el «+» de cada camino agrega bloques solo a ese camino.

- Comprueba el mismo tipo de condiciones que *Solo si* (igual, distinto, contiene, mayor, menor, tiene valor), sobre un dato del disparador o el resultado de un bloque anterior. «Cambió» no está disponible.
- Hasta **3 condiciones** por automatización; no se pueden anidar (una condición dentro del camino de otra). Cada condición necesita al menos un bloque en alguno de sus caminos y un bloque después, donde se juntan.
- Los bloques del camino que no se tomó se registran como *Omitidos* en la consola («el flujo siguió por el otro camino»), y los pasos de después pueden usar datos de bloques que sí corrieron. Si el flujo espera o pide una aprobación dentro de un camino, al continuar se respeta el mismo camino.
- Al quitar un bloque de un camino, el camino se acorta; al quitar la condición, sus bloques quedan en el flujo principal. Un bloque solo se reordena dentro de su propio camino.

En el archivo, una condición es un paso `{ "type": "branch", "when": <condición o lista>, "yes": N, "no": M }`: los siguientes `N` pasos de la lista son el camino «Sí», los siguientes `M` el camino «No», y el flujo sigue después de ellos. Así los números de bloque (`paso<N>_...`), el historial y las esperas no cambian.

## Duplicar, exportar e importar

En el módulo **Automatizaciones** cada tarjeta (y el menú «Más opciones» del editor) ofrece:

- **Duplicar**: abre una copia sin guardar, llamada «Copia de ...», **en pausa** y con su propia URL de webhook (se crea al guardar). Conserva destinatarios y aprobadores, porque es la misma empresa.
- **Exportar a archivo**: descarga `nombre.runly-automation.json` con el flujo (disparador, bloques, condiciones y disposición del lienzo). El archivo **no** incluye identificadores, la URL secreta del webhook ni el historial, y siempre queda en pausa.
- **Importar** (botón de la lista): lee un archivo exportado, aunque venga de otra empresa o instancia, y abre el borrador para que lo revises antes de guardar. Como las personas pertenecen a la empresa que exportó, **se quitan los destinatarios y aprobadores**: hay que volver a elegirlos. Los archivos de una versión más nueva de Runly o que no sean una automatización se rechazan con un mensaje.

Al guardar se valida igual que cualquier automatización, y los permisos de servicio se autorizan en ese momento. Una llamada HTTP importada solo funciona si su servidor está en la lista de destinos de la instancia.

## Enviar correos y generar reportes

Dos bloques de acción pensados para las automatizaciones de la empresa (también se pueden autorizar a un módulo que reaccione a eventos):

- **Enviar correos** (`runly.notifications:email.send`): elige a las personas de la empresa en *Destinatarios* y/o escribe una dirección en *Correo externo* (hasta 20 en total). Usa el correo de la empresa o del sitio web y, si no hay, el de la plataforma; si ninguno está configurado, el paso falla con un mensaje claro en la consola. *Asunto* y *Mensaje* aceptan datos con `{{campo}}`; el mensaje es texto plano. *Archivo adjunto (id)* adjunta un archivo de Archivos (máx. 10 MB).
- **Generar reportes CSV o Excel** (`runly.files:report.generate`): elige *Qué incluye el reporte* (contactos, inventario o vehículos de la flota), el formato y, opcionalmente, un texto para filtrar. El archivo se guarda en Archivos de la empresa y el paso devuelve `paso<N>_id` y `paso<N>_name`.

Para mandar el reporte por correo, pon primero el bloque de reporte y en el correo usa como *Archivo adjunto* el dato «Identificador» de ese paso (`{{paso1_id}}`). Por seguridad, las automatizaciones de la empresa envían como máximo **200 correos por hora**; al llegar al límite el bloque falla con un mensaje claro. Si el módulo Automatizaciones se desactiva para la empresa, nada de lo suyo se ejecuta (eventos, webhooks, horarios ni esperas).

El CSV lleva marca de orden de bytes para que Excel respete los acentos, y las celdas que parecen fórmulas se neutralizan.

## Recibir datos de otro sistema (webhook)

Una automatización de la empresa puede empezar cuando **otro sistema te envía un mensaje**. En el lienzo elige el disparador «Cuando otro sistema me envía datos»; al guardar, Runly le asigna una **URL secreta**:

```bash
curl -X POST "https://tu-instancia/public/hooks/<token-secreto>"   -H "Content-Type: application/json"   -d '{"cliente":{"nombre":"Ana"},"total":1250}'
```

- El cuerpo debe ser un **JSON** de hasta 64 KB. Los datos anidados se aplanan: `cliente.nombre` llega como el campo `cliente_nombre` (hasta 3 niveles y 100 campos; las listas llegan como texto JSON).
- **Campos que recibe**: envía un mensaje de prueba y aparece en el panel como «Último mensaje recibido»; con *Usar los campos de este mensaje* quedan declarados y puedes usarlos en condiciones y en los datos de los demás bloques (por ejemplo `Pedido de {{cliente_nombre}}`).
- Respuestas: `202` recibido (se procesa en segundo plano, con reintentos); `400` o `415` si no es un JSON válido; `403` si el origen no está permitido; `404` si la URL no existe o la automatización está pausada; `413` o `429` si pasa de 64 KB o de 60 mensajes por minuto.
- **Seguridad**: la URL es la llave; trátala como una contraseña y genérala de nuevo con *Generar otra* si se filtra (la anterior deja de funcionar al instante). Además, un administrador puede limitar **de dónde** se aceptan mensajes con la lista de **orígenes permitidos** (IP o redes como `203.0.113.0/24`) en **Conexiones**; si está vacía, acepta a cualquiera que tenga la URL. Detrás de un proxy, configura `RUNLY_TRUSTED_PROXIES` para que se use la IP real.
- Los pasos que siguen corren en segundo plano, igual que con un evento. Por API: `GET /automations/:key/webhook/events`, `POST /automations/:key/webhook/regenerate`, `GET|PUT /automations/webhook-origins`.

## Conexiones externas

El botón **Conexiones** reúne las dos direcciones: de quién aceptas mensajes (**orígenes permitidos**, para recibir) y a quién puede enviar Runly (**destinos permitidos**, para el bloque «Llamar a una URL»), con un esquema y ejemplos de lo que se envía y se recibe. Todos pueden consultarlas; solo quien administra módulos las modifica.

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

No hace falta crear un módulo para automatizar: en el módulo **Automatizaciones** (`runly.automations`, un módulo oficial de Runly) quien tenga el permiso `automations.manage` crea automatizaciones que pertenecen a la empresa activa. Usan las mismas tarjetas, condiciones, pasos, esperas, aprobaciones, llamadas HTTP, *Probar* e *Historial* que las del Constructor, con estas diferencias:

- El disparador es **un evento del sistema** (los de la tabla de arriba), **un horario** sin registros o **un mensaje de otro sistema** (webhook). No existe «cuando se guarda un registro» porque no hay una entidad de por medio.
- Los pasos solo ofrecen las acciones que no necesitan a una persona detrás, porque todo corre en segundo plano.
- La pantalla es una **lista** (cada automatización con un esquema de su flujo, su estado y su última ejecución) y cada una se abre en un **editor a pantalla completa** con barra superior (nombre, activa, conexiones, probar, historial, guardar). Si tiene errores, se muestran arriba con el bloque que hay que corregir. Guardar autoriza los servicios que usa para esa empresa (y quita los que ya no se usan). Hasta 50 por empresa.
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

La disposición del lienzo vive en `ui` de la automatización: `{ layout: 'horizontal' | 'vertical' | 'free', trigger?: {x,y}, conditions?: {x,y}, steps?: [{x,y} | null, ...] }` (posiciones en el mismo orden que `steps`; no afecta a la ejecución).

Límites: hasta 20 automatizaciones por módulo, 12 bloques (las esperas y las condiciones cuentan), 3 condiciones Sí / No y 5 condiciones por disparador, 2 esperas y 1 aprobación por automatización, y 20 datos por llamada HTTP.
