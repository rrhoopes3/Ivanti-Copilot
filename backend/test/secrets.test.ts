import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { resetSecretsCache, resolveSecrets } from "../src/secrets";
import { loadConfig } from "../src/config";

beforeEach(() => {
  resetSecretsCache();
  delete process.env.IVANTI_AUTH_HEADER_VALUE;
  delete process.env.INTERNAL_SHARED_SECRET;
  delete process.env.IVANTI_SECRET_ARN;
});

test("prefers environment variables", async () => {
  process.env.IVANTI_AUTH_HEADER_VALUE = "Bearer abc";
  process.env.INTERNAL_SHARED_SECRET = "pilot";

  const secrets = await resolveSecrets(loadConfig());
  assert.equal(secrets.ivantiAuthHeaderValue, "Bearer abc");
  assert.equal(secrets.internalSharedSecret, "pilot");
});

test("returns empty auth when nothing is configured", async () => {
  const secrets = await resolveSecrets(loadConfig());
  assert.equal(secrets.ivantiAuthHeaderValue, "");
  assert.equal(secrets.internalSharedSecret, undefined);
});
