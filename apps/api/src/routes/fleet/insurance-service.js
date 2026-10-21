import {
  normalizePagination,
  normalizeSearch,
  normalizeOptionalString,
  isTableNotFoundError,
  isUniqueViolation,
  toCount,
  firstRow,
  hasOwn,
} from "./service-helpers.js";
import { FleetServiceError } from "./fleet-service.js";

const MODULE_KEY = "runly.fleet";
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  if (!UUID_REGEX.test(value)) {
    throw new FleetServiceError(notFoundMessage, 404);
  }
  return value.toLowerCase();
}

async function withDbErrorMapping(fn) {
  try {
    return await fn();
  } catch (error) {
    if (isTableNotFoundError(error)) {
      throw new FleetServiceError(
        "Las tablas del modulo no estan disponibles aun.",
        503,
      );
    }
    throw error;
  }
}

function normalizeInsurancePolicyPayload(data = {}) {
  const normalized = {};

  if (data.vehicle_id !== undefined) {
    normalized.vehicle_id =
      data.vehicle_id === null ? null : String(data.vehicle_id).trim();
  }
  if (data.insurer_name !== undefined) {
    normalized.insurer_name =
      data.insurer_name === null ? null : String(data.insurer_name).trim();
  }
  if (data.policy_number !== undefined) {
    normalized.policy_number =
      data.policy_number === null ? null : String(data.policy_number).trim();
  }
  if (data.coverage_type !== undefined) {
    normalized.coverage_type = normalizeOptionalString(data.coverage_type);
  }
  if (data.start_date !== undefined) {
    normalized.start_date =
      data.start_date === null ? null : String(data.start_date).trim();
  }
  if (data.expiry_date !== undefined) {
    normalized.expiry_date =
      data.expiry_date === null ? null : String(data.expiry_date).trim();
  }
  if (data.premium !== undefined) {
    if (typeof data.premium === "number") {
      normalized.premium = data.premium;
    } else if (data.premium === null) {
      normalized.premium = null;
    }
  }

  // currency: always provide a value, defaulting to 'MXN'
  normalized.currency = String(data.currency ?? "MXN").trim() || "MXN";

  if (data.notes !== undefined) {
    normalized.notes = normalizeOptionalString(data.notes);
  }
  if (data.document_asset_id !== undefined) {
    normalized.document_asset_id = normalizeOptionalString(
      data.document_asset_id,
    );
  }

  return normalized;
}

