import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPosAppointmentService } from "../pos-appointment-service.js";
import { createPosCalendarBridge } from "../pos-calendar-bridge.js";
import { PosServiceError } from "../service-helpers.js";

function makePrisma({ orders = [] } = {}) {
  const appointments = new Map();
  const events = [];
  const configs = new Map();
  const prisma = {
    events,
    auditLog: { create: async () => ({}) },
    posOutlet: { findFirst: async ({ where }) => (where.id === "outlet-1" && where.companyId === "c1" ? { id: "outlet-1" } : null) },
    contact: { findFirst: async () => null },
    catalogProduct: {
      findFirst: async ({ where }) => (where.id === "p-corte" && where.companyId === "c1" ? { id: "p-corte", name: "Corte de cabello", price: "150.0000" } : null),
    },
    catalogProductVariant: { findFirst: async () => null },
    posOrder: {
      findFirst: async ({ where }) => orders.find((o) => o.id === where.id && o.companyId === where.companyId) ?? null,
      count: async () => 2,
    },
    posAppointment: {
      findFirst: async ({ where }) => { const row = appointments.get(where.id); return row?.companyId === where.companyId ? row : null; },
      create: async ({ data }) => { const row = { id: `a${appointments.size + 1}`, status: "SCHEDULED", ...data }; appointments.set(row.id, row); return row; },
      update: async ({ where, data }) => { const row = { ...appointments.get(where.id), ...data }; appointments.set(where.id, row); return row; },
    },
    posSession: {
      findFirst: async () => ({ id: "s1", currency: "MXN", openedAt: new Date("2026-11-04T15:00:00Z"), closedAt: new Date("2026-11-04T23:00:00Z"),
        expectedCashAmount: "500.00", countedCashAmount: "500.00", differenceAmount: "0.00", outlet: { name: "Centro" }, terminal: { name: "Caja 1" } }),
    },
    posPayment: { findMany: async () => [{ amount: "100.00" }, { amount: "37.50" }] },
    instanceConfig: {
      findUnique: async ({ where }) => configs.get(where.key) ?? null,
      upsert: async ({ where, create }) => { configs.set(where.key, create); return create; },
    },
    calendarCalendar: { create: async ({ data }) => ({ id: `cal-${data.name}` }), findFirst: async () => ({ id: "x" }) },
    calendarEvent: {
      findFirst: async ({ where }) => events.find((e) => e.sourceEntityId === where.sourceEntityId) ?? null,
      create: async ({ data }) => { events.push({ id: `e${events.length + 1}`, ...data }); return data; },
      update: async ({ where, data }) => Object.assign(events.find((e) => e.id === where.id), data),
      deleteMany: async ({ where }) => { const i = events.findIndex((e) => e.sourceEntityId === where.sourceEntityId); if (i >= 0) events.splice(i, 1); },
    },
    membership: { findMany: async () => [] },
    calendarShare: { findFirst: async () => null, create: async () => ({}) },
  };
  return prisma;
}

const scope = { companyId: "c1", actorId: "u1" };

describe("POS appointments and calendar", () => {
  it("snapshots services from the catalog and completes only with a paid order", async () => {
    const prisma = makePrisma({ orders: [{ id: "o-open", companyId: "c1", status: "OPEN" }, { id: "o-paid", companyId: "c1", status: "PAID" }] });
    const svc = createPosAppointmentService({ prisma });
    const appt = await svc.create({ ...scope, data: { outletId: "outlet-1", customerName: " Ana ", startsAt: "2026-11-05T17:00:00Z", items: [{ productId: "p-corte" }] } });

    assert.deepEqual(appt.items, [{ productId: "p-corte", variantId: null, name: "Corte de cabello", price: "150.00" }]);
    assert.equal(appt.customerName, "Ana");
    await assert.rejects(() => svc.setStatus({ ...scope, id: appt.id, status: "COMPLETED", orderId: "o-open" }), (e) => e instanceof PosServiceError && e.status === 409);
    const done = await svc.setStatus({ ...scope, id: appt.id, status: "COMPLETED", orderId: "o-paid" });
    assert.equal(done.orderId, "o-paid");
    await assert.rejects(() => svc.setStatus({ ...scope, id: appt.id, status: "CANCELLED" }), (e) => e.status === 409);
    await assert.rejects(() => svc.create({ ...scope, data: { outletId: "outlet-1", customerName: "B", startsAt: "2026-11-05T17:00:00Z", items: [{ productId: "other" }] } }), (e) => e.status === 400);
  });

  it("mirrors cortes with the charged total and removes cancelled appointments", async () => {
    const prisma = makePrisma();
    const bridge = createPosCalendarBridge({ prisma, log: () => {} });

    await bridge.syncCorte({ ...scope, sessionId: "s1" });
    assert.match(prisma.events[0].title, /^Corte Caja 1: \$137\.50$/);
    assert.equal(prisma.events[0].calendarId, "cal-Punto de venta - Cortes");

    const appointment = { id: "a9", customerName: "Ana", startsAt: new Date("2026-11-05T17:00:00Z"), durationMinutes: 30, items: [{ name: "Corte" }], status: "SCHEDULED" };
    await bridge.syncAppointment({ ...scope, appointment });
    assert.equal(prisma.events.find((e) => e.sourceEntityId === "a9").endAt.toISOString(), "2026-11-05T17:30:00.000Z");
    await bridge.syncAppointment({ ...scope, appointment: { ...appointment, status: "CANCELLED" } });
    assert.equal(prisma.events.some((e) => e.sourceEntityId === "a9"), false);
  });

  it("is a no-op without the calendar module", async () => {
    const bridge = createPosCalendarBridge({ prisma: { posSession: { findFirst: async () => null } }, log: () => {} });
    assert.equal(await bridge.syncAppointment({ ...scope, appointment: { id: "a1", status: "SCHEDULED", startsAt: new Date() } }), null);
  });
});
