export interface ApiGatewayEvent {
  version?: string;
  routeKey?: string;
  rawPath?: string;
  path?: string;
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  pathParameters?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined>;
  body?: string | null;
  isBase64Encoded?: boolean;
  requestContext?: {
    requestId?: string;
    http?: {
      method?: string;
      path?: string;
    };
    authorizer?: {
      jwt?: {
        claims?: Record<string, string | number | boolean | undefined>;
      };
      claims?: Record<string, string | number | boolean | undefined>;
    };
  };
}

export interface ApiGatewayResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export interface FieldMapping {
  id: string;
  title: string;
  summary: string;
  body: string;
  status: string;
  category: string;
  updatedAt: string;
}

export interface IncidentFieldMapping {
  id: string;
  number: string;
  subject: string;
  description: string;
  resolution: string;
  status: string;
  category: string;
  closedAt: string;
}

export interface AppConfig {
  appEnv: string;
  logLevel: string;
  internalSharedSecret?: string;
  requireBearerToken: boolean;
  ivantiBaseUrl: string;
  ivantiOdataPath: string;
  ivantiAuthHeaderValue: string;
  ivantiKnowledgeObject: string;
  ivantiIncidentObject: string;
  articleUrlTemplate: string;
  knowledgeFields: FieldMapping;
  incidentFields: IncidentFieldMapping;
}

export interface KnowledgeSearchRequest {
  query: string;
  maxResults?: number;
  filters?: {
    category?: string;
    status?: string;
  };
  ticketContext?: {
    category?: string;
    service?: string;
    symptom?: string;
  };
}

export interface SimilarIncidentRequest {
  query: string;
  maxResults?: number;
  filters?: {
    category?: string;
    service?: string;
  };
}

export interface KnowledgeArticleResult {
  id: string;
  title: string;
  summary?: string;
  excerpt?: string;
  category?: string;
  status?: string;
  updatedAt?: string;
  sourceUrl: string;
  confidence: number;
  body?: string;
}

export interface IncidentResult {
  id: string;
  incidentNumber?: string;
  subject: string;
  excerpt?: string;
  resolutionExcerpt?: string;
  category?: string;
  status?: string;
  closedAt?: string;
  confidence: number;
}

export interface ODataResponse<T> {
  value?: T[];
}

