---
title: Servicios y eventos entre módulos
summary: Cómo tu módulo lee, crea y actualiza registros de Calendario, Archivos, Notificaciones, Inventario, Contactos, Proyectos, Libro de cuentas, Flota y Finanzas personales con autorización del administrador (consumes) y cómo reacciona a lo que pasa en ellos (events).
order: 4.3
---
Tu módulo no lee ni escribe tablas de otros módulos directamente. Si tu módulo se hace con el Constructor, usa las [automatizaciones](/documentacion/desarrolladores/automatizaciones): llaman a estos mismos servicios sin programar. Para eso hay dos mecanismos controlados por Runly:

- **Servicios**: llamas funciones de otro módulo (agendar un evento, guardar un archivo, notificar, actualizar un contacto o una tarea).
- **Eventos**: Runly te avisa cuando algo pasa en otro módulo (se creó un contacto, cambió un artículo).

## Servicios

Declara en `module.manifest.js` lo que tu módulo necesita:

```js
consumes: {
  'runly.inventory': ['items.read', 'items.search'],
  'runly.contacts': ['contacts.create'],
},
```

Un administrador lo autoriza: al instalar desde el catálogo (diálogo de consentimiento) o en **Módulos > detalle del módulo**. Sin esa autorización la llamada falla con 403.

Úsalo desde tus rutas en `api/`:

```js
export default function createRouter({ requirePermission, moduleContext }) {
  const app = new Hono()
  app.get('/mimodulo/buscar-equipo', requirePermission('mimodulo.registro.read'), async (c) => {
    const inventory = moduleContext.services.forRequest(c).module('runly.inventory')
    const { items } = await inventory.items.search({ search: c.req.query('q') ?? '' })
    return c.json({ data: items })
  })
  return app
}
```

Cada llamada se ejecuta en la **empresa activa** de la petición y exige que el **usuario** tenga el permiso del servicio; las que escriben quedan en la bitácora. Tu módulo **nunca** toca tablas ni estructura de otros módulos: crea y actualiza registros a través del código del módulo dueño, con sus mismas validaciones.

### Argumentos

Runly revisa los argumentos de cada llamada contra el contrato publicado del servicio **antes** de ejecutarlo:

- Los campos que el servicio no declara se descartan (no puedes enviar `companyId`, `enabled`, estados internos, etc.).
- En los servicios de actualización solo cambian los campos que envías; `null` vacía un campo opcional.
- Fechas con hora (`datetime`) en ISO 8601; fechas solas (`date`) como `AAAA-MM-DD`.
- Si algo no es válido la llamada falla con **422** `invalid_args` y `error.fields` (`{ campo: mensaje }`).
- Si el módulo dueño rechaza la operación por una regla de negocio (cuenta sin permiso de escritura, cartera ligada a un banco, matrícula ambigua…) la llamada falla con **400** `rejected` y el mensaje del módulo.

### Llamadas repetidas (`idempotencyKey`)

Todo servicio que escribe acepta además `idempotencyKey` (texto, máximo 200). Si tu módulo ya hizo con éxito esa misma llamada con la misma clave en esa empresa, Runly devuelve el resultado anterior y **no** vuelve a escribir. Úsala siempre en los handlers de eventos, que pueden recibir el mismo evento dos veces:

```js
await contacts.contacts.create({ name: 'Ana López', idempotencyKey: `alta-${payload.id}` })
```

```js
try {
  await calendar.events.create({ title: '', startAt: 'mañana' })
} catch (error) {
  // error.status 422, error.code 'invalid_args', error.fields.title, error.fields.startAt
}
```

### Origen y alcance

Lo que tu módulo crea queda marcado con su origen: `sourceEntityId` es el id (UUID) de **tu** registro (por ejemplo, la orden de servicio que agendó la visita).

| Destino | Dónde queda el origen |
|---|---|
| Calendario | El evento guarda tu módulo y `sourceEntityId`. |
| Archivos | El archivo guarda `metadata.source = { moduleKey, sourceEntityId }`. |
| Notificaciones | `sourceType` es tu módulo y `sourceId` es `sourceEntityId`. |
| Contactos, Inventario, Proyectos | La bitácora del servicio registra tu módulo. |

Los servicios marcados como **propios** solo actúan sobre lo que tu módulo creó: un evento o archivo ajeno responde **404**, como si no existiera.

