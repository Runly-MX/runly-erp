import { Hono } from "hono";
import { z } from "zod";
import { getActorId, getCompanyId, PosServiceError } from "./service-helpers.js";

const createSchema = z.object({ terminalId: z.string().uuid(), name: z.string().trim().max(80).optional() }).strict();
const approveSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, "El código tiene 6 dígitos.") }).strict();
const pinSchema = z.object({ pin: z.string().regex(/^\d{4,6}$/, "El PIN debe tener de 4 a 6 dígitos.") }).strict();

function fail(c, err, fallback) {
  if (err instanceof PosServiceError) return c.json({ error: err.message, code: err.code }, err.status);
  if (err?.name === "ZodError") return c.json({ error: err.issues?.[0]?.message ?? "Datos invalidos." }, 400);
  console.error("[runly.pos] devices", err);
  return c.json({ error: fallback }, 500);
}

const body = async (c, schema) => schema.parse(await c.req.json().catch(() => ({})));

// Administración > Cajas y pagos: links per register and cashier PINs.
export function createPosDeviceRoutes({ deviceService: svc, requirePermission }) {
  const app = new Hono();
  const admin = requirePermission("pos.admin.update");
  const ctx = (c) => ({ companyId: getCompanyId(c), actorId: getActorId(c) });
  const run = (fallback, handler) => async (c) => { try { return await handler(c); } catch (err) { return fail(c, err, fallback); } };

  app.get("/pos/device-links", admin, run("No se pudieron cargar los enlaces.", async (c) => c.json({ data: await svc.list(ctx(c)) })));
  app.post("/pos/device-links", admin, run("No se pudo crear el enlace.", async (c) => c.json({ data: await svc.create({ ...ctx(c), data: await body(c, createSchema) }) }, 201)));
  app.post("/pos/device-links/:id/approve", admin, run("No se pudo aprobar el dispositivo.", async (c) => c.json({ data: await svc.approve({ ...ctx(c), id: c.req.param("id"), ...(await body(c, approveSchema)) }) })));
  app.post("/pos/device-links/:id/reset", admin, run("No se pudo restablecer el enlace.", async (c) => c.json({ data: await svc.reset({ ...ctx(c), id: c.req.param("id") }) })));
  app.delete("/pos/device-links/:id", admin, run("No se pudo desactivar el enlace.", async (c) => c.json({ data: await svc.revoke({ ...ctx(c), id: c.req.param("id") }) })));
  app.get("/pos/operator-pins", admin, run("No se pudieron cargar los PIN.", async (c) => c.json({ data: await svc.listPins(ctx(c)) })));
  app.put("/pos/operator-pins/:userId", admin, run("No se pudo guardar el PIN.", async (c) => c.json({ data: await svc.setPin({ ...ctx(c), userId: c.req.param("userId"), ...(await body(c, pinSchema)) }) })));
  app.delete("/pos/operator-pins/:userId", admin, run("No se pudo quitar el PIN.", async (c) => c.json({ data: await svc.removePin({ ...ctx(c), userId: c.req.param("userId") }) })));
  return app;
}

// /public/pos/devices/* — the link token is the secret; no user session.
export function createPosDevicePublicRouter({ deviceService: svc }) {
  const app = new Hono();
  const run = (fallback, handler) => async (c) => { try { return await handler(c); } catch (err) { return fail(c, err, fallback); } };
  app.get("/public/pos/devices/:link", run("No se pudo abrir la caja.", async (c) => c.json({ data: await svc.info(c.req.param("link")) })));
  app.post("/public/pos/devices/:link/pair", run("No se pudo emparejar.", async (c) => {
    const { label } = await c.req.json().catch(() => ({}));
    return c.json({ data: await svc.pair(c.req.param("link"), label) });
  }));
  app.get("/public/pos/devices/:link/pair", run("No se pudo consultar el emparejamiento.", async (c) => c.json({ data: await svc.pairStatus(c.req.param("link"), c.req.query("secret")) })));
  app.post("/public/pos/devices/:link/operator", run("No se pudo entrar.", async (c) => {
    const { pin } = await c.req.json().catch(() => ({}));
    return c.json({ data: await svc.operatorLogin(c.req.param("link"), c.req.header("X-Pos-Device-Token"), pin) });
  }));
  return app;
}
