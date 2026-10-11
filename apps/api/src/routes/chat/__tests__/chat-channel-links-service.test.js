import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createChatChannelLinksService } from "../chat-channel-links-service.js";

const CONV_ID = "01900000-0000-7000-8000-0000000000c1";
const OTHER_CONV_ID = "01900000-0000-7000-8000-0000000000c2";
const PROJECT_ID = "01900000-0000-7000-8000-0000000000pr";

function buildPrismaMock(queryRawResults = []) {
  let qIdx = 0;
  const calls = [];
  return {
    _queryRawCalls: calls,
    $queryRaw: async (strings, ...values) => {
      calls.push({ sql: strings.join("?"), values });
      if (qIdx >= queryRawResults.length) throw new Error(`Unexpected $queryRaw call #${qIdx + 1}`);
      return queryRawResults[qIdx++];
    },
  };
}

describe("chat-channel-links-service — listByLink", () => {
  const args = { linkedModule: "runly.projects", linkedEntityId: PROJECT_ID, companyId: "co-1", profileId: "p-1" };

  it("returns every visible channel and the oldest as primary when none is flagged", async () => {
    const rows = [
      { id: CONV_ID, is_public: true, is_member: false, link_primary: false },
      { id: OTHER_CONV_ID, is_public: false, is_member: true, link_primary: false },
    ];
    const prisma = buildPrismaMock([rows]);
    const svc = createChatChannelLinksService({ prisma });
    const result = await svc.listByLink(args);
    assert.deepEqual(result.channels.map((r) => r.id), [CONV_ID, OTHER_CONV_ID]);
    assert.equal(result.primaryId, CONV_ID);
    assert.match(prisma._queryRawCalls[0].sql, /company_id = \?/);
  });

  it("hides private channels the caller is not a member of", async () => {
    const rows = [
      { id: CONV_ID, is_public: false, is_member: false, link_primary: true },
      { id: OTHER_CONV_ID, is_public: true, is_member: false, link_primary: false },
    ];
    const prisma = buildPrismaMock([rows]);
    const svc = createChatChannelLinksService({ prisma });
    const result = await svc.listByLink(args);
    assert.deepEqual(result.channels.map((r) => r.id), [OTHER_CONV_ID]);
    assert.equal(result.primaryId, OTHER_CONV_ID);
  });

  it("prefers the flagged primary over the oldest", async () => {
    const rows = [
      { id: CONV_ID, is_public: true, is_member: true, link_primary: false },
      { id: OTHER_CONV_ID, is_public: true, is_member: true, link_primary: true },
    ];
    const svc = createChatChannelLinksService({ prisma: buildPrismaMock([rows]) });
    const result = await svc.listByLink(args);
    assert.equal(result.primaryId, OTHER_CONV_ID);
  });
});

describe("chat-channel-links-service — setPrimary", () => {
  it("rejects with 422 when the channel has no link", async () => {
    const prisma = buildPrismaMock([[{ linked_module: null, linked_entity_id: null }]]);
    const svc = createChatChannelLinksService({ prisma });
    await assert.rejects(() => svc.setPrimary(CONV_ID, true), (err) => { assert.equal(err.status, 422); return true; });
  });

  it("clears siblings and flags this channel in one transaction", async () => {
    const prisma = buildPrismaMock([[{ linked_module: "runly.projects", linked_entity_id: PROJECT_ID }]]);
    const executed = [];
    prisma.$executeRaw = async (strings) => { executed.push(strings.join("?")); return 1; };
    let txSize = 0;
    prisma.$transaction = async (ops) => { txSize = ops.length; return Promise.all(ops); };
    const svc = createChatChannelLinksService({ prisma });
    await svc.setPrimary(CONV_ID, true);
    assert.equal(txSize, 2);
    assert.match(executed[0], /id != \?/);
  });
});

describe("chat-channel-links-service — assertBothOrNeither", () => {
  it("does not throw when both are null", () => {
    const svc = createChatChannelLinksService({ prisma: {} });
    svc.assertBothOrNeither(null, null);
  });

  it("does not throw when both are set", () => {
    const svc = createChatChannelLinksService({ prisma: {} });
    svc.assertBothOrNeither("runly.projects", PROJECT_ID);
  });

  it("throws a 422 ChatServiceError when only linkedModule is set", () => {
    const svc = createChatChannelLinksService({ prisma: {} });
    assert.throws(
      () => svc.assertBothOrNeither("runly.projects", null),
      (err) => { assert.equal(err.name, "ChatServiceError"); assert.equal(err.status, 422); return true; },
    );
  });

  it("throws a 422 ChatServiceError when only linkedEntityId is set", () => {
    const svc = createChatChannelLinksService({ prisma: {} });
    assert.throws(
      () => svc.assertBothOrNeither(null, PROJECT_ID),
      (err) => { assert.equal(err.status, 422); return true; },
    );
  });
});

describe("chat-channel-links-service — applyLinkUpdate", () => {
  it("returns an empty array (no-op) when linkedModule is not present in updates", () => {
    const svc = createChatChannelLinksService({ prisma: {} });
    assert.deepEqual(svc.applyLinkUpdate({}), []);
  });

  it("returns SET fragments without any collision check when linking (several channels may share a record)", () => {
    const svc = createChatChannelLinksService({ prisma: {} });
    const result = svc.applyLinkUpdate({ linkedModule: "runly.projects", linkedEntityId: PROJECT_ID });
    assert.equal(result.length, 2);
  });

  it("also drops the primary flag when unlinking", () => {
    const svc = createChatChannelLinksService({ prisma: {} });
    const result = svc.applyLinkUpdate({ linkedModule: null, linkedEntityId: null });
    assert.equal(result.length, 3);
  });
});
