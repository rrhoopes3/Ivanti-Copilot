import { randomUUID } from "crypto";
import { loadConfig } from "./config";
import { assertQuery, boundedInt, getHeader, getMethod, getPath, json, parseJsonBody, ValidationError } from "./http";
import { IvantiApiError, IvantiClient } from "./ivantiClient";
import { authorizeRequest } from "./security";
import { ApiGatewayEvent, ApiGatewayResponse, KnowledgeSearchRequest, SimilarIncidentRequest } from "./types";

export async function handler(event: ApiGatewayEvent): Promise<ApiGatewayResponse> {
  const startedAt = Date.now();
  const correlationId = getHeader(event, "x-correlation-id") ?? event.requestContext?.requestId ?? randomUUID();
  const config = loadConfig();
  const method = getMethod(event);
  const path = getPath(event);

  if (method === "OPTIONS") {
    return json(204, {}, correlationId);
  }

  try {
    if (method === "GET" && path === "/health") {
      return json(200, {
        status: "ok",
        environment: config.appEnv,
        timestamp: new Date().toISOString()
      }, correlationId);
    }

    const auth = authorizeRequest(event, config);
    if (!auth.ok) {
      return json(401, { error: auth.message ?? "Unauthorized", correlationId }, correlationId);
    }

    const client = new IvantiClient(config);

    if (method === "POST" && path === "/v1/knowledge/search") {
      const request = parseJsonBody<KnowledgeSearchRequest>(event);
      const query = assertQuery(request.query);
      const results = await client.searchKnowledge(query, boundedInt(request.maxResults, 5, 10), request.filters);
      return json(200, {
        query,
        results,
        guidance: "Use returned article titles, IDs, and sourceUrl values as citations. If results are weak, say no approved knowledge source was found."
      }, correlationId);
    }

    const articleMatch = path.match(/^\/v1\/knowledge\/articles\/([^/]+)$/);
    if (method === "GET" && articleMatch) {
      const articleId = decodeURIComponent(articleMatch[1]);
      const article = await client.getKnowledgeArticle(articleId);
      if (!article) {
        return json(404, { error: "Knowledge article not found.", correlationId }, correlationId);
      }

      return json(200, article, correlationId);
    }

    if (method === "POST" && path === "/v1/incidents/similar") {
      const request = parseJsonBody<SimilarIncidentRequest>(event);
      const query = assertQuery(request.query);
      const results = await client.findSimilarIncidents(query, boundedInt(request.maxResults, 5, 10), request.filters);
      return json(200, { query, results }, correlationId);
    }

    return json(404, { error: "Route not found.", method, path, correlationId }, correlationId);
  } catch (error) {
    const statusCode = statusCodeForError(error);
    logError(error, {
      correlationId,
      method,
      path,
      elapsedMs: Date.now() - startedAt
    });

    return json(statusCode, {
      error: error instanceof Error ? error.message : "Unexpected error.",
      correlationId
    }, correlationId);
  }
}

function statusCodeForError(error: unknown): number {
  if (error instanceof ValidationError) {
    return 400;
  }

  if (error instanceof IvantiApiError) {
    return error.statusCode >= 500 ? 502 : error.statusCode;
  }

  return 500;
}

function logError(error: unknown, context: Record<string, unknown>): void {
  console.error(JSON.stringify({
    level: "error",
    ...context,
    errorName: error instanceof Error ? error.name : "UnknownError",
    errorMessage: error instanceof Error ? error.message : String(error)
  }));
}

