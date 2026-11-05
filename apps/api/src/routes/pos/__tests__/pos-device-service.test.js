import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPosDeviceService } from "../pos-device-service.js";

function makePrisma() {
  const links = new Map();
  const pins = [];
  const match = (row, where) => Object.entries(where).every(([k, v]) => (v && typeof v === "object" && !(v instanceof Date) ? (v.not ? row[k] !== v.not : true) : row[k] === v));
  return {
    auditLog: { create: async () => ({}) },
    posTerminal: { findFirst: async ({ where }) => (where.id === "t1" ? { id: "t1", name: "Caja 1", outletId: "o1", companyId: "c1" } : null) },
    company: { findUnique: async () => ({ name: "Lupita" }) },
    posDeviceLink: {
      create: async ({ data }) => { const row = { id: `l${links.size + 1}`, failedPinAttempts: 0, revokedAt: null, deviceTokenHash: null, pairedAt: null, ...data }; links.set(row.id, row); return row; },
      findUnique: async ({ where }) => [...links.values()].find((l) => l.linkToken === where.linkToken) ?? null,
      findFirst: async ({ where }) => [...links.values()].find((l) => l.id === where.id && l.companyId === where.companyId && (where.revokedAt === undefined || l.revokedAt === where.revokedAt)) ?? null,
      update: async ({ where, data }) => Object.assign(links.get(where.id), data),
    },
    posOperatorPin: {
      findFirst: async ({ where }) => pins.find((p) => match(p, where)) ?? null,
      upsert: async ({ create }) => { pins.push(create); return create; },
    },
    membership: {
      findFirst: async ({ where }) => (where.companyId === "c1" && where.userId === "u-ana" ? { user: { id: "u-ana", authUserId: "auth-ana", displayName: "Ana", firstName: "Ana" } } : null),
    },
  };
}

async function pairedDevice(svc) {
  const link = await svc.create({ companyId: "c1", actorId: "admin", data: { terminalId: "t1" } });
  const { code, pollSecret } = await svc.pair(link.linkToken, "Tablet mostrador");
  assert.equal((await svc.pairStatus(link.linkToken, pollSecret)).status, "pending");
  await assert.rejects(() => svc.approve({ companyId: "c1", actorId: "admin", id: link.id, code: "000000" }), (e) => e.status === 400);
  await svc.approve({ companyId: "c1", actorId: "admin", id: link.id, code });
  const paired = await svc.pairStatus(link.linkToken, pollSecret);
  assert.equal(paired.status, "paired");
  return { link, deviceToken: paired.deviceToken };
}

describe("POS device links", () => {
  it("pairs with an approved code, logs a cashier in by PIN and scopes the token", async () => {
    const svc = createPosDeviceService({ prisma: makePrisma(), secret: "test-secret" });
    const { link, deviceToken } = await pairedDevice(svc);
    await svc.setPin({ companyId: "c1", actorId: "admin", userId: "u-ana", pin: "4321" });

    await assert.rejects(() => svc.operatorLogin(link.linkToken, "wrong-device", "4321"), (e) => e.status === 401);
    const session = await svc.operatorLogin(link.linkToken, deviceToken, "4321");
    assert.equal(session.profile.displayName, "Ana");
    assert.equal(session.terminalId, "t1");

    const ok = await svc.verifyOperatorToken(session.operatorToken, { path: "/pos/v2/context", companyHeader: "c1" });
    assert.deepEqual(ok, { authUserId: "auth-ana", companyId: "c1" });
    assert.equal(await svc.verifyOperatorToken(session.operatorToken, { path: "/contacts", companyHeader: "c1" }), null);
    assert.equal(await svc.verifyOperatorToken(session.operatorToken, { path: "/pos/v2/context", companyHeader: "c2" }), null);
    assert.equal(await svc.verifyOperatorToken(`${session.operatorToken}x`, { path: "/pos/v2/context", companyHeader: "c1" }), null);

    await svc.reset({ companyId: "c1", actorId: "admin", id: link.id });
    assert.equal(await svc.verifyOperatorToken(session.operatorToken, { path: "/pos/v2/context", companyHeader: "c1" }), null);
  });

  it("locks the device after five wrong PINs", async () => {
    let clock = Date.parse("2026-11-04T12:00:00Z");
    const svc = createPosDeviceService({ prisma: makePrisma(), secret: "test-secret", now: () => clock });
    const { link, deviceToken } = await pairedDevice(svc);
    await svc.setPin({ companyId: "c1", actorId: "admin", userId: "u-ana", pin: "4321" });
    for (let i = 0; i < 5; i++) await assert.rejects(() => svc.operatorLogin(link.linkToken, deviceToken, "1111"), (e) => e.status === 401);
    await assert.rejects(() => svc.operatorLogin(link.linkToken, deviceToken, "4321"), (e) => e.status === 423);
    clock += 6 * 60_000;
    assert.ok((await svc.operatorLogin(link.linkToken, deviceToken, "4321")).operatorToken);
  });

  it("expires operator tokens", async () => {
    let clock = Date.parse("2026-11-04T12:00:00Z");
    const svc = createPosDeviceService({ prisma: makePrisma(), secret: "test-secret", now: () => clock });
    const { link, deviceToken } = await pairedDevice(svc);
    await svc.setPin({ companyId: "c1", actorId: "admin", userId: "u-ana", pin: "4321" });
    const { operatorToken } = await svc.operatorLogin(link.linkToken, deviceToken, "4321");
    clock += 13 * 60 * 60_000;
    assert.equal(await svc.verifyOperatorToken(operatorToken, { path: "/pos/v2/context", companyHeader: "c1" }), null);
  });
});
