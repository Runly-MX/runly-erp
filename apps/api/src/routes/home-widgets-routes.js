// Home widgets contributed by Builder (RME3) modules through their manifest
// `homeWidgets`: a count or a short list of one of the module's tables. The widget
// only exists for people who can open the module and hold the widget permission; the
// query reads the module's own table in the active company (soft-deleted rows out).
// Table and column names come from the module registry / manifest and are checked as
// plain identifiers and against the real table; values are always bound.
import { Hono } from "hono";

const IDENT = /^[a-z][a-z0-9_]*$/;
const OPS = { equals: "=", not_equals: "<>", gt: ">", lt: "<" };

export function createHomeWidgetsRouter({ prisma, requireActiveCompany }) {
  const app = new Hono();

  async function visibleWidgets(c) {
    const user = c.get("userContext");
    const companyId = c.get("companyId");
    const can = (permission) => Boolean(user?.isAdmin || user?.permissionSet?.has?.(permission));
    const modules = await prisma.runlyModule.findMany({ where: { status: "INSTALLED", enabled: true }, select: { id: true, key: true, name: true, manifest: true } });
    const withWidgets = modules.filter((mod) => Array.isArray(mod.manifest?.homeWidgets) && mod.manifest.homeWidgets.length);
    if (!withWidgets.length) return [];
    const off = new Set((await prisma.companyModule.findMany({ where: { companyId, enabled: false }, select: { moduleId: true } })).map((row) => row.moduleId));
    return withWidgets.filter((mod) => !off.has(mod.id)).flatMap((mod) => mod.manifest.homeWidgets
      .filter((widget) => can(widget.permission))
      .map((widget) => ({ moduleKey: mod.key, moduleName: mod.name, widget })));
  }

  app.get("/home-widgets", requireActiveCompany, async (c) => {
    const list = await visibleWidgets(c);
    return c.json({ data: list.map(({ moduleKey, moduleName, widget }) => ({ moduleKey, moduleName, key: widget.key, label: widget.label, kind: widget.kind })) });
  });

  app.get("/home-widgets/:moduleKey/:widgetKey", requireActiveCompany, async (c) => {
    const found = (await visibleWidgets(c)).find((item) => item.moduleKey === c.req.param("moduleKey") && item.widget.key === c.req.param("widgetKey"));
    if (!found) return c.json({ error: "Widget no disponible." }, 404);
    const { widget, moduleKey } = found;
    const companyId = c.get("companyId");
    const model = await prisma.runlyModel.findFirst({
      where: { moduleKey, enabled: true, OR: [{ name: widget.model }, { name: { endsWith: `.${widget.model}` } }] },
      select: { tableName: true },
    });
    if (!model || !IDENT.test(model.tableName)) return c.json({ error: "El módulo no tiene la tabla de este widget." }, 404);
    const columns = new Set((await prisma.$queryRawUnsafe("SELECT column_name FROM information_schema.columns WHERE table_name = $1", model.tableName)).map((row) => row.column_name));
    const column = (name) => (typeof name === "string" && IDENT.test(name) && columns.has(name) ? `"${name}"` : null);

    const params = [companyId];
    const where = ['"company_id" = $1::uuid'];
    if (columns.has("enabled")) where.push('"enabled" = true');
    for (const condition of widget.where ?? []) {
      const name = column(condition.field);
      if (!name) return c.json({ error: "El widget usa un campo que ya no existe." }, 409);
      if (condition.op === "filled") where.push(`(${name} IS NOT NULL AND ${name}::text <> '')`);
      else if (condition.op === "contains") { params.push(`%${String(condition.value).replace(/[\\%_]/g, "\\$&")}%`); where.push(`${name}::text ILIKE $${params.length}`); }
      else if (OPS[condition.op]) {
        params.push(typeof condition.value === "boolean" ? String(condition.value) : condition.value);
        // Both sides as text keep one comparison for every column type; gt/lt need numbers.
        where.push(["gt", "lt"].includes(condition.op) ? `${name}::numeric ${OPS[condition.op]} $${params.length}::numeric` : `${name}::text ${OPS[condition.op]} $${params.length}::text`);
      }
    }
    const clause = where.join(" AND ");
    const [{ total }] = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS total FROM "${model.tableName}" WHERE ${clause}`, ...params);
    if (widget.kind === "count") return c.json({ data: { kind: "count", total } });

    const title = column(widget.titleField);
    const detail = widget.detailField ? column(widget.detailField) : null;
    const sort = column(widget.sortField) ?? '"created_at"';
    if (!title) return c.json({ error: "El widget usa un campo que ya no existe." }, 409);
    const limit = Math.min(10, Math.max(1, Number(widget.limit) || 5));
    const rows = await prisma.$queryRawUnsafe(
      `SELECT "id", ${title}::text AS title${detail ? `, ${detail}::text AS detail` : ""} FROM "${model.tableName}" WHERE ${clause} ORDER BY ${sort} ${widget.sortDir === "asc" ? "ASC" : "DESC"} NULLS LAST, "id" DESC LIMIT ${limit}`,
      ...params,
    );
    return c.json({ data: { kind: "list", total, items: rows.map((row) => ({ id: row.id, title: row.title ?? "", detail: row.detail ?? null })) } });
  });

  return app;
}