### Catálogo

| Servicio | Qué hace | Permiso del usuario |
|---|---|---|
| `runly.inventory` `items.read({ id })` | Un artículo: `id, name, assetTag, status` | `inventory.item.read` |
| `runly.inventory` `items.search({ search, limit })` | `{ items, total }` | `inventory.item.read` |
| `runly.inventory` `items.update({ id, name, description, status, locationId, notes })` | Actualiza el artículo; `status` solo `available` o `maintenance` | `inventory.item.update` |
| `runly.contacts` `contacts.read({ id })` | Un contacto: `id, name, type, email, phone` | `contacts.contacts.read` |
| `runly.contacts` `contacts.search({ search, limit })` | `{ items, total }` | `contacts.contacts.read` |
| `runly.contacts` `contacts.create({ name, type, email, phone })` | Crea y devuelve el contacto | `contacts.contacts.create` |
| `runly.contacts` `contacts.update({ id, name, type, email, phone })` | Actualiza y devuelve el contacto | `contacts.contacts.update` |
| `runly.projects` `tasks.read({ id })` | Una tarea | `projects.task.read` |
| `runly.projects` `tasks.create({ projectId, title, description, dueDate, assigneeId })` | Crea la tarea en el primer estado del proyecto | `projects.task.create` |
| `runly.projects` `tasks.update({ id, title, description, statusId, assigneeId, dueDate, priority })` | Actualiza la tarea (mover de estado con `statusId`); `priority`: `NONE, LOW, MEDIUM, HIGH, URGENT` | `projects.task.update` |
| `runly.calendar` `calendars.list()` | Calendarios donde el usuario puede crear eventos: `id, name, isDefault` | `calendar.events.read` |
| `runly.calendar` `events.list({ from, to, sourceEntityId })` | Eventos **propios** en el rango (las repeticiones se expanden) | `calendar.events.read` |
| `runly.calendar` `events.create({ calendarId, title, description, startAt, endAt, allDay, location, attendeeIds, reminderMinutes, sourceEntityId })` | Crea el evento; sin `calendarId` va al calendario principal del usuario. Invitados solo de la empresa | `calendar.events.create` |
| `runly.calendar` `events.update({ id, title, description, startAt, endAt, allDay, location })` | Actualiza un evento **propio** | `calendar.events.update` |
| `runly.calendar` `events.cancel({ id })` | Cancela un evento **propio** (el usuario debe ser dueño o administrador del calendario) | `calendar.events.update` |
| `runly.files` `files.save({ name, mimeType, contentBase64, shareWithCompany, sourceEntityId })` | Guarda el archivo en **Archivos** del usuario (privado salvo `shareWithCompany: true`). Máximo 10 MB; imagen, PDF, texto u oficina | `files.assets.create` |
| `runly.files` `files.signedUrl({ id })` | Enlace temporal de descarga de un archivo **propio** | `files.assets.read` |
| `runly.notifications` `notifications.send({ userIds, title, body, link, priority, sourceEntityId })` | Notifica a usuarios de la empresa (los demás se ignoran); `priority`: `low, medium, high, critical` | Ninguno: basta ser miembro de la empresa |
| `runly.notifications` `email.send({ userIds, to, subject, body, fileId, sourceEntityId })` | Envía un correo con el SMTP de la empresa (o el de la plataforma) a personas de la empresa (`userIds`, hasta 20) y/o a una dirección externa (`to`); `fileId` adjunta un archivo de la empresa (máx. 10 MB). Solo para automatizaciones y eventos (`system`). Devuelve `sent`, `failed` | Ninguno |
| `runly.chat` `messages.post({ channel, text, title, link, buttons, approvalId, sourceEntityId })` | Publica un mensaje en un **canal** de chat de la empresa (por su nombre exacto o su id). El mensaje aparece como una *integración* con el nombre del módulo (o de la automatización) que lo envía, nunca como una persona, y no dispara automatizaciones. Hasta 4000 caracteres; `link` solo `https`/`http` o una ruta de Runly; máx. 30 mensajes por minuto por canal. `buttons` (texto JSON, hasta 3 `{ "label", "url" }` con `https`/`http` o una ruta de Runly) agrega botones de enlace; `approvalId` (una aprobación de automatizaciones pendiente) agrega los botones **Aprobar** y **Rechazar**, que solo pueden usar quienes aprueban. Solo para automatizaciones y eventos (`system`). Devuelve `id, conversationId, channel` | Ninguno |
| `runly.documents` `documents.generate({ kind, templateId, sourceId, values, output, name, sourceEntityId })` | Llena una plantilla de **Documentos** y guarda el resultado en **Archivos** de la empresa. `kind` es el tipo (`fleet.vehicle`, `hr.employee`, `general.manual`, un tipo de un módulo del Builder…); `sourceId` el registro de origen, o `values` (objeto, o texto JSON) para el documento general; sin `templateId` se usa la plantilla predeterminada de la empresa del tipo (o el formato estándar si existe); `output: 'pdf'` convierte a PDF cuando se puede. Usa solo plantillas de la empresa (las personales solo las usa su dueño); el tipo debe pertenecer a un módulo activo en la empresa y el usuario necesita el permiso del tipo (en automatizaciones y eventos, `system`, basta la autorización del servicio). Devuelve `id, name, mimeType, sizeBytes` (el `id` sirve como *Archivo adjunto* de `email.send`) | El del tipo de documento |
| `runly.documents` `templates.list({ kind })` | Lista las plantillas que se pueden usar (`id, kind, name, format, visibility, isDefault, published`); sin `kind`, las de todos los tipos disponibles. Solo `system` además de usuarios | El del tipo de documento |
| `runly.files` `report.generate({ source, format, search, name, shareWithCompany, sourceEntityId })` | Genera un reporte `csv` o `xlsx` (hasta 1000 filas) de `contacts`, `items` o `vehicles` y lo guarda en **Archivos** de la empresa (compartido salvo `shareWithCompany: false`). Solo para automatizaciones y eventos (`system`). Devuelve `id, name, mimeType, sizeBytes` | `files.assets.create` |
| `runly.purchases` `requests.create({ title, justification, priority, currency, neededBy, sourceEntityId })` | Crea una solicitud de compra en borrador (sin solicitante: se crea por el sistema). Falla con un mensaje claro si el flujo de Compras tiene las solicitudes desactivadas. Disponible para automatizaciones y eventos (`system`). Devuelve `id, number, status` | `purchases.request.create` |
| `runly.hr` `employees.search({ search, status, limit })` | Busca colaboradores activos por nombre o área y devuelve solo `id, name, department, status` (nunca datos de contacto, sueldo ni identificaciones). Disponible en segundo plano (`system`) | `hr.employee.read` |
| `runly.ledger` `accounts.list()` | Cuentas que el usuario puede ver: `id, name, bank, currency, balance` | `ledger.accounts.read` |
| `runly.ledger` `categories.list()` | Categorías: `id, name, kind, system` | `ledger.categories.read` |
| `runly.ledger` `transactions.create({ accountId \| accountName, fecha, nombre, referencia, concepto, numero, deposito, retiro, categoryId })` | Registra un depósito o retiro (uno de los dos mayor a cero). El usuario debe poder escribir en esa cuenta | `ledger.transactions.create` |
| `runly.ledger` `transactions.update({ transactionId, fecha, nombre, referencia, concepto, numero, deposito, retiro, categoryId })` | Edita un movimiento de una cuenta donde el usuario puede escribir | `ledger.transactions.update` |
| `runly.fleet` `vehicles.search({ search, status, limit })` | `{ items: [{ id, plate, brand, model, year, status, driverName }], total }` | `fleet.vehicles.read` |
| `runly.fleet` `drivers.search({ search, status, limit })` | `{ items: [{ id, name, phone, licenseNumber, status }], total }` | `fleet.drivers.read` |
| `runly.fleet` `vehicles.create({ plate, brand, model, year, color, status, driver, notes })` | Crea el vehículo; `driver` es el nombre del chofer | `fleet.vehicles.create` |
| `runly.fleet` `vehicles.update({ vehicleId \| plate, status, driver, color, notes })` | Edita el vehículo; `driver: null` lo deja sin chofer | `fleet.vehicles.update` |
| `runly.fleet` `insurance.create({ vehicleId \| plate, insurer, policyNumber, coverageType, startDate, expiryDate, premium, currency, notes })` | Registra una póliza; `coverageType`: `basic, comprehensive, third_party, other` | `fleet.insurance.create` |
| `runly.fleet` `insurance.update({ policyId, expiryDate, premium, coverageType, notes })` | Edita una póliza | `fleet.insurance.update` |
| `runly.pfm` `wallets.list()` | Carteras del usuario: `id, name, kind, currency, balance, bankLinked` | `pfm.wallets.read` |
| `runly.pfm` `categories.list({ kind })` | Categorías de gasto o ingreso: `id, name, kind` | `pfm.categories.read` |
| `runly.pfm` `movements.create({ wallet, direction, amount, occurredOn, category, merchant, note })` | Registra un gasto o ingreso (`direction`: `EXPENSE, INCOME`); `wallet` y `category` aceptan nombre o id. No se puede en carteras ligadas a una cuenta bancaria | `pfm.movements.create` |
| `runly.pfm` `movements.update({ movementId, direction, amount, occurredOn, category, merchant, note })` | Edita un movimiento de una cartera donde el usuario puede escribir | `pfm.movements.update` |

