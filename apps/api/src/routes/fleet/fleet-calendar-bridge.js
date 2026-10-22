// Best-effort mirror of fleet report follow-ups (next service date) onto
// runly.calendar. Same contract as pfm/projects bridges: never throws into the
// caller, and is a no-op when the calendar module is not installed.

const SOURCE = "runly.fleet";
const CALENDAR_NAME = "Mantenimiento de flota";
const CALENDAR_COLOR = "#0F766E";
const TYPE_LABELS = {
  maintenance: "Mantenimiento",
  service: "Servicio",
  repair: "Reparacion",
  other: "Seguimiento",
};

function isCalendarAvailable(prisma) {
  return (
    typeof prisma?.calendarCalendar?.create === "function" &&
    typeof prisma?.calendarEvent?.create === "function"
  );
}

function toUtcDay(value) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  return new Date(`${text.slice(0, 10)}T00:00:00.000Z`);
}

export function createFleetCalendarBridge({ prisma }) {
  // One shared calendar per company, owned by whoever wrote the first report.
  async function ensureCalendar(companyId, ownerId) {
    const key = `fleet.calendarId.${companyId}`;
    const cfg = await prisma.instanceConfig.findUnique({ where: { key } });
    if (cfg?.value) {
      const existing = await prisma.calendarCalendar.findFirst({
        where: { id: cfg.value, enabled: true },
        select: { id: true },
      });
      if (existing) return cfg.value;
    }
    const calendar = await prisma.calendarCalendar.create({
      data: {
        ownerId,
        companyId,
        name: CALENDAR_NAME,
        color: CALENDAR_COLOR,
        icon: "Truck",
        isDefault: false,
      },
    });
    await prisma.instanceConfig.upsert({
      where: { key },
      update: { value: calendar.id },
      create: { key, value: calendar.id },
    });
    return calendar.id;
  }

  // Members who can read fleet reports get the calendar as viewers.
  async function shareWithFleetReaders(calendarId, ownerId, companyId) {
    const memberships = await prisma.membership.findMany({
      where: { companyId, enabled: true },
      select: {
        userId: true,
        role: {
          select: {
            key: true,
            enabled: true,
            permissions: { select: { permission: { select: { key: true } } } },
          },
        },
      },
    });
    const userIds = memberships
      .filter((m) => m.userId && m.userId !== ownerId && m.role?.enabled !== false)
      .filter((m) =>
        (m.role?.permissions ?? []).some((rp) =>
          ["fleet.reports.read", "fleet.access"].includes(rp.permission?.key),
        ),
      )
      .map((m) => m.userId);
    for (const userId of new Set(userIds)) {
      const existing = await prisma.calendarShare.findFirst({
        where: { calendarId, userId },
        select: { id: true },
      });
      if (!existing) {
        await prisma.calendarShare.create({
          data: { calendarId, userId, role: "VIEWER" },
        });
      }
    }
  }

  async function findEvent(reportId) {
    return prisma.calendarEvent.findFirst({
      where: { sourceModule: SOURCE, sourceEntityId: reportId },
      select: { id: true },
    });
  }

  async function removeReportEvent(reportId) {
    if (!isCalendarAvailable(prisma) || !reportId) return;
    try {
      await prisma.calendarEvent.deleteMany({
        where: { sourceModule: SOURCE, sourceEntityId: reportId },
      });
    } catch {
      // event already gone
    }
  }

  // Creates, moves or removes the calendar event that follows the report's
  // next_service_date. Disabled or date-less reports leave no event behind.
  async function syncReportEvent({ companyId, actorId, report }) {
    if (!isCalendarAvailable(prisma) || !report?.id) return null;
    if (!report.next_service_date || report.enabled === false) {
      await removeReportEvent(report?.id);
      return null;
    }
    try {
      const calendarId = await ensureCalendar(companyId, actorId);
      const label = TYPE_LABELS[report.report_type] ?? TYPE_LABELS.other;
      const plate = report.vehicle_plate ? ` - ${report.vehicle_plate}` : "";
      const odometer = report.next_service_odometer
        ? `Proximo servicio a los ${Number(report.next_service_odometer).toLocaleString("es-MX")} km. `
        : "";
      const data = {
        calendarId,
        title: `Proximo ${label.toLowerCase()}${plate}`,
        description: `${odometer}Generado desde el reporte ${report.folio ?? ""}.`.trim(),
        startAt: toUtcDay(report.next_service_date),
        allDay: true,
        color: CALENDAR_COLOR,
        sourceModule: SOURCE,
        sourceEntityId: report.id,
      };
      const existing = await findEvent(report.id);
      if (existing) {
        await prisma.calendarEvent.update({ where: { id: existing.id }, data });
      } else {
        await prisma.calendarEvent.create({ data });
      }
      await shareWithFleetReaders(calendarId, actorId, companyId);
      return calendarId;
    } catch (err) {
      console.error("[runly.fleet] calendar bridge failed:", err?.message ?? err);
      return null;
    }
  }

  return { syncReportEvent, removeReportEvent };
}
