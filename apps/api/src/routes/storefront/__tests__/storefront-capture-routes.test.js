import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { StorefrontCaptureError } from "../../../services/storefront-capture-service.js";
import { createPublicFormsRouter } from "../../website/forms-public-routes.js";
import {
  createStorefrontCaptureRoutes,
  createTokenBucketLimiter,
} from "../storefront-capture-routes.js";

const SITE_ID = "01900000-0000-7000-8000-000000000002";
const FORM_ID = "01900000-0000-7000-8000-000000000003";

function createCaptureService(overrides = {}) {
  return {
    getPublicConfig: async () => ({
      siteId: SITE_ID,
      analyticsMode: "anonymous",
      respectDoNotTrack: true,
      turnstileSiteKey: null,
      capabilities: { analytics: true, forms: true },
    }),
    captureEvents: async ({ payload }) => {
      if (payload.events.length > 50) {
        throw new StorefrontCaptureError(
          "invalid_event_batch",
          "Demasiados eventos.",
          422,
        );
      }
      return { accepted: payload.events.length, rejected: [] };
    },
    getPublicForm: async () => ({
      id: FORM_ID,
      name: "Contacto",
      description: "Escribenos",
      submitLabel: "Enviar",
      successMessage: "Gracias",
      turnstileRequired: true,
      defaultAssigneeUserId: "private-user-id",
      notifyEmail: "private@example.com",
      fields: [
        {
          id: "field-1",
          name: "email",
          label: "Correo",
          fieldType: "email",
          semanticKey: "email",
          placeholder: null,
          required: true,
          options: null,
          sortOrder: 0,
          enabled: true,
        },
      ],
    }),
    submitForm: async ({ idempotencyKey }) => ({
      submissionId: "submission-1",
      leadId: "lead-1",
      message: "Gracias",
      replayed: idempotencyKey === "replay",
    }),
    ...overrides,
  };
}

function headers(extra = {}) {
  return {
    "Content-Type": "application/json",
    "X-Runly-Company": "acme",
    "X-Runly-Site": SITE_ID,
    Origin: "https://shop.example.com",
    ...extra,
  };
}

