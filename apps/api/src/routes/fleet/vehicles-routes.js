import { Hono } from "hono";
import { z } from "zod";
import {
  createVehicleSchema,
  updateVehicleSchema,
  createDocumentAssociationSchema,
} from "./validators.js";
import { createFleetService, FleetServiceError } from "./fleet-service.js";
import { createDriversRouter } from "./drivers-routes.js";
import { createCatalogsRouter } from "./catalogs-routes.js";
import { createReportsRouter } from "./reports-routes.js";
import { createInsuranceRouter } from "./insurance-routes.js";
import { createFleetDashboardRouter } from "./dashboard-routes.js";
import { buildVehiclesExcelBuffer } from "./fleet-export-service.js";
import { resolveCompanyName } from "../../services/pdf-branding-service.js";

const vehicleEnabledSchema = z.object({ enabled: z.boolean() });
const vehicleStatusFilterSchema = z.enum([
  "active",
  "maintenance",
  "inactive",
  "retired",
]);

function getValidationErrorMessage(error) {
  const issue = error?.issues?.[0];
  if (!issue) return "Datos invalidos.";
  const path =
    Array.isArray(issue.path) && issue.path.length > 0
      ? issue.path.join(".")
      : null;
  if (!path) return `Datos invalidos: ${issue.message}`;
  return `Datos invalidos en ${path}: ${issue.message}`;
}

// Reads the tenant middleware's already-validated active company instead of
// re-deriving it from memberships[0]. See
// docs/superpowers/specs/2026-09-10-multi-tenant-architecture-design.md §5.
function getCompanyIdFromContext(c) {
  const companyId = c.get("companyId");
  if (typeof companyId === "string" && companyId.trim())
    return companyId.trim();
  return null;
}

function getActorIdFromContext(c) {
  const actorId = c.get("userContext")?.profile?.id;
  if (typeof actorId === "string" && actorId.trim()) return actorId.trim();
  return null;
}

function logRouteError({ route, moduleKey, operation, err }) {
  if (process.env.NODE_ENV === "production") return;
  console.error("[runly.fleet] route error", {
    route,
    moduleKey,
    operation,
    error: {
      name: err?.name ?? null,
      message: err?.message ?? null,
      code: err?.code ?? err?.meta?.code ?? null,
      stack: err?.stack ?? null,
    },
  });
}

function handleRouteError(
  c,
  err,
  { fallbackError, route, moduleKey, operation },
) {
  if (err instanceof FleetServiceError)
    return c.json({ error: err.message }, err.status);
  logRouteError({ route, moduleKey, operation, err });
  return c.json({ error: fallbackError }, 500);
}

