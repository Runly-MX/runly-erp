import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import * as featureModules from "../feature-modules.js";
import { coreModules } from "../core-modules.js";

const repoRoot = new URL("../../../../../../", import.meta.url);

async function readRepoFile(path) {
  return readFile(new URL(path, repoRoot), "utf8");
}

test("Prisma declares the storefront capture foundation without raw IP storage", async () => {
  const schema = await readRepoFile("prisma/schema.prisma");

  for (const model of [
    "GrowthVisitor",
    "GrowthSession",
    "GrowthEvent",
    "GrowthLead",
    "GrowthLeadActivity",
    "GrowthDailyMetric",
  ]) {
    assert.match(schema, new RegExp(`model ${model} \\{`));
  }

  assert.match(schema, /analyticsMode\s+String\s+@default\("off"\)/);
  assert.match(schema, /turnstileSiteKey\s+String\?/);
  assert.match(schema, /turnstileSecretKey\s+String\?/);
  assert.match(schema, /createsLead\s+Boolean\s+@default\(true\)/);
  assert.match(schema, /defaultAssigneeUserId\s+String\?/);
  assert.match(schema, /semanticKey\s+String\?/);
  assert.match(schema, /idempotencyKey\s+String/);
  assert.match(schema, /visitorKeyHash\s+String/);
  assert.match(schema, /sessionKeyHash\s+String/);
  assert.match(schema, /clientOccurredAt\s+DateTime/);
  assert.match(schema, /serverReceivedAt\s+DateTime/);
  assert.match(schema, /dimensionType\s+String/);
  assert.match(schema, /dimensionKey\s+String/);
  assert.doesNotMatch(schema, /submitterIp/);
});

test("forward migration creates capture tables and idempotency constraints", async () => {
  const migration = await readRepoFile(
    "prisma/migrations/20260614180000_add_storefront_capture_foundation/migration.sql",
  );

  for (const table of [
    "growth_visitor",
    "growth_session",
    "growth_event",
    "growth_lead",
    "growth_lead_activity",
    "growth_daily_metric",
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  }

  assert.match(
    migration,
    /CREATE UNIQUE INDEX "growth_event_site_idempotency_key_key"/,
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "website_form_submission_form_id_idempotency_key_key"/,
  );
  assert.match(migration, /DROP COLUMN "submitter_ip"/);
});

test("runly.growth is an official core module with analytics, leads, sites and forms navigation", () => {
  const manifest = featureModules.runlyGrowthManifest;

  assert.ok(manifest);
  assert.equal(manifest.key, "runly.growth");
  assert.equal(manifest.core, true);
  assert.equal(manifest.icon, "TrendingUp");
  assert.equal(manifest.color, "#7C3AED");
  assert.deepEqual(manifest.navigation, [
    {
      label: "Crecimiento",
      path: "/",
      icon: "TrendingUp",
      layout: "main",
      permissionKey: "growth.analytics.read",
    },
    {
      label: "Leads",
      path: "/leads",
      icon: "UserRoundSearch",
      layout: "main",
      permissionKey: "growth.leads.read",
    },
    {
      label: "Sitios conectados",
      path: "/sites",
      icon: "Globe",
      layout: "main",
      permissionKey: "growth.access",
    },
    {
      label: "Formularios",
      path: "/forms",
      icon: "FileText",
      layout: "main",
      permissionKey: "growth.forms.read",
    },
  ]);
  assert.ok(coreModules.some((moduleManifest) => moduleManifest.key === "runly.growth"));

  const permissionKeys = new Set(
    manifest.permissions.map((permission) => permission.key),
  );
  for (const permissionKey of [
    "growth.access",
    "growth.leads.read",
    "growth.leads.create",
    "growth.leads.update",
    "growth.leads.delete",
    "growth.leads.assign",
    "growth.leads.convert",
    "growth.analytics.read",
    "growth.analytics.export",
    "growth.forms.read",
  ]) {
    assert.equal(permissionKeys.has(permissionKey), true, permissionKey);
  }
  for (const entry of manifest.navigation) {
    assert.equal(permissionKeys.has(entry.permissionKey), true, entry.path);
  }
});