export function createInsuranceService({ prisma }) {
  async function logAudit({
    companyId,
    actorId,
    entityType,
    entityId,
    action,
    before = null,
    after = null,
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
        metadata: null,
      },
    });
  }

  async function listPolicies({
    companyId,
    vehicleId,
    active,
    page,
    pageSize,
  }) {
    const safeCompanyId = toScopedCompanyUuid(companyId);
    const pagination = normalizePagination({ page, pageSize });

    // Normalize vehicleId: null means "no filter"
    let safeVehicleId = null;
    if (
      vehicleId !== undefined &&
      vehicleId !== null &&
      String(vehicleId).trim()
    ) {
      safeVehicleId = normalizeRecordId(vehicleId, "Vehiculo no encontrado.");
    }

    // active: true = only active, false = only inactive/expired, null/undefined = all enabled
    const activeFilter =
      active === true ? true : active === false ? false : null;

    const [rows, totalRows] = await withDbErrorMapping(async () => {
      const dataRows = await prisma.$queryRaw`
        SELECT fip.*,
          fv.plate AS vehicle_plate,
          CONCAT(fip.insurer_name, ' - ', fip.policy_number) AS name,
          CASE
            WHEN fip.enabled = false THEN 'disabled'
            WHEN fip.expiry_date::date < CURRENT_DATE THEN 'expired'
            ELSE 'active'
          END AS status,
          CASE fip.coverage_type
            WHEN 'basic' THEN 'Basica'
            WHEN 'comprehensive' THEN 'Integral'
            WHEN 'third_party' THEN 'Terceros'
            WHEN 'other' THEN 'Otro'
            ELSE fip.coverage_type
          END AS coverage_type_label
        FROM fleet_insurance_policy fip
        LEFT JOIN fleet_vehicle fv ON fv.id = fip.vehicle_id AND fv.company_id = fip.company_id
        WHERE fip.company_id = ${safeCompanyId}
          AND (
            CASE
              WHEN ${activeFilter} IS TRUE THEN fip.enabled = true AND fip.expiry_date::date >= CURRENT_DATE
              WHEN ${activeFilter} IS FALSE THEN (fip.enabled = false OR fip.expiry_date::date < CURRENT_DATE)
              ELSE fip.enabled = true
            END
          )
          AND (${safeVehicleId}::uuid IS NULL OR fip.vehicle_id = ${safeVehicleId}::uuid)
        ORDER BY fip.expiry_date DESC
        LIMIT ${pagination.pageSize} OFFSET ${pagination.offset}
      `;

      const countRows = await prisma.$queryRaw`
        SELECT COUNT(*)::bigint AS total
        FROM fleet_insurance_policy fip
        WHERE fip.company_id = ${safeCompanyId}
          AND (
            CASE
              WHEN ${activeFilter} IS TRUE THEN fip.enabled = true AND fip.expiry_date::date >= CURRENT_DATE
              WHEN ${activeFilter} IS FALSE THEN (fip.enabled = false OR fip.expiry_date::date < CURRENT_DATE)
              ELSE fip.enabled = true
            END
          )
          AND (${safeVehicleId}::uuid IS NULL OR fip.vehicle_id = ${safeVehicleId}::uuid)
      `;

      return [dataRows, countRows];
    });

    return {
      data: rows,
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: toCount(firstRow(totalRows)?.total),
      },
    };
  }

  async function createPolicy({ companyId, actorId, data }) {
    const safeCompanyId = toScopedCompanyUuid(companyId);
    const payload = normalizeInsurancePolicyPayload(data);

    try {
      const row = await withDbErrorMapping(async () => {
        const rows = await prisma.$queryRaw`
          INSERT INTO fleet_insurance_policy (
            company_id,
            vehicle_id,
            insurer_name,
            policy_number,
            coverage_type,
            start_date,
            expiry_date,
            premium,
            currency,
            notes,
            document_asset_id
          )
          VALUES (
            ${safeCompanyId},
            ${payload.vehicle_id ?? null},
            ${payload.insurer_name ?? null},
            ${payload.policy_number ?? null},
            ${payload.coverage_type ?? null},
            ${payload.start_date ?? null},
            ${payload.expiry_date ?? null},
            ${payload.premium ?? null},
            ${payload.currency},
            ${payload.notes ?? null},
            ${payload.document_asset_id ?? null}
          )
          RETURNING *
        `;
        return firstRow(rows);
      });

      await logAudit({
        companyId: safeCompanyId,
        actorId,
        entityType: "InsurancePolicy",
        entityId: row?.id ?? null,
        action: "fleet.insurance.create",
        before: null,
        after: row,
      });

      return row;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new FleetServiceError(
          "Ya existe una poliza con ese numero para esta empresa.",
          409,
        );
      }
      throw error;
    }
  }

  async function getPolicy({ companyId, id }) {
    const safeCompanyId = toScopedCompanyUuid(companyId);
    const safeId = normalizeRecordId(id, "Poliza de seguro no encontrada.");

    const row = await withDbErrorMapping(async () => {
      const rows = await prisma.$queryRaw`
        SELECT fip.*,
          fv.plate AS vehicle_plate,
          COALESCE(vb_m.name, vb.name) AS vehicle_brand_name,
          vm.name AS vehicle_model_name,
          vm.year AS vehicle_model_year,
          COALESCE(vt_m.name, vt.name) AS vehicle_type_name,
          CASE
            WHEN COALESCE(vt_m.economic_group_number, vt.economic_group_number, fv.economic_group_number) IS NOT NULL
              AND fv.economic_individual_number IS NOT NULL
              THEN
                COALESCE(NULLIF(REGEXP_REPLACE(COALESCE(vt_m.economic_group_number, vt.economic_group_number, fv.economic_group_number), '^0+', ''), ''), '0') ||
                COALESCE(NULLIF(REGEXP_REPLACE(fv.economic_individual_number, '^0+', ''), ''), '0')
            ELSE NULL
          END AS vehicle_economic_number,
          CONCAT(fip.insurer_name, ' - ', fip.policy_number) AS name,
          CASE
            WHEN fip.enabled = false THEN 'disabled'
            WHEN fip.expiry_date::date < CURRENT_DATE THEN 'expired'
            ELSE 'active'
          END AS status,
          CASE fip.coverage_type
            WHEN 'basic' THEN 'Basica'
            WHEN 'comprehensive' THEN 'Integral'
            WHEN 'third_party' THEN 'Terceros'
            WHEN 'other' THEN 'Otro'
            ELSE fip.coverage_type
          END AS coverage_type_label
        FROM fleet_insurance_policy fip
        LEFT JOIN fleet_vehicle fv ON fv.id = fip.vehicle_id AND fv.company_id = fip.company_id
        LEFT JOIN fleet_vehicle_model vm ON vm.id = fv.vehicle_model_id
        LEFT JOIN fleet_vehicle_brand vb_m ON vb_m.id = vm.brand_id
        LEFT JOIN fleet_vehicle_type vt_m ON vt_m.id = vm.type_id
        LEFT JOIN fleet_vehicle_type vt ON vt.id = fv.vehicle_type_id
        LEFT JOIN fleet_vehicle_brand vb ON vb.id = fv.vehicle_brand_id
        WHERE fip.id = ${safeId}
          AND fip.company_id = ${safeCompanyId}
          AND fip.enabled = true
        LIMIT 1
      `;
      return firstRow(rows);
    });

    if (!row)
      throw new FleetServiceError("Poliza de seguro no encontrada.", 404);
    return row;
  }

  async function updatePolicy({ companyId, actorId, id, data }) {
    const safeCompanyId = toScopedCompanyUuid(companyId);
    const safeId = normalizeRecordId(id, "Poliza de seguro no encontrada.");
    const payload = normalizeInsurancePolicyPayload(data);

    const hasVehicleId =
      hasOwn(payload, "vehicle_id") && payload.vehicle_id !== undefined;
    const hasInsurerName =
      hasOwn(payload, "insurer_name") && payload.insurer_name !== undefined;
    const hasPolicyNumber =
      hasOwn(payload, "policy_number") && payload.policy_number !== undefined;
    const hasCoverageType =
      hasOwn(payload, "coverage_type") && payload.coverage_type !== undefined;
    const hasStartDate =
      hasOwn(payload, "start_date") && payload.start_date !== undefined;
    const hasExpiryDate =
      hasOwn(payload, "expiry_date") && payload.expiry_date !== undefined;
    const hasPremium =
      hasOwn(payload, "premium") && payload.premium !== undefined;
    const hasCurrency =
      hasOwn(payload, "currency") && payload.currency !== undefined;
    const hasNotes = hasOwn(payload, "notes") && payload.notes !== undefined;
    const hasDocumentAssetId =
      hasOwn(payload, "document_asset_id") &&
      payload.document_asset_id !== undefined;

    const hasAnyUpdate =
      hasVehicleId ||
      hasInsurerName ||
      hasPolicyNumber ||
      hasCoverageType ||
      hasStartDate ||
      hasExpiryDate ||
      hasPremium ||
      hasCurrency ||
      hasNotes ||
      hasDocumentAssetId;

    if (!hasAnyUpdate) {
      throw new FleetServiceError(
        "No hay campos validos para actualizar.",
        400,
      );
    }

    const before = await getPolicy({ companyId: safeCompanyId, id: safeId });

    try {
      const updated = await withDbErrorMapping(async () => {
        const rows = await prisma.$queryRaw`
          UPDATE fleet_insurance_policy
          SET vehicle_id = CASE WHEN ${hasVehicleId} THEN ${payload.vehicle_id ?? null} ELSE vehicle_id END,
              insurer_name = CASE WHEN ${hasInsurerName} THEN ${payload.insurer_name ?? null} ELSE insurer_name END,
              policy_number = CASE WHEN ${hasPolicyNumber} THEN ${payload.policy_number ?? null} ELSE policy_number END,
              coverage_type = CASE WHEN ${hasCoverageType} THEN ${payload.coverage_type ?? null} ELSE coverage_type END,
              start_date = CASE WHEN ${hasStartDate} THEN ${payload.start_date ?? null} ELSE start_date END,
              expiry_date = CASE WHEN ${hasExpiryDate} THEN ${payload.expiry_date ?? null} ELSE expiry_date END,
              premium = CASE WHEN ${hasPremium} THEN ${payload.premium ?? null} ELSE premium END,
              currency = CASE WHEN ${hasCurrency} THEN ${payload.currency ?? null} ELSE currency END,
              notes = CASE WHEN ${hasNotes} THEN ${payload.notes ?? null} ELSE notes END,
              document_asset_id = CASE WHEN ${hasDocumentAssetId} THEN ${payload.document_asset_id ?? null} ELSE document_asset_id END,
              updated_at = now()
          WHERE id = ${safeId}
            AND company_id = ${safeCompanyId}
            AND enabled = true
          RETURNING *
        `;
        return firstRow(rows);
      });

      if (!updated)
        throw new FleetServiceError("Poliza de seguro no encontrada.", 404);

      const after = await getPolicy({ companyId: safeCompanyId, id: safeId });

      await logAudit({
        companyId: safeCompanyId,
        actorId,
        entityType: "InsurancePolicy",
        entityId: updated.id,
        action: "fleet.insurance.update",
        before,
        after,
      });

      return after;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new FleetServiceError(
          "Ya existe una poliza con ese numero para esta empresa.",
          409,
        );
      }
      throw error;
    }
  }

  async function disablePolicy({ companyId, actorId, id }) {
    const safeCompanyId = toScopedCompanyUuid(companyId);
    const safeId = normalizeRecordId(id, "Poliza de seguro no encontrada.");

    const before = await getPolicy({ companyId: safeCompanyId, id: safeId });

    const updated = await withDbErrorMapping(async () => {
      const rows = await prisma.$queryRaw`
        UPDATE fleet_insurance_policy
        SET enabled = false,
            updated_at = now()
        WHERE id = ${safeId}
          AND company_id = ${safeCompanyId}
          AND enabled = true
        RETURNING *
      `;
      return firstRow(rows);
    });

    if (!updated)
      throw new FleetServiceError("Poliza de seguro no encontrada.", 404);

    await logAudit({
      companyId: safeCompanyId,
      actorId,
      entityType: "InsurancePolicy",
      entityId: updated.id,
      action: "fleet.insurance.disable",
      before,
      after: updated,
    });

    return updated;
  }

  async function listVehiclePolicies({ companyId, vehicleId }) {
    const safeCompanyId = toScopedCompanyUuid(companyId);
    const safeVehicleId = normalizeRecordId(
      vehicleId,
      "Vehiculo no encontrado.",
    );

    // intentionally includes disabled policies — full history for the vehicle relation-list
    const rows = await withDbErrorMapping(
      () => prisma.$queryRaw`
      SELECT fip.*,
        fv.plate AS vehicle_plate,
        CONCAT(fip.insurer_name, ' - ', fip.policy_number) AS name,
        CASE
          WHEN fip.enabled = false THEN 'disabled'
          WHEN fip.expiry_date::date < CURRENT_DATE THEN 'expired'
          ELSE 'active'
        END AS status,
        CASE fip.coverage_type
          WHEN 'basic' THEN 'Basica'
          WHEN 'comprehensive' THEN 'Integral'
          WHEN 'third_party' THEN 'Terceros'
          WHEN 'other' THEN 'Otro'
          ELSE fip.coverage_type
        END AS coverage_type_label
      FROM fleet_insurance_policy fip
      LEFT JOIN fleet_vehicle fv ON fv.id = fip.vehicle_id AND fv.company_id = fip.company_id
      WHERE fip.vehicle_id = ${safeVehicleId}::uuid
        AND fip.company_id = ${safeCompanyId}
      ORDER BY fip.expiry_date DESC
    `,
    );

    return { data: rows };
  }

  async function getActivePolicyForVehicle({ companyId, vehicleId }) {
    const safeCompanyId = toScopedCompanyUuid(companyId);
    const safeVehicleId = normalizeRecordId(
      vehicleId,
      "Vehiculo no encontrado.",
    );

    const row = await withDbErrorMapping(async () => {
      const rows = await prisma.$queryRaw`
        SELECT fip.*,
          fv.plate AS vehicle_plate,
          CONCAT(fip.insurer_name, ' - ', fip.policy_number) AS name,
          'active' AS status,
          CASE fip.coverage_type
            WHEN 'basic' THEN 'Basica'
            WHEN 'comprehensive' THEN 'Integral'
            WHEN 'third_party' THEN 'Terceros'
            WHEN 'other' THEN 'Otro'
            ELSE fip.coverage_type
          END AS coverage_type_label
        FROM fleet_insurance_policy fip
        LEFT JOIN fleet_vehicle fv ON fv.id = fip.vehicle_id AND fv.company_id = fip.company_id
        WHERE fip.vehicle_id = ${safeVehicleId}::uuid
          AND fip.company_id = ${safeCompanyId}
          AND fip.enabled = true
          AND fip.expiry_date::date >= CURRENT_DATE
        ORDER BY fip.start_date DESC
        LIMIT 1
      `;
      return firstRow(rows);
    });

    return row ?? null;
  }

  return {
    listPolicies,
    createPolicy,
    getPolicy,
    updatePolicy,
    disablePolicy,
    listVehiclePolicies,
    getActivePolicyForVehicle,
  };
}
