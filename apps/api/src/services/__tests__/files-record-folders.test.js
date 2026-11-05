import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { recordFilesWhere, recordGroups } from "../files/record-folders.js";

const COMPANY = "01900000-0000-7000-8000-000000000001";
const ME = "01900000-0000-7000-8000-0000000000a1";
const P1 = "01900000-0000-7000-8000-0000000000a9";
const P2 = "01900000-0000-7000-8000-0000000000b2";
const T1 = "01900000-0000-7000-8000-0000000000c3";
const T2 = "01900000-0000-7000-8000-0000000000d4";

const prisma = {
  fileAsset: {
    findMany: async () => [
      { entityType: "Task", metadata: { sourceEntityId: T1 } },
      { entityType: "Task", metadata: { sourceEntityId: T2 } },
      { entityType: "Task", metadata: { sourceEntityId: "not-a-uuid" } },
    ],
  },
  task: {
    findMany: async ({ where }) => (where.projectId ? [{ id: T1 }, { id: T2 }] : [{ id: T1, projectId: P1 }, { id: T2, projectId: P1 }]),
  },
  project: {
    findMany: async ({ where }) =>
      where.id ? [{ id: P1, name: "Zeta" }, { id: P2, name: "Alfa" }].filter((p) => where.id.in.includes(p.id)) : [{ id: P1 }, { id: P2 }],
  },
};

describe("files record folders", () => {
  it("groups task attachments under their project and lists empty projects", async () => {
    const groups = await recordGroups(prisma, { companyId: COMPANY, profileId: ME, admin: false }, "runly.projects", {});
    assert.deepEqual(groups, [
      { record: `Project:${P2}`, label: "Alfa", count: 0 },
      { record: `Project:${P1}`, label: "Zeta", count: 2 },
    ]);
  });

  it("expands a project folder into its tasks and rejects unknown records", async () => {
    const where = await recordFilesWhere(prisma, COMPANY, `Project:${P1}`);
    assert.equal(where.entityType, "Task");
    assert.deepEqual(where.OR.map((w) => w.metadata.equals), [T1, T2]);
    await assert.rejects(() => recordFilesWhere(prisma, COMPANY, "Secret:x"));
  });
});
