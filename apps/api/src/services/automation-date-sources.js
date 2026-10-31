// Records whose date falls on a given day, for the "date of a record" trigger of
// company automations. Each source answers rows shaped like its catalog entry
// (packages/module-engine/src/date-sources.js). Spec
// docs/superpowers/specs/2026-10-31-automations-retries-loops-date-triggers-design.md §C.
import { MAX_DATE_RECORDS } from "@runly/module-engine/contracts";
import { addDays, localDate } from "./automation-schedule-math.js";

const pad = (value) => String(value).padStart(2, "0");
export const dayText = ({ year, month, day }) => `${year}-${pad(month)}-${pad(day)}`;
// A @db.Date column compares against midnight UTC of the day.
const asDate = (day) => new Date(`${dayText(day)}T00:00:00.000Z`);
const amount = (value) => (value === null || value === undefined ? null : Number(value));

// The day whose records are due when the trigger fires at `occurrence`: offset -3
// ("3 days before") looks for records dated three days ahead.
export function targetDay(occurrence, offsetDays, timeZone) {
  return addDays(localDate(new Date(occurrence).getTime(), timeZone), -offsetDays);
}

export function createAutomationDateSources({ prisma }) {
  const take = MAX_DATE_RECORDS;
  const QUERIES = {
    "purchases.invoice.due": async (companyId, day) => {
      const rows = await prisma.purchaseInvoice.findMany({ where: { companyId, dueDate: asDate(day), status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] } }, orderBy: { id: "asc" }, take });
      return rows.map((row) => ({
        id: row.id, number: row.number, supplierId: row.supplierId, status: row.status, total: amount(row.total),
        balance: row.total === null ? null : amount(row.total) - (amount(row.paidAmount) ?? 0), currency: row.currency, dueDate: dayText(day),
      }));
    },
    "purchases.order.expected": async (companyId, day) => {
      const rows = await prisma.purchaseOrder.findMany({ where: { companyId, expectedDate: asDate(day), status: { in: ["APPROVED", "ISSUED", "PARTIALLY_RECEIVED"] } }, orderBy: { id: "asc" }, take });
      return rows.map((row) => ({ id: row.id, number: row.number, supplierId: row.supplierId, status: row.status, total: amount(row.total), currency: row.currency, expectedDate: dayText(day) }));
    },
    // Due dates are picked as calendar days and kept at midnight UTC.
    "projects.task.due": async (companyId, day) => {
      const rows = await prisma.task.findMany({
        where: { dueDate: { gte: asDate(day), lt: asDate(addDays(day, 1)) }, status: { isDone: false }, project: { companyId } },
        orderBy: { id: "asc" }, take,
        select: { id: true, projectId: true, title: true, assigneeId: true, priority: true },
      });
      return rows.map((row) => ({ ...row, dueDate: dayText(day) }));
    },
    "fleet.insurance.expiry": async (companyId, day) => {
      const rows = await prisma.fleetInsurancePolicy.findMany({ where: { companyId, enabled: true, expiryDate: asDate(day) }, orderBy: { id: "asc" }, take });
      return rows.map((row) => ({ id: row.id, vehicleId: row.vehicleId, insurer: row.insurerName, policyNumber: row.policyNumber, expiryDate: dayText(day) }));
    },
    // Every year on the day they joined (a 29 February hire only counts on leap years).
    "hr.employee.anniversary": async (companyId, day) => {
      const ids = await prisma.$queryRaw`
        SELECT id FROM hr_employee
        WHERE company_id = ${companyId}::uuid AND enabled = true AND status = 'active' AND hire_date IS NOT NULL
          AND to_char(hire_date, 'MM-DD') = ${`${pad(day.month)}-${pad(day.day)}`} AND hire_date < ${asDate(day)}
        ORDER BY id LIMIT ${take}`;
      if (!ids.length) return [];
      const rows = await prisma.hrEmployee.findMany({ where: { id: { in: ids.map((row) => row.id) } }, orderBy: { id: "asc" } });
      return rows.map((row) => ({
        id: row.id, firstName: row.firstName, lastName: row.lastName, jobTitle: row.jobTitle ?? null, department: row.department ?? null,
        hireDate: dayText({ year: row.hireDate.getUTCFullYear(), month: row.hireDate.getUTCMonth() + 1, day: row.hireDate.getUTCDate() }), years: day.year - row.hireDate.getUTCFullYear(), userProfileId: row.userProfileId ?? null,
      }));
    },
  };

  async function records(source, { companyId, day }) {
    const query = QUERIES[source];
    if (!query) throw new Error(`Fecha desconocida: ${source}`);
    return query(companyId, day);
  }

  return { records };
}
