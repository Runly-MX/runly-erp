// Starting points of "Nueva automatización": the three ways an automation can
// begin, and a few ready examples. Drafts are not saved until the person saves
// them in the editor, so incomplete data (a recipient to choose, for example)
// is flagged on the block instead of blocking the start.

export const STARTERS = [
  {
    id: "event",
    title: "Cuando pasa algo en Runly",
    text: "Una orden de compra se aprueba, llega un colaborador, se completa una tarea o un curso...",
    draft: () => ({ trigger: { type: "event", event: "purchases.order.approved" }, steps: [{ service: "", args: {} }] }),
  },
  {
    id: "schedule",
    title: "En un horario",
    text: "Cada hora, día, semana o mes: revisiones, recordatorios y tareas que se repiten.",
    draft: () => ({ trigger: { type: "schedule", every: "week", weekday: 1, at: "08:00" }, steps: [{ service: "", args: {} }] }),
  },
  {
    id: "webhook",
    title: "Cuando otro sistema me envía datos",
    text: "Tu tienda, un formulario o un CRM manda un mensaje y Runly actúa con esos datos.",
    draft: () => ({ trigger: { type: "webhook", fields: [] }, steps: [{ service: "", args: {} }] }),
  },
];

export const EXAMPLES = [
  {
    id: "orden-aprobada",
    title: "Avisar cuando se aprueba una orden de compra",
    text: "Envía una notificación a las personas que elijas.",
    label: "Aviso de orden de compra aprobada",
    draft: () => ({
      trigger: { type: "event", event: "purchases.order.approved" },
      steps: [{ service: "runly.notifications:notifications.send", args: { title: { from: "template", template: "Se aprobó la orden de compra" }, body: { from: "template", template: "Orden {{id}}" } } }],
    }),
  },
  {
    id: "revision-semanal",
    title: "Revisión semanal cada lunes",
    text: "Crea un registro recordatorio cada lunes a las 8:00.",
    label: "Revisión semanal",
    draft: () => ({
      trigger: { type: "schedule", every: "week", weekday: 1, at: "08:00" },
      steps: [{ service: "runly.contacts:contacts.create", args: { name: { from: "template", template: "Revisión semanal" }, type: { from: "value", value: "company" } } }],
    }),
  },
  {
    id: "pedido-webhook",
    title: "Registrar clientes que llegan por webhook",
    text: "Un sistema externo envía nombre y teléfono; Runly crea el contacto.",
    label: "Clientes desde mi tienda",
    draft: () => ({
      trigger: { type: "webhook", fields: [{ key: "cliente_nombre", label: "Nombre del cliente" }, { key: "telefono", label: "Teléfono" }] },
      steps: [{ service: "runly.contacts:contacts.create", args: { name: { from: "field", field: "cliente_nombre" }, phone: { from: "field", field: "telefono" }, type: { from: "value", value: "person" } } }],
    }),
  },
];

// snake_case key for a name, unique among `taken`.
export function keyFromName(name, taken = new Set()) {
  const base = String(name ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 36);
  const root = !base ? "automatizacion" : /^[a-z]/.test(base) && base.length >= 2 ? base : `a_${base}`;
  let key = root;
  for (let index = 2; taken.has(key); index += 1) key = `${root}_${index}`;
  return key;
}
