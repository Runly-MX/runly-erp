import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";

// The deps stage installs from copied manifests only: a workspace package the API or the worker depends on
// whose package.json is not copied gets linked without its own dependencies (sharp, yauzl...) and the
// container crashes at boot with ERR_MODULE_NOT_FOUND.
const root = new URL("../../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8").replaceAll("\r\n", "\n");
const workspace = Object.fromEntries(readdirSync(new URL("packages/", root)).filter((dir) => existsSync(new URL(`packages/${dir}/package.json`, root)))
  .map((dir) => [JSON.parse(read(`packages/${dir}/package.json`)).name, `packages/${dir}/package.json`]));
const deps = (path) => { const pkg = JSON.parse(read(path)); return Object.entries({ ...pkg.dependencies, ...pkg.optionalDependencies }).filter(([, spec]) => String(spec).startsWith("workspace:")).map(([name]) => name); };
function closure(path) {
  const seen = new Set(), queue = deps(path);
  while (queue.length) { const name = queue.shift(); if (seen.has(name) || !workspace[name]) continue; seen.add(name); queue.push(...deps(workspace[name])); }
  return [...seen].map((name) => workspace[name]);
}
const depsStage = (file) => read(`infra/docker/${file}`).match(/FROM node:22-alpine AS deps[\s\S]*?pnpm prune --prod/)[0].split("\n").filter((line) => !line.startsWith("#")).join("\n");

for (const [file, app] of [["api.Dockerfile", "apps/api/package.json"], ["worker.Dockerfile", "apps/worker/package.json"]]) {
  test(`${file} copies the manifest of every workspace package ${app} needs`, () => {
    const stage = depsStage(file);
    for (const manifest of closure(app)) assert.ok(stage.includes(`COPY ${manifest} ${manifest}`), `${file} deps stage misses ${manifest}`);
  });
}

test("api and worker deps stages stay identical (shared BuildKit cache)", () => {
  assert.equal(depsStage("api.Dockerfile"), depsStage("worker.Dockerfile"));
});
