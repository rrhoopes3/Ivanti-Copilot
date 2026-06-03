import { ApiGatewayEvent, ApiGatewayResponse } from "./types";

export function getHeader(event: ApiGatewayEvent, name: string): string | undefined {
  const headers = event.headers ?? {};
  const expected = name.toLowerCase();
  const match = Object.entries(headers).find(([key]) => key.toLowerCase() === expected);
  return match?.[1];
}

export function json(statusCode: number, payload: unknown, correlationId?: string): ApiGatewayResponse {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization,content-type,x-correlation-id,x-internal-shared-secret",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      ...(correlationId ? { "X-Correlation-Id": correlationId } : {})
    },
    body: JSON.stringify(payload)
  };
}

export function parseJsonBody<T>(event: ApiGatewayEvent): T {
  if (!event.body) {
    throw new ValidationError("Request body is required.");
  }

  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }
}

export function getMethod(event: ApiGatewayEvent): string {
  return (event.requestContext?.http?.method ?? event.httpMethod ?? "GET").toUpperCase();
}

export function getPath(event: ApiGatewayEvent): string {
  return event.rawPath ?? event.path ?? event.requestContext?.http?.path ?? "/";
}

export function boundedInt(value: unknown, fallback: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(Math.floor(parsed), max);
}

export function assertQuery(value: unknown): string {
  if (typeof value !== "string" || value.trim().length < 3) {
    throw new ValidationError("query must be a string with at least 3 characters.");
  }

  return value.trim();
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function resolveCorsOrigin(allowedOrigins: string[], requestOrigin?: string): string {
  if (allowedOrigins.includes("*")) {
    return "*";
  }

  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }

  return allowedOrigins[0] ?? "*";
}

export function withCors(response: ApiGatewayResponse, origin: string): ApiGatewayResponse {
  response.headers["Access-Control-Allow-Origin"] = origin;
  if (origin !== "*") {
    response.headers["Vary"] = "Origin";
  }
  return response;
}

