import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { IvantiApiError, IvantiClient } from "../src/ivantiClient";
import { loadConfig } from "../src/config";
import { ResolvedSecrets } from "../src/secrets";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

const secrets: ResolvedSecrets = { ivantiAuthHeaderValue: "Bearer token" };

function configWithBase(): ReturnType<typeof loadConfig> {
  process.env.IVANTI_BASE_URL = "https://tenant.example.com";
  return loadConfig();
}

test("searchKnowledge maps OData rows and builds a filter", async () => {
  let capturedUrl = "";
  globalThis.fetch = (async (input: URL) => {
    capturedUrl = input.toString();
    const payload = {
      value: [{
        RecId: "1",
        Title: "Reset VPN",
        Summary: "How to reset VPN",
        Body: "<p>step one</p>",
        Status: "Published",
        Category: "Network",
        LastModDateTime: "2026-01-01"
      }]
    };
    return new Response(JSON.stringify(payload), { status: 200 });
  }) as typeof fetch;

  const client = new IvantiClient(configWithBase(), secrets);
  const results = await client.searchKnowledge("vpn reset", 5);

  assert.equal(results.length, 1);
  assert.equal(results[0].title, "Reset VPN");
  assert.ok(results[0].sourceUrl.endsWith("/knowledge/1"));
  assert.equal(results[0].body, undefined);
  assert.ok(results[0].confidence > 0);
  assert.match(capturedUrl, /%24top=5/);
  assert.match(capturedUrl, /contains/);
  assert.match(capturedUrl, /tolower/);
});

test("getKnowledgeArticle includes the body", async () => {
  globalThis.fetch = (async () => {
    const payload = {
      value: [{ RecId: "9", Title: "Printer", Summary: "s", Body: "<b>full body</b>", Status: "Published" }]
    };
    return new Response(JSON.stringify(payload), { status: 200 });
  }) as typeof fetch;

  const client = new IvantiClient(configWithBase(), secrets);
  const article = await client.getKnowledgeArticle("9");
  assert.ok(article);
  assert.equal(article?.body, "full body");
});

test("maps a timeout abort to a 504", async () => {
  globalThis.fetch = (async () => {
    const error = new Error("aborted");
    error.name = "AbortError";
    throw error;
  }) as typeof fetch;

  const client = new IvantiClient(configWithBase(), secrets);
  await assert.rejects(
    client.searchKnowledge("vpn reset", 5),
    (err: unknown) => err instanceof IvantiApiError && err.statusCode === 504
  );
});
