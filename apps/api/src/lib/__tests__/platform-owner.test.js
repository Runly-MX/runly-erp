import test from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import {
  PLATFORM_OWNER_KEY,
  OWNER_REMOVAL_ERROR,
  checkOwnerRemoval,
  createRequireInstanceAdmin,
  getPlatformOwner,
  guardOwnerRemoval,
  isInstanceAdminAllowed,
  transferPlatformOwner,
  validateOwnerTransfer,
} from "../platform-owner.js";

const OWNER = "01a00000-0000-7000-8000-000000000001";
const OTHER = "01a00000-0000-7000-8000-000000000002";

function fakePrisma({ ownerId = OWNER, companies = 2, profiles = {}, memberships = {} } = {}) {
  const writes = [];
  return {
    writes,
    instanceConfig: {
      findUnique: async ({ where }) => (where.key === PLATFORM_OWNER_KEY && ownerId ? { value: ownerId } : null),
      upsert: (args) => { writes.push(["upsert", args]); return args; },
    },
    company: { count: async () => companies },
    userProfile: { findUnique: async ({ where }) => profiles[where.id] ?? null },
    membership: { count: async ({ where }) => (typeof memberships[where.userId] === "function" ? memberships[where.userId](where) : memberships[where.userId] ?? 0) },
    auditLog: { create: (args) => { writes.push(["audit", args]); return args; } },
    $transaction: async (ops) => ops,
  };
}

test("instance gate: owner always, single-company admin yes, multi-company admin no", () => {
  assert.equal(isInstanceAdminAllowed({ tenant: { isPlatformOwner: true }, enabledCompanyCount: 4 }), true);
  assert.equal(isInstanceAdminAllowed({ tenant: { isCompanyAdmin: true, companyId: "c1" }, enabledCompanyCount: 1 }), true);
  assert.equal(isInstanceAdminAllowed({ tenant: { isCompanyAdmin: true, isAdmin: true, companyId: "c1" }, enabledCompanyCount: 2 }), false);
  assert.equal(isInstanceAdminAllowed({ tenant: { isCompanyAdmin: false, companyId: "c1" }, enabledCompanyCount: 1 }), false);
});

test("createRequireInstanceAdmin returns 403 for a multi-company admin who is not the owner", async () => {
  const app = new Hono();
  let tenant = { isCompanyAdmin: true, isAdmin: true, companyId: "c1", isPlatformOwner: false };
  app.use("*", async (c, next) => { c.set("tenantContext", tenant); await next(); });
  app.put("/x", createRequireInstanceAdmin({ prisma: fakePrisma({ companies: 3 }) }), (c) => c.json({ ok: true }));
  assert.equal((await app.request("/x", { method: "PUT" })).status, 403);
  tenant = { ...tenant, isPlatformOwner: true };
  assert.equal((await app.request("/x", { method: "PUT" })).status, 200);
});

test("validateOwnerTransfer rejects non-owner, self, bots, disabled and member-less targets", () => {
  const target = { id: OTHER, enabled: true, isBot: false, hasEnabledMembership: true };
  assert.equal(validateOwnerTransfer({ isOwner: false, actorId: OWNER, target }).status, 403);
  assert.equal(validateOwnerTransfer({ isOwner: true, actorId: OWNER, target: null }).status, 404);
  assert.equal(validateOwnerTransfer({ isOwner: true, actorId: OWNER, target: { ...target, id: OWNER } }).ok, false);
  assert.equal(validateOwnerTransfer({ isOwner: true, actorId: OWNER, target: { ...target, isBot: true } }).ok, false);
  assert.equal(validateOwnerTransfer({ isOwner: true, actorId: OWNER, target: { ...target, enabled: false } }).ok, false);
  assert.equal(validateOwnerTransfer({ isOwner: true, actorId: OWNER, target: { ...target, hasEnabledMembership: false } }).ok, false);
  assert.equal(validateOwnerTransfer({ isOwner: true, actorId: OWNER, target }).ok, true);
});

test("transferPlatformOwner writes the key and an audit entry", async () => {
  const prisma = fakePrisma({
    profiles: { [OTHER]: { id: OTHER, displayName: "Ana", email: "ana@example.com", enabled: true, isBot: false } },
    memberships: { [OTHER]: 1 },
  });
  const result = await transferPlatformOwner(prisma, { actorProfileId: OWNER, targetProfileId: OTHER });
  assert.equal(result.ok, true);
  assert.equal(result.owner.id, OTHER);
  const upsert = prisma.writes.find(([kind]) => kind === "upsert")[1];
  assert.equal(upsert.update.value, OTHER);
  const audit = prisma.writes.find(([kind]) => kind === "audit")[1];
  assert.equal(audit.data.action, "platform.owner.transferred");
  assert.deepEqual(audit.data.before, { ownerProfileId: OWNER });
});

test("transferPlatformOwner refuses a caller who is not the owner", async () => {
  const prisma = fakePrisma();
  const result = await transferPlatformOwner(prisma, { actorProfileId: OTHER, targetProfileId: OTHER });
  assert.equal(result.status, 403);
  assert.equal(prisma.writes.length, 0);
});

test("getPlatformOwner resolves owner, isOwner and multiCompany", async () => {
  const prisma = fakePrisma({ companies: 1, profiles: { [OWNER]: { id: OWNER, displayName: "Raul", email: "r@example.com" } } });
  const data = await getPlatformOwner(prisma, { actorProfileId: OWNER });
  assert.deepEqual(data, { owner: { id: OWNER, displayName: "Raul", email: "r@example.com" }, isOwner: true, multiCompany: false });
  assert.equal((await getPlatformOwner(fakePrisma({ ownerId: null }), { actorProfileId: OWNER })).owner, null);
});

test("owner removal: account always blocked, last membership blocked, others allowed", async () => {
  assert.equal(checkOwnerRemoval({ ownerId: OWNER, targetUserIds: [OTHER], account: true }).ok, true);
  assert.equal(checkOwnerRemoval({ ownerId: OWNER, targetUserIds: [OWNER], account: true }).status, 409);
  assert.equal(checkOwnerRemoval({ ownerId: OWNER, targetUserIds: [OWNER], remainingEnabledMemberships: 0 }).error, OWNER_REMOVAL_ERROR);
  assert.equal(checkOwnerRemoval({ ownerId: OWNER, targetUserIds: [OWNER], remainingEnabledMemberships: 2 }).ok, true);

  const prisma = fakePrisma({ memberships: { [OWNER]: (where) => (where.companyId ? 0 : 2) } });
  assert.equal((await guardOwnerRemoval(prisma, { userIds: [OWNER], companyId: "c1" }))?.status, 409);
  assert.equal(await guardOwnerRemoval(prisma, { userIds: [OWNER], membershipId: "m1" }), null);
  assert.equal(await guardOwnerRemoval(prisma, { userIds: [OTHER], account: true }), null);
});
