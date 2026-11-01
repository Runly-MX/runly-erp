// apps/api/src/routes/catalog/__tests__/stock-permissions.test.js
//
// The stock-adjustment endpoint must accept the granular
// `catalog.inventory.adjust` grant (2026-08-30), while still honouring
// `catalog.products.update` for backward compatibility.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createCommerceCatalogRoutes as createStockRouter } from "../commerce-routes.js";

function stubStockSvc() {
  return {
    recordStockMovement: async () => ({ id: "mov-1", quantity_delta: 3 }),
    listStockMovements: async () => ({ data: [], total: 0 }),
  };
}

describe("catalog stock routes — permission wiring", () => {
  it("POST /stock-movements is gated by (catalog.inventory.adjust OR catalog.products.update)", async () => {
    let anyKeys = null;
    const requireAnyPermission = (keys) => {
      anyKeys = keys;
      return async (_c, next) => next();
    };
    const requirePermission = () => async (_c, next) => next();

    const router = createStockRouter({
      stockSvc: stubStockSvc(),
      prisma: {},
      requirePermission,
      requireAnyPermission,
    });

    const res = await router.request("/catalog/products/p1/stock-movements", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quantity_delta: 3, reason: "count" }),
    });

    assert.notEqual(res.status, 404);
    assert.deepEqual(anyKeys, ["catalog.inventory.adjust", "catalog.products.update"]);
  });

  it("falls back to requirePermission('catalog.products.update') when requireAnyPermission is absent", async () => {
    const keysUsed = [];
    const requirePermission = (key) => {
      keysUsed.push(key);
      return async (_c, next) => next();
    };

    createStockRouter({
      stockSvc: stubStockSvc(),
      prisma: {},
      requirePermission,
    });

    // The POST route's gate must be catalog.products.update (not read).
    assert.ok(
      keysUsed.includes("catalog.products.update"),
      `expected catalog.products.update as fallback, saw ${keysUsed.join(", ")}`,
    );
  });
});