Los servicios de Libro de cuentas, Flota y Finanzas personales que escriben devuelven `{ id, summary, link }` y aplican exactamente las mismas reglas que las pantallas de esos módulos (acceso por cuenta o cartera, actividad, bitácora). Borrar registros de otros módulos no está disponible.

Para adjuntar archivos a **tus propios** registros usa los adjuntos del registro (`GET /<base>/:id/files`, ver [API del módulo](/documentacion/desarrolladores/api-modulos), y el componente `AttachmentsPanel`); `files.save` es para dejar un documento en el explorador de Archivos del usuario.

```js
app.post('/mimodulo/ordenes/:id/agendar', requirePermission('mimodulo.orden.update'), async (c) => {
  const services = moduleContext.services.forRequest(c)
  const calendar = services.module('runly.calendar')
  const event = await calendar.events.create({
    title: 'Visita de servicio',
    startAt: '2026-10-06T16:00:00.000Z',
    endAt: '2026-10-06T17:00:00.000Z',
    reminderMinutes: [30],
    sourceEntityId: c.req.param('id'),
  })
  await services.module('runly.notifications').notifications.send({
    userIds: [tecnicoId], title: 'Nueva visita asignada', link: '/calendar', sourceEntityId: c.req.param('id'),
  })
  return c.json({ data: event })
})
```

