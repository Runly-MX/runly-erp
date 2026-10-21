import { FleetServiceError } from "./fleet-service.js";
import { buildReportPdfBuffer } from "./report-pdf.js";
import { createReportSchemaEnsurer } from "./reports-schema.js";
import {
  normalizePagination,
  normalizeSearch,
  normalizeOptionalString,
  firstRow,
  toCount,
  isTableNotFoundError,
} from "./service-helpers.js";

const MODULE_KEY = "runly.fleet";
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const REPORT_TYPES = ["maintenance", "service", "repair", "other"];
const REPORT_STATUS = ["draft", "finalized"];
const MAINTENANCE_SUBTYPES = [
  "preventive",
  "corrective",
  "inspection",
  "alignment",
  "oil_change",
  "tire_service",
  "other",
];
const SERVICE_SUBTYPES = [
  "general",
  "diagnostic",
  "cleaning",
  "electrical",
  "other",
];
const REPAIR_PRIORITIES = ["low", "normal", "high", "urgent"];
const REPAIR_DAMAGE_TYPES = [
  "mechanical",
  "electrical",
  "body",
  "interior",
  "other",
];
const TYPE_PREFIX = {
  maintenance: "MNT",
  service: "SRV",
  repair: "REP",
  other: "OTR",
};

const UPDATABLE_FIELDS = new Set([
  "title",
  "report_date",
  "odometer_km",
  "status",
  "is_inhouse_workshop",
  "finalized_at",
  "finalized_by_profile_id",
  "workshop_name",
  "workshop_phone",
  "workshop_address",
  "invoice_number",
  "labor_cost",
  "parts_cost",
  "total_cost",
  "notes",
  "maintenance_subtype",
  "next_service_date",
  "next_service_odometer",
  "service_subtype",
  "repair_priority",
  "repair_damage_type",
  "repair_start_date",
  "repair_completion_date",
  "repair_estimated_cost",
  "warranty_days",
  "warranty_notes",
  "other_category_label",
]);

function toScopedCompanyUuid(companyId) {
  const normalized = (typeof companyId === 'string' && companyId.trim()) ? companyId.trim() : null
  if (!normalized) throw new FleetServiceError('companyId es requerido.', 400)
  if (!UUID_REGEX.test(normalized)) throw new FleetServiceError('companyId debe ser UUID valido.', 400)
  return normalized.toLowerCase()
}

function normalizeRecordId(id, notFoundMessage) {
  const value = String(id ?? "").trim();
  if (!UUID_REGEX.test(value))
    throw new FleetServiceError(notFoundMessage, 404);
  return value.toLowerCase();
}

function normalizeType(value) {
  const type = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!REPORT_TYPES.includes(type)) {
    throw new FleetServiceError("Tipo de reporte invalido.", 400);
  }
  return type;
}

function normalizeStatus(value) {
  if (value === undefined) return undefined;
  const status = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!REPORT_STATUS.includes(status)) {
    throw new FleetServiceError("Estado de reporte invalido.", 400);
  }
  return status;
}

function normalizeParts(parts) {
  if (!Array.isArray(parts)) return [];
  return parts
    .map((item) => ({
      name: normalizeOptionalString(item?.name),
      quantity: Number(item?.quantity ?? 0),
      unit_cost: Number(item?.unit_cost ?? 0),
      notes: normalizeOptionalString(item?.notes),
    }))
    .filter(
      (item) =>
        item.name && Number.isFinite(item.quantity) && item.quantity > 0,
    )
    .map((item) => {
      const unitCost =
        Number.isFinite(item.unit_cost) && item.unit_cost >= 0
          ? item.unit_cost
          : 0;
      const subtotal = Number((item.quantity * unitCost).toFixed(2));
      return { ...item, unit_cost: unitCost, subtotal };
    });
}

