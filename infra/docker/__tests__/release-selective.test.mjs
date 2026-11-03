import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { parseArgs, assertConfirmed, shaTag, latestTag, SELECTABLE } from "../release-selective.mjs";

test("only api, web and worker can be selected; DWG and the rest stay out", () => {
  assert.deepEqual(parseArgs([]).images, ["api", "web"]);
  assert.deepEqual(SELECTABLE, ["api", "web", "worker"]);
  for (const key of ["dwg", "backup", "tts", "transcriber", "latest"]) assert.throws(() => parseArgs([`--images=${key}`]), /UNSUPPORTED_IMAGES/);
  assert.throws(() => parseArgs(["--images="]), /UNSUPPORTED_IMAGES/);
});

test("a single mode, plan by default", () => {
  assert.equal(parseArgs([]).mode, "plan");
  assert.equal(parseArgs(["--build"]).mode, "build");
  assert.throws(() => parseArgs(["--push", "--promote"]), /ONE_MODE_ONLY/);
});

test("tags carry the exact short SHA and -latest is never produced by tagging", () => {
  const sha = "0123456789abcdef0123456789abcdef01234567";
  assert.equal(shaTag("api", sha), "raulbellosom/runlyerp:api-0123456789ab");
  assert.equal(latestTag("web"), "raulbellosom/runlyerp:web-latest");
});

test("push and promote require the exact short SHA", () => {
  const sha = "0123456789abcdef0123456789abcdef01234567";
  assert.throws(() => assertConfirmed("push", null, sha), /CONFIRM_REQUIRED/);
  assert.throws(() => assertConfirmed("promote", "deadbeef0000", sha), /CONFIRM_REQUIRED/);
  assert.doesNotThrow(() => assertConfirmed("push", sha.slice(0, 12), sha));
  assert.doesNotThrow(() => assertConfirmed("plan", null, sha));
  assert.doesNotThrow(() => assertConfirmed("build", null, sha));
});

test("the CLI plan prints tags and changes nothing", () => {
  const result = spawnSync(process.execPath, ["infra/docker/release-selective.mjs", "--images=api,web"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Plan only: nothing was built, pushed or retagged/);
  assert.match(result.stdout, /raulbellosom\/runlyerp:api-[0-9a-f]{12}/);
  const refused = spawnSync(process.execPath, ["infra/docker/release-selective.mjs", "--push"], { encoding: "utf8" });
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /CONFIRM_REQUIRED/);
});

test("dry-run push and promote print the docker commands and execute nothing", () => {
  const sha = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
  const env = { ...process.env, RUNLY_RELEASE_REGISTRY: "localhost:5999/runlyerp" };
  const push = spawnSync(process.execPath, ["infra/docker/release-selective.mjs", "--images=api", "--push", "--dry-run", `--confirm=${sha.slice(0, 12)}`], { encoding: "utf8", env });
  assert.equal(push.status, 0, push.stderr);
  assert.ok(push.stdout.includes(`[dry-run] docker push localhost:5999/runlyerp:api-${sha.slice(0, 12)}`));
  const promote = spawnSync(process.execPath, ["infra/docker/release-selective.mjs", "--images=api", "--promote", "--dry-run", `--confirm=${sha.slice(0, 12)}`], { encoding: "utf8", env });
  assert.equal(promote.status, 0, promote.stderr);
  assert.match(promote.stdout, /\[dry-run\] docker buildx imagetools create -t localhost:5999\/runlyerp:api-latest/);
  assert.match(promote.stdout, /Dry run: no command executed/);
});
