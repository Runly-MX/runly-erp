import { Hono } from "hono";
import { z } from "zod";
import {
  createDriverSchema,
  updateDriverSchema,
  createDocumentAssociationSchema,
} from "./validators.js";
import { createDriverService } from "./driver-service.js";
import { FleetServiceError } from "./fleet-service.js";
import { isTableNotFoundError } from "./service-helpers.js";
import { buildDriversExcelBuffer } from "./fleet-export-service.js";
import { resolveCompanyName } from "../../services/pdf-branding-service.js";

const driverEnabledSchema = z.object({ enabled: z.boolean() });

function getValidationErrorMessage(error) {
  const issue = error?.issues?.[0];
  if (!issue) return "Datos invalidos.";
  const path =
    Array.isArray(issue.path) && issue.path.length > 0
      ? issue.path.join(".")
      : null;
  return path
    ? `Datos invalidos en ${path}: ${issue.message}`
    : `Datos invalidos: ${issue.message}`;
}

// Reads the tenant middleware's already-validated active company instead of
// re-deriving it from memberships[0]. See
// docs/superpowers/specs/2026-09-10-multi-tenant-architecture-design.md §5.
function getCompanyIdFromContext(c) {
  const companyId = c.get("companyId");
  return typeof companyId === "string" && companyId.trim()
    ? companyId.trim()
    : null;
}

function getActorIdFromContext(c) {
  const actorId = c.get("userContext")?.profile?.id;
  return typeof actorId === "string" && actorId.trim() ? actorId.trim() : null;
}

function normalizeLimit(value, fallback = 30, max = 100) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function handleRouteError(
  c,
  err,
  { fallbackError, route, moduleKey, operation },
) {
  if (err instanceof FleetServiceError)
    return c.json({ error: err.message }, err.status);
  if (process.env.NODE_ENV !== "production") {
    console.error("[runly.fleet] route error", {
      route,
      moduleKey,
      operation,
      error: { name: err?.name, message: err?.message, stack: err?.stack },
    });
  }
  return c.json({ error: fallbackError }, 500);
}

