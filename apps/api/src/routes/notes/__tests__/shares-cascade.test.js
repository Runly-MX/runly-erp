import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSharesService } from "../shares-service.js";

const OWNER = "01900000-0000-7000-8000-000000000001";
const OTHER = "01900000-0000-7000-8000-000000000002";
const COMPANY = "01900000-0000-7000-8000-0000000000cc";
const NOTE = "01900000-0000-7000-8000-0000000000aa";
const SHARE = "01900000-0000-7000-8000-0000000000bb";

const flat = (strings) => strings.join(" ? ").replace(/\s+/g, " ").trim().toLowerCase();

function recordingPrisma(statements) {
  const run = (strings) => {
    const text = flat(strings);
    statements.push(text);
    if (text.includes("select id, company_id from notes")) return Promise.resolve([{ id: NOTE, company_id: COMPANY }]);
    if (text.includes("select ns.id from note_shares")) return Promise.resolve([{ id: SHARE }]);
    return Promise.resolve([{ id: SHARE, note_id: NOTE, shared_with_user_id: OTHER, permission: "read" }]);
  };
  return {
    $queryRaw: run,
    $executeRaw: run,
    membership: { findFirst: async () => ({ role: { key: "runly.admin", permissions: [] } }) },
    userPermissionGrant: { findFirst: async () => null },
  };
}

describe("shares-service sub-page cascade", () => {
  it("shareNote upserts the grant for the note and its descendants in one company-scoped statement", async () => {
    const statements = [];
    const svc = createSharesService({ prisma: recordingPrisma(statements), broadcaster: null, notificationService: { publish: async () => {} } });
    await svc.shareNote(NOTE, OWNER, { targetUserId: OTHER, permission: "edit" });
    const insert = statements.filter((s) => s.includes("insert into note_shares"));
    assert.equal(insert.length, 1);
    assert.match(insert[0], /with recursive tree/);
    assert.match(insert[0], /company_id is not distinct from/);
    assert.match(insert[0], /c\.owner_user_id/);
    assert.match(insert[0], /on conflict \(note_id, shared_with_user_id\)/);
  });

  it("updateShare and revokeShare cascade through a single recursive statement each", async () => {
    const statements = [];
    const svc = createSharesService({ prisma: recordingPrisma(statements), broadcaster: null });
    await svc.updateShare(SHARE, OWNER, { permission: "read" });
    await svc.revokeShare(SHARE, OWNER);
    const upd = statements.filter((s) => s.includes("update note_shares"));
    const del = statements.filter((s) => s.includes("delete from note_shares"));
    assert.equal(upd.length, 1);
    assert.equal(del.length, 1);
    for (const s of [...upd, ...del]) {
      assert.match(s, /with recursive/);
      assert.match(s, /company_id is not distinct from/);
    }
  });
});
