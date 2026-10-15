import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createUrlBatcher } from "../lazy-media.js";

describe("createUrlBatcher", () => {
  it("coalesces lookups of the same tick into one request and dedupes ids", async () => {
    const calls = [];
    const lookup = createUrlBatcher(async (ids, variant) => {
      calls.push({ ids, variant });
      return Object.fromEntries(ids.map((id) => [id, `url-${id}`]));
    }, { delay: 1 });
    const urls = await Promise.all([lookup("a", "tile"), lookup("b", "tile"), lookup("a", "tile"), lookup("c", "card")]);
    assert.deepEqual(urls, ["url-a", "url-b", "url-a", "url-c"]);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls.find((c) => c.variant === "tile").ids, ["a", "b"]);
  });

  it("splits into chunks and resolves null when the request fails", async () => {
    const sizes = [];
    const lookup = createUrlBatcher(async (ids) => {
      sizes.push(ids.length);
      throw new Error("down");
    }, { delay: 1, size: 2 });
    const urls = await Promise.all(["a", "b", "c"].map((id) => lookup(id, "tile")));
    assert.deepEqual(urls, [null, null, null]);
    assert.deepEqual(sizes, [2, 1]);
  });
});
