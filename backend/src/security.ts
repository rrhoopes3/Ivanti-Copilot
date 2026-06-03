import { createRemoteJWKSet, jwtVerify, JWTPayload } from "jose";
import { AppConfig, ApiGatewayEvent } from "./types";
import { ResolvedSecrets } from "./secrets";
import { getHeader } from "./http";

export interface AuthContext {
  caller: string;
}

export interface AuthResult {
  ok: boolean;
  context?: AuthContext;
  message?: string;
}

type RemoteJwks = ReturnType<typeof createRemoteJWKSet>;

let jwks: RemoteJwks | undefined;
let jwksUri: string | undefined;

/**
 * Authorizes a request in layers:
 *   1. Optional shared-secret header (narrow IT-only pilot).
 *   2. Entra ID JWT validation when ENTRA_TENANT_ID and ENTRA_AUDIENCE are set:
 *      signature is verified against the tenant JWKS, and issuer/audience/expiry
 *      are enforced.
 *   3. Fail closed if a token is required but Entra validation is not configured.
 *   4. Otherwise allow (dev/pilot), deriving the caller best-effort.
 */
export async function authorizeRequest(
  event: ApiGatewayEvent,
  config: AppConfig,
  secrets: ResolvedSecrets
): Promise<AuthResult> {
  if (secrets.internalSharedSecret) {
    const provided = getHeader(event, "x-internal-shared-secret");
    if (provided !== secrets.internalSharedSecret) {
      return { ok: false, message: "Invalid internal pilot secret." };
    }
  }

  if (config.entraTenantId && config.entraAudience) {
    const token = bearerToken(event);
    if (!token) {
      return { ok: false, message: "Bearer token is required." };
    }

    try {
      const issuer = config.entraIssuer ?? `https://login.microsoftonline.com/${config.entraTenantId}/v2.0`;
      const { payload } = await jwtVerify(token, getJwks(config.entraTenantId), {
        issuer,
        audience: config.entraAudience
      });
      return { ok: true, context: { caller: callerFromClaims(payload) } };
    } catch {
      return { ok: false, message: "Invalid or expired token." };
    }
  }

  if (config.requireBearerToken) {
    return { ok: false, message: "Authentication is required but Entra ID validation is not configured." };
  }

  return { ok: true, context: { caller: resolveCaller(event) } };
}

function getJwks(tenantId: string): RemoteJwks {
  const uri = `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`;
  if (!jwks || jwksUri !== uri) {
    jwks = createRemoteJWKSet(new URL(uri));
    jwksUri = uri;
  }
  return jwks;
}

function bearerToken(event: ApiGatewayEvent): string | undefined {
  const authorization = getHeader(event, "authorization");
  if (!authorization) {
    return undefined;
  }

  const [scheme, token] = authorization.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : undefined;
}

function callerFromClaims(payload: JWTPayload): string {
  const claim = payload.preferred_username ?? payload.upn ?? payload.email ?? payload.sub;
  return typeof claim === "string" && claim ? claim : "unknown";
}

function resolveCaller(event: ApiGatewayEvent): string {
  const jwtClaims = event.requestContext?.authorizer?.jwt?.claims;
  const legacyClaims = event.requestContext?.authorizer?.claims;
  const claims = jwtClaims ?? legacyClaims ?? {};

  const preferred = claims.preferred_username ?? claims.upn ?? claims.email ?? claims.sub;
  return typeof preferred === "string" && preferred ? preferred : "unknown";
}
