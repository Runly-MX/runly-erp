import { FleetServiceError } from "./fleet-service.js";

const MODULE_KEY = "runly.fleet";
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// sortBy column names come from this allowlist, never from raw user input
const SORT_FIELD_MAP = {
  full_name: "first_name || ' ' || last_name",
  first_name: "first_name",
  last_name: "last_name",
  phone: "phone",
  license_number: "license_number",
  license_expiry_date: "license_expiry_date",
  status: "status",
  created_at: "created_at",
};

function toNumber(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Days out from expiry at which a driver licence is flagged "expiring".
const LICENSE_EXPIRY_WARNING_DAYS = 30;

// Adds a computed `license_status` ('valid' | 'expiring' | 'expired' | 'unknown')
// and `license_days_to_expiry` to a driver row, based on license_expiry_date.
function withLicenseStatus(row) {
  if (!row) return row;
  const raw = row.license_expiry_date;
  if (!raw) return { ...row, license_status: "unknown", license_days_to_expiry: null };
  const expiry = new Date(raw);
  if (Number.isNaN(expiry.getTime())) {
    return { ...row, license_status: "unknown", license_days_to_expiry: null };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
  let status = "valid";
  if (days < 0) status = "expired";
  else if (days <= LICENSE_EXPIRY_WARNING_DAYS) status = "expiring";
  return { ...row, license_status: status, license_days_to_expiry: days };
}

function normalizePagination({ page, pageSize }) {
  const safePage = Math.max(1, toNumber(page, 1));
  const safePageSize = Math.min(100, Math.max(1, toNumber(pageSize, 20)));
  return {
    page: safePage,
    pageSize: safePageSize,
    offset: (safePage - 1) * safePageSize,
  };
}

function normalizeSearch(search) {
  const value = String(search ?? "").trim();
  return value.length > 0 ? value : null;
}

function normalizeOptionalString(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function ensureCompanyId(companyId) {
  const normalized =
    typeof companyId === "string" && companyId.trim() ? companyId.trim() : null;
  if (!normalized) throw new FleetServiceError("companyId es requerido.", 400);
  return normalized;
}

function normalizeDriverPayload(data = {}) {
  return {
    ...data,
    first_name:
      data.first_name === undefined
        ? undefined
        : String(data.first_name).trim(),
    last_name:
      data.last_name === undefined ? undefined : String(data.last_name).trim(),
    phone: data.phone === undefined ? undefined : String(data.phone).trim(),
    license_number:
      data.license_number === undefined
        ? undefined
        : String(data.license_number).trim(),
    license_type:
      data.license_type === undefined
        ? undefined
        : String(data.license_type).trim(),
    email: normalizeOptionalString(data.email),
    photo_asset_id: normalizeOptionalString(data.photo_asset_id),
    hr_employee_id: normalizeOptionalString(data.hr_employee_id),
    notes: normalizeOptionalString(data.notes),
  };
}

function toScopedCompanyUuid(companyId) {
  const normalized =
    typeof companyId === "string" && companyId.trim() ? companyId.trim() : null;
  if (!normalized) throw new FleetServiceError("companyId es requerido.", 400);
  if (!UUID_REGEX.test(normalized))
    throw new FleetServiceError("companyId debe ser UUID valido.", 400);
  return normalized.toLowerCase();
}

function normalizeRecordId(id, notFoundMessage) {
  const value = String(id ?? "").trim();
  if (!UUID_REGEX.test(value))
    throw new FleetServiceError(notFoundMessage, 404);
  return value.toLowerCase();
}

function isTableNotFoundError(error) {
  const codes = [
    error?.code,
    error?.meta?.code,
    error?.cause?.code,
    error?.originalError?.code,
  ];
  if (codes.includes("42P01")) return true;
  const msg = String(error?.message ?? "").toLowerCase();
  return (
    msg.includes("42p01") ||
    (msg.includes("relation") && msg.includes("does not exist"))
  );
}

function isUniqueViolation(error) {
  const codes = [
    error?.code,
    error?.meta?.code,
    error?.cause?.code,
    error?.cause?.originalCode,
    error?.originalError?.code,
    error?.meta?.driverAdapterError?.cause?.code,
    error?.meta?.driverAdapterError?.cause?.originalCode,
  ]
    .map((v) => (v == null ? null : String(v)))
    .filter(Boolean);
  if (codes.includes("23505")) return true;
  return String(error?.message ?? "")
    .toLowerCase()
    .includes("duplicate key value violates unique constraint");
}

function toCount(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function withDbErrorMapping(fn) {
  try {
    return await fn();
  } catch (error) {
    if (isTableNotFoundError(error))
      throw new FleetServiceError(
        "Las tablas del modulo no estan disponibles aun.",
        503,
      );
    throw error;
  }
}

function firstRow(rows) {
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

function hasOwn(data, key) {
  return Object.prototype.hasOwnProperty.call(data, key);
}

export function createDriverService({ prisma }) {
  async function enrichDriversWithHrData(rows, rawCompanyId) {
    if (!Array.isArray(rows) || rows.length === 0) return rows ?? [];

    const ids = [
      ...new Set(
        rows
          .map((row) => normalizeOptionalString(row?.hr_employee_id))
          .filter(Boolean),
      ),
    ];
    if (ids.length === 0) return rows;

    let hrRows = [];
    try {
      const placeholders = ids.map((_, i) => `$${i + 2}`).join(", ");
      hrRows = await prisma.$queryRawUnsafe(
        `SELECT id, first_name, last_name, employee_code, user_profile_id
         FROM hr_employee
         WHERE company_id = $1 AND id IN (${placeholders})`,
        rawCompanyId,
        ...ids,
      );
    } catch {
      return rows;
    }
    const hrMap = new Map(
      hrRows.map((entry) => [
        entry.id,
        {
          hr_employee_name:
            `${entry.first_name ?? ""} ${entry.last_name ?? ""}`.trim() || null,
          hr_employee_code: entry.employee_code ?? null,
          linked_user_profile_id: entry.user_profile_id ?? null,
        },
      ]),
    );

    return rows.map((row) => {
      const hrEmployeeId = normalizeOptionalString(row.hr_employee_id);
      if (!hrEmployeeId) return row;
      const match = hrMap.get(hrEmployeeId);
      if (!match) return row;
      return { ...row, ...match };
    });
  }

  async function validateHrEmployeeLink({
    rawCompanyId,
    hrEmployeeId,
    currentDriverId = null,
  }) {
    if (!hrEmployeeId) return;

    let employee = null;
    try {
      const rows = await prisma.$queryRaw`
        SELECT id, enabled FROM hr_employee
        WHERE id = ${hrEmployeeId}::uuid AND company_id = ${toScopedCompanyUuid(rawCompanyId)}
        LIMIT 1
      `;
      employee = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    } catch {
      throw new FleetServiceError(
        "No se pudo validar el colaborador de RH. Revisa que el modulo RH este disponible.",
        503,
      );
    }
    if (!employee) {
      throw new FleetServiceError(
        "El colaborador de RH seleccionado no existe en la empresa activa.",
        400,
      );
    }
    if (!employee.enabled) {
      throw new FleetServiceError(
        "El colaborador de RH seleccionado esta deshabilitado.",
        400,
      );
    }

    const safeCurrentDriverId = normalizeOptionalString(currentDriverId);
    const linkedRows = await prisma.$queryRaw`
      SELECT id
      FROM fleet_driver
      WHERE company_id = ${toScopedCompanyUuid(rawCompanyId)}
        AND enabled = true
        AND hr_employee_id = ${hrEmployeeId}
        AND (${safeCurrentDriverId}::text IS NULL OR id <> ${safeCurrentDriverId}::uuid)
      LIMIT 1
    `;
    if (Array.isArray(linkedRows) && linkedRows.length > 0) {
      throw new FleetServiceError(
        "Este colaborador de RH ya esta vinculado a otro chofer.",
        409,
      );
    }
  }

  async function logAudit({
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

  async function listDrivers({
    companyId,
    page,
    pageSize,
    search,
    status,
    sortBy,
    sortDir,
  }) {
    const safeCompanyId = toScopedCompanyUuid(companyId);
    const rawCompanyId = ensureCompanyId(companyId);
    const pagination = normalizePagination({ page, pageSize });
    const normalizedStatus = normalizeOptionalString(status);
    const normalizedSearch = normalizeSearch(search);
    const likeValue = normalizedSearch ? `%${normalizedSearch}%` : null;
    // sortCol from allowlist only — never raw user input
    const sortCol = SORT_FIELD_MAP[sortBy] ?? "created_at";
    const sortDirection = sortDir === "asc" ? "ASC" : "DESC";

    const [rows, totalRows] = await withDbErrorMapping(async () => {
      const dataRows = await prisma.$queryRawUnsafe(
        `SELECT fd.*, fd.first_name || ' ' || fd.last_name AS full_name,
                fd.first_name || ' ' || fd.last_name AS driver_name,
                COALESCE(
                  fd.photo_asset_id,
                  (
                    SELECT fdd.file_asset_id
                    FROM fleet_driver_document fdd
                    JOIN "file_asset" fa ON fa.id::text = fdd.file_asset_id::text
                    WHERE fdd.driver_id::text = fd.id::text
                      AND fdd.company_id::text = fd.company_id::text
                      AND fdd.enabled = true
                      AND fa."mime_type" ILIKE 'image/%'
                    ORDER BY fdd.created_at DESC
                    LIMIT 1
                  )
                ) AS photo_asset_id_resolved,
                vehicle_stats.assigned_plate AS assigned_plate,
                COALESCE(vehicle_stats.assigned_vehicle_count, 0) AS assigned_vehicle_count,
                COALESCE(vehicle_stats.assigned_vehicle_extra_count, 0) AS assigned_vehicle_extra_count
         FROM fleet_driver fd
         LEFT JOIN LATERAL (
           SELECT
             COUNT(*)::int AS assigned_vehicle_count,
             GREATEST(COUNT(*)::int - 1, 0) AS assigned_vehicle_extra_count,
             (ARRAY_AGG(v.plate ORDER BY v.updated_at DESC NULLS LAST, v.created_at DESC NULLS LAST, v.id DESC))[1] AS assigned_plate
           FROM fleet_vehicle v
           WHERE v.driver_id = fd.id
             AND v.company_id = fd.company_id
             AND v.enabled = true
         ) vehicle_stats ON true
         WHERE fd.company_id = $1
           AND fd.enabled = true
           AND ($2::text IS NULL OR fd.status = $2)
           AND ($3::text IS NULL OR fd.first_name ILIKE $3 OR fd.last_name ILIKE $3 OR fd.license_number ILIKE $3 OR fd.phone ILIKE $3)
         ORDER BY ${sortCol} ${sortDirection}
         LIMIT $4 OFFSET $5`,
        safeCompanyId,
        normalizedStatus,
        likeValue,
        pagination.pageSize,
        pagination.offset,
      );
      const countRows = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::bigint AS total
         FROM fleet_driver
         WHERE company_id = $1
           AND enabled = true
           AND ($2::text IS NULL OR status = $2)
           AND ($3::text IS NULL OR first_name ILIKE $3 OR last_name ILIKE $3 OR license_number ILIKE $3 OR phone ILIKE $3)`,
        safeCompanyId,
        normalizedStatus,
        likeValue,
      );
      return [dataRows, countRows];
    });
    const enrichedRows = (
      await enrichDriversWithHrData(rows, rawCompanyId)
    ).map(withLicenseStatus);

    return {
      data: enrichedRows,
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: toCount(firstRow(totalRows)?.total),
      },
    };
  }

  async function getDriver({ companyId, id }) {
    const safeCompanyId = toScopedCompanyUuid(companyId);
    const rawCompanyId = ensureCompanyId(companyId);
    const safeId = normalizeRecordId(id, "Chofer no encontrado.");
    const row = await withDbErrorMapping(async () => {
      const rows = await prisma.$queryRaw`
        SELECT *,
               first_name || ' ' || last_name AS full_name,
               COALESCE(
                 photo_asset_id,
                 (
                   SELECT fdd.file_asset_id
                   FROM fleet_driver_document fdd
                   JOIN "file_asset" fa ON fa.id::text = fdd.file_asset_id::text
                   WHERE fdd.driver_id::text = fleet_driver.id::text
                     AND fdd.company_id::text = fleet_driver.company_id::text
                     AND fdd.enabled = true
                     AND fa."mime_type" ILIKE 'image/%'
                   ORDER BY fdd.created_at DESC
                   LIMIT 1
                 )
               ) AS photo_asset_id_resolved
        FROM fleet_driver
        WHERE id = ${safeId} AND company_id = ${safeCompanyId}
        LIMIT 1
      `;
      return firstRow(rows);
    });
    if (!row) throw new FleetServiceError("Chofer no encontrado.", 404);
    const [enriched] = await enrichDriversWithHrData([row], rawCompanyId);
    return withLicenseStatus(enriched ?? row);
  }

  async function createDriver({ companyId, actorId, payload }) {
    const safeCompanyId = toScopedCompanyUuid(companyId);
    const rawCompanyId = ensureCompanyId(companyId);
    const data = normalizeDriverPayload(payload);
    await validateHrEmployeeLink({
      rawCompanyId,
      hrEmployeeId: data.hr_employee_id ?? null,
    });
    try {
      const row = await withDbErrorMapping(async () => {
        const rows = await prisma.$queryRaw`
          INSERT INTO fleet_driver (
            company_id, first_name, last_name, phone, email, photo_asset_id,
            license_number, license_type, license_expiry_date, status, notes, hr_employee_id
          )
          VALUES (
            ${safeCompanyId}, ${data.first_name}, ${data.last_name}, ${data.phone},
            ${data.email ?? null}, ${data.photo_asset_id ?? null},
            ${data.license_number}, ${data.license_type}, ${data.license_expiry_date},
            ${data.status ?? "active"}, ${data.notes ?? null}, ${data.hr_employee_id ?? null}
          )
          RETURNING *, first_name || ' ' || last_name AS full_name
        `;
        return firstRow(rows);
      });
      await logAudit({
        actorId,
        entityType: "Driver",
        entityId: row?.id ?? null,
        action: "fleet.driver.create",
        before: null,
        after: row,
      });
      return row;
    } catch (error) {
      if (isUniqueViolation(error))
        throw new FleetServiceError(
          "Ya existe un chofer con ese numero de licencia.",
          409,
        );
      throw error;
    }
  }

  async function updateDriver({ companyId, actorId, id, payload }) {
    const safeCompanyId = toScopedCompanyUuid(companyId);
    const rawCompanyId = ensureCompanyId(companyId);
    const safeId = normalizeRecordId(id, "Chofer no encontrado.");
    const data = normalizeDriverPayload(payload);

    const hasFirstName =
      hasOwn(data, "first_name") && data.first_name !== undefined;
    const hasLastName =
      hasOwn(data, "last_name") && data.last_name !== undefined;
    const hasPhone = hasOwn(data, "phone") && data.phone !== undefined;
    const hasEmail = hasOwn(data, "email") && data.email !== undefined;
    const hasPhotoAssetId =
      hasOwn(data, "photo_asset_id") && data.photo_asset_id !== undefined;
    const hasLicenseNumber =
      hasOwn(data, "license_number") && data.license_number !== undefined;
    const hasLicenseType =
      hasOwn(data, "license_type") && data.license_type !== undefined;
    const hasLicenseExpiryDate =
      hasOwn(data, "license_expiry_date") &&
      data.license_expiry_date !== undefined;
    const hasStatus = hasOwn(data, "status") && data.status !== undefined;
    const hasNotes = hasOwn(data, "notes") && data.notes !== undefined;
    const hasHrEmployeeId =
      hasOwn(data, "hr_employee_id") && data.hr_employee_id !== undefined;

    if (
      ![
        hasFirstName,
        hasLastName,
        hasPhone,
        hasEmail,
        hasPhotoAssetId,
        hasLicenseNumber,
        hasLicenseType,
        hasLicenseExpiryDate,
        hasStatus,
        hasNotes,
        hasHrEmployeeId,
      ].some(Boolean)
    ) {
      throw new FleetServiceError(
        "No hay campos validos para actualizar.",
        400,
      );
    }

    if (hasHrEmployeeId) {
      await validateHrEmployeeLink({
        rawCompanyId,
        hrEmployeeId: data.hr_employee_id ?? null,
        currentDriverId: safeId,
      });
    }

    const before = await getDriver({ companyId, id: safeId });

    try {
      const updated = await withDbErrorMapping(async () => {
        const rows = await prisma.$queryRaw`
          UPDATE fleet_driver
          SET first_name = CASE WHEN ${hasFirstName} THEN ${data.first_name ?? null} ELSE first_name END,
              last_name = CASE WHEN ${hasLastName} THEN ${data.last_name ?? null} ELSE last_name END,
              phone = CASE WHEN ${hasPhone} THEN ${data.phone ?? null} ELSE phone END,
              email = CASE WHEN ${hasEmail} THEN ${data.email ?? null} ELSE email END,
              photo_asset_id = CASE WHEN ${hasPhotoAssetId} THEN ${data.photo_asset_id ?? null} ELSE photo_asset_id END,
              license_number = CASE WHEN ${hasLicenseNumber} THEN ${data.license_number ?? null} ELSE license_number END,
              license_type = CASE WHEN ${hasLicenseType} THEN ${data.license_type ?? null} ELSE license_type END,
              license_expiry_date = CASE WHEN ${hasLicenseExpiryDate} THEN ${data.license_expiry_date ?? null} ELSE license_expiry_date END,
              status = CASE WHEN ${hasStatus} THEN ${data.status ?? null} ELSE status END,
              notes = CASE WHEN ${hasNotes} THEN ${data.notes ?? null} ELSE notes END,
              hr_employee_id = CASE WHEN ${hasHrEmployeeId} THEN ${data.hr_employee_id ?? null} ELSE hr_employee_id END,
              updated_at = now()
          WHERE id = ${safeId} AND company_id = ${safeCompanyId}
          RETURNING *, first_name || ' ' || last_name AS full_name
        `;
        return firstRow(rows);
      });
      if (!updated) throw new FleetServiceError("Chofer no encontrado.", 404);
      await logAudit({
        actorId,
        entityType: "Driver",
        entityId: updated.id,
        action: "fleet.driver.update",
        before,
        after: updated,
      });
      return updated;
    } catch (error) {
      if (isUniqueViolation(error))
        throw new FleetServiceError(
          "Ya existe un chofer con ese numero de licencia.",
          409,
        );
      throw error;
    }
  }

  async function setDriverEnabled({ companyId, actorId, id, enabled }) {
    const safeCompanyId = toScopedCompanyUuid(companyId);
    const safeId = normalizeRecordId(id, "Chofer no encontrado.");
    const before = await getDriver({ companyId, id: safeId });

    const updated = await withDbErrorMapping(async () => {
      const rows = await prisma.$queryRaw`
        UPDATE fleet_driver
        SET enabled = ${Boolean(enabled)}, updated_at = now()
        WHERE id = ${safeId} AND company_id = ${safeCompanyId}
        RETURNING *, first_name || ' ' || last_name AS full_name
      `;
      return firstRow(rows);
    });
    if (!updated) throw new FleetServiceError("Chofer no encontrado.", 404);
    await logAudit({
      actorId,
      entityType: "Driver",
      entityId: updated.id,
      action: "fleet.driver.disable",
      before,
      after: updated,
      metadata: { enabled: Boolean(enabled) },
    });
    return updated;
  }

  async function listDriverDocuments({ companyId, driverId }) {
    const safeCompanyId = toScopedCompanyUuid(companyId);
    const safeDriverId = normalizeRecordId(driverId, "Chofer no encontrado.");

    const docs = await withDbErrorMapping(
      () =>
        prisma.$queryRaw`
        SELECT * FROM fleet_driver_document
        WHERE driver_id::text = ${safeDriverId}::text
          AND company_id::text = ${safeCompanyId}::text
          AND enabled = true
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
    const assetMap = Object.fromEntries(assets.map((a) => [a.id, a]));

    return {
      data: docs.map((d) => ({
        ...d,
        file_asset: assetMap[d.file_asset_id] ?? null,
      })),
    };
  }

  async function listDriverVehicles({ companyId, driverId }) {
    const safeCompanyId = toScopedCompanyUuid(companyId);
    const safeDriverId = normalizeRecordId(driverId, "Chofer no encontrado.");

    const rows = await withDbErrorMapping(
      () =>
        prisma.$queryRaw`
        SELECT
          v.id,
          v.plate,
          vm.name AS vehicle_model_name,
          COALESCE(vb_m.name, v.brand) AS vehicle_brand_name,
          COALESCE(vt_m.name, vt.name) AS vehicle_type_name,
          CASE
            WHEN COALESCE(vt_m.economic_group_number, vt.economic_group_number, v.economic_group_number) IS NOT NULL
              AND v.economic_individual_number IS NOT NULL
              THEN
                COALESCE(
                  NULLIF(REGEXP_REPLACE(COALESCE(vt_m.economic_group_number, vt.economic_group_number, v.economic_group_number), '^0+', ''), ''),
                  '0'
                ) ||
                COALESCE(NULLIF(REGEXP_REPLACE(v.economic_individual_number, '^0+', ''), ''), '0')
            ELSE NULL
          END AS economic_number,
          CASE
            WHEN COALESCE(vt_m.economic_group_number, vt.economic_group_number, v.economic_group_number) IS NOT NULL
              AND v.economic_individual_number IS NOT NULL
              THEN
                COALESCE(
                  NULLIF(REGEXP_REPLACE(COALESCE(vt_m.economic_group_number, vt.economic_group_number, v.economic_group_number), '^0+', ''), ''),
                  '0'
                ) ||
                COALESCE(NULLIF(REGEXP_REPLACE(v.economic_individual_number, '^0+', ''), ''), '0')
            ELSE NULL
          END AS full_economic_number,
          v.status
        FROM fleet_vehicle v
        LEFT JOIN fleet_vehicle_model vm ON vm.id = v.vehicle_model_id
        LEFT JOIN fleet_vehicle_brand vb_m ON vb_m.id = vm.brand_id
        LEFT JOIN fleet_vehicle_type vt_m ON vt_m.id = vm.type_id
        LEFT JOIN fleet_vehicle_type vt ON vt.id = v.vehicle_type_id
        WHERE v.company_id = ${safeCompanyId}
          AND v.driver_id = ${safeDriverId}
          AND v.enabled = true
        ORDER BY v.updated_at DESC, v.created_at DESC
      `,
    );

    return { data: rows };
  }

  async function addDriverDocument({ companyId, actorId, driverId, payload }) {
    const safeCompanyId = toScopedCompanyUuid(companyId);
    const safeDriverId = normalizeRecordId(driverId, "Chofer no encontrado.");

    const fileAssetId = normalizeOptionalString(payload.file_asset_id);
    if (!fileAssetId) throw new FleetServiceError("Archivo invalido.", 400);

    const doc = await withDbErrorMapping(async () => {
      const rows = await prisma.$queryRaw`
        INSERT INTO fleet_driver_document (company_id, driver_id, file_asset_id, document_type, label)
        VALUES (${safeCompanyId}, ${safeDriverId}, ${fileAssetId}, ${payload.document_type ?? "document"}, ${payload.label ?? null})
        RETURNING *
      `;
      return firstRow(rows);
    });

    const asset = await prisma.fileAsset.findUnique({
      where: { id: fileAssetId },
      select: { id: true, mimeType: true },
    });
    if (asset?.mimeType?.startsWith("image/")) {
      await withDbErrorMapping(
        () =>
          prisma.$queryRaw`
          UPDATE fleet_driver
          SET photo_asset_id = CASE
            WHEN photo_asset_id IS NULL OR TRIM(photo_asset_id::text) = ''
              THEN ${fileAssetId}
            ELSE photo_asset_id
          END,
          updated_at = now()
          WHERE id = ${safeDriverId}
            AND company_id = ${safeCompanyId}
        `,
      );
    }

    await logAudit({
      actorId,
      entityType: "Driver",
      entityId: safeDriverId,
      action: "fleet.driver.document.add",
      before: null,
      after: doc,
    });
    return doc;
  }

  async function removeDriverDocument({ companyId, actorId, driverId, docId }) {
    const safeCompanyId = toScopedCompanyUuid(companyId);
    const safeDriverId = normalizeRecordId(driverId, "Chofer no encontrado.");
    const safeDocId = normalizeRecordId(docId, "Documento no encontrado.");

    const updated = await withDbErrorMapping(async () => {
      const rows = await prisma.$queryRaw`
        UPDATE fleet_driver_document
        SET enabled = false
        WHERE id = ${safeDocId}
          AND driver_id::text = ${safeDriverId}::text
          AND company_id::text = ${safeCompanyId}::text
        RETURNING *
      `;
      return firstRow(rows);
    });
    if (!updated) throw new FleetServiceError("Documento no encontrado.", 404);
    await logAudit({
      actorId,
      entityType: "Driver",
      entityId: safeDriverId,
      action: "fleet.driver.document.remove",
      before: updated,
      after: { ...updated, enabled: false },
    });
    return updated;
  }

  return {
    listDrivers,
    getDriver,
    createDriver,
    updateDriver,
    setDriverEnabled,
    listDriverDocuments,
    listDriverVehicles,
    addDriverDocument,
    removeDriverDocument,
  };
}