describe("storefront capture v1 routes", () => {
  it("serves public config and enabled form metadata without private fields", async () => {
    const app = createStorefrontCaptureRoutes({
      captureService: createCaptureService(),
    });

    const configResponse = await app.request("http://localhost/config", {
      headers: headers(),
    });
    assert.equal(configResponse.status, 200);
    const config = await configResponse.json();
    assert.equal(config.data.siteId, SITE_ID);

    const formResponse = await app.request(
      `http://localhost/forms/${FORM_ID}`,
      { headers: headers() },
    );
    assert.equal(formResponse.status, 200);
    const form = await formResponse.json();
    assert.equal(form.data.fields.length, 1);
    assert.equal(form.data.defaultAssigneeUserId, undefined);
    assert.equal(form.data.notifyEmail, undefined);
  });

  it("accepts event batches with 202 and rejects more than 50 events", async () => {
    const app = createStorefrontCaptureRoutes({
      captureService: createCaptureService(),
    });
    const event = {
      id: "event-1",
      name: "page_view",
      occurredAt: "2026-06-14T18:00:00.000Z",
    };

    const accepted = await app.request("http://localhost/events/batch", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        visitorId: "visitor",
        sessionId: "session",
        consent: "granted",
        events: [event],
      }),
    });
    assert.equal(accepted.status, 202);
    assert.equal((await accepted.json()).data.accepted, 1);

    const rejected = await app.request("http://localhost/events/batch", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        visitorId: "visitor",
        sessionId: "session",
        consent: "granted",
        events: Array.from({ length: 51 }, (_, index) => ({
          ...event,
          id: `event-${index}`,
        })),
      }),
    });
    assert.equal(rejected.status, 422);
  });

  it("accepts company and site query scope for sendBeacon requests", async () => {
    let receivedScope = null;
    const app = createStorefrontCaptureRoutes({
      captureService: createCaptureService({
        captureEvents: async (input) => {
          receivedScope = input;
          return { accepted: input.payload.events.length, rejected: [] };
        },
      }),
    });

    const response = await app.request(
      `http://localhost/events/batch?company=acme&siteId=${SITE_ID}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=UTF-8",
          Origin: "https://shop.example.com",
        },
        body: JSON.stringify({
          visitorId: "visitor",
          sessionId: "session",
          consent: "granted",
          events: [
            {
              id: "event-beacon",
              name: "page_view",
              occurredAt: "2026-06-14T18:00:00.000Z",
            },
          ],
        }),
      },
    );

    assert.equal(response.status, 202);
    assert.equal(receivedScope.companySlug, "acme");
    assert.equal(receivedScope.siteId, SITE_ID);
  });

  it("passes only the optional profile resolved for the request company", async () => {
    let receivedProfileId = null;
    const app = createStorefrontCaptureRoutes({
      captureService: createCaptureService({
        captureEvents: async ({ authenticatedProfileId }) => {
          receivedProfileId = authenticatedProfileId;
          return { accepted: 1, rejected: [] };
        },
      }),
      resolveAuthenticatedProfile: async () => "profile-1",
    });

    const response = await app.request("http://localhost/events/batch", {
      method: "POST",
      headers: headers({ Authorization: "Bearer token" }),
      body: JSON.stringify({
        visitorId: "visitor",
        sessionId: "session",
        consent: "granted",
        events: [
          {
            id: "event-1",
            name: "page_view",
            occurredAt: "2026-06-14T18:00:00.000Z",
          },
        ],
      }),
    });

    assert.equal(response.status, 202);
    assert.equal(receivedProfileId, "profile-1");
  });

  it("returns 201 for a new submission and 200 for an idempotent replay", async () => {
    const app = createStorefrontCaptureRoutes({
      captureService: createCaptureService(),
    });
    const body = JSON.stringify({
      values: { email: "ana@example.com" },
      honeypot: "",
    });

    const created = await app.request(
      `http://localhost/forms/${FORM_ID}/submissions`,
      {
        method: "POST",
        headers: headers({ "Idempotency-Key": "new" }),
        body,
      },
    );
    assert.equal(created.status, 201);

    const replay = await app.request(
      `http://localhost/forms/${FORM_ID}/submissions`,
      {
        method: "POST",
        headers: headers({ "Idempotency-Key": "replay" }),
        body,
      },
    );
    assert.equal(replay.status, 200);
  });

  it("rejects bodies above 64 KB before calling the service", async () => {
    let calls = 0;
    const app = createStorefrontCaptureRoutes({
      captureService: createCaptureService({
        captureEvents: async () => {
          calls += 1;
          return { accepted: 1, rejected: [] };
        },
      }),
    });

    const response = await app.request("http://localhost/events/batch", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ value: "x".repeat(65 * 1024) }),
    });

    assert.equal(response.status, 413);
    assert.equal(calls, 0);
  });

  it("maps origin errors and rate limits to 403 and 429", async () => {
    const deniedLimiter = { consume: () => ({ allowed: false, retryAfter: 7 }) };
    const rateLimited = createStorefrontCaptureRoutes({
      captureService: createCaptureService(),
      eventLimiter: deniedLimiter,
    });
    const limitedResponse = await rateLimited.request(
      "http://localhost/events/batch",
      {
        method: "POST",
        headers: headers(),
        body: "{}",
      },
    );
    assert.equal(limitedResponse.status, 429);
    assert.equal(limitedResponse.headers.get("Retry-After"), "7");

    const forbidden = createStorefrontCaptureRoutes({
      captureService: createCaptureService({
        getPublicConfig: async () => {
          throw new StorefrontCaptureError(
            "origin_forbidden",
            "Origen no permitido.",
            403,
          );
        },
      }),
    });
    const forbiddenResponse = await forbidden.request(
      "http://localhost/config",
      { headers: headers() },
    );
    assert.equal(forbiddenResponse.status, 403);
  });

  it("keeps the token bucket bounded and refills capacity", () => {
    let currentTime = 0;
    const limiter = createTokenBucketLimiter({
      capacity: 1,
      refillPerSecond: 1,
      maxEntries: 2,
      now: () => currentTime,
    });

    assert.equal(limiter.consume("a").allowed, true);
    assert.equal(limiter.consume("a").allowed, false);
    currentTime = 1000;
    assert.equal(limiter.consume("a").allowed, true);
    limiter.consume("b");
    limiter.consume("c");
    assert.ok(limiter.size() <= 2);
  });
});

describe("deprecated website form adapter", () => {
  it("delegates to the capture service and emits deprecation headers", async () => {
    const calls = [];
    const app = createPublicFormsRouter({
      prisma: {
        websiteFormScope:{findFirst:async()=>({ownerKind:'website',ownerWebsiteSiteId:SITE_ID})},
        websiteForm: {
          findFirst: async () => ({
            id: FORM_ID,
            companyId: "company-1",
            siteId: SITE_ID,
          }),
        },
        company: {
          findUnique: async () => ({ slug: "acme" }),
        },
      },
      captureService: createCaptureService({
        submitForm: async (input) => {
          calls.push(input);
          return {
            submissionId: "submission-1",
            leadId: "lead-1",
            message: "Gracias",
            replayed: false,
          };
        },
      }),
    });

    const response = await app.request(
      `http://localhost/forms/${FORM_ID}/submit`,
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ email: "ana@example.com" }),
      },
    );

    assert.equal(response.status, 201);
    assert.equal(response.headers.get("Deprecation"), "true");
    assert.equal(
      response.headers.get("Sunset"),
      "Wed, 30 Sep 2026 00:00:00 GMT",
    );
    assert.match(response.headers.get("Link"), /successor-version/);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].payload.values, {
      email: "ana@example.com",
    });
  });
});
