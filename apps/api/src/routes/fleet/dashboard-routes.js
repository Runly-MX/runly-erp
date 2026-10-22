import { Hono } from "hono";
import { createFleetDashboardService } from "./fleet-dashboard-service.js";

export function createFleetDashboardRouter({ prisma, requirePermission }) {
  const app = new Hono();
  const service = createFleetDashboardService({ prisma });

  app.get("/fleet/dashboard", requirePermission("fleet.vehicles.read"), async (c) => {
    const companyId = c.get("companyId");
    if (typeof companyId !== "string" || !companyId.trim()) {
      return c.json({ error: "Empresa activa requerida." }, 400);
    }
    try {
      const months = Number(c.req.query("months") ?? 12);
      return c.json({ data: await service.getDashboard({ companyId: companyId.trim(), months }) });
    } catch (err) {
      if (process.env.NODE_ENV !== "production") console.error("[runly.fleet] dashboard error", err);
      return c.json({ error: "No se pudo cargar el dashboard de flota." }, 500);
    }
  });

  return app;
}
