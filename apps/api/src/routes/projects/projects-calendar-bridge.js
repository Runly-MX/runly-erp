export function createProjectsCalendarBridge({ prisma }) {
  function isCalendarAvailable() {
    return typeof prisma.calendarCalendar?.create === "function";
  }

  async function syncProjectCalendar(project) {
    if (!isCalendarAvailable()) return null;
    try {
      if (project.calendarId) {
        const existing = await prisma.calendarCalendar.findFirst({
          where: { id: project.calendarId, enabled: true },
          select: { id: true },
        });
        if (existing) {
          await prisma.calendarCalendar.update({
            where: { id: project.calendarId },
            data: {
              name: project.name,
              color: project.color ?? "#6366f1",
              icon: project.icon ?? null,
              // Backfills calendars created before this field was wired up
              // (they were stuck with company_id: null, which threw off
              // attendee-company validation on event creation) — self-heals
              // on the next project touch.
              companyId: project.companyId ?? null,
            },
          });
          return project.calendarId;
        }
        // Calendar was soft-deleted — clear stale reference before recreating
        await prisma.project.update({
          where: { id: project.id },
          data: { calendarId: null },
        });
      }
      const calendar = await prisma.calendarCalendar.create({
        data: {
          ownerId: project.ownerId,
          companyId: project.companyId ?? null,
          name: project.name,
          color: project.color ?? "#6366f1",
          icon: project.icon ?? null,
          isDefault: false,
        },
      });
      await prisma.project.update({
        where: { id: project.id },
        data: { calendarId: calendar.id },
      });
      return calendar.id;
    } catch {
      return null;
    }
  }

  async function grantMemberCalendarAccess(calendarId, userId) {
    if (!isCalendarAvailable() || !calendarId) return;
    try {
      const calendar = await prisma.calendarCalendar.findFirst({
        where: { id: calendarId },
        select: { ownerId: true },
      });
      // Owner already has full access — never create a redundant share
      if (!calendar || calendar.ownerId === userId) return;
      const existing = await prisma.calendarShare.findFirst({
        where: { calendarId, userId },
      });
      if (existing) return;
      await prisma.calendarShare.create({
        data: { calendarId, userId, role: "VIEWER" },
      });
    } catch {
      // Calendar access is best-effort — never block project operations
    }
  }

  async function revokeMemberCalendarAccess(calendarId, userId) {
    if (!isCalendarAvailable() || !calendarId) return;
    try {
      await prisma.calendarShare.deleteMany({ where: { calendarId, userId } });
    } catch {
      // Silently ignore
    }
  }

  // The task's dates as one all-day calendar event: a single day when only one date is
  // set (or both are the same), a range from start to due otherwise (both ends included,
  // the calendar treats an all-day end as inclusive). A task with no dates has no event.
  async function syncTaskEvent(task, calendarId) {
    const dated = Boolean(task.startDate || task.dueDate);
    if (!isCalendarAvailable() || !calendarId || !dated) {
      if (task.calendarEventId) {
        await deleteTaskEvent(task.calendarEventId);
        await prisma.task.update({
          where: { id: task.id },
          data: { calendarEventId: null },
        });
      }
      return null;
    }
    try {
      // Date-only (midnight UTC): all-day events are stored as UTC-midnight instants and
      // task dates are stored at noon UTC, so the day never shifts with the time zone.
      const toDateUTC = (d) => {
        // eslint-disable-next-line no-restricted-syntax -- deliberate UTC: all-day events are stored as UTC-midnight instants
        const s = new Date(d).toISOString().split("T")[0];
        return new Date(s + "T00:00:00.000Z");
      };
      const first = toDateUTC(task.startDate ?? task.dueDate);
      const last = toDateUTC(task.dueDate ?? task.startDate);
      // A reversed range (due before start) still shows as the days between the two.
      const startAt = first <= last ? first : last;
      const endAt = first <= last ? last : first;
      const eventData = {
        calendarId,
        title: task.title,
        startAt,
        endAt,
        allDay: true,
        sourceModule: "runly.projects",
        sourceEntityId: task.id,
      };
      if (task.calendarEventId) {
        try {
          await prisma.calendarEvent.update({
            where: { id: task.calendarEventId },
            data: { calendarId, title: eventData.title, startAt, endAt, allDay: true },
          });
          return task.calendarEventId;
        } catch (error) {
          // The event was deleted from the calendar: fall through and create it again.
          if (error?.code && error.code !== "P2025") throw error;
        }
      }
      const event = await prisma.calendarEvent.create({ data: eventData });
      await prisma.task.update({
        where: { id: task.id },
        data: { calendarEventId: event.id },
      });
      return event.id;
    } catch (error) {
      console.error("[projects] no se pudo sincronizar la tarea con el calendario:", task.id, error?.message ?? error);
      return null;
    }
  }

  async function deleteTaskEvent(eventId) {
    if (!isCalendarAvailable() || !eventId) return;
    try {
      await prisma.calendarEvent.delete({ where: { id: eventId } });
    } catch {
      // Event may already be deleted
    }
  }

  return {
    syncProjectCalendar,
    grantMemberCalendarAccess,
    revokeMemberCalendarAccess,
    syncTaskEvent,
    deleteTaskEvent,
  };
}
