import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { AppConfig } from "./types";

export interface ResolvedSecrets {
  ivantiAuthHeaderValue: string;
  internalSharedSecret?: string;
}

let cached: ResolvedSecrets | undefined;
let client: SecretsManagerClient | undefined;

/**
 * Resolves runtime credentials, preferring environment variables (local dev,
 * Docker, pilot) and falling back to AWS Secrets Manager when IVANTI_SECRET_ARN
 * is set. The result is cached in module scope so warm Lambda/container
 * invocations do not re-fetch.
 */
export async function resolveSecrets(config: AppConfig): Promise<ResolvedSecrets> {
  if (cached) {
    return cached;
  }

  const envAuth = process.env.IVANTI_AUTH_HEADER_VALUE;
  const envShared = process.env.INTERNAL_SHARED_SECRET || undefined;

  if (envAuth) {
    cached = { ivantiAuthHeaderValue: envAuth, internalSharedSecret: envShared };
    return cached;
  }

  if (config.ivantiSecretArn) {
    const fetched = await fetchSecret(config.ivantiSecretArn, config.awsRegion);
    cached = {
      ivantiAuthHeaderValue: fetched.ivantiAuthHeaderValue ?? "",
      internalSharedSecret: fetched.internalSharedSecret ?? envShared
    };
    return cached;
  }

  cached = { ivantiAuthHeaderValue: "", internalSharedSecret: envShared };
  return cached;
}

/** Clears the module-scope cache. Intended for tests. */
export function resetSecretsCache(): void {
  cached = undefined;
}

async function fetchSecret(secretArn: string, region?: string): Promise<Partial<ResolvedSecrets>> {
  if (!client) {
    client = new SecretsManagerClient(region ? { region } : {});
  }

  const response = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const raw = response.SecretString;
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ResolvedSecrets>;
    return {
      ivantiAuthHeaderValue: parsed.ivantiAuthHeaderValue,
      internalSharedSecret: parsed.internalSharedSecret
    };
  } catch {
    // A non-JSON secret is treated as the raw Ivanti auth header value.
    return { ivantiAuthHeaderValue: raw };
  }
}