export default function createFleetRouter({
  prisma,
  requirePermission,
  moduleContext,
  cache = null,
  enrichFilesWithSignedUrls = null,
  broadcaster = null,
}) {
  const app = new Hono();

  // Tells open fleet screens (company events channel) to refetch after any
  // successful write, so lists and details never need a manual reload.
  app.use("/fleet/*", async (c, next) => {
    await next();
    if (c.req.method === "GET" || c.res.status >= 400) return;
    const companyId = getCompanyIdFromContext(c);
    if (!companyId) return;
    Promise.resolve(
      broadcaster?.broadcastToCompany?.(companyId, "fleet.changed", {
        path: c.req.path,
      }),
    ).catch(() => {});
  });
  const service = createFleetService({ prisma });
  const moduleKey = moduleContext?.moduleKey ?? "runly.fleet";

  app.get(
    "/fleet/vehicles/export",
    requirePermission("fleet.vehicles.read"),
    async (c) => {
      try {
        const companyId = getCompanyIdFromContext(c);
        const [result, companyName] = await Promise.all([
          service.listVehicles({
            companyId,
            page: 1,
            pageSize: 5000,
            search: c.req.query("search"),
          }),
          resolveCompanyName({ prisma, companyId }),
        ]);
        const buffer = await buildVehiclesExcelBuffer({
          rows: result.data,
          companyName,
        });
        c.header(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        c.header(
          "Content-Disposition",
          'attachment; filename="vehiculos.xlsx"',
        );
        return new Response(buffer, { status: 200, headers: c.res.headers });
      } catch (err) {
        return handleRouteError(c, err, {
          fallbackError: "No se pudo exportar los vehiculos.",
          route: "/fleet/vehicles/export",
          moduleKey,
          operation: "exportVehicles",
        });
      }
    },
  );

  app.get(
    "/fleet/vehicles",
    requirePermission("fleet.vehicles.read"),
    async (c) => {
      try {
        const companyId = getCompanyIdFromContext(c);
        const rawStatus = c.req.query("status");
        let status = null;
        if (rawStatus !== undefined) {
          const parsedStatus = vehicleStatusFilterSchema.safeParse(rawStatus);
          if (!parsedStatus.success)
            return c.json(
              { error: getValidationErrorMessage(parsedStatus.error) },
              400,
            );
          status = parsedStatus.data;
        }
        const result = await service.listVehicles({
          companyId,
          page: c.req.query("page"),
          pageSize: c.req.query("pageSize"),
          status,
          search: c.req.query("search"),
        });
        return c.json(result);
      } catch (err) {
        return handleRouteError(c, err, {
          fallbackError: `No se pudieron listar los vehiculos de ${moduleKey}.`,
          route: "/fleet/vehicles",
          moduleKey,
          operation: "listVehicles",
        });
      }
    },
  );

  app.post(
    "/fleet/vehicles",
    requirePermission("fleet.vehicles.create"),
    async (c) => {
      try {
        const companyId = getCompanyIdFromContext(c);
        const actorId = getActorIdFromContext(c);
        const body = await c.req.json();
        const parsed = createVehicleSchema.safeParse(body);
        if (!parsed.success)
          return c.json(
            { error: getValidationErrorMessage(parsed.error) },
            400,
          );
        const created = await service.createVehicle({
          companyId,
          data: parsed.data,
          actorId,
        });
        return c.json({ data: created }, 201);
      } catch (err) {
        return handleRouteError(c, err, {
          fallbackError: `No se pudo crear el vehiculo de ${moduleKey}.`,
          route: "/fleet/vehicles",
          moduleKey,
          operation: "createVehicle",
        });
      }
    },
  );

  app.get(
    "/fleet/vehicles/:id",
    requirePermission("fleet.vehicles.read"),
    async (c) => {
      try {
        const companyId = getCompanyIdFromContext(c);
        const row = await service.getVehicle({
          companyId,
          id: c.req.param("id"),
        });
        return c.json({ data: row });
      } catch (err) {
        return handleRouteError(c, err, {
          fallbackError: `No se pudo obtener el vehiculo de ${moduleKey}.`,
          route: "/fleet/vehicles/:id",
          moduleKey,
          operation: "getVehicle",
        });
      }
    },
  );

  app.patch(
    "/fleet/vehicles/:id",
    requirePermission("fleet.vehicles.update"),
    async (c) => {
      try {
        const companyId = getCompanyIdFromContext(c);
        const actorId = getActorIdFromContext(c);
        const body = await c.req.json();
        const parsed = updateVehicleSchema.safeParse(body);
        if (!parsed.success)
          return c.json(
            { error: getValidationErrorMessage(parsed.error) },
            400,
          );
        const updated = await service.updateVehicle({
          companyId,
          id: c.req.param("id"),
          data: parsed.data,
          actorId,
        });
        return c.json({ data: updated });
      } catch (err) {
        return handleRouteError(c, err, {
          fallbackError: `No se pudo actualizar el vehiculo de ${moduleKey}.`,
          route: "/fleet/vehicles/:id",
          moduleKey,
          operation: "updateVehicle",
        });
      }
    },
  );

  app.patch(
    "/fleet/vehicles/:id/enabled",
    requirePermission("fleet.vehicles.delete"),
    async (c) => {
      try {
        const companyId = getCompanyIdFromContext(c);
        const actorId = getActorIdFromContext(c);
        const body = await c.req.json();
        const parsed = vehicleEnabledSchema.safeParse(body);
        if (!parsed.success)
          return c.json(
            { error: getValidationErrorMessage(parsed.error) },
            400,
          );
        const updated = await service.setVehicleEnabled({
          companyId,
          id: c.req.param("id"),
          enabled: parsed.data.enabled,
          actorId,
        });
        return c.json({ data: updated });
      } catch (err) {
        return handleRouteError(c, err, {
          fallbackError: `No se pudo actualizar el estado del vehiculo de ${moduleKey}.`,
          route: "/fleet/vehicles/:id/enabled",
          moduleKey,
          operation: "setVehicleEnabled",
        });
      }
    },
  );

  app.get(
    "/fleet/vehicles/:id/pdf",
    requirePermission("fleet.vehicles.read"),
    async (c) => {
      try {
        const companyId = getCompanyIdFromContext(c);
        const { vehicle, pdf } = await service.generateVehiclePdf({
          companyId,
          id: c.req.param("id"),
        });
        c.header("Content-Type", "application/pdf");
        c.header(
          "Content-Disposition",
          `inline; filename="vehiculo-${vehicle.plate}.pdf"`,
        );
        return new Response(pdf, { status: 200, headers: c.res.headers });
      } catch (err) {
        return handleRouteError(c, err, {
          fallbackError: "No se pudo generar el PDF del vehiculo.",
          route: "/fleet/vehicles/:id/pdf",
          moduleKey,
          operation: "generateVehiclePdf",
        });
      }
    },
  );

  app.get(
    "/fleet/vehicles/:id/documents",
    requirePermission("fleet.vehicles.read"),
    async (c) => {
      try {
        const companyId = getCompanyIdFromContext(c);
        const result = await service.listVehicleDocuments({
          companyId,
          vehicleId: c.req.param("id"),
        });
        if (enrichFilesWithSignedUrls && Array.isArray(result?.data)) {
          result.data = await enrichFilesWithSignedUrls(result.data);
        }
        return c.json(result);
      } catch (err) {
        return handleRouteError(c, err, {
          fallbackError: "No se pudieron listar los documentos del vehiculo.",
          route: "/fleet/vehicles/:id/documents",
          moduleKey,
          operation: "listVehicleDocuments",
        });
      }
    },
  );

  app.post(
    "/fleet/vehicles/:id/documents",
    requirePermission("fleet.vehicles.update"),
    async (c) => {
      try {
        const companyId = getCompanyIdFromContext(c);
        const actorId = getActorIdFromContext(c);
        const body = await c.req.json();
        const parsed = createDocumentAssociationSchema.safeParse(body);
        if (!parsed.success)
          return c.json(
            { error: getValidationErrorMessage(parsed.error) },
            400,
          );
        const doc = await service.addVehicleDocument({
          companyId,
          actorId,
          vehicleId: c.req.param("id"),
          payload: parsed.data,
        });
        return c.json({ data: doc }, 201);
      } catch (err) {
        return handleRouteError(c, err, {
          fallbackError: "No se pudo agregar el documento al vehiculo.",
          route: "/fleet/vehicles/:id/documents",
          moduleKey,
          operation: "addVehicleDocument",
        });
      }
    },
  );

  app.delete(
    "/fleet/vehicles/:id/documents/:docId",
    requirePermission("fleet.vehicles.update"),
    async (c) => {
      try {
        const companyId = getCompanyIdFromContext(c);
        const actorId = getActorIdFromContext(c);
        const result = await service.removeVehicleDocument({
          companyId,
          actorId,
          vehicleId: c.req.param("id"),
          docId: c.req.param("docId"),
        });
        return c.json({ data: result });
      } catch (err) {
        return handleRouteError(c, err, {
          fallbackError: "No se pudo eliminar el documento del vehiculo.",
          route: "/fleet/vehicles/:id/documents/:docId",
          moduleKey,
          operation: "removeVehicleDocument",
        });
      }
    },
  );

  app.route(
    "",
    createDriversRouter({ prisma, requirePermission, moduleContext, enrichFilesWithSignedUrls }),
  );
  app.route(
    "",
    createCatalogsRouter({ prisma, requirePermission, moduleContext, cache }),
  );
  app.route(
    "",
    createReportsRouter({ prisma, requirePermission, moduleContext, enrichFilesWithSignedUrls }),
  );
  app.route(
    "",
    createInsuranceRouter({ prisma, requirePermission, moduleContext }),
  );
  app.route("", createFleetDashboardRouter({ prisma, requirePermission }));

  return app;
}
