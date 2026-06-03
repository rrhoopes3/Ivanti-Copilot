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

function envInt(name: string, fallback: number): number {
  const parsed = Number(env(name));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function envList(name: string): string[] {
  return env(name)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function loadConfig(): AppConfig {
  const baseUrl = env("IVANTI_BASE_URL");
  const allowedOrigins = envList("ALLOWED_ORIGINS");

  return {
    appEnv: env("APP_ENV", "dev"),
    logLevel: env("LOG_LEVEL", "info"),
    requireBearerToken: envBool("REQUIRE_BEARER_TOKEN", false),
    allowedOrigins: allowedOrigins.length ? allowedOrigins : ["*"],
    ivantiBaseUrl: baseUrl,
    ivantiOdataPath: env("IVANTI_ODATA_PATH", "/api/odata/businessobject"),
    ivantiSecretArn: env("IVANTI_SECRET_ARN") || undefined,
    awsRegion: env("AWS_REGION") || env("AWS_DEFAULT_REGION") || undefined,
    ivantiTimeoutMs: envInt("IVANTI_TIMEOUT_MS", 8000),
    ivantiKnowledgeObject: env("IVANTI_KB_OBJECT", "KnowledgeArticles"),
    ivantiIncidentObject: env("IVANTI_INCIDENT_OBJECT", "Incidents"),
    articleUrlTemplate: env("IVANTI_ARTICLE_URL_TEMPLATE", baseUrl ? `${baseUrl}/knowledge/{id}` : ""),
    entraTenantId: env("ENTRA_TENANT_ID") || undefined,
    entraAudience: env("ENTRA_AUDIENCE") || undefined,
    entraIssuer: env("ENTRA_ISSUER") || undefined,
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