function normalizeReportPayload(data = {}, defaultType = null) {
  const reportType = normalizeType(data.report_type ?? defaultType);
  const status = normalizeStatus(data.status);
  const parts = normalizeParts(data.parts);
  const partsCost = Number(
    parts.reduce((acc, part) => acc + part.subtotal, 0).toFixed(2),
  );
  const laborCost = Number(data.labor_cost ?? 0);

  const normalized = {
    ...data,
    report_type: reportType,
    status: status ?? undefined,
    is_inhouse_workshop:
      data.is_inhouse_workshop === undefined
        ? undefined
        : Boolean(data.is_inhouse_workshop),
    title: normalizeOptionalString(data.title),
    workshop_name: normalizeOptionalString(data.workshop_name),
    workshop_phone: normalizeOptionalString(data.workshop_phone),
    workshop_address: normalizeOptionalString(data.workshop_address),
    invoice_number: normalizeOptionalString(data.invoice_number),
    notes: normalizeOptionalString(data.notes),
    maintenance_subtype: normalizeOptionalString(data.maintenance_subtype),
    service_subtype: normalizeOptionalString(data.service_subtype),
    repair_priority: normalizeOptionalString(data.repair_priority),
    repair_damage_type: normalizeOptionalString(data.repair_damage_type),
    warranty_notes: normalizeOptionalString(data.warranty_notes),
    other_category_label: normalizeOptionalString(data.other_category_label),
    parts,
    parts_cost: partsCost,
    labor_cost: Number.isFinite(laborCost) && laborCost >= 0 ? laborCost : 0,
  };
  normalized.total_cost = Number(
    (normalized.parts_cost + normalized.labor_cost).toFixed(2),
  );

  if (normalized.is_inhouse_workshop === true) {
    normalized.workshop_name = null;
    normalized.workshop_phone = null;
    normalized.workshop_address = null;
    normalized.invoice_number = null;
  }

  return normalized;
}

function validateTypeBusinessRules(payload) {
  const reportDate = payload.report_date ? new Date(payload.report_date) : null;
  const repairStartDate = payload.repair_start_date
    ? new Date(payload.repair_start_date)
    : null;
  const repairCompletionDate = payload.repair_completion_date
    ? new Date(payload.repair_completion_date)
    : null;

  if (payload.report_type === "maintenance") {
    if (
      !payload.maintenance_subtype ||
      !MAINTENANCE_SUBTYPES.includes(payload.maintenance_subtype)
    ) {
      throw new FleetServiceError(
        "Mantenimiento requiere subtipo valido.",
        400,
      );
    }
    if (!payload.next_service_date && !payload.next_service_odometer) {
      throw new FleetServiceError(
        "Mantenimiento requiere fecha o kilometraje de proximo servicio.",
        400,
      );
    }
  }
  if (payload.report_type === "service") {
    if (
      !payload.service_subtype ||
      !SERVICE_SUBTYPES.includes(payload.service_subtype)
    ) {
      throw new FleetServiceError("Servicio requiere subtipo valido.", 400);
    }
    if (!payload.is_inhouse_workshop && !payload.invoice_number) {
      throw new FleetServiceError(
        "Servicio requiere numero de factura o ticket.",
        400,
      );
    }
  }
  if (payload.report_type === "repair") {
    if (
      !payload.repair_priority ||
      !REPAIR_PRIORITIES.includes(payload.repair_priority)
    ) {
      throw new FleetServiceError("Reparacion requiere prioridad valida.", 400);
    }
    if (
      !payload.repair_damage_type ||
      !REPAIR_DAMAGE_TYPES.includes(payload.repair_damage_type)
    ) {
      throw new FleetServiceError(
        "Reparacion requiere tipo de dano valido.",
        400,
      );
    }
    if (!payload.repair_start_date) {
      throw new FleetServiceError("Reparacion requiere fecha de inicio.", 400);
    }
    if (repairStartDate && reportDate && repairStartDate < reportDate) {
      throw new FleetServiceError(
        "La fecha de inicio no puede ser menor a la fecha del reporte.",
        400,
      );
    }
    if (
      repairStartDate &&
      repairCompletionDate &&
      repairCompletionDate < repairStartDate
    ) {
      throw new FleetServiceError(
        "La fecha de fin no puede ser menor a la fecha de inicio.",
        400,
      );
    }
  }
  if (payload.report_type === "other" && !payload.other_category_label) {
    throw new FleetServiceError(
      "Tipo otro requiere categoria personalizada.",
      400,
    );
  }
}