```js
// module.manifest.js
consumes: {
  'runly.calendar': ['events.create', 'events.update', 'events.cancel'],
  'runly.notifications': ['notifications.send'],
},
```

## Ofrecer un tipo de documento a Documentos

Un módulo del Builder puede ofrecer una de sus entidades como **tipo de documento**: los usuarios suben su propio formato (Word, Excel, PowerPoint o PDF) en **Documentos**, y Runly lo llena con los datos de un registro. En la definición del módulo (ZIP o Builder):

```json
"documentKinds": [
  { "name": "factura", "label": "Factura", "entity": "factura", "permission": "facturas.factura.read", "formats": ["docx", "pdf"], "fields": ["folio", "total", "emitida"] }
]
```

- `name` (snake_case) y `label` identifican el tipo; Runly lo registra como `<clave del módulo>.<name>` (por ejemplo `custom.facturas.factura`).
- `entity` es la entidad de la que se leen los datos. `permission` (opcional) es el permiso que se exige para ver y generar; por omisión, el de lectura de la entidad.
- `fields` (opcional) son los campos disponibles como etiquetas `{{campo}}`; por omisión, todos los de texto, número, fecha, lista de opciones y sí/no (los archivos, relaciones y JSON no se ofrecen). `formats` (opcional) limita los formatos de plantilla.
- En `module.manifest.js` el contrato equivalente es `documentKinds: [{ name, label, model, permission, formats?, fields: [{ tag, label, type }] }]` con `type` `text`, `number` o `date`; hasta 10 tipos por módulo y 60 campos por tipo.

El tipo está disponible mientras el módulo esté instalado, activo y no desactivado para la empresa; al desactivarlo o desinstalarlo desaparece de Documentos y las plantillas ya subidas se conservan. Solo se leen los campos declarados, del registro de la empresa activa (y no desactivado).

## Poner un resumen de tu módulo en Inicio

Un módulo del Builder puede mostrar en **Inicio** un contador o una lista corta de una de sus entidades, sin escribir código:

