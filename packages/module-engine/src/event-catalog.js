// Single source of the domain events a person can pick as an automation trigger:
// what happened (label, description), which module raised it and the data it
// carries (each field with a label, type, description and example). DOMAIN_EVENTS and
// DOMAIN_EVENT_PAYLOADS in contracts.js are derived from this list. Spec
// docs/superpowers/specs/2026-10-27-automation-events-chaining-sandbox-design.md.

const field = (key, label, type, description, example) => Object.freeze({ key, label, type, description, example })

const ID = (what) => field('id', 'Identificador', 'id', `Código único de ${what}; sirve para enlazarlo desde otros bloques.`, '0198c1f2-7a4b-7c3d-9e10-5b2a6f4d8e31')

const CALENDAR_FIELDS = [
  ID('el evento'),
  field('title', 'Título', 'text', 'Nombre del evento.', 'Reunión con proveedores'),
  field('startAt', 'Inicio', 'date', 'Fecha y hora en que empieza.', '2026-11-03T15:00:00Z'),
  field('endAt', 'Fin', 'date', 'Fecha y hora en que termina, si tiene.', '2026-11-03T16:00:00Z'),
  field('location', 'Lugar', 'text', 'Lugar del evento, si lo hay.', 'Sala de juntas'),
  field('sourceModule', 'Módulo de origen', 'text', 'Módulo que creó el evento, si lo agendó una automatización.', 'runly.projects'),
  field('sourceEntityId', 'Registro de origen', 'id', 'Registro que lo originó, si lo hay.', '0198c1f2-7a4b-7c3d-9e10-5b2a6f4d8e32'),
]
const VEHICLE_FIELDS = [
  ID('el vehículo'),
  field('plate', 'Placa', 'text', 'Placa del vehículo.', 'ABC-123-D'),
  field('status', 'Estado', 'text', 'Estado actual del vehículo en la flota.', 'ACTIVE'),
  field('brand', 'Marca', 'text', 'Marca del vehículo.', 'Nissan'),
  field('model', 'Modelo', 'text', 'Modelo del vehículo.', 'NP300'),
  field('year', 'Año', 'number', 'Año del modelo.', '2022'),
  field('color', 'Color', 'text', 'Color del vehículo.', 'Blanco'),
]
const PURCHASE_FIELDS = [
  field('economicMode', 'Modalidad económica', 'text', 'FINANCIAL o DOCUMENTARY. Los importes documentales son desconocidos (null).', 'DOCUMENTARY'),
  ID('el documento de compra'),
  field('caseId', 'Expediente de compra', 'id', 'Expediente que agrupa la solicitud, la orden y la factura de una misma compra.', '0198c1f2-7a4b-7c3d-9e10-5b2a6f4d8e33'),
  field('status', 'Estado', 'text', 'Estado del documento después del cambio.', 'APPROVED'),
  field('number', 'Folio', 'text', 'Folio del documento.', 'OC-0042'),
  field('total', 'Total', 'number', 'Importe total del documento (el estimado en una solicitud).', '12500.00'),
  field('currency', 'Moneda', 'text', 'Moneda del documento.', 'MXN'),
  field('supplierId', 'Proveedor', 'id', 'Proveedor del documento; vacío en una solicitud.', '0198c1f2-7a4b-7c3d-9e10-5b2a6f4d8e39'),
]
// Keep in sync with paymentEventPayload() in apps/api/src/services/purchase-payments-service.js.
const PAYMENT_FIELDS = [
  ID('el movimiento de pago'),
  field('invoiceId', 'Factura', 'id', 'Factura de proveedor a la que pertenece el movimiento.', '0198c1f2-7a4b-7c3d-9e10-5b2a6f4d8e40'),
  field('caseId', 'Expediente de compra', 'id', 'Expediente de la factura.', '0198c1f2-7a4b-7c3d-9e10-5b2a6f4d8e33'),
  field('kind', 'Tipo de movimiento', 'text', 'PAYMENT (pago), OPENING (pagado histórico sin desglose) o REVERSAL (reverso).', 'PAYMENT'),
  field('amount', 'Importe', 'number', 'Importe del movimiento; negativo en un reverso.', '2500.00'),
  field('currency', 'Moneda', 'text', 'Moneda del movimiento.', 'MXN'),
  field('invoiceStatus', 'Estado de la factura', 'text', 'Estado de la factura después del movimiento.', 'PARTIALLY_PAID'),
  field('paidAmount', 'Total pagado', 'number', 'Total pagado de la factura después del movimiento.', '2500.00'),
  field('balance', 'Saldo', 'number', 'Saldo pendiente de la factura después del movimiento.', '10000.00'),
]
// Payload of purchases.receipt.reversed (purchase-receipt-reversals-service.js).
const RECEIPT_REVERSAL_FIELDS = [
  ID('el reverso'),
  field('receiptId', 'Recepción', 'id', 'Recepción reversada.', '0198c1f2-7a4b-7c3d-9e10-5b2a6f4d8e41'),
  field('orderId', 'Orden de compra', 'id', 'Orden de la recepción.', '0198c1f2-7a4b-7c3d-9e10-5b2a6f4d8e42'),
  field('caseId', 'Expediente de compra', 'id', 'Expediente de la orden.', '0198c1f2-7a4b-7c3d-9e10-5b2a6f4d8e33'),
  field('orderStatus', 'Estado de la orden', 'text', 'Estado de recepción de la orden después del reverso.', 'PARTIALLY_RECEIVED'),
  field('number', 'Folio de la recepción', 'text', 'Folio de la recepción reversada.', 'REC-0012'),
]
const INVENTORY_ITEM_FIELDS = [
  ID('el artículo'),
  field('name', 'Nombre', 'text', 'Nombre del artículo.', 'Laptop Dell 14'),
  field('assetTag', 'Número de activo', 'text', 'Número de activo asignado, si lo tiene.', 'ACT-0042'),
  field('status', 'Estado', 'text', 'Estado del artículo (available, assigned, maintenance...).', 'available'),
  field('serialNumber', 'Número de serie', 'text', 'Número de serie, si lo tiene.', 'SN-8841-X'),
  field('categoryId', 'Tipo', 'id', 'Tipo de artículo.', '0198c1f2-7a4b-7c3d-9e10-5b2a6f4d8e3a'),
  field('categoryName', 'Nombre del tipo', 'text', 'Nombre del tipo; vacío si el evento no lo trae.', 'Laptops'),
  field('brandName', 'Marca', 'text', 'Marca del artículo; vacío si el evento no la trae.', 'Dell'),
  field('locationId', 'Ubicación', 'id', 'Ubicación del artículo.', '0198c1f2-7a4b-7c3d-9e10-5b2a6f4d8e3b'),
  field('locationName', 'Nombre de la ubicación', 'text', 'Nombre de la ubicación; vacío si el evento no lo trae.', 'Oficina central'),
]
const CONTACT_FIELDS = [
  ID('el contacto'),
  field('name', 'Nombre', 'text', 'Nombre del contacto o de la empresa.', 'Distribuidora del Norte'),
  field('type', 'Tipo', 'text', 'Tipo de contacto (persona o empresa).', 'company'),
  field('email', 'Correo', 'text', 'Correo principal, si lo tiene.', 'compras@distnorte.example'),
  field('phone', 'Teléfono', 'text', 'Teléfono principal, si lo tiene.', '+52 55 1234 5678'),
]
const PROJECT_TASK_FIELDS = [
  ID('la tarea'),
  field('projectId', 'Proyecto', 'id', 'Proyecto al que pertenece la tarea.', '0198c1f2-7a4b-7c3d-9e10-5b2a6f4d8e34'),
  field('title', 'Título', 'text', 'Título de la tarea.', 'Revisar contrato'),
  field('statusId', 'Estado', 'id', 'Estado (columna) de la tarea.', '0198c1f2-7a4b-7c3d-9e10-5b2a6f4d8e3c'),
  field('assigneeId', 'Responsable', 'id', 'Persona responsable, si hay.', '0198c1f2-7a4b-7c3d-9e10-5b2a6f4d8e3d'),
  field('priority', 'Prioridad', 'text', 'Prioridad de la tarea.', 'HIGH'),
  field('startDate', 'Inicio', 'date', 'Fecha de inicio, si tiene.', '2026-11-03'),
  field('dueDate', 'Vence', 'date', 'Fecha de vencimiento, si tiene.', '2026-11-10'),
]
const EMPLOYEE_FIELDS = [
  ID('el colaborador'),
  field('firstName', 'Nombre', 'text', 'Nombre(s) del colaborador.', 'Ana'),
  field('lastName', 'Apellidos', 'text', 'Apellidos del colaborador.', 'Pérez'),
  field('employeeCode', 'Código de colaborador', 'text', 'Código interno, si lo tiene.', 'EMP-015'),
  field('workEmail', 'Correo de trabajo', 'text', 'Correo de trabajo, si lo tiene.', 'ana.perez@empresa.example'),
  field('jobTitle', 'Puesto', 'text', 'Puesto del colaborador.', 'Analista de compras'),
  field('department', 'Departamento', 'text', 'Departamento del colaborador.', 'Finanzas'),
  field('status', 'Estado', 'text', 'Estado laboral del colaborador.', 'active'),
]
const FILE_FIELDS = [
  ID('el archivo'),
  field('name', 'Nombre', 'text', 'Nombre original del archivo.', 'contrato.pdf'),
  field('mimeType', 'Tipo de archivo', 'text', 'Tipo del archivo (PDF, imagen, hoja de cálculo...).', 'application/pdf'),
  field('sizeBytes', 'Tamaño (bytes)', 'number', 'Tamaño del archivo en bytes.', '245760'),
]
// No account or person names: a company automation can read every movement it receives.
const TRANSACTION_FIELDS = [
  ID('el movimiento'),
  field('accountId', 'Cuenta', 'id', 'Cuenta donde se registró.', '0198c1f2-7a4b-7c3d-9e10-5b2a6f4d8e38'),
  field('deposito', 'Depósito', 'number', 'Monto depositado; vacío si fue un retiro.', '1500.00'),
  field('retiro', 'Retiro', 'number', 'Monto retirado; vacío si fue un depósito.', '320.50'),
  field('fecha', 'Fecha', 'date', 'Fecha del movimiento.', '2026-11-03'),
  field('categoryId', 'Categoría', 'id', 'Categoría del movimiento, si tiene.', '0198c1f2-7a4b-7c3d-9e10-5b2a6f4d8e3e'),
]