export function createDriversRouter({
  prisma,
  requirePermission,
  moduleContext,
  enrichFilesWithSignedUrls = null,
}) {
  const app = new Hono();
  const service = createDriverService({ prisma });
  const moduleKey = moduleContext?.moduleKey ?? "runly.fleet";

  app.get(
    "/fleet/drivers/export",
    requirePermission("fleet.drivers.read"),
    async (c) => {
      try {
        const companyId = getCompanyIdFromContext(c);
        const [result, companyName] = await Promise.all([
          service.listDrivers({ companyId, page: 1, pageSize: 5000 }),
          resolveCompanyName({ prisma, companyId }),
        ]);
        const buffer = await buildDriversExcelBuffer({
          rows: result.data,
          companyName,
        });
        c.header(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        c.header("Content-Disposition", 'attachment; filename="choferes.xlsx"');
        return new Response(buffer, { status: 200, headers: c.res.headers });
      } catch (err) {
        return handleRouteError(c, err, {
          fallbackError: "No se pudo exportar los choferes.",
          route: "/fleet/drivers/export",
          moduleKey,
          operation: "exportDrivers",
        });
      }
    },
  );

  app.get(
    "/fleet/drivers",
    requirePermission("fleet.drivers.read"),
    async (c) => {
      try {
        const companyId = getCompanyIdFromContext(c);
        const result = await service.listDrivers({
          companyId,
          page: c.req.query("page"),
          pageSize: c.req.query("pageSize"),
          search: c.req.query("search"),
          status: c.req.query("status"),
          sortBy: c.req.query("sortBy"),
          sortDir: c.req.query("sortDir"),
        });
        return c.json(result);
      } catch (err) {
        return handleRouteError(c, err, {
          fallbackError: "No se pudieron listar los choferes.",
          route: "/fleet/drivers",
          moduleKey,
          operation: "listDrivers",
        });
      }
    },
  );

  app.get(
    "/fleet/drivers/hr-employee-options",
    requirePermission("fleet.drivers.read"),
    async (c) => {
      try {
        const companyId = getCompanyIdFromContext(c);
        if (!companyId) return c.json({ data: [] });
        const search = String(c.req.query("search") ?? "").trim();
        const limit = normalizeLimit(c.req.query("pageSize"));

        const likeSearch = search ? `%${search}%` : null;
        const rows = await prisma.$queryRawUnsafe(
          `SELECT id, first_name, last_name, employee_code, work_email, user_profile_id
         FROM hr_employee
         WHERE company_id = $1
           AND enabled = true
           AND ($2::text IS NULL OR atlas_unaccent(first_name) ILIKE atlas_unaccent($2) OR atlas_unaccent(last_name) ILIKE atlas_unaccent($2) OR atlas_unaccent(employee_code) ILIKE atlas_unaccent($2) OR atlas_unaccent(work_email) ILIKE atlas_unaccent($2))
         ORDER BY last_name ASC, first_name ASC
         LIMIT $3`,
          companyId,
          likeSearch,
          limit,
        );

        return c.json({
          data: rows.map((row) => ({
            id: row.id,
            full_name: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim(),
            employee_code: row.employee_code ?? null,
            work_email: row.work_email ?? null,
            user_profile_id: row.user_profile_id ?? null,
          })),
        });
      } catch (err) {
        // HR module not installed — return empty list instead of error
        if (isTableNotFoundError(err)) return c.json({ data: [] });
        return handleRouteError(c, err, {
          fallbackError: "No se pudieron cargar los colaboradores de RH.",
          route: "/fleet/drivers/hr-employee-options",
          moduleKey,
          operation: "listHrEmployeeOptions",
        });
      }
    },
  );

  app.post(
    "/fleet/drivers",
    requirePermission("fleet.drivers.create"),
    async (c) => {
      try {
        const companyId = getCompanyIdFromContext(c);
        const actorId = getActorIdFromContext(c);
        const body = await c.req.json();
        const parsed = createDriverSchema.safeParse(body);
        if (!parsed.success)
          return c.json(
            { error: getValidationErrorMessage(parsed.error) },
            400,
          );
        const created = await service.createDriver({
          companyId,
          actorId,
          payload: parsed.data,
        });
        return c.json({ data: created }, 201);
      } catch (err) {
        return handleRouteError(c, err, {
          fallbackError: "No se pudo crear el chofer.",
          route: "/fleet/drivers",
          moduleKey,
          operation: "createDriver",
        });
      }
    },
  );

  app.get(
    "/fleet/drivers/:id",
    requirePermission("fleet.drivers.read"),
    async (c) => {
      try {
        const companyId = getCompanyIdFromContext(c);
        const row = await service.getDriver({
          companyId,
          id: c.req.param("id"),
        });
        return c.json({ data: row });
      } catch (err) {
        return handleRouteError(c, err, {
          fallbackError: "No se pudo obtener el chofer.",
          route: "/fleet/drivers/:id",
          moduleKey,
          operation: "getDriver",
        });
      }
    },
  );

  app.get(
    "/fleet/drivers/:id/vehicles",
    requirePermission("fleet.drivers.read"),
    async (c) => {
      try {
        const companyId = getCompanyIdFromContext(c);
        const result = await service.listDriverVehicles({
          companyId,
          driverId: c.req.param("id"),
        });
        return c.json(result);
      } catch (err) {
        return handleRouteError(c, err, {
          fallbackError: "No se pudieron listar los vehiculos del chofer.",
          route: "/fleet/drivers/:id/vehicles",
          moduleKey,
          operation: "listDriverVehicles",
        });
      }
    },
  );

  app.patch(
    "/fleet/drivers/:id",
    requirePermission("fleet.drivers.update"),
    async (c) => {
      try {
        const companyId = getCompanyIdFromContext(c);
        const actorId = getActorIdFromContext(c);
        const body = await c.req.json();
        const parsed = updateDriverSchema.safeParse(body);
        if (!parsed.success)
          return c.json(
            { error: getValidationErrorMessage(parsed.error) },
            400,
          );
        const updated = await service.updateDriver({
          companyId,
          actorId,
          id: c.req.param("id"),
          payload: parsed.data,
        });
        return c.json({ data: updated });
      } catch (err) {
        return handleRouteError(c, err, {
          fallbackError: "No se pudo actualizar el chofer.",
          route: "/fleet/drivers/:id",
          moduleKey,
          operation: "updateDriver",
        });
      }
    },
  );

  app.patch(
    "/fleet/drivers/:id/enabled",
    requirePermission("fleet.drivers.delete"),
    async (c) => {
      try {
        const companyId = getCompanyIdFromContext(c);
        const actorId = getActorIdFromContext(c);
        const body = await c.req.json();
        const parsed = driverEnabledSchema.safeParse(body);
        if (!parsed.success)
          return c.json(
            { error: getValidationErrorMessage(parsed.error) },
            400,
          );
        const updated = await service.setDriverEnabled({
          companyId,
          actorId,
          id: c.req.param("id"),
          enabled: parsed.data.enabled,
        });
        return c.json({ data: updated });
      } catch (err) {
        return handleRouteError(c, err, {
          fallbackError: "No se pudo actualizar el estado del chofer.",
          route: "/fleet/drivers/:id/enabled",
          moduleKey,
          operation: "setDriverEnabled",
        });
      }
    },
  );

  app.get(
    "/fleet/drivers/:id/documents",
    requirePermission("fleet.drivers.read"),
    async (c) => {
      try {
        const companyId = getCompanyIdFromContext(c);
        const result = await service.listDriverDocuments({
          companyId,
          driverId: c.req.param("id"),
        });
        if (enrichFilesWithSignedUrls && Array.isArray(result?.data)) {
          result.data = await enrichFilesWithSignedUrls(result.data);
        }
        return c.json(result);
      } catch (err) {
        return handleRouteError(c, err, {
          fallbackError: "No se pudieron listar los documentos del chofer.",
          route: "/fleet/drivers/:id/documents",
          moduleKey,
          operation: "listDriverDocuments",
        });
      }
    },
  );

  app.post(
    "/fleet/drivers/:id/documents",
    requirePermission("fleet.drivers.update"),
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
        const doc = await service.addDriverDocument({
          companyId,
          actorId,
          driverId: c.req.param("id"),
          payload: parsed.data,
        });
        return c.json({ data: doc }, 201);
      } catch (err) {
        return handleRouteError(c, err, {
          fallbackError: "No se pudo agregar el documento al chofer.",
          route: "/fleet/drivers/:id/documents",
          moduleKey,
          operation: "addDriverDocument",
        });
      }
    },
  );

  app.delete(
    "/fleet/drivers/:id/documents/:docId",
    requirePermission("fleet.drivers.update"),
    async (c) => {
      try {
        const companyId = getCompanyIdFromContext(c);
        const actorId = getActorIdFromContext(c);
        const result = await service.removeDriverDocument({
          companyId,
          actorId,
          driverId: c.req.param("id"),
          docId: c.req.param("docId"),
        });
        return c.json({ data: result });
      } catch (err) {
        return handleRouteError(c, err, {
          fallbackError: "No se pudo eliminar el documento del chofer.",
          route: "/fleet/drivers/:id/documents/:docId",
          moduleKey,
          operation: "removeDriverDocument",
        });
      }
    },
  );

  return app;
}
