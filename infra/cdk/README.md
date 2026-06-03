# Infra: AWS CDK Scaffold

CDK v2 (TypeScript) scaffold that deploys the Ivanti Copilot middleware:

```text
WAF  ->  API Gateway (REST, proxy)  ->  Lambda (backend/dist)  ->  Ivanti REST API
                                              |-> Secrets Manager (Ivanti credentials)
                                              |-> CloudWatch Logs + Alarms
```

What the stack provisions:

- Lambda + REST API Gateway (proxy) with stage throttling.
- Secrets Manager secret for Ivanti credentials, read by the Lambda at cold start.
- Regional WAF (AWS managed rule sets + per-IP rate limit), enabled by default.
- CloudWatch log group (one-month retention) and core alarms (Lambda errors,
  throttles, p99 duration; API 5xx and p99 latency), optionally routed to email.

Still your responsibility before prod: set the Entra ID context values so the
middleware validates caller tokens, and review `../../docs/security-model.md`.

## Prerequisites

- AWS CLI configured with credentials for the target account.
- CDK bootstrapped in the target account/region: `npx cdk bootstrap`.
- The backend compiled, because the Lambda asset is `backend/dist`:

```powershell
cd B:\Ivanti-copilot\backend
npm install
npm run build
```

## Deploy

```powershell
cd B:\Ivanti-copilot\infra\cdk
npm install
npm run synth        # render the CloudFormation template
npm run deploy
```

Select the environment and pass tenant configuration with CDK context:

```powershell
npx cdk deploy `
  -c appEnv=pilot `
  -c ivantiBaseUrl=https://your-tenant.ivanticloud.com `
  -c ivantiKnowledgeObject=KnowledgeArticles `
  -c ivantiIncidentObject=Incidents
```

Outputs include `ApiUrl` (put it in `api/ivanti-copilot-actions.openapi.yaml`
under `servers`), `IvantiSecretArn`, and the Lambda function name.

## Credentials

The stack creates a Secrets Manager secret (`ivanti-copilot/<env>/ivanti-auth`)
with a generated placeholder value and grants the Lambda read access. After the
first deploy, replace the placeholder with the real Ivanti auth header:

```powershell
aws secretsmanager put-secret-value `
  --secret-id ivanti-copilot/pilot/ivanti-auth `
  --secret-string '{\"ivantiAuthHeaderValue\":\"Bearer <token>\",\"internalSharedSecret\":\"<secret>\"}'
```

The Lambda resolves credentials in this order (see `backend/src/secrets.ts`):

1. `IVANTI_AUTH_HEADER_VALUE` from the environment, if set.
2. Otherwise the Secrets Manager secret named by `IVANTI_SECRET_ARN` (which the
   stack wires automatically), parsed as JSON `{ ivantiAuthHeaderValue,
   internalSharedSecret }`.

So **production** needs no extra wiring — just populate the secret. **Pilot**
deployments may instead pass `-c ivantiAuthHeaderValue=...` /
`-c internalSharedSecret=...` to inject them as env vars (matching the "Pilot
fallback" in the security model); carry an expiry/migration plan if you do.

## Authentication

Set `-c entraTenantId=<tenant>` and `-c entraAudience=<api-app-id-or-uri>` to turn
on Entra ID JWT validation. When both are present the middleware verifies each
bearer token's signature (against the tenant JWKS), issuer, audience, and expiry.
If `requireBearerToken=true` is set without Entra configured, the API fails closed
rather than accepting unvalidated tokens.

## Context options

| Context key             | Default                     | Notes                                   |
| ----------------------- | --------------------------- | --------------------------------------- |
| `appEnv`                | `dev`                       | Drives resource names and the API stage |
| `ivantiBaseUrl`         | (backend default, empty)    | Ivanti tenant URL                       |
| `ivantiOdataPath`       | `/api/odata/businessobject` | Backend default applies if omitted      |
| `ivantiKnowledgeObject` | `KnowledgeArticles`         | Backend default applies if omitted      |
| `ivantiIncidentObject`  | `Incidents`                 | Backend default applies if omitted      |
| `articleUrlTemplate`    | derived from base URL        | `{id}` is substituted                   |
| `ivantiTimeoutMs`       | `8000`                      | Per-request timeout for Ivanti calls    |
| `requireBearerToken`    | `false`                     | Fail closed if no validated token       |
| `allowedOrigins`        | `*`                         | Comma-separated CORS allowlist          |
| `entraTenantId`         | unset                       | Enables Entra JWT validation (with aud) |
| `entraAudience`         | unset                       | Expected token audience                 |
| `entraIssuer`           | derived from tenant          | Optional issuer override                |
| `ivantiAuthHeaderValue` | unset                       | Pilot-only inline credential            |
| `internalSharedSecret`  | unset                       | Pilot-only inline credential            |
| `throttleRateLimit`     | `20`                        | API Gateway stage steady-state rate     |
| `throttleBurstLimit`    | `40`                        | API Gateway stage burst                 |
| `enableWaf`             | `true`                      | Set `false` to skip the WAF (e.g. dev)  |
| `alarmEmail`            | unset                       | Subscribes an email to alarm SNS topic  |

Omitted Ivanti keys fall back to the defaults baked into `backend/src/config.ts`.

## Tear down

```powershell
npx cdk destroy -c appEnv=pilot
```

The credential secret is retained by default so it survives teardown. Delete it
explicitly if you no longer need it.
