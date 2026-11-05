import { Hono } from "hono";
import { createPosV2Router } from './pos-v2-routes.js';
import { createPosSettingsService } from "./pos-settings-service.js";
import { createPosSessionService } from "./pos-session-service.js";
import { createPosKitchenService } from "./pos-kitchen-service.js";
import { createPosWaiterShiftService } from "./pos-waiter-shift-service.js";
import { createPosFloorRoutes } from "./pos-floor-routes.js";
import { createPosAppointmentRoutes } from "./pos-appointment-routes.js";
import { createPosDeviceRoutes } from "./pos-device-routes.js";
import { createPosModifierService } from "./pos-modifier-service.js";
import { getActorId, getCompanyId, PosServiceError } from "./service-helpers.js";
import {
  createModifierGroupSchema,
  createModifierOptionSchema,
  createOutletSchema,
  createPaymentMethodSchema,
  createTerminalSchema,
  updateModifierGroupSchema,
  updateModifierOptionSchema,
  updateOutletSchema,
  updatePaymentMethodSchema,
  updateProductConfigSchema,
  setupSchema,
  updateSettingsSchema,
  updateTerminalSchema,
} from "./validators.js";

function zodMessage(error) {
  return error?.issues?.[0]?.message ?? error?.errors?.[0]?.message ?? "Datos invalidos.";
}

async function parseBody(c, schema) {
  const body = await c.req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new PosServiceError(zodMessage(parsed.error), 400);
  return parsed.data;
}

function context(c) {
  return {
    companyId: getCompanyId(c),
    actorId: getActorId(c),
  };
}

function handleError(c, err, fallback) {
  if (err instanceof PosServiceError) return c.json({ error: err.message }, err.status);
  if (err?.name === "ZodError") return c.json({ error: zodMessage(err) }, 400);
  if (process.env.NODE_ENV !== "production") console.error("[runly.pos]", err);
  return c.json({ error: fallback }, 500);
}

