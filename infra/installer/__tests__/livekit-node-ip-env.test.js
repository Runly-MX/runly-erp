import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import vm from "node:vm";
import * as livekit from "../lib/livekit-config.mjs";
import * as envCompat from "../lib/env-compat.mjs";
import { parseOfficeEnv, OFFICE_ENV_KEYS } from "../lib/office-config.mjs";
import * as backupConfig from "../lib/backup-config.mjs";

// Evaluate only selected top-level declarations, never imports or main().
// The tested env readers, writers and artifact generator are the actual source.
function declaration(source, name, kind = "function") {
  const pattern = kind === "function"
    ? new RegExp(`^(?:async )?function ${name}\\([\\s\\S]*?^\\}`, "m")
    : new RegExp(`^const ${name} = \\[[\\s\\S]*?^\\];`, "m");
  const match = source.match(pattern);
  assert.ok(match, `Missing top-level declaration: ${name}`);
  return match[0];
}

async function harness(t, deployment, { isLinux = true, environment = {} } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "runly-rtc-test-"));
  t.after(async () => {
    // Verify the exact temporary target before recursive cleanup on Windows.
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("runly-rtc-test-"));
    await fs.rm(root, { recursive: true, force: true });
  });
  const envFile = path.join(root, `.env.${deployment}`);
  const yamlFile = path.join(root, "livekit", "livekit.yaml");
  const source = await fs.readFile(new URL(`../setup-${deployment}.mjs`, import.meta.url), "utf8");
  const envExampleFile = path.join(root, `.env.${deployment}.example`);
  await fs.copyFile(new URL(`../.env.${deployment}.example`, import.meta.url), envExampleFile);
  const context = vm.createContext({
    fs, path, crypto, ...livekit, ...envCompat, ...backupConfig, parseOfficeEnv, OFFICE_ENV_KEYS,
    process: { env: { ...environment } }, console: { log() {}, warn() {} },
    isLinux, installerDir: root, localEnvFile: envFile, envExampleFile,
    liveKitConfigFile: yamlFile,
    liveKitEgressConfigFile: path.join(root, "livekit", "egress.yaml"),
    liveKitCaddyFile: path.join(root, "livekit", "Caddyfile"),
    legacyLiveKitExternalProxyFile: path.join(root, "livekit", "legacy.conf"),
    // Unrelated installer services are isolated; none can start containers or connect.
    resolveSupabaseView: async () => ({
      mode: "cli-dev", defaultPublicUrl: "https://data.example.com", internalUrl: "https://data.example.com",
      anonKey: "fixture-anon", serviceRoleKey: "fixture-service", jwtSecret: "fixture-jwt",
      dbUrl: "postgresql://fixture:fixture@db.example.com/runly",
    }),
    renderSelfHostedSupabaseEnv: () => "",
    renderInstanceIdentityEnv: () => "RUNLY_INSTANCE_ID=rtc-test",
    preserveFirebaseEnv: () => "",
    configureOffice: async () => ({}), configureFirebase: async () => {},
    promptForLiveKitDomain: () => { throw new Error("Unexpected prompt"); },
  });
  const names = ["parseEnvValue", "writeLiveKitArtifacts"];
  if (deployment === "local") {
    names.push("resolveMailerAutoconfirm", "composeInterpolationEnvLines", "writeLocalEnv");
  } else {
    names.push("hasEnvKey", "appendMissingOptionalVars", "setEnvValue", "configureLiveKit", "composeInterpolationEnvLines", "writeComposeEnv");
  }
  vm.runInContext([
    declaration(source, deployment === "local" ? "COMPOSE_INTERPOLATION_KEYS" : "OPTIONAL_VAR_GROUPS", "const"),
    ...(deployment === "external" ? [declaration(source, "COMPOSE_INTERPOLATION_KEYS", "const")] : []),
    ...names.map((name) => declaration(source, name)),
  ].join("\n"), context);
  return {
    envFile, yamlFile, composeEnvFile: path.join(root, '.env'),
    readEnv: () => fs.readFile(envFile, "utf8"),
    writeEnv: (text) => fs.writeFile(envFile, text, "utf8"),
    value: (text, key) => context.parseEnvValue(text, key),
    setValue: async (key, value) => {
      const text = await fs.readFile(envFile, "utf8");
      await fs.writeFile(envFile, text.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`));
    },
    run: async () => {
      if (deployment === "local") return (await context.writeLocalEnv({}, {})).liveKit;
      // Actual upgrade sequence: placeholders must not mask an absent-key fallback.
      await context.appendMissingOptionalVars(envFile);
      const config = await context.configureLiveKit(envFile);
      await context.writeComposeEnv(envFile);
      await context.syncMissingEnvFile(envFile, envExampleFile, { log() {} });
      return config;
    },
  };
}

function initialEnv(nodeIpLine, mode = "embedded") {
  return [
    `LIVEKIT_MODE=${mode}`, "LIVEKIT_DOMAIN=rtc.example.com", "LIVEKIT_TLS_MODE=external",
    "LIVEKIT_URL=wss://rtc.example.com", "LIVEKIT_API_KEY=fixture-key", "LIVEKIT_API_SECRET=fixture-secret",
    "GOOGLE_OAUTH_ENCRYPTION_KEY=fixture-oauth", nodeIpLine, "",
  ].filter((line) => line !== undefined).join("\n");
}

for (const deployment of ["local", "external"]) {
  describe(`RTC env persistence: ${deployment}`, () => {
    it('upgrade adds MCP declarations and preserves configured values through repeated real writes', async t => {
      const h = await harness(t, deployment, { environment: { RUNLY_MCP_ENABLED: 'false', RUNLY_MCP_PUBLIC_URL: 'https://override.example/mcp' } });
      const mcp = 'RUNLY_MCP_ENABLED=true\n  export RUNLY_MCP_PUBLIC_URL = "https://erp.example/mcp" # unchanged\nRUNLY_MCP_WEB_URL=\n';
      await h.writeEnv(initialEnv('LIVEKIT_NODE_IP=') + mcp + 'CUSTOM_CREDENTIAL="fixture-only-value"\n');
      await fs.writeFile(h.composeEnvFile, 'RUNLY_MCP_ALLOWED_ORIGINS="https://custom.example"\nCUSTOM_COMPOSE=value\n');
      for (let pass = 0; pass < 2; pass++) {
        await h.run();
        const stored = await h.readEnv();
        for (const entry of envCompat.envAssignments(mcp)) assert.ok(stored.includes(entry.raw));
        assert.match(stored, /^CUSTOM_CREDENTIAL="fixture-only-value"$/m);
        for (const key of ['RUNLY_MCP_ENABLED', 'RUNLY_MCP_PUBLIC_URL', 'RUNLY_MCP_WEB_URL', 'RUNLY_MCP_ALLOWED_ORIGINS']) {
          assert.equal(envCompat.envAssignments(stored).filter(entry => entry.key === key).length, 1);
        }
        const compose = await fs.readFile(h.composeEnvFile, 'utf8');
        assert.match(compose, /^RUNLY_MCP_ALLOWED_ORIGINS="https:\/\/custom.example"$/m);
        assert.match(compose, /^CUSTOM_COMPOSE=value$/m);
      }
    });
    const cases = [
      ["stored IP wins", "LIVEKIT_NODE_IP=203.0.113.10", "198.51.100.20", "203.0.113.10"],
      ["empty wins", "LIVEKIT_NODE_IP=", "198.51.100.20", ""],
      ["whitespace wins", 'LIVEKIT_NODE_IP="  "', "198.51.100.20", ""],
      ["absent uses process", undefined, " 198.51.100.20 ", "198.51.100.20"],
      ["absent uses automatic", undefined, undefined, ""],
      ["quoted IPv6", 'LIVEKIT_NODE_IP=" 2001:db8::10 "', undefined, "2001:db8::10"],
    ];
    for (const [label, line, shellIp, expected] of cases) {
      for (const isLinux of [true, false]) {
        it(`${label}, Linux=${isLinux}: persists and renders through two real writes`, async (t) => {
          const h = await harness(t, deployment, { isLinux, environment: { LIVEKIT_NODE_IP: shellIp } });
          await h.writeEnv(initialEnv(line));
          for (let pass = 0; pass < 2; pass++) {
            const config = await h.run();
            const stored = await h.readEnv();
            assert.equal(config.nodeIp, expected);
            assert.equal(h.value(stored, "LIVEKIT_NODE_IP"), expected);
            assert.equal((stored.match(/^LIVEKIT_NODE_IP=/gm) || []).length, 1);
            assert.equal(h.value(stored, "LIVEKIT_API_KEY"), "fixture-key");
            assert.equal(h.value(stored, "LIVEKIT_API_SECRET"), "fixture-secret");
            assert.equal(h.value(stored, "LIVEKIT_URL"), "wss://rtc.example.com");
            const yaml = await fs.readFile(h.yamlFile, "utf8");
            assert.match(yaml, new RegExp(`use_external_ip: ${expected ? "false" : "true"}`));
            if (expected) assert.ok(yaml.includes(`node_ip: "${expected}"`));
            else assert.doesNotMatch(yaml, /node_ip:/);
          }
        });
      }
    }

    it("clears a persisted explicit IP to restore automatic discovery despite a stale process value", async (t) => {
      const h = await harness(t, deployment, { environment: { LIVEKIT_NODE_IP: "198.51.100.20" } });
      await h.writeEnv(initialEnv("LIVEKIT_NODE_IP=203.0.113.10"));
      await h.run();
      await h.setValue("LIVEKIT_NODE_IP", "");
      assert.equal((await h.run()).nodeIp, "");
      assert.match(await fs.readFile(h.yamlFile, "utf8"), /use_external_ip: true/);
      assert.doesNotMatch(await fs.readFile(h.yamlFile, "utf8"), /node_ip:/);
    });

    for (const mode of ["external", "disabled"]) {
      it(`keeps IP but removes local artifacts in ${mode}, then restores embedded configuration`, async (t) => {
        const h = await harness(t, deployment);
        await h.writeEnv(initialEnv("LIVEKIT_NODE_IP=203.0.113.10"));
        await h.run();
        await h.setValue("LIVEKIT_MODE", mode);
        await h.run();
        assert.equal(h.value(await h.readEnv(), "LIVEKIT_NODE_IP"), "203.0.113.10");
        await assert.rejects(fs.readFile(h.yamlFile), { code: "ENOENT" });
        await h.setValue("LIVEKIT_MODE", "embedded");
        await h.run();
        assert.match(await fs.readFile(h.yamlFile, "utf8"), /node_ip: "203\.0\.113\.10"/);
      });
    }

    it("leaves the previous YAML and credentials intact on invalid input", async (t) => {
      const h = await harness(t, deployment);
      await h.writeEnv(initialEnv("LIVEKIT_NODE_IP=203.0.113.10"));
      await h.run();
      const before = await fs.readFile(h.yamlFile, "utf8");
      await h.setValue("LIVEKIT_NODE_IP", "rtc.invalid");
      const envBefore = await h.readEnv();
      await assert.rejects(h.run(), { code: "LIVEKIT_NODE_IP_INVALID" });
      assert.equal(await fs.readFile(h.yamlFile, "utf8"), before);
      assert.equal(await h.readEnv(), envBefore);
    });
  });
}
