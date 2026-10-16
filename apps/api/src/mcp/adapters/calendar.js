import { z } from 'zod';
import { createCalendarService } from '../../routes/calendar/calendar-service.js';
import { createCalendarEventService } from '../../routes/calendar/calendar-event-service.js';
import { createCalendarEventEffects, actorContext } from '../../routes/calendar/calendar-event-effects.js';
import { createUserAccessService } from '../../services/user-access-service.js';
import { createCalendarMiraiQueries } from '../../routes/calendar/calendar-mirai-queries.js';
import { createCalendarMiraiActions } from '../../routes/calendar/mirai-actions.js';
import { insist } from '../config.js';
import { pageInput } from '../contracts.js';

export function createCalendarAdapter({ prisma }) {
  const service = createCalendarService({ prisma }), eventService = createCalendarEventService({ prisma });
  const effects = createCalendarEventEffects({ prisma });
  const actions = createCalendarMiraiActions({ prisma, eventService, effects }).filter(a => ['calendar.event.create', 'calendar.event.update'].includes(a.key));
  actions.push({
    key: 'calendar.event.attendees.add', permission: 'calendar.events.update', operation: 'update', label: 'Agregar participantes',
    inputSchema: z.object({ eventId: z.uuid(), userProfileIds: z.array(z.uuid()).min(1).max(20) }).strict(),
    async prepare(input, a) {
      const event = await eventService.getEvent(a.actorProfileId, input.eventId, a.companyId);
      const manager = event.calendar.ownerId === a.actorProfileId || await prisma.calendarShare.findFirst({ where: { calendarId: event.calendarId, userId: a.actorProfileId, role: 'MANAGER' }, select: { id: true } });
      insist(manager, 'permission_denied', 'Solo el propietario o un gestor puede agregar participantes.', 403);
      const userProfileIds = [...new Set(input.userProfileIds)].sort();
      await createUserAccessService({ prisma }).assertCandidates({ companyId: a.companyId, userIds: userProfileIds });
      insist(!event.attendees.some(attendee => userProfileIds.includes(attendee.userId)), 'duplicate_resource', 'Una cuenta seleccionada ya participa en el evento.', 409);
      const people = await prisma.userProfile.findMany({ where: { id: { in: userProfileIds } }, select: { id: true, displayName: true, email: true }, orderBy: { id: 'asc' } });
      return { input: { eventId: event.id, userProfileIds }, targetId: event.id, preview: { title: 'Agregar participantes', fields: [{ label: 'Evento', value: event.title }, ...people.map(person => ({ label: 'Destinatario', value: `${person.id}: ${person.displayName} (${person.email})` }))] } };
    },
    async execute(input, a) {
      const event = await eventService.getEvent(a.actorProfileId, input.eventId, a.companyId);
      for (const id of input.userProfileIds) {
        await eventService.addAttendee(a.actorProfileId, event.id, id, a.companyId);
        await effects.afterAddAttendee(actorContext({ companyId: a.companyId, profile: a.actorProfile }), event, id);
      }
      return { id: event.id, participantIds: input.userProfileIds, link: `/app/m/runly.calendar?eventId=${event.id}` };
    },
  });
  return { moduleKey: 'runly.calendar', label: 'Calendario', actions,
    queries: [...createCalendarMiraiQueries({ eventService }), { name: 'calendar_calendars', permission: 'calendar.calendars.read', inputSchema: z.object({}).strict(), definition: { description: 'Calendarios propios y compartidos accesibles.' }, run: async (_input, a) => service.listCalendars(a.actorProfileId, a.companyId) },
      { name: 'calendar_events_page', permission: 'calendar.events.read', definition: { description: 'Eventos paginados con fechas ISO y zona horaria explícita; rango máximo de 62 días.' }, inputSchema: z.object({ ...pageInput, start: z.iso.datetime({ offset: true }), end: z.iso.datetime({ offset: true }) }).strict().refine(input => new Date(input.end) >= new Date(input.start) && new Date(input.end) - new Date(input.start) <= 62 * 86400000), async run(input, a) { const rows = await eventService.listEvents({ userId: a.actorProfileId, companyId: a.companyId, start: input.start, end: input.end }); return { items: rows.slice((input.page - 1) * input.limit, input.page * input.limit), total: rows.length, page: input.page, limit: input.limit }; } }],
    async guard(definition, input, a) {
      if (!definition.key) return;
      if (input.eventId) {
        const event = await eventService.getEvent(a.actorProfileId, input.eventId.split('_')[0], a.companyId);
        insist(!event.sourceModule, 'external_resource', 'Edita los eventos vinculados desde su módulo de origen.', 403);
        const writable = event.calendar.ownerId === a.actorProfileId || await prisma.calendarShare.findFirst({ where: { calendarId: event.calendarId, userId: a.actorProfileId, role: { in: ['EDITOR', 'MANAGER'] } }, select: { id: true } });
        insist(writable, 'permission_denied', 'No puedes modificar este evento.', 403);
      }
      // External provider write-through is intentionally outside MCP's contract.
      const calendars = await prisma.calendarCalendar.findMany({ where: { enabled: true, OR: [{ ownerId: a.actorProfileId }, { shares: { some: { userId: a.actorProfileId, role: { in: ['EDITOR', 'MANAGER'] } } } }], AND: [{ OR: [{ companyId: a.companyId }, { companyId: null }] }] }, select: { id: true } });
      const external = await prisma.googleCalendarSource.findMany({ where: { atlasCalendarId: { in: calendars.map(c => c.id) } }, select: { atlasCalendarId: true } });
      if (input.calendar) {
        // The domain resolver selects by name; its resolved ID is also checked
        // in revision before any proposal is persisted or executed.
        insist(typeof input.calendar === 'string', 'invalid_request', 'Calendario inválido.');
      }
      a.mcpExternalCalendarIds = external.map(c => c.atlasCalendarId);
    },
    async revision(_definition, prepared, a) {
      const event = prepared.targetId ? await eventService.getEvent(a.actorProfileId, prepared.targetId, a.companyId) : null;
      const calendarId = prepared.input.calendarId ?? prepared.input.data?.calendarId ?? event?.calendarId;
      insist(!(a.mcpExternalCalendarIds ?? []).includes(calendarId), 'external_resource', 'Los calendarios externos no se pueden modificar mediante MCP.', 403);
      return event;
    },
    effects: ['Guardar/reprogramar eventos internos y participantes. Las invitaciones y reprogramaciones pueden generar avisos en el ERP, correo y web push según las preferencias. Sin cambios a Google u otros calendarios externos.'],
  };
}