// key -> { module, label, description, link?, fields }. `link` is the screen of the
// record the event is about, as a template over its fields (none once deleted).
export const EVENT_CATALOG = Object.freeze({
  'inventory.item.created': { module: 'Inventario', label: 'Se creó un artículo de inventario', description: 'Cuando alguien da de alta un artículo, a mano o por importación.', link: '/app/m/runly.inventory/inventory/{{id}}', fields: INVENTORY_ITEM_FIELDS },
  'inventory.item.updated': { module: 'Inventario', label: 'Se actualizó un artículo de inventario', description: 'Cuando cambia cualquier dato de un artículo o se mueve su existencia.', link: '/app/m/runly.inventory/inventory/{{id}}', fields: INVENTORY_ITEM_FIELDS },
  'inventory.item.deleted': { module: 'Inventario', label: 'Se eliminó un artículo de inventario', description: 'Cuando alguien elimina un artículo (queda fuera del inventario activo). Los nombres de tipo, marca y ubicación no vienen en este evento.', fields: INVENTORY_ITEM_FIELDS },
  'contacts.contact.created': { module: 'Contactos', label: 'Se creó un contacto', description: 'Cuando se agrega un contacto nuevo.', link: '/app/m/runly.contacts/contacts/{{id}}', fields: CONTACT_FIELDS },
  'contacts.contact.updated': { module: 'Contactos', label: 'Se actualizó un contacto', description: 'Cuando se editan los datos de un contacto.', link: '/app/m/runly.contacts/contacts/{{id}}', fields: CONTACT_FIELDS },
  'contacts.contact.deleted': { module: 'Contactos', label: 'Se eliminó un contacto', description: 'Cuando se elimina un contacto de forma definitiva.', fields: CONTACT_FIELDS },
  'contacts.contact.deactivated': { module: 'Contactos', label: 'Se desactivó un contacto', description: 'Cuando un contacto se desactiva y deja de aparecer en las listas activas.', link: '/app/m/runly.contacts/contacts/{{id}}', fields: CONTACT_FIELDS },
  'projects.task.created': { module: 'Proyectos', label: 'Se creó una tarea de proyecto', description: 'Cuando se agrega una tarea a un proyecto.', link: '/app/m/runly.projects?open=task:{{id}}&project={{projectId}}', fields: PROJECT_TASK_FIELDS },
  'projects.task.updated': { module: 'Proyectos', label: 'Se actualizó una tarea de proyecto', description: 'Cuando cambia cualquier dato de una tarea (título, responsable, prioridad, estado, fechas).', link: '/app/m/runly.projects?open=task:{{id}}&project={{projectId}}', fields: PROJECT_TASK_FIELDS },
  'projects.task.completed': { module: 'Proyectos', label: 'Se completó una tarea de proyecto', description: 'Cuando una tarea pasa a completada.', link: '/app/m/runly.projects?open=task:{{id}}&project={{projectId}}', fields: PROJECT_TASK_FIELDS },
  'projects.task.rescheduled': { module: 'Proyectos', label: 'Se cambiaron las fechas de una tarea de proyecto', description: 'Cuando se mueve la fecha de inicio o de vencimiento de una tarea.', link: '/app/m/runly.projects?open=task:{{id}}&project={{projectId}}', fields: PROJECT_TASK_FIELDS },
  'projects.task.deleted': { module: 'Proyectos', label: 'Se eliminó una tarea de proyecto', description: 'Cuando se elimina una tarea.', fields: PROJECT_TASK_FIELDS },
  'projects.time.logged': { module: 'Proyectos', label: 'Se registró tiempo en una tarea de proyecto', description: 'Cuando alguien captura horas en una tarea.', link: '/app/m/runly.projects?open=task:{{taskId}}&project={{projectId}}', fields: [ID('el registro de tiempo'), field('taskId', 'Tarea', 'id', 'Tarea a la que se cargó el tiempo.', '0198c1f2-7a4b-7c3d-9e10-5b2a6f4d8e35'), field('projectId', 'Proyecto', 'id', 'Proyecto de la tarea.', '0198c1f2-7a4b-7c3d-9e10-5b2a6f4d8e34'), field('minutes', 'Minutos', 'number', 'Minutos registrados.', '90')] },
  'calendar.event.created': { module: 'Calendario', label: 'Se creó un evento de calendario', description: 'Cuando se agenda un evento nuevo.', link: '/app/m/runly.calendar?open=event:{{id}}', fields: CALENDAR_FIELDS },
  'calendar.event.updated': { module: 'Calendario', label: 'Se actualizó un evento de calendario', description: 'Cuando cambia la fecha, el título u otro dato de un evento.', link: '/app/m/runly.calendar?open=event:{{id}}', fields: CALENDAR_FIELDS },
  'calendar.event.cancelled': { module: 'Calendario', label: 'Se canceló un evento de calendario', description: 'Cuando se cancela un evento agendado.', fields: CALENDAR_FIELDS },
  'files.file.created': { module: 'Archivos', label: 'Se subió un archivo a Archivos', description: 'Cuando alguien sube un archivo.', link: '/app/m/runly.files/files/{{id}}', fields: FILE_FIELDS },
  'files.file.deleted': { module: 'Archivos', label: 'Se eliminó un archivo de Archivos', description: 'Cuando alguien elimina un archivo subido desde el explorador de Archivos.', fields: FILE_FIELDS },
  'fleet.vehicle.created': { module: 'Flota', label: 'Se creó un vehículo de la flota', description: 'Cuando se da de alta un vehículo.', link: '/app/m/runly.fleet/vehicles/{{id}}', fields: VEHICLE_FIELDS },
  'fleet.vehicle.updated': { module: 'Flota', label: 'Se actualizó un vehículo de la flota', description: 'Cuando cambia un dato o el estado de un vehículo.', link: '/app/m/runly.fleet/vehicles/{{id}}', fields: VEHICLE_FIELDS },
  'fleet.vehicle.deactivated': { module: 'Flota', label: 'Se desactivó un vehículo de la flota', description: 'Cuando un vehículo se da de baja de la flota activa.', link: '/app/m/runly.fleet/vehicles/{{id}}', fields: VEHICLE_FIELDS },
  'hr.employee.created': { module: 'Recursos humanos', label: 'Se creó un colaborador', description: 'Cuando se da de alta un colaborador.', link: '/app/m/runly.hr/hr/employees/{{id}}', fields: EMPLOYEE_FIELDS },
  'hr.employee.updated': { module: 'Recursos humanos', label: 'Se actualizó un colaborador', description: 'Cuando se editan los datos de un colaborador.', link: '/app/m/runly.hr/hr/employees/{{id}}', fields: EMPLOYEE_FIELDS },
  'hr.employee.deactivated': { module: 'Recursos humanos', label: 'Se desactivó un colaborador', description: 'Cuando un colaborador se deshabilita.', link: '/app/m/runly.hr/hr/employees/{{id}}', fields: EMPLOYEE_FIELDS },
  'purchases.request.created': { module: 'Compras', label: 'Se creó una solicitud de compra', description: 'Cuando alguien solicita comprar algo.', link: '/app/m/runly.purchases/purchases/requests/{{id}}', fields: PURCHASE_FIELDS },
  'purchases.order.approved': { module: 'Compras', label: 'Se aprobó una orden de compra', description: 'Cuando se aprueba una orden, antes de emitirla al proveedor.', link: '/app/m/runly.purchases/purchases/orders/{{id}}', fields: PURCHASE_FIELDS },
  'purchases.order.updated': { module: 'Compras', label: 'Se editó una orden de compra', description: 'Cuando se modifica una orden en borrador (proveedor, líneas, importes).', link: '/app/m/runly.purchases/purchases/orders/{{id}}', fields: PURCHASE_FIELDS },
  'purchases.order.issued': { module: 'Compras', label: 'Se emitió una orden de compra', description: 'Cuando la orden se envía al proveedor.', link: '/app/m/runly.purchases/purchases/orders/{{id}}', fields: PURCHASE_FIELDS },
  'purchases.order.cancelled': { module: 'Compras', label: 'Se canceló una orden de compra', description: 'Cuando se cancela una orden.', link: '/app/m/runly.purchases/purchases/orders/{{id}}', fields: PURCHASE_FIELDS },
  'purchases.invoice.paid': { module: 'Compras', label: 'Se pagó una factura de compra', description: 'Cuando una factura de proveedor queda pagada.', link: '/app/m/runly.purchases/purchases/invoices/{{id}}', fields: PURCHASE_FIELDS },
  'purchases.order.corrected': { module: 'Compras', label: 'Se corrigió una orden de compra registrada', description: 'Cuando se corrige un dato administrativo (folio, referencia, notas, fechas) de una orden ya registrada, con motivo e historial.', link: '/app/m/runly.purchases/purchases/orders/{{id}}', fields: PURCHASE_FIELDS },
  'purchases.invoice.corrected': { module: 'Compras', label: 'Se corrigió una factura de compra registrada', description: 'Cuando se corrige un dato administrativo (folio del proveedor, notas, vencimiento) de una factura ya registrada.', link: '/app/m/runly.purchases/purchases/invoices/{{id}}', fields: PURCHASE_FIELDS },
  'purchases.receipt.reversed': { module: 'Compras', label: 'Se reversó una recepción de compra', description: 'Cuando se reversa total o parcialmente una recepción de mercancía; la recepción original se conserva.', link: '/app/m/runly.purchases/purchases/receipts/{{receiptId}}', fields: RECEIPT_REVERSAL_FIELDS },
  'purchases.invoice.payment.recorded': { module: 'Compras', label: 'Se registró un pago de una factura de compra', description: 'Cuando se registra un abono o el pago completo de una factura de proveedor (no se repite al reintentar).', link: '/app/m/runly.purchases/purchases/invoices/{{invoiceId}}', fields: PAYMENT_FIELDS },
  'purchases.invoice.payment.reversed': { module: 'Compras', label: 'Se reversó un pago de una factura de compra', description: 'Cuando se reversa un pago registrado; el pago original se conserva.', link: '/app/m/runly.purchases/purchases/invoices/{{invoiceId}}', fields: PAYMENT_FIELDS },
  'lms.enrollment.completed': { module: 'Capacitación', label: 'Una persona completó un curso', description: 'Cuando alguien termina todas las lecciones de un curso.', link: '/app/m/runly.lms/course/{{courseId}}', fields: [ID('la inscripción'), field('courseId', 'Curso', 'id', 'Curso completado.', '0198c1f2-7a4b-7c3d-9e10-5b2a6f4d8e36'), field('learnerId', 'Persona', 'id', 'Persona que completó el curso.', '0198c1f2-7a4b-7c3d-9e10-5b2a6f4d8e37')] },
  // No account or person names: a company automation can read every movement it receives.
  'ledger.transaction.created': { module: 'Libro de cuentas', label: 'Se registró un movimiento en el libro de cuentas', description: 'Cuando se captura un depósito o un retiro.', link: '/app/m/runly.ledger/accounts/{{accountId}}', fields: TRANSACTION_FIELDS },
  'ledger.transaction.updated': { module: 'Libro de cuentas', label: 'Se editó un movimiento del libro de cuentas', description: 'Cuando se cambia un depósito, retiro u otro dato de un movimiento.', link: '/app/m/runly.ledger/accounts/{{accountId}}', fields: TRANSACTION_FIELDS },
  'ledger.transaction.deleted': { module: 'Libro de cuentas', label: 'Se eliminó un movimiento del libro de cuentas', description: 'Cuando un movimiento se manda a la papelera del libro.', fields: TRANSACTION_FIELDS },
  // Published by the run log when any automation finishes (chaining). Spec §2.
  'automations.run.finished': { module: 'Automatizaciones', label: 'Terminó de ejecutarse una automatización', description: 'Cuando otra automatización termina, con éxito o con error. Úsalo para encadenar: avisar si una falla o seguir con otro proceso.', fields: [
    field('automationKey', 'Automatización', 'text', 'Clave de la automatización que terminó.', 'avisar_compra'),
    field('moduleKey', 'Módulo', 'text', 'Módulo al que pertenece (system.automations si es de la empresa).', 'system.automations'),
    field('status', 'Resultado', 'text', 'success (correcta), partial (parcial), failed (falló) o rejected (rechazada).', 'failed'),
    field('error', 'Error', 'text', 'Resumen del error, vacío si salió bien.', 'No tienes permiso para esta acción'),
    field('durationMs', 'Duración (ms)', 'number', 'Cuánto tardó en ejecutarse.', '240'),
    field('depth', 'Nivel de encadenamiento', 'number', 'Cuántas automatizaciones encadenadas hay antes de esta (límite 3).', '0'),
  ] },
  // Internal: a message arrived at the webhook of a company automation (hidden from pickers).
  'automations.webhook.received': { module: 'Automatizaciones', label: 'Se recibió un mensaje en un webhook de automatización', description: 'Interno.', fields: [field('automationKey', 'Automatización', 'text', 'Automatización destino.', 'pedido'), field('data', 'Datos', 'text', 'Datos recibidos.', '{}')] },
})
