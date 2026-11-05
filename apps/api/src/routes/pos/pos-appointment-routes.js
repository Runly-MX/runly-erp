import { Hono } from "hono";
import { createPosAppointmentService } from "./pos-appointment-service.js";
import { createPosCalendarBridge } from "./pos-calendar-bridge.js";
import { getActorId, getCompanyId, PosServiceError } from "./service-helpers.js";
import { appointmentStatusSchema, createAppointmentSchema, listAppointmentsSchema, updateAppointmentSchema } from "./validators.js";

const READ = ["pos.caja.read", "pos.comandas.read", "pos.admin.read"];
const WRITE = ["pos.caja.operate", "pos.orders.create", "pos.admin.update"];

function fail(c, err, fallback) {
  if (err instanceof PosServiceError) return c.json({ error: err.message }, err.status);
  if (err?.name === "ZodError") return c.json({ error: err.issues?.[0]?.message ?? "Datos invalidos." }, 400);
  console.error("[runly.pos] appointments", err);
  return c.json({ error: fallback }, 500);
}

export function createPosAppointmentRoutes({ prisma, requireAnyPermission }) {
  const app = new Hono();
  const svc = createPosAppointmentService({ prisma });
  const calendar = createPosCalendarBridge({ prisma });
  const ctx = (c) => ({ companyId: getCompanyId(c), actorId: getActorId(c) });
  // Calendar mirroring never fails the request.
  const mirror = (c, appointment) => { calendar.syncAppointment({ ...ctx(c), appointment }).catch(() => {}); return appointment; };
  const body = async (c, schema) => schema.parse(await c.req.json().catch(() => ({})));

  app.get("/pos/appointments", requireAnyPermission(READ), async (c) => {
    try {
      return c.json({ data: await svc.list({ ...ctx(c), ...listAppointmentsSchema.parse(c.req.query()) }) });
    } catch (err) { return fail(c, err, "No se pudieron cargar las citas."); }
  });
  app.get("/pos/appointments/:id", requireAnyPermission(READ), async (c) => {
    try { return c.json({ data: await svc.get({ ...ctx(c), id: c.req.param("id") }) }); }
    catch (err) { return fail(c, err, "No se pudo cargar la cita."); }
  });
  app.post("/pos/appointments", requireAnyPermission(WRITE), async (c) => {
    try { return c.json({ data: mirror(c, await svc.create({ ...ctx(c), data: await body(c, createAppointmentSchema) })) }, 201); }
    catch (err) { return fail(c, err, "No se pudo crear la cita."); }
  });
  app.patch("/pos/appointments/:id", requireAnyPermission(WRITE), async (c) => {
    try { return c.json({ data: mirror(c, await svc.update({ ...ctx(c), id: c.req.param("id"), data: await body(c, updateAppointmentSchema) })) }); }
    catch (err) { return fail(c, err, "No se pudo actualizar la cita."); }
  });
  app.post("/pos/appointments/:id/status", requireAnyPermission(WRITE), async (c) => {
    try {
      const data = await body(c, appointmentStatusSchema);
      return c.json({ data: mirror(c, await svc.setStatus({ ...ctx(c), id: c.req.param("id"), ...data })) });
    } catch (err) { return fail(c, err, "No se pudo cambiar la cita."); }
  });
  return app;
}
