// Dates of records a company automation can wait for ("3 días antes de que venza la
// factura"). Same shape as the event catalog: what the record is, its screen and the
// data each run gets. The ERP API holds the queries
// (apps/api/src/services/automation-date-sources.js). Spec
// docs/superpowers/specs/2026-10-31-automations-retries-loops-date-triggers-design.md §C.

const field = (key, label, type, description, example) => Object.freeze({ key, label, type, description, example })
const ID = (what) => field('id', 'Identificador', 'id', `Código único de ${what}.`, '0198c1f2-7a4b-7c3d-9e10-5b2a6f4d8e31')
const DAY = (key, label, description) => field(key, label, 'date', description, '2026-11-03')
const P = '/app/m/runly.purchases/purchases'

// key -> { module, label, date (the date as a phrase: "el vencimiento de..."), description, link, fields }
export const DATE_SOURCES = Object.freeze({
  'purchases.invoice.due': {
    module: 'Compras', label: 'Vencimiento de una factura de compra', date: 'el vencimiento de una factura de compra', description: 'Facturas de proveedor sin pagar por completo, según su fecha de vencimiento.',
    link: `${P}/invoices/{{id}}`,
    fields: [ID('la factura'), field('number', 'Folio', 'text', 'Folio de la factura.', 'F-1042'), field('supplierId', 'Proveedor', 'id', 'Proveedor de la factura.', '0198c1f2-7a4b-7c3d-9e10-5b2a6f4d8e39'),
      field('status', 'Estado', 'text', 'PENDING o PARTIALLY_PAID.', 'PENDING'), field('total', 'Total', 'number', 'Importe total.', '12500.00'), field('balance', 'Saldo', 'number', 'Lo que falta por pagar.', '12500.00'),
      field('currency', 'Moneda', 'text', 'Moneda.', 'MXN'), DAY('dueDate', 'Vence', 'Fecha de vencimiento.')],
  },
  'purchases.order.expected': {
    module: 'Compras', label: 'Entrega esperada de una orden de compra', date: 'la entrega esperada de una orden de compra', description: 'Órdenes aprobadas o emitidas que aún no se reciben por completo, según su fecha de entrega esperada.',
    link: `${P}/orders/{{id}}`,
    fields: [ID('la orden'), field('number', 'Folio', 'text', 'Folio de la orden.', 'OC-0042'), field('supplierId', 'Proveedor', 'id', 'Proveedor de la orden.', '0198c1f2-7a4b-7c3d-9e10-5b2a6f4d8e39'),
      field('status', 'Estado', 'text', 'APPROVED, ISSUED o PARTIALLY_RECEIVED.', 'ISSUED'), field('total', 'Total', 'number', 'Importe total.', '12500.00'),
      field('currency', 'Moneda', 'text', 'Moneda.', 'MXN'), DAY('expectedDate', 'Entrega esperada', 'Fecha en que se espera la entrega.')],
  },
  'projects.task.due': {
    module: 'Proyectos', label: 'Vencimiento de una tarea de proyecto', date: 'el vencimiento de una tarea de proyecto', description: 'Tareas sin completar, según su fecha de vencimiento.',
    link: '/app/m/runly.projects?open=task:{{id}}&project={{projectId}}',
    fields: [ID('la tarea'), field('projectId', 'Proyecto', 'id', 'Proyecto de la tarea.', '0198c1f2-7a4b-7c3d-9e10-5b2a6f4d8e34'), field('title', 'Título', 'text', 'Título de la tarea.', 'Revisar contrato'),
      field('assigneeId', 'Responsable', 'person', 'Persona responsable, si hay.', '0198c1f2-7a4b-7c3d-9e10-5b2a6f4d8e3d'), field('priority', 'Prioridad', 'text', 'Prioridad de la tarea.', 'HIGH'),
      DAY('dueDate', 'Vence', 'Fecha de vencimiento.')],
  },
  'fleet.insurance.expiry': {
    module: 'Flota', label: 'Vencimiento de una póliza de seguro', date: 'el vencimiento de una póliza de seguro', description: 'Pólizas activas de los vehículos, según su fecha de vencimiento.',
    link: '/app/m/runly.fleet/insurance/{{id}}',
    fields: [ID('la póliza'), field('vehicleId', 'Vehículo', 'id', 'Vehículo asegurado.', '0198c1f2-7a4b-7c3d-9e10-5b2a6f4d8e40'), field('insurer', 'Aseguradora', 'text', 'Nombre de la aseguradora.', 'Seguros del Norte'),
      field('policyNumber', 'Número de póliza', 'text', 'Número de la póliza.', 'POL-88123'), DAY('expiryDate', 'Vence', 'Fecha de vencimiento.')],
  },
  'hr.employee.anniversary': {
    module: 'Recursos humanos', label: 'Aniversario de ingreso de un colaborador', date: 'el aniversario de ingreso de un colaborador', description: 'Colaboradores activos, cada año en la fecha en que ingresaron.',
    link: '/app/m/runly.hr/hr/employees/{{id}}',
    fields: [ID('el colaborador'), field('firstName', 'Nombre', 'text', 'Nombre(s).', 'Ana'), field('lastName', 'Apellidos', 'text', 'Apellidos.', 'Pérez'),
      field('jobTitle', 'Puesto', 'text', 'Puesto.', 'Analista de compras'), field('department', 'Departamento', 'text', 'Departamento.', 'Finanzas'),
      DAY('hireDate', 'Fecha de ingreso', 'Fecha en que ingresó.'), field('years', 'Años', 'number', 'Años que cumple en la empresa.', '3'),
      field('userProfileId', 'Su usuario', 'person', 'Usuario de Runly del colaborador, si tiene (para avisarle).', '0198c1f2-7a4b-7c3d-9e10-5b2a6f4d8e41')],
  },
})

export const MAX_DATE_OFFSET_DAYS = 60
export const MAX_DATE_RECORDS = 200
