import assert from "node:assert/strict";
import { test } from "node:test";

globalThis.localStorage = { store: {}, getItem(k) { return this.store[k] ?? null; }, setItem(k, v) { this.store[k] = String(v); } };
const { isMiraiTabHidden, miraiShortcut, setMiraiTabHidden } = await import("./miraiTabPreference.js");

test("tab visibility persists and starts visible", () => {
  assert.equal(isMiraiTabHidden(), false);
  setMiraiTabHidden(true);
  assert.equal(isMiraiTabHidden(), true);
  assert.equal(localStorage.getItem("mirai.tab.hidden"), "1");
  setMiraiTabHidden(false);
  assert.equal(localStorage.getItem("mirai.tab.hidden"), "0");
});

test("Alt+M toggles the tab, Alt+Shift+M the panel, never while typing or with Ctrl/Meta", () => {
  const key = (extra) => ({ altKey: true, code: "KeyM", target: { tagName: "DIV" }, ...extra });
  assert.equal(miraiShortcut(key()), "tab");
  assert.equal(miraiShortcut(key({ shiftKey: true })), "panel");
  assert.equal(miraiShortcut(key({ target: { tagName: "TEXTAREA" } })), null);
  assert.equal(miraiShortcut(key({ target: { tagName: "DIV", isContentEditable: true } })), null);
  assert.equal(miraiShortcut(key({ ctrlKey: true })), null);
  assert.equal(miraiShortcut(key({ metaKey: true })), null);
  assert.equal(miraiShortcut(key({ altKey: false })), null);
  assert.equal(miraiShortcut(key({ code: "KeyN" })), null);
});
