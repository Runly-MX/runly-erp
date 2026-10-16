import { z } from 'zod';
import { createCalendarService } from '../../routes/calendar/calendar-service.js';
import { createCalendarEventService } from '../../routes/calendar/calendar-event-service.js';
import { createCalendarEventEffects } from '../../routes/calendar/calendar-event-effects.js';
import { createCalendarMiraiQueries } from '../../routes/calendar/calendar-mirai-queries.js';
import { createCalendarMiraiActions } from '../../routes/calendar/mirai-actions.js';
import { insist } from '../config.js';

export function createCalendarAdapter({ prisma }) {
  const service = createCalendarService({ prisma }), eventService = createCalendarEventService({ prisma });
  const actions = createCalendarMiraiActions({ prisma, eventService, effects: createCalendarEventEffects({ prisma }) }).filter(a => ['calendar.event.create', 'calendar.event.update'].includes(a.key));
  return { moduleKey: 'runly.calendar', label: 'Calendario', actions,
    queries: [...createCalendarMiraiQueries({ eventService }), { name: 'calendar_calendars', permission: 'calendar.events.read', inputSchema: z.object({}).strict(), definition: { description: 'Calendarios propios y compartidos accesibles.' }, run: async (_input, a) => service.listCalendars(a.actorProfileId, a.companyId) }],
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
    effects: ['Guardar/reprogramar eventos internos; participantes y avisos internos a usuarios de la empresa. Sin cambios a Google u otros proveedores externos.'],
  };
}