export function createPosRouter({ prisma, requirePermission, requireAnyPermission, broadcaster = null, deviceService = null }) {
  const app = new Hono();
  app.route('', createPosV2Router({ prisma, requirePermission, requireAnyPermission, broadcaster }));
  const settingsSvc = createPosSettingsService({ prisma });
  const sessionSvc = createPosSessionService({ prisma });
  const waiterShiftSvc = createPosWaiterShiftService({ prisma });
  const modifierSvc = createPosModifierService({ prisma });
  const kitchenSvc = createPosKitchenService({ prisma });
  const sessionReader = requireAnyPermission ? requireAnyPermission(['pos.sessions.read','pos.caja.read']) : requirePermission('pos.sessions.read');

  app.route("", createPosFloorRoutes({ prisma, requirePermission }));
  if (requireAnyPermission) app.route("", createPosAppointmentRoutes({ prisma, requireAnyPermission }));
  if (deviceService) app.route("", createPosDeviceRoutes({ deviceService, requirePermission }));

  app.patch("/pos/settings", requirePermission("pos.settings.manage"), async (c) => {
    try {
      const data = await parseBody(c, updateSettingsSchema);
      return c.json({ data: await settingsSvc.updateSettings({ ...context(c), data }) });
    } catch (err) {
      return handleError(c, err, "No se pudo actualizar la configuracion POS.");
    }
  });

  app.post("/pos/setup", requirePermission("pos.settings.manage"), async (c) => {
    try {
      const data = await parseBody(c, setupSchema);
      return c.json({ data: await settingsSvc.setup({ ...context(c), data }) }, 201);
    } catch (err) {
      return handleError(c, err, "No se pudo configurar el punto de venta.");
    }
  });

  app.post("/pos/outlets", requirePermission("pos.settings.manage"), async (c) => {
    try {
      const data = await parseBody(c, createOutletSchema);
      return c.json({ data: await settingsSvc.createOutlet({ ...context(c), data }) }, 201);
    } catch (err) {
      return handleError(c, err, "No se pudo crear la sucursal POS.");
    }
  });

  app.patch("/pos/outlets/:id", requirePermission("pos.settings.manage"), async (c) => {
    try {
      const data = await parseBody(c, updateOutletSchema);
      return c.json({
        data: await settingsSvc.updateOutlet({ ...context(c), id: c.req.param("id"), data }),
      });
    } catch (err) {
      return handleError(c, err, "No se pudo actualizar la sucursal POS.");
    }
  });

  app.post("/pos/terminals", requirePermission("pos.settings.manage"), async (c) => {
    try {
      const data = await parseBody(c, createTerminalSchema);
      return c.json({ data: await settingsSvc.createTerminal({ ...context(c), data }) }, 201);
    } catch (err) {
      return handleError(c, err, "No se pudo crear la terminal POS.");
    }
  });

  app.patch("/pos/terminals/:id", requirePermission("pos.settings.manage"), async (c) => {
    try {
      const data = await parseBody(c, updateTerminalSchema);
      return c.json({
        data: await settingsSvc.updateTerminal({ ...context(c), id: c.req.param("id"), data }),
      });
    } catch (err) {
      return handleError(c, err, "No se pudo actualizar la terminal POS.");
    }
  });

  app.get("/pos/sessions", sessionReader, async (c) => {
    try {
      return c.json({
        data: await sessionSvc.listSessions({ ...context(c), status: c.req.query("status") }),
      });
    } catch (err) {
      return handleError(c, err, "No se pudieron consultar las sesiones POS.");
    }
  });

  app.get("/pos/sessions/:id", sessionReader, async (c) => {
    try {
      return c.json({ data: await sessionSvc.getSessionById({ ...context(c), id: c.req.param("id") }) });
    } catch (err) {
      return handleError(c, err, "No se pudo consultar la sesion POS.");
    }
  });

  app.get("/pos/waiter-shifts", requirePermission("pos.caja.read"), async (c) => {
    try {
      return c.json({
        data: await waiterShiftSvc.listShifts({
          ...context(c),
          outletId: c.req.query("outletId") || undefined,
          status: c.req.query("status") || undefined,
        }),
      });
    } catch (err) {
      return handleError(c, err, "No se pudieron consultar los cortes de mesero.");
    }
  });

  app.get("/pos/waiter-shifts/current", requirePermission("pos.comandas.charge"), async (c) => {
    try {
      const ctx = context(c);
      return c.json({
        data: await waiterShiftSvc.getCurrentShift({
          companyId: ctx.companyId,
          outletId: c.req.query("outletId"),
          waiterId: ctx.actorId,
        }),
      });
    } catch (err) {
      return handleError(c, err, "No se pudo consultar el corte actual.");
    }
  });

  // ── Payment Methods ────────────────────────────────────────────────────────
  app.post("/pos/payment-methods", requirePermission("pos.settings.manage"), async (c) => {
    try {
      const data = await parseBody(c, createPaymentMethodSchema);
      return c.json({ data: await settingsSvc.createPaymentMethod({ ...context(c), data }) }, 201);
    } catch (err) {
      return handleError(c, err, "No se pudo crear el método de pago.");
    }
  });

  app.patch("/pos/payment-methods/:id", requirePermission("pos.settings.manage"), async (c) => {
    try {
      const data = await parseBody(c, updatePaymentMethodSchema);
      return c.json({ data: await settingsSvc.updatePaymentMethod({ ...context(c), id: c.req.param("id"), data }) });
    } catch (err) {
      return handleError(c, err, "No se pudo actualizar el método de pago.");
    }
  });

  // ── Modifiers ──────────────────────────────────────────────────────────────
  app.get("/pos/modifier-groups", requirePermission("pos.orders.read"), async (c) => {
    try {
      const productIds = (c.req.query("productIds") ?? "").split(",").filter(Boolean);
      return c.json({ data: await modifierSvc.listByProducts({ ...context(c), productIds }) });
    } catch (err) {
      return handleError(c, err, "No se pudieron consultar los modificadores.");
    }
  });

  app.get("/pos/products/:productId/modifier-groups", requirePermission("pos.orders.read"), async (c) => {
    try {
      return c.json({
        data: await modifierSvc.listForProduct({
          ...context(c),
          productId: c.req.param("productId"),
          includeDisabled: c.req.query("includeDisabled") === "true",
        }),
      });
    } catch (err) {
      return handleError(c, err, "No se pudieron consultar los modificadores.");
    }
  });

  app.post("/pos/products/:productId/modifier-groups", requirePermission("pos.admin.update"), async (c) => {
    try {
      const data = await parseBody(c, createModifierGroupSchema);
      return c.json({
        data: await modifierSvc.createGroup({ ...context(c), productId: c.req.param("productId"), data }),
      }, 201);
    } catch (err) {
      return handleError(c, err, "No se pudo crear el grupo de modificadores.");
    }
  });

  app.patch("/pos/modifier-groups/:id", requirePermission("pos.admin.update"), async (c) => {
    try {
      const data = await parseBody(c, updateModifierGroupSchema);
      return c.json({ data: await modifierSvc.updateGroup({ ...context(c), id: c.req.param("id"), data }) });
    } catch (err) {
      return handleError(c, err, "No se pudo actualizar el grupo de modificadores.");
    }
  });

  app.post("/pos/modifier-groups/:id/options", requirePermission("pos.admin.update"), async (c) => {
    try {
      const data = await parseBody(c, createModifierOptionSchema);
      return c.json({
        data: await modifierSvc.createOption({ ...context(c), groupId: c.req.param("id"), data }),
      }, 201);
    } catch (err) {
      return handleError(c, err, "No se pudo crear la opción de modificador.");
    }
  });

  app.patch("/pos/modifier-options/:id", requirePermission("pos.admin.update"), async (c) => {
    try {
      const data = await parseBody(c, updateModifierOptionSchema);
      return c.json({ data: await modifierSvc.updateOption({ ...context(c), id: c.req.param("id"), data }) });
    } catch (err) {
      return handleError(c, err, "No se pudo actualizar la opción de modificador.");
    }
  });

  // ── Product Config ─────────────────────────────────────────────────────────
  app.get("/pos/product-configs", requirePermission("pos.admin.read"), async (c) => {
    try {
      return c.json({ data: await kitchenSvc.listProductConfigs(context(c)) });
    } catch (err) {
      return handleError(c, err, "No se pudieron consultar las configuraciones de productos.");
    }
  });

  app.put("/pos/products/:productId/config", requirePermission("pos.admin.update"), async (c) => {
    try {
      const data = await parseBody(c, updateProductConfigSchema);
      return c.json({
        data: await kitchenSvc.updateProductConfig({ ...context(c), productId: c.req.param("productId"), data }),
      });
    } catch (err) {
      return handleError(c, err, "No se pudo actualizar la configuración del producto.");
    }
  });

  return app;
}
