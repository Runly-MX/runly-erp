// Starting points of "Nueva automatización": the ways an automation can begin, and
// a few ready examples. Drafts are not saved until the person saves them in the
// editor, so incomplete data (a recipient to choose, for example) is flagged on the
// block instead of blocking the start.
import { toLocalIso } from "@runly/core";

const inDays = (days) => toLocalIso(new Date(Date.now() + days * 86_400_000));

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
  {
    id: "date",
    title: "En una fecha de un registro",
    text: "Días antes o después de que venza una factura, una tarea o una póliza, o del aniversario de un colaborador.",
    draft: () => ({ trigger: { type: "date", source: "purchases.invoice.due", offsetDays: -3, at: "08:00" }, steps: [{ service: "", args: {} }] }),
  },
];

const notifyMe = (title) => ({ service: "runly.notifications:notifications.send", args: { title: { from: "template", template: title } } });

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
  {
    id: "transcribir-grabacion",
    title: "Transcribir cada llamada grabada",
    text: "Al terminar una grabación pide su transcripción. Combínala con «Minuta de videollamada a los participantes».",
    label: "Transcribir llamadas grabadas",
    draft: () => ({
      trigger: { type: "event", event: "calls.recording.ready" },
      steps: [{ service: "runly.calls:transcripts.request", args: { callId: { from: "field", field: "callId" } } }],
    }),
  },
  {
    id: "minuta-llamada",
    title: "Minuta de videollamada a los participantes",
    text: "Cuando queda lista la transcripción, escribe la minuta (con MirAI o sin IA) y la envía por correo con el PDF a cada participante que tenga correo.",
    label: "Minuta de llamadas a participantes",
    draft: () => ({
      trigger: { type: "event", event: "calls.transcript.ready" },
      steps: [
        { service: "runly.calls:minutes.generate", args: { transcriptId: { from: "field", field: "id" }, mode: { from: "value", value: "auto" } } },
        {
          type: "loop", service: "runly.calls:participants.search",
          args: { callId: { from: "field", field: "callId" }, scope: { from: "value", value: "all" } },
          when: { field: "email", op: "filled" },
          do: [{ service: "runly.notifications:email.send", args: { to: { from: "field", field: "elemento_email" }, subject: { from: "template", template: "Minuta: {{title}}" }, body: { from: "field", field: "paso1_text" }, fileId: { from: "field", field: "paso1_id" } } }],
        },
      ],
    }),
  },
  {
    id: "chat-bienvenida",
    title: "Contestar en automático en el chat del sitio web",
    text: "Responde al primer mensaje de cada visitante y avisa al equipo. No se repite en 12 horas por conversación.",
    label: "Bienvenida en chats externos",
    draft: () => ({
      trigger: { type: "event", event: "chat.external.message.received", when: { field: "first", op: "equals", value: true } },
      once: { field: "conversationId", hours: 12 },
      steps: [
        { service: "runly.chat:conversations.reply", args: { conversationId: { from: "field", field: "conversationId" }, text: { from: "value", value: "¡Gracias por escribirnos! En un momento te atiende una persona del equipo." } } },
        notifyMe("Nuevo chat de {{guestName}}: {{text}}"),
      ],
    }),
  },
  {
    id: "vacaciones",
    title: "Respuesta automática de vacaciones",
    text: "Mientras estás fuera, quien te escriba por mensaje directo recibe una respuesta, una vez al día por conversación. Elige a la persona y las fechas.",
    label: "Respuesta de vacaciones",
    draft: () => ({
      trigger: { type: "event", event: "chat.direct.message.received", when: { field: "recipientId", op: "equals", value: "" } },
      active: { from: inDays(0), until: inDays(7) },
      once: { field: "conversationId", hours: 24 },
      steps: [{ service: "runly.chat:conversations.reply", args: { conversationId: { from: "field", field: "conversationId" }, text: { from: "value", value: "Estoy de vacaciones y regreso pronto. Si es urgente, escribe a mi equipo." }, label: { from: "value", value: "Respuesta automática" } } }],
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