```json
"homeWidgets": [
  { "key": "abiertas", "label": "Órdenes abiertas", "entity": "orden", "kind": "count",
    "when": { "field": "estado", "op": "not_equals", "value": "cerrada" } },
  { "key": "recientes", "label": "Últimas órdenes", "entity": "orden", "kind": "list",
    "titleField": "folio", "detailField": "cliente", "sort": { "field": "monto", "dir": "desc" }, "limit": 5 }
]
```

- `kind`: `count` (un número grande con el total) o `list` (hasta 10 registros con título y una línea de detalle). Máximo 5 widgets por módulo.
- `when` (opcional, hasta 5 condiciones que deben cumplirse todas): `equals`, `not_equals`, `contains`, `not_contains`, `gt`, `gte`, `lt`, `lte` (solo campos numéricos), `filled` y `empty`. Los registros desactivados nunca cuentan.
- `permission` (opcional): el permiso que hace falta para ver el widget; por omisión, el de lectura de la entidad. Quien no lo tiene no ve el widget en «Personalizar».
- El total es exacto (se cuenta en la base de datos, no sobre una página). Al hacer clic se abre tu módulo. Cada persona puede ocultarlo desde **Personalizar**.
- En `module.manifest.js` el contrato equivalente es `homeWidgets: [{ key, label, kind, model, permission, where?, titleField?, detailField?, sortField?, sortDir?, limit? }]`. Si un campo ya no existe, el widget responde con un error claro en vez de mostrar datos incorrectos.

El contrato completo (argumentos, tipos, límites y campos de respuesta) se publica en `@runly/module-engine/contracts` como `SERVICE_CONTRACTS`; el Developer Hub simula los servicios con ese mismo contrato.

## Eventos

Suscríbete en el manifiesto y maneja los eventos en `api/events.js`. Además de `prisma` (para **tus** tablas), cada handler recibe `services`: los mismos servicios, en la empresa del evento y sin usuario.

```js
// module.manifest.js
events: { subscribes: ['contacts.contact.created'] },
```

```js
// api/events.js
export const handlers = {
  'contacts.contact.created': async ({ payload, companyId, prisma }) => {
    await prisma.$executeRaw`INSERT INTO "mimodulo_bitacora" (company_id, texto) VALUES (${companyId}::uuid, ${'Nuevo contacto ' + payload.id})`
  },
  'fleet.vehicle.updated': async ({ payload, eventId, services }) => {
    if (payload.status !== 'maintenance') return
    await services.module('runly.notifications').notifications.send({
      userIds: [JEFE_DE_TALLER_ID], title: `Vehículo ${payload.plate} en mantenimiento`, idempotencyKey: `taller-${eventId}`,
    })
  },
}
```

Desde un evento solo funcionan los servicios que no necesitan a una persona: notificaciones, contactos (leer, buscar, crear, actualizar), inventario (leer, buscar, actualizar), `tasks.update` de Proyectos y `vehicles.search` de Flota. Los demás (calendario, archivos, libro de cuentas, finanzas personales, crear tareas) responden **403** `system_not_supported`. La autorización del administrador (`consumes`) sigue siendo obligatoria; no se revisan permisos de usuario porque no hay usuario.

