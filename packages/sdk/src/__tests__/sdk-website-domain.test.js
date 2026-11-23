import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import { createWebsiteDomain } from "../domains/website.js";
import { createRunlyClient } from "../index.js";

function makeFetch() {
  return mock.fn(async (url) => ({
    ok: true,
    status: 200,
    json: async () => ({ url }),
    text: async () => "",
  }));
}

describe("atlas SDK - website domain extraction", () => {
  it("exports the existing Website method contract", () => {
    const domain = createWebsiteDomain({
      request: async () => ({}),
      withAuthHeaders: () => ({}),
    });

    assert.deepEqual(Object.keys(domain).sort(), [
      "addCustomDomain", "checkCustomDomainHttps", "customDomainStatus", "deleteAccount",
      "getAccountSettings", "inspectMarketplaceTemplate", "installMarketplaceTemplate",
      "listAccounts", "listCustomDomains", "marketplaceTemplates", "releaseCustomDomain",
      "revokeAccountSessions", "setAccountStatus", "updateAccountSettings", "verifyCustomDomain",
      "listSiteCatalogProducts", "setSiteCatalogProduct", "setSiteCatalogSelection", "getCatalogProductUsage", "applySiteTemplate",
      "getSiteState", "hostnameAvailability", "hostnameStatus", "activateHostname", "releaseHostname", "getPublicationIntegrity", "preflightRelease", "listSiteForms", "resolveFormScope",
      "activateRelease", "createImport", "createPage", "createPreview", "createSite",
      "deleteDist", "getOrder", "listOrders", "verifyOrder",
      "getDraft", "getImport",
      "getRelease", "getSite",
      "listDomains", "listPages", "listReleases", "listSites", "prepareRelease", "reserveHostname", "revokePreview", "rollbackRelease", "saveDraft", "saveSiteDraft",
      "unpublishSite", "updateSite",
      "uploadDist",
    ].sort());
  });

  it("keeps request paths, methods, auth, and multipart upload", async () => {
    const fetchMock = makeFetch();
    globalThis.fetch = fetchMock;
    const client = createRunlyClient({ baseUrl: "http://api" });

    await client.website.getSite("site/1", "tok");
    await client.website.updateSite("site/1", { name: "Sitio" }, "tok");
    await client.website.uploadDist("site/1", new Blob(["zip"]), "tok");
    await client.website.deleteDist("site/1", "tok");

    const calls = fetchMock.mock.calls.map((call) => call.arguments);
    assert.equal(calls[0][0], "http://api/website/sites/site%2F1");
    assert.equal(calls[0][1].headers.Authorization, "Bearer tok");
    assert.equal(calls[1][1].method, "PATCH");
    assert.deepEqual(JSON.parse(calls[1][1].body), { name: "Sitio" });
    assert.equal(calls[2][1].method, "POST");
    assert.ok(calls[2][1].body instanceof FormData);
    assert.equal(calls[2][1].headers.Authorization, "Bearer tok");
    assert.equal(calls[3][1].method, "DELETE");

    fetchMock.mock.restore();
  });

  it('adds scoped CAS and idempotent operations without changing the old method signatures', async () => {
    const calls=[];
    const domain=createWebsiteDomain({request:async(path,options)=>{calls.push({path,options});return{}},withAuthHeaders:token=>({Authorization:`Bearer ${token}`})});
    await domain.createSite({name:'Site'},'attempt-for-site-0001','token');
    await domain.saveSiteDraft('site/one',{name:'Draft'},3,'token');
    await domain.saveDraft('site/one','page/two',{document:{schemaVersion:1},expectedRevision:7},'token','attempt-for-draft-0001');
    assert.equal(calls[0].options.headers['Idempotency-Key'],'attempt-for-site-0001');
    assert.deepEqual(JSON.parse(calls[1].options.body),{identity:{name:'Draft'},expectedRevision:3});
    assert.equal(calls[2].path,'/website/sites/site%2Fone/pages/page%2Ftwo/draft');
    assert.equal(calls[2].options.method,'PUT');
    assert.equal(calls[2].options.headers.Authorization,'Bearer token');
    assert.equal(calls[2].options.headers['Idempotency-Key'],'attempt-for-draft-0001');
  });

  it('preserves account, domain and Marketplace request contracts',async()=>{
    const calls=[];
    const domain=createWebsiteDomain({request:async(path,options)=>{calls.push({path,options});return{}},withAuthHeaders:token=>({Authorization:`Bearer ${token}`})});
    await domain.revokeAccountSessions('site/one','account/two','tok');
    await domain.verifyCustomDomain('site/one','shop.example.test','tok');
    await domain.installMarketplaceTemplate('site/one',{resourceId:'template'},'attempt-template-0001','tok');
    assert.deepEqual(calls.map(c=>c.path),['/website/sites/site%2Fone/accounts/account%2Ftwo/revoke-sessions','/website/sites/site%2Fone/custom-domains/shop.example.test/verify','/website/sites/site%2Fone/marketplace/install']);
    for(const call of calls){assert.equal(call.options.method,'POST');assert.equal(call.options.headers.Authorization,'Bearer tok');}
    assert.equal(calls[2].options.headers['Idempotency-Key'],'attempt-template-0001');
    assert.deepEqual(JSON.parse(calls[2].options.body),{resourceId:'template'});
  });
});
