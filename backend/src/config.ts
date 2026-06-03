import { AppConfig } from "./types";

function env(name: string, fallback = ""): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function envBool(name: string, fallback: boolean): boolean {
  const value = env(name);
  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function loadConfig(): AppConfig {
  const baseUrl = env("IVANTI_BASE_URL");

  return {
    appEnv: env("APP_ENV", "dev"),
    logLevel: env("LOG_LEVEL", "info"),
    internalSharedSecret: env("INTERNAL_SHARED_SECRET") || undefined,
    requireBearerToken: envBool("REQUIRE_BEARER_TOKEN", false),
    ivantiBaseUrl: baseUrl,
    ivantiOdataPath: env("IVANTI_ODATA_PATH", "/api/odata/businessobject"),
    ivantiAuthHeaderValue: env("IVANTI_AUTH_HEADER_VALUE"),
    ivantiKnowledgeObject: env("IVANTI_KB_OBJECT", "KnowledgeArticles"),
    ivantiIncidentObject: env("IVANTI_INCIDENT_OBJECT", "Incidents"),
    articleUrlTemplate: env("IVANTI_ARTICLE_URL_TEMPLATE", baseUrl ? `${baseUrl}/knowledge/{id}` : ""),
    knowledgeFields: {
      id: env("IVANTI_FIELD_ID", "RecId"),
      title: env("IVANTI_FIELD_TITLE", "Title"),
      summary: env("IVANTI_FIELD_SUMMARY", "Summary"),
      body: env("IVANTI_FIELD_BODY", "Body"),
      status: env("IVANTI_FIELD_STATUS", "Status"),
      category: env("IVANTI_FIELD_CATEGORY", "Category"),
      updatedAt: env("IVANTI_FIELD_UPDATED_AT", "LastModDateTime")
    },
    incidentFields: {
      id: env("IVANTI_INCIDENT_FIELD_ID", "RecId"),
      number: env("IVANTI_INCIDENT_FIELD_NUMBER", "IncidentNumber"),
      subject: env("IVANTI_INCIDENT_FIELD_SUBJECT", "Subject"),
      description: env("IVANTI_INCIDENT_FIELD_DESCRIPTION", "Symptom"),
      resolution: env("IVANTI_INCIDENT_FIELD_RESOLUTION", "Resolution"),
      status: env("IVANTI_INCIDENT_FIELD_STATUS", "Status"),
      category: env("IVANTI_INCIDENT_FIELD_CATEGORY", "Category"),
      closedAt: env("IVANTI_INCIDENT_FIELD_CLOSED_AT", "ClosedDateTime")
    }
  };
}

