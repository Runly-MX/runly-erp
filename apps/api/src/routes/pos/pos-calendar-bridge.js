// Best-effort mirror of POS activity onto runly.calendar: closed registers
// (cortes), table reservations and appointments. Same contract as the fleet
// bridge: never throws into the caller, no-op without the calendar module.

const SOURCE = "runly.pos";
const CALENDARS = {
  agenda: {
    name: "Punto de venta - Agenda",
    color: "#0E7490",
    icon: "CalendarClock",
    readers: ["pos.caja.read", "pos.comandas.read", "pos.admin.read"],
  },
  cortes: {
    name: "Punto de venta - Cortes",
    color: "#15803D",
    icon: "BadgeDollarSign",
    readers: ["pos.sessions.read", "pos.caja.close", "pos.admin.read"],
  },
};

function available(prisma) {
  return typeof prisma?.calendarCalendar?.create === "function" && typeof prisma?.calendarEvent?.create === "function";
}

function money(value, currency) {
  try {
    return Number(value ?? 0).toLocaleString("es-MX", { style: "currency", currency: currency || "MXN" });
  } catch {
    return `$${Number(value ?? 0).toFixed(2)}`;
  }
}

const addMinutes = (date, minutes) => new Date(new Date(date).getTime() + minutes * 60_000);

