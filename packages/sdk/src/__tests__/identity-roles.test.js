import test from "node:test";
import assert from "node:assert/strict";
import { createRunlyClient } from "../index.js";

test("role listing scopes membership requests explicitly and keeps the active company header", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url, ...options });
    return { ok: true, json: async () => ({ data: [] }) };
  });
  const client = createRunlyClient({ baseUrl: "https://erp.example.test", getActiveCompanyId: () => "company-a" });
  await client.identity.listRoles("test-token");
  await client.identity.listRoles("test-token", { scope: "memberships" });
  assert.equal(new URL(requests[0].url).pathname, "/identity/roles");
  assert.equal(new URL(requests[0].url).search, "");
  assert.equal(new URL(requests[1].url).search, "?scope=memberships");
  for (const request of requests) {
    assert.equal(request.headers["X-Runly-Company-Id"], "company-a");
    assert.equal(request.headers.Authorization, "Bearer test-token");
  }
});
