import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { OFFICE_FORMATS } from "@runly/core";
import { validateOfficeDocument } from "../office/validate-document.js";
import { createOfficeService } from "../office/service.js";
import { officeEnv } from "./office-fixture.js";
import { filesWorkspaceFixture } from "./files-workspace-fixture.js";

test("blank document templates are valid OOXML packages for all three editors", async () => {
  for (const [extension, format] of Object.entries(OFFICE_FORMATS)) {
    if (format.kind !== "ooxml") continue;
    await validateOfficeDocument(
      await readFile(
        new URL(`../files/templates/blank.${extension}`, import.meta.url),
      ),
      { ...format, extension },
    );
  }
});

test(
  "Files workspace enforces pagination, invitations and all file access paths in PostgreSQL",
  { skip: !process.env.FILES_TEST_DATABASE_URL },
  async (t) => {
    const f = await filesWorkspaceFixture(process.env.FILES_TEST_DATABASE_URL);
    const {
      prisma,
      workspace: w,
      filesService: files,
      owner,
      peer,
      reader,
      outsider,
    } = f;
    const ownerArgs = { authUserId: owner.authUserId };
    let document, peerToken;
    const office = createOfficeService({
      prisma,
      supabaseAdmin: f.supabaseAdmin,
      env: officeEnv,
      fetchImpl: async () =>
        new Response(
          '<wopi-discovery><net-zone><app><action ext="docx" name="edit" urlsrc="http://collabora:9980/browser/hash/cool.html?"/></app></net-zone></wopi-discovery>',
        ),
    });
    try {
      await t.test(
        "creation defaults to restricted, is idempotent and validates roles",
        async () => {
          const request = {
            ...ownerArgs,
            name: "Informe",
            format: "docx",
            requestKey: "files-test-create-document-001",
          };
          const results = await Promise.all([
            w.create(request),
            w.create(request),
          ]);
          assert.equal(results[0].id, results[1].id);
          document = results[0];
          assert.equal(document.accessScope, "RESTRICTED");
          assert.equal(document.uploadedById, owner.id);
          assert.equal(
            await prisma.fileAsset.count({
              where: {
                uploadedById: owner.id,
                creationKey: request.requestKey,
              },
            }),
            1,
          );
          await assert.rejects(
            w.create({ ...request, name: "Otra propuesta" }),
            (e) => e.status === 409,
          );
          await assert.rejects(
            w.create({ ...request, authUserId: reader.authUserId }),
            (e) => e.status === 403,
          );
          await assert.rejects(
            w.create({ ...request, format: "exe" }),
            (e) => e.status === 400,
          );
          for (const format of ["xlsx", "pptx"])
            assert.ok(
              (
                await w.create({
                  ...request,
                  format,
                  name: "Nuevo " + format,
                  requestKey: request.requestKey + format,
                })
              ).sizeBytes > 0,
            );
        },
      );
      await t.test(
        "non-members and uninvited peers cannot list, inspect, download or issue signed URLs",
        async () => {
          for (const user of [peer, outsider]) {
            const authUserId = user.authUserId;
            assert.equal(
              (await files.list({ authUserId })).pagination.total,
              0,
            );
            await assert.rejects(
              files.getById({ authUserId, id: document.id }),
              (e) => [403, 404].includes(e.status),
            );
            await assert.rejects(
              files.getSignedUrl({ authUserId, id: document.id }),
              (e) => [403, 404].includes(e.status),
            );
            await assert.rejects(
              files.bulkDownload({
                authUserId,
                fileIds: [document.id],
                mode: "direct",
              }),
              (e) => e.status === 403,
            );
            await assert.rejects(
              files.bulkDownload({
                authUserId,
                fileIds: [document.id],
                mode: "zip",
              }),
              (e) => e.status === 403,
            );
            assert.deepEqual(
              await files.getCompanyAssets({
                authUserId,
                fileIds: [document.id],
              }),
              [],
            );
            await assert.rejects(
              office.download({ authUserId, fileId: document.id }),
              (e) => e.status === 403,
            );
          }
          assert.equal(f.storage.signed, 0);
          // Even a module caller with an incomplete raw-SQL projection cannot sign
          // restricted workspace attachments without an authorization context.
          const { accessScope: _scope, ...legacyProjection } = document;
          assert.deepEqual(
            await files.enrichFileAssets([legacyProjection]),
            [],
          );
          const enrich = files.enrichFilesWithSignedUrls;
          assert.equal(
            (await enrich([{ file_asset: legacyProjection }]))[0].file_asset,
            null,
          );
        },
      );
      await t.test(
        "pending invitations require acceptance by their recipient",
        async () => {
          await assert.rejects(
            w.changeSharing({
              ...ownerArgs,
              fileId: document.id,
              userId: outsider.id,
              role: "EDITOR",
            }),
            (e) => e.status === 403,
          );
          await assert.rejects(
            w.changeSharing({
              ...ownerArgs,
              fileId: document.id,
              userId: reader.id,
              role: "EDITOR",
            }),
            (e) => e.status === 403,
          );
          await w.changeSharing({
            ...ownerArgs,
            fileId: document.id,
            userId: peer.id,
            role: "VIEWER",
          });
          const {
            data: [invite],
          } = await w.invitations({ authUserId: peer.authUserId });
          assert.ok(invite);
          // A pending invitation grants nothing: the file is not visible yet. Same denial set as the uninvited-peer checks above.
          await assert.rejects(
            files.getById({ authUserId: peer.authUserId, id: document.id }),
            (e) => [403, 404].includes(e.status),
          );
          await assert.rejects(
            w.respond({ ...ownerArgs, invitationId: invite.id, accept: true }),
            (e) => e.status === 404,
          );
          await w.respond({
            authUserId: peer.authUserId,
            invitationId: invite.id,
            accept: true,
          });
          assert.equal(
            (
              await files.list({
                authUserId: peer.authUserId,
                query: { workspace: "shared" },
              })
            ).pagination.total,
            1,
          );
          assert.equal(
            (
              await office.createSession({
                authUserId: peer.authUserId,
                fileId: document.id,
                mode: "auto",
              })
            ).mode,
            "view",
          );
          await assert.rejects(
            office.createSession({
              authUserId: peer.authUserId,
              fileId: document.id,
              mode: "edit",
            }),
            (e) => e.status === 403,
          );
          await assert.rejects(
            w.changeSharing({
              authUserId: peer.authUserId,
              fileId: document.id,
              scope: "COMPANY",
            }),
            (e) => e.status === 403,
          );
          await assert.rejects(
            files.rename({
              authUserId: peer.authUserId,
              id: document.id,
              originalName: "Not allowed.docx",
            }),
            (e) => e.status === 403,
          );
        },
      );
      await t.test(
        "editing grant and revocation apply to an already issued WOPI session",
        async () => {
          await w.changeSharing({
            ...ownerArgs,
            fileId: document.id,
            userId: peer.id,
            role: "EDITOR",
          });
          peerToken = (
            await office.createSession({
              authUserId: peer.authUserId,
              fileId: document.id,
              mode: "edit",
            })
          ).accessToken;
          assert.equal(
            (
              await office.checkFileInfo({
                fileId: document.id,
                token: peerToken,
              })
            ).UserCanWrite,
            true,
          );
          await prisma.userProfile.update({
            where: { id: peer.id },
            data: { enabled: false },
          });
          await assert.rejects(
            office.getFile({ fileId: document.id, token: peerToken }),
            (e) => e.status === 403,
          );
          await prisma.userProfile.update({
            where: { id: peer.id },
            data: { enabled: true },
          });
          await office.lock({
            fileId: document.id,
            token: peerToken,
            operation: "LOCK",
            lock: "peer",
          });
          // Permission changes remain possible while the editor owns its lease.
          await w.changeSharing({
            ...ownerArgs,
            fileId: document.id,
            scope: "RESTRICTED",
          });
          await w.changeSharing({
            ...ownerArgs,
            fileId: document.id,
            userId: peer.id,
            role: "EDITOR",
            revoke: true,
          });
          await assert.rejects(
            office.getFile({ fileId: document.id, token: peerToken }),
            (e) => e.status === 403,
          );
          await assert.rejects(
            office.lock({
              fileId: document.id,
              token: peerToken,
              operation: "LOCK",
              lock: "peer",
            }),
            (e) => e.status === 403,
          );
          await assert.rejects(
            office.putFile({
              fileId: document.id,
              token: peerToken,
              lock: "peer",
              bytes: await readFile(
                new URL("../files/templates/blank.docx", import.meta.url),
              ),
            }),
            (e) => e.status === 403,
          );
          await assert.rejects(
            files.getSignedUrl({
              authUserId: peer.authUserId,
              id: document.id,
            }),
            // Once the share is revoked the restricted file is no longer visible to the peer: denial by hiding (404) or refusal (403).
            (e) => [403, 404].includes(e.status),
          );
        },
      );
      await t.test(
        "pagination and filters run before limiting results, with a stable tie breaker",
        async () => {
          await prisma.fileAsset.createMany({
            data: Array.from({ length: 125 }, (_, i) => ({
              bucket: "runly-files",
              objectKey: `page-${i}`,
              originalName: `Paged ${String(i).padStart(3, "0")}.txt`,
              mimeType: "text/plain",
              sizeBytes: 4,
              moduleKey: "atlas.files",
              entityType: "AtlasFile",
              entityId: f.companyId,
              uploadedById: owner.id,
              accessScope: "COMPANY",
              updatedAt: new Date("2026-01-01"),
            })),
          });
          const query = {
            q: "Paged",
            pageSize: 20,
            sortBy: "updatedAt",
            sortDir: "desc",
          };
          const first = await files.list({
            authUserId: peer.authUserId,
            query,
          });
          const second = await files.list({
            authUserId: peer.authUserId,
            query: { ...query, page: 2 },
          });
          assert.equal(first.pagination.total, 125);
          assert.equal(first.pagination.totalPages, 7);
          assert.equal(second.data.length, 20);
          assert.equal(
            new Set([...first.data, ...second.data].map((r) => r.id)).size,
            40,
          );
          assert.equal(
            (
              await files.list({
                authUserId: peer.authUserId,
                query: { q: "Paged 124" },
              })
            ).data.length,
            1,
          );
          assert.equal(
            (
              await files.list({
                ...ownerArgs,
                query: { kind: "presentation" },
              })
            ).pagination.total,
            1,
          );
          assert.equal(
            (
              await files.list({
                authUserId: peer.authUserId,
                query: { kind: "presentation" },
              })
            ).pagination.total,
            0,
          );
        },
      );
      await t.test(
        "storage failure creates no phantom document; SQL rejects invalid access and client roles cannot read invites",
        async () => {
          f.storage.failUpload = true;
          await assert.rejects(
            w.create({
              ...ownerArgs,
              name: "Failure",
              format: "docx",
              requestKey: "files-test-create-failure-001",
            }),
            (e) => e.status === 503,
          );
          assert.equal(
            await prisma.fileAsset.count({
              where: { creationKey: "files-test-create-failure-001" },
            }),
            0,
          );
          await assert.rejects(
            prisma.fileAsset.update({
              where: { id: document.id },
              data: { visibility: "PUBLIC" },
            }),
          );
          const [privilege] =
            await prisma.$queryRaw`SELECT has_table_privilege('anon','file_asset_share','SELECT') AS anon, has_table_privilege('authenticated','file_asset_share','SELECT') AS authenticated`;
          assert.deepEqual(privilege, { anon: false, authenticated: false });
          const [metadataPrivilege] =
            await prisma.$queryRaw`SELECT has_table_privilege('anon','file_asset','SELECT') AS anon, has_table_privilege('authenticated','file_asset','SELECT') AS authenticated`;
          assert.deepEqual(metadataPrivilege, {
            anon: false,
            authenticated: false,
          });
        },
      );
    } finally {
      await f.cleanup();
    }
  },
);
