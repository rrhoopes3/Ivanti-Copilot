import {
  AppConfig,
  FieldMapping,
  IncidentFieldMapping,
  IncidentResult,
  KnowledgeArticleResult,
  ODataResponse
} from "./types";

type RawRecord = Record<string, unknown>;

export class IvantiApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "IvantiApiError";
  }
}

export class IvantiClient {
  constructor(private readonly config: AppConfig) {}

  async searchKnowledge(query: string, maxResults: number, filters?: { category?: string; status?: string }): Promise<KnowledgeArticleResult[]> {
    const fields = this.config.knowledgeFields;
    const url = this.objectUrl(this.config.ivantiKnowledgeObject);
    url.searchParams.set("$top", String(maxResults));
    url.searchParams.set("$select", uniqueFields(Object.values(fields)).join(","));

    const filter = this.buildKnowledgeFilter(query, fields, filters);
    if (filter) {
      url.searchParams.set("$filter", filter);
    }

    const rows = await this.getRows(url);
    return rows.map((row) => this.mapKnowledgeArticle(row, query, false));
  }

  async getKnowledgeArticle(articleId: string): Promise<KnowledgeArticleResult | undefined> {
    const fields = this.config.knowledgeFields;
    const url = this.objectUrl(this.config.ivantiKnowledgeObject);
    url.searchParams.set("$top", "1");
    url.searchParams.set("$select", uniqueFields(Object.values(fields)).join(","));
    url.searchParams.set("$filter", `${fields.id} eq '${escapeODataString(articleId)}'`);

    const [row] = await this.getRows(url);
    return row ? this.mapKnowledgeArticle(row, articleId, true) : undefined;
  }

  async findSimilarIncidents(query: string, maxResults: number, filters?: { category?: string }): Promise<IncidentResult[]> {
    const fields = this.config.incidentFields;
    const url = this.objectUrl(this.config.ivantiIncidentObject);
    url.searchParams.set("$top", String(maxResults));
    url.searchParams.set("$select", uniqueFields(Object.values(fields)).join(","));

    const filter = this.buildIncidentFilter(query, fields, filters);
    if (filter) {
      url.searchParams.set("$filter", filter);
    }

    const rows = await this.getRows(url);
    return rows.map((row) => this.mapIncident(row, query));
  }

  private async getRows(url: URL): Promise<RawRecord[]> {
    this.ensureConfigured();

    const response = await fetch(url, {
      headers: {
        Authorization: this.config.ivantiAuthHeaderValue,
        Accept: "application/json"
      }
    });

    const text = await response.text();
    if (!response.ok) {
      throw new IvantiApiError(response.status, `Ivanti API returned ${response.status}: ${text.slice(0, 500)}`);
    }

    const parsed = text ? (JSON.parse(text) as ODataResponse<RawRecord> | RawRecord[]) : [];
    return Array.isArray(parsed) ? parsed : parsed.value ?? [];
  }

  private objectUrl(objectName: string): URL {
    const base = trimRight(this.config.ivantiBaseUrl, "/");
    const path = trimBoth(this.config.ivantiOdataPath, "/");
    return new URL(`${base}/${path}/${encodeURIComponent(objectName)}`);
  }

  private ensureConfigured(): void {
    if (!this.config.ivantiBaseUrl) {
      throw new IvantiApiError(500, "IVANTI_BASE_URL is not configured.");
    }

    if (!this.config.ivantiAuthHeaderValue) {
      throw new IvantiApiError(500, "IVANTI_AUTH_HEADER_VALUE is not configured.");
    }
  }

  private buildKnowledgeFilter(query: string, fields: FieldMapping, filters?: { category?: string; status?: string }): string {
    const search = buildContainsFilter([fields.title, fields.summary, fields.body], query);
    const clauses = [search];

    const status = filters?.status ?? "Published";
    if (status) {
      clauses.push(`${fields.status} eq '${escapeODataString(status)}'`);
    }

    if (filters?.category) {
      clauses.push(`${fields.category} eq '${escapeODataString(filters.category)}'`);
    }

    return clauses.filter(Boolean).join(" and ");
  }

