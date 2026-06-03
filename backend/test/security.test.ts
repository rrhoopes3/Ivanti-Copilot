import { test } from "node:test";
import assert from "node:assert/strict";
import { authorizeRequest } from "../src/security";
import { AppConfig, ApiGatewayEvent } from "../src/types";
import { ResolvedSecrets } from "../src/secrets";

function config(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    appEnv: "test",
    logLevel: "info",
    requireBearerToken: false,
    allowedOrigins: ["*"],
    ivantiBaseUrl: "",
    ivantiOdataPath: "/api/odata/businessobject",
    ivantiTimeoutMs: 8000,
    ivantiKnowledgeObject: "KnowledgeArticles",
    ivantiIncidentObject: "Incidents",
    articleUrlTemplate: "",
    knowledgeFields: {
      id: "RecId", title: "Title", summary: "Summary", body: "Body",
      status: "Status", category: "Category", updatedAt: "LastModDateTime"
    },
    incidentFields: {
      id: "RecId", number: "IncidentNumber", subject: "Subject", description: "Symptom",
      resolution: "Resolution", status: "Status", category: "Category", closedAt: "ClosedDateTime"
    },
    ...overrides
  };
}

function event(headers: Record<string, string> = {}): ApiGatewayEvent {
  return { headers };
}

const secrets: ResolvedSecrets = { ivantiAuthHeaderValue: "Bearer x" };

test("rejects a wrong shared secret", async () => {
  const result = await authorizeRequest(
    event({ "x-internal-shared-secret": "nope" }),
    config(),
    { ...secrets, internalSharedSecret: "right" }
  );
  assert.equal(result.ok, false);
});

test("allows a matching shared secret in pilot mode", async () => {
  const result = await authorizeRequest(
    event({ "x-internal-shared-secret": "right" }),
    config(),
    { ...secrets, internalSharedSecret: "right" }
  );
  assert.equal(result.ok, true);
});

test("fails closed when a token is required but Entra is not configured", async () => {
  const result = await authorizeRequest(event(), config({ requireBearerToken: true }), secrets);
  assert.equal(result.ok, false);
});

test("requires a bearer token when Entra is configured", async () => {
  const result = await authorizeRequest(
    event(),
    config({ entraTenantId: "tenant-id", entraAudience: "api://app" }),
    secrets
  );
  assert.equal(result.ok, false);
  assert.match(result.message ?? "", /Bearer token is required/);
});
