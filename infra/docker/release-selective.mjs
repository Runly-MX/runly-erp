#!/usr/bin/env node
// infra/docker/release-selective.mjs
//
// Selective, immutable image release. Unlike build-push.mjs it never writes a moving tag by itself:
//   --plan (default)  print what would be built and tagged; touches nothing
//   --build           build the images locally from `git archive <ref>` (exact commit, single platform)
//   --push            push <image>-<sha12> tags only; refuses any tag that already exists in the registry
//   --dry-run         with --push/--promote: print the exact docker commands, run none
//   --promote         point <image>-latest at an already pushed SHA tag (needs the digests recorded by --push)
// --push and --promote need --confirm=<sha12> equal to the resolved commit, so nothing is published by accident.
// Only api, web and worker can be selected here (default api,web); DWG, transcriber, TTS and backup stay with build-push.mjs.
// Records live in .artifacts/releases/<sha12>.json and keep the previous -latest digest for rollback.
//
//   node infra/docker/release-selective.mjs --images=api,web --ref=HEAD            # plan
//   node infra/docker/release-selective.mjs --images=api,web --build
//   node infra/docker/release-selective.mjs --images=api,web --push --confirm=<sha12>
//   node infra/docker/release-selective.mjs --images=api,web --promote --confirm=<sha12>
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// RUNLY_RELEASE_REGISTRY redirects every tag, e.g. to a disposable local registry (localhost:5000/runlyerp).
export const REGISTRY = process.env.RUNLY_RELEASE_REGISTRY || "raulbellosom/runlyerp";
export const SELECTABLE = ["api", "web", "worker"];

export function parseArgs(argv) {
  const value = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const images = (value("images") ?? "api,web").split(",").map((s) => s.trim()).filter(Boolean);
  const unknown = images.filter((key) => !SELECTABLE.includes(key));
  if (unknown.length || images.length === 0) throw new Error(`UNSUPPORTED_IMAGES: ${unknown.join(",") || "none selected"}`);
  const modes = ["build", "push", "promote"].filter((mode) => argv.includes(`--${mode}`));
  if (modes.length > 1) throw new Error("ONE_MODE_ONLY");
  return { images: [...new Set(images)], ref: value("ref") ?? "HEAD", mode: modes[0] ?? "plan", confirm: value("confirm") ?? null, dryRun: argv.includes("--dry-run") };
}

export const shaTag = (key, sha) => `${REGISTRY}:${key}-${sha.slice(0, 12)}`;
export const latestTag = (key) => `${REGISTRY}:${key}-latest`;

// Publishing needs the operator to retype the exact short SHA that the plan printed.
export function assertConfirmed(mode, confirm, sha) {
  if (mode !== "push" && mode !== "promote") return;
  if (confirm !== sha.slice(0, 12)) throw new Error(`CONFIRM_REQUIRED: pass --confirm=${sha.slice(0, 12)} to ${mode}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", shell: false, ...options });
  return { status: result.status, out: (result.stdout ?? "").trim(), err: (result.stderr ?? "").trim() };
}
const must = (command, args, options) => {
  const result = run(command, args, options);
  if (result.status !== 0) throw new Error(`${command} ${args.slice(0, 2).join(" ")} failed: ${result.err.slice(-400)}`);
  return result.out;
};

const tagExists = (tag) => run("docker", ["manifest", "inspect", tag]).status === 0;
const remoteDigest = (tag) => {
  const result = run("docker", ["buildx", "imagetools", "inspect", tag, "--format", "{{.Manifest.Digest}}"]);
  return result.status === 0 ? result.out : null;
};

let DRY = false;
const mutate = (args, options) => {
  if (DRY) { console.log(`  [dry-run] docker ${args.join(" ")}`); return ""; }
  return must("docker", args, options);
};

function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const options = parseArgs(process.argv.slice(2));
  DRY = options.dryRun;
  const sha = must("git", ["rev-parse", "--verify", `${options.ref}^{commit}`], { cwd: repoRoot });
  assertConfirmed(options.mode, options.confirm, sha);
  const recordFile = path.join(repoRoot, ".artifacts/releases", `${sha.slice(0, 12)}.json`);
  const record = fs.existsSync(recordFile) ? JSON.parse(fs.readFileSync(recordFile, "utf8")) : { sha, images: {} };

  console.log(`Commit ${sha}\nMode ${options.mode}`);
  for (const key of options.images) console.log(`  ${key}: ${shaTag(key, sha)}${options.mode === "promote" ? ` -> ${latestTag(key)}` : ""}`);
  if (options.mode === "plan") {
    console.log("Plan only: nothing was built, pushed or retagged. -latest tags are untouched unless --promote is used.");
    return;
  }

  if (options.mode === "build") {
    const source = path.join(repoRoot, ".artifacts/releases", `${sha.slice(0, 12)}-source`);
    fs.rmSync(source, { recursive: true, force: true });
    fs.mkdirSync(source, { recursive: true });
    // Relative paths: GNU tar on Windows reads "D:" as a remote host.
    const archive = path.join(path.dirname(source), `${sha.slice(0, 12)}.tar`);
    must("git", ["archive", "--format=tar", "--output", archive, sha], { cwd: repoRoot });
    must("tar", ["-xf", path.relative(repoRoot, archive).split(path.sep).join("/"), "-C", path.relative(repoRoot, source).split(path.sep).join("/")], { cwd: repoRoot });
    for (const key of options.images) {
      const extra = key === "web" ? ["--build-arg", "VITE_RUNLY_API_URL=http://localhost:4010"] : [];
      must("docker", ["build", "--pull=false", ...extra, "-f", path.join(source, `infra/docker/${key}.Dockerfile`), "-t", shaTag(key, sha), source], { cwd: repoRoot, stdio: "inherit" });
      record.images[key] = { ...record.images[key], tag: shaTag(key, sha), localImageId: must("docker", ["inspect", "--format", "{{.Id}}", shaTag(key, sha)]) };
    }
  }

  if (options.mode === "push") {
    // Refuse before pushing anything if any selected tag is taken: a published SHA tag is immutable.
    const taken = DRY ? [] : options.images.filter((key) => tagExists(shaTag(key, sha)));
    if (taken.length) throw new Error(`TAG_EXISTS: ${taken.map((key) => shaTag(key, sha)).join(", ")}`);
    for (const key of options.images) {
      mutate(["push", shaTag(key, sha)], { stdio: "inherit" });
      if (!DRY) record.images[key] = { ...record.images[key], tag: shaTag(key, sha), digest: remoteDigest(shaTag(key, sha)) };
    }
  }

  if (options.mode === "promote") {
    for (const key of options.images) {
      const digest = DRY ? "sha256:<recorded-by-push>" : record.images[key]?.digest;
      if (!digest) throw new Error(`NOT_PUSHED: ${key} has no recorded digest; run --push first`);
      const previous = DRY ? null : remoteDigest(latestTag(key));
      mutate(["buildx", "imagetools", "create", "-t", latestTag(key), `${REGISTRY}@${digest}`], { stdio: "inherit" });
      if (!DRY) { record.images[key].previousLatestDigest = previous; record.images[key].promotedAt = new Date().toISOString(); }
      console.log(`  rollback ${key}: docker buildx imagetools create -t ${latestTag(key)} ${previous ? `${REGISTRY}@${previous}` : "(no previous digest recorded)"}`);
    }
  }

  if (DRY) { console.log("Dry run: no command executed, no record written."); return; }
  fs.mkdirSync(path.dirname(recordFile), { recursive: true });
  fs.writeFileSync(recordFile, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`Record: ${path.relative(repoRoot, recordFile)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exit(1); }
}
