import { AppConfig, ApiGatewayEvent } from "./types";
import { getHeader } from "./http";

export interface AuthContext {
  caller: string;
}

export interface AuthResult {
  ok: boolean;
  context?: AuthContext;
  message?: string;
}

export function authorizeRequest(event: ApiGatewayEvent, config: AppConfig): AuthResult {
  if (config.internalSharedSecret) {
    const provided = getHeader(event, "x-internal-shared-secret");
    if (provided !== config.internalSharedSecret) {
      return { ok: false, message: "Invalid internal pilot secret." };
    }
  }

  if (config.requireBearerToken) {
    const authorization = getHeader(event, "authorization");
    if (!authorization?.toLowerCase().startsWith("bearer ")) {
      return { ok: false, message: "Bearer token is required." };
    }
  }

  return {
    ok: true,
    context: {
      caller: resolveCaller(event)
    }
  };
}

function resolveCaller(event: ApiGatewayEvent): string {
  const jwtClaims = event.requestContext?.authorizer?.jwt?.claims;
  const legacyClaims = event.requestContext?.authorizer?.claims;
  const claims = jwtClaims ?? legacyClaims ?? {};

  const preferred = claims.preferred_username ?? claims.upn ?? claims.email ?? claims.sub;
  return typeof preferred === "string" && preferred ? preferred : "unknown";
}

