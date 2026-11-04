// apps/api/src/routes/website/__tests__/checkout-routes.test.js
//
// Security regression coverage (2026-08-30 audit, D9): POST /public/checkout
// used to build the Stripe line items directly from client-supplied
// item.price/item.currency/item.name — a tampered request (or one sent
// straight with curl, bypassing any storefront UI) could buy anything for
// any amount. Fixed by re-deriving price/currency/name server-side from the
// published catalog (catalog_product / catalog_product_variant), keyed only
// by a client-supplied productId/variantId + qty.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPublicCheckoutRouter } from "../checkout-routes.js";

const SITE_ID = "01900000-0000-7000-8000-0000000000s1";
const COMPANY_ID = "01900000-0000-7000-8000-0000000000c1";
const PRODUCT_ID = "01900000-0000-7000-8000-0000000000p1";
const VARIANT_ID = "01900000-0000-7000-8000-0000000000v1";

// Real product price is 500.00 — every test asserts Stripe only ever sees
// this, never a client-supplied override.
const REAL_PRICE = "500.0000";

function buildPrisma({ hasStripeKey = true, hasProduct = true, hasVariant = true, variantMatchesProduct = true } = {}) {
  return {
    $queryRaw: async (strings) => {
      const text = strings.join(" ");
      if (/FROM\s+website_site\s+WHERE/.test(text)) {
        return hasStripeKey
          ? [{ stripe_secret_key: "encrypted:sk_test_xxx", stripe_success_message: null, company_id: COMPANY_ID }]
          : [{ stripe_secret_key: null, stripe_success_message: null, company_id: COMPANY_ID }];
      }
      if (text.includes("FROM catalog_product_variant")) {
        return hasVariant
          ? [{ id: VARIANT_ID, product_id: variantMatchesProduct ? PRODUCT_ID : "other-product", price: "999.0000" }]
          : [];
      }
      if (text.includes("FROM catalog_product")) {
        return hasProduct ? [{ id: PRODUCT_ID, name: "Producto real", price: REAL_PRICE, currency: "MXN" }] : [];
      }
      throw new Error(`Unexpected $queryRaw: ${text}`);
    },
  };
}

function buildStripeImpl(capture) {
  return class FakeStripe {
    constructor(secretKey) {
      capture.secretKey = secretKey;
    }
    get checkout() {
      return {
        sessions: {
          create: async (params) => {
            capture.sessionParams = params;
            return { url: "https://checkout.stripe.test/session_123" };
          },
        },
      };
    }
  };
}

function buildApp({ prismaOverrides, capture = {} } = {}) {
  const prisma = buildPrisma(prismaOverrides);
  const StripeImpl = buildStripeImpl(capture);
  const decryptPasswordImpl = (v) => `decrypted:${v}`;
  const app = createPublicCheckoutRouter({ prisma, StripeImpl, decryptPasswordImpl });
  return { app, capture };
}

describe("POST /checkout — price/currency/name come from the catalog, never the client", () => {
  it("ignores a tampered client price and charges the real catalog price", async () => {
    const { app, capture } = buildApp();
    const res = await app.request("/checkout", {
      method: "POST",
      headers: { "X-Site-Id": SITE_ID, "Content-Type": "application/json", Origin: "https://tienda.test" },
      body: JSON.stringify({
        items: [{ productId: PRODUCT_ID, qty: 2, price: 0.01, currency: "usd", name: "Producto falso" }],
      }),
    });
    assert.equal(res.status, 200);
    const lineItem = capture.sessionParams.line_items[0];
    // 500.00 (real price) * 100, NOT 0.01 (the attacker-supplied price) * 100
    assert.equal(lineItem.price_data.unit_amount, 50000);
    assert.equal(lineItem.price_data.currency, "mxn");
    assert.equal(lineItem.price_data.product_data.name, "Producto real");
    assert.equal(lineItem.quantity, 2);
    assert.equal(capture.sessionParams.allow_promotion_codes, true);
    assert.equal(capture.sessionParams.discounts, undefined);
  });

  it("uses the variant price when variantId is given, and validates it belongs to the product", async () => {
    const { app, capture } = buildApp();
    const res = await app.request("/checkout", {
      method: "POST",
      headers: { "X-Site-Id": SITE_ID, "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, qty: 1 }] }),
    });
    assert.equal(res.status, 200);
    assert.equal(capture.sessionParams.line_items[0].price_data.unit_amount, 99900);
  });

  it("rejects a variant that belongs to a different product", async () => {
    const { app } = buildApp({ prismaOverrides: { variantMatchesProduct: false } });
    const res = await app.request("/checkout", {
      method: "POST",
      headers: { "X-Site-Id": SITE_ID, "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, qty: 1 }] }),
    });
    assert.equal(res.status, 400);
  });

  it("rejects an item missing productId", async () => {
    const { app } = buildApp();
    const res = await app.request("/checkout", {
      method: "POST",
      headers: { "X-Site-Id": SITE_ID, "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ qty: 1, price: 10 }] }),
    });
    assert.equal(res.status, 400);
  });

  it("rejects a product that isn't published/enabled for this company", async () => {
    const { app } = buildApp({ prismaOverrides: { hasProduct: false } });
    const res = await app.request("/checkout", {
      method: "POST",
      headers: { "X-Site-Id": SITE_ID, "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ productId: PRODUCT_ID, qty: 1 }] }),
    });
    assert.equal(res.status, 400);
  });

  it("rejects when the site has no Stripe key configured", async () => {
    const { app } = buildApp({ prismaOverrides: { hasStripeKey: false } });
    const res = await app.request("/checkout", {
      method: "POST",
      headers: { "X-Site-Id": SITE_ID, "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ productId: PRODUCT_ID, qty: 1 }] }),
    });
    assert.equal(res.status, 400);
  });

  it("rejects a missing siteId or empty items", async () => {
    const { app } = buildApp();
    const res = await app.request("/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ productId: PRODUCT_ID, qty: 1 }] }),
    });
    assert.equal(res.status, 400);
  });

  it('does not expose private provider error details',async()=>{
    class FailingStripe {get checkout(){return {sessions:{create:async()=>{throw Error('SYNTHETIC_PRIVATE_PROVIDER_DETAIL')}}}}}
    const app=createPublicCheckoutRouter({prisma:buildPrisma(),StripeImpl:FailingStripe,decryptPasswordImpl:()=> 'synthetic'})
    const response=await app.request('/checkout',{method:'POST',headers:{'X-Site-Id':SITE_ID,'Content-Type':'application/json'},body:JSON.stringify({items:[{productId:PRODUCT_ID,qty:1}]})})
    assert.equal(response.status,500);assert.ok(!(await response.text()).includes('PRIVATE_PROVIDER_DETAIL'))
  })
});