async function withDbErrorMapping(fn, onTableMissing = null) {
  try {
    return await fn();
  } catch (error) {
    if (isTableNotFoundError(error)) {
      if (typeof onTableMissing === "function") {
        try {
          await onTableMissing();
          return await fn();
        } catch (retryError) {
          if (isTableNotFoundError(retryError)) {
            throw new FleetServiceError(
              "Las tablas de reportes no estan disponibles aun.",
              503,
            );
          }
          throw retryError;
        }
      }
      throw new FleetServiceError(
        "Las tablas de reportes no estan disponibles aun.",
        503,
      );
    }
    throw error;
  }
}

function mapRowForUi(row) {
  if (!row) return row;
  return {
    ...row,
    report_type_label:
      row.report_type === "maintenance"
        ? "Mantenimiento"
        : row.report_type === "service"
          ? "Servicio"
          : row.report_type === "repair"
            ? "Reparacion"
            : "Otro",
  };
}

export function createReportsService({ prisma }) {
  async function logAudit({
    companyId,
    actorId,
    entityType,
    entityId,
    action,
    before = null,
    after = null,
    metadata = null,
  }) {
    await prisma.auditLog.create({
      data: {
        companyId: companyId ?? null,
        actorId: actorId ?? null,
        moduleKey: MODULE_KEY,
        entityType,
        entityId: entityId ?? null,
        action,
        before,
        after,
        metadata,
      },
    });
  }

  const ensureReportTables = createReportSchemaEnsurer(prisma);

  const withDb = (fn) => withDbErrorMapping(fn, ensureReportTables);

  async function listReports({
    companyId,
    reportType,
    page,
    pageSize,
    search,
    status,
  }) {
    const safeCompanyId = toScopedCompanyUuid(companyId);
    const safeType = normalizeType(reportType);
    const pagination = normalizePagination({ page, pageSize });
    const normalizedStatus = status ? normalizeStatus(status) : null;
    const normalizedSearch = normalizeSearch(search);
    const likeValue = normalizedSearch ? `%${normalizedSearch}%` : null;

    const [rows, totalRows] = await withDb(async () => {
      const dataRows = await prisma.$queryRawUnsafe(
        `SELECT
            r.*,
            v.plate AS vehicle_plate,
            vm.name AS vehicle_model_name,
            COALESCE(vb_m.name, v.brand) AS vehicle_brand_name,
            COALESCE(vt_m.name, vt.name) AS vehicle_type_name
         FROM fleet_report r
         LEFT JOIN fleet_vehicle v ON v.id = r.vehicle_id AND v.company_id = r.company_id
         LEFT JOIN fleet_vehicle_model vm ON vm.id = v.vehicle_model_id
         LEFT JOIN fleet_vehicle_brand vb_m ON vb_m.id = vm.brand_id
         LEFT JOIN fleet_vehicle_type vt_m ON vt_m.id = vm.type_id
         LEFT JOIN fleet_vehicle_type vt ON vt.id = v.vehicle_type_id
         WHERE r.company_id = $1
           AND r.enabled = true
           AND r.report_type = $2
           AND ($3::text IS NULL OR r.status = $3)
           AND ($4::text IS NULL OR r.title ILIKE $4 OR r.folio ILIKE $4 OR v.plate ILIKE $4 OR r.workshop_name ILIKE $4)
         ORDER BY r.created_at DESC
         LIMIT $5 OFFSET $6`,
        safeCompanyId,
        safeType,
        normalizedStatus,
        likeValue,
        pagination.pageSize,
        pagination.offset,
      );
      const countRows = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::bigint AS total
         FROM fleet_report r
         LEFT JOIN fleet_vehicle v ON v.id = r.vehicle_id AND v.company_id = r.company_id
         WHERE r.company_id = $1
           AND r.enabled = true
           AND r.report_type = $2
           AND ($3::text IS NULL OR r.status = $3)
           AND ($4::text IS NULL OR r.title ILIKE $4 OR r.folio ILIKE $4 OR v.plate ILIKE $4 OR r.workshop_name ILIKE $4)`,
        safeCompanyId,
        safeType,
        normalizedStatus,
        likeValue,
      );
      return [dataRows, countRows];
    });

    return {
      data: rows.map(mapRowForUi),
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: toCount(firstRow(totalRows)?.total),
      },
    };
  }

  async function listReportsAnyType({
    companyId,
    page,
    pageSize,
    search,
    status,
  }) {
    const safeCompanyId = toScopedCompanyUuid(companyId);
    const pagination = normalizePagination({ page, pageSize });
    const normalizedStatus = status ? normalizeStatus(status) : null;
    const normalizedSearch = normalizeSearch(search);
    const likeValue = normalizedSearch ? `%${normalizedSearch}%` : null;

    const [rows, totalRows] = await withDb(async () => {
      const dataRows = await prisma.$queryRawUnsafe(
        `SELECT
            r.*,
            v.plate AS vehicle_plate,
            vm.name AS vehicle_model_name,
            COALESCE(vb_m.name, v.brand) AS vehicle_brand_name,
            COALESCE(vt_m.name, vt.name) AS vehicle_type_name
         FROM fleet_report r
         LEFT JOIN fleet_vehicle v ON v.id = r.vehicle_id AND v.company_id = r.company_id
         LEFT JOIN fleet_vehicle_model vm ON vm.id = v.vehicle_model_id
         LEFT JOIN fleet_vehicle_brand vb_m ON vb_m.id = vm.brand_id
         LEFT JOIN fleet_vehicle_type vt_m ON vt_m.id = vm.type_id
         LEFT JOIN fleet_vehicle_type vt ON vt.id = v.vehicle_type_id
         WHERE r.company_id = $1
           AND r.enabled = true
           AND ($2::text IS NULL OR r.status = $2)
           AND ($3::text IS NULL OR r.title ILIKE $3 OR r.folio ILIKE $3 OR v.plate ILIKE $3 OR r.workshop_name ILIKE $3)
         ORDER BY r.created_at DESC
         LIMIT $4 OFFSET $5`,
        safeCompanyId,
        normalizedStatus,
        likeValue,
        pagination.pageSize,
        pagination.offset,
      );
      const countRows = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::bigint AS total
         FROM fleet_report r
         LEFT JOIN fleet_vehicle v ON v.id = r.vehicle_id AND v.company_id = r.company_id
         WHERE r.company_id = $1
           AND r.enabled = true
           AND ($2::text IS NULL OR r.status = $2)
           AND ($3::text IS NULL OR r.title ILIKE $3 OR r.folio ILIKE $3 OR v.plate ILIKE $3 OR r.workshop_name ILIKE $3)`,
        safeCompanyId,
        normalizedStatus,
        likeValue,
      );
      return [dataRows, countRows];
    });

    return {
      data: rows.map(mapRowForUi),
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: toCount(firstRow(totalRows)?.total),
      },
    };
  }

  async function getReport({ companyId, id, reportType = null }) {
    const safeCompanyId = toScopedCompanyUuid(companyId);
    const safeId = normalizeRecordId(id, "Reporte no encontrado.");
    const safeType = reportType ? normalizeType(reportType) : null;
    const row = await withDb(async () => {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT
            r.*,
            v.plate AS vehicle_plate,
            vm.name AS vehicle_model_name,
            COALESCE(vb_m.name, v.brand) AS vehicle_brand_name,
            COALESCE(vt_m.name, vt.name) AS vehicle_type_name
         FROM fleet_report r
         LEFT JOIN fleet_vehicle v ON v.id = r.vehicle_id AND v.company_id = r.company_id
         LEFT JOIN fleet_vehicle_model vm ON vm.id = v.vehicle_model_id
         LEFT JOIN fleet_vehicle_brand vb_m ON vb_m.id = vm.brand_id
         LEFT JOIN fleet_vehicle_type vt_m ON vt_m.id = vm.type_id
         LEFT JOIN fleet_vehicle_type vt ON vt.id = v.vehicle_type_id
         WHERE r.id = $1
           AND r.company_id = $2
           AND ($3::text IS NULL OR r.report_type = $3)
         LIMIT 1`,
        safeId,
        safeCompanyId,
        safeType,
      );
      return firstRow(rows);
    });
    if (!row) throw new FleetServiceError("Reporte no encontrado.", 404);
    const partsRows = await withDb(
      () =>
        prisma.$queryRaw`
        SELECT * FROM fleet_report_part
        WHERE report_id = ${safeId} AND company_id = ${safeCompanyId} AND enabled = true
        ORDER BY created_at ASC
      `,
    );
    return mapRowForUi({ ...row, parts: partsRows });
  }

  async function reserveFolio({ companyId, reportType }) {
    const safeType = normalizeType(reportType);
    const prefix = TYPE_PREFIX[safeType];
    const rows = await withDb(() =>
      prisma.$queryRawUnsafe(
        `SELECT folio FROM fleet_report WHERE company_id = $1 AND report_type = $2 AND folio LIKE $3`,
        companyId,
        safeType,
        `${prefix}-%`,
      ),
    );
    let max = 0;
    for (const row of rows) {
      const folio = String(row?.folio ?? "");
      const numberPart = Number.parseInt(folio.split("-")[1] ?? "0", 10);
      if (Number.isFinite(numberPart) && numberPart > max) max = numberPart;
    }
    return `${prefix}-${String(max + 1).padStart(6, "0")}`;
  }

  async function createReport({ companyId, actorId, payload, reportType }) {
    const safeCompanyId = toScopedCompanyUuid(companyId);
    const data = normalizeReportPayload(payload, reportType);
    if (data.status && data.status !== "draft") {
      throw new FleetServiceError(
        "Los reportes nuevos deben crearse en borrador.",
        400,
      );
    }
    validateTypeBusinessRules(data);
    const folio = await reserveFolio({
      companyId: safeCompanyId,
      reportType: data.report_type,
    });

    // The report row and its parts are written in one transaction so a failed
    // part insert cannot leave a half-created report behind.
    const row = await withDb(async () => {
      await ensureReportTables();
      return prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw`
          INSERT INTO fleet_report (
            company_id, report_type, folio, status, vehicle_id, title, report_date, odometer_km,
            is_inhouse_workshop,
            workshop_name, workshop_phone, workshop_address, invoice_number,
            labor_cost, parts_cost, total_cost, notes,
            maintenance_subtype, next_service_date, next_service_odometer, service_subtype,
            repair_priority, repair_damage_type, repair_start_date, repair_completion_date,
            repair_estimated_cost, warranty_days, warranty_notes, other_category_label
          )
          VALUES (
            ${safeCompanyId}, ${data.report_type}, ${folio}, ${data.status ?? "draft"}, ${data.vehicle_id},
            ${data.title}, ${data.report_date}, ${data.odometer_km ?? null},
            ${data.is_inhouse_workshop ?? true},
            ${data.workshop_name ?? null}, ${data.workshop_phone ?? null}, ${data.workshop_address ?? null}, ${data.invoice_number ?? null},
            ${data.labor_cost}, ${data.parts_cost}, ${data.total_cost}, ${data.notes ?? null},
            ${data.maintenance_subtype ?? null}, ${data.next_service_date ?? null}, ${data.next_service_odometer ?? null}, ${data.service_subtype ?? null},
            ${data.repair_priority ?? null}, ${data.repair_damage_type ?? null}, ${data.repair_start_date ?? null}, ${data.repair_completion_date ?? null},
            ${data.repair_estimated_cost ?? null}, ${data.warranty_days ?? null}, ${data.warranty_notes ?? null}, ${data.other_category_label ?? null}
          )
          RETURNING *
        `;
        const created = firstRow(rows);
        if (!created) {
          throw new FleetServiceError("No se pudo crear el reporte.", 500);
        }
        for (const part of data.parts) {
          await tx.$queryRaw`
            INSERT INTO fleet_report_part (company_id, report_id, name, quantity, unit_cost, subtotal, notes, enabled)
            VALUES (${safeCompanyId}, ${created.id}, ${part.name}, ${part.quantity}, ${part.unit_cost}, ${part.subtotal}, ${part.notes ?? null}, true)
          `;
        }
        return created;
      });
    });

    if (!row) throw new FleetServiceError("No se pudo crear el reporte.", 500);

    await logAudit({
      companyId: safeCompanyId,
      actorId,
      entityType: "Report",
      entityId: row.id,
      action: "fleet.report.create",
      before: null,
      after: { ...row, parts: data.parts },
    });
    return getReport({
      companyId: safeCompanyId,
      id: row.id,
      reportType: data.report_type,
    });
  }

  async function updateReport({
    companyId,
    actorId,
    id,
    payload,
    reportType = null,
  }) {
    const safeCompanyId = toScopedCompanyUuid(companyId);
    const safeId = normalizeRecordId(id, "Reporte no encontrado.");
    const before = await getReport({
      companyId: safeCompanyId,
      id: safeId,
      reportType,
    });
    if (before.status === "finalized") {
      throw new FleetServiceError(
        "El reporte esta finalizado. Reabrelo para editarlo.",
        409,
      );
    }
    if (payload.status && payload.status !== before.status) {
      throw new FleetServiceError(
        "Usa finalizar o reabrir para cambiar estado.",
        400,
      );
    }
    const data = normalizeReportPayload(
      { ...before, ...payload },
      before.report_type,
    );
    validateTypeBusinessRules(data);

    const normalizedPatch = {
      ...payload,
      parts_cost: data.parts_cost,
      total_cost: data.total_cost,
      labor_cost: data.labor_cost,
    };
    if (payload.is_inhouse_workshop === true) {
      normalizedPatch.workshop_name = null;
      normalizedPatch.workshop_phone = null;
      normalizedPatch.workshop_address = null;
      normalizedPatch.invoice_number = null;
    }

    const updates = Object.entries(normalizedPatch).filter(
      ([key, value]) => UPDATABLE_FIELDS.has(key) && value !== undefined,
    );
    if (updates.length === 0 && payload.parts === undefined) {
      throw new FleetServiceError(
        "No hay campos validos para actualizar.",
        400,
      );
    }

    // Field patch and full parts replacement run in one transaction so the
    // report is never left with the old parts disabled and no new ones inserted.
    const hasFieldUpdates = updates.length > 0;
    const replacesParts = payload.parts !== undefined;
    let updated = before;
    if (hasFieldUpdates || replacesParts) {
      const setClauses = updates
        .map(([key], i) => `"${key}" = $${i + 3}`)
        .join(", ");
      const values = updates.map(([, value]) => value);
      const nextParts = replacesParts ? normalizeParts(payload.parts) : [];
      updated = await withDb(async () => {
        await ensureReportTables();
        return prisma.$transaction(async (tx) => {
          let row = before;
          if (hasFieldUpdates) {
            const rows = await tx.$queryRawUnsafe(
              `UPDATE fleet_report
               SET ${setClauses}, updated_at = now()
               WHERE id = $1 AND company_id = $2
               RETURNING *`,
              safeId,
              safeCompanyId,
              ...values,
            );
            row = firstRow(rows);
            if (!row) {
              throw new FleetServiceError("Reporte no encontrado.", 404);
            }
          }
          if (replacesParts) {
            await tx.$queryRaw`
              UPDATE fleet_report_part
              SET enabled = false
              WHERE report_id = ${safeId} AND company_id = ${safeCompanyId}
            `;
            for (const part of nextParts) {
              await tx.$queryRaw`
                INSERT INTO fleet_report_part (company_id, report_id, name, quantity, unit_cost, subtotal, notes, enabled)
                VALUES (${safeCompanyId}, ${safeId}, ${part.name}, ${part.quantity}, ${part.unit_cost}, ${part.subtotal}, ${part.notes ?? null}, true)
              `;
            }
          }
          return row;
        });
      });
      if (!updated) throw new FleetServiceError("Reporte no encontrado.", 404);
    }

    const result = await getReport({
      companyId: safeCompanyId,
      id: safeId,
      reportType: reportType ?? before.report_type,
    });
    await logAudit({
      companyId: safeCompanyId,
      actorId,
      entityType: "Report",
      entityId: safeId,
      action: "fleet.report.update",
      before,
      after: result,
    });
    return result;
  }

  async function setReportEnabled({
    companyId,
    actorId,
    id,
    enabled,
    reportType = null,
  }) {
    const safeCompanyId = toScopedCompanyUuid(companyId);
    const safeId = normalizeRecordId(id, "Reporte no encontrado.");
    const before = await getReport({
      companyId: safeCompanyId,
      id: safeId,
      reportType,
    });
    const updated = await withDb(async () => {
      const rows = await prisma.$queryRaw`
        UPDATE fleet_report
        SET enabled = ${Boolean(enabled)}, updated_at = now()
        WHERE id = ${safeId} AND company_id = ${safeCompanyId}
        RETURNING *
      `;
      return firstRow(rows);
    });
    if (!updated) throw new FleetServiceError("Reporte no encontrado.", 404);
    await logAudit({
      companyId: safeCompanyId,
      actorId,
      entityType: "Report",
      entityId: safeId,
      action: "fleet.report.disable",
      before,
      after: updated,
      metadata: { enabled: Boolean(enabled) },
    });
    return updated;
  }

  async function finalizeReport({ companyId, actorId, id, reportType = null }) {
    const safeCompanyId = toScopedCompanyUuid(companyId);
    const safeId = normalizeRecordId(id, "Reporte no encontrado.");
    const before = await getReport({
      companyId: safeCompanyId,
      id: safeId,
      reportType,
    });
    if (before.status === "finalized") return before;
    validateTypeBusinessRules(before);
    const updated = await withDb(async () => {
      const rows = await prisma.$queryRaw`
        UPDATE fleet_report
        SET status = 'finalized',
            finalized_at = now(),
            finalized_by_profile_id = ${actorId ?? null},
            updated_at = now()
        WHERE id = ${safeId} AND company_id = ${safeCompanyId}
        RETURNING *
      `;
      return firstRow(rows);
    });
    if (!updated) throw new FleetServiceError("Reporte no encontrado.", 404);
    const result = await getReport({
      companyId: safeCompanyId,
      id: safeId,
      reportType,
    });
    await logAudit({
      companyId: safeCompanyId,
      actorId,
      entityType: "Report",
      entityId: safeId,
      action: "fleet.report.finalize",
      before,
      after: result,
    });
    return result;
  }

  async function reopenReport({ companyId, actorId, id, reportType = null }) {
    const safeCompanyId = toScopedCompanyUuid(companyId);
    const safeId = normalizeRecordId(id, "Reporte no encontrado.");
    const before = await getReport({
      companyId: safeCompanyId,
      id: safeId,
      reportType,
    });
    const updated = await withDb(async () => {
      const rows = await prisma.$queryRaw`
        UPDATE fleet_report
        SET status = 'draft',
            finalized_at = null,
            finalized_by_profile_id = null,
            updated_at = now()
        WHERE id = ${safeId} AND company_id = ${safeCompanyId}
        RETURNING *
      `;
      return firstRow(rows);
    });
    if (!updated) throw new FleetServiceError("Reporte no encontrado.", 404);
    const result = await getReport({
      companyId: safeCompanyId,
      id: safeId,
      reportType,
    });
    await logAudit({
      companyId: safeCompanyId,
      actorId,
      entityType: "Report",
      entityId: safeId,
      action: "fleet.report.reopen",
      before,
      after: result,
    });
    return result;
  }

  async function listReportDocuments({ companyId, reportId }) {
    const safeCompanyId = toScopedCompanyUuid(companyId);
    const safeReportId = normalizeRecordId(reportId, "Reporte no encontrado.");
    const docs = await withDb(
      () =>
        prisma.$queryRaw`
        SELECT * FROM fleet_report_document
        WHERE report_id = ${safeReportId} AND company_id = ${safeCompanyId} AND enabled = true
        ORDER BY created_at DESC
      `,
    );
    if (!docs.length) return { data: [] };
    const fileAssetIds = docs.map((d) => d.file_asset_id).filter(Boolean);
    const assets =
      fileAssetIds.length > 0
        ? await prisma.fileAsset.findMany({
            where: { id: { in: fileAssetIds } },
          })
        : [];
    const assetMap = Object.fromEntries(
      assets.map((asset) => [asset.id, asset]),
    );
    return {
      data: docs.map((doc) => ({
        ...doc,
        file_asset: assetMap[doc.file_asset_id] ?? null,
      })),
    };
  }

  async function listReportParts({ companyId, reportId }) {
    const safeCompanyId = toScopedCompanyUuid(companyId);
    const safeReportId = normalizeRecordId(reportId, "Reporte no encontrado.");
    const rows = await withDb(
      () =>
        prisma.$queryRaw`
        SELECT *
        FROM fleet_report_part
        WHERE report_id = ${safeReportId}
          AND company_id = ${safeCompanyId}
          AND enabled = true
        ORDER BY created_at ASC
      `,
    );
    return { data: rows };
  }

  async function addReportDocument({ companyId, actorId, reportId, payload }) {
    const safeCompanyId = toScopedCompanyUuid(companyId);
    const safeReportId = normalizeRecordId(reportId, "Reporte no encontrado.");
    const doc = await withDb(async () => {
      const rows = await prisma.$queryRaw`
        INSERT INTO fleet_report_document (company_id, report_id, file_asset_id, document_type, label)
        VALUES (${safeCompanyId}, ${safeReportId}, ${payload.file_asset_id}, ${payload.document_type ?? "document"}, ${payload.label ?? null})
        RETURNING *
      `;
      return firstRow(rows);
    });
    await logAudit({
      companyId: safeCompanyId,
      actorId,
      entityType: "Report",
      entityId: safeReportId,
      action: "fleet.report.document.add",
      before: null,
      after: doc,
    });
    return doc;
  }

  async function removeReportDocument({ companyId, actorId, reportId, docId }) {
    const safeCompanyId = toScopedCompanyUuid(companyId);
    const safeReportId = normalizeRecordId(reportId, "Reporte no encontrado.");
    const safeDocId = normalizeRecordId(docId, "Documento no encontrado.");
    const updated = await withDb(async () => {
      const rows = await prisma.$queryRaw`
        UPDATE fleet_report_document
        SET enabled = false
        WHERE id = ${safeDocId} AND report_id = ${safeReportId} AND company_id = ${safeCompanyId}
        RETURNING *
      `;
      return firstRow(rows);
    });
    if (!updated) throw new FleetServiceError("Documento no encontrado.", 404);
    await logAudit({
      companyId: safeCompanyId,
      actorId,
      entityType: "Report",
      entityId: safeReportId,
      action: "fleet.report.document.remove",
      before: updated,
      after: { ...updated, enabled: false },
    });
    return updated;
  }

  async function generateReportPdf({ companyId, id, reportType = null }) {
    const safeCompanyId = toScopedCompanyUuid(companyId);
    const report = await getReport({
      companyId: safeCompanyId,
      id,
      reportType,
    });
    // companyId is the membership-context UUID v7; the shared branding resolver
    // keys prisma.company by that same id.
    const pdf = await buildReportPdfBuffer({ prisma, companyId: safeCompanyId, report });
    return { report, pdf };
  }

  return {
    listReports,
    listReportsAnyType,
    getReport,
    createReport,
    updateReport,
    setReportEnabled,
    finalizeReport,
    reopenReport,
    listReportDocuments,
    listReportParts,
    addReportDocument,
    removeReportDocument,
    generateReportPdf,
  };
}