  private buildIncidentFilter(query: string, fields: IncidentFieldMapping, filters?: { category?: string }): string {
    const clauses = [buildContainsFilter([fields.subject, fields.description, fields.resolution], query)];

    if (filters?.category) {
      clauses.push(`${fields.category} eq '${escapeODataString(filters.category)}'`);
    }

    return clauses.filter(Boolean).join(" and ");
  }

  private mapKnowledgeArticle(row: RawRecord, query: string, includeBody: boolean): KnowledgeArticleResult {
    const fields = this.config.knowledgeFields;
    const id = stringField(row, fields.id);
    const title = stringField(row, fields.title) || "Untitled knowledge article";
    const summary = cleanText(stringField(row, fields.summary), 600);
    const body = cleanText(stringField(row, fields.body), includeBody ? 6000 : 1200);

    return {
      id,
      title,
      summary,
      excerpt: firstNonEmpty(summary, body),
      body: includeBody ? body : undefined,
      category: stringField(row, fields.category) || undefined,
      status: stringField(row, fields.status) || undefined,
      updatedAt: stringField(row, fields.updatedAt) || undefined,
      sourceUrl: this.sourceUrl(id),
      confidence: confidenceScore(query, [title, summary, body])
    };
  }

  private mapIncident(row: RawRecord, query: string): IncidentResult {
    const fields = this.config.incidentFields;
    const subject = stringField(row, fields.subject) || "Untitled incident";
    const description = cleanText(stringField(row, fields.description), 900);
    const resolution = cleanText(stringField(row, fields.resolution), 900);

    return {
      id: stringField(row, fields.id),
      incidentNumber: stringField(row, fields.number) || undefined,
      subject,
      excerpt: description || undefined,
      resolutionExcerpt: resolution || undefined,
      category: stringField(row, fields.category) || undefined,
      status: stringField(row, fields.status) || undefined,
      closedAt: stringField(row, fields.closedAt) || undefined,
      confidence: confidenceScore(query, [subject, description, resolution])
    };
  }

  private sourceUrl(id: string): string {
    if (!this.config.articleUrlTemplate) {
      return "";
    }

    return this.config.articleUrlTemplate.replace("{id}", encodeURIComponent(id));
  }
}

function buildContainsFilter(fields: string[], query: string): string {
  const normalized = escapeODataString(query.toLowerCase());
  const clauses = fields.map((field) => `contains(tolower(${field}), '${normalized}')`);
  return `(${clauses.join(" or ")})`;
}

function stringField(row: RawRecord, fieldName: string): string {
  const direct = row[fieldName];
  if (direct !== undefined && direct !== null) {
    return String(direct);
  }

  const matchedKey = Object.keys(row).find((key) => key.toLowerCase() === fieldName.toLowerCase());
  const matched = matchedKey ? row[matchedKey] : undefined;
  return matched === undefined || matched === null ? "" : String(matched);
}

function cleanText(value: string, maxLength: number): string {
  const stripped = value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (stripped.length <= maxLength) {
    return stripped;
  }

  return `${stripped.slice(0, maxLength - 3).trim()}...`;
}

function confidenceScore(query: string, values: string[]): number {
  const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length > 2);
  if (terms.length === 0) {
    return 0.5;
  }

  const haystack = values.join(" ").toLowerCase();
  const hits = terms.filter((term) => haystack.includes(term)).length;
  return Math.max(0.35, Math.min(0.95, hits / terms.length));
}

function firstNonEmpty(...values: string[]): string | undefined {
  return values.find((value) => value && value.trim()) || undefined;
}

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''").replace(/[\r\n\t]/g, " ").trim();
}

function uniqueFields(fields: string[]): string[] {
  return [...new Set(fields.filter(Boolean))];
}

function trimRight(value: string, char: string): string {
  while (value.endsWith(char)) {
    value = value.slice(0, -1);
  }

  return value;
}

function trimBoth(value: string, char: string): string {
  let output = value;
  while (output.startsWith(char)) {
    output = output.slice(1);
  }
  while (output.endsWith(char)) {
    output = output.slice(0, -1);
  }

  return output;
}