export function createPosCalendarBridge({ prisma, log = console.error }) {
  // One calendar per company and kind, owned by whoever triggered the first event.
  async function ensureCalendar(kind, companyId, ownerId) {
    const spec = CALENDARS[kind];
    const key = `pos.calendarId.${kind}.${companyId}`;
    const cfg = await prisma.instanceConfig.findUnique({ where: { key } });
    if (cfg?.value) {
      const existing = await prisma.calendarCalendar.findFirst({ where: { id: cfg.value, enabled: true }, select: { id: true } });
      if (existing) return cfg.value;
    }
    const calendar = await prisma.calendarCalendar.create({
      data: { ownerId, companyId, name: spec.name, color: spec.color, icon: spec.icon, isDefault: false },
    });
    await prisma.instanceConfig.upsert({ where: { key }, update: { value: calendar.id }, create: { key, value: calendar.id } });
    return calendar.id;
  }

  // Members whose role grants one of the reader permissions get it as viewers.
  async function share(kind, calendarId, ownerId, companyId) {
    const memberships = await prisma.membership.findMany({
      where: { companyId, enabled: true },
      select: { userId: true, role: { select: { enabled: true, permissions: { select: { permission: { select: { key: true } } } } } } },
    });
    const readers = CALENDARS[kind].readers;
    const userIds = new Set(memberships
      .filter((m) => m.userId && m.userId !== ownerId && m.role?.enabled !== false)
      .filter((m) => (m.role?.permissions ?? []).some((rp) => readers.includes(rp.permission?.key)))
      .map((m) => m.userId));
    for (const userId of userIds) {
      const existing = await prisma.calendarShare.findFirst({ where: { calendarId, userId }, select: { id: true } });
      if (!existing) await prisma.calendarShare.create({ data: { calendarId, userId, role: "VIEWER" } });
    }
  }

  async function remove(sourceEntityId) {
    if (!available(prisma) || !sourceEntityId) return;
    try {
      await prisma.calendarEvent.deleteMany({ where: { sourceModule: SOURCE, sourceEntityId } });
    } catch (err) {
      log("[runly.pos] calendar remove failed:", err?.message ?? err);
    }
  }

  async function upsert(kind, { companyId, actorId, sourceEntityId, ...event }) {
    if (!available(prisma) || !sourceEntityId || !actorId) return null;
    try {
      const calendarId = await ensureCalendar(kind, companyId, actorId);
      const data = { calendarId, color: CALENDARS[kind].color, sourceModule: SOURCE, sourceEntityId, allDay: false, ...event };
      const existing = await prisma.calendarEvent.findFirst({ where: { sourceModule: SOURCE, sourceEntityId }, select: { id: true } });
      if (existing) await prisma.calendarEvent.update({ where: { id: existing.id }, data });
      else await prisma.calendarEvent.create({ data });
      await share(kind, calendarId, actorId, companyId);
      return calendarId;
    } catch (err) {
      log("[runly.pos] calendar sync failed:", err?.message ?? err);
      return null;
    }
  }

  async function syncCorte({ companyId, actorId, sessionId }) {
    try {
      const session = await prisma.posSession.findFirst({
        where: { id: sessionId, companyId, status: "CLOSED" },
        include: { outlet: { select: { name: true } }, terminal: { select: { name: true } } },
      });
      if (!session) return null;
      const payments = await prisma.posPayment.findMany({ where: { sessionId, status: "CAPTURED" }, select: { amount: true } });
      const sold = payments.reduce((total, p) => total + Number(p.amount), 0);
      const orders = await prisma.posOrder.count({ where: { companyId, sessionId, status: { in: ["PAID", "REFUNDED"] } } });
      const currency = session.currency ?? "MXN";
      const lines = [
        `Sucursal: ${session.outlet?.name ?? ""}`,
        `Ventas cobradas: ${orders}`,
        `Cobrado: ${money(sold, currency)}`,
        session.expectedCashAmount != null ? `Efectivo esperado: ${money(session.expectedCashAmount, currency)}` : null,
        session.countedCashAmount != null ? `Efectivo contado: ${money(session.countedCashAmount, currency)}` : null,
        session.differenceAmount != null && Number(session.differenceAmount) !== 0 ? `Diferencia: ${money(session.differenceAmount, currency)}` : null,
      ].filter(Boolean);
      return upsert("cortes", {
        companyId, actorId, sourceEntityId: session.id,
        title: `Corte ${session.terminal?.name ?? "de caja"}: ${money(sold, currency)}`,
        description: lines.join("\n"),
        startAt: session.openedAt,
        endAt: session.closedAt ?? new Date(),
        location: session.outlet?.name ?? null,
      });
    } catch (err) {
      log("[runly.pos] corte calendar sync failed:", err?.message ?? err);
      return null;
    }
  }

  // Cancelled or no-show reservations leave no event behind.
  async function syncReservation({ companyId, actorId, reservation }) {
    if (!reservation?.id) return null;
    if (["CANCELLED", "NO_SHOW"].includes(reservation.status)) return remove(reservation.id);
    const table = reservation.tableId ? await prisma.posTable.findFirst({ where: { id: reservation.tableId, companyId }, select: { name: true } }).catch(() => null) : null;
    return upsert("agenda", {
      companyId, actorId, sourceEntityId: reservation.id,
      title: `Reservación: ${reservation.guestName} (${reservation.partySize} pers.)`,
      description: [reservation.guestPhone ? `Teléfono: ${reservation.guestPhone}` : null, table ? `Mesa: ${table.name}` : null, reservation.notes].filter(Boolean).join("\n") || null,
      startAt: reservation.scheduledAt,
      endAt: addMinutes(reservation.scheduledAt, reservation.durationMinutes ?? 90),
    });
  }

  async function syncAppointment({ companyId, actorId, appointment }) {
    if (!appointment?.id) return null;
    if (["CANCELLED", "NO_SHOW"].includes(appointment.status)) return remove(appointment.id);
    const services = (Array.isArray(appointment.items) ? appointment.items : []).map((i) => i.name).filter(Boolean);
    return upsert("agenda", {
      companyId, actorId, sourceEntityId: appointment.id,
      title: `Cita: ${appointment.customerName}${services.length ? ` - ${services.join(", ")}` : ""}`,
      description: [appointment.customerPhone ? `Teléfono: ${appointment.customerPhone}` : null, appointment.status === "COMPLETED" ? "Cobrada" : null, appointment.notes].filter(Boolean).join("\n") || null,
      startAt: appointment.startsAt,
      endAt: addMinutes(appointment.startsAt, appointment.durationMinutes ?? 60),
    });
  }

  return { syncCorte, syncReservation, syncAppointment, remove };
}
