import assert from "node:assert/strict";
import { test } from "node:test";

import { createHrEmployeeDocumentKind } from "../kinds/hr-employee-kind.js";
import { createKindRegistry } from "../kinds/kind-registry.js";
import { kindLabels } from "../document-template-files.js";

const COMPANY = "11111111-1111-7111-8111-111111111111";
const SOURCE = "22222222-2222-7222-8222-222222222222";

function setup(row) {
  let query = null;
  const prisma = { hrEmployee: { findFirst: async (args) => { query = args; return row; } } };
  const kinds = createKindRegistry();
  kinds.register(createHrEmployeeDocumentKind({ prisma }));
  return { kinds, query: () => query };
}

test("hr.employee requires hr.employee.read to load", async () => {
  const { kinds } = setup({});
  await assert.rejects(kinds.load({ sourceType: "hr.employee", companyId: COMPANY, sourceId: SOURCE, permissionKeys: [], isAdmin: false }), (e) => e.code === "source_permission_denied");
});

test("hr.employee schema is labeled and its vocabulary points at schema tags", () => {
  const kind = createHrEmployeeDocumentKind({ prisma: {} });
  const tags = new Set(kind.schema.map((e) => e.tag));
  assert.ok(kind.schema.every((e) => e.label && e.type));
  assert.ok(Object.values(kind.labels).every((tag) => tags.has(tag)));
  assert.equal(kindLabels(kind).get("puesto"), "jobTitle");
  assert.equal(kind.moduleKey, "runly.hr");
});

test("hr.employee loads a company-scoped employee with names resolved", async () => {
  const hireDate = new Date("2024-01-15");
  const { kinds, query } = setup({
    firstName: "Ana", lastName: "Pérez", employeeCode: "E-1", workEmail: null, jobTitle: "Texto", department: "Texto",
    departmentRef: { name: "Operaciones" }, jobTitleRef: { name: "Analista" }, supervisor: { firstName: "Luis", lastName: "Gómez" },
    hireDate, status: "active",
  });
  const data = await kinds.load({ sourceType: "hr.employee", companyId: COMPANY, sourceId: SOURCE, permissionKeys: ["hr.employee.read"], isAdmin: false });
  assert.deepEqual(query().where, { id: SOURCE, companyId: COMPANY, enabled: true });
  assert.equal(data.employeeName, "Ana Pérez");
  assert.equal(data.jobTitle, "Analista");
  assert.equal(data.department, "Operaciones");
  assert.equal(data.supervisorName, "Luis Gómez");
  assert.equal(data.workEmail, "");
  assert.equal(data.hireDate, hireDate);
});

test("hr.employee reports a missing employee", async () => {
  const { kinds } = setup(null);
  await assert.rejects(kinds.load({ sourceType: "hr.employee", companyId: COMPANY, sourceId: SOURCE, permissionKeys: [], isAdmin: true }), (e) => e.code === "source_not_found");
});
