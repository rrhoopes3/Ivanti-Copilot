import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertQuery,
  boundedInt,
  getHeader,
  getMethod,
  getPath,
  parseJsonBody,
  resolveCorsOrigin,
  ValidationError
} from "../src/http";
import { ApiGatewayEvent } from "../src/types";

test("boundedInt clamps and falls back", () => {
  assert.equal(boundedInt(3, 5, 10), 3);
  assert.equal(boundedInt(50, 5, 10), 10);
  assert.equal(boundedInt(undefined, 5, 10), 5);
  assert.equal(boundedInt(0, 5, 10), 5);
  assert.equal(boundedInt("7", 5, 10), 7);
});

test("assertQuery requires three or more characters", () => {
  assert.equal(assertQuery("  vpn reset "), "vpn reset");
  assert.throws(() => assertQuery("ab"), ValidationError);
  assert.throws(() => assertQuery(123 as unknown), ValidationError);
});

test("parseJsonBody handles json, base64, and errors", () => {
  assert.deepEqual(parseJsonBody<{ a: number }>({ body: '{"a":1}' } as ApiGatewayEvent), { a: 1 });

  const encoded = Buffer.from('{"a":2}').toString("base64");
  assert.deepEqual(
    parseJsonBody<{ a: number }>({ body: encoded, isBase64Encoded: true } as ApiGatewayEvent),
    { a: 2 }
  );

  assert.throws(() => parseJsonBody({ body: "{bad" } as ApiGatewayEvent), ValidationError);
  assert.throws(() => parseJsonBody({ body: null } as ApiGatewayEvent), ValidationError);
});

test("getHeader is case-insensitive", () => {
  const event = { headers: { "X-Correlation-Id": "abc" } } as unknown as ApiGatewayEvent;
  assert.equal(getHeader(event, "x-correlation-id"), "abc");
  assert.equal(getHeader(event, "missing"), undefined);
});

test("getMethod and getPath read v1 and v2 event shapes", () => {
  const v2 = { rawPath: "/v1/x", requestContext: { http: { method: "post", path: "/v1/x" } } } as ApiGatewayEvent;
  assert.equal(getMethod(v2), "POST");
  assert.equal(getPath(v2), "/v1/x");

  const v1 = { path: "/health", httpMethod: "get" } as ApiGatewayEvent;
  assert.equal(getMethod(v1), "GET");
  assert.equal(getPath(v1), "/health");
});

test("resolveCorsOrigin honors the allowlist", () => {
  assert.equal(resolveCorsOrigin(["*"], "https://a.com"), "*");
  assert.equal(resolveCorsOrigin(["https://a.com", "https://b.com"], "https://b.com"), "https://b.com");
  assert.equal(resolveCorsOrigin(["https://a.com"], "https://evil.com"), "https://a.com");
  assert.equal(resolveCorsOrigin(["https://a.com"], undefined), "https://a.com");
});
