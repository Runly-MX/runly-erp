// Single registry of configurable notification events, grouped by module.
// To integrate a new module: add its events to EVENT_CATALOG (or call
// registerNotificationEvents at module load) and, optionally, give it a label in
// registerNotificationModule. Events not registered here still appear, grouped under
// their prefix with a humanized title, so nothing silently disappears from the panel.
import { BellRing, CalendarClock, CheckSquare2, Globe2, MessageCircle, PhoneCall, ShieldAlert, Users } from "lucide-react";

export const EVENT_CATALOG = [
  { eventType: 'calendar.event.invite', title: 'Invitación a evento', description: 'Cuando te invitan a un evento.', icon: CalendarClock },
  { eventType: 'calendar.event.reschedule', title: 'Evento reprogramado', description: 'Cuando cambia la fecha de un evento al que asistes.', icon: CalendarClock },
  { eventType: 'calendar.event.cancel', title: 'Evento cancelado', description: 'Cuando cancelan un evento al que asistes.', icon: CalendarClock },
  { eventType: 'growth.lead.created', title: 'Nuevo lead asignado', description: 'Cuando se crea un lead a tu cargo.', icon: Users },
  { eventType: 'growth.lead.assigned', title: 'Asignación de lead', description: 'Cuando te asignan un lead existente.', icon: Users },
  { eventType: 'ledger.account_invite', title: 'Cuenta compartida', description: 'Cuando te comparten una cuenta.', icon: Users },
  { eventType: 'ledger.group_invite', title: 'Grupo de cuentas compartido', description: 'Cuando te agregan a un grupo de cuentas.', icon: Users },
  { eventType: 'ledger.access_revoked', title: 'Acceso a cuentas retirado', description: 'Cuando retiran tu acceso a una cuenta o grupo.', icon: ShieldAlert },
  { eventType: 'pfm.budget.threshold', title: 'Presupuesto próximo al límite', description: 'Cuando tu presupuesto alcanza el umbral de alerta.', icon: ShieldAlert },
  { eventType: 'pfm.budget.overage', title: 'Presupuesto excedido', description: 'Cuando tus gastos superan el presupuesto.', icon: ShieldAlert },
  { eventType: 'projects.task.reaction', title: 'Reacción en tarea', description: 'Cuando reaccionan a tu comentario en una tarea.', icon: CheckSquare2 },
  { eventType: 'inventory.item.reaction', title: 'Reacción en inventario', description: 'Cuando reaccionan a tu comentario en inventario.', icon: CheckSquare2 },
  // runly.chat
  { eventType: 'chat.reminder', title: 'Recordatorio de un mensaje', description: 'Cuando llega la hora de un mensaje que pediste recordar.', icon: CalendarClock },
  { eventType: 'chat.member.added', title: 'Invitación a un chat', description: 'Cuando te agregan a un canal o grupo.', icon: Users },
  { eventType: 'chat.mention.new', title: 'Mención en chat', description: 'Cuando te mencionan en una conversación.', icon: MessageCircle },
  { eventType: 'chat.thread.reply', title: 'Respuesta en un hilo', description: 'Cuando responden en un hilo en el que participas.', icon: MessageCircle },
  { eventType: 'notes.note.shared', title: 'Nota compartida', description: 'Cuando comparten una nota contigo.', icon: Users },
  { eventType: 'files.folder.shared', title: 'Carpeta compartida', description: 'Cuando comparten una carpeta de Archivos contigo.', icon: Users },
  { eventType: 'inventory.item.mention', title: 'Mención en inventario', description: 'Cuando te mencionan en un comentario de inventario.', icon: CheckSquare2 },
  {
    eventType: "chat.message.new",
    title: "Mensaje de chat",
    description:
      "Aviso por cada mensaje directo o de grupo. El correo solo se envia cuando llevas un rato sin abrir la conversacion, no en cada mensaje.",
    icon: MessageCircle,
  },
  {
    eventType: "chat.call.incoming",
    title: "Llamada entrante",
    description: "Cuando alguien te llama o inicia una videollamada.",
    icon: PhoneCall,
  },
  // runly.projects
  {
    eventType: "projects.member.added",
    title: "Nuevo miembro en proyecto",
    description: "Cuando te agregan como miembro a un proyecto.",
    icon: Users,
  },
  {
    eventType: "projects.task.assigned",
    title: "Tarea asignada",
    description: "Cuando te asignan una tarea.",
    icon: CheckSquare2,
  },
  {
    eventType: "projects.task.unassigned",
    title: "Removido de tarea",
    description: "Cuando te quitan de una tarea asignada.",
    icon: CheckSquare2,
  },
  {
    eventType: "projects.task.comment",
    title: "Comentario en tarea",
    description: "Nuevo comentario en una tarea asignada a ti.",
    icon: CheckSquare2,
  },
  {
    eventType: "projects.task.mention",
    title: "Mencion en comentario",
    description: "Alguien te menciono con @ en un comentario.",
    icon: CheckSquare2,
  },
  {
    eventType: "projects.task.due_soon",
    title: "Tarea por vencer",
    description: "Una tarea tuya vence en menos de 24 horas.",
    icon: CheckSquare2,
  },
  {
    eventType: "projects.task.status_changed",
    title: "Cambio de estado en tarea",
    description: "El estado de una tarea asignada a ti cambio.",
    icon: CheckSquare2,
  },
  // runly.calendar
  {
    eventType: "calendar.event.reminder",
    title: "Recordatorio de calendario",
    description: "Alerta cuando un evento esta por comenzar.",
    icon: CalendarClock,
  },
  // runly.website
  {
    eventType: "website.sale.confirmed",
    title: "Venta confirmada",
    description: "Notifica nuevas ventas confirmadas en website.",
    icon: Globe2,
  },
  {
    eventType: "website.payment.failed",
    title: "Pago fallido",
    description: "Avisa si una transaccion falla en checkout.",
    icon: Globe2,
  },
  // sistema
  {
    eventType: "system.alert",
    title: "Alerta de sistema",
    description: "Eventos criticos de operacion o integraciones.",
    icon: ShieldAlert,
  },
];

const MODULES = {
  calendar: "Calendario",
  growth: "Crecimiento",
  ledger: "Cuentas",
  pfm: "Finanzas personales",
  projects: "Proyectos",
  inventory: "Inventario",
  chat: "Chat y llamadas",
  notes: "Notas",
  files: "Archivos",
  website: "Sitio web",
  system: "Sistema",
};

export function registerNotificationModule(id, label) {
  MODULES[id] = label;
}

export function registerNotificationEvents(events) {
  for (const event of events) {
    if (!EVENT_CATALOG.some((e) => e.eventType === event.eventType)) EVENT_CATALOG.push(event);
  }
}

const humanize = (text) => {
  const spaced = text.replace(/[._-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

export function moduleOf(eventType) {
  const prefix = eventType.split(".")[0];
  return { id: prefix, label: MODULES[prefix] ?? humanize(prefix) };
}

// Row for an event that has no catalog entry (a module that registered preferences only).
export function fallbackEvent(eventType) {
  return {
    eventType,
    title: humanize(eventType.split(".").slice(1).join(" ") || eventType),
    description: "Evento registrado por un módulo.",
    icon: BellRing,
  };
}
