import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  collectPublicHttpsHosts,
  configureHairpinNat,
  detectHairpinHosts,
  renderHairpinComposeOverride,
} from "../lib/hairpin-nat.mjs";

// probe stub: results keyed by "public:<host>" / "loopback:<host>".
function stubProbe(results) {
  return async ({ hostname, address }) =>
    results[`${address ? "loopback" : "public"}:${hostname}`] ?? { ok: false, code: "ECONNREFUSED", error: "refused" };
}

describe("hairpin NAT detection", () => {
  it("collects unique https hostnames and skips http, IPs and localhost", () => {
    assert.deepEqual(
      collectPublicHttpsHosts({
        domains: ["RTC.example.com", undefined],
        urls: ["wss://rtc.example.com", "https://app.example.com/x", "http://localhost:5173", "https://10.0.0.5", "", undefined],
      }),
      ["rtc.example.com", "app.example.com"],
    );
  });

  it("flags a host only when public TLS fails and the local proxy cert is valid", async () => {
    const probe = stubProbe({
      "public:rtc.example.com": { ok: false, code: "DEPTH_ZERO_SELF_SIGNED_CERT", error: "self-signed certificate" },
      "loopback:rtc.example.com": { ok: true, status: 200 },
      "public:app.example.com": { ok: true, status: 200 },
      "public:other.example.com": { ok: false, code: "DEPTH_ZERO_SELF_SIGNED_CERT", error: "self-signed certificate" },
      "loopback:other.example.com": { ok: false, code: "ECONNREFUSED", error: "refused" },
    });
    const detected = await detectHairpinHosts(["rtc.example.com", "app.example.com", "other.example.com"], { probe });
    assert.deepEqual(detected.map((item) => item.hostname), ["rtc.example.com"]);
  });

  it("writes the compose override when needed and removes it once loopback works", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "runly-hairpin-"));
    const overrideFile = path.join(dir, "docker-compose.hairpin.yml");
    const log = () => {};
    const broken = await configureHairpinNat({
      hostnames: ["rtc.example.com"],
      overrideFile,
      log,
      probe: stubProbe({
        "public:rtc.example.com": { ok: false, code: "DEPTH_ZERO_SELF_SIGNED_CERT", error: "self-signed certificate" },
        "loopback:rtc.example.com": { ok: true, status: 404 },
      }),
    });
    assert.deepEqual(broken.composeArgs, ["-f", overrideFile]);
    assert.match(await fs.readFile(overrideFile, "utf8"), /runly-api-local:\n\s+extra_hosts:\n\s+- "rtc\.example\.com:host-gateway"/);

    const healthy = await configureHairpinNat({
      hostnames: ["rtc.example.com"],
      overrideFile,
      log,
      probe: stubProbe({ "public:rtc.example.com": { ok: true, status: 200 } }),
    });
    assert.deepEqual(healthy, { hostnames: [], composeArgs: [] });
    await assert.rejects(fs.access(overrideFile));
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("renders every server-side service, host-network ones via 127.0.0.1", () => {
    const yaml = renderHairpinComposeOverride(["a.example.com"], { hostNetworkServices: ["egress"] });
    for (const service of ["runly-api-local", "runly-worker-local", "runly-api-external", "runly-worker-external",
      "runly-transcriber-local", "runly-backup-local", "collabora"]) {
      assert.match(yaml, new RegExp(`  ${service}:\\n    extra_hosts:\\n      - "a\\.example\\.com:host-gateway"`));
    }
    assert.match(yaml, /  egress:\n    extra_hosts:\n      - "a\.example\.com:127\.0\.0\.1"/);
    assert.match(renderHairpinComposeOverride(["a.example.com"]), /  egress:\n    extra_hosts:\n      - "a\.example\.com:host-gateway"/);
  });
});