| Evento | `payload` |
|---|---|
| `inventory.item.created` | `{ id, name, assetTag, status, serialNumber, categoryId, categoryName, brandName, locationId, locationName }` |
| `inventory.item.updated` | `{ id, name, assetTag, status, serialNumber, categoryId, categoryName, brandName, locationId, locationName }` |
| `inventory.item.deleted` | `{ id, name, assetTag, status, serialNumber, categoryId, categoryName, brandName, locationId, locationName }` (los nombres de tipo, marca y ubicación vienen vacíos) |
| `contacts.contact.created` | `{ id, name, type, email, phone }` |
| `contacts.contact.updated` | `{ id, name, type, email, phone }` |
| `contacts.contact.deactivated` | `{ id, name, type, email, phone }` |
| `contacts.contact.deleted` | `{ id, name, type, email, phone }` (eliminación definitiva) |
| `projects.task.created` | `{ id, projectId, title, statusId, assigneeId, priority, startDate, dueDate }` |
| `projects.task.updated` | `{ id, projectId, title, statusId, assigneeId, priority, startDate, dueDate }` |
| `projects.task.deleted` | `{ id, projectId, title, statusId, assigneeId, priority, startDate, dueDate }` |
| `projects.task.completed` | `{ id, projectId, title, statusId, assigneeId, priority, startDate, dueDate }` (al pasar a un estado de tipo hecho) |
| `projects.task.rescheduled` | `{ id, projectId, title, statusId, assigneeId, priority, startDate, dueDate }` (fechas AAAA-MM-DD o `null`; al cambiar el inicio o la entrega, desde el formulario, el Gantt o la IA) |
| `projects.time.logged` | `{ id, taskId, projectId, minutes }` (al registrar tiempo a mano o al detener el cronómetro) |
| `calendar.event.created` | `{ id, title, startAt, endAt, location, sourceModule, sourceEntityId }` |
| `calendar.event.updated` | `{ id, title, startAt, endAt, location, sourceModule, sourceEntityId }` |
| `calendar.event.cancelled` | `{ id, title, startAt, endAt, location, sourceModule, sourceEntityId }` |
| `files.file.created` | `{ id, name, mimeType, sizeBytes }` (solo archivos subidos a Archivos, no adjuntos de registros) |
| `files.file.deleted` | `{ id, name, mimeType, sizeBytes }` (solo archivos de Archivos) |
| `fleet.vehicle.created` | `{ id, plate, status, brand, model, year, color }` |
| `fleet.vehicle.updated` | `{ id, plate, status, brand, model, year, color }` |
| `fleet.vehicle.deactivated` | `{ id, plate, status, brand, model, year, color }` |
| `hr.employee.created` | `{ id, firstName, lastName, employeeCode, workEmail, jobTitle, department, status }` |
| `hr.employee.updated` | `{ id, firstName, lastName, employeeCode, workEmail, jobTitle, department, status }` |
| `hr.employee.deactivated` | `{ id, firstName, lastName, employeeCode, workEmail, jobTitle, department, status }` |
| `purchases.request.created` | `{ id, caseId, status, number, total, currency, supplierId }` (`total` es el estimado y `supplierId` viene vacío) |
| `purchases.order.approved` | `{ id, caseId, status, number, total, currency, supplierId }` |
| `purchases.order.issued` | `{ id, caseId, status, number, total, currency, supplierId }` |
| `purchases.order.updated` | `{ id, caseId, status, number, total, currency, supplierId }` (al editar una orden en borrador) |
| `purchases.order.cancelled` | `{ id, caseId, status, number, total, currency, supplierId }` |
| `purchases.invoice.paid` | `{ id, caseId, status, number, total, currency, supplierId }` (al quedar pagada por completo) |
| `purchases.invoice.payment.recorded` | `{ id, invoiceId, caseId, kind, amount, currency, invoiceStatus, paidAmount, balance }` (cada abono o pago; un reintento con la misma clave de operación no lo repite) |
| `purchases.invoice.payment.reversed` | `{ id, invoiceId, caseId, kind, amount, currency, invoiceStatus, paidAmount, balance }` (`kind` es `REVERSAL` y `amount` es negativo; el pago original se conserva) |
| `ledger.transaction.created` | `{ id, accountId, deposito, retiro, fecha, categoryId }` (un movimiento registrado a mano o desde la app; las importaciones masivas no lo publican; sin nombres de cuenta ni de personas) |
| `ledger.transaction.updated` | `{ id, accountId, deposito, retiro, fecha, categoryId }` |
| `ledger.transaction.deleted` | `{ id, accountId, deposito, retiro, fecha, categoryId }` (al mandar el movimiento a la papelera) |
| `lms.enrollment.completed` | `{ id, courseId, learnerId }` (al completar el último requisito del curso) |

Con `sourceModule` sabes si un evento de calendario lo creó tu módulo (por ejemplo, para marcar tu orden como reagendada cuando alguien mueve la cita desde el calendario). Libro de cuentas y Finanzas personales no publican eventos: su información depende del acceso por cuenta o cartera de cada persona.

- La entrega es **al menos una vez**: tu handler debe poder recibir el mismo evento dos veces sin duplicar datos.
- Si tu handler falla, se reintenta con espera creciente (1, 2, 4… hasta 60 minutos) hasta 8 veces.
- Los eventos llegan unos segundos después del cambio (los entrega el proceso de fondo de Runly).
- Si el módulo está desactivado para una empresa, no recibe sus eventos.
