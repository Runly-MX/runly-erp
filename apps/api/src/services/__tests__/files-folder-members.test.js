import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createFilesFolders, FOLDER_SHARED_EVENT } from "../files/folders.js";

const COMPANY = "01900000-0000-7000-8000-000000000001";
const ME = "01900000-0000-7000-8000-0000000000a1";
const ANA = "01900000-0000-7000-8000-0000000000b2";
const LUIS = "01900000-0000-7000-8000-0000000000c3";
const FOLDER = { id: "01900000-0000-7000-8000-0000000000f1", name: "Contratos", createdById: ME, companyId: COMPANY };

function setup({ existing = [], publish }) {
  const members = existing.map((userId) => ({ folderId: FOLDER.id, userId, createdAt: new Date() }));
  const prisma = {
    fileFolder: { findFirst: async () => FOLDER },
    membership: { findMany: async ({ where }) => where.userId.in.map((userId) => ({ userId })) },
    fileFolderMember: {
      findMany: async () => members,
      createMany: async ({ data }) => {
        for (const row of data) if (!members.some((m) => m.userId === row.userId)) members.push({ ...row, createdAt: new Date() });
      },
    },
    auditLog: { create: async () => ({}) },
    userProfile: { findMany: async () => [] },
  };
  const filesService = { getUserCompanyContext: async () => ({ companyId: COMPANY, profileId: ME, admin: true, permissions: new Set() }) };
  const people = { attachAvatarUrls: async (users) => users };
  return { service: createFilesFolders({ prisma, filesService, people, notifications: { publish } }), members };
}

describe("files folder members", () => {
  it("notifies only the people newly added to the folder", async () => {
    const sent = [];
    const { service } = setup({ existing: [ANA], publish: async (payload) => sent.push(payload) });
    await service.addMembers({ authUserId: "auth", folderId: FOLDER.id, userIds: [ANA, LUIS] });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].input.eventType, FOLDER_SHARED_EVENT);
    assert.deepEqual(sent[0].input.recipients.userIds, [LUIS]);
    assert.match(sent[0].input.link, new RegExp(`folder=${FOLDER.id}`));
  });

  it("keeps the share when the notification fails", async () => {
    const { service, members } = setup({ publish: async () => { throw new Error("down"); } });
    await service.addMembers({ authUserId: "auth", folderId: FOLDER.id, userIds: [LUIS] });
    assert.ok(members.some((m) => m.userId === LUIS));
  });
});
