import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { getSafeAreaInsets } from "../../packages/ui/src/lib/safeArea.js";

test("JS overlay layout resolves CSS safe areas and subsequent native updates", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const css = await readFile(new URL("../../packages/ui/src/runtime.css", import.meta.url), "utf8");
    await page.setContent("<!doctype html><html><head></head><body></body></html>");
    await page.addStyleTag({ content: css });
    await page.evaluate(() => {
      for (const [side, value] of Object.entries({ top: 24, bottom: 48, left: 8, right: 12 })) {
        document.documentElement.style.setProperty(`--native-inset-${side}`, `${value}px`);
      }
    });
    const legacyTop = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--safe-top")) || 0);
    assert.equal(legacyTop, 0, "raw max() cannot be parsed as a length");
    const measure = () => page.evaluate(`(${getSafeAreaInsets.toString()})()`);
    assert.deepEqual(await measure(), { top: 24, bottom: 48, left: 8, right: 12 });
    await page.evaluate(() => document.documentElement.style.setProperty("--native-inset-bottom", "72px"));
    assert.equal((await measure()).bottom, 72, "taskbar changes must not use a cached inset");
    assert.equal(await page.locator("body > *").count(), 0, "measurement leaves no DOM nodes");
  } finally {
    await browser.close();
  }
});
