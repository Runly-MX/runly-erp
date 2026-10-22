// Aggregates for the Flota landing page: status mix, insurance and licence
// expirations, upcoming maintenance, spend and a ranked list of rule-based
// insights ("alertas inteligentes"). Pure reads, scoped to one company.
import { isTableNotFoundError } from "./service-helpers.js";

const SOON_DAYS = 30;
const SERVICE_SOON_DAYS = 14;
const RECURRENT_FAILURES = 3;
const MONEY_ANOMALY_FACTOR = 1.5;
const MONEY_ANOMALY_MIN = 2000;

const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const money = (n) => Math.round(n).toLocaleString("es-MX");

// The reports tables are created lazily; a company with none has no data yet.
async function safe(query, fallback) {
  try {
    return await query;
  } catch (err) {
    if (isTableNotFoundError(err)) return fallback;
    throw err;
  }
}

export function buildInsights(d) {
  const out = [];
  const vehicleHref = (id) => `/app/m/runly.fleet/vehicles/${id}`;

  const overdue = d.maintenanceDue.filter((m) => m.daysLeft < 0);
  const soon = d.maintenanceDue.filter((m) => m.daysLeft >= 0 && m.daysLeft <= SERVICE_SOON_DAYS);
  if (overdue.length) {
    out.push({
      id: "service-overdue", severity: "critical", icon: "Wrench",
      title: plural(overdue.length, "vehiculo con mantenimiento vencido", "vehiculos con mantenimiento vencido"),
      detail: overdue.slice(0, 3).map((m) => `${m.plate} (${Math.abs(m.daysLeft)} d de retraso)`).join(", "),
      href: vehicleHref(overdue[0].vehicleId),
    });
  }
  if (soon.length) {
    out.push({
      id: "service-soon", severity: "warning", icon: "CalendarClock",
      title: `${plural(soon.length, "mantenimiento proximo", "mantenimientos proximos")} (${SERVICE_SOON_DAYS} dias)`,
      detail: soon.slice(0, 3).map((m) => `${m.plate} en ${m.daysLeft} d`).join(", "),
      href: vehicleHref(soon[0].vehicleId),
    });
  }
  for (const v of d.recurrentFailures) {
    out.push({
      id: `failures-${v.vehicleId}`, severity: "warning", icon: "TriangleAlert",
      title: `${v.plate}: ${v.failures} reparaciones en 90 dias`,
      detail: "Fallas recurrentes. Conviene un diagnostico completo o evaluar si compensa seguir reparandolo.",
      href: vehicleHref(v.vehicleId),
    });
  }
  if (d.costTrend.recent > MONEY_ANOMALY_MIN && d.costTrend.baseline > 0
    && d.costTrend.recent > d.costTrend.baseline * MONEY_ANOMALY_FACTOR) {
    out.push({
      id: "cost-spike", severity: "warning", icon: "TrendingUp",
      title: "El gasto en mantenimiento subio",
      detail: `Ultimos 30 dias: ${money(d.costTrend.recent)} contra un promedio mensual de ${money(d.costTrend.baseline)}.`,
      href: "/app/m/runly.fleet/reports/maintenance",
    });
  }
  if (d.insurance.expired) {
    out.push({
      id: "insurance-expired", severity: "critical", icon: "ShieldAlert",
      title: plural(d.insurance.expired, "poliza vencida", "polizas vencidas"),
      detail: "Esas unidades circulan sin cobertura vigente.",
      href: "/app/m/runly.fleet/insurance",
    });
  }
  if (d.insurance.expiringSoon) {
    out.push({
      id: "insurance-soon", severity: "warning", icon: "ShieldCheck",
      title: `${plural(d.insurance.expiringSoon, "poliza vence", "polizas vencen")} en ${SOON_DAYS} dias`,
      detail: d.insurance.upcoming.filter((p) => p.daysLeft >= 0).slice(0, 3).map((p) => `${p.plate} (${p.daysLeft} d)`).join(", "),
      href: "/app/m/runly.fleet/insurance",
    });
  }
  if (d.insurance.uncovered) {
    out.push({
      id: "insurance-none", severity: "warning", icon: "ShieldOff",
      title: plural(d.insurance.uncovered, "vehiculo sin poliza", "vehiculos sin poliza"),
      detail: "Registra una poliza para incluirlos en el seguimiento de vencimientos.",
      href: "/app/m/runly.fleet/vehicles",
    });
  }
  if (d.licenses.expired) {
    out.push({
      id: "license-expired", severity: "critical", icon: "IdCard",
      title: plural(d.licenses.expired, "licencia vencida", "licencias vencidas"),
      detail: d.licenses.upcoming.filter((l) => l.daysLeft < 0).slice(0, 3).map((l) => l.name).join(", "),
      href: "/app/m/runly.fleet/drivers",
    });
  }
  if (d.licenses.expiringSoon) {
    out.push({
      id: "license-soon", severity: "warning", icon: "IdCard",
      title: `${plural(d.licenses.expiringSoon, "licencia vence", "licencias vencen")} en ${SOON_DAYS} dias`,
      detail: d.licenses.upcoming.filter((l) => l.daysLeft >= 0).slice(0, 3).map((l) => `${l.name} (${l.daysLeft} d)`).join(", "),
      href: "/app/m/runly.fleet/drivers",
    });
  }
  if (d.assignment.vehiclesWithoutDriver) {
    out.push({
      id: "no-driver", severity: "info", icon: "UserX",
      title: plural(d.assignment.vehiclesWithoutDriver, "vehiculo activo sin chofer", "vehiculos activos sin chofer"),
      detail: "Asigna un chofer desde la ficha del vehiculo.",
      href: "/app/m/runly.fleet/vehicles",
    });
  }
  if (d.totals.maintenance) {
    out.push({
      id: "in-shop", severity: "info", icon: "Wrench",
      title: `${plural(d.totals.maintenance, "unidad", "unidades")} en mantenimiento ahora`,
      detail: "Cuando regresen, cambia su estado a activo para que cuenten como disponibles.",
      href: "/app/m/runly.fleet/vehicles",
    });
  }
  if (!out.length) {
    out.push({
      id: "all-good", severity: "info", icon: "CircleCheck",
      title: "Todo en orden",
      detail: "No hay vencimientos ni fallas recurrentes que requieran atencion.",
      href: null,
    });
  }
  return out.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

export function createFleetDashboardService({ prisma }) {
  async function getDashboard({ companyId, months = 12 }) {
    const span = Math.min(24, Math.max(3, Number(months) || 12));

    const [statusRows, typeRows, vehicleFlags, driverRows] = await Promise.all([
      prisma.$queryRaw`
        SELECT status, COUNT(*)::int AS count FROM fleet_vehicle
        WHERE company_id = ${companyId}::uuid AND enabled = true GROUP BY status`,
      prisma.$queryRaw`
        SELECT COALESCE(vt_m.name, vt.name, 'Sin tipo') AS name, COUNT(*)::int AS count
        FROM fleet_vehicle fv
        LEFT JOIN fleet_vehicle_model vm ON vm.id = fv.vehicle_model_id
        LEFT JOIN fleet_vehicle_type vt_m ON vt_m.id = vm.type_id
        LEFT JOIN fleet_vehicle_type vt ON vt.id = fv.vehicle_type_id
        WHERE fv.company_id = ${companyId}::uuid AND fv.enabled = true
        GROUP BY 1 ORDER BY count DESC LIMIT 8`,
      prisma.$queryRaw`
        SELECT COUNT(*) FILTER (WHERE is_financed)::int AS financed,
               COUNT(*) FILTER (WHERE status = 'active' AND driver_id IS NULL)::int AS "withoutDriver"
        FROM fleet_vehicle WHERE company_id = ${companyId}::uuid AND enabled = true`,
      prisma.$queryRaw`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE fd.status = 'active')::int AS active,
               COUNT(*) FILTER (WHERE fd.status = 'active' AND NOT EXISTS (
                 SELECT 1 FROM fleet_vehicle fv WHERE fv.driver_id = fd.id AND fv.enabled = true)
               )::int AS "withoutVehicle"
        FROM fleet_driver fd WHERE fd.company_id = ${companyId}::uuid AND fd.enabled = true`,
    ]);

    const [insuranceRows, uncoveredRows, licenseRows] = await Promise.all([
      prisma.$queryRaw`
        SELECT fv.id::text AS "vehicleId", fv.plate, fip.insurer_name AS insurer,
               fip.expiry_date::text AS "expiryDate", (fip.expiry_date::date - CURRENT_DATE)::int AS "daysLeft"
        FROM fleet_insurance_policy fip
        JOIN fleet_vehicle fv ON fv.id = fip.vehicle_id AND fv.company_id = fip.company_id AND fv.enabled = true
        WHERE fip.company_id = ${companyId}::uuid AND fip.enabled = true
          AND fip.expiry_date::date <= CURRENT_DATE + ${SOON_DAYS}::int
          AND NOT EXISTS (
            SELECT 1 FROM fleet_insurance_policy newer
            WHERE newer.vehicle_id = fip.vehicle_id AND newer.enabled = true
              AND newer.expiry_date::date > fip.expiry_date::date)
        ORDER BY fip.expiry_date ASC LIMIT 12`,
      prisma.$queryRaw`
        SELECT COUNT(*)::int AS count FROM fleet_vehicle fv
        WHERE fv.company_id = ${companyId}::uuid AND fv.enabled = true AND fv.status <> 'retired'
          AND NOT EXISTS (SELECT 1 FROM fleet_insurance_policy p
            WHERE p.vehicle_id = fv.id AND p.enabled = true)`,
      prisma.$queryRaw`
        SELECT id::text AS "driverId", (first_name || ' ' || last_name) AS name,
               license_expiry_date::text AS "expiryDate",
               (license_expiry_date::date - CURRENT_DATE)::int AS "daysLeft"
        FROM fleet_driver
        WHERE company_id = ${companyId}::uuid AND enabled = true AND status = 'active'
          AND license_expiry_date::date <= CURRENT_DATE + ${SOON_DAYS}::int
        ORDER BY license_expiry_date ASC LIMIT 12`,
    ]);

    const [monthlyRows, typeCostRows, dueRows, failureRows, topCostRows, trendRows, openRows] = await Promise.all([
      safe(prisma.$queryRaw`
        SELECT to_char(date_trunc('month', report_date), 'YYYY-MM') AS month,
               COUNT(*)::int AS count, COALESCE(SUM(total_cost), 0)::float AS cost
        FROM fleet_report
        WHERE company_id = ${companyId}::uuid AND enabled = true
          AND report_date >= date_trunc('month', CURRENT_DATE) - make_interval(months => ${span - 1}::int)
        GROUP BY 1 ORDER BY 1`, []),
      safe(prisma.$queryRaw`
        SELECT report_type AS type, COUNT(*)::int AS count, COALESCE(SUM(total_cost), 0)::float AS cost
        FROM fleet_report
        WHERE company_id = ${companyId}::uuid AND enabled = true
          AND report_date >= CURRENT_DATE - make_interval(months => ${span}::int)
        GROUP BY 1 ORDER BY count DESC`, []),
      safe(prisma.$queryRaw`
        SELECT * FROM (
          SELECT DISTINCT ON (r.vehicle_id) r.id::text AS "reportId", r.vehicle_id::text AS "vehicleId",
                 fv.plate, r.report_type AS type, r.next_service_date::text AS "nextServiceDate",
                 (r.next_service_date::date - CURRENT_DATE)::int AS "daysLeft"
          FROM fleet_report r
          JOIN fleet_vehicle fv ON fv.id = r.vehicle_id AND fv.company_id = r.company_id AND fv.enabled = true
          WHERE r.company_id = ${companyId}::uuid AND r.enabled = true AND r.next_service_date IS NOT NULL
            AND fv.status <> 'retired'
          ORDER BY r.vehicle_id, r.report_date DESC, r.created_at DESC
        ) latest
        WHERE "daysLeft" <= 45 ORDER BY "daysLeft" ASC LIMIT 12`, []),
      safe(prisma.$queryRaw`
        SELECT r.vehicle_id::text AS "vehicleId", fv.plate, COUNT(*)::int AS failures
        FROM fleet_report r
        JOIN fleet_vehicle fv ON fv.id = r.vehicle_id AND fv.company_id = r.company_id AND fv.enabled = true
        WHERE r.company_id = ${companyId}::uuid AND r.enabled = true AND r.report_type = 'repair'
          AND r.report_date >= CURRENT_DATE - 90
        GROUP BY 1, 2 HAVING COUNT(*) >= ${RECURRENT_FAILURES}::int
        ORDER BY failures DESC LIMIT 3`, []),
      safe(prisma.$queryRaw`
        SELECT r.vehicle_id::text AS "vehicleId", fv.plate, COUNT(*)::int AS reports,
               COALESCE(SUM(r.total_cost), 0)::float AS cost
        FROM fleet_report r
        JOIN fleet_vehicle fv ON fv.id = r.vehicle_id AND fv.company_id = r.company_id
        WHERE r.company_id = ${companyId}::uuid AND r.enabled = true
          AND r.report_date >= CURRENT_DATE - make_interval(months => ${span}::int)
        GROUP BY 1, 2 HAVING SUM(r.total_cost) > 0 ORDER BY cost DESC LIMIT 5`, []),
      safe(prisma.$queryRaw`
        SELECT COALESCE(SUM(total_cost) FILTER (WHERE report_date >= CURRENT_DATE - 30), 0)::float AS recent,
               (COALESCE(SUM(total_cost) FILTER (WHERE report_date < CURRENT_DATE - 30
                 AND report_date >= CURRENT_DATE - 120), 0) / 3)::float AS baseline
        FROM fleet_report WHERE company_id = ${companyId}::uuid AND enabled = true`, [{ recent: 0, baseline: 0 }]),
      safe(prisma.$queryRaw`
        SELECT COUNT(*) FILTER (WHERE status = 'draft')::int AS drafts,
               COUNT(*) FILTER (WHERE status = 'draft' AND report_type = 'repair')::int AS "openRepairs"
        FROM fleet_report WHERE company_id = ${companyId}::uuid AND enabled = true`, [{ drafts: 0, openRepairs: 0 }]),
    ]);

    const byStatus = Object.fromEntries(statusRows.map((r) => [r.status, r.count]));
    const vehiclesTotal = statusRows.reduce((sum, r) => sum + r.count, 0);
    const insuranceExpired = insuranceRows.filter((p) => p.daysLeft < 0).length;
    const licensesExpired = licenseRows.filter((l) => l.daysLeft < 0).length;

    const data = {
      totals: {
        vehicles: vehiclesTotal,
        active: byStatus.active ?? 0,
        maintenance: byStatus.maintenance ?? 0,
        inactive: byStatus.inactive ?? 0,
        retired: byStatus.retired ?? 0,
        financed: vehicleFlags[0]?.financed ?? 0,
        drivers: driverRows[0]?.total ?? 0,
        driversActive: driverRows[0]?.active ?? 0,
      },
      byType: typeRows,
      insurance: {
        expired: insuranceExpired,
        expiringSoon: insuranceRows.length - insuranceExpired,
        uncovered: uncoveredRows[0]?.count ?? 0,
        upcoming: insuranceRows,
      },
      licenses: {
        expired: licensesExpired,
        expiringSoon: licenseRows.length - licensesExpired,
        upcoming: licenseRows,
      },
      assignment: {
        vehiclesWithoutDriver: vehicleFlags[0]?.withoutDriver ?? 0,
        driversWithoutVehicle: driverRows[0]?.withoutVehicle ?? 0,
      },
      reports: {
        monthly: monthlyRows,
        byType: typeCostRows,
        drafts: openRows[0]?.drafts ?? 0,
        openRepairs: openRows[0]?.openRepairs ?? 0,
        totalCost: monthlyRows.reduce((sum, m) => sum + m.cost, 0),
      },
      maintenanceDue: dueRows,
      recurrentFailures: failureRows,
      topCostVehicles: topCostRows,
      costTrend: { recent: trendRows[0]?.recent ?? 0, baseline: trendRows[0]?.baseline ?? 0 },
    };
    return { ...data, insights: buildInsights(data) };
  }

  return { getDashboard };
}
