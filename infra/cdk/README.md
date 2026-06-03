# Infra: AWS CDK Scaffold

CDK v2 (TypeScript) scaffold that deploys the Ivanti Copilot middleware:

```text
API Gateway (REST, proxy)  ->  Lambda (backend/dist)  ->  Ivanti REST API
                                      |-> Secrets Manager (Ivanti credentials)
                                      |-> CloudWatch Logs
```

This is a starting point, not a hardened production stack. Wire it to your AWS
account and bootstrap pattern, then add WAF, an Entra JWT authorizer, and
CloudWatch alarms before going beyond a pilot (see `../../docs/security-model.md`).

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

The current `backend/src/config.ts` reads `IVANTI_AUTH_HEADER_VALUE` from the
environment. Two options:

- **Production:** extend the handler to resolve `IVANTI_SECRET_ARN` (exported to
  the Lambda env) and fetch the auth value from Secrets Manager at cold start.
  This keeps credentials out of the function environment.
- **Pilot only:** pass `-c ivantiAuthHeaderValue=...` and
  `-c internalSharedSecret=...`, which inject them as Lambda environment
  variables. This matches the "Pilot fallback" in the security model and should
  carry an expiry/migration plan.

## Context options

| Context key             | Default                     | Notes                                   |
| ----------------------- | --------------------------- | --------------------------------------- |
| `appEnv`                | `dev`                       | Drives resource names and the API stage |
| `ivantiBaseUrl`         | (backend default, empty)    | Ivanti tenant URL                       |
| `ivantiOdataPath`       | `/api/odata/businessobject` | Backend default applies if omitted      |
| `ivantiKnowledgeObject` | `KnowledgeArticles`         | Backend default applies if omitted      |
| `ivantiIncidentObject`  | `Incidents`                 | Backend default applies if omitted      |
| `articleUrlTemplate`    | derived from base URL        | `{id}` is substituted                   |
| `requireBearerToken`    | `false`                     | Pilot uses the shared-secret path       |
| `ivantiAuthHeaderValue` | unset                       | Pilot-only inline credential            |
| `internalSharedSecret`  | unset                       | Pilot-only inline credential            |
| `throttleRateLimit`     | `20`                        | API Gateway stage steady-state rate     |
| `throttleBurstLimit`    | `40`                        | API Gateway stage burst                 |

Omitted Ivanti keys fall back to the defaults baked into `backend/src/config.ts`.

## Tear down

```powershell
npx cdk destroy -c appEnv=pilot
```

The credential secret is retained by default so it survives teardown. Delete it
explicitly if you no longer need it.
