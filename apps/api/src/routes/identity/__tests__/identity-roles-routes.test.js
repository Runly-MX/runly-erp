import test from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { createIdentityRolesRouter } from "../identity-roles-routes.js";

function fixture(tenant) {
  const queries = [];
  const roles = [
    { id: "shared", companyId: null, key: "member" },
    { id: "a", companyId: "company-a", key: "sales" },
    { id: "b", companyId: "company-b", key: "sales" },
    { id: "system", companyId: null, key: "system.admin" },
  ];
  const prisma = { role: { findMany: async (query) => {
    queries.push(query);
    return roles
      .filter((role) => !query.where.OR || query.where.OR.some((scope) => scope.companyId === role.companyId))
      .filter((role) => !query.where.key || role.key !== query.where.key.not)
      .map((role) => ({ ...role, permissions: [], _count: { memberships: 0 } }));
  } } };
  const app = new Hono();
  app.use("*", async (c, next) => { c.set("tenantContext", tenant); await next(); });
  app.route("/", createIdentityRolesRouter({ prisma, requirePermission: () => async (_c, next) => next() }));
  return { app, queries };
}

for (const actor of [
  { permissionSet: new Set() },
  { isAdmin: true, permissionSet: new Set(["identity.users.update"]) },
  { isAdmin: true, isSystemAdmin: true },
]) {
  test(`role catalog stays in the active company for ${actor.isSystemAdmin ? "system admin" : actor.isAdmin ? "user manager" : "reader"}`, async () => {
    const { app, queries } = fixture({ ...actor, companyId: "company-a" });
    const response = await app.request("/identity/roles");
    assert.equal(response.status, 200);
    const { data } = await response.json();
    assert.ok(data.some((role) => role.id === "a"));
    assert.ok(data.some((role) => role.id === "shared"));
    assert.ok(!data.some((role) => role.id === "b"));
    assert.equal(data.some((role) => role.id === "system"), Boolean(actor.isAdmin));
    assert.equal(queries[0].include._count.select.memberships.where.companyId, "company-a");
  });
}

test("switching companies changes the custom role catalog", async () => {
  const { app } = fixture({ companyId: "company-b" });
  const { data } = await (await app.request("/identity/roles")).json();
  assert.deepEqual(data.map((role) => role.id), ["shared", "b"]);
});

test("missing active company does not expose company roles or member counts", async () => {
  const { app, queries } = fixture({ isAdmin: true, isSystemAdmin: true });
  const { data } = await (await app.request("/identity/roles")).json();
  assert.deepEqual(data.map((role) => role.id), ["shared", "system"]);
  assert.deepEqual(queries[0].include._count.select.memberships.where.companyId, { in: [] });
});

test("cross-company membership picker requires explicit scope and user management access", async () => {
  for (const actor of [{ permissionSet: new Set(["identity.users.update"]) }, { isSystemAdmin: true }]) {
    const { app } = fixture({ ...actor, companyId: "company-a" });
    const response = await app.request("/identity/roles?scope=memberships");
    assert.equal(response.status, 200);
    const { data } = await response.json();
    assert.ok(data.some((role) => role.id === "a"));
    assert.ok(data.some((role) => role.id === "b"));
  }
  const { app, queries } = fixture({ companyId: "company-a", permissionSet: new Set() });
  assert.equal((await app.request("/identity/roles?scope=memberships")).status, 403);
  assert.equal(queries.length, 0);
});
