import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { BUNDLE_EXTERNALS } from "../module-bundler-service.js";
import { buildCatalog } from "../../../../../scripts/generate-module-runtime-catalog.mjs";
import { MODULE_EXTERNALS_IMPORTMAP } from "../../../../../packages/preview-runtime/src/externals.js";

const catalog = JSON.parse(readFileSync(new URL("../../../../../packages/module-compiler/src/runtime-catalog.json", import.meta.url), "utf8"));

test("runtime catalog matches the installed versions (run scripts/generate-module-runtime-catalog.mjs)", () => {
  assert.deepEqual(catalog, buildCatalog());
});

test("every shared bundler external is documented in the catalog", () => {
  const shared = new Set(catalog.libraries.filter((library) => library.category === "shared").map((library) => library.name));
  const externals = BUNDLE_EXTERNALS.filter((name) => !name.startsWith("@atlas/") && !name.startsWith("react/"));
  assert.deepEqual(externals.filter((name) => !shared.has(name)), []);
  assert.deepEqual([...shared].filter((name) => !BUNDLE_EXTERNALS.includes(name)), []);
});

test("QR libraries use shared shims in the actual Vite development and production importmaps", async () => {
  const { default: config } = await import("../../../../desktop/vite.config.js");
  const dev = config.plugins.find(plugin => plugin?.name === "runly-module-externals-importmap-dev");
  const build = config.plugins.find(plugin => plugin?.name === "runly-module-externals-importmap-build");
  assert.ok(dev, 'development importmap plugin must be enabled');
  assert.ok(build, 'production importmap plugin must be enabled');
  const developmentMap = JSON.parse(dev.transformIndexHtml.handler()[0].children).imports;
  build.configResolved({ base: '/preview/' });
  const productionMap = JSON.parse(build.transformIndexHtml.handler()[0].children).imports;
  for (const [library, shim] of [["qrcode", "ext-qrcode"], ["@zxing/browser", "ext-zxing-browser"]]) {
    assert.equal(MODULE_EXTERNALS_IMPORTMAP[library], shim);
    assert.equal(developmentMap[library], `/src/shims/${shim}.js`);
    assert.equal(productionMap[library], `/preview/shims/${shim}.js`);
    assert.equal(existsSync(new URL(`../../../../desktop/src/shims/${shim}.js`, import.meta.url)), true);
  }
});

test("the public libraries page matches the catalog", async () => {
  const { renderLibrariesDoc } = await import("../../../../../scripts/generate-module-runtime-catalog.mjs");
  const doc = readFileSync(new URL("../../../../../docs/developers/librerias.md", import.meta.url), "utf8");
  assert.equal(doc.replace(/\r\n/g, "\n"), renderLibrariesDoc(catalog));
});
